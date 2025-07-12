import { jest } from '@jest/globals';
import { BadgeModule } from '../../../src/modules/BadgeModule.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { EventManager } from '../../../src/core/EventManager.js';
import { Logger } from '../../../src/utils/logger.js';

describe('BadgeModule', () => {
  let badgeModule;
  let storage;
  let eventManager;
  let logger;

  beforeEach(async () => {
    storage = new MemoryStorage();
    eventManager = new EventManager();
    logger = new Logger({ prefix: 'BadgeModule' });
    await storage.connect();

    badgeModule = new BadgeModule([], {
      autoAward: true,
      allowDuplicates: false
    });

    badgeModule.setContext({
      storage,
      eventManager,
      logger,
      config: {}
    });
    
    await badgeModule.initialize();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const module = new BadgeModule();
      expect(module.name).toBe('badges');
      expect(module.defaultConfig.autoAward).toBe(true);
      expect(module.defaultConfig.allowDuplicates).toBe(false);
    });

    it('should accept badges and options', () => {
      const badges = [
        { id: 'badge1', name: 'Badge 1' }
      ];
      const module = new BadgeModule(badges, {
        autoAward: false,
        allowDuplicates: true
      });
      
      expect(module.badges.size).toBe(1);
      expect(module.badges.has('badge1')).toBe(true);
    });

    it('should initialize with badges array', () => {
      const badges = [
        { id: 'badge1', name: 'Badge 1' },
        { id: 'badge2', name: 'Badge 2' }
      ];
      const module = new BadgeModule(badges);
      
      expect(module.badges.size).toBe(2);
    });
  });

  describe('addBadge', () => {
    it('should add a badge', () => {
      const badge = {
        id: 'first-login',
        name: 'First Login',
        description: 'Login for the first time',
        icon: 'https://example.com/badge.png',
        category: 'onboarding',
        rarity: 'common'
      };

      const result = badgeModule.addBadge(badge);

      expect(result).toEqual({
        id: 'first-login',
        name: 'First Login',
        description: 'Login for the first time',
        category: 'onboarding',
        rarity: 'common',
        icon: 'https://example.com/badge.png',
        metadata: {},
        conditions: {},
        rewards: {},
        secret: false,
        enabled: true,
        priority: 0,
        maxAwards: 1,
        expiresIn: null,
        createdAt: expect.any(Number)
      });

      const retrieved = badgeModule.badges.get('first-login');
      expect(retrieved).toEqual(result);
    });

    it('should validate required fields', () => {
      expect(() => {
        badgeModule.addBadge({ name: 'Invalid' });
      }).toThrow('badge must have property: id');
    });

    it('should allow adding badges with same id (overwrites)', () => {
      badgeModule.addBadge({
        id: 'badge1',
        name: 'Badge 1'
      });

      const updated = badgeModule.addBadge({
        id: 'badge1',
        name: 'Badge 1 Updated'
      });

      expect(updated.name).toBe('Badge 1 Updated');
      expect(badgeModule.badges.size).toBe(1);
    });

    it('should support badges with conditions', () => {
      const badge = {
        id: 'high-scorer',
        name: 'High Scorer',
        conditions: {
          triggers: [{
            event: 'points.milestone',
            conditions: {
              milestone: { min: 1000 }
            }
          }]
        }
      };

      const result = badgeModule.addBadge(badge);
      expect(result.conditions).toEqual(badge.conditions);
    });

    it('should support progress-based badges', () => {
      const badge = {
        id: 'collector',
        name: 'Collector',
        conditions: {
          progress: {
            items: { target: 10 }
          }
        }
      };

      const result = badgeModule.addBadge(badge);
      expect(result.conditions.progress).toEqual(badge.conditions.progress);
    });
  });

  describe('award', () => {
    beforeEach(() => {
      badgeModule.addBadge({
        id: 'test-badge',
        name: 'Test Badge',
        description: 'A test badge'
      });
    });

    it('should award badge to user', async () => {
      const result = await badgeModule.award('user123', 'test-badge', {
        reason: 'manual award'
      });

      expect(result).toEqual({
        success: true,
        award: expect.objectContaining({
          id: expect.stringMatching(/^award_/),
          userId: 'user123',
          badgeId: 'test-badge',
          badge: {
            name: 'Test Badge',
            description: 'A test badge',
            category: 'general',
            rarity: 'common',
            icon: null
          },
          awardedAt: expect.any(Number),
          expiresAt: null,
          metadata: {
            reason: 'manual award'
          }
        })
      });

      const userBadges = await badgeModule.getUserBadges('user123');
      expect(userBadges).toHaveLength(1);
      expect(userBadges[0].badgeId).toBe('test-badge');
    });

    it('should prevent duplicate awards when maxAwards is 1', async () => {
      await badgeModule.award('user123', 'test-badge');
      
      const result = await badgeModule.award('user123', 'test-badge');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('max_awards_reached');
      expect(result.maxAwards).toBe(1);
    });

    it('should allow multiple awards when maxAwards > 1', async () => {
      badgeModule.addBadge({
        id: 'multi-badge',
        name: 'Multi Badge',
        maxAwards: 3
      });

      const result1 = await badgeModule.award('user123', 'multi-badge');
      const result2 = await badgeModule.award('user123', 'multi-badge');
      const result3 = await badgeModule.award('user123', 'multi-badge');
      const result4 = await badgeModule.award('user123', 'multi-badge');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
      expect(result4.success).toBe(false);
      expect(result4.reason).toBe('max_awards_reached');

      const userBadges = await badgeModule.getUserBadges('user123');
      const multiBadges = userBadges.filter(b => b.badgeId === 'multi-badge');
      expect(multiBadges).toHaveLength(3);
    });

    it('should emit badges.awarded event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emitAsync');

      await badgeModule.award('user123', 'test-badge');

      expect(emitSpy).toHaveBeenCalledWith('badges.awarded', 
        expect.objectContaining({
          userId: 'user123',
          badgeId: 'test-badge',
          badge: expect.any(Object),
          award: expect.any(Object),
          module: 'badges'
        })
      );
    });

    it('should handle badge not found', async () => {
      await expect(
        badgeModule.award('user123', 'non-existent')
      ).rejects.toThrow('Badge not found: non-existent');
    });

    it('should not award disabled badges', async () => {
      badgeModule.addBadge({
        id: 'disabled-badge',
        name: 'Disabled Badge',
        enabled: false
      });

      const result = await badgeModule.award('user123', 'disabled-badge');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('badge_disabled');
    });

    it('should handle badges with expiration', async () => {
      badgeModule.addBadge({
        id: 'expiring-badge',
        name: 'Expiring Badge',
        expiresIn: 3600 // 1 hour in seconds
      });

      const result = await badgeModule.award('user123', 'expiring-badge');
      
      expect(result.success).toBe(true);
      expect(result.award.expiresAt).toBe(result.award.awardedAt + 3600000);
    });
  });

  describe('revoke', () => {
    beforeEach(async () => {
      badgeModule.addBadge({
        id: 'revokable',
        name: 'Revokable Badge'
      });
      await badgeModule.award('user123', 'revokable');
    });

    it('should revoke badge from user', async () => {
      const result = await badgeModule.revoke('user123', 'revokable');

      expect(result.success).toBe(true);

      const hasBadge = await badgeModule.hasBadge('user123', 'revokable');
      expect(hasBadge).toBe(false);
    });

    it('should emit badges.revoked event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emitAsync');

      await badgeModule.revoke('user123', 'revokable');

      expect(emitSpy).toHaveBeenCalledWith('badges.revoked', 
        expect.objectContaining({
          userId: 'user123',
          badgeId: 'revokable',
          module: 'badges'
        })
      );
    });

    it('should handle badge not awarded', async () => {
      const result = await badgeModule.revoke('user456', 'revokable');

      expect(result.success).toBe(false);
    });
  });

  describe('getUserBadges', () => {
    beforeEach(async () => {
      badgeModule.addBadge({ id: 'badge1', name: 'Badge 1', category: 'social' });
      badgeModule.addBadge({ id: 'badge2', name: 'Badge 2', category: 'achievement' });
      badgeModule.addBadge({ id: 'badge3', name: 'Badge 3', category: 'social' });
      badgeModule.addBadge({ id: 'badge4', name: 'Badge 4', rarity: 'rare' });

      await badgeModule.award('user123', 'badge1');
      await badgeModule.award('user123', 'badge2');
      await badgeModule.award('user123', 'badge3');
    });

    it('should return all user badges', async () => {
      const badges = await badgeModule.getUserBadges('user123');

      expect(badges).toHaveLength(3);
      expect(badges.map(b => b.badgeId).sort()).toEqual(['badge1', 'badge2', 'badge3']);
    });

    it('should include award metadata', async () => {
      const badges = await badgeModule.getUserBadges('user123');

      badges.forEach(award => {
        expect(award.awardedAt).toBeDefined();
        expect(award.id).toMatch(/^award_/);
        expect(award.badge).toBeDefined();
      });
    });

    it('should return empty array for user with no badges', async () => {
      const badges = await badgeModule.getUserBadges('newuser');
      expect(badges).toEqual([]);
    });

    it('should filter out expired badges', async () => {
      // Add an expired badge
      badgeModule.addBadge({
        id: 'expired-badge',
        name: 'Expired Badge',
        expiresIn: -1 // Already expired
      });

      await badgeModule.award('user123', 'expired-badge');
      
      const badges = await badgeModule.getUserBadges('user123');
      const expiredBadge = badges.find(b => b.badgeId === 'expired-badge');
      expect(expiredBadge).toBeUndefined();
    });
  });

  describe('hasBadge', () => {
    beforeEach(async () => {
      badgeModule.addBadge({ id: 'test-badge', name: 'Test Badge' });
      await badgeModule.award('user123', 'test-badge');
    });

    it('should return true if user has badge', async () => {
      const hasBadge = await badgeModule.hasBadge('user123', 'test-badge');
      expect(hasBadge).toBe(true);
    });

    it('should return false if user does not have badge', async () => {
      const hasBadge = await badgeModule.hasBadge('user456', 'test-badge');
      expect(hasBadge).toBe(false);
    });

    it('should return false for non-existent badge', async () => {
      const hasBadge = await badgeModule.hasBadge('user123', 'non-existent');
      expect(hasBadge).toBe(false);
    });
  });

  describe('getAllBadges', () => {
    beforeEach(() => {
      badgeModule.addBadge({ 
        id: 'common1', 
        name: 'Common 1', 
        rarity: 'common',
        category: 'social' 
      });
      badgeModule.addBadge({ 
        id: 'rare1', 
        name: 'Rare 1', 
        rarity: 'rare',
        category: 'achievement'
      });
      badgeModule.addBadge({ 
        id: 'legendary1', 
        name: 'Legendary 1', 
        rarity: 'legendary',
        category: 'achievement',
        secret: true
      });
    });

    it('should return all non-secret badges by default', async () => {
      const badges = await badgeModule.getAllBadges();

      expect(badges).toHaveLength(2);
      expect(badges.map(b => b.id).sort()).toEqual(['common1', 'rare1']);
    });

    it('should include secret badges when requested', async () => {
      const badges = await badgeModule.getAllBadges(true);

      expect(badges).toHaveLength(3);
      expect(badges.map(b => b.id).sort()).toEqual(['common1', 'legendary1', 'rare1']);
    });
  });

  describe('progress tracking', () => {
    beforeEach(() => {
      badgeModule.addBadge({
        id: 'reader',
        name: 'Avid Reader',
        conditions: {
          progress: {
            articles: { target: 50 }
          }
        }
      });
    });

    it('should track progress', async () => {
      await badgeModule.updateProgress('user123', 'reader', 'articles', 10);
      
      const progress = await badgeModule.getProgress('user123', 'reader');
      expect(progress).toEqual({
        badgeId: 'reader',
        userId: 'user123',
        requirements: {
          articles: {
            current: 10,
            target: 50,
            percentage: 20,
            completed: false
          }
        },
        completed: false
      });
    });

    it('should increment progress', async () => {
      await badgeModule.updateProgress('user123', 'reader', 'articles', 10);
      await badgeModule.updateProgress('user123', 'reader', 'articles', 5);
      
      const progress = await badgeModule.getProgress('user123', 'reader');
      expect(progress.requirements.articles.current).toBe(15);
    });

    it('should auto-award when target reached', async () => {
      await badgeModule.updateProgress('user123', 'reader', 'articles', 45);
      await badgeModule.updateProgress('user123', 'reader', 'articles', 5);
      
      const progress = await badgeModule.getProgress('user123', 'reader');
      expect(progress.completed).toBe(true);
      
      const hasBadge = await badgeModule.hasBadge('user123', 'reader');
      expect(hasBadge).toBe(true);
    });

    it('should emit badges.progress.updated event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emitAsync');
      
      await badgeModule.updateProgress('user123', 'reader', 'articles', 25);
      
      expect(emitSpy).toHaveBeenCalledWith('badges.progress.updated', 
        expect.objectContaining({
          userId: 'user123',
          badgeId: 'reader',
          key: 'articles',
          value: 25,
          progress: expect.any(Object),
          module: 'badges'
        })
      );
    });

    it('should handle multiple progress requirements', async () => {
      badgeModule.addBadge({
        id: 'multi-progress',
        name: 'Multi Progress',
        conditions: {
          progress: {
            articles: { target: 10 },
            comments: { target: 5 }
          }
        }
      });

      await badgeModule.updateProgress('user123', 'multi-progress', 'articles', 10);
      await badgeModule.updateProgress('user123', 'multi-progress', 'comments', 3);

      const progress = await badgeModule.getProgress('user123', 'multi-progress');
      expect(progress.completed).toBe(false);
      expect(progress.requirements.articles.completed).toBe(true);
      expect(progress.requirements.comments.completed).toBe(false);

      await badgeModule.updateProgress('user123', 'multi-progress', 'comments', 2);
      const finalProgress = await badgeModule.getProgress('user123', 'multi-progress');
      expect(finalProgress.completed).toBe(true);
    });
  });

  describe('getUserStats', () => {
    beforeEach(async () => {
      badgeModule.addBadge({ id: 'b1', name: 'B1', category: 'social', rarity: 'common' });
      badgeModule.addBadge({ id: 'b2', name: 'B2', category: 'achievement', rarity: 'rare' });
      badgeModule.addBadge({ id: 'b3', name: 'B3', category: 'social', rarity: 'common' });
      badgeModule.addBadge({ id: 'b4', name: 'B4', category: 'special', rarity: 'legendary' });
      
      await badgeModule.award('user123', 'b1');
      await badgeModule.award('user123', 'b2');
      await badgeModule.award('user123', 'b3');
    });

    it('should return comprehensive stats', async () => {
      const stats = await badgeModule.getUserStats('user123');

      expect(stats).toEqual({
        total: 3,
        badges: expect.arrayContaining([
          expect.objectContaining({ name: 'B1' }),
          expect.objectContaining({ name: 'B2' }),
          expect.objectContaining({ name: 'B3' })
        ]),
        byCategory: {
          social: 2,
          achievement: 1
        },
        byRarity: {
          common: 2,
          rare: 1
        },
        progress: [],
        completion: {
          earned: 3,
          available: 4,
          percentage: 75
        }
      });
    });

    it('should include progress for incomplete badges', async () => {
      badgeModule.addBadge({
        id: 'progress-badge',
        name: 'Progress Badge',
        conditions: {
          progress: {
            items: { target: 10 }
          }
        }
      });

      await badgeModule.updateProgress('user123', 'progress-badge', 'items', 5);

      const stats = await badgeModule.getUserStats('user123');
      expect(stats.progress).toHaveLength(1);
      expect(stats.progress[0]).toEqual({
        badge: {
          id: 'progress-badge',
          name: 'Progress Badge',
          description: ''
        },
        progress: expect.objectContaining({
          completed: false,
          requirements: {
            items: {
              current: 5,
              target: 10,
              percentage: 50,
              completed: false
            }
          }
        })
      });
    });
  });

  describe('resetUser', () => {
    beforeEach(async () => {
      badgeModule.addBadge({ id: 'b1', name: 'B1' });
      badgeModule.addBadge({ 
        id: 'b2', 
        name: 'B2',
        conditions: {
          progress: {
            items: { target: 10 }
          }
        }
      });
      
      await badgeModule.award('user123', 'b1');
      await badgeModule.updateProgress('user123', 'b2', 'items', 5);
    });

    it('should reset all user data', async () => {
      await badgeModule.resetUser('user123');

      const badges = await badgeModule.getUserBadges('user123');
      expect(badges).toEqual([]);

      const progress = await badgeModule.getProgress('user123', 'b2');
      expect(progress.requirements.items.current).toBe(0);
    });

    it('should emit badges.user.reset event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emitAsync');

      await badgeModule.resetUser('user123');

      expect(emitSpy).toHaveBeenCalledWith('badges.user.reset', 
        expect.objectContaining({
          userId: 'user123',
          module: 'badges'
        })
      );
    });
  });

  describe('error handling', () => {
    it('should validate badge data', () => {
      // Empty string is allowed by current implementation
      expect(() => {
        badgeModule.addBadge({ id: '', name: 'Empty ID' });
      }).not.toThrow();

      expect(() => {
        badgeModule.addBadge({ id: 'no-name' });
      }).toThrow('badge must have property: name');
    });

    it('should handle concurrent awards', async () => {
      badgeModule.addBadge({ id: 'concurrent', name: 'Concurrent Badge' });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(badgeModule.award(`user${i}`, 'concurrent'));
      }

      const results = await Promise.all(promises);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('removeBadge', () => {
    it('should remove a badge', () => {
      badgeModule.addBadge({ id: 'removable', name: 'Removable Badge' });
      expect(badgeModule.badges.has('removable')).toBe(true);

      const removed = badgeModule.removeBadge('removable');
      expect(removed).toBe(true);
      expect(badgeModule.badges.has('removable')).toBe(false);
    });

    it('should return false for non-existent badge', () => {
      const removed = badgeModule.removeBadge('non-existent');
      expect(removed).toBe(false);
    });

    it('should remove associated progress trackers', () => {
      badgeModule.addBadge({
        id: 'tracked',
        name: 'Tracked Badge',
        conditions: {
          progress: { items: { target: 10 } }
        }
      });

      badgeModule.setupProgressTracker(badgeModule.badges.get('tracked'));
      expect(badgeModule.progressTrackers.has('tracked')).toBe(true);

      badgeModule.removeBadge('tracked');
      expect(badgeModule.progressTrackers.has('tracked')).toBe(false);
    });
  });

  describe('getBadgeStats', () => {
    beforeEach(async () => {
      badgeModule.addBadge({ id: 'b1', name: 'Badge 1', category: 'social', rarity: 'common' });
      badgeModule.addBadge({ id: 'b2', name: 'Badge 2', category: 'achievement', rarity: 'rare' });

      // Award badges to create stats
      for (let i = 0; i < 15; i++) {
        await badgeModule.award(`user${i}`, 'b1');
      }
      for (let i = 0; i < 5; i++) {
        await badgeModule.award(`user${i}`, 'b2');
      }
    });

    it('should return badge statistics', async () => {
      const stats = await badgeModule.getBadgeStats();

      expect(stats).toEqual({
        b1: {
          badge: {
            name: 'Badge 1',
            category: 'social',
            rarity: 'common'
          },
          awardCount: 15,
          rarity: 'rare'
        },
        b2: {
          badge: {
            name: 'Badge 2',
            category: 'achievement',
            rarity: 'rare'
          },
          awardCount: 5,
          rarity: 'ultra_rare'
        }
      });
    });
  });
});