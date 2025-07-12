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
      multipliers: {
        weekend: { value: 2, condition: () => false },
        firstTime: { value: 1.5, condition: (userId, action) => action === 'first' }
      },
      limits: {
        daily: 1000,
        weekly: 5000,
        monthly: 20000
      },
      decay: {
        enabled: true,
        rate: 0.1,
        interval: 30 * 24 * 60 * 60 * 1000 // 30 days
      }
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
      expect(module.options.multipliers).toEqual({});
      expect(module.options.limits).toEqual({});
      expect(module.options.decay.enabled).toBe(false);
    });

    it('should accept custom options', () => {
      const module = new PointsModule({
        multipliers: { double: { value: 2 } },
        limits: { daily: 500 }
      });
      
      expect(module.options.multipliers.double.value).toBe(2);
      expect(module.options.limits.daily).toBe(500);
    });
  });

  describe('award', () => {
    it('should award points to user', async () => {
      const result = await pointsModule.award('user123', 100, {
        reason: 'test award'
      });

      expect(result).toEqual({
        userId: 'user123',
        points: 100,
        newBalance: 100,
        multiplier: 1,
        timestamp: expect.any(Date)
      });

      const balance = await pointsModule.getBalance('user123');
      expect(balance).toBe(100);
    });

    it('should apply multipliers', async () => {
      const result = await pointsModule.award('user123', 100, {
        reason: 'first time bonus',
        action: 'first'
      });

      expect(result.multiplier).toBe(1.5);
      expect(result.points).toBe(150);
      expect(result.newBalance).toBe(150);
    });

    it('should stack multipliers', async () => {
      // Override weekend multiplier condition
      pointsModule.options.multipliers.weekend.condition = () => true;

      const result = await pointsModule.award('user123', 100, {
        action: 'first'
      });

      expect(result.multiplier).toBe(3); // 2 * 1.5
      expect(result.points).toBe(300);
    });

    it('should respect daily limits', async () => {
      await pointsModule.award('user123', 800);
      
      const result = await pointsModule.award('user123', 300);
      
      expect(result.points).toBe(200); // Limited to 1000 daily
      expect(result.limited).toBe(true);
      expect(result.limitType).toBe('daily');
    });

    it('should emit points.awarded event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      await pointsModule.award('user123', 100, {
        reason: 'achievement'
      });

      expect(emitSpy).toHaveBeenCalledWith('points.awarded', {
        userId: 'user123',
        points: 100,
        newBalance: 100,
        reason: 'achievement',
        multiplier: 1,
        timestamp: expect.any(Date)
      });
    });

    it('should check for milestones', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      await pointsModule.award('user123', 500);
      await pointsModule.award('user123', 500);

      expect(emitSpy).toHaveBeenCalledWith('points.milestone', {
        userId: 'user123',
        milestone: 1000,
        balance: 1000,
        timestamp: expect.any(Date)
      });
    });

    it('should record transaction history', async () => {
      await pointsModule.award('user123', 100, { reason: 'test' });
      
      const history = await pointsModule.getHistory('user123');
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        type: 'award',
        points: 100,
        balance: 100,
        reason: 'test',
        metadata: {},
        timestamp: expect.any(Date)
      });
    });

    it('should handle negative points (deduct)', async () => {
      await pointsModule.award('user123', 500);
      
      const result = await pointsModule.award('user123', -200, {
        reason: 'penalty'
      });

      expect(result.points).toBe(-200);
      expect(result.newBalance).toBe(300);
    });

    it('should not allow balance to go negative', async () => {
      await pointsModule.award('user123', 100);
      
      const result = await pointsModule.award('user123', -200);

      expect(result.points).toBe(-100);
      expect(result.newBalance).toBe(0);
    });

    it('should handle concurrent awards', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(pointsModule.award('user123', 10));
      }

      await Promise.all(promises);

      const balance = await pointsModule.getBalance('user123');
      expect(balance).toBe(100);
    });
  });

  describe('deduct', () => {
    beforeEach(async () => {
      await pointsModule.award('user123', 500);
    });

    it('should deduct points', async () => {
      const result = await pointsModule.deduct('user123', 200, {
        reason: 'purchase'
      });

      expect(result.success).toBe(true);
      expect(result.points).toBe(-200);
      expect(result.newBalance).toBe(300);
    });

    it('should fail if insufficient balance', async () => {
      const result = await pointsModule.deduct('user123', 600);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient balance');
      expect(result.currentBalance).toBe(500);
      expect(result.requested).toBe(600);
    });

    it('should emit points.deducted event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      await pointsModule.deduct('user123', 200, {
        reason: 'redemption'
      });

      expect(emitSpy).toHaveBeenCalledWith('points.deducted', {
        userId: 'user123',
        points: 200,
        newBalance: 300,
        reason: 'redemption',
        timestamp: expect.any(Date)
      });
    });

    it('should record deduction in history', async () => {
      await pointsModule.deduct('user123', 200, {
        reason: 'spent',
        orderId: '12345'
      });

      const history = await pointsModule.getHistory('user123');
      const deduction = history.find(h => h.type === 'deduct');

      expect(deduction).toEqual({
        type: 'deduct',
        points: -200,
        balance: 300,
        reason: 'spent',
        metadata: { orderId: '12345' },
        timestamp: expect.any(Date)
      });
    });
  });

  describe('transfer', () => {
    beforeEach(async () => {
      await pointsModule.award('user123', 500);
      await pointsModule.award('user456', 100);
    });

    it('should transfer points between users', async () => {
      const result = await pointsModule.transfer('user123', 'user456', 200);

      expect(result.success).toBe(true);
      expect(result.fromBalance).toBe(300);
      expect(result.toBalance).toBe(300);

      const balance1 = await pointsModule.getBalance('user123');
      const balance2 = await pointsModule.getBalance('user456');

      expect(balance1).toBe(300);
      expect(balance2).toBe(300);
    });

    it('should fail if insufficient balance', async () => {
      const result = await pointsModule.transfer('user123', 'user456', 600);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient balance');
    });

    it('should emit transfer event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      await pointsModule.transfer('user123', 'user456', 200, {
        reason: 'gift'
      });

      expect(emitSpy).toHaveBeenCalledWith('points.transferred', {
        from: 'user123',
        to: 'user456',
        points: 200,
        fromBalance: 300,
        toBalance: 300,
        reason: 'gift',
        timestamp: expect.any(Date)
      });
    });

    it('should record transfer in both histories', async () => {
      await pointsModule.transfer('user123', 'user456', 200, {
        reason: 'payment'
      });

      const history1 = await pointsModule.getHistory('user123');
      const history2 = await pointsModule.getHistory('user456');

      const sent = history1.find(h => h.type === 'transfer_sent');
      const received = history2.find(h => h.type === 'transfer_received');

      expect(sent).toBeDefined();
      expect(sent.points).toBe(-200);
      expect(sent.metadata.to).toBe('user456');

      expect(received).toBeDefined();
      expect(received.points).toBe(200);
      expect(received.metadata.from).toBe('user123');
    });

    it('should be atomic', async () => {
      // Mock storage to fail on second operation
      const originalZincrby = storage.zincrby.bind(storage);
      let callCount = 0;
      storage.zincrby = jest.fn(async (...args) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Storage error');
        }
        return originalZincrby(...args);
      });

      const result = await pointsModule.transfer('user123', 'user456', 200);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Storage error');

      // Balances should remain unchanged
      const balance1 = await pointsModule.getBalance('user123');
      const balance2 = await pointsModule.getBalance('user456');

      expect(balance1).toBe(500);
      expect(balance2).toBe(100);
    });
  });

  describe('getBalance', () => {
    it('should return current balance', async () => {
      await pointsModule.award('user123', 250);
      
      const balance = await pointsModule.getBalance('user123');
      expect(balance).toBe(250);
    });

    it('should return 0 for new user', async () => {
      const balance = await pointsModule.getBalance('newuser');
      expect(balance).toBe(0);
    });

    it('should apply decay if enabled', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);

      await pointsModule.award('user123', 1000);

      // Fast forward 31 days
      jest.setSystemTime(now + 31 * 24 * 60 * 60 * 1000);

      const balance = await pointsModule.getBalance('user123');
      expect(balance).toBe(900); // 10% decay

      jest.useRealTimers();
    });
  });

  describe('getHistory', () => {
    it('should return transaction history', async () => {
      await pointsModule.award('user123', 100, { reason: 'signup' });
      await pointsModule.award('user123', 200, { reason: 'purchase' });
      await pointsModule.deduct('user123', 50, { reason: 'redemption' });

      const history = await pointsModule.getHistory('user123');

      expect(history).toHaveLength(3);
      expect(history[0].reason).toBe('signup');
      expect(history[1].reason).toBe('purchase');
      expect(history[2].reason).toBe('redemption');
    });

    it('should limit history results', async () => {
      for (let i = 0; i < 20; i++) {
        await pointsModule.award('user123', 10);
      }

      const history = await pointsModule.getHistory('user123', 10);
      expect(history).toHaveLength(10);
    });

    it('should filter history by type', async () => {
      await pointsModule.award('user123', 100);
      await pointsModule.deduct('user123', 50);
      await pointsModule.award('user123', 200);

      const awards = await pointsModule.getHistory('user123', 100, 'award');
      expect(awards).toHaveLength(2);
      expect(awards.every(h => h.type === 'award')).toBe(true);
    });
  });

  describe('getLeaderboard', () => {
    beforeEach(async () => {
      await pointsModule.award('user1', 1000);
      await pointsModule.award('user2', 2000);
      await pointsModule.award('user3', 1500);
      await pointsModule.award('user4', 500);
      await pointsModule.award('user5', 3000);
    });

    it('should return top users', async () => {
      const leaderboard = await pointsModule.getLeaderboard({ limit: 3 });

      expect(leaderboard).toEqual([
        { userId: 'user5', points: 3000, rank: 1 },
        { userId: 'user2', points: 2000, rank: 2 },
        { userId: 'user3', points: 1500, rank: 3 }
      ]);
    });

    it('should support pagination', async () => {
      const page2 = await pointsModule.getLeaderboard({ 
        limit: 2, 
        offset: 2 
      });

      expect(page2).toEqual([
        { userId: 'user3', points: 1500, rank: 3 },
        { userId: 'user1', points: 1000, rank: 4 }
      ]);
    });

    it('should include user rank if requested', async () => {
      const leaderboard = await pointsModule.getLeaderboard({ 
        limit: 3,
        includeUser: 'user4'
      });

      expect(leaderboard.user).toEqual({
        userId: 'user4',
        points: 500,
        rank: 5
      });
    });

    it('should handle time-based leaderboards', async () => {
      // This would require mocking time-based storage keys
      const weekly = await pointsModule.getLeaderboard({ 
        period: 'weekly',
        limit: 3
      });

      // For this test, it should return empty as we haven't set up weekly data
      expect(weekly).toEqual([]);
    });
  });

  describe('getRank', () => {
    beforeEach(async () => {
      await pointsModule.award('user1', 1000);
      await pointsModule.award('user2', 2000);
      await pointsModule.award('user3', 1500);
    });

    it('should return user rank', async () => {
      const rank1 = await pointsModule.getRank('user2');
      const rank2 = await pointsModule.getRank('user3');
      const rank3 = await pointsModule.getRank('user1');

      expect(rank1).toBe(1);
      expect(rank2).toBe(2);
      expect(rank3).toBe(3);
    });

    it('should return null for non-existent user', async () => {
      const rank = await pointsModule.getRank('nonexistent');
      expect(rank).toBeNull();
    });
  });

  describe('limits', () => {
    it('should enforce daily limits', async () => {
      const result1 = await pointsModule.award('user123', 800);
      expect(result1.limited).toBeFalsy();

      const result2 = await pointsModule.award('user123', 300);
      expect(result2.points).toBe(200);
      expect(result2.limited).toBe(true);
      expect(result2.limitType).toBe('daily');
    });

    it('should enforce weekly limits', async () => {
      // Award daily limit for 5 days
      for (let i = 0; i < 5; i++) {
        await pointsModule.award('user123', 1000);
        // Simulate next day
        const key = `points:limits:daily:user123`;
        await storage.delete(key);
      }

      const result = await pointsModule.award('user123', 100);
      expect(result.limited).toBe(true);
      expect(result.limitType).toBe('weekly');
      expect(result.points).toBe(0);
    });

    it('should reset limits after period', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);

      await pointsModule.award('user123', 1000);

      // Next day
      jest.setSystemTime(now + 24 * 60 * 60 * 1000);

      const result = await pointsModule.award('user123', 500);
      expect(result.limited).toBeFalsy();
      expect(result.points).toBe(500);

      jest.useRealTimers();
    });
  });

  describe('decay', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should apply decay after interval', async () => {
      const now = Date.now();
      jest.setSystemTime(now);

      await pointsModule.award('user123', 1000);

      // Fast forward 31 days
      jest.setSystemTime(now + 31 * 24 * 60 * 60 * 1000);

      await pointsModule.applyDecay('user123');

      const balance = await pointsModule.getBalance('user123');
      expect(balance).toBe(900);
    });

    it('should not apply decay before interval', async () => {
      const now = Date.now();
      jest.setSystemTime(now);

      await pointsModule.award('user123', 1000);

      // Fast forward 29 days
      jest.setSystemTime(now + 29 * 24 * 60 * 60 * 1000);

      await pointsModule.applyDecay('user123');

      const balance = await pointsModule.getBalance('user123');
      expect(balance).toBe(1000);
    });

    it('should emit decay event', async () => {
      const now = Date.now();
      jest.setSystemTime(now);

      await pointsModule.award('user123', 1000);

      jest.setSystemTime(now + 31 * 24 * 60 * 60 * 1000);

      const emitSpy = jest.spyOn(eventManager, 'emit');
      await pointsModule.applyDecay('user123');

      expect(emitSpy).toHaveBeenCalledWith('points.decayed', {
        userId: 'user123',
        amount: 100,
        newBalance: 900,
        rate: 0.1,
        timestamp: expect.any(Date)
      });
    });

    it('should record decay in history', async () => {
      const now = Date.now();
      jest.setSystemTime(now);

      await pointsModule.award('user123', 1000);

      jest.setSystemTime(now + 31 * 24 * 60 * 60 * 1000);

      await pointsModule.applyDecay('user123');

      const history = await pointsModule.getHistory('user123');
      const decayEntry = history.find(h => h.type === 'decay');

      expect(decayEntry).toBeDefined();
      expect(decayEntry.points).toBe(-100);
    });
  });

  describe('getUserStats', () => {
    it('should return comprehensive stats', async () => {
      await pointsModule.award('user123', 100, { reason: 'signup' });
      await pointsModule.award('user123', 200, { reason: 'purchase' });
      await pointsModule.deduct('user123', 50, { reason: 'redemption' });

      const stats = await pointsModule.getUserStats('user123');

      expect(stats).toEqual({
        current: 250,
        total: 300,
        spent: 50,
        rank: expect.any(Number),
        history: expect.any(Array),
        limits: {
          daily: { used: 300, limit: 1000, remaining: 700 },
          weekly: { used: 300, limit: 5000, remaining: 4700 },
          monthly: { used: 300, limit: 20000, remaining: 19700 }
        },
        lastDecay: null
      });
    });
  });

  describe('resetUser', () => {
    it('should reset all user data', async () => {
      await pointsModule.award('user123', 500);
      await pointsModule.award('user123', 300);

      await pointsModule.resetUser('user123');

      const balance = await pointsModule.getBalance('user123');
      const history = await pointsModule.getHistory('user123');
      const stats = await pointsModule.getUserStats('user123');

      expect(balance).toBe(0);
      expect(history).toEqual([]);
      expect(stats.total).toBe(0);
    });

    it('should emit reset event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      await pointsModule.award('user123', 500);
      await pointsModule.resetUser('user123');

      expect(emitSpy).toHaveBeenCalledWith('points.reset', {
        userId: 'user123',
        previousBalance: 500,
        timestamp: expect.any(Date)
      });
    });
  });

  describe('event listeners', () => {
    it('should award points on custom events', async () => {
      pointsModule.setupEventListeners();

      eventManager.on('user.signup', async (data) => {
        await pointsModule.award(data.userId, 100, { reason: 'signup bonus' });
      });

      await eventManager.emit('user.signup', { userId: 'newuser' });

      const balance = await pointsModule.getBalance('newuser');
      expect(balance).toBe(100);
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      storage.zincrby = jest.fn().mockRejectedValue(new Error('Storage error'));

      await expect(
        pointsModule.award('user123', 100)
      ).rejects.toThrow('Storage error');
    });

    it('should validate point amounts', async () => {
      await expect(
        pointsModule.award('user123', -0)
      ).resolves.not.toThrow();

      await expect(
        pointsModule.award('user123', NaN)
      ).rejects.toThrow();

      await expect(
        pointsModule.award('user123', Infinity)
      ).rejects.toThrow();
    });
  });
});