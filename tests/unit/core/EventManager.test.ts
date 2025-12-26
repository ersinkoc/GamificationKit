import type { GamificationKit } from '../src/core/GamificationKit.js';
import { jest } from '@jest/globals';
import { EventManager } from '../../../src/core/EventManager.js';

describe('EventManager', (): void => {
  let eventManager;

  beforeEach(() => {
    eventManager = new EventManager();
    jest.clearAllMocks();
  });

  afterEach(() => {
    eventManager.removeAllListeners();
  });

  describe('constructor', (): void => {
    it('should initialize with default options', () => {
      expect(eventManager.maxListeners).toBe(100);
      expect(eventManager.enableHistory).toBe(true);
      expect(eventManager.historyLimit).toBe(1000);
      expect(eventManager.eventHistory).toBeInstanceOf(Map);
      expect(eventManager.wildcardHandlers).toBeInstanceOf(Map);
    });

    it('should accept custom options', () => {
      const customEventManager = new EventManager({
        maxListeners: 50,
        enableHistory: false,
        historyLimit: 500,
        logger: { level: 'debug' }
      });
      expect(customEventManager.maxListeners).toBe(50);
      expect(customEventManager.enableHistory).toBe(false);
      expect(customEventManager.historyLimit).toBe(500);
    });
  });

  describe('emitAsync', (): void => {
    it('should emit event with data', async (): Promise<void> => {
      const handler = jest.fn();
      eventManager.on('test.event', handler);

      const result = await eventManager.emitAsync('test.event', { value: 123 });

      expect(handler).toHaveBeenCalledWith({
        eventName: 'test.event',
        data: { value: 123 },
        timestamp: expect.any(Number),
        id: expect.any(String)
      });
      expect(result).toEqual({ eventId: expect.any(String), listenersCount: 1, errors: [] });
    });

    it('should handle async listeners', async (): Promise<void> => {
      const asyncHandler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      });

      eventManager.on('async.event', asyncHandler);
      const result = await eventManager.emitAsync('async.event');

      expect(asyncHandler).toHaveBeenCalled();
      expect(result.listenersCount).toBe(1);
    });

    it('should handle listener errors gracefully', async (): Promise<void> => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const goodHandler = jest.fn(() => 'success');

      eventManager.on('error.event', errorHandler);
      eventManager.on('error.event', goodHandler);

      const result = await eventManager.emitAsync('error.event');

      expect(errorHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
      expect(result.listenersCount).toBe(2);
      expect(result.errors).toHaveLength(1);
    });

    it('should validate event name', async (): Promise<void> => {
      await expect(
        eventManager.emitAsync('invalid event')
      ).rejects.toThrow('eventName must contain only alphanumeric characters');
    });

    it('should add to history when enabled', async (): Promise<void> => {
      await eventManager.emitAsync('history.event', { test: true });

      const history = eventManager.getEventHistory('history.event');
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        eventName: 'history.event',
        data: { test: true }
      });
    });

    it('should not add to history when disabled', async (): Promise<void> => {
      eventManager.enableHistory = false;
      
      await eventManager.emitAsync('no.history', { test: true });

      const history = eventManager.getEventHistory('no.history');
      expect(history).toHaveLength(0);
    });
  });

  describe('wildcard handlers', (): void => {
    it('should register wildcard handler', () => {
      const handler = jest.fn();
      eventManager.onWildcard('user.*', handler);

      expect(eventManager.wildcardHandlers.has('user.*')).toBe(true);
    });

    it('should match wildcard patterns', async (): Promise<void> => {
      const handler = jest.fn();
      eventManager.onWildcard('user.*', handler);

      await eventManager.emitAsync('user.login');
      await eventManager.emitAsync('user.logout');
      await eventManager.emitAsync('other.event');

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple wildcard patterns', async (): Promise<void> => {
      const userHandler = jest.fn();
      const allHandler = jest.fn();

      eventManager.onWildcard('user.*', userHandler);
      eventManager.onWildcard('*', allHandler);

      await eventManager.emitAsync('user.login');
      await eventManager.emitAsync('system.boot');

      expect(userHandler).toHaveBeenCalledTimes(1);
      expect(allHandler).toHaveBeenCalledTimes(2);
    });

    it('should remove wildcard handler', () => {
      const handler = jest.fn();
      eventManager.onWildcard('test.*', handler);
      
      eventManager.removeWildcardHandler('test.*', handler);
      
      expect(eventManager.wildcardHandlers.get('test.*')).toBeUndefined();
    });
  });

  describe('event history', (): void => {
    it('should maintain event history', async (): Promise<void> => {
      await eventManager.emitAsync('event1', { a: 1 });
      await eventManager.emitAsync('event2', { b: 2 });
      await eventManager.emitAsync('event1', { a: 2 });

      const history1 = eventManager.getEventHistory('event1');
      const history2 = eventManager.getEventHistory('event2');

      expect(history1).toHaveLength(2);
      expect(history2).toHaveLength(1);
    });

    it('should respect history limit', async (): Promise<void> => {
      eventManager.historyLimit = 3;

      for (let i = 0; i < 5; i++) {
        await eventManager.emitAsync('limited', { i });
      }

      const history = eventManager.getEventHistory('limited');
      expect(history).toHaveLength(3);
      expect(history[0].data.i).toBe(2); // oldest should be i=2
    });

    it('should clear history', async (): Promise<void> => {
      await eventManager.emitAsync('clear.test', { data: 1 });
      await eventManager.emitAsync('clear.test', { data: 2 });

      eventManager.clearHistory('clear.test');

      const history = eventManager.getEventHistory('clear.test');
      expect(history).toHaveLength(0);
    });

    it('should clear all history', async (): Promise<void> => {
      await eventManager.emitAsync('event1', {});
      await eventManager.emitAsync('event2', {});

      eventManager.clearHistory();

      expect(eventManager.eventHistory.size).toBe(0);
    });
  });

  describe('event statistics', (): void => {
    it('should track event statistics', async (): Promise<void> => {
      await eventManager.emitAsync('stats.event', {});
      await eventManager.emitAsync('stats.event', {});
      await eventManager.emitAsync('other.event', {});

      const stats = eventManager.getEventStats();

      expect(stats['stats.event']).toEqual({
        count: 2,
        lastEmitted: expect.any(Number),
        listeners: 0
      });
      expect(stats['other.event'].count).toBe(1);
    });

    it('should include listener count in stats', async (): Promise<void> => {
      eventManager.on('listener.event', () => {});
      eventManager.on('listener.event', () => {});

      await eventManager.emitAsync('listener.event');

      const stats = eventManager.getEventStats();
      expect(stats['listener.event'].listeners).toBe(2);
    });
  });

  describe('wait functionality', (): void => {
    // Skip wait functionality tests as EventManager doesn't have waitFor method
  });

  describe('utility methods', (): void => {
    it('should generate unique event IDs', () => {
      const id1 = eventManager.generateEventId();
      const id2 = eventManager.generateEventId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });

    it('should convert pattern to regex', () => {
      const regex1 = eventManager.patternToRegex('user.*');
      expect(regex1.test('user.login')).toBe(true);
      expect(regex1.test('admin.login')).toBe(false);
      
      const regex2 = eventManager.patternToRegex('*');
      expect(regex2.test('any.event')).toBe(true);
    });

    it('should get wildcard listeners', async (): Promise<void> => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventManager.onWildcard('test.*', handler1);
      eventManager.onWildcard('*', handler2);

      const listeners = eventManager.getWildcardListeners('test.event');
      expect(listeners).toHaveLength(2);
    });
  });

  describe('error handling', (): void => {
    it('should handle invalid event names', async (): Promise<void> => {
      await expect(
        eventManager.emitAsync('')
      ).rejects.toThrow('eventName must contain only alphanumeric characters');

      await expect(
        eventManager.emitAsync(123)
      ).rejects.toThrow('eventName must be a string');
    });

    it('should handle circular references in event data', async (): Promise<void> => {
      const data = { name: 'test' };
      data.self = data;

      const handler = jest.fn();
      eventManager.on('circular', handler);

      await eventManager.emitAsync('circular', data);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('performance', (): void => {
    it('should handle many listeners efficiently', async (): Promise<void> => {
      const handlers = Array(100).fill(null).map(() => jest.fn());
      handlers.forEach(h => eventManager.on('many', h));

      const start = Date.now();
      await eventManager.emitAsync('many', { test: true });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
      handlers.forEach(h => expect(h).toHaveBeenCalled());
    });

    it('should handle many events efficiently', async (): Promise<void> => {
      const handler = jest.fn();
      eventManager.on('perf', handler);

      const start = Date.now();
      const promises = Array(100).fill(null).map((_, i) => 
        eventManager.emitAsync('perf', { i })
      );
      await Promise.all(promises);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
      // Handler gets called once per emitAsync
      expect(handler).toHaveBeenCalledTimes(100);
    });
  });
});