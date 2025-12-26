import type { GamificationKit } from '../src/core/GamificationKit.js';
import { jest } from '@jest/globals';
import { GamificationKit } from '../../src/core/GamificationKit.js';
import { PointsModule } from '../../src/modules/PointsModule.js';
import { BadgeModule } from '../../src/modules/BadgeModule.js';
import { LeaderboardModule } from '../../src/modules/LeaderboardModule.js';
import { LevelModule } from '../../src/modules/LevelModule.js';
import { StreakModule } from '../../src/modules/StreakModule.js';

describe('GamificationKit Integration Tests', (): void => {
  let gk;

  beforeEach(async () => {
    gk = new GamificationKit({
      storage: { type: 'memory' },
      metrics: { enabled: true },
      webhooks: { enabled: false },
      modules: {
        points: {
          multipliers: {
            weekend: { value: 2, condition: () => false },
            premium: { value: 1.5, condition: (userId) => userId.includes('premium') }
          },
          limits: {
            daily: 1000,
            weekly: 5000
          }
        },
        badges: {
          autoAward: true
        },
        leaderboard: {
          updateInterval: 1000
        },
        levels: {
          levels: [
            { level: 1, xpRequired: 0 },
            { level: 2, xpRequired: 100 },
            { level: 3, xpRequired: 250 },
            { level: 4, xpRequired: 500 },
            { level: 5, xpRequired: 1000 }
          ]
        },
        streaks: {
          gracePeriod: 24 * 60 * 60 * 1000 // 1 day
        }
      }
    });

    // Add all modules
    gk.use(new PointsModule());
    gk.use(new BadgeModule());
    gk.use(new LeaderboardModule());
    gk.use(new LevelModule());
    gk.use(new StreakModule());

    await gk.initialize();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await gk.shutdown();
  });

  describe('Cross-module integration', (): void => {
    it('should trigger badges when points milestones are reached', async (): Promise<void> => {
      // Create milestone badge
      const badgeModule = gk.modules.get('badges');
      await badgeModule.create({
        id: 'points-100',
        name: '100 Points',
        description: 'Earn 100 points',
        autoAward: true,
        condition: {
          event: 'points.milestone',
          field: 'milestone',
          operator: '==',
          value: 100
        }
      });

      // Award points to trigger milestone
      const pointsModule = gk.modules.get('points');
      await pointsModule.award('user123', 100);

      // Give event time to propagate
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check if badge was awarded
      const userBadges = await badgeModule.getUserBadges('user123');
      expect(userBadges).toContainEqual(
        expect.objectContaining({ id: 'points-100' })
      );
    });

    it('should update leaderboard when points are awarded', async (): Promise<void> => {
      // Award points to multiple users
      const pointsModule = gk.modules.get('points');
      await pointsModule.award('user1', 500);
      await pointsModule.award('user2', 300);
      await pointsModule.award('user3', 700);

      // Check leaderboard
      const leaderboard = await pointsModule.getLeaderboard({ limit: 3 });
      
      expect(leaderboard[0]).toEqual({
        userId: 'user3',
        points: 700,
        rank: 1
      });
      expect(leaderboard[1]).toEqual({
        userId: 'user1',
        points: 500,
        rank: 2
      });
      expect(leaderboard[2]).toEqual({
        userId: 'user2',
        points: 300,
        rank: 3
      });
    });

    it('should track XP when points are awarded', async (): Promise<void> => {
      // Configure rule to award XP for points
      gk.ruleEngine.addRule({
        id: 'points-to-xp',
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'points.awarded'
        },
        actions: [{
          type: 'custom',
          handler: async (context, gk) => {
            const xp = Math.floor(context.points * 0.1);
            const levelsModule = gk.modules.get('levels');
            await levelsModule.addXP(context.userId, xp);
          }
        }]
      });

      // Award points
      await gk.track('points.awarded', {
        userId: 'user123',
        points: 1000,
        newBalance: 1000
      });

      // Check level progress
      const levelsModule = gk.modules.get('levels');
      const levelStats = await levelsModule.getUserStats('user123');
      expect(levelStats.xp).toBe(100); // 10% of 1000
      expect(levelStats.level).toBe(2); // Should have leveled up
    });

    it('should maintain streaks with daily activity', async (): Promise<void> => {
      jest.useFakeTimers();
      const baseTime = new Date('2024-01-01T12:00:00Z').getTime();
      jest.setSystemTime(baseTime);

      const streaksModule = gk.modules.get('streaks');

      // Day 1
      await streaksModule.increment('user123', 'daily-login');
      let streak = await streaksModule.getStreak('user123', 'daily-login');
      expect(streak.current).toBe(1);

      // Day 2
      jest.setSystemTime(baseTime + 24 * 60 * 60 * 1000);
      await streaksModule.increment('user123', 'daily-login');
      streak = await streaksModule.getStreak('user123', 'daily-login');
      expect(streak.current).toBe(2);

      // Day 3
      jest.setSystemTime(baseTime + 48 * 60 * 60 * 1000);
      await streaksModule.increment('user123', 'daily-login');
      streak = await streaksModule.getStreak('user123', 'daily-login');
      expect(streak.current).toBe(3);

      jest.useRealTimers();
    });
  });

  describe('Rule engine integration', (): void => {
    it('should process complex rules with multiple conditions', async (): Promise<void> => {
      const badgeModule = gk.modules.get('badges');
      const pointsModule = gk.modules.get('points');
      const levelsModule = gk.modules.get('levels');

      // Create badges for testing
      await badgeModule.create({
        id: 'super-user',
        name: 'Super User',
        description: 'For exceptional users'
      });

      // Add complex rule
      gk.ruleEngine.addRule({
        id: 'super-user-rule',
        condition: {
          operator: 'and',
          conditions: [
            {
              field: 'points',
              operator: '>=',
              value: 1000
            },
            {
              field: 'level',
              operator: '>=',
              value: 5
            },
            {
              field: 'badges',
              operator: '>=',
              value: 3
            }
          ]
        },
        actions: [{
          type: 'custom',
          handler: async (context, gk) => {
            const badges = gk.modules.get('badges');
            await badges.award(context.userId, 'super-user');
          }
        }]
      });

      // Setup user to meet conditions
      await pointsModule.award('user123', 1500);
      await levelsModule.setLevel('user123', 5);
      await badgeModule.award('user123', 'points-100');

      // Create more badges and award them
      await badgeModule.create({ id: 'badge1', name: 'Badge 1' });
      await badgeModule.create({ id: 'badge2', name: 'Badge 2' });
      await badgeModule.award('user123', 'badge1');
      await badgeModule.award('user123', 'badge2');

      // Trigger rule evaluation
      await gk.track('user.activity', {
        userId: 'user123',
        points: 1500,
        level: 5,
        badges: 3
      });

      // Check if super-user badge was awarded
      const hasSuperBadge = await badgeModule.hasBadge('user123', 'super-user');
      expect(hasSuperBadge).toBe(true);
    });

    it('should handle rule chaining', async (): Promise<void> => {
      let executionOrder = [];

      gk.ruleEngine.addRule({
        id: 'rule1',
        priority: 1,
        condition: {
          field: 'value',
          operator: '==',
          value: 'start'
        },
        actions: [{
          type: 'custom',
          handler: async (context, gk) => {
            executionOrder.push('rule1');
            await gk.eventManager.emitAsync('test.chain', { 
              userId: context.userId,
              step: 2 
            });
          }
        }]
      });

      gk.ruleEngine.addRule({
        id: 'rule2',
        priority: 2,
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'test.chain'
        },
        actions: [{
          type: 'custom',
          handler: async (context, gk) => {
            executionOrder.push('rule2');
            await gk.eventManager.emitAsync('test.final', { 
              userId: context.userId,
              complete: true 
            });
          }
        }]
      });

      gk.ruleEngine.addRule({
        id: 'rule3',
        priority: 3,
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'test.final'
        },
        actions: [{
          type: 'custom',
          handler: async () => {
            executionOrder.push('rule3');
          }
        }]
      });

      await gk.track('test.trigger', {
        userId: 'user123',
        value: 'start'
      });

      // Wait for all rules to execute
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(executionOrder).toEqual(['rule1', 'rule2', 'rule3']);
    });
  });

  describe('getUserStats aggregation', (): void => {
    it('should aggregate stats from all modules', async (): Promise<void> => {
      const pointsModule = gk.modules.get('points');
      const levelsModule = gk.modules.get('levels');
      const streaksModule = gk.modules.get('streaks');
      const badgeModule = gk.modules.get('badges');

      // Setup user data across modules
      await pointsModule.award('user123', 750);
      await levelsModule.addXP('user123', 150);
      await streaksModule.increment('user123', 'daily-login');
      
      await badgeModule.create({ id: 'test-badge', name: 'Test Badge' });
      await badgeModule.award('user123', 'test-badge');

      // Get aggregated stats
      const stats = await gk.getUserStats('user123');

      expect(stats).toEqual({
        userId: 'user123',
        modules: {
          points: expect.objectContaining({
            current: 750,
            total: 750
          }),
          badges: expect.objectContaining({
            earned: ['test-badge'],
            count: 1
          }),
          levels: expect.objectContaining({
            level: 2,
            xp: 150,
            progress: 50
          }),
          streaks: expect.objectContaining({
            'daily-login': expect.objectContaining({
              current: 1,
              longest: 1
            })
          })
        }
      });
    });
  });

  describe('Event flow', (): void => {
    it('should propagate events through the system', async (): Promise<void> => {
      const eventLog = [];

      // Listen to various events
      gk.eventManager.on('*', (eventName, data) => {
        eventLog.push({ event: eventName, userId: data.userId });
      });

      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');
      const levelsModule = gk.modules.get('levels');

      // Perform actions
      await pointsModule.award('user123', 100);
      await badgeModule.create({ id: 'event-test', name: 'Event Test' });
      await badgeModule.award('user123', 'event-test');
      await levelsModule.addXP('user123', 50);

      // Check event log
      expect(eventLog).toContainEqual({ event: 'points.awarded', userId: 'user123' });
      expect(eventLog).toContainEqual({ event: 'badge.awarded', userId: 'user123' });
      expect(eventLog).toContainEqual({ event: 'xp.added', userId: 'user123' });
    });
  });

  describe('Error handling', (): void => {
    it('should handle module errors gracefully', async (): Promise<void> => {
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');

      // Mock storage error
      gk.storage.zincrby = jest.fn().mockRejectedValue(new Error('Storage error'));

      // Should throw but not crash
      await expect(
        pointsModule.award('user123', 100)
      ).rejects.toThrow('Storage error');

      // Other modules should still work
      const badges = await badgeModule.getUserBadges('user123');
      expect(badges).toEqual([]);
    });

    it('should handle concurrent operations', async (): Promise<void> => {
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');
      const promises = [];

      // Concurrent point awards
      for (let i = 0; i < 10; i++) {
        promises.push(pointsModule.award('user123', 10));
      }

      // Concurrent badge checks
      for (let i = 0; i < 5; i++) {
        promises.push(badgeModule.getUserBadges('user123'));
      }

      // All should complete without errors
      await expect(Promise.all(promises)).resolves.not.toThrow();

      // Check final state
      const balance = await pointsModule.getBalance('user123');
      expect(balance).toBe(100); // 10 * 10
    });
  });

  describe('Performance', (): void => {
    it('should handle large number of users efficiently', async (): Promise<void> => {
      const pointsModule = gk.modules.get('points');
      const levelsModule = gk.modules.get('levels');
      const streaksModule = gk.modules.get('streaks');
      
      const startTime = Date.now();
      const userCount = 100;
      const promises = [];

      // Create many users with various actions
      for (let i = 0; i < userCount; i++) {
        const userId = `user${i}`;
        promises.push(
          pointsModule.award(userId, Math.floor(Math.random() * 1000)),
          levelsModule.addXP(userId, Math.floor(Math.random() * 100)),
          streaksModule.increment(userId, 'daily-login')
        );
      }

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds

      // Verify leaderboard works with many users
      const leaderboard = await pointsModule.getLeaderboard({ limit: 10 });
      expect(leaderboard).toHaveLength(10);
      expect(leaderboard[0].points).toBeGreaterThanOrEqual(leaderboard[9].points);
    });
  });

  describe('Data consistency', (): void => {
    it('should maintain consistency during resetUser', async (): Promise<void> => {
      const pointsModule = gk.modules.get('points');
      const levelsModule = gk.modules.get('levels');
      const badgeModule = gk.modules.get('badges');
      const streaksModule = gk.modules.get('streaks');

      // Setup user data
      await pointsModule.award('user123', 1000);
      await levelsModule.addXP('user123', 500);
      await badgeModule.create({ id: 'reset-test', name: 'Reset Test' });
      await badgeModule.award('user123', 'reset-test');
      await streaksModule.increment('user123', 'test-streak');

      // Reset user
      await gk.resetUser('user123');

      // Verify all data is cleared
      const stats = await gk.getUserStats('user123');
      
      expect(stats.modules.points.current).toBe(0);
      expect(stats.modules.points.total).toBe(0);
      expect(stats.modules.badges.count).toBe(0);
      expect(stats.modules.levels.level).toBe(1);
      expect(stats.modules.levels.xp).toBe(0);
      expect(stats.modules.streaks).toEqual({});
    });

    it('should handle partial module failures during reset', async (): Promise<void> => {
      const pointsModule = gk.modules.get('points');
      await pointsModule.award('user123', 500);

      // Mock one module to fail
      pointsModule.resetUser = jest.fn().mockRejectedValue(new Error('Reset failed'));

      // Reset should continue despite failure
      await gk.resetUser('user123');

      // Other modules should be reset
      const badgeModule = gk.modules.get('badges');
      const badges = await badgeModule.getUserBadges('user123');
      expect(badges).toEqual([]);
    });
  });
});