import type { GamificationKit } from '../src/core/GamificationKit.js';
import { jest } from '@jest/globals';
import { PointsModule } from '../../../src/modules/PointsModule.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { EventManager } from '../../../src/core/EventManager.js';
import { Logger } from '../../../src/utils/logger.js';

describe('PointsModule', (): void => {
  let pointsModule;
  let storage;
  let eventManager;
  let logger;

  beforeEach(async () => {
    storage = new MemoryStorage();
    eventManager = new EventManager();
    logger = new Logger({ prefix: 'PointsModule' });
    await storage.connect();

    pointsModule = new PointsModule({
      dailyLimit: 1000,
      weeklyLimit: 5000,
      monthlyLimit: 20000,
      decayEnabled: true,
      decayDays: 30,
      decayPercentage: 10,
      multipliers: {
        global: 1,
        first: 1.5
      },
      minimumPoints: 0
    });

    pointsModule.setContext({
      storage,
      eventManager,
      logger,
      config: {}
    });
    
    await pointsModule.initialize();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await storage.disconnect();
    jest.restoreAllMocks();
  });

  describe('constructor', (): void => {
    it('should initialize with default options', () => {
      const module = new PointsModule();
      expect(module.name).toBe('points');
      expect(module.config).toEqual({}); // config is initialized as empty object by BaseModule
      expect(module.defaultConfig.multipliers).toEqual({});
      expect(module.defaultConfig.decayEnabled).toBe(false);
    });

    it('should accept custom options', () => {
      const module = new PointsModule({
        multipliers: { double: 2 },
        dailyLimit: 500
      });
      
      expect(module.options.multipliers.double).toBe(2);
      expect(module.options.dailyLimit).toBe(500);
    });
  });

  describe('award', (): void => {
    it('should award points to user', async (): Promise<void> => {
      const result = await pointsModule.award('user123', 100, 'test award');

      expect(result).toEqual({
        success: true,
        points: 100,
        total: 100,
        transaction: expect.objectContaining({
          id: expect.any(String),
          userId: 'user123',
          type: 'award',
          points: 100,
          originalPoints: 100,
          multiplier: 1,
          reason: 'test award',
          timestamp: expect.any(Number)
        })
      });

      const balance = await pointsModule.getPoints('user123');
      expect(balance).toBe(100);
    });

    it('should apply multipliers', async (): Promise<void> => {
      const result = await pointsModule.award('user123', 100, 'first');

      expect(result.transaction.multiplier).toBe(1.5);
      expect(result.points).toBe(150);
      expect(result.total).toBe(150);
    });

    it('should stack multipliers', async (): Promise<void> => {
      // Add weekend multiplier to config
      pointsModule.config.multipliers.weekend = 2;
      
      // Mock it to be weekend
      const originalGetDay = Date.prototype.getDay;
      Date.prototype.getDay = jest.fn().mockReturnValue(0); // Sunday

      const result = await pointsModule.award('user123', 100, 'first');

      expect(result.transaction.multiplier).toBe(3); // 2 * 1.5
      expect(result.points).toBe(300);

      Date.prototype.getDay = originalGetDay;
    });

    it('should respect daily limits', async (): Promise<void> => {
      await pointsModule.award('user123', 800);
      
      const result = await pointsModule.award('user123', 300);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('daily_limit_exceeded');
      expect(result.limit).toBe(1000);
      expect(result.current).toBe(800);
    });

    it('should emit points.awarded event', async (): Promise<void> => {
      const emitSpy = jest.spyOn(pointsModule.eventManager, 'emitAsync');

      const result = await pointsModule.award('user123', 100, 'achievement');

      expect(emitSpy).toHaveBeenCalledWith('points.awarded', expect.objectContaining({
        module: 'points',
        userId: 'user123',
        points: 100,
        total: 100,
        transaction: result.transaction
      }));
    });

    it('should award multiple times', async (): Promise<void> => {
      const result1 = await pointsModule.award('user123', 500);
      const result2 = await pointsModule.award('user123', 500);

      expect(result1.total).toBe(500);
      expect(result2.total).toBe(1000);
      
      const balance = await pointsModule.getPoints('user123');
      expect(balance).toBe(1000);
    });

    it('should record transaction history', async (): Promise<void> => {
      await pointsModule.award('user123', 100, 'test');
      
      const history = await pointsModule.getTransactionHistory('user123');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(expect.objectContaining({
        type: 'award',
        points: 100,
        reason: 'test',
        timestamp: expect.any(Number)
      }));
    });

    it('should handle concurrent awards', async (): Promise<void> => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(pointsModule.award('user123', 10));
      }

      await Promise.all(promises);

      const balance = await pointsModule.getPoints('user123');
      expect(balance).toBe(100);
    });

  });

  describe('deduct', (): void => {
    beforeEach(async () => {
      await pointsModule.award('user123', 500);
    });

    it('should deduct points', async (): Promise<void> => {
      const result = await pointsModule.deduct('user123', 200, 'purchase');

      expect(result.success).toBe(true);
      expect(result.points).toBe(200);
      expect(result.total).toBe(300);
      expect(result.transaction).toEqual(expect.objectContaining({
        type: 'deduct',
        points: -200,
        reason: 'purchase'
      }));
    });

    it('should fail if insufficient balance', async (): Promise<void> => {
      const result = await pointsModule.deduct('user123', 600);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('insufficient_points');
      expect(result.current).toBe(500);
      expect(result.required).toBe(600);
    });

    it('should emit points.deducted event', async (): Promise<void> => {
      const emitSpy = jest.spyOn(pointsModule.eventManager, 'emitAsync');

      const result = await pointsModule.deduct('user123', 200, 'redemption');

      expect(emitSpy).toHaveBeenCalledWith('points.deducted', expect.objectContaining({
        module: 'points',
        userId: 'user123',
        points: 200,
        total: 300,
        transaction: result.transaction
      }));
    });

    it('should record deduction in history', async (): Promise<void> => {
      await pointsModule.deduct('user123', 200, 'spent');

      const history = await pointsModule.getTransactionHistory('user123');
      const deduction = history.find(h => h.type === 'deduct');

      expect(deduction).toEqual(expect.objectContaining({
        type: 'deduct',
        points: -200,
        reason: 'spent',
        timestamp: expect.any(Number)
      }));
    });
  });

  describe('getPoints', (): void => {
    it('should return current points', async (): Promise<void> => {
      await pointsModule.award('user123', 250);
      
      const points = await pointsModule.getPoints('user123');
      expect(points).toBe(250);
    });

    it('should return 0 for new user', async (): Promise<void> => {
      const points = await pointsModule.getPoints('newuser');
      expect(points).toBe(0);
    });
  });

  describe('getTopUsers', (): void => {
    beforeEach(async () => {
      await pointsModule.award('user1', 100);
      await pointsModule.award('user2', 200);
      await pointsModule.award('user3', 150);
      await pointsModule.award('user4', 50);
      await pointsModule.award('user5', 300);
    });

    it('should return top users', async (): Promise<void> => {
      const topUsers = await pointsModule.getTopUsers(3);

      expect(topUsers).toEqual([
        { userId: 'user5', points: 300, rank: 1 },
        { userId: 'user2', points: 200, rank: 2 },
        { userId: 'user3', points: 150, rank: 3 }
      ]);
    });

    it('should support different periods', async (): Promise<void> => {
      const weekly = await pointsModule.getTopUsers(3, 'weekly');
      // Should return same results as all data is recent
      expect(weekly.length).toBeGreaterThan(0);
    });
  });

  describe('getTransactionHistory', (): void => {
    it('should return transaction history', async (): Promise<void> => {
      await pointsModule.award('user123', 100, 'signup');
      await pointsModule.award('user123', 200, 'purchase');
      await pointsModule.deduct('user123', 50, 'redemption');

      const history = await pointsModule.getTransactionHistory('user123');

      expect(history).toHaveLength(3);
      expect(history[0].reason).toBe('redemption'); // Most recent first
      expect(history[1].reason).toBe('purchase');
      expect(history[2].reason).toBe('signup');
    });

    it('should limit history results', async (): Promise<void> => {
      for (let i = 0; i < 20; i++) {
        await pointsModule.award('user123', 10);
      }

      const history = await pointsModule.getTransactionHistory('user123', 10);
      expect(history).toHaveLength(10);
    });
  });

  describe('getUserRank', (): void => {
    beforeEach(async () => {
      await pointsModule.award('user1', 100);
      await pointsModule.award('user2', 200);
      await pointsModule.award('user3', 150);
    });

    it('should return user rank', async (): Promise<void> => {
      const rank1 = await pointsModule.getUserRank('user2');
      const rank2 = await pointsModule.getUserRank('user3');
      const rank3 = await pointsModule.getUserRank('user1');

      expect(rank1).toEqual({
        userId: 'user2',
        rank: 1,
        points: 200
      });
      expect(rank2.rank).toBe(2);
      expect(rank3.rank).toBe(3);
    });

    it('should return null for non-existent user', async (): Promise<void> => {
      const rank = await pointsModule.getUserRank('nonexistent');
      expect(rank).toBeNull();
    });
  });

  describe('multipliers', (): void => {
    it('should set user multiplier', async (): Promise<void> => {
      const result = await pointsModule.setUserMultiplier('user123', 2, 3600);
      
      expect(result).toEqual({
        success: true,
        multiplier: 2,
        duration: 3600
      });

      // Award with multiplier
      const awardResult = await pointsModule.award('user123', 100);
      expect(awardResult.points).toBe(200);
    });

    it('should set event multiplier', async (): Promise<void> => {
      const result = await pointsModule.setEventMultiplier(1.5, 7200);
      
      expect(result).toEqual({
        success: true,
        multiplier: 1.5,
        duration: 7200
      });

      // Award with event multiplier
      const awardResult = await pointsModule.award('user123', 100);
      expect(awardResult.points).toBe(150);
    });
  });

  describe('limits', (): void => {
    it('should enforce daily limits', async (): Promise<void> => {
      const result1 = await pointsModule.award('user123', 800);
      expect(result1.success).toBe(true);

      const result2 = await pointsModule.award('user123', 300);
      expect(result2.success).toBe(false);
      expect(result2.reason).toBe('daily_limit_exceeded');
      expect(result2.limit).toBe(1000);
    });

    it('should check period limits', async (): Promise<void> => {
      const result = await pointsModule.checkLimits('user123', 100);
      expect(result.allowed).toBe(true);

      // Exceed daily limit
      await pointsModule.award('user123', 950);
      const limitCheck = await pointsModule.checkLimits('user123', 100);
      expect(limitCheck.allowed).toBe(false);
      expect(limitCheck.reason).toBe('daily_limit_exceeded');
    });
  });

  describe('decay', (): void => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should process decay after interval', async (): Promise<void> => {
      const now = Date.now();
      jest.setSystemTime(now);

      await pointsModule.award('user123', 1000);

      // Fast forward 31 days
      jest.setSystemTime(now + 31 * 24 * 60 * 60 * 1000);

      // Manually trigger decay processing
      await pointsModule.processDecay();

      const balance = await pointsModule.getPoints('user123');
      expect(balance).toBe(900); // 10% decay
    });

    it('should not decay if no recent activity', async (): Promise<void> => {
      const now = Date.now();
      jest.setSystemTime(now);

      await pointsModule.award('user123', 1000);

      // Fast forward 29 days - before decay threshold
      jest.setSystemTime(now + 29 * 24 * 60 * 60 * 1000);

      await pointsModule.processDecay();

      const balance = await pointsModule.getPoints('user123');
      expect(balance).toBe(1000); // No decay
    });
  });

  describe('getUserStats', (): void => {
    it('should return comprehensive stats', async (): Promise<void> => {
      await pointsModule.award('user123', 100, 'signup');
      await pointsModule.award('user123', 200, 'purchase');
      await pointsModule.deduct('user123', 50, 'redemption');

      const stats = await pointsModule.getUserStats('user123');

      expect(stats).toEqual({
        total: 250,
        daily: 300,
        weekly: 300,
        monthly: 300,
        rank: 1,
        recentTransactions: expect.any(Array),
        limits: {
          daily: { limit: 1000, used: 300, remaining: 700 },
          weekly: { limit: 5000, used: 300, remaining: 4700 },
          monthly: { limit: 20000, used: 300, remaining: 19700 }
        }
      });
    });
  });

  describe('resetUser', (): void => {
    it('should reset all user data', async (): Promise<void> => {
      await pointsModule.award('user123', 500);
      await pointsModule.award('user123', 300);

      await pointsModule.resetUser('user123');

      const balance = await pointsModule.getPoints('user123');
      const history = await pointsModule.getTransactionHistory('user123');
      const stats = await pointsModule.getUserStats('user123');

      expect(balance).toBe(0);
      expect(history).toEqual([]);
      expect(stats.total).toBe(0);
    });

    it('should emit user.reset event', async (): Promise<void> => {
      const emitSpy = jest.spyOn(pointsModule.eventManager, 'emitAsync');

      await pointsModule.award('user123', 500);
      await pointsModule.resetUser('user123');

      expect(emitSpy).toHaveBeenCalledWith('points.user.reset', expect.objectContaining({
        module: 'points',
        userId: 'user123'
      }));
    });
  });

  describe('event listeners', (): void => {
    let isolatedStorage;
    let isolatedEventManager;
    let isolatedModule;

    beforeEach(async () => {
      isolatedStorage = new MemoryStorage();
      isolatedEventManager = new EventManager();
      await isolatedStorage.connect();
      
      isolatedModule = new PointsModule({});
      isolatedModule.setContext({
        storage: isolatedStorage,
        eventManager: isolatedEventManager,
        logger,
        config: {}
      });
      await isolatedModule.initialize();
    });

    afterEach(async () => {
      await isolatedStorage.disconnect();
    });

    it('should award points on points.award event', async (): Promise<void> => {
      // Event listeners are already set up in initialize()
      await isolatedEventManager.emitAsync('points.award', {
        userId: 'newuser',
        points: 100,
        reason: 'signup bonus'
      });

      const balance = await isolatedModule.getPoints('newuser');
      expect(balance).toBe(100);
    });

    it('should deduct points on points.deduct event', async (): Promise<void> => {
      await isolatedModule.award('user123', 500);
      // Event listeners are already set up in initialize()
      
      await isolatedEventManager.emitAsync('points.deduct', {
        userId: 'user123',
        points: 100,
        reason: 'penalty'
      });

      const balance = await isolatedModule.getPoints('user123');
      expect(balance).toBe(400);
    });
  });

  describe('error handling', (): void => {
    it('should handle storage errors gracefully', async (): Promise<void> => {
      storage.hincrby = jest.fn().mockRejectedValue(new Error('Storage error'));

      await expect(
        pointsModule.award('user123', 100)
      ).rejects.toThrow('Storage error');
    });

    it('should validate point amounts', async (): Promise<void> => {
      await expect(
        pointsModule.award('user123', 0)
      ).rejects.toThrow('must be a positive number');

      await expect(
        pointsModule.award('user123', -10)
      ).rejects.toThrow('must be a positive number');

      await expect(
        pointsModule.award('user123', NaN)
      ).rejects.toThrow('must be a number');

      await expect(
        pointsModule.award('user123', Infinity)
      ).rejects.toThrow('must be a finite number');
    });

    it('should validate user IDs', async (): Promise<void> => {
      await expect(
        pointsModule.award('', 100)
      ).rejects.toThrow('User ID is required');

      await expect(
        pointsModule.award(null, 100)
      ).rejects.toThrow();
    });
  });
});