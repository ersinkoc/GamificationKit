import { jest } from '@jest/globals';
import { PointsModule } from '../../../src/modules/PointsModule.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { EventManager } from '../../../src/core/EventManager.js';
import { Logger } from '../../../src/utils/logger.js';

describe('PointsModule', () => {
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
        weekend: 2,
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
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const module = new PointsModule();
      expect(module.name).toBe('points');
      expect(module.config).toBeUndefined(); // config is set during initialization
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

  describe('award', () => {
    it('should award points to user', async () => {
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

    it('should apply multipliers', async () => {
      const result = await pointsModule.award('user123', 100, 'first');

      expect(result.transaction.multiplier).toBe(1.5);
      expect(result.points).toBe(150);
      expect(result.total).toBe(150);
    });

    it('should stack multipliers', async () => {
      // Mock it to be weekend
      const originalGetDay = Date.prototype.getDay;
      Date.prototype.getDay = jest.fn().mockReturnValue(0); // Sunday

      const result = await pointsModule.award('user123', 100, 'first');

      expect(result.transaction.multiplier).toBe(3); // 2 * 1.5
      expect(result.points).toBe(300);

      Date.prototype.getDay = originalGetDay;
    });

    it('should respect daily limits', async () => {
      await pointsModule.award('user123', 800);
      
      const result = await pointsModule.award('user123', 300);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('daily_limit_exceeded');
      expect(result.limit).toBe(1000);
      expect(result.current).toBe(800);
    });

    it('should emit points.awarded event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      const result = await pointsModule.award('user123', 100, 'achievement');

      expect(emitSpy).toHaveBeenCalledWith('points.awarded', {
        userId: 'user123',
        points: 100,
        total: 100,
        transaction: result.transaction
      });
    });

    it('should award multiple times', async () => {
      const result1 = await pointsModule.award('user123', 500);
      const result2 = await pointsModule.award('user123', 500);

      expect(result1.total).toBe(500);
      expect(result2.total).toBe(1000);
      
      const balance = await pointsModule.getPoints('user123');
      expect(balance).toBe(1000);
    });

    it('should record transaction history', async () => {
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

    it('should handle concurrent awards', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(pointsModule.award('user123', 10));
      }

      await Promise.all(promises);

      const balance = await pointsModule.getPoints('user123');
      expect(balance).toBe(100);
    });

  });

  describe('deduct', () => {
    beforeEach(async () => {
      await pointsModule.award('user123', 500);
    });

    it('should deduct points', async () => {
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

    it('should fail if insufficient balance', async () => {
      const result = await pointsModule.deduct('user123', 600);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('insufficient_points');
      expect(result.current).toBe(500);
      expect(result.required).toBe(600);
    });

    it('should emit points.deducted event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      const result = await pointsModule.deduct('user123', 200, 'redemption');

      expect(emitSpy).toHaveBeenCalledWith('points.deducted', {
        userId: 'user123',
        points: 200,
        total: 300,
        transaction: result.transaction
      });
    });

    it('should record deduction in history', async () => {
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

  describe('getPoints', () => {
    it('should return current points', async () => {
      await pointsModule.award('user123', 250);
      
      const points = await pointsModule.getPoints('user123');
      expect(points).toBe(250);
    });

    it('should return 0 for new user', async () => {
      const points = await pointsModule.getPoints('newuser');
      expect(points).toBe(0);
    });
  });

  describe('getTopUsers', () => {
    beforeEach(async () => {
      await pointsModule.award('user1', 1000);
      await pointsModule.award('user2', 2000);
      await pointsModule.award('user3', 1500);
      await pointsModule.award('user4', 500);
      await pointsModule.award('user5', 3000);
    });

    it('should return top users', async () => {
      const topUsers = await pointsModule.getTopUsers(3);

      expect(topUsers).toEqual([
        { userId: 'user5', points: 3000, rank: 1 },
        { userId: 'user2', points: 2000, rank: 2 },
        { userId: 'user3', points: 1500, rank: 3 }
      ]);
    });

    it('should support different periods', async () => {
      const weekly = await pointsModule.getTopUsers(3, 'weekly');
      // Should return same results as all data is recent
      expect(weekly.length).toBeGreaterThan(0);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return transaction history', async () => {
      await pointsModule.award('user123', 100, 'signup');
      await pointsModule.award('user123', 200, 'purchase');
      await pointsModule.deduct('user123', 50, 'redemption');

      const history = await pointsModule.getTransactionHistory('user123');

      expect(history).toHaveLength(3);
      expect(history[0].reason).toBe('redemption'); // Most recent first
      expect(history[1].reason).toBe('purchase');
      expect(history[2].reason).toBe('signup');
    });

    it('should limit history results', async () => {
      for (let i = 0; i < 20; i++) {
        await pointsModule.award('user123', 10);
      }

      const history = await pointsModule.getTransactionHistory('user123', 10);
      expect(history).toHaveLength(10);
    });
  });

  describe('getUserRank', () => {
    beforeEach(async () => {
      await pointsModule.award('user1', 1000);
      await pointsModule.award('user2', 2000);
      await pointsModule.award('user3', 1500);
    });

    it('should return user rank', async () => {
      const rank1 = await pointsModule.getUserRank('user2');
      const rank2 = await pointsModule.getUserRank('user3');
      const rank3 = await pointsModule.getUserRank('user1');

      expect(rank1).toEqual({
        userId: 'user2',
        rank: 1,
        points: 2000
      });
      expect(rank2.rank).toBe(2);
      expect(rank3.rank).toBe(3);
    });

    it('should return null for non-existent user', async () => {
      const rank = await pointsModule.getUserRank('nonexistent');
      expect(rank).toBeNull();
    });
  });

  describe('multipliers', () => {
    it('should set user multiplier', async () => {
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

    it('should set event multiplier', async () => {
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

  describe('limits', () => {
    it('should enforce daily limits', async () => {
      const result1 = await pointsModule.award('user123', 800);
      expect(result1.success).toBe(true);

      const result2 = await pointsModule.award('user123', 300);
      expect(result2.success).toBe(false);
      expect(result2.reason).toBe('daily_limit_exceeded');
      expect(result2.limit).toBe(1000);
    });

    it('should check period limits', async () => {
      const result = await pointsModule.checkLimits('user123', 100);
      expect(result.allowed).toBe(true);

      // Exceed daily limit
      await pointsModule.award('user123', 950);
      const limitCheck = await pointsModule.checkLimits('user123', 100);
      expect(limitCheck.allowed).toBe(false);
      expect(limitCheck.reason).toBe('daily_limit_exceeded');
    });
  });

  describe('decay', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should process decay after interval', async () => {
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

    it('should not decay if no recent activity', async () => {
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

  describe('getUserStats', () => {
    it('should return comprehensive stats', async () => {
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

  describe('resetUser', () => {
    it('should reset all user data', async () => {
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

    it('should emit user.reset event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      await pointsModule.award('user123', 500);
      await pointsModule.resetUser('user123');

      expect(emitSpy).toHaveBeenCalledWith('points.user.reset', {
        userId: 'user123'
      });
    });
  });

  describe('event listeners', () => {
    it('should award points on points.award event', async () => {
      pointsModule.setupEventListeners();

      await eventManager.emit('points.award', {
        data: {
          userId: 'newuser',
          points: 100,
          reason: 'signup bonus'
        }
      });

      const balance = await pointsModule.getPoints('newuser');
      expect(balance).toBe(100);
    });

    it('should deduct points on points.deduct event', async () => {
      await pointsModule.award('user123', 500);
      pointsModule.setupEventListeners();

      await eventManager.emit('points.deduct', {
        data: {
          userId: 'user123',
          points: 100,
          reason: 'penalty'
        }
      });

      const balance = await pointsModule.getPoints('user123');
      expect(balance).toBe(400);
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      storage.hincrby = jest.fn().mockRejectedValue(new Error('Storage error'));

      await expect(
        pointsModule.award('user123', 100)
      ).rejects.toThrow('Storage error');
    });

    it('should validate point amounts', async () => {
      await expect(
        pointsModule.award('user123', 0)
      ).rejects.toThrow('must be greater than 0');

      await expect(
        pointsModule.award('user123', -10)
      ).rejects.toThrow('must be greater than 0');

      await expect(
        pointsModule.award('user123', NaN)
      ).rejects.toThrow();

      await expect(
        pointsModule.award('user123', Infinity)
      ).rejects.toThrow();
    });

    it('should validate user IDs', async () => {
      await expect(
        pointsModule.award('', 100)
      ).rejects.toThrow('User ID is required');

      await expect(
        pointsModule.award(null, 100)
      ).rejects.toThrow();
    });
  });
});