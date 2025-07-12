import { jest } from '@jest/globals';
import { GamificationKit } from '../../../src/core/GamificationKit.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { PointsModule } from '../../../src/modules/PointsModule.js';
import { BadgeModule } from '../../../src/modules/BadgeModule.js';

describe('GamificationKit', () => {
  let gk;

  beforeEach(() => {
    gk = new GamificationKit({
      api: { enabled: false },
      websocket: { enabled: false },
      webhooks: { enabled: false }
    });
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (gk && gk.initialized) {
      await gk.shutdown();
    }
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultGK = new GamificationKit();
      expect(defaultGK.config).toEqual({
        appName: 'gamification-app',
        storage: { type: 'memory' },
        api: {
          enabled: true,
          port: 3001,
          prefix: '/gamification',
          cors: true,
          rateLimit: {
            windowMs: 60000,
            max: 100
          }
        },
        webhooks: {
          enabled: false,
          timeout: 5000,
          retries: 3
        },
        websocket: {
          enabled: false,
          port: 3002,
          path: '/gamification/ws'
        },
        metrics: {
          enabled: true,
          collectInterval: 60000
        },
        logger: {
          level: 'info',
          enabled: true
        },
        security: {
          apiKey: null,
          encryption: false
        }
      });
      expect(gk.modules).toBeInstanceOf(Map);
      expect(gk.modules.size).toBe(0);
      expect(gk.initialized).toBe(false);
    });

    it('should accept custom config', () => {
      const customGK = new GamificationKit({
        storage: { type: 'redis', host: 'localhost' },
        metrics: { enabled: false },
        webhooks: { enabled: true },
        security: { apiKey: 'test-key' }
      });

      expect(customGK.config.storage.type).toBe('redis');
      expect(customGK.config.storage.host).toBe('localhost');
      expect(customGK.config.metrics.enabled).toBe(false);
      expect(customGK.config.webhooks.enabled).toBe(true);
      expect(customGK.config.security.apiKey).toBe('test-key');
    });
  });

  describe('initialize', () => {
    it('should initialize with memory storage', async () => {
      await gk.initialize();

      expect(gk.initialized).toBe(true);
      expect(gk.storage).toBeInstanceOf(MemoryStorage);
    });

    it('should initialize with different storage types', async () => {
      const customGK = new GamificationKit({
        storage: { type: 'memory' },
        api: { enabled: false },
        websocket: { enabled: false },
        webhooks: { enabled: false }
      });

      await customGK.initialize();

      expect(customGK.storage).toBeInstanceOf(MemoryStorage);
      await customGK.shutdown();
    });

    it('should return self if already initialized', async () => {
      await gk.initialize();
      const result = await gk.initialize();
      expect(result).toBe(gk);
    });

    it('should initialize all registered modules', async () => {
      const pointsModule = new PointsModule();
      const badgeModule = new BadgeModule();

      gk.use(pointsModule);
      gk.use(badgeModule);

      const pointsInitSpy = jest.spyOn(pointsModule, 'initialize');
      const badgeInitSpy = jest.spyOn(badgeModule, 'initialize');

      await gk.initialize();

      expect(pointsInitSpy).toHaveBeenCalled();
      expect(badgeInitSpy).toHaveBeenCalled();
    });

    it('should setup cross-module event listeners', async () => {
      const pointsModule = new PointsModule();
      const badgeModule = new BadgeModule();

      gk.use(pointsModule);
      gk.use(badgeModule);

      await gk.initialize();

      const eventSpy = jest.spyOn(gk.eventManager, 'emitAsync');
      
      // Trigger points event
      await gk.eventManager.emitAsync('points.awarded', {
        userId: 'user123',
        points: 100
      });

      expect(eventSpy).toHaveBeenCalledWith('points.awarded', expect.any(Object));
    });
  });

  describe('use', () => {
    it('should register a module', () => {
      const pointsModule = new PointsModule();
      gk.use(pointsModule);

      expect(gk.modules.get('points')).toBe(pointsModule);
    });

    it('should throw error for duplicate module names', () => {
      const module1 = new PointsModule();
      const module2 = new PointsModule();

      gk.use(module1);
      expect(() => gk.use(module2)).toThrow('Module already registered: points');
    });

    it('should validate module has name', () => {
      const invalidModule = {};

      expect(() => gk.use(invalidModule)).toThrow('Module must have a name property');
    });

    it('should initialize module if GK is already initialized', async () => {
      await gk.initialize();

      const pointsModule = new PointsModule();
      const setContextSpy = jest.spyOn(pointsModule, 'setContext');
      const initSpy = jest.spyOn(pointsModule, 'initialize');

      gk.use(pointsModule);

      expect(setContextSpy).toHaveBeenCalledWith(expect.objectContaining({
        storage: gk.storage,
        eventManager: gk.eventManager,
        ruleEngine: gk.ruleEngine,
        logger: expect.any(Object),
        config: expect.any(Object)
      }));
      expect(initSpy).toHaveBeenCalled();
    });
  });

  describe('track', () => {
    beforeEach(async () => {
      await gk.initialize();
    });

    it('should emit event through event manager', async () => {
      const emitSpy = jest.spyOn(gk.eventManager, 'emitAsync');

      const result = await gk.track('user.action', {
        userId: 'user123',
        action: 'login'
      });

      expect(emitSpy).toHaveBeenCalledWith('user.action', expect.objectContaining({
        userId: 'user123',
        action: 'login',
        eventName: 'user.action',
        timestamp: expect.any(Number)
      }));
      expect(result).toEqual({
        eventId: expect.any(String),
        processed: true,
        rulesMatched: 0,
        timestamp: expect.any(Number)
      });
    });

    it('should process rules when enabled', async () => {
      const evaluateSpy = jest.spyOn(gk.ruleEngine, 'evaluate');

      gk.ruleEngine.addRule('login-bonus', {
        conditions: [{ field: 'action', operator: '==', value: 'login' }],
        actions: [{ type: 'award_points', points: 10 }]
      });

      await gk.track('user.action', {
        userId: 'user123',
        action: 'login'
      });

      expect(evaluateSpy).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user123',
        action: 'login',
        eventName: 'user.action',
        timestamp: expect.any(Number)
      }));
    });

    it('should collect metrics when enabled', async () => {
      const recordEventSpy = jest.spyOn(gk.metricsCollector, 'recordEvent');

      await gk.track('user.action', {
        userId: 'user123',
        action: 'login'
      });

      expect(recordEventSpy).toHaveBeenCalledWith('user.action', expect.objectContaining({
        userId: 'user123',
        action: 'login',
        eventName: 'user.action',
        timestamp: expect.any(Number)
      }));
    });

    it('should trigger webhooks when enabled', async () => {
      const customGK = new GamificationKit({ 
        webhooks: { enabled: true },
        api: { enabled: false },
        websocket: { enabled: false }
      });
      await customGK.initialize();

      const triggerSpy = jest.spyOn(customGK.webhookManager, 'trigger');

      await customGK.track('user.action', {
        userId: 'user123',
        action: 'login'
      });

      expect(triggerSpy).toHaveBeenCalledWith('user.action', expect.objectContaining({
        userId: 'user123',
        action: 'login',
        eventName: 'user.action',
        timestamp: expect.any(Number)
      }));
      
      await customGK.shutdown();
    });

    it('should throw error if not initialized', async () => {
      const uninitializedGK = new GamificationKit();
      
      await expect(
        uninitializedGK.track('test.event', {})
      ).rejects.toThrow('GamificationKit not initialized. Call initialize() first.');
    });
  });

  describe('getUserStats', () => {
    beforeEach(async () => {
      const pointsModule = new PointsModule();
      const badgeModule = new BadgeModule();

      gk.use(pointsModule);
      gk.use(badgeModule);

      await gk.initialize();
    });

    it('should aggregate stats from all modules', async () => {
      // Setup some data
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');
      
      await pointsModule.award('user123', 100);
      await badgeModule.award('user123', 'first-login');

      const stats = await gk.getUserStats('user123');

      expect(stats).toEqual({
        userId: 'user123',
        modules: {
          points: expect.objectContaining({
            current: 100,
            total: 100,
            history: expect.any(Array)
          }),
          badges: expect.objectContaining({
            earned: expect.arrayContaining(['first-login']),
            count: 1
          })
        }
      });
    });

    it('should handle modules without getUserStats', async () => {
      const customModule = {
        name: 'custom',
        initialize: jest.fn(),
        setContext: jest.fn()
      };

      gk.use(customModule);

      const stats = await gk.getUserStats('user123');
      expect(stats.modules.custom).toBeUndefined();
    });

    it('should return basic stats structure', async () => {
      const stats = await gk.getUserStats('user123');

      expect(stats).toEqual({
        userId: 'user123',
        modules: expect.any(Object)
      });
    });
  });

  describe('resetUser', () => {
    beforeEach(async () => {
      const pointsModule = new PointsModule();
      const badgeModule = new BadgeModule();

      gk.use(pointsModule);
      gk.use(badgeModule);

      await gk.initialize();
    });

    it('should reset data in all modules', async () => {
      // Setup some data
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');
      
      await pointsModule.award('user123', 100);
      await badgeModule.award('user123', 'test-badge');

      // Reset user
      const result = await gk.resetUser('user123');

      expect(result).toEqual({ success: true, userId: 'user123' });

      // Check data is cleared
      const stats = await gk.getUserStats('user123');
      expect(stats.modules.points.current).toBe(0);
      expect(stats.modules.badges.earned).toEqual([]);
    });

    it('should emit user.reset event', async () => {
      const emitSpy = jest.spyOn(gk.eventManager, 'emitAsync');

      await gk.resetUser('user123');

      expect(emitSpy).toHaveBeenCalledWith('user.reset', {
        userId: 'user123'
      });
    });

    it('should handle modules without resetUser method', async () => {
      const customModule = {
        name: 'custom',
        initialize: jest.fn(),
        setContext: jest.fn()
      };

      gk.use(customModule);

      // Should not throw
      await expect(gk.resetUser('user123')).resolves.not.toThrow();
    });
  });

  describe('module access', () => {
    it('should access registered module via Map', async () => {
      const pointsModule = new PointsModule();
      gk.use(pointsModule);
      await gk.initialize();

      const module = gk.modules.get('points');
      expect(module).toBe(pointsModule);
    });

    it('should return undefined for non-existent module', () => {
      const module = gk.modules.get('nonexistent');
      expect(module).toBeUndefined();
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      const pointsModule = new PointsModule();
      gk.use(pointsModule);
      await gk.initialize();
    });

    it('should disconnect storage', async () => {
      const disconnectSpy = jest.spyOn(gk.storage, 'disconnect');

      await gk.shutdown();

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('should stop metrics collector', async () => {
      const stopSpy = jest.spyOn(gk.metricsCollector, 'stop');

      await gk.shutdown();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should set initialized to false', async () => {
      await gk.shutdown();
      expect(gk.initialized).toBe(false);
    });

    it('should shutdown all modules', async () => {
      const module = gk.modules.get('points');
      const shutdownSpy = jest.spyOn(module, 'shutdown');

      await gk.shutdown();

      expect(shutdownSpy).toHaveBeenCalled();
    });

    it('should destroy event manager', async () => {
      const destroySpy = jest.spyOn(gk.eventManager, 'destroy');

      await gk.shutdown();

      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('rule processing', () => {
    beforeEach(async () => {
      const pointsModule = new PointsModule();
      gk.use(pointsModule);
      await gk.initialize();
    });

    it('should execute rule actions', async () => {
      const pointsModule = gk.modules.get('points');
      const awardSpy = jest.spyOn(pointsModule, 'award');

      gk.ruleEngine.addRule('double-points-weekend', {
        conditions: [{
          operator: 'function',
          function: 'isWeekend'
        }],
        actions: [{
          type: 'custom',
          handler: async (context, gk) => {
            const points = gk.modules.get('points');
            await points.award(context.userId, 100, 'weekend-bonus');
          }
        }]
      });

      gk.ruleEngine.addFunction('isWeekend', () => true);

      await gk.track('user.action', {
        userId: 'user123'
      });

      expect(awardSpy).toHaveBeenCalledWith('user123', 100, 'weekend-bonus');
    });

    it('should handle complex rule conditions', async () => {
      gk.ruleEngine.addRule('vip-bonus', {
        conditions: [{
          operator: 'and',
          conditions: [
            { field: 'level', operator: '>=', value: 10 },
            { field: 'totalSpent', operator: '>', value: 1000 }
          ]
        }],
        actions: [{ type: 'vip-reward', multiplier: 2 }]
      });

      const evaluateSpy = jest.spyOn(gk.ruleEngine, 'evaluate');

      await gk.track('purchase.complete', {
        userId: 'user123',
        level: 15,
        totalSpent: 1500
      });

      expect(evaluateSpy).toHaveBeenCalled();
      const results = await evaluateSpy.mock.results[0].value;
      expect(results.passed).toHaveLength(1);
      expect(results.passed[0].actions).toContainEqual({ type: 'vip-reward', multiplier: 2 });
    });
  });

  describe('event flow', () => {
    it('should propagate events between modules', async () => {
      const pointsModule = new PointsModule();
      const badgeModule = new BadgeModule();

      gk.use(pointsModule);
      gk.use(badgeModule);

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

      const emitSpy = jest.spyOn(gk.eventManager, 'emitAsync');

      // Award points to trigger milestone
      await pointsModule.award('user123', 1000);

      // Check if milestone event was emitted
      const milestoneCall = emitSpy.mock.calls.find(call => call[0] === 'points.milestone');
      expect(milestoneCall).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle module initialization errors', async () => {
      const errorModule = {
        name: 'error',
        initialize: jest.fn().mockRejectedValue(new Error('Init failed')),
        setContext: jest.fn()
      };

      gk.use(errorModule);

      await expect(gk.initialize()).rejects.toThrow('Failed to initialize module: error');
    });

    it('should handle storage initialization errors', async () => {
      const customGK = new GamificationKit({
        storage: { type: 'invalid' }
      });

      await expect(customGK.initialize()).rejects.toThrow('Unknown storage type: invalid');
    });

    it('should continue tracking even if metrics fail', async () => {
      await gk.initialize();
      
      gk.metricsCollector.recordEvent = jest.fn().mockImplementation(() => {
        throw new Error('Metrics error');
      });

      const emitSpy = jest.spyOn(gk.eventManager, 'emitAsync');

      // Should not throw
      const result = await gk.track('test.event', {});
      expect(result).toBeDefined();
      expect(emitSpy).toHaveBeenCalled();
    });
  });

  describe('additional features', () => {
    it('should provide health check', async () => {
      const pointsModule = new PointsModule();
      gk.use(pointsModule);
      await gk.initialize();
      
      const health = gk.getHealth();
      
      expect(health).toEqual({
        status: 'healthy',
        initialized: true,
        storage: true,
        modules: ['points'],
        uptime: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });

    it('should provide metrics', async () => {
      await gk.initialize();
      
      const metrics = gk.getMetrics();
      
      expect(metrics).toBeDefined();
    });

    it('should provide middleware methods', () => {
      expect(typeof gk.express).toBe('function');
      expect(typeof gk.fastify).toBe('function');
      expect(typeof gk.koa).toBe('function');
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