import { AchievementModule } from '../../../src/modules/AchievementModule.js';
import { EventManager } from '../../../src/core/EventManager.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { Logger } from '../../../src/utils/logger.js';
import { jest } from '@jest/globals';

describe('AchievementModule', () => {
  let achievementModule;
  let eventManager;
  let storage;
  let logger;

  beforeEach(async () => {
    eventManager = new EventManager();
    storage = new MemoryStorage();
    logger = new Logger({ prefix: 'AchievementModule' });
    
    achievementModule = new AchievementModule({
      config: {
        tiers: ['bronze', 'silver', 'gold'],
        tierMultipliers: {
          bronze: 1,
          silver: 2,
          gold: 3
        }
      }
    });
    
    achievementModule.setContext({
      storage,
      eventManager,
      logger,
      config: {}
    });
    
    await achievementModule.initialize();
  });

  describe('constructor and initialization', () => {
    it('should initialize with default config', () => {
      const module = new AchievementModule();
      expect(module.name).toBe('achievements');
      expect(module.defaultConfig.tiers).toContain('bronze');
      expect(module.defaultConfig.enableTierProgression).toBe(true);
    });

    it('should merge config properly', async () => {
      expect(achievementModule.config.tiers).toEqual(['bronze', 'silver', 'gold']);
      expect(achievementModule.config.enableTierProgression).toBe(true);
      expect(achievementModule.config.showProgress).toBe(true);
    });

    it('should setup event listeners', () => {
      const spy = jest.spyOn(eventManager, 'onWildcard');
      achievementModule.setupEventListeners();
      expect(spy).toHaveBeenCalledWith('*', expect.any(Function));
    });
  });

  describe('addAchievement', () => {
    it('should add achievement with all properties', () => {
      const achievement = {
        id: 'first_login',
        name: 'First Login',
        description: 'Login for the first time',
        category: 'gameplay',
        tiers: {
          bronze: {
            name: 'Bronze First Login',
            description: 'Login once',
            requirement: 1,
            rewards: { points: 10 }
          },
          silver: {
            name: 'Silver First Login',
            description: 'Login 5 times',
            requirement: 5,
            rewards: { points: 25 }
          }
        },
        icon: 'login.png',
        trackingEvent: 'user.login',
        trackingField: 'count'
      };

      const result = achievementModule.addAchievement(achievement);
      
      expect(result.id).toBe('first_login');
      expect(result.name).toBe('First Login');
      expect(result.enabled).toBe(true);
      expect(result.hidden).toBe(false);
      expect(result.createdAt).toBeDefined();
      expect(achievementModule.achievements.has('first_login')).toBe(true);
    });

    it('should validate required properties', () => {
      expect(() => {
        achievementModule.addAchievement({ id: 'test' });
      }).toThrow();

      expect(() => {
        achievementModule.addAchievement({ id: 'test', name: 'Test' });
      }).toThrow();
    });

    it('should filter tiers based on config', () => {
      const achievement = {
        id: 'test',
        name: 'Test',
        tiers: {
          bronze: { requirement: 1 },
          silver: { requirement: 5 },
          platinum: { requirement: 10 } // Not in config
        }
      };

      const result = achievementModule.addAchievement(achievement);
      expect(Object.keys(result.tiers)).toEqual(['bronze', 'silver']);
      expect(result.tiers.platinum).toBeUndefined();
    });

    it('should setup tracker for tracking events', () => {
      const achievement = {
        id: 'collector',
        name: 'Collector',
        tiers: { bronze: { requirement: 10 } },
        trackingEvent: 'item.collected',
        trackingField: 'amount',
        aggregation: 'sum'
      };

      achievementModule.addAchievement(achievement);
      expect(achievementModule.trackers.has('collector')).toBe(true);
      
      const tracker = achievementModule.trackers.get('collector');
      expect(tracker.event).toBe('item.collected');
      expect(tracker.field).toBe('amount');
      expect(tracker.aggregation).toBe('sum');
    });
  });

  describe('unlock', () => {
    let testAchievement;

    beforeEach(() => {
      testAchievement = {
        id: 'explorer',
        name: 'Explorer',
        tiers: {
          bronze: {
            name: 'Bronze Explorer',
            requirement: 10,
            rewards: { points: 100, xp: 50 }
          },
          silver: {
            name: 'Silver Explorer',
            requirement: 50,
            rewards: { points: 250, badges: ['explorer_badge'] }
          },
          gold: {
            name: 'Gold Explorer',
            requirement: 100,
            rewards: { points: 500, custom: { title: 'Master Explorer' } }
          }
        }
      };
      achievementModule.addAchievement(testAchievement);
    });

    it('should unlock achievement successfully', async () => {
      const result = await achievementModule.unlock('user123', 'explorer', 'bronze');
      
      expect(result.success).toBe(true);
      expect(result.unlock).toBeDefined();
      expect(result.unlock.userId).toBe('user123');
      expect(result.unlock.achievementId).toBe('explorer');
      expect(result.unlock.tier).toBe('bronze');
      expect(result.points).toBe(100);
      expect(result.rewards).toEqual({ points: 100, xp: 50 });
    });

    it('should prevent duplicate unlocks', async () => {
      await achievementModule.unlock('user123', 'explorer', 'bronze');
      const result = await achievementModule.unlock('user123', 'explorer', 'bronze');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('already_unlocked');
    });

    it('should require previous tier when progression enabled', async () => {
      const result = await achievementModule.unlock('user123', 'explorer', 'silver');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('previous_tier_required');
      expect(result.requiredTier).toBe('bronze');
    });

    it('should allow any tier when progression disabled', async () => {
      achievementModule.config.enableTierProgression = false;
      const result = await achievementModule.unlock('user123', 'explorer', 'gold');
      
      expect(result.success).toBe(true);
    });

    it('should emit events on unlock', async () => {
      const emitSpy = jest.spyOn(achievementModule, 'emitEvent');
      await achievementModule.unlock('user123', 'explorer', 'bronze');
      
      expect(emitSpy).toHaveBeenCalledWith('unlocked', expect.objectContaining({
        userId: 'user123',
        achievementId: 'explorer',
        tier: 'bronze'
      }));
    });

    it('should process rewards correctly', async () => {
      const eventSpy = jest.spyOn(eventManager, 'emitAsync');
      await achievementModule.unlock('user123', 'explorer', 'silver');
      
      expect(eventSpy).toHaveBeenCalledWith('points.award', {
        userId: 'user123',
        points: 250,
        reason: 'achievement_silver'
      });
      
      expect(eventSpy).toHaveBeenCalledWith('badges.award', {
        userId: 'user123',
        badgeId: 'explorer_badge',
        metadata: { achievementTier: 'silver' }
      });
    });

    it('should apply tier multipliers to rewards', async () => {
      const eventSpy = jest.spyOn(eventManager, 'emitAsync');
      achievementModule.config.tierMultipliers.gold = 5;
      
      await achievementModule.unlock('user123', 'explorer', 'bronze');
      await achievementModule.unlock('user123', 'explorer', 'silver');
      await achievementModule.unlock('user123', 'explorer', 'gold');
      
      expect(eventSpy).toHaveBeenCalledWith('points.award', expect.objectContaining({
        points: 500 * 5 // Gold multiplier
      }));
    });

    it('should update achievement score and leaderboard', async () => {
      await achievementModule.unlock('user123', 'explorer', 'bronze');
      
      const score = await achievementModule.getAchievementScore('user123');
      expect(score).toBe(100);
      
      const rank = await storage.zrevrank(
        achievementModule.getStorageKey('leaderboard'),
        'user123'
      );
      expect(rank).toBe(0);
    });

    it('should handle disabled achievements', async () => {
      testAchievement.enabled = false;
      achievementModule.achievements.set('explorer', testAchievement);
      
      const result = await achievementModule.unlock('user123', 'explorer', 'bronze');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('achievement_disabled');
    });

    it('should handle missing tier', async () => {
      const result = await achievementModule.unlock('user123', 'explorer', 'platinum');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('tier_not_found');
    });

    it('should validate inputs', async () => {
      await expect(achievementModule.unlock('', 'explorer', 'bronze'))
        .rejects.toThrow();
      
      await expect(achievementModule.unlock('user123', 'explorer', 'invalid'))
        .rejects.toThrow();
    });
  });

  describe('updateProgress', () => {
    beforeEach(() => {
      achievementModule.addAchievement({
        id: 'collector',
        name: 'Collector',
        tiers: {
          bronze: { requirement: 10 },
          silver: { requirement: 50 },
          gold: { requirement: 100 }
        }
      });
    });

    it('should increment progress', async () => {
      const result = await achievementModule.updateProgress('user123', 'collector', 5);
      expect(result.progress).toBe(5);
      expect(result.unlockedTiers).toEqual([]);
      
      const result2 = await achievementModule.updateProgress('user123', 'collector', 7);
      expect(result2.progress).toBe(12);
      expect(result2.unlockedTiers).toEqual(['bronze']);
    });

    it('should set absolute progress', async () => {
      const result = await achievementModule.updateProgress('user123', 'collector', 55, false);
      expect(result.progress).toBe(55);
      expect(result.unlockedTiers).toEqual(['bronze', 'silver']);
    });

    it('should respect tier progression', async () => {
      achievementModule.config.enableTierProgression = true;
      const result = await achievementModule.updateProgress('user123', 'collector', 60, false);
      expect(result.unlockedTiers).toEqual(['bronze', 'silver']);
    });

    it('should handle missing achievement', async () => {
      const result = await achievementModule.updateProgress('user123', 'nonexistent', 10);
      expect(result).toBeNull();
    });

    it('should emit progress events', async () => {
      const emitSpy = jest.spyOn(achievementModule, 'emitEvent');
      await achievementModule.updateProgress('user123', 'collector', 15);
      
      expect(emitSpy).toHaveBeenCalledWith('progress.updated', expect.objectContaining({
        userId: 'user123',
        achievementId: 'collector',
        progress: 15
      }));
    });
  });

  describe('getUserAchievements', () => {
    it('should return empty array for new user', async () => {
      const achievements = await achievementModule.getUserAchievements('newuser');
      expect(achievements).toEqual([]);
    });

    it('should return all user achievements', async () => {
      achievementModule.addAchievement({
        id: 'test1',
        name: 'Test 1',
        tiers: { bronze: { requirement: 1 } }
      });
      
      achievementModule.addAchievement({
        id: 'test2',
        name: 'Test 2',
        tiers: { bronze: { requirement: 1 } }
      });
      
      await achievementModule.unlock('user123', 'test1', 'bronze');
      await achievementModule.unlock('user123', 'test2', 'bronze');
      
      const achievements = await achievementModule.getUserAchievements('user123');
      expect(achievements).toHaveLength(2);
      expect(achievements[0].achievementId).toBe('test1');
      expect(achievements[1].achievementId).toBe('test2');
    });
  });

  describe('getUserProgress', () => {
    beforeEach(() => {
      achievementModule.addAchievement({
        id: 'test',
        name: 'Test',
        tiers: {
          bronze: { requirement: 10 },
          silver: { requirement: 50 },
          gold: { requirement: 100 }
        }
      });
    });

    it('should return progress for specific achievement', async () => {
      await achievementModule.updateProgress('user123', 'test', 25, false);
      await achievementModule.unlock('user123', 'test', 'bronze');
      
      const progress = await achievementModule.getUserProgress('user123', 'test');
      
      expect(progress.achievementId).toBe('test');
      expect(progress.progress).toBe(25);
      expect(progress.tiers.bronze.unlocked).toBe(true);
      expect(progress.tiers.bronze.percentage).toBe(100);
      expect(progress.tiers.silver.unlocked).toBe(false);
      expect(progress.tiers.silver.percentage).toBe(50);
      expect(progress.nextTier).toEqual({ tier: 'silver', requirement: 50 });
    });

    it('should return null for nonexistent achievement', async () => {
      const progress = await achievementModule.getUserProgress('user123', 'fake');
      expect(progress).toBeNull();
    });

    it('should return all progress when no achievement specified', async () => {
      achievementModule.addAchievement({
        id: 'test2',
        name: 'Test 2',
        tiers: { bronze: { requirement: 5 } }
      });
      
      await achievementModule.updateProgress('user123', 'test', 15, false);
      await achievementModule.updateProgress('user123', 'test2', 3, false);
      
      const allProgress = await achievementModule.getUserProgress('user123');
      
      expect(Object.keys(allProgress)).toContain('test');
      expect(Object.keys(allProgress)).toContain('test2');
      expect(allProgress.test.progress).toBe(15);
      expect(allProgress.test2.progress).toBe(3);
    });

    it('should exclude hidden achievements unless unlocked', async () => {
      achievementModule.addAchievement({
        id: 'hidden',
        name: 'Hidden',
        hidden: true,
        tiers: { bronze: { requirement: 1 } }
      });
      
      let allProgress = await achievementModule.getUserProgress('user123');
      expect(Object.keys(allProgress)).not.toContain('hidden');
      
      await achievementModule.unlock('user123', 'hidden', 'bronze');
      
      allProgress = await achievementModule.getUserProgress('user123');
      expect(Object.keys(allProgress)).toContain('hidden');
    });
  });

  describe('checkAchievementProgress', () => {
    it('should track events and update progress', async () => {
      achievementModule.addAchievement({
        id: 'login_streak',
        name: 'Login Streak',
        tiers: { bronze: { requirement: 5 } },
        trackingEvent: 'user.login',
        trackingField: 'streak'
      });
      
      const event = {
        eventName: 'user.login',
        data: { userId: 'user123', streak: 3 }
      };
      
      await achievementModule.checkAchievementProgress(event);
      
      const progress = await achievementModule.getUserProgress('user123', 'login_streak');
      expect(progress.progress).toBe(3);
    });

    it('should use default value when field missing', async () => {
      achievementModule.addAchievement({
        id: 'actions',
        name: 'Actions',
        tiers: { bronze: { requirement: 10 } },
        trackingEvent: 'action.performed'
      });
      
      const event = {
        eventName: 'action.performed',
        data: { userId: 'user123' }
      };
      
      await achievementModule.checkAchievementProgress(event);
      
      const progress = await achievementModule.getUserProgress('user123', 'actions');
      expect(progress.progress).toBe(1);
    });

    it('should ignore events without userId', async () => {
      achievementModule.addAchievement({
        id: 'test',
        name: 'Test',
        tiers: { bronze: { requirement: 1 } },
        trackingEvent: 'test.event'
      });
      
      const event = {
        eventName: 'test.event',
        data: { value: 5 }
      };
      
      await achievementModule.checkAchievementProgress(event);
      
      const progress = await achievementModule.getUserProgress('user123', 'test');
      expect(progress.progress).toBe(0);
    });
  });

  describe('getTopScorers', () => {
    it('should return top scorers with details', async () => {
      // Create achievements
      achievementModule.addAchievement({
        id: 'ach1',
        name: 'Achievement 1',
        tiers: {
          bronze: { requirement: 1 },
          silver: { requirement: 2 },
          gold: { requirement: 3 }
        }
      });
      
      // Unlock for different users
      await achievementModule.unlock('user1', 'ach1', 'bronze');
      await achievementModule.unlock('user1', 'ach1', 'silver');
      await achievementModule.unlock('user1', 'ach1', 'gold');
      
      await achievementModule.unlock('user2', 'ach1', 'bronze');
      await achievementModule.unlock('user2', 'ach1', 'silver');
      
      await achievementModule.unlock('user3', 'ach1', 'bronze');
      
      const topScorers = await achievementModule.getTopScorers(3);
      
      expect(topScorers).toHaveLength(3);
      expect(topScorers[0].userId).toBe('user1');
      expect(topScorers[0].rank).toBe(1);
      expect(topScorers[0].score).toBe(600); // 100 + 200 + 300
      expect(topScorers[0].totalAchievements).toBe(3);
      expect(topScorers[0].tierBreakdown).toEqual({
        bronze: 1,
        silver: 1,
        gold: 1
      });
    });

    it('should handle empty leaderboard', async () => {
      const topScorers = await achievementModule.getTopScorers(10);
      expect(topScorers).toEqual([]);
    });
  });

  describe('getAllAchievements', () => {
    it('should return all visible achievements', async () => {
      achievementModule.addAchievement({
        id: 'visible1',
        name: 'Visible 1',
        tiers: { bronze: { requirement: 1 } }
      });
      
      achievementModule.addAchievement({
        id: 'visible2',
        name: 'Visible 2',
        tiers: { bronze: { requirement: 1 } }
      });
      
      achievementModule.addAchievement({
        id: 'hidden1',
        name: 'Hidden 1',
        hidden: true,
        tiers: { bronze: { requirement: 1 } }
      });
      
      const achievements = await achievementModule.getAllAchievements();
      expect(achievements).toHaveLength(2);
      expect(achievements.map(a => a.id)).toEqual(['visible1', 'visible2']);
    });

    it('should include hidden when requested', async () => {
      achievementModule.addAchievement({
        id: 'visible',
        name: 'Visible',
        tiers: { bronze: { requirement: 1 } }
      });
      
      achievementModule.addAchievement({
        id: 'hidden',
        name: 'Hidden',
        hidden: true,
        tiers: { bronze: { requirement: 1 } }
      });
      
      const achievements = await achievementModule.getAllAchievements(true);
      expect(achievements).toHaveLength(2);
    });
  });

  describe('getAchievementStats', () => {
    it('should return achievement statistics', async () => {
      achievementModule.addAchievement({
        id: 'popular',
        name: 'Popular Achievement',
        tiers: {
          bronze: { requirement: 1 },
          silver: { requirement: 2 }
        }
      });
      
      // Unlock for multiple users
      for (let i = 1; i <= 15; i++) {
        await achievementModule.unlock(`user${i}`, 'popular', 'bronze');
      }
      
      for (let i = 1; i <= 5; i++) {
        await achievementModule.unlock(`user${i}`, 'popular', 'silver');
      }
      
      const stats = await achievementModule.getAchievementStats();
      
      expect(stats.popular.name).toBe('Popular Achievement');
      expect(stats.popular.tiers.bronze.unlocks).toBe(15);
      expect(stats.popular.tiers.bronze.rarity).toBe('epic');
      expect(stats.popular.tiers.silver.unlocks).toBe(5);
      expect(stats.popular.tiers.silver.rarity).toBe('legendary');
      expect(stats.popular.tiers.gold.unlocks).toBe(0);
      expect(stats.popular.tiers.gold.rarity).toBe('locked');
    });
  });

  describe('calculateRarity', () => {
    it('should calculate rarity based on unlock count', () => {
      expect(achievementModule.calculateRarity(0)).toBe('locked');
      expect(achievementModule.calculateRarity(5)).toBe('legendary');
      expect(achievementModule.calculateRarity(25)).toBe('epic');
      expect(achievementModule.calculateRarity(100)).toBe('rare');
      expect(achievementModule.calculateRarity(500)).toBe('uncommon');
      expect(achievementModule.calculateRarity(1500)).toBe('common');
    });
  });

  describe('getUserStats', () => {
    it('should return comprehensive user statistics', async () => {
      // Add achievements
      achievementModule.addAchievement({
        id: 'gameplay1',
        name: 'Gameplay 1',
        category: 'gameplay',
        tiers: {
          bronze: { requirement: 1 },
          silver: { requirement: 2 },
          gold: { requirement: 3 }
        }
      });
      
      achievementModule.addAchievement({
        id: 'social1',
        name: 'Social 1',
        category: 'social',
        tiers: { bronze: { requirement: 1 } }
      });
      
      achievementModule.addAchievement({
        id: 'hidden1',
        name: 'Hidden 1',
        hidden: true,
        tiers: { bronze: { requirement: 1 } }
      });
      
      // Unlock achievements
      await achievementModule.unlock('user123', 'gameplay1', 'bronze');
      await achievementModule.unlock('user123', 'gameplay1', 'silver');
      await achievementModule.unlock('user123', 'social1', 'bronze');
      
      const stats = await achievementModule.getUserStats('user123');
      
      expect(stats.score).toBe(400); // 100 + 200 + 100
      expect(stats.rank).toBe(1);
      expect(stats.totalUnlocks).toBe(3);
      expect(stats.uniqueAchievements).toBe(2);
      expect(stats.byCategory).toEqual({
        gameplay: 2,
        social: 1
      });
      expect(stats.byTier).toEqual({
        bronze: 2,
        silver: 1
      });
      expect(stats.completion.achievements).toBe(100); // 2/2 visible
      expect(stats.completion.totalUnlocks).toBe(50); // 3/6 possible
      expect(stats.recentUnlocks).toHaveLength(3);
    });
  });

  describe('resetUser', () => {
    it('should reset all user achievement data', async () => {
      // Setup achievements and unlocks
      achievementModule.addAchievement({
        id: 'test',
        name: 'Test',
        tiers: { bronze: { requirement: 10 } }
      });
      
      await achievementModule.updateProgress('user123', 'test', 5);
      await achievementModule.unlock('user123', 'test', 'bronze');
      
      // Verify data exists
      let achievements = await achievementModule.getUserAchievements('user123');
      expect(achievements).toHaveLength(1);
      
      let score = await achievementModule.getAchievementScore('user123');
      expect(score).toBeGreaterThan(0);
      
      // Reset user
      await achievementModule.resetUser('user123');
      
      // Verify data is cleared
      achievements = await achievementModule.getUserAchievements('user123');
      expect(achievements).toEqual([]);
      
      score = await achievementModule.getAchievementScore('user123');
      expect(score).toBe(0);
      
      const progress = await achievementModule.getUserProgress('user123', 'test');
      expect(progress.progress).toBe(0);
      
      const rank = await storage.zrevrank(
        achievementModule.getStorageKey('leaderboard'),
        'user123'
      );
      expect(rank).toBeNull();
    });

    it('should emit reset event', async () => {
      const emitSpy = jest.spyOn(achievementModule, 'emitEvent');
      await achievementModule.resetUser('user123');
      
      expect(emitSpy).toHaveBeenCalledWith('user.reset', { userId: 'user123' });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle concurrent unlocks', async () => {
      achievementModule.addAchievement({
        id: 'concurrent',
        name: 'Concurrent',
        tiers: { bronze: { requirement: 1 } }
      });
      
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(achievementModule.unlock('user123', 'concurrent', 'bronze'));
      }
      
      const results = await Promise.all(promises);
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      expect(successful).toBe(1);
      expect(failed).toBe(4);
    });

    it('should handle invalid achievement IDs gracefully', async () => {
      await expect(achievementModule.unlock('user123', 'nonexistent', 'bronze'))
        .rejects.toThrow('Achievement not found');
    });

    it('should handle storage errors gracefully', async () => {
      const errorStorage = {
        get: jest.fn().mockRejectedValue(new Error('Storage error')),
        set: jest.fn().mockRejectedValue(new Error('Storage error')),
        lrange: jest.fn().mockRejectedValue(new Error('Storage error'))
      };
      
      const module = new AchievementModule();
      module.setContext({
        storage: errorStorage,
        eventManager,
        logger,
        config: {}
      });
      
      await module.initialize();
      
      await expect(module.getUserAchievements('user123'))
        .rejects.toThrow('Storage error');
    });
  });
});