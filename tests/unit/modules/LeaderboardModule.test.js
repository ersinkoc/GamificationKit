import { jest } from '@jest/globals';
import { LeaderboardModule } from '../../../src/modules/LeaderboardModule.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { EventManager } from '../../../src/core/EventManager.js';
import { Logger } from '../../../src/utils/logger.js';

describe('LeaderboardModule', () => {
  let leaderboardModule;
  let storage;
  let eventManager;
  let logger;

  beforeEach(async () => {
    storage = new MemoryStorage();
    eventManager = new EventManager();
    logger = new Logger({ prefix: 'LeaderboardModule' });
    await storage.connect();

    leaderboardModule = new LeaderboardModule({
      updateInterval: 100,
      enableWeekly: true,
      enableMonthly: true,
      maxEntries: 100
    });

    leaderboardModule.setContext({
      storage,
      eventManager,
      logger,
      config: {}
    });
    
    await leaderboardModule.initialize();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const module = new LeaderboardModule();
      expect(module.name).toBe('leaderboard');
      expect(module.options.updateInterval).toBe(60000);
      expect(module.options.enableWeekly).toBe(true);
      expect(module.options.enableMonthly).toBe(true);
      expect(module.options.maxEntries).toBe(1000);
    });

    it('should accept custom options', () => {
      const module = new LeaderboardModule({
        updateInterval: 5000,
        enableWeekly: false,
        maxEntries: 50
      });
      
      expect(module.options.updateInterval).toBe(5000);
      expect(module.options.enableWeekly).toBe(false);
      expect(module.options.maxEntries).toBe(50);
    });
  });

  describe('update', () => {
    it('should update user score on leaderboard', async () => {
      const result = await leaderboardModule.update('user123', 100);
      
      expect(result).toEqual({
        userId: 'user123',
        score: 100,
        rank: 1,
        previousRank: null,
        timestamp: expect.any(Date)
      });
    });

    it('should handle score increments', async () => {
      await leaderboardModule.update('user123', 100);
      const result = await leaderboardModule.update('user123', 50, { increment: true });
      
      expect(result.score).toBe(150);
      expect(result.rank).toBe(1);
    });

    it('should update rankings correctly', async () => {
      await leaderboardModule.update('user1', 300);
      await leaderboardModule.update('user2', 200);
      await leaderboardModule.update('user3', 400);
      
      const lb = await leaderboardModule.getLeaderboard({ limit: 3 });
      
      expect(lb[0].userId).toBe('user3');
      expect(lb[1].userId).toBe('user1');
      expect(lb[2].userId).toBe('user2');
    });

    it('should track previous rank', async () => {
      await leaderboardModule.update('user1', 100);
      await leaderboardModule.update('user2', 200);
      
      const result = await leaderboardModule.update('user1', 300);
      
      expect(result.previousRank).toBe(2);
      expect(result.rank).toBe(1);
    });

    it('should emit leaderboard.updated event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await leaderboardModule.update('user123', 100);
      
      expect(emitSpy).toHaveBeenCalledWith('leaderboard.updated', {
        userId: 'user123',
        score: 100,
        rank: 1,
        previousRank: null,
        timestamp: expect.any(Date)
      });
    });

    it('should emit rank.changed event when rank changes', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await leaderboardModule.update('user1', 100);
      await leaderboardModule.update('user2', 200);
      await leaderboardModule.update('user1', 300);
      
      expect(emitSpy).toHaveBeenCalledWith('rank.changed', {
        userId: 'user1',
        previousRank: 2,
        newRank: 1,
        score: 300
      });
    });

    it('should update weekly and monthly boards', async () => {
      await leaderboardModule.update('user123', 100);
      
      const weekly = await leaderboardModule.getLeaderboard({ period: 'weekly', limit: 1 });
      const monthly = await leaderboardModule.getLeaderboard({ period: 'monthly', limit: 1 });
      
      expect(weekly[0].userId).toBe('user123');
      expect(monthly[0].userId).toBe('user123');
    });

    it('should respect maxEntries limit', async () => {
      leaderboardModule.options.maxEntries = 3;
      
      await leaderboardModule.update('user1', 100);
      await leaderboardModule.update('user2', 200);
      await leaderboardModule.update('user3', 300);
      await leaderboardModule.update('user4', 50);
      
      const lb = await leaderboardModule.getLeaderboard({ limit: 10 });
      expect(lb).toHaveLength(3);
      expect(lb.map(e => e.userId)).not.toContain('user4');
    });
  });

  describe('getLeaderboard', () => {
    beforeEach(async () => {
      await leaderboardModule.update('user1', 500);
      await leaderboardModule.update('user2', 300);
      await leaderboardModule.update('user3', 700);
      await leaderboardModule.update('user4', 400);
      await leaderboardModule.update('user5', 600);
    });

    it('should return top users', async () => {
      const lb = await leaderboardModule.getLeaderboard({ limit: 3 });
      
      expect(lb).toEqual([
        { userId: 'user3', score: 700, rank: 1 },
        { userId: 'user5', score: 600, rank: 2 },
        { userId: 'user1', score: 500, rank: 3 }
      ]);
    });

    it('should support pagination', async () => {
      const page1 = await leaderboardModule.getLeaderboard({ limit: 2, offset: 0 });
      const page2 = await leaderboardModule.getLeaderboard({ limit: 2, offset: 2 });
      
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].rank).toBe(1);
      expect(page2[0].rank).toBe(3);
    });

    it('should include specific user if requested', async () => {
      const result = await leaderboardModule.getLeaderboard({ 
        limit: 3, 
        includeUser: 'user4' 
      });
      
      expect(result.user).toEqual({
        userId: 'user4',
        score: 400,
        rank: 4
      });
    });

    it('should return nearby users', async () => {
      const nearby = await leaderboardModule.getNearbyUsers('user1', 1);
      
      expect(nearby).toHaveLength(3);
      expect(nearby[0].userId).toBe('user5');
      expect(nearby[1].userId).toBe('user1');
      expect(nearby[2].userId).toBe('user4');
    });

    it('should handle weekly leaderboard', async () => {
      const weekly = await leaderboardModule.getLeaderboard({ 
        period: 'weekly',
        limit: 5 
      });
      
      expect(weekly).toHaveLength(5);
      expect(weekly[0].userId).toBe('user3');
    });

    it('should handle monthly leaderboard', async () => {
      const monthly = await leaderboardModule.getLeaderboard({ 
        period: 'monthly',
        limit: 5 
      });
      
      expect(monthly).toHaveLength(5);
      expect(monthly[0].userId).toBe('user3');
    });

    it('should return empty array for future periods', async () => {
      const future = await leaderboardModule.getLeaderboard({ 
        period: 'custom',
        startDate: new Date(Date.now() + 86400000),
        limit: 10
      });
      
      expect(future).toEqual([]);
    });
  });

  describe('getRank', () => {
    beforeEach(async () => {
      await leaderboardModule.update('user1', 300);
      await leaderboardModule.update('user2', 200);
      await leaderboardModule.update('user3', 400);
    });

    it('should return user rank', async () => {
      const rank1 = await leaderboardModule.getRank('user3');
      const rank2 = await leaderboardModule.getRank('user1');
      const rank3 = await leaderboardModule.getRank('user2');
      
      expect(rank1).toBe(1);
      expect(rank2).toBe(2);
      expect(rank3).toBe(3);
    });

    it('should return null for non-existent user', async () => {
      const rank = await leaderboardModule.getRank('nonexistent');
      expect(rank).toBeNull();
    });

    it('should handle period-specific ranks', async () => {
      const weeklyRank = await leaderboardModule.getRank('user1', 'weekly');
      expect(weeklyRank).toBe(2);
    });
  });

  describe('getScore', () => {
    it('should return user score', async () => {
      await leaderboardModule.update('user123', 500);
      
      const score = await leaderboardModule.getScore('user123');
      expect(score).toBe(500);
    });

    it('should return 0 for non-existent user', async () => {
      const score = await leaderboardModule.getScore('nonexistent');
      expect(score).toBe(0);
    });
  });

  describe('remove', () => {
    beforeEach(async () => {
      await leaderboardModule.update('user123', 500);
    });

    it('should remove user from leaderboard', async () => {
      const result = await leaderboardModule.remove('user123');
      
      expect(result.success).toBe(true);
      expect(result.removedFrom).toContain('all');
      
      const rank = await leaderboardModule.getRank('user123');
      expect(rank).toBeNull();
    });

    it('should remove from all periods', async () => {
      const result = await leaderboardModule.remove('user123');
      
      expect(result.removedFrom).toContain('all');
      expect(result.removedFrom).toContain('weekly');
      expect(result.removedFrom).toContain('monthly');
    });

    it('should emit leaderboard.removed event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await leaderboardModule.remove('user123');
      
      expect(emitSpy).toHaveBeenCalledWith('leaderboard.removed', {
        userId: 'user123',
        removedFrom: expect.any(Array),
        timestamp: expect.any(Date)
      });
    });

    it('should handle removing non-existent user', async () => {
      const result = await leaderboardModule.remove('nonexistent');
      
      expect(result.success).toBe(true);
      expect(result.removedFrom).toEqual([]);
    });
  });

  describe('reset', () => {
    beforeEach(async () => {
      await leaderboardModule.update('user1', 100);
      await leaderboardModule.update('user2', 200);
      await leaderboardModule.update('user3', 300);
    });

    it('should reset specific period', async () => {
      const result = await leaderboardModule.reset('all');
      
      expect(result.success).toBe(true);
      expect(result.period).toBe('all');
      expect(result.entriesCleared).toBe(3);
      
      const lb = await leaderboardModule.getLeaderboard({ limit: 10 });
      expect(lb).toEqual([]);
    });

    it('should reset weekly leaderboard', async () => {
      const result = await leaderboardModule.reset('weekly');
      
      expect(result.period).toBe('weekly');
      
      const weekly = await leaderboardModule.getLeaderboard({ period: 'weekly' });
      expect(weekly).toEqual([]);
      
      const all = await leaderboardModule.getLeaderboard({ period: 'all' });
      expect(all).toHaveLength(3);
    });

    it('should emit leaderboard.reset event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await leaderboardModule.reset('all');
      
      expect(emitSpy).toHaveBeenCalledWith('leaderboard.reset', {
        period: 'all',
        entriesCleared: 3,
        timestamp: expect.any(Date)
      });
    });
  });

  describe('getBrackets', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 10; i++) {
        await leaderboardModule.update(`user${i}`, i * 100);
      }
    });

    it('should return score brackets', async () => {
      const brackets = await leaderboardModule.getBrackets({ 
        brackets: [300, 600, 900] 
      });
      
      expect(brackets).toEqual({
        '0-300': 3,
        '300-600': 3,
        '600-900': 3,
        '900+': 1
      });
    });

    it('should handle percentile brackets', async () => {
      const brackets = await leaderboardModule.getBrackets({ 
        percentiles: [25, 50, 75] 
      });
      
      expect(brackets).toHaveProperty('0-25%');
      expect(brackets).toHaveProperty('25-50%');
      expect(brackets).toHaveProperty('50-75%');
      expect(brackets).toHaveProperty('75-100%');
    });
  });

  describe('getUserStats', () => {
    beforeEach(async () => {
      await leaderboardModule.update('user123', 500);
      await leaderboardModule.update('user456', 600);
      await leaderboardModule.update('user789', 400);
    });

    it('should return comprehensive user stats', async () => {
      const stats = await leaderboardModule.getUserStats('user123');
      
      expect(stats).toEqual({
        all: {
          score: 500,
          rank: 2,
          percentile: expect.any(Number),
          total: 3
        },
        weekly: {
          score: 500,
          rank: 2,
          percentile: expect.any(Number),
          total: 3
        },
        monthly: {
          score: 500,
          rank: 2,
          percentile: expect.any(Number),
          total: 3
        }
      });
      
      expect(stats.all.percentile).toBeCloseTo(66.67, 1);
    });

    it('should handle user not on leaderboard', async () => {
      const stats = await leaderboardModule.getUserStats('nonexistent');
      
      expect(stats.all.score).toBe(0);
      expect(stats.all.rank).toBeNull();
      expect(stats.all.percentile).toBe(0);
    });
  });

  describe('periodic resets', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should auto-reset weekly leaderboard', async () => {
      const now = new Date('2024-01-08T00:00:00Z'); // Monday
      jest.setSystemTime(now);
      
      await leaderboardModule.update('user123', 100);
      
      // Advance to next Monday
      jest.setSystemTime(new Date('2024-01-15T00:00:00Z'));
      await leaderboardModule.checkPeriodicResets();
      
      const weekly = await leaderboardModule.getLeaderboard({ period: 'weekly' });
      expect(weekly).toEqual([]);
    });

    it('should auto-reset monthly leaderboard', async () => {
      const now = new Date('2024-01-31T23:59:59Z');
      jest.setSystemTime(now);
      
      await leaderboardModule.update('user123', 100);
      
      // Advance to next month
      jest.setSystemTime(new Date('2024-02-01T00:00:00Z'));
      await leaderboardModule.checkPeriodicResets();
      
      const monthly = await leaderboardModule.getLeaderboard({ period: 'monthly' });
      expect(monthly).toEqual([]);
    });
  });

  describe('real-time updates', () => {
    it('should batch updates', async () => {
      jest.useFakeTimers();
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(leaderboardModule.update(`user${i}`, i * 10));
      }
      
      await Promise.all(promises);
      jest.advanceTimersByTime(150);
      
      const lb = await leaderboardModule.getLeaderboard({ limit: 10 });
      expect(lb).toHaveLength(10);
      
      jest.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      storage.zadd = jest.fn().mockRejectedValue(new Error('Storage error'));
      
      await expect(
        leaderboardModule.update('user123', 100)
      ).rejects.toThrow('Storage error');
    });

    it('should validate score values', async () => {
      await expect(
        leaderboardModule.update('user123', -100)
      ).rejects.toThrow();
      
      await expect(
        leaderboardModule.update('user123', NaN)
      ).rejects.toThrow();
      
      await expect(
        leaderboardModule.update('user123', Infinity)
      ).rejects.toThrow();
    });
  });

  describe('resetUser', () => {
    it('should remove user from all leaderboards', async () => {
      await leaderboardModule.update('user123', 500);
      
      await leaderboardModule.resetUser('user123');
      
      const rank = await leaderboardModule.getRank('user123');
      expect(rank).toBeNull();
      
      const weeklyRank = await leaderboardModule.getRank('user123', 'weekly');
      expect(weeklyRank).toBeNull();
    });
  });
});