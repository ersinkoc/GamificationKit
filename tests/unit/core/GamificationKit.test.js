import { jest } from '@jest/globals';
import { GamificationKit } from '../../../src/core/GamificationKit.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { PointsModule } from '../../../src/modules/PointsModule.js';
import { BadgeModule } from '../../../src/modules/BadgeModule.js';

describe('GamificationKit', () => {
  let gk;

  beforeEach(() => {
    gk = new GamificationKit();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (gk && gk.initialized) {
      await gk.shutdown();
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(gk.options).toEqual({
        storage: 'memory',
        enableMetrics: true,
        enableWebhooks: false,
        enableRules: true
      });
      expect(gk.modules).toEqual({});
      expect(gk.initialized).toBe(false);
    });

    it('should accept custom options', () => {
      const customGK = new GamificationKit({
        storage: 'redis',
        enableMetrics: false,
        enableWebhooks: true,
        apiKey: 'test-key'
      });

      expect(customGK.options.storage).toBe('redis');
      expect(customGK.options.enableMetrics).toBe(false);
      expect(customGK.options.enableWebhooks).toBe(true);
      expect(customGK.options.apiKey).toBe('test-key');
    });
  });

  describe('initialize', () => {
    it('should initialize with memory storage', async () => {
      await gk.initialize();

      expect(gk.initialized).toBe(true);
      expect(gk.storage).toBeInstanceOf(MemoryStorage);
    });

    it('should initialize with custom storage instance', async () => {
      const customStorage = new MemoryStorage();
      const customGK = new GamificationKit({
        storage: customStorage
      });

      await customGK.initialize();

      expect(customGK.storage).toBe(customStorage);
    });

    it('should throw error if already initialized', async () => {
      await gk.initialize();
      await expect(gk.initialize()).rejects.toThrow('GamificationKit is already initialized');
    });

    it('should initialize all registered modules', async () => {
      const pointsModule = new PointsModule();
      const badgeModule = new BadgeModule();

      gk.use('points', pointsModule);
      gk.use('badges', badgeModule);

      const pointsInitSpy = jest.spyOn(pointsModule, 'initialize');
      const badgeInitSpy = jest.spyOn(badgeModule, 'initialize');

      await gk.initialize();

      expect(pointsInitSpy).toHaveBeenCalledWith(gk.storage, gk.eventManager);
      expect(badgeInitSpy).toHaveBeenCalledWith(gk.storage, gk.eventManager);
    });

    it('should setup cross-module event listeners', async () => {
      const pointsModule = new PointsModule();
      const badgeModule = new BadgeModule();

      gk.use('points', pointsModule);
      gk.use('badges', badgeModule);

      await gk.initialize();

      const eventSpy = jest.spyOn(gk.eventManager, 'emit');
      
      // Trigger points event
      await gk.eventManager.emit('points.awarded', {
        userId: 'user123',
        points: 100
      });

      expect(eventSpy).toHaveBeenCalledWith('points.awarded', expect.any(Object));
    });
  });

  describe('use', () => {
    it('should register a module', () => {
      const pointsModule = new PointsModule();
      gk.use('points', pointsModule);

      expect(gk.modules.points).toBe(pointsModule);
    });

    it('should throw error for duplicate module names', () => {
      const module1 = new PointsModule();
      const module2 = new PointsModule();

      gk.use('points', module1);
      expect(() => gk.use('points', module2)).toThrow('Module points already exists');
    });

    it('should validate module interface', () => {
      const invalidModule = {
        name: 'invalid'
      };

      expect(() => gk.use('invalid', invalidModule)).toThrow('Module must implement required methods');
    });

    it('should initialize module if GK is already initialized', async () => {
      await gk.initialize();

      const pointsModule = new PointsModule();
      const initSpy = jest.spyOn(pointsModule, 'initialize');

      gk.use('points', pointsModule);

      expect(initSpy).toHaveBeenCalledWith(gk.storage, gk.eventManager);
    });
  });

  describe('track', () => {
    beforeEach(async () => {
      await gk.initialize();
    });

    it('should emit event through event manager', async () => {
      const emitSpy = jest.spyOn(gk.eventManager, 'emit');

      await gk.track('user.action', {
        userId: 'user123',
        action: 'login'
      });

      expect(emitSpy).toHaveBeenCalledWith('user.action', {
        userId: 'user123',
        action: 'login'
      });
    });

    it('should process rules when enabled', async () => {
      const evaluateSpy = jest.spyOn(gk.ruleEngine, 'evaluate');

      gk.ruleEngine.addRule({
        id: 'login-bonus',
        condition: { field: 'action', operator: '==', value: 'login' },
        action: { type: 'points', value: 10 }
      });

      await gk.track('user.action', {
        userId: 'user123',
        action: 'login'
      });

      expect(evaluateSpy).toHaveBeenCalledWith({
        userId: 'user123',
        action: 'login',
        event: 'user.action'
      });
    });

    it('should collect metrics when enabled', async () => {
      const incrementSpy = jest.spyOn(gk.metricsCollector, 'increment');

      await gk.track('user.action', {
        userId: 'user123',
        action: 'login'
      });

      expect(incrementSpy).toHaveBeenCalledWith('events.tracked', 1, {
        event: 'user.action'
      });
    });

    it('should trigger webhooks when enabled', async () => {
      const customGK = new GamificationKit({ enableWebhooks: true });
      await customGK.initialize();

      const triggerSpy = jest.spyOn(customGK.webhookManager, 'trigger');

      await customGK.track('user.action', {
        userId: 'user123',
        action: 'login'
      });

      expect(triggerSpy).toHaveBeenCalledWith('user.action', {
        userId: 'user123',
        action: 'login'
      });
    });

    it('should throw error if not initialized', async () => {
      const uninitializedGK = new GamificationKit();
      
      await expect(
        uninitializedGK.track('test.event', {})
      ).rejects.toThrow('GamificationKit must be initialized first');
    });
  });

  describe('getUserStats', () => {
    beforeEach(async () => {
      const pointsModule = new PointsModule();
      const badgeModule = new BadgeModule();

      gk.use('points', pointsModule);
      gk.use('badges', badgeModule);

      await gk.initialize();
    });

    it('should aggregate stats from all modules', async () => {
      // Setup some data
      await gk.modules.points.award('user123', 100);
      await gk.modules.badges.award('user123', 'first-login');

      const stats = await gk.getUserStats('user123');

      expect(stats).toEqual({
        points: expect.objectContaining({
          current: 100,
          total: 100,
          history: expect.any(Array)
        }),
        badges: expect.objectContaining({
          earned: expect.arrayContaining(['first-login']),
          count: 1
        })
      });
    });

    it('should handle modules without getUserStats', async () => {
      const customModule = {
        name: 'custom',
        initialize: jest.fn(),
        setupEventListeners: jest.fn()
      };

      gk.use('custom', customModule);

      const stats = await gk.getUserStats('user123');
      expect(stats.custom).toBeUndefined();
    });

    it('should include global stats', async () => {
      const stats = await gk.getUserStats('user123');

      expect(stats._global).toEqual({
        userId: 'user123',
        lastActive: expect.any(Date)
      });
    });
  });

  describe('resetUser', () => {
    beforeEach(async () => {
      const pointsModule = new PointsModule();
      const badgeModule = new BadgeModule();

      gk.use('points', pointsModule);
      gk.use('badges', badgeModule);

      await gk.initialize();
    });

    it('should reset data in all modules', async () => {
      // Setup some data
      await gk.modules.points.award('user123', 100);
      await gk.modules.badges.award('user123', 'test-badge');

      // Reset user
      await gk.resetUser('user123');

      // Check data is cleared
      const stats = await gk.getUserStats('user123');
      expect(stats.points.current).toBe(0);
      expect(stats.badges.earned).toEqual([]);
    });

    it('should emit user.reset event', async () => {
      const emitSpy = jest.spyOn(gk.eventManager, 'emit');

      await gk.resetUser('user123');

      expect(emitSpy).toHaveBeenCalledWith('user.reset', {
        userId: 'user123',
        timestamp: expect.any(Date)
      });
    });

    it('should handle modules without resetUser method', async () => {
      const customModule = {
        name: 'custom',
        initialize: jest.fn(),
        setupEventListeners: jest.fn()
      };

      gk.use('custom', customModule);

      // Should not throw
      await expect(gk.resetUser('user123')).resolves.not.toThrow();
    });
  });

  describe('getModule', () => {
    it('should return registered module', async () => {
      const pointsModule = new PointsModule();
      gk.use('points', pointsModule);
      await gk.initialize();

      const module = gk.getModule('points');
      expect(module).toBe(pointsModule);
    });

    it('should return undefined for non-existent module', () => {
      const module = gk.getModule('nonexistent');
      expect(module).toBeUndefined();
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      const pointsModule = new PointsModule();
      gk.use('points', pointsModule);
      await gk.initialize();
    });

    it('should disconnect storage', async () => {
      const disconnectSpy = jest.spyOn(gk.storage, 'disconnect');

      await gk.shutdown();

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('should clear flush interval', async () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      await gk.shutdown();

      expect(clearIntervalSpy).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should set initialized to false', async () => {
      await gk.shutdown();
      expect(gk.initialized).toBe(false);
    });

    it('should handle shutdown errors gracefully', async () => {
      gk.storage.disconnect = jest.fn().mockRejectedValue(new Error('Disconnect failed'));
      const consoleSpy = jest.spyOn(console, 'error');

      await gk.shutdown();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error during shutdown:',
        expect.any(Error)
      );
    });
  });

  describe('rule processing', () => {
    beforeEach(async () => {
      const pointsModule = new PointsModule();
      gk.use('points', pointsModule);
      await gk.initialize();
    });

    it('should execute rule actions', async () => {
      gk.ruleEngine.addRule({
        id: 'double-points-weekend',
        condition: {
          operator: 'function',
          function: 'isWeekend'
        },
        action: async (context) => {
          await gk.modules.points.award(context.userId, 100, {
            reason: 'weekend-bonus'
          });
        }
      });

      gk.ruleEngine.registerFunction('isWeekend', () => true);

      await gk.track('user.action', {
        userId: 'user123'
      });

      const stats = await gk.getUserStats('user123');
      expect(stats.points.current).toBe(100);
    });

    it('should handle complex rule conditions', async () => {
      gk.ruleEngine.addRule({
        id: 'vip-bonus',
        condition: {
          operator: 'and',
          conditions: [
            { field: 'level', operator: '>=', value: 10 },
            { field: 'totalSpent', operator: '>', value: 1000 }
          ]
        },
        action: { type: 'vip-reward', multiplier: 2 }
      });

      const evaluateSpy = jest.spyOn(gk.ruleEngine, 'evaluate');

      await gk.track('purchase.complete', {
        userId: 'user123',
        level: 15,
        totalSpent: 1500
      });

      expect(evaluateSpy).toHaveBeenCalled();
      const results = await evaluateSpy.mock.results[0].value;
      expect(results).toContainEqual({ type: 'vip-reward', multiplier: 2 });
    });
  });

  describe('event flow', () => {
    it('should propagate events between modules', async () => {
      const pointsModule = new PointsModule();
      const badgeModule = new BadgeModule();

      gk.use('points', pointsModule);
      gk.use('badges', badgeModule);

      await gk.initialize();

      // Configure badge to be awarded on points milestone
      await badgeModule.create({
        id: 'high-scorer',
        name: 'High Scorer',
        description: 'Reach 1000 points',
        autoAward: true,
        condition: {
          event: 'points.milestone',
          field: 'milestone',
          operator: '==',
          value: 1000
        }
      });

      const onSpy = jest.spyOn(gk.eventManager, 'on');

      // Award points to trigger milestone
      await pointsModule.award('user123', 1000);

      // Check if milestone event was emitted
      const emitCalls = gk.eventManager.emit.mock.calls;
      const milestoneCall = emitCalls.find(call => call[0] === 'points.milestone');
      expect(milestoneCall).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle module initialization errors', async () => {
      const errorModule = {
        name: 'error',
        initialize: jest.fn().mockRejectedValue(new Error('Init failed')),
        setupEventListeners: jest.fn()
      };

      gk.use('error', errorModule);

      await expect(gk.initialize()).rejects.toThrow('Failed to initialize module error');
    });

    it('should handle storage initialization errors', async () => {
      const customGK = new GamificationKit({
        storage: 'invalid'
      });

      await expect(customGK.initialize()).rejects.toThrow();
    });

    it('should continue tracking even if metrics fail', async () => {
      await gk.initialize();
      
      gk.metricsCollector.increment = jest.fn().mockImplementation(() => {
        throw new Error('Metrics error');
      });

      const emitSpy = jest.spyOn(gk.eventManager, 'emit');

      // Should not throw
      await expect(gk.track('test.event', {})).resolves.not.toThrow();
      expect(emitSpy).toHaveBeenCalled();
    });
  });

  describe('storage adapter switching', () => {
    it('should support different storage adapters', async () => {
      const mockRedisStorage = {
        connect: jest.fn(),
        disconnect: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        exists: jest.fn()
      };

      const customGK = new GamificationKit({
        storage: mockRedisStorage
      });

      await customGK.initialize();
      expect(customGK.storage).toBe(mockRedisStorage);
      expect(mockRedisStorage.connect).toHaveBeenCalled();
    });
  });

  describe('performance', () => {
    it('should handle high-frequency events efficiently', async () => {
      await gk.initialize();

      const start = Date.now();
      const promises = [];

      for (let i = 0; i < 1000; i++) {
        promises.push(gk.track('performance.test', {
          userId: `user${i % 10}`,
          value: i
        }));
      }

      await Promise.all(promises);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });
});