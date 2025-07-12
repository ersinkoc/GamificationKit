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

    badgeModule = new BadgeModule({
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

    it('should accept custom options', () => {
      const module = new BadgeModule({
        autoAward: false,
        allowDuplicates: true
      });
      
      expect(module.options.autoAward).toBe(false);
      expect(module.options.allowDuplicates).toBe(true);
    });
  });

  describe('create', () => {
    it('should create a badge', async () => {
      const badge = {
        id: 'first-login',
        name: 'First Login',
        description: 'Login for the first time',
        imageUrl: 'https://example.com/badge.png',
        category: 'onboarding',
        rarity: 'common'
      };

      const result = await badgeModule.create(badge);

      expect(result).toEqual({
        ...badge,
        createdAt: expect.any(Date),
        totalAwarded: 0
      });

      const retrieved = await badgeModule.get('first-login');
      expect(retrieved).toEqual(result);
    });

    it('should validate required fields', async () => {
      await expect(
        badgeModule.create({ name: 'Invalid' })
      ).rejects.toThrow('Badge must have id and name');
    });

    it('should prevent duplicate badge ids', async () => {
      await badgeModule.create({
        id: 'badge1',
        name: 'Badge 1'
      });

      await expect(
        badgeModule.create({
          id: 'badge1',
          name: 'Badge 1 Duplicate'
        })
      ).rejects.toThrow('Badge with id badge1 already exists');
    });

    it('should support auto-award conditions', async () => {
      const badge = {
        id: 'high-scorer',
        name: 'High Scorer',
        autoAward: true,
        condition: {
          event: 'points.milestone',
          field: 'milestone',
          operator: '>=',
          value: 1000
        }
      };

      const result = await badgeModule.create(badge);
      expect(result.condition).toEqual(badge.condition);
    });

    it('should validate condition operators', async () => {
      const badge = {
        id: 'invalid-condition',
        name: 'Invalid',
        condition: {
          operator: 'invalid',
          value: 100
        }
      };

      await expect(badgeModule.create(badge)).rejects.toThrow('Invalid condition operator');
    });
  });

  describe('award', () => {
    beforeEach(async () => {
      await badgeModule.create({
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
        badge: expect.objectContaining({
          id: 'test-badge',
          name: 'Test Badge'
        }),
        awardedAt: expect.any(Date),
        isNew: true
      });

      const userBadges = await badgeModule.getUserBadges('user123');
      expect(userBadges).toHaveLength(1);
      expect(userBadges[0].id).toBe('test-badge');
    });

    it('should prevent duplicate awards when not allowed', async () => {
      await badgeModule.award('user123', 'test-badge');
      
      const result = await badgeModule.award('user123', 'test-badge');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User already has this badge');
      expect(result.alreadyAwarded).toBe(true);
    });

    it('should allow duplicate awards when enabled', async () => {
      await badgeModule.create({
        id: 'duplicate-badge',
        name: 'Duplicate Badge',
        allowDuplicates: true
      });

      const result1 = await badgeModule.award('user123', 'duplicate-badge');
      const result2 = await badgeModule.award('user123', 'duplicate-badge');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const userBadges = await badgeModule.getUserBadges('user123');
      const duplicates = userBadges.filter(b => b.id === 'duplicate-badge');
      expect(duplicates).toHaveLength(2);
    });

    it('should emit badge.awarded event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      await badgeModule.award('user123', 'test-badge');

      expect(emitSpy).toHaveBeenCalledWith('badge.awarded', {
        userId: 'user123',
        badge: expect.objectContaining({
          id: 'test-badge',
          name: 'Test Badge'
        }),
        awardedAt: expect.any(Date),
        isNew: true
      });
    });

    it('should track progress for progressive badges', async () => {
      await badgeModule.create({
        id: 'collector',
        name: 'Collector',
        progressive: true,
        target: 10,
        unit: 'items'
      });

      // Update progress
      await badgeModule.updateProgress('user123', 'collector', 3);
      let progress = await badgeModule.getProgress('user123', 'collector');
      expect(progress.current).toBe(3);
      expect(progress.percentage).toBe(30);

      // Update more progress
      await badgeModule.updateProgress('user123', 'collector', 5);
      progress = await badgeModule.getProgress('user123', 'collector');
      expect(progress.current).toBe(8);
      expect(progress.percentage).toBe(80);

      // Complete the badge
      await badgeModule.updateProgress('user123', 'collector', 2);
      
      const userBadges = await badgeModule.getUserBadges('user123');
      expect(userBadges).toContainEqual(
        expect.objectContaining({ id: 'collector' })
      );
    });

    it('should handle badge not found', async () => {
      const result = await badgeModule.award('user123', 'non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Badge not found');
    });

    it('should increment totalAwarded counter', async () => {
      await badgeModule.award('user123', 'test-badge');
      await badgeModule.award('user456', 'test-badge');

      const badge = await badgeModule.get('test-badge');
      expect(badge.totalAwarded).toBe(2);
    });
  });

  describe('revoke', () => {
    beforeEach(async () => {
      await badgeModule.create({
        id: 'revokable',
        name: 'Revokable Badge'
      });
      await badgeModule.award('user123', 'revokable');
    });

    it('should revoke badge from user', async () => {
      const result = await badgeModule.revoke('user123', 'revokable', {
        reason: 'rule violation'
      });

      expect(result.success).toBe(true);
      expect(result.revokedAt).toBeDefined();

      const userBadges = await badgeModule.getUserBadges('user123');
      expect(userBadges).not.toContainEqual(
        expect.objectContaining({ id: 'revokable' })
      );
    });

    it('should emit badge.revoked event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      await badgeModule.revoke('user123', 'revokable', {
        reason: 'test revoke'
      });

      expect(emitSpy).toHaveBeenCalledWith('badge.revoked', {
        userId: 'user123',
        badgeId: 'revokable',
        reason: 'test revoke',
        revokedAt: expect.any(Date)
      });
    });

    it('should handle badge not awarded', async () => {
      const result = await badgeModule.revoke('user456', 'revokable');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User does not have this badge');
    });

    it('should decrement totalAwarded counter', async () => {
      let badge = await badgeModule.get('revokable');
      const initialCount = badge.totalAwarded;

      await badgeModule.revoke('user123', 'revokable');

      badge = await badgeModule.get('revokable');
      expect(badge.totalAwarded).toBe(initialCount - 1);
    });
  });

  describe('getUserBadges', () => {
    beforeEach(async () => {
      await badgeModule.create({ id: 'badge1', name: 'Badge 1', category: 'social' });
      await badgeModule.create({ id: 'badge2', name: 'Badge 2', category: 'achievement' });
      await badgeModule.create({ id: 'badge3', name: 'Badge 3', category: 'social' });
      await badgeModule.create({ id: 'badge4', name: 'Badge 4', rarity: 'rare' });

      await badgeModule.award('user123', 'badge1');
      await badgeModule.award('user123', 'badge2');
      await badgeModule.award('user123', 'badge3');
    });

    it('should return all user badges', async () => {
      const badges = await badgeModule.getUserBadges('user123');

      expect(badges).toHaveLength(3);
      expect(badges.map(b => b.id)).toEqual(['badge1', 'badge2', 'badge3']);
    });

    it('should filter by category', async () => {
      const socialBadges = await badgeModule.getUserBadges('user123', {
        category: 'social'
      });

      expect(socialBadges).toHaveLength(2);
      expect(socialBadges.map(b => b.id)).toEqual(['badge1', 'badge3']);
    });

    it('should include award metadata', async () => {
      const badges = await badgeModule.getUserBadges('user123');

      badges.forEach(badge => {
        expect(badge.awardedAt).toBeDefined();
        expect(badge.awardId).toBeDefined();
      });
    });

    it('should return empty array for user with no badges', async () => {
      const badges = await badgeModule.getUserBadges('newuser');
      expect(badges).toEqual([]);
    });
  });

  describe('hasBadge', () => {
    beforeEach(async () => {
      await badgeModule.create({ id: 'test-badge', name: 'Test Badge' });
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
    beforeEach(async () => {
      await badgeModule.create({ 
        id: 'common1', 
        name: 'Common 1', 
        rarity: 'common',
        category: 'social' 
      });
      await badgeModule.create({ 
        id: 'rare1', 
        name: 'Rare 1', 
        rarity: 'rare',
        category: 'achievement'
      });
      await badgeModule.create({ 
        id: 'legendary1', 
        name: 'Legendary 1', 
        rarity: 'legendary',
        category: 'achievement',
        secret: true
      });
    });

    it('should return all badges', async () => {
      const badges = await badgeModule.getAllBadges();

      expect(badges).toHaveLength(3);
      expect(badges.map(b => b.id).sort()).toEqual(['common1', 'legendary1', 'rare1']);
    });

    it('should filter by category', async () => {
      const achievementBadges = await badgeModule.getAllBadges({ 
        category: 'achievement' 
      });

      expect(achievementBadges).toHaveLength(2);
      expect(achievementBadges.map(b => b.id).sort()).toEqual(['legendary1', 'rare1']);
    });

    it('should filter by rarity', async () => {
      const rareBadges = await badgeModule.getAllBadges({ 
        rarity: 'rare' 
      });

      expect(rareBadges).toHaveLength(1);
      expect(rareBadges[0].id).toBe('rare1');
    });

    it('should exclude secret badges by default', async () => {
      const badges = await badgeModule.getAllBadges({ 
        includeSecret: false 
      });

      expect(badges).toHaveLength(2);
      expect(badges.map(b => b.id)).not.toContain('legendary1');
    });
  });

  describe('auto-award', () => {
    beforeEach(async () => {
      await badgeModule.create({
        id: 'points-100',
        name: '100 Points',
        autoAward: true,
        condition: {
          event: 'points.awarded',
          field: 'newBalance',
          operator: '>=',
          value: 100
        }
      });

      await badgeModule.create({
        id: 'first-purchase',
        name: 'First Purchase',
        autoAward: true,
        condition: {
          event: 'purchase.complete',
          field: 'isFirst',
          operator: '==',
          value: true
        }
      });
    });

    it('should auto-award badge on matching event', async () => {
      await eventManager.emit('points.awarded', {
        userId: 'user123',
        points: 150,
        newBalance: 150
      });

      // Give auto-award time to process
      await new Promise(resolve => setTimeout(resolve, 10));

      const userBadges = await badgeModule.getUserBadges('user123');
      expect(userBadges).toContainEqual(
        expect.objectContaining({ id: 'points-100' })
      );
    });

    it('should not auto-award if condition not met', async () => {
      await eventManager.emit('points.awarded', {
        userId: 'user123',
        points: 50,
        newBalance: 50
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const userBadges = await badgeModule.getUserBadges('user123');
      expect(userBadges).toHaveLength(0);
    });

    it('should handle complex conditions', async () => {
      await badgeModule.create({
        id: 'power-user',
        name: 'Power User',
        autoAward: true,
        condition: {
          operator: 'and',
          conditions: [
            {
              event: 'user.activity',
              field: 'loginStreak',
              operator: '>=',
              value: 7
            },
            {
              event: 'user.activity',
              field: 'totalActions',
              operator: '>',
              value: 100
            }
          ]
        }
      });

      await eventManager.emit('user.activity', {
        userId: 'user123',
        loginStreak: 10,
        totalActions: 150
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const userBadges = await badgeModule.getUserBadges('user123');
      expect(userBadges).toContainEqual(
        expect.objectContaining({ id: 'power-user' })
      );
    });
  });

  describe('categories', () => {
    it('should get all categories', async () => {
      await badgeModule.create({ id: 'b1', name: 'B1', category: 'social' });
      await badgeModule.create({ id: 'b2', name: 'B2', category: 'achievement' });
      await badgeModule.create({ id: 'b3', name: 'B3', category: 'social' });
      await badgeModule.create({ id: 'b4', name: 'B4', category: 'special' });

      const categories = await badgeModule.getCategories();
      expect(categories.sort()).toEqual(['achievement', 'social', 'special']);
    });

    it('should count badges per category', async () => {
      await badgeModule.create({ id: 'b1', name: 'B1', category: 'social' });
      await badgeModule.create({ id: 'b2', name: 'B2', category: 'social' });
      await badgeModule.create({ id: 'b3', name: 'B3', category: 'achievement' });

      const stats = await badgeModule.getCategoryStats();
      expect(stats).toEqual({
        social: 2,
        achievement: 1
      });
    });
  });

  describe('progress tracking', () => {
    beforeEach(async () => {
      await badgeModule.create({
        id: 'reader',
        name: 'Avid Reader',
        progressive: true,
        target: 50,
        unit: 'articles'
      });
    });

    it('should track progress', async () => {
      await badgeModule.updateProgress('user123', 'reader', 10);
      
      const progress = await badgeModule.getProgress('user123', 'reader');
      expect(progress).toEqual({
        current: 10,
        target: 50,
        percentage: 20,
        unit: 'articles',
        completed: false
      });
    });

    it('should increment progress', async () => {
      await badgeModule.updateProgress('user123', 'reader', 10);
      await badgeModule.incrementProgress('user123', 'reader', 5);
      
      const progress = await badgeModule.getProgress('user123', 'reader');
      expect(progress.current).toBe(15);
    });

    it('should auto-award when target reached', async () => {
      await badgeModule.updateProgress('user123', 'reader', 45);
      await badgeModule.updateProgress('user123', 'reader', 5);
      
      const progress = await badgeModule.getProgress('user123', 'reader');
      expect(progress.completed).toBe(true);
      
      const hasBadge = await badgeModule.hasBadge('user123', 'reader');
      expect(hasBadge).toBe(true);
    });

    it('should emit progress event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');
      
      await badgeModule.updateProgress('user123', 'reader', 25);
      
      expect(emitSpy).toHaveBeenCalledWith('badge.progress', {
        userId: 'user123',
        badgeId: 'reader',
        current: 25,
        target: 50,
        percentage: 50
      });
    });

    it('should not exceed target', async () => {
      await badgeModule.updateProgress('user123', 'reader', 60);
      
      const progress = await badgeModule.getProgress('user123', 'reader');
      expect(progress.current).toBe(50);
      expect(progress.percentage).toBe(100);
    });
  });

  describe('getUserStats', () => {
    beforeEach(async () => {
      await badgeModule.create({ id: 'b1', name: 'B1', category: 'social', rarity: 'common' });
      await badgeModule.create({ id: 'b2', name: 'B2', category: 'achievement', rarity: 'rare' });
      await badgeModule.create({ id: 'b3', name: 'B3', category: 'social', rarity: 'common' });
      await badgeModule.create({ id: 'b4', name: 'B4', category: 'special', rarity: 'legendary' });
      
      await badgeModule.award('user123', 'b1');
      await badgeModule.award('user123', 'b2');
      await badgeModule.award('user123', 'b3');
    });

    it('should return comprehensive stats', async () => {
      const stats = await badgeModule.getUserStats('user123');

      expect(stats).toEqual({
        earned: expect.arrayContaining(['b1', 'b2', 'b3']),
        count: 3,
        byCategory: {
          social: 2,
          achievement: 1
        },
        byRarity: {
          common: 2,
          rare: 1
        },
        completion: {
          total: 75, // 3 out of 4
          byCategory: {
            social: 100, // 2 out of 2
            achievement: 100, // 1 out of 1
            special: 0 // 0 out of 1
          }
        },
        recent: expect.any(Array)
      });
    });
  });

  describe('resetUser', () => {
    beforeEach(async () => {
      await badgeModule.create({ id: 'b1', name: 'B1' });
      await badgeModule.create({ id: 'b2', name: 'B2', progressive: true, target: 10 });
      
      await badgeModule.award('user123', 'b1');
      await badgeModule.updateProgress('user123', 'b2', 5);
    });

    it('should reset all user data', async () => {
      await badgeModule.resetUser('user123');

      const badges = await badgeModule.getUserBadges('user123');
      expect(badges).toEqual([]);

      const progress = await badgeModule.getProgress('user123', 'b2');
      expect(progress.current).toBe(0);
    });

    it('should emit reset event', async () => {
      const emitSpy = jest.spyOn(eventManager, 'emit');

      await badgeModule.resetUser('user123');

      expect(emitSpy).toHaveBeenCalledWith('badges.reset', {
        userId: 'user123',
        previousBadges: ['b1'],
        timestamp: expect.any(Date)
      });
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      storage.hset = jest.fn().mockRejectedValue(new Error('Storage error'));

      await expect(
        badgeModule.create({ id: 'error-badge', name: 'Error Badge' })
      ).rejects.toThrow('Storage error');
    });

    it('should validate badge data', async () => {
      await expect(
        badgeModule.create({ id: '', name: 'Empty ID' })
      ).rejects.toThrow();

      await expect(
        badgeModule.create({ id: 'no-name' })
      ).rejects.toThrow();
    });

    it('should handle concurrent awards', async () => {
      await badgeModule.create({ id: 'concurrent', name: 'Concurrent Badge' });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(badgeModule.award(`user${i}`, 'concurrent'));
      }

      const results = await Promise.all(promises);
      expect(results.every(r => r.success)).toBe(true);

      const badge = await badgeModule.get('concurrent');
      expect(badge.totalAwarded).toBe(10);
    });
  });
});