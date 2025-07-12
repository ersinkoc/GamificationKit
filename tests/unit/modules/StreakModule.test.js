import { jest } from '@jest/globals';
import { StreakModule } from '../../../src/modules/StreakModule.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { EventManager } from '../../../src/core/EventManager.js';
import { Logger } from '../../../src/utils/logger.js';

describe('StreakModule', () => {
  let streakModule;
  let storage;
  let eventManager;
  let logger;

  beforeEach(async () => {
    storage = new MemoryStorage();
    eventManager = new EventManager();
    logger = new Logger({ prefix: 'StreakModule' });
    await storage.connect();

    streakModule = new StreakModule({
      gracePeriod: 24 * 60 * 60 * 1000, // 1 day
      freezes: {
        enabled: true,
        maxFreezes: 3,
        freezeDuration: 24 * 60 * 60 * 1000
      },
      rewards: {
        enabled: true,
        milestones: [3, 7, 14, 30, 60, 100]
      }
    });

    streakModule.setContext({
      storage,
      eventManager,
      logger,
      config: {}
    });
    
    await streakModule.initialize();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const module = new StreakModule();
      expect(module.name).toBe('streaks');
      expect(module.options.gracePeriod).toBe(24 * 60 * 60 * 1000);
      expect(module.options.freezes.enabled).toBe(true);
      expect(module.options.rewards.enabled).toBe(true);
    });

    it('should accept custom options', () => {
      const module = new StreakModule({
        gracePeriod: 48 * 60 * 60 * 1000,
        freezes: { enabled: false }
      });
      
      expect(module.options.gracePeriod).toBe(48 * 60 * 60 * 1000);
      expect(module.options.freezes.enabled).toBe(false);
    });
  });

  describe('increment', () => {
    it('should start a new streak', async () => {
      const result = await streakModule.increment('user123', 'daily-login');
      
      expect(result).toEqual({
        userId: 'user123',
        streakType: 'daily-login',
        current: 1,
        longest: 1,
        lastActivity: expect.any(Date),
        isNew: true,
        milestoneReached: false
      });
    });

    it('should continue existing streak', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      await streakModule.increment('user123', 'daily-login');
      
      // Next day
      jest.setSystemTime(now + 23 * 60 * 60 * 1000);
      
      const result = await streakModule.increment('user123', 'daily-login');
      
      expect(result.current).toBe(2);
      expect(result.longest).toBe(2);
      expect(result.isNew).toBe(false);
      
      jest.useRealTimers();
    });

    it('should break streak if grace period exceeded', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      await streakModule.increment('user123', 'daily-login');
      
      // 2 days later (beyond grace period)
      jest.setSystemTime(now + 49 * 60 * 60 * 1000);
      
      const result = await streakModule.increment('user123', 'daily-login');
      
      expect(result.current).toBe(1);
      expect(result.longest).toBe(1);
      expect(result.streakBroken).toBe(true);
      
      jest.useRealTimers();
    });

    it('should preserve longest streak', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      // Build streak to 5
      for (let i = 0; i < 5; i++) {
        await streakModule.increment('user123', 'daily-login');
        jest.setSystemTime(now + (i + 1) * 23 * 60 * 60 * 1000);
      }
      
      // Break streak
      jest.setSystemTime(now + 7 * 24 * 60 * 60 * 1000);
      
      const result = await streakModule.increment('user123', 'daily-login');
      
      expect(result.current).toBe(1);
      expect(result.longest).toBe(5);
      
      jest.useRealTimers();
    });

    it('should detect milestone reached', async () => {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        jest.useFakeTimers();
        const baseTime = Date.now() + i * 23 * 60 * 60 * 1000;
        jest.setSystemTime(baseTime);
        promises.push(streakModule.increment('user123', 'daily-login'));
        jest.useRealTimers();
      }
      
      const results = await Promise.all(promises);
      const lastResult = results[results.length - 1];
      
      expect(lastResult.current).toBe(3);
      expect(lastResult.milestoneReached).toBe(true);
      expect(lastResult.milestone).toBe(3);
    });

    it('should emit streak.started event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await streakModule.increment('user123', 'daily-login');
      
      expect(emitSpy).toHaveBeenCalledWith('streak.started', {
        userId: 'user123',
        streakType: 'daily-login',
        timestamp: expect.any(Date)
      });
    });

    it('should emit streak.continued event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await streakModule.increment('user123', 'daily-login');
      await streakModule.increment('user123', 'daily-login');
      
      expect(emitSpy).toHaveBeenCalledWith('streak.continued', {
        userId: 'user123',
        streakType: 'daily-login',
        current: 2,
        timestamp: expect.any(Date)
      });
    });

    it('should emit streak.broken event', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      await streakModule.increment('user123', 'daily-login');
      
      jest.setSystemTime(now + 49 * 60 * 60 * 1000);
      
      const emitSpy = jest.spyOn(eventManager, 'emit');
      await streakModule.increment('user123', 'daily-login');
      
      expect(emitSpy).toHaveBeenCalledWith('streak.broken', {
        userId: 'user123',
        streakType: 'daily-login',
        previousStreak: 1,
        daysInactive: expect.any(Number),
        timestamp: expect.any(Date)
      });
      
      jest.useRealTimers();
    });

    it('should emit streak.milestone event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      // Build to milestone
      for (let i = 0; i < 3; i++) {
        await streakModule.increment('user123', 'daily-login');
      }
      
      expect(emitSpy).toHaveBeenCalledWith('streak.milestone', {
        userId: 'user123',
        streakType: 'daily-login',
        milestone: 3,
        timestamp: expect.any(Date)
      });
    });

    it('should handle multiple streak types', async () => {
      await streakModule.increment('user123', 'daily-login');
      await streakModule.increment('user123', 'workout');
      await streakModule.increment('user123', 'meditation');
      
      const loginStreak = await streakModule.getStreak('user123', 'daily-login');
      const workoutStreak = await streakModule.getStreak('user123', 'workout');
      const meditationStreak = await streakModule.getStreak('user123', 'meditation');
      
      expect(loginStreak.current).toBe(1);
      expect(workoutStreak.current).toBe(1);
      expect(meditationStreak.current).toBe(1);
    });
  });

  describe('getStreak', () => {
    it('should return streak data', async () => {
      await streakModule.increment('user123', 'daily-login');
      
      const streak = await streakModule.getStreak('user123', 'daily-login');
      
      expect(streak).toEqual({
        userId: 'user123',
        streakType: 'daily-login',
        current: 1,
        longest: 1,
        lastActivity: expect.any(Date),
        isActive: true,
        freezesUsed: 0,
        freezesAvailable: 3
      });
    });

    it('should return default for non-existent streak', async () => {
      const streak = await streakModule.getStreak('user123', 'nonexistent');
      
      expect(streak).toEqual({
        userId: 'user123',
        streakType: 'nonexistent',
        current: 0,
        longest: 0,
        lastActivity: null,
        isActive: false,
        freezesUsed: 0,
        freezesAvailable: 3
      });
    });

    it('should check if streak is active', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      await streakModule.increment('user123', 'daily-login');
      
      // Within grace period
      jest.setSystemTime(now + 23 * 60 * 60 * 1000);
      let streak = await streakModule.getStreak('user123', 'daily-login');
      expect(streak.isActive).toBe(true);
      
      // Beyond grace period
      jest.setSystemTime(now + 49 * 60 * 60 * 1000);
      streak = await streakModule.getStreak('user123', 'daily-login');
      expect(streak.isActive).toBe(false);
      
      jest.useRealTimers();
    });
  });

  describe('getAllStreaks', () => {
    beforeEach(async () => {
      await streakModule.increment('user123', 'daily-login');
      await streakModule.increment('user123', 'workout');
      await streakModule.increment('user123', 'reading');
    });

    it('should return all user streaks', async () => {
      const streaks = await streakModule.getAllStreaks('user123');
      
      expect(streaks).toHaveLength(3);
      expect(streaks.map(s => s.streakType).sort()).toEqual([
        'daily-login',
        'reading',
        'workout'
      ]);
    });

    it('should filter active streaks', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now + 49 * 60 * 60 * 1000);
      
      const activeStreaks = await streakModule.getAllStreaks('user123', {
        activeOnly: true
      });
      
      expect(activeStreaks).toHaveLength(0);
      
      jest.useRealTimers();
    });

    it('should sort by current streak', async () => {
      // Build different streak lengths
      await streakModule.increment('user123', 'workout');
      await streakModule.increment('user123', 'workout');
      
      const streaks = await streakModule.getAllStreaks('user123', {
        sortBy: 'current'
      });
      
      expect(streaks[0].streakType).toBe('workout');
      expect(streaks[0].current).toBe(3);
    });
  });

  describe('freeze system', () => {
    beforeEach(async () => {
      await streakModule.increment('user123', 'daily-login');
    });

    it('should freeze streak', async () => {
      const result = await streakModule.freezeStreak('user123', 'daily-login');
      
      expect(result.success).toBe(true);
      expect(result.freezesRemaining).toBe(2);
      expect(result.freezeExpires).toBeDefined();
    });

    it('should preserve streak during freeze', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      await streakModule.freezeStreak('user123', 'daily-login');
      
      // 1.5 days later (would break without freeze)
      jest.setSystemTime(now + 36 * 60 * 60 * 1000);
      
      const streak = await streakModule.getStreak('user123', 'daily-login');
      expect(streak.isActive).toBe(true);
      expect(streak.current).toBe(1);
      
      jest.useRealTimers();
    });

    it('should expire freeze', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      await streakModule.freezeStreak('user123', 'daily-login');
      
      // 2 days later (freeze expired)
      jest.setSystemTime(now + 48 * 60 * 60 * 1000);
      
      const streak = await streakModule.getStreak('user123', 'daily-login');
      expect(streak.isActive).toBe(false);
      
      jest.useRealTimers();
    });

    it('should limit freezes', async () => {
      // Use all freezes
      for (let i = 0; i < 3; i++) {
        await streakModule.freezeStreak('user123', 'daily-login');
      }
      
      const result = await streakModule.freezeStreak('user123', 'daily-login');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No freezes available');
    });

    it('should emit streak.frozen event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await streakModule.freezeStreak('user123', 'daily-login');
      
      expect(emitSpy).toHaveBeenCalledWith('streak.frozen', {
        userId: 'user123',
        streakType: 'daily-login',
        freezesRemaining: 2,
        freezeExpires: expect.any(Date),
        timestamp: expect.any(Date)
      });
    });

    it('should not freeze inactive streak', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      await streakModule.increment('user123', 'daily-login');
      
      // Break streak
      jest.setSystemTime(now + 49 * 60 * 60 * 1000);
      
      const result = await streakModule.freezeStreak('user123', 'daily-login');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
      
      jest.useRealTimers();
    });
  });

  describe('break streak', () => {
    it('should manually break streak', async () => {
      await streakModule.increment('user123', 'daily-login');
      await streakModule.increment('user123', 'daily-login');
      
      const result = await streakModule.breakStreak('user123', 'daily-login');
      
      expect(result.success).toBe(true);
      expect(result.previousStreak).toBe(2);
      
      const streak = await streakModule.getStreak('user123', 'daily-login');
      expect(streak.current).toBe(0);
    });

    it('should preserve longest streak', async () => {
      // Build streak to 5
      for (let i = 0; i < 5; i++) {
        await streakModule.increment('user123', 'daily-login');
      }
      
      await streakModule.breakStreak('user123', 'daily-login');
      
      const streak = await streakModule.getStreak('user123', 'daily-login');
      expect(streak.longest).toBe(5);
    });

    it('should emit streak.broken event', async () => {
      await streakModule.increment('user123', 'daily-login');
      
      const emitSpy = jest.spyOn(eventManager, 'emit');
      await streakModule.breakStreak('user123', 'daily-login');
      
      expect(emitSpy).toHaveBeenCalledWith('streak.broken', {
        userId: 'user123',
        streakType: 'daily-login',
        previousStreak: 1,
        manual: true,
        timestamp: expect.any(Date)
      });
    });
  });

  describe('getLeaderboard', () => {
    beforeEach(async () => {
      // Create streaks for multiple users
      for (let i = 1; i <= 5; i++) {
        for (let j = 0; j < i; j++) {
          await streakModule.increment(`user${i}`, 'daily-login');
        }
      }
    });

    it('should return streak leaderboard', async () => {
      const leaderboard = await streakModule.getLeaderboard('daily-login', {
        limit: 3
      });
      
      expect(leaderboard).toEqual([
        { userId: 'user5', streak: 5, rank: 1 },
        { userId: 'user4', streak: 4, rank: 2 },
        { userId: 'user3', streak: 3, rank: 3 }
      ]);
    });

    it('should support pagination', async () => {
      const page2 = await streakModule.getLeaderboard('daily-login', {
        limit: 2,
        offset: 2
      });
      
      expect(page2).toHaveLength(2);
      expect(page2[0].rank).toBe(3);
    });

    it('should filter by minimum streak', async () => {
      const leaderboard = await streakModule.getLeaderboard('daily-login', {
        minStreak: 4
      });
      
      expect(leaderboard).toHaveLength(2);
      expect(leaderboard.every(e => e.streak >= 4)).toBe(true);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      // Build various streaks
      for (let i = 0; i < 7; i++) {
        await streakModule.increment('user123', 'daily-login');
      }
      
      for (let i = 0; i < 3; i++) {
        await streakModule.increment('user123', 'workout');
      }
      
      await streakModule.increment('user123', 'meditation');
    });

    it('should return aggregated stats', async () => {
      const stats = await streakModule.getStats('user123');
      
      expect(stats).toEqual({
        totalStreaks: 3,
        activeStreaks: 3,
        totalDays: 11,
        longestStreak: {
          type: 'daily-login',
          length: 7
        },
        streaksByType: {
          'daily-login': 7,
          'workout': 3,
          'meditation': 1
        },
        milestonesReached: [3, 7],
        freezesUsed: 0
      });
    });

    it('should handle user with no streaks', async () => {
      const stats = await streakModule.getStats('newuser');
      
      expect(stats.totalStreaks).toBe(0);
      expect(stats.activeStreaks).toBe(0);
      expect(stats.totalDays).toBe(0);
    });
  });

  describe('getUserStats', () => {
    it('should return formatted user stats', async () => {
      await streakModule.increment('user123', 'daily-login');
      
      const stats = await streakModule.getUserStats('user123');
      
      expect(stats).toHaveProperty('daily-login');
      expect(stats['daily-login']).toEqual({
        current: 1,
        longest: 1,
        lastActivity: expect.any(Date),
        isActive: true
      });
    });
  });

  describe('rewards', () => {
    it('should calculate streak rewards', async () => {
      const rewards = await streakModule.calculateRewards('daily-login', 7);
      
      expect(rewards).toContainEqual({
        type: 'milestone',
        value: 7,
        reward: expect.any(Object)
      });
    });

    it('should handle custom rewards', async () => {
      streakModule.options.rewards.customRewards = {
        7: { type: 'badge', id: 'week-streak' },
        30: { type: 'points', value: 1000 }
      };
      
      const rewards = await streakModule.calculateRewards('daily-login', 7);
      
      expect(rewards).toContainEqual({
        type: 'milestone',
        value: 7,
        reward: { type: 'badge', id: 'week-streak' }
      });
    });
  });

  describe('resetUser', () => {
    beforeEach(async () => {
      await streakModule.increment('user123', 'daily-login');
      await streakModule.increment('user123', 'workout');
      await streakModule.freezeStreak('user123', 'daily-login');
    });

    it('should reset all user streaks', async () => {
      await streakModule.resetUser('user123');
      
      const streaks = await streakModule.getAllStreaks('user123');
      
      expect(streaks).toHaveLength(0);
    });

    it('should emit reset event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await streakModule.resetUser('user123');
      
      expect(emitSpy).toHaveBeenCalledWith('streaks.reset', {
        userId: 'user123',
        previousStreaks: expect.any(Array),
        timestamp: expect.any(Date)
      });
    });
  });

  describe('error handling', () => {
    it('should handle storage errors', async () => {
      storage.hincrby = jest.fn().mockRejectedValue(new Error('Storage error'));
      
      await expect(
        streakModule.increment('user123', 'daily-login')
      ).rejects.toThrow('Storage error');
    });

    it('should validate streak types', async () => {
      await expect(
        streakModule.increment('user123', '')
      ).rejects.toThrow();
      
      await expect(
        streakModule.increment('user123', null)
      ).rejects.toThrow();
    });

    it('should handle concurrent increments', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(streakModule.increment('user123', 'daily-login'));
      }
      
      await Promise.all(promises);
      
      const streak = await streakModule.getStreak('user123', 'daily-login');
      expect(streak.current).toBe(5);
    });
  });
});