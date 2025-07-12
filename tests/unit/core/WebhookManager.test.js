import { jest } from '@jest/globals';
import { WebhookManager } from '../../../src/core/WebhookManager.js';

describe('WebhookManager', () => {
  let webhookManager;

  beforeEach(() => {
    webhookManager = new WebhookManager();
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(webhookManager.webhooks).toEqual([]);
      expect(webhookManager.retryAttempts).toBe(3);
      expect(webhookManager.retryDelay).toBe(1000);
      expect(webhookManager.timeout).toBe(5000);
    });

    it('should accept custom options', () => {
      const customManager = new WebhookManager({
        retryAttempts: 5,
        retryDelay: 2000,
        timeout: 10000,
        secret: 'test-secret'
      });

      expect(customManager.retryAttempts).toBe(5);
      expect(customManager.retryDelay).toBe(2000);
      expect(customManager.timeout).toBe(10000);
      expect(customManager.secret).toBe('test-secret');
    });
  });

  describe('register', () => {
    it('should register a webhook', () => {
      const webhook = {
        url: 'https://example.com/webhook',
        events: ['user.created', 'user.updated']
      };

      webhookManager.register(webhook);

      expect(webhookManager.webhooks).toHaveLength(1);
      expect(webhookManager.webhooks[0]).toMatchObject({
        id: expect.any(String),
        url: webhook.url,
        events: webhook.events,
        active: true
      });
    });

    it('should generate unique ids', () => {
      webhookManager.register({ url: 'https://example1.com', events: ['event1'] });
      webhookManager.register({ url: 'https://example2.com', events: ['event2'] });

      const ids = webhookManager.webhooks.map(w => w.id);
      expect(new Set(ids).size).toBe(2);
    });

    it('should allow custom headers', () => {
      const webhook = {
        url: 'https://example.com/webhook',
        events: ['test.event'],
        headers: {
          'X-Custom-Header': 'value'
        }
      };

      webhookManager.register(webhook);

      expect(webhookManager.webhooks[0].headers).toEqual({
        'X-Custom-Header': 'value'
      });
    });

    it('should set active status', () => {
      webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event'],
        active: false
      });

      expect(webhookManager.webhooks[0].active).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should remove webhook by id', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event']
      });

      expect(webhookManager.webhooks).toHaveLength(1);

      webhookManager.unregister(webhook.id);
      expect(webhookManager.webhooks).toHaveLength(0);
    });

    it('should handle non-existent id gracefully', () => {
      expect(() => webhookManager.unregister('non-existent')).not.toThrow();
    });
  });

  describe('trigger', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should send webhook to matching URLs', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      webhookManager.register({
        url: 'https://example1.com/webhook',
        events: ['user.created']
      });

      webhookManager.register({
        url: 'https://example2.com/webhook',
        events: ['user.updated']
      });

      await webhookManager.trigger('user.created', { userId: 123 });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example1.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            event: 'user.created',
            data: { userId: 123 },
            timestamp: expect.any(Number)
          })
        })
      );
    });

    it('should support wildcard events', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['user.*']
      });

      await webhookManager.trigger('user.created', { userId: 123 });
      await webhookManager.trigger('user.updated', { userId: 123 });
      await webhookManager.trigger('order.created', { orderId: 456 });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should include custom headers', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event'],
        headers: {
          'X-API-Key': 'secret-key'
        }
      });

      await webhookManager.trigger('test.event', {});

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret-key'
          })
        })
      );
    });

    it('should sign requests when secret is provided', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      const manager = new WebhookManager({ secret: 'webhook-secret' });
      manager.register({
        url: 'https://example.com/webhook',
        events: ['test.event']
      });

      await manager.trigger('test.event', { data: 'test' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Signature': expect.any(String)
          })
        })
      );
    });

    it('should skip inactive webhooks', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event'],
        active: false
      });

      await webhookManager.trigger('test.event', {});

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle timeouts', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch.mockRejectedValue(abortError);

      const consoleSpy = jest.spyOn(console, 'error');

      webhookManager.timeout = 100;
      webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event']
      });

      await webhookManager.trigger('test.event', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Webhook timeout'),
        expect.any(String)
      );
    });

    it('should retry failed requests', async () => {
      global.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200
        });

      webhookManager.retryAttempts = 3;
      webhookManager.retryDelay = 100;
      
      webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event']
      });

      const promise = webhookManager.trigger('test.event', {});

      // Fast-forward through retries
      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(200);
      
      await promise;

      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff for retries', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error');

      webhookManager.retryAttempts = 3;
      webhookManager.retryDelay = 100;
      
      webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event']
      });

      const promise = webhookManager.trigger('test.event', {});

      // First retry after 100ms
      await jest.advanceTimersByTimeAsync(100);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Second retry after 200ms (exponential backoff)
      await jest.advanceTimersByTimeAsync(200);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // Third retry after 400ms
      await jest.advanceTimersByTimeAsync(400);
      expect(global.fetch).toHaveBeenCalledTimes(4);

      await promise;

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to deliver webhook after 3 attempts'),
        expect.any(String)
      );
    });

    it('should handle non-2xx status codes', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const consoleSpy = jest.spyOn(console, 'warn');

      webhookManager.retryAttempts = 1;
      webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event']
      });

      await webhookManager.trigger('test.event', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Webhook returned non-2xx status: 404'),
        expect.any(String)
      );
    });
  });

  describe('getWebhooks', () => {
    it('should return all webhooks', () => {
      webhookManager.register({
        url: 'https://example1.com/webhook',
        events: ['event1']
      });

      webhookManager.register({
        url: 'https://example2.com/webhook',
        events: ['event2']
      });

      const webhooks = webhookManager.getWebhooks();
      expect(webhooks).toHaveLength(2);
      expect(webhooks[0].url).toBe('https://example1.com/webhook');
      expect(webhooks[1].url).toBe('https://example2.com/webhook');
    });

    it('should filter by event', () => {
      webhookManager.register({
        url: 'https://example1.com/webhook',
        events: ['user.created', 'user.updated']
      });

      webhookManager.register({
        url: 'https://example2.com/webhook',
        events: ['order.created']
      });

      const webhooks = webhookManager.getWebhooks('user.created');
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].url).toBe('https://example1.com/webhook');
    });

    it('should match wildcard events when filtering', () => {
      webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['user.*']
      });

      const webhooks = webhookManager.getWebhooks('user.created');
      expect(webhooks).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update webhook properties', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event']
      });

      webhookManager.update(webhook.id, {
        url: 'https://new-example.com/webhook',
        events: ['new.event'],
        active: false
      });

      const updated = webhookManager.webhooks[0];
      expect(updated.url).toBe('https://new-example.com/webhook');
      expect(updated.events).toEqual(['new.event']);
      expect(updated.active).toBe(false);
    });

    it('should handle non-existent webhook', () => {
      expect(() => {
        webhookManager.update('non-existent', { url: 'https://example.com' });
      }).not.toThrow();
    });
  });

  describe('activate/deactivate', () => {
    it('should activate webhook', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event'],
        active: false
      });

      webhookManager.activate(webhook.id);
      expect(webhookManager.webhooks[0].active).toBe(true);
    });

    it('should deactivate webhook', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event'],
        active: true
      });

      webhookManager.deactivate(webhook.id);
      expect(webhookManager.webhooks[0].active).toBe(false);
    });
  });

  describe('createSignature', () => {
    it('should create consistent signatures', () => {
      const manager = new WebhookManager({ secret: 'test-secret' });
      const payload = JSON.stringify({ test: 'data' });

      const sig1 = manager.createSignature(payload);
      const sig2 = manager.createSignature(payload);

      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^sha256=/);
    });

    it('should create different signatures for different payloads', () => {
      const manager = new WebhookManager({ secret: 'test-secret' });
      
      const sig1 = manager.createSignature(JSON.stringify({ test: 'data1' }));
      const sig2 = manager.createSignature(JSON.stringify({ test: 'data2' }));

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('error handling', () => {
    it('should handle malformed URLs gracefully', async () => {
      global.fetch.mockRejectedValue(new TypeError('Invalid URL'));

      const consoleSpy = jest.spyOn(console, 'error');

      webhookManager.register({
        url: 'not-a-valid-url',
        events: ['test.event']
      });

      await webhookManager.trigger('test.event', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Webhook error'),
        expect.any(String),
        expect.any(Error)
      );
    });

    it('should handle circular reference in payload', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      webhookManager.register({
        url: 'https://example.com/webhook',
        events: ['test.event']
      });

      const circularObj = { a: 1 };
      circularObj.self = circularObj;

      // Should not throw
      await expect(
        webhookManager.trigger('test.event', circularObj)
      ).resolves.not.toThrow();
    });
  });

  describe('batch operations', () => {
    it('should handle multiple webhooks for same event', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      webhookManager.register({
        url: 'https://example1.com/webhook',
        events: ['test.event']
      });

      webhookManager.register({
        url: 'https://example2.com/webhook',
        events: ['test.event']
      });

      webhookManager.register({
        url: 'https://example3.com/webhook',
        events: ['other.event']
      });

      await webhookManager.trigger('test.event', {});

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should continue sending if one webhook fails', async () => {
      global.fetch
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200
        });

      webhookManager.retryAttempts = 0; // No retries for this test

      webhookManager.register({
        url: 'https://failing.com/webhook',
        events: ['test.event']
      });

      webhookManager.register({
        url: 'https://working.com/webhook',
        events: ['test.event']
      });

      await webhookManager.trigger('test.event', {});

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://working.com/webhook',
        expect.any(Object)
      );
    });
  });
});