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
      expect(module.name).toBe('leaderboards');
      // Check actual default config values from implementation
      expect(module.defaultConfig.updateInterval).toBe(60000);
      expect(module.defaultConfig.enableRealtime).toBe(true);
      expect(module.defaultConfig.defaultPageSize).toBe(100);
      expect(module.defaultConfig.maxPageSize).toBe(1000);
    });

    it('should accept custom options', () => {
      const module = new LeaderboardModule({
        updateInterval: 5000,
        enableRealtime: false,
        maxPageSize: 50
      });
      
      expect(module.config.updateInterval).toBe(5000);
      expect(module.config.enableRealtime).toBe(false);
      expect(module.config.maxPageSize).toBe(50);
    });
  });

  describe('updateScore', () => {
    it('should update user score on leaderboard', async () => {
      const result = await leaderboardModule.updateScore('global', 'user123', 100);
      
      expect(result).toEqual({
        leaderboardId: 'global',
        userId: 'user123',
        score: 100
      });
    });

    it('should handle score increments', async () => {
      await leaderboardModule.updateScore('global', 'user123', 100);
      const result = await leaderboardModule.updateScore('global', 'user123', 50, true);
      
      expect(result.score).toBe(150);
    });

    it('should update rankings correctly', async () => {
      await leaderboardModule.updateScore('global', 'user1', 300);
      await leaderboardModule.updateScore('global', 'user2', 200);
      await leaderboardModule.updateScore('global', 'user3', 400);
      
      const lb = await leaderboardModule.getLeaderboard('global', { limit: 3 });
      
      expect(lb.entries[0].userId).toBe('user3');
      expect(lb.entries[1].userId).toBe('user1');
      expect(lb.entries[2].userId).toBe('user2');
    });

    it('should update leaderboard scores', async () => {
      await leaderboardModule.updateScore('global', 'user1', 100);
      await leaderboardModule.updateScore('global', 'user2', 200);
      
      const result = await leaderboardModule.updateScore('global', 'user1', 300);
      
      expect(result.score).toBe(300);
    });

    it('should emit score.updated event', async () => {
      const emitSpy = jest.spyOn(leaderboardModule, 'emitEvent');
      
      await leaderboardModule.updateScore('global', 'user123', 100);
      
      expect(emitSpy).toHaveBeenCalledWith('score.updated', {
        leaderboardId: 'global',
        userId: 'user123',
        score: 100,
        timestamp: expect.any(Number)
      });
    });

    it('should handle multiple score updates', async () => {
      await leaderboardModule.updateScore('global', 'user1', 100);
      await leaderboardModule.updateScore('global', 'user2', 200);
      const result = await leaderboardModule.updateScore('global', 'user1', 300);
      
      expect(result.score).toBe(300);
    });

    it('should update different leaderboards', async () => {
      await leaderboardModule.updateScore('points-weekly', 'user123', 100);
      await leaderboardModule.updateScore('points-monthly', 'user123', 100);
      
      const weekly = await leaderboardModule.getLeaderboard('points-weekly', { limit: 1 });
      const monthly = await leaderboardModule.getLeaderboard('points-monthly', { limit: 1 });
      
      expect(weekly.entries[0].userId).toBe('user123');
      expect(monthly.entries[0].userId).toBe('user123');
    });

    it('should handle multiple users on leaderboard', async () => {
      await leaderboardModule.updateScore('global', 'user1', 100);
      await leaderboardModule.updateScore('global', 'user2', 200);
      await leaderboardModule.updateScore('global', 'user3', 300);
      await leaderboardModule.updateScore('global', 'user4', 50);
      
      const lb = await leaderboardModule.getLeaderboard('global', { limit: 10 });
      expect(lb.entries).toHaveLength(4);
      expect(lb.entries.map(e => e.userId)).toContain('user4');
    });
  });

  describe('getLeaderboard', () => {
    beforeEach(async () => {
      await leaderboardModule.updateScore('global', 'user1', 500);
      await leaderboardModule.updateScore('global', 'user2', 300);
      await leaderboardModule.updateScore('global', 'user3', 700);
      await leaderboardModule.updateScore('global', 'user4', 400);
      await leaderboardModule.updateScore('global', 'user5', 600);
    });

    it('should return top users', async () => {
      const lb = await leaderboardModule.getLeaderboard('global', { limit: 3 });
      
      expect(lb.entries).toEqual([
        { userId: 'user3', score: 700, rank: 1 },
        { userId: 'user5', score: 600, rank: 2 },
        { userId: 'user1', score: 500, rank: 3 }
      ]);
    });

    it('should support pagination', async () => {
      const page1 = await leaderboardModule.getLeaderboard('global', { limit: 2, page: 1 });
      const page2 = await leaderboardModule.getLeaderboard('global', { limit: 2, page: 2 });
      
      expect(page1.entries).toHaveLength(2);
      expect(page2.entries).toHaveLength(2);
      expect(page1.entries[0].rank).toBe(1);
      expect(page2.entries[0].rank).toBe(3);
    });

    it('should include specific user if requested', async () => {
      const result = await leaderboardModule.getLeaderboard('global', { 
        limit: 3, 
        includeUser: 'user4' 
      });
      
      expect(result.userPosition).toEqual({
        userId: 'user4',
        score: 400,
        rank: 4
      });
    });

    it('should return user position with nearby users', async () => {
      const position = await leaderboardModule.getUserPosition('global', 'user1', { nearbyCount: 1 });
      
      expect(position.userId).toBe('user1');
      expect(position.rank).toBe(3);
      expect(position.score).toBe(500);
      expect(position.nearby).toBeDefined();
    });

    it('should handle weekly leaderboard', async () => {
      const weekly = await leaderboardModule.getLeaderboard('points-weekly', { 
        limit: 5 
      });
      
      expect(weekly.entries).toHaveLength(5);
      expect(weekly.entries[0].userId).toBe('user3');
    });

    it('should handle monthly leaderboard', async () => {
      const monthly = await leaderboardModule.getLeaderboard('points-monthly', { 
        limit: 5 
      });
      
      expect(monthly.entries).toHaveLength(5);
      expect(monthly.entries[0].userId).toBe('user3');
    });

    it('should handle empty leaderboards', async () => {
      const empty = await leaderboardModule.getLeaderboard('empty-leaderboard', { 
        limit: 10
      });
      
      expect(empty.entries).toEqual([]);
    });
  });

  describe('getUserPosition', () => {
    beforeEach(async () => {
      await leaderboardModule.updateScore('global', 'user1', 300);
      await leaderboardModule.updateScore('global', 'user2', 200);
      await leaderboardModule.updateScore('global', 'user3', 400);
    });

    it('should return user position', async () => {
      const position1 = await leaderboardModule.getUserPosition('global', 'user3');
      const position2 = await leaderboardModule.getUserPosition('global', 'user1');
      const position3 = await leaderboardModule.getUserPosition('global', 'user2');
      
      expect(position1.rank).toBe(1);
      expect(position2.rank).toBe(2);
      expect(position3.rank).toBe(3);
    });

    it('should return null for non-existent user', async () => {
      const position = await leaderboardModule.getUserPosition('global', 'nonexistent');
      expect(position).toBeNull();
    });

    it('should handle different leaderboards', async () => {
      await leaderboardModule.updateScore('points-weekly', 'user1', 300);
      const weeklyPosition = await leaderboardModule.getUserPosition('points-weekly', 'user1');
      expect(weeklyPosition.rank).toBe(1);
    });
  });

  describe('getUserRankings', () => {
    it('should return user rankings across leaderboards', async () => {
      await leaderboardModule.updateScore('points-all-time', 'user123', 500);
      
      const rankings = await leaderboardModule.getUserRankings('user123', ['points-all-time']);
      expect(rankings['points-all-time'].score).toBe(500);
    });

    it('should return empty for non-existent user', async () => {
      const rankings = await leaderboardModule.getUserRankings('nonexistent', ['points-all-time']);
      expect(rankings).toEqual({});
    });
  });

  describe('removeUser', () => {
    beforeEach(async () => {
      await leaderboardModule.updateScore('global', 'user123', 500);
    });

    it('should remove user from leaderboard', async () => {
      const result = await leaderboardModule.removeUser('global', 'user123');
      
      expect(result.success).toBe(true);
      
      const position = await leaderboardModule.getUserPosition('global', 'user123');
      expect(position).toBeNull();
    });

    it('should emit user.removed event', async () => {
      const emitSpy = jest.spyOn(leaderboardModule, 'emitEvent');
      
      await leaderboardModule.removeUser('global', 'user123');
      
      expect(emitSpy).toHaveBeenCalledWith('user.removed', {
        leaderboardId: 'global',
        userId: 'user123'
      });
    });

    it('should handle removing non-existent user', async () => {
      const result = await leaderboardModule.removeUser('global', 'nonexistent');
      
      expect(result.success).toBe(false);
    });
  });

  describe('resetLeaderboard', () => {
    beforeEach(async () => {
      await leaderboardModule.updateScore('global', 'user1', 100);
      await leaderboardModule.updateScore('global', 'user2', 200);
      await leaderboardModule.updateScore('global', 'user3', 300);
    });

    it('should reset leaderboard', async () => {
      const result = await leaderboardModule.resetLeaderboard('global');
      
      expect(result.success).toBe(true);
      
      const lb = await leaderboardModule.getLeaderboard('global', { limit: 10 });
      expect(lb.entries).toEqual([]);
    });

    it('should emit reset event', async () => {
      const emitSpy = jest.spyOn(leaderboardModule, 'emitEvent');
      
      await leaderboardModule.resetLeaderboard('global');
      
      expect(emitSpy).toHaveBeenCalledWith('reset', {
        leaderboardId: 'global',
        timestamp: expect.any(Number)
      });
    });
  });


  describe('getUserStats', () => {
    beforeEach(async () => {
      await leaderboardModule.updateScore('points-all-time', 'user123', 500);
      await leaderboardModule.updateScore('points-all-time', 'user456', 600);
      await leaderboardModule.updateScore('points-all-time', 'user789', 400);
    });

    it('should return user stats', async () => {
      const stats = await leaderboardModule.getUserStats('user123');
      
      expect(stats.rankings).toBeDefined();
      expect(stats.topRanking).toBeDefined();
    });

    it('should handle user not on leaderboard', async () => {
      const stats = await leaderboardModule.getUserStats('nonexistent');
      
      expect(stats.rankings).toEqual({});
      expect(stats.topRanking).toBeNull();
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

      // Fix: Use correct API signature - updateScore(leaderboardId, userId, score)
      await leaderboardModule.updateScore('points-weekly', 'user123', 100);

      // Advance to next Monday
      jest.setSystemTime(new Date('2024-01-15T00:00:00Z'));
      await leaderboardModule.checkPeriodicResets();

      // Fix: Use correct API signature - getLeaderboard(leaderboardId, options)
      const weekly = await leaderboardModule.getLeaderboard('points-weekly', { limit: 10 });
      expect(weekly.entries).toEqual([]);
    });

    it('should auto-reset monthly leaderboard', async () => {
      const now = new Date('2024-01-31T23:59:59Z');
      jest.setSystemTime(now);

      // Fix: Use correct API signature - updateScore(leaderboardId, userId, score)
      await leaderboardModule.updateScore('points-monthly', 'user123', 100);

      // Advance to next month
      jest.setSystemTime(new Date('2024-02-01T00:00:00Z'));
      await leaderboardModule.checkPeriodicResets();

      // Fix: Use correct API signature - getLeaderboard(leaderboardId, options)
      const monthly = await leaderboardModule.getLeaderboard('points-monthly', { limit: 10 });
      expect(monthly.entries).toEqual([]);
    });
  });

  describe('real-time updates', () => {
    it('should handle multiple updates', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(leaderboardModule.updateScore('global', `user${i}`, i * 10));
      }
      
      await Promise.all(promises);
      
      const lb = await leaderboardModule.getLeaderboard('global', { limit: 10 });
      expect(lb.entries).toHaveLength(10);
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      storage.zadd = jest.fn().mockRejectedValue(new Error('Storage error'));
      
      await expect(
        leaderboardModule.updateScore('global', 'user123', 100)
      ).rejects.toThrow('Storage error');
    });
  });

  describe('resetUser', () => {
    it('should remove user from all leaderboards', async () => {
      await leaderboardModule.updateScore('global', 'user123', 500);
      
      await leaderboardModule.resetUser('user123');
      
      const position = await leaderboardModule.getUserPosition('global', 'user123');
      expect(position).toBeNull();
    });
  });
});