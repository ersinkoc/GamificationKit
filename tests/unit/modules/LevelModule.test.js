import { jest } from '@jest/globals';
import { LevelModule } from '../../../src/modules/LevelModule.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { EventManager } from '../../../src/core/EventManager.js';
import { Logger } from '../../../src/utils/logger.js';

describe('LevelModule', () => {
  let levelModule;
  let storage;
  let eventManager;
  let logger;

  beforeEach(async () => {
    storage = new MemoryStorage();
    eventManager = new EventManager();
    logger = new Logger({ prefix: 'LevelModule' });
    await storage.connect();

    levelModule = new LevelModule({
      levels: [
        { level: 1, xpRequired: 0, name: 'Novice' },
        { level: 2, xpRequired: 100, name: 'Apprentice' },
        { level: 3, xpRequired: 250, name: 'Journeyman' },
        { level: 4, xpRequired: 500, name: 'Expert' },
        { level: 5, xpRequired: 1000, name: 'Master' }
      ],
      xpMultiplier: 1.5,
      prestigeEnabled: true,
      maxPrestige: 3
    });

    levelModule.setContext({
      storage,
      eventManager,
      logger,
      config: {}
    });
    
    await levelModule.initialize();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const module = new LevelModule();
      expect(module.name).toBe('levels');
      expect(module.options.levels).toHaveLength(10);
      expect(module.options.xpMultiplier).toBe(1);
      expect(module.options.prestigeEnabled).toBe(false);
    });

    it('should accept custom levels', () => {
      const customLevels = [
        { level: 1, xpRequired: 0 },
        { level: 2, xpRequired: 50 }
      ];
      
      const module = new LevelModule({ levels: customLevels });
      expect(module.options.levels).toEqual(customLevels);
    });

    it('should validate level configuration', async () => {
      const invalidLevels = [
        { level: 2, xpRequired: 100 },
        { level: 1, xpRequired: 0 }
      ];
      
      const module = new LevelModule({ levels: invalidLevels });
      await expect(
        module.initialize(storage, eventManager)
      ).rejects.toThrow();
    });
  });

  describe('addXP', () => {
    it('should add XP to user', async () => {
      const result = await levelModule.addXP('user123', 50);
      
      expect(result).toEqual({
        userId: 'user123',
        xpAdded: 50,
        totalXP: 50,
        currentLevel: 1,
        currentLevelXP: 50,
        nextLevelXP: 100,
        progress: 50,
        leveledUp: false
      });
    });

    it('should apply XP multiplier', async () => {
      const result = await levelModule.addXP('user123', 100, {
        multiplier: true
      });
      
      expect(result.xpAdded).toBe(150); // 100 * 1.5
      expect(result.totalXP).toBe(150);
    });

    it('should handle level up', async () => {
      const result = await levelModule.addXP('user123', 100);
      
      expect(result.leveledUp).toBe(true);
      expect(result.currentLevel).toBe(2);
      expect(result.levelUpDetails).toEqual({
        previousLevel: 1,
        newLevel: 2,
        rewards: expect.any(Array)
      });
    });

    it('should handle multiple level ups', async () => {
      const result = await levelModule.addXP('user123', 500);
      
      expect(result.currentLevel).toBe(4);
      expect(result.levelUpDetails.levelsGained).toBe(3);
    });

    it('should emit xp.added event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await levelModule.addXP('user123', 50);
      
      expect(emitSpy).toHaveBeenCalledWith('xp.added', {
        userId: 'user123',
        xp: 50,
        totalXP: 50,
        source: undefined,
        timestamp: expect.any(Date)
      });
    });

    it('should emit level.up event on level up', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await levelModule.addXP('user123', 100);
      
      expect(emitSpy).toHaveBeenCalledWith('level.up', {
        userId: 'user123',
        previousLevel: 1,
        newLevel: 2,
        totalXP: 100,
        timestamp: expect.any(Date)
      });
    });

    it('should record XP history', async () => {
      await levelModule.addXP('user123', 50, { source: 'quest' });
      await levelModule.addXP('user123', 30, { source: 'achievement' });
      
      const history = await levelModule.getXPHistory('user123');
      
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        xp: 50,
        source: 'quest'
      });
    });

    it('should handle negative XP (removal)', async () => {
      await levelModule.addXP('user123', 150);
      const result = await levelModule.addXP('user123', -50);
      
      expect(result.totalXP).toBe(100);
      expect(result.currentLevel).toBe(2); // Should not level down
    });

    it('should handle prestige level up', async () => {
      // Get to max level
      await levelModule.addXP('user123', 1000);
      
      // Add more XP to trigger prestige
      const result = await levelModule.addXP('user123', 100);
      
      if (levelModule.options.prestigeEnabled) {
        expect(result.prestigeLevel).toBeDefined();
      }
    });
  });

  describe('getUserStats', () => {
    it('should return user level stats', async () => {
      await levelModule.addXP('user123', 150);
      
      const stats = await levelModule.getUserStats('user123');
      
      expect(stats).toEqual({
        userId: 'user123',
        level: 2,
        xp: 150,
        currentLevelXP: 50,
        nextLevelXP: 250,
        progress: 33.33,
        totalLevels: 5,
        rank: expect.any(Number),
        prestigeLevel: 0,
        levelName: 'Apprentice',
        nextLevelName: 'Journeyman',
        history: expect.any(Array)
      });
    });

    it('should return default stats for new user', async () => {
      const stats = await levelModule.getUserStats('newuser');
      
      expect(stats.level).toBe(1);
      expect(stats.xp).toBe(0);
      expect(stats.progress).toBe(0);
      expect(stats.levelName).toBe('Novice');
    });

    it('should calculate progress correctly', async () => {
      await levelModule.addXP('user123', 175);
      
      const stats = await levelModule.getUserStats('user123');
      
      expect(stats.currentLevelXP).toBe(75);
      expect(stats.progress).toBeCloseTo(50, 1); // 75/150 * 100
    });

    it('should handle max level', async () => {
      await levelModule.addXP('user123', 1000);
      
      const stats = await levelModule.getUserStats('user123');
      
      expect(stats.level).toBe(5);
      expect(stats.progress).toBe(100);
      expect(stats.nextLevelName).toBeNull();
    });
  });

  describe('setLevel', () => {
    it('should set user level directly', async () => {
      const result = await levelModule.setLevel('user123', 3);
      
      expect(result.level).toBe(3);
      expect(result.xp).toBe(250);
    });

    it('should validate level bounds', async () => {
      await expect(
        levelModule.setLevel('user123', 0)
      ).rejects.toThrow();
      
      await expect(
        levelModule.setLevel('user123', 10)
      ).rejects.toThrow();
    });

    it('should emit level.changed event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await levelModule.setLevel('user123', 3);
      
      expect(emitSpy).toHaveBeenCalledWith('level.changed', {
        userId: 'user123',
        previousLevel: 1,
        newLevel: 3,
        reason: 'manual',
        timestamp: expect.any(Date)
      });
    });

    it('should preserve extra XP when setting level', async () => {
      await levelModule.addXP('user123', 275); // Level 3 + 25 extra
      await levelModule.setLevel('user123', 2);
      
      const stats = await levelModule.getUserStats('user123');
      expect(stats.xp).toBe(125); // Level 2 (100) + 25 extra
    });
  });

  describe('getLeaderboard', () => {
    beforeEach(async () => {
      await levelModule.addXP('user1', 50);
      await levelModule.addXP('user2', 150);
      await levelModule.addXP('user3', 300);
      await levelModule.addXP('user4', 100);
      await levelModule.addXP('user5', 500);
    });

    it('should return XP leaderboard', async () => {
      const leaderboard = await levelModule.getLeaderboard({ limit: 3 });
      
      expect(leaderboard).toEqual([
        { userId: 'user5', level: 4, xp: 500, rank: 1 },
        { userId: 'user3', level: 3, xp: 300, rank: 2 },
        { userId: 'user2', level: 2, xp: 150, rank: 3 }
      ]);
    });

    it('should filter by minimum level', async () => {
      const leaderboard = await levelModule.getLeaderboard({ 
        minLevel: 3,
        limit: 10 
      });
      
      expect(leaderboard).toHaveLength(2);
      expect(leaderboard.every(e => e.level >= 3)).toBe(true);
    });

    it('should support pagination', async () => {
      const page2 = await levelModule.getLeaderboard({ 
        limit: 2,
        offset: 2 
      });
      
      expect(page2).toHaveLength(2);
      expect(page2[0].rank).toBe(3);
    });
  });

  describe('getLevelRewards', () => {
    it('should return rewards for level', async () => {
      const rewards = await levelModule.getLevelRewards(2);
      
      expect(rewards).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: expect.any(String),
          value: expect.any(Number)
        })
      ]));
    });

    it('should return empty array for invalid level', async () => {
      const rewards = await levelModule.getLevelRewards(99);
      expect(rewards).toEqual([]);
    });

    it('should support custom rewards', async () => {
      levelModule.options.levels[1].rewards = [
        { type: 'points', value: 100 },
        { type: 'badge', value: 'level-2' }
      ];
      
      const rewards = await levelModule.getLevelRewards(2);
      expect(rewards).toHaveLength(2);
    });
  });

  describe('prestige system', () => {
    beforeEach(async () => {
      // Get user to max level
      await levelModule.addXP('user123', 1000);
    });

    it('should prestige when enabled', async () => {
      const result = await levelModule.prestige('user123');
      
      expect(result.success).toBe(true);
      expect(result.newPrestigeLevel).toBe(1);
      expect(result.resetLevel).toBe(1);
      expect(result.bonuses).toBeDefined();
    });

    it('should emit prestige event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await levelModule.prestige('user123');
      
      expect(emitSpy).toHaveBeenCalledWith('level.prestige', {
        userId: 'user123',
        prestigeLevel: 1,
        previousTotalXP: 1000,
        timestamp: expect.any(Date)
      });
    });

    it('should fail if not at max level', async () => {
      await levelModule.addXP('user456', 100);
      
      const result = await levelModule.prestige('user456');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('max level');
    });

    it('should respect max prestige', async () => {
      // Prestige multiple times
      for (let i = 0; i < 3; i++) {
        await levelModule.prestige('user123');
        await levelModule.addXP('user123', 1000);
      }
      
      const result = await levelModule.prestige('user123');
      expect(result.success).toBe(false);
      expect(result.error).toContain('max prestige');
    });

    it('should apply prestige bonuses', async () => {
      await levelModule.prestige('user123');
      
      const result = await levelModule.addXP('user123', 100);
      
      // Should have prestige XP bonus
      expect(result.xpAdded).toBeGreaterThan(100);
    });
  });

  describe('XP decay', () => {
    beforeEach(() => {
      levelModule.options.xpDecay = {
        enabled: true,
        rate: 0.1,
        interval: 7 * 24 * 60 * 60 * 1000 // 7 days
      };
    });

    it('should apply XP decay', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      await levelModule.addXP('user123', 100);
      
      // Fast forward 8 days
      jest.setSystemTime(now + 8 * 24 * 60 * 60 * 1000);
      
      const result = await levelModule.applyXPDecay('user123');
      
      expect(result.decayedXP).toBe(10);
      expect(result.newXP).toBe(90);
      
      jest.useRealTimers();
    });

    it('should not decay below level threshold', async () => {
      await levelModule.addXP('user123', 110); // Level 2 + 10 XP
      
      const result = await levelModule.applyXPDecay('user123');
      
      // Should not go below level 2 (100 XP)
      expect(result.newXP).toBeGreaterThanOrEqual(100);
    });
  });

  describe('getRank', () => {
    beforeEach(async () => {
      await levelModule.addXP('user1', 100);
      await levelModule.addXP('user2', 300);
      await levelModule.addXP('user3', 200);
    });

    it('should return user rank by XP', async () => {
      const rank1 = await levelModule.getRank('user2');
      const rank2 = await levelModule.getRank('user3');
      const rank3 = await levelModule.getRank('user1');
      
      expect(rank1).toBe(1);
      expect(rank2).toBe(2);
      expect(rank3).toBe(3);
    });

    it('should return null for non-existent user', async () => {
      const rank = await levelModule.getRank('nonexistent');
      expect(rank).toBeNull();
    });
  });

  describe('calculateXPForLevel', () => {
    it('should calculate total XP for level', () => {
      const xp1 = levelModule.calculateXPForLevel(1);
      const xp2 = levelModule.calculateXPForLevel(2);
      const xp3 = levelModule.calculateXPForLevel(3);
      
      expect(xp1).toBe(0);
      expect(xp2).toBe(100);
      expect(xp3).toBe(250);
    });

    it('should handle invalid levels', () => {
      expect(levelModule.calculateXPForLevel(0)).toBe(0);
      expect(levelModule.calculateXPForLevel(99)).toBe(0);
    });
  });

  describe('getXPHistory', () => {
    it('should return XP gain history', async () => {
      await levelModule.addXP('user123', 50, { source: 'quest' });
      await levelModule.addXP('user123', 30, { source: 'achievement' });
      await levelModule.addXP('user123', -10, { source: 'penalty' });
      
      const history = await levelModule.getXPHistory('user123', 10);
      
      expect(history).toHaveLength(3);
      expect(history[0].xp).toBe(50);
      expect(history[1].xp).toBe(30);
      expect(history[2].xp).toBe(-10);
    });

    it('should limit history results', async () => {
      for (let i = 0; i < 20; i++) {
        await levelModule.addXP('user123', 10);
      }
      
      const history = await levelModule.getXPHistory('user123', 5);
      expect(history).toHaveLength(5);
    });

    it('should filter by date range', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      
      jest.setSystemTime(now - 3 * 24 * 60 * 60 * 1000);
      await levelModule.addXP('user123', 10);
      
      jest.setSystemTime(now);
      await levelModule.addXP('user123', 20);
      
      const history = await levelModule.getXPHistory('user123', 10, {
        startDate: new Date(now - 24 * 60 * 60 * 1000)
      });
      
      expect(history).toHaveLength(1);
      expect(history[0].xp).toBe(20);
      
      jest.useRealTimers();
    });
  });

  describe('resetUser', () => {
    it('should reset user level data', async () => {
      await levelModule.addXP('user123', 500);
      await levelModule.prestige('user123');
      
      await levelModule.resetUser('user123');
      
      const stats = await levelModule.getUserStats('user123');
      
      expect(stats.level).toBe(1);
      expect(stats.xp).toBe(0);
      expect(stats.prestigeLevel).toBe(0);
    });

    it('should emit reset event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await levelModule.addXP('user123', 500);
      await levelModule.resetUser('user123');
      
      expect(emitSpy).toHaveBeenCalledWith('levels.reset', {
        userId: 'user123',
        previousLevel: 4,
        previousXP: 500,
        timestamp: expect.any(Date)
      });
    });
  });

  describe('error handling', () => {
    it('should handle storage errors', async () => {
      storage.hincrby = jest.fn().mockRejectedValue(new Error('Storage error'));
      
      await expect(
        levelModule.addXP('user123', 100)
      ).rejects.toThrow('Storage error');
    });

    it('should validate XP values', async () => {
      await expect(
        levelModule.addXP('user123', NaN)
      ).rejects.toThrow();
      
      await expect(
        levelModule.addXP('user123', Infinity)
      ).rejects.toThrow();
    });

    it('should handle concurrent XP additions', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(levelModule.addXP('user123', 10));
      }
      
      await Promise.all(promises);
      
      const stats = await levelModule.getUserStats('user123');
      expect(stats.xp).toBe(100);
    });
  });
});