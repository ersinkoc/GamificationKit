import { jest } from '@jest/globals';
import { GamificationKit } from '../../src/core/GamificationKit.js';
import { PointsModule } from '../../src/modules/PointsModule.js';
import { BadgeModule } from '../../src/modules/BadgeModule.js';
import { LeaderboardModule } from '../../src/modules/LeaderboardModule.js';
import { LevelModule } from '../../src/modules/LevelModule.js';
import { StreakModule } from '../../src/modules/StreakModule.js';

describe('GamificationKit Integration Tests', () => {
  let gk;

  beforeEach(async () => {
    gk = new GamificationKit({
      storage: 'memory',
      enableMetrics: true,
      enableWebhooks: false,
      enableRules: true
    });

    // Add all modules
    gk.use('points', new PointsModule({
      multipliers: {
        weekend: { value: 2, condition: () => false },
        premium: { value: 1.5, condition: (userId) => userId.includes('premium') }
      },
      limits: {
        daily: 1000,
        weekly: 5000
      }
    }));

    gk.use('badges', new BadgeModule({
      autoAward: true
    }));

    gk.use('leaderboard', new LeaderboardModule({
      updateInterval: 1000
    }));

    gk.use('levels', new LevelModule({
      levels: [
        { level: 1, xpRequired: 0 },
        { level: 2, xpRequired: 100 },
        { level: 3, xpRequired: 250 },
        { level: 4, xpRequired: 500 },
        { level: 5, xpRequired: 1000 }
      ]
    }));

    gk.use('streaks', new StreakModule({
      gracePeriod: 24 * 60 * 60 * 1000 // 1 day
    }));

    await gk.initialize();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await gk.shutdown();
  });

  describe('Cross-module integration', () => {
    it('should trigger badges when points milestones are reached', async () => {
      // Create milestone badge
      await gk.modules.badges.create({
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
      await gk.modules.points.award('user123', 100);

      // Give event time to propagate
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check if badge was awarded
      const userBadges = await gk.modules.badges.getUserBadges('user123');
      expect(userBadges).toContainEqual(
        expect.objectContaining({ id: 'points-100' })
      );
    });

    it('should update leaderboard when points are awarded', async () => {
      // Award points to multiple users
      await gk.modules.points.award('user1', 500);
      await gk.modules.points.award('user2', 300);
      await gk.modules.points.award('user3', 700);

      // Check leaderboard
      const leaderboard = await gk.modules.points.getLeaderboard({ limit: 3 });
      
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

    it('should track XP when points are awarded', async () => {
      // Configure rule to award XP for points
      gk.ruleEngine.addRule({
        id: 'points-to-xp',
        condition: {
          event: 'points.awarded',
          field: 'points',
          operator: '>',
          value: 0
        },
        action: async (context) => {
          const xp = Math.floor(context.points * 0.1);
          await gk.modules.levels.addXP(context.userId, xp);
        }
      });

      // Award points
      await gk.track('points.awarded', {
        userId: 'user123',
        points: 1000,
        newBalance: 1000
      });

      // Check level progress
      const levelStats = await gk.modules.levels.getUserStats('user123');
      expect(levelStats.xp).toBe(100); // 10% of 1000
      expect(levelStats.level).toBe(2); // Should have leveled up
    });

    it('should maintain streaks with daily activity', async () => {
      jest.useFakeTimers();
      const baseTime = new Date('2024-01-01T12:00:00Z').getTime();
      jest.setSystemTime(baseTime);

      // Day 1
      await gk.modules.streaks.increment('user123', 'daily-login');
      let streak = await gk.modules.streaks.getStreak('user123', 'daily-login');
      expect(streak.current).toBe(1);

      // Day 2
      jest.setSystemTime(baseTime + 24 * 60 * 60 * 1000);
      await gk.modules.streaks.increment('user123', 'daily-login');
      streak = await gk.modules.streaks.getStreak('user123', 'daily-login');
      expect(streak.current).toBe(2);

      // Day 3
      jest.setSystemTime(baseTime + 48 * 60 * 60 * 1000);
      await gk.modules.streaks.increment('user123', 'daily-login');
      streak = await gk.modules.streaks.getStreak('user123', 'daily-login');
      expect(streak.current).toBe(3);

      jest.useRealTimers();
    });
  });

  describe('Rule engine integration', () => {
    it('should process complex rules with multiple conditions', async () => {
      // Create badges for testing
      await gk.modules.badges.create({
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
              event: 'user.activity',
              field: 'points',
              operator: '>=',
              value: 1000
            },
            {
              event: 'user.activity',
              field: 'level',
              operator: '>=',
              value: 5
            },
            {
              event: 'user.activity',
              field: 'badges',
              operator: '>=',
              value: 3
            }
          ]
        },
        action: async (context) => {
          await gk.modules.badges.award(context.userId, 'super-user');
        }
      });

      // Setup user to meet conditions
      await gk.modules.points.award('user123', 1500);
      await gk.modules.levels.setLevel('user123', 5);
      await gk.modules.badges.award('user123', 'points-100');

      // Create more badges and award them
      await gk.modules.badges.create({ id: 'badge1', name: 'Badge 1' });
      await gk.modules.badges.create({ id: 'badge2', name: 'Badge 2' });
      await gk.modules.badges.award('user123', 'badge1');
      await gk.modules.badges.award('user123', 'badge2');

      // Trigger rule evaluation
      await gk.track('user.activity', {
        userId: 'user123',
        points: 1500,
        level: 5,
        badges: 3
      });

      // Check if super-user badge was awarded
      const hasSuperBadge = await gk.modules.badges.hasBadge('user123', 'super-user');
      expect(hasSuperBadge).toBe(true);
    });

    it('should handle rule chaining', async () => {
      let executionOrder = [];

      gk.ruleEngine.addRule({
        id: 'rule1',
        priority: 1,
        condition: {
          event: 'test.trigger',
          field: 'value',
          operator: '==',
          value: 'start'
        },
        action: async (context) => {
          executionOrder.push('rule1');
          await gk.eventManager.emit('test.chain', { 
            userId: context.userId,
            step: 2 
          });
        }
      });

      gk.ruleEngine.addRule({
        id: 'rule2',
        priority: 2,
        condition: {
          event: 'test.chain',
          field: 'step',
          operator: '==',
          value: 2
        },
        action: async (context) => {
          executionOrder.push('rule2');
          await gk.eventManager.emit('test.final', { 
            userId: context.userId,
            complete: true 
          });
        }
      });

      gk.ruleEngine.addRule({
        id: 'rule3',
        priority: 3,
        condition: {
          event: 'test.final',
          field: 'complete',
          operator: '==',
          value: true
        },
        action: async () => {
          executionOrder.push('rule3');
        }
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

  describe('getUserStats aggregation', () => {
    it('should aggregate stats from all modules', async () => {
      // Setup user data across modules
      await gk.modules.points.award('user123', 750);
      await gk.modules.levels.addXP('user123', 150);
      await gk.modules.streaks.increment('user123', 'daily-login');
      
      await gk.modules.badges.create({ id: 'test-badge', name: 'Test Badge' });
      await gk.modules.badges.award('user123', 'test-badge');

      // Get aggregated stats
      const stats = await gk.getUserStats('user123');

      expect(stats).toEqual({
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
        }),
        _global: expect.objectContaining({
          userId: 'user123',
          lastActive: expect.any(Date)
        })
      });
    });
  });

  describe('Event flow', () => {
    it('should propagate events through the system', async () => {
      const eventLog = [];

      // Listen to various events
      gk.eventManager.on('*', (eventName, data) => {
        eventLog.push({ event: eventName, userId: data.userId });
      });

      // Perform actions
      await gk.modules.points.award('user123', 100);
      await gk.modules.badges.create({ id: 'event-test', name: 'Event Test' });
      await gk.modules.badges.award('user123', 'event-test');
      await gk.modules.levels.addXP('user123', 50);

      // Check event log
      expect(eventLog).toContainEqual({ event: 'points.awarded', userId: 'user123' });
      expect(eventLog).toContainEqual({ event: 'badge.awarded', userId: 'user123' });
      expect(eventLog).toContainEqual({ event: 'xp.added', userId: 'user123' });
    });
  });

  describe('Error handling', () => {
    it('should handle module errors gracefully', async () => {
      // Mock storage error
      gk.storage.zincrby = jest.fn().mockRejectedValue(new Error('Storage error'));

      // Should throw but not crash
      await expect(
        gk.modules.points.award('user123', 100)
      ).rejects.toThrow('Storage error');

      // Other modules should still work
      const badges = await gk.modules.badges.getUserBadges('user123');
      expect(badges).toEqual([]);
    });

    it('should handle concurrent operations', async () => {
      const promises = [];

      // Concurrent point awards
      for (let i = 0; i < 10; i++) {
        promises.push(gk.modules.points.award('user123', 10));
      }

      // Concurrent badge checks
      for (let i = 0; i < 5; i++) {
        promises.push(gk.modules.badges.getUserBadges('user123'));
      }

      // All should complete without errors
      await expect(Promise.all(promises)).resolves.not.toThrow();

      // Check final state
      const balance = await gk.modules.points.getBalance('user123');
      expect(balance).toBe(100); // 10 * 10
    });
  });

  describe('Performance', () => {
    it('should handle large number of users efficiently', async () => {
      const startTime = Date.now();
      const userCount = 100;
      const promises = [];

      // Create many users with various actions
      for (let i = 0; i < userCount; i++) {
        const userId = `user${i}`;
        promises.push(
          gk.modules.points.award(userId, Math.floor(Math.random() * 1000)),
          gk.modules.levels.addXP(userId, Math.floor(Math.random() * 100)),
          gk.modules.streaks.increment(userId, 'daily-login')
        );
      }

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds

      // Verify leaderboard works with many users
      const leaderboard = await gk.modules.points.getLeaderboard({ limit: 10 });
      expect(leaderboard).toHaveLength(10);
      expect(leaderboard[0].points).toBeGreaterThanOrEqual(leaderboard[9].points);
    });
  });

  describe('Data consistency', () => {
    it('should maintain consistency during resetUser', async () => {
      // Setup user data
      await gk.modules.points.award('user123', 1000);
      await gk.modules.levels.addXP('user123', 500);
      await gk.modules.badges.create({ id: 'reset-test', name: 'Reset Test' });
      await gk.modules.badges.award('user123', 'reset-test');
      await gk.modules.streaks.increment('user123', 'test-streak');

      // Reset user
      await gk.resetUser('user123');

      // Verify all data is cleared
      const stats = await gk.getUserStats('user123');
      
      expect(stats.points.current).toBe(0);
      expect(stats.points.total).toBe(0);
      expect(stats.badges.count).toBe(0);
      expect(stats.levels.level).toBe(1);
      expect(stats.levels.xp).toBe(0);
      expect(stats.streaks).toEqual({});
    });

    it('should handle partial module failures during reset', async () => {
      await gk.modules.points.award('user123', 500);

      // Mock one module to fail
      gk.modules.points.resetUser = jest.fn().mockRejectedValue(new Error('Reset failed'));

      // Reset should continue despite failure
      await gk.resetUser('user123');

      // Other modules should be reset
      const badges = await gk.modules.badges.getUserBadges('user123');
      expect(badges).toEqual([]);
    });
  });
});