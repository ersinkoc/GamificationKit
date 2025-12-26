import { Logger } from '../utils/logger.js';
import { validators } from '../utils/validators.js';
import crypto from 'crypto';
import type { LoggerConfig } from '../types/config.js';
import type { EventManager, EventData } from './EventManager.js';

export interface WebhookManagerOptions {
  logger?: LoggerConfig;
  eventManager?: EventManager;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  signingSecret?: string;
  maxQueueSize?: number;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  enabled?: boolean;
  headers?: Record<string, string>;
  retries?: number;
  timeout?: number;
  createdAt?: number;
}

export interface QueueItem {
  webhook: Webhook;
  event: EventData;
  attempts: number;
  createdAt: number;
}

export interface WebhookPayload {
  webhookId: string;
  timestamp: number;
  event: {
    name: string;
    data: any;
    id: string;
    timestamp: number;
  };
}

export interface WebhookStats {
  webhooks: Record<string, {
    url: string;
    enabled: boolean;
    events: string[];
    createdAt: number;
  }>;
  queueSize: number;
  processing: boolean;
}

export class WebhookManager {
  private logger: Logger;
  private eventManager?: EventManager;
  private webhooks: Map<string, Webhook>;
  private timeout: number;
  private retries: number;
  private retryDelay: number;
  private signingSecret: string;
  private queue: QueueItem[];
  private processing: boolean;
  private maxQueueSize: number;

  constructor(options: WebhookManagerOptions = {}) {
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

  setupEventListeners(): void {
    if (!this.eventManager) return;

    this.eventManager.onWildcard('*', async (event: EventData) => {
      const webhooks = this.getWebhooksForEvent(event.eventName);
      if (webhooks.length > 0) {
        await this.queueWebhookCalls(webhooks, event);
      }
    });
  }

  addWebhook(webhook: Webhook): Webhook {
    validators.hasProperties(webhook, ['id', 'url', 'events'], 'webhook');
    validators.isNonEmptyString(webhook.id, 'webhook.id');
    validators.isNonEmptyString(webhook.url, 'webhook.url');
    validators.isArray(webhook.events, 'webhook.events');

    const processedWebhook: Webhook = {
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

  removeWebhook(webhookId: string): boolean {
    const removed = this.webhooks.delete(webhookId);
    if (removed) {
      this.logger.info(`Webhook removed: ${webhookId}`);
    }
    return removed;
  }

  getWebhooksForEvent(eventName: string): Webhook[] {
    const webhooks: Webhook[] = [];

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

  async queueWebhookCalls(webhooks: Webhook[], event: EventData): Promise<void> {
    for (const webhook of webhooks) {
      const queueItem: QueueItem = {
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

  async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      await this.callWebhook(item);
    }

    this.processing = false;
  }

  async callWebhook(item: QueueItem): Promise<{ success: boolean; status?: number; error?: string }> {
    const { webhook, event, attempts } = item;

    try {
      const payload = this.preparePayload(webhook, event);
      const signature = this.generateSignature(payload);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': Date.now().toString(),
        'X-Webhook-Event': event.eventName,
        ...webhook.headers
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), webhook.timeout!);

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
    } catch (error: any) {
      this.logger.error(`Webhook call failed: ${webhook.id}`, {
        error: error.message,
        attempts: attempts + 1
      });

      if (attempts < webhook.retries!) {
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

  preparePayload(webhook: Webhook, event: EventData): WebhookPayload {
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

  generateSignature(payload: WebhookPayload): string {
    const hmac = crypto.createHmac('sha256', this.signingSecret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  calculateRetryDelay(attempt: number): number {
    return Math.min(
      this.retryDelay * Math.pow(2, attempt),
      30000
    );
  }

  async handleFailedWebhook(webhook: Webhook, event: EventData, error: Error): Promise<void> {
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

  getWebhookStats(): WebhookStats {
    const stats: Record<string, {
      url: string;
      enabled: boolean;
      events: string[];
      createdAt: number;
    }> = {};

    for (const [id, webhook] of this.webhooks.entries()) {
      stats[id] = {
        url: webhook.url,
        enabled: webhook.enabled || false,
        events: webhook.events,
        createdAt: webhook.createdAt || 0
      };
    }

    return {
      webhooks: stats,
      queueSize: this.queue.length,
      processing: this.processing
    };
  }

  verifySignature(payload: WebhookPayload, signature: string): boolean {
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

  clearQueue(): number {
    const size = this.queue.length;
    this.queue = [];
    this.logger.info(`Cleared ${size} items from webhook queue`);
    return size;
  }
}
