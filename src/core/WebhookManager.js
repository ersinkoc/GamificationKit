import { Logger } from '../utils/logger.js';
import { validators } from '../utils/validators.js';
import crypto from 'crypto';

export class WebhookManager {
  constructor(options = {}) {
    this.logger = new Logger({ prefix: 'WebhookManager', ...options.logger });
    this.eventManager = options.eventManager;
    this.webhooks = new Map();
    this.timeout = options.timeout || 5000;
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.signingSecret = options.signingSecret || crypto.randomBytes(32).toString('hex');
    this.queue = [];
    this.processing = false;
    this.maxQueueSize = options.maxQueueSize || 1000;
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (!this.eventManager) return;

    this.eventManager.onWildcard('*', async (event) => {
      const webhooks = this.getWebhooksForEvent(event.eventName);
      if (webhooks.length > 0) {
        await this.queueWebhookCalls(webhooks, event);
      }
    });
  }

  addWebhook(webhook) {
    validators.hasProperties(webhook, ['id', 'url', 'events'], 'webhook');
    validators.isNonEmptyString(webhook.id, 'webhook.id');
    validators.isNonEmptyString(webhook.url, 'webhook.url');
    validators.isArray(webhook.events, 'webhook.events');

    const processedWebhook = {
      ...webhook,
      enabled: webhook.enabled !== false,
      createdAt: Date.now(),
      headers: webhook.headers || {},
      retries: webhook.retries ?? this.retries,
      timeout: webhook.timeout ?? this.timeout
    };

    this.webhooks.set(webhook.id, processedWebhook);
    this.logger.info(`Webhook added: ${webhook.id}`, { url: webhook.url });
    
    return processedWebhook;
  }

  removeWebhook(webhookId) {
    const removed = this.webhooks.delete(webhookId);
    if (removed) {
      this.logger.info(`Webhook removed: ${webhookId}`);
    }
    return removed;
  }

  getWebhooksForEvent(eventName) {
    const webhooks = [];
    
    for (const webhook of this.webhooks.values()) {
      if (!webhook.enabled) continue;
      
      const matches = webhook.events.some(pattern => {
        if (pattern === '*') return true;
        if (pattern === eventName) return true;

        // Fix BUG-007: Escape regex special characters before converting wildcards
        // This prevents regex injection and ensures patterns like 'user.points' match literally
        const escaped = pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
          .replace(/\*/g, '.*')  // Then convert wildcards
          .replace(/\?/g, '.');
        const regex = new RegExp('^' + escaped + '$');
        return regex.test(eventName);
      });
      
      if (matches) {
        webhooks.push(webhook);
      }
    }
    
    return webhooks;
  }

  async queueWebhookCalls(webhooks, event) {
    for (const webhook of webhooks) {
      const queueItem = {
        webhook,
        event,
        attempts: 0,
        createdAt: Date.now()
      };

      if (this.queue.length >= this.maxQueueSize) {
        this.logger.warn('Webhook queue full, dropping oldest item');
        this.queue.shift();
      }

      this.queue.push(queueItem);
    }

    if (!this.processing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      await this.callWebhook(item);
    }

    this.processing = false;
  }

  async callWebhook(item) {
    const { webhook, event, attempts } = item;
    
    try {
      const payload = this.preparePayload(webhook, event);
      const signature = this.generateSignature(payload);
      
      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': Date.now().toString(),
        'X-Webhook-Event': event.eventName,
        ...webhook.headers
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), webhook.timeout);

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          this.logger.debug(`Webhook called successfully: ${webhook.id}`, {
            status: response.status,
            event: event.eventName
          });
          return { success: true, status: response.status };
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      this.logger.error(`Webhook call failed: ${webhook.id}`, {
        error: error.message,
        attempts: attempts + 1
      });

      if (attempts < webhook.retries) {
        const delay = this.calculateRetryDelay(attempts);
        setTimeout(() => {
          this.queue.push({ ...item, attempts: attempts + 1 });
          if (!this.processing) {
            this.processQueue();
          }
        }, delay);
      } else {
        await this.handleFailedWebhook(webhook, event, error);
      }

      return { success: false, error: error.message };
    }
  }

  preparePayload(webhook, event) {
    return {
      webhookId: webhook.id,
      timestamp: Date.now(),
      event: {
        name: event.eventName,
        data: event.data,
        id: event.id,
        timestamp: event.timestamp
      }
    };
  }

  generateSignature(payload) {
    const hmac = crypto.createHmac('sha256', this.signingSecret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  calculateRetryDelay(attempt) {
    return Math.min(
      this.retryDelay * Math.pow(2, attempt),
      30000
    );
  }

  async handleFailedWebhook(webhook, event, error) {
    this.logger.error(`Webhook failed after all retries: ${webhook.id}`, {
      url: webhook.url,
      event: event.eventName,
      error: error.message
    });

    if (this.eventManager) {
      await this.eventManager.emitAsync('webhook.failed', {
        webhookId: webhook.id,
        event: event.eventName,
        error: error.message
      });
    }
  }

  getWebhookStats() {
    const stats = {};
    
    for (const [id, webhook] of this.webhooks.entries()) {
      stats[id] = {
        url: webhook.url,
        enabled: webhook.enabled,
        events: webhook.events,
        createdAt: webhook.createdAt
      };
    }
    
    return {
      webhooks: stats,
      queueSize: this.queue.length,
      processing: this.processing
    };
  }

  verifySignature(payload, signature) {
    // Fix BUG-042: Check buffer lengths before timingSafeEqual to avoid throwing
    // crypto.timingSafeEqual throws if buffer lengths don't match
    const expectedSignature = this.generateSignature(payload);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  }

  clearQueue() {
    const size = this.queue.length;
    this.queue = [];
    this.logger.info(`Cleared ${size} items from webhook queue`);
    return size;
  }
}