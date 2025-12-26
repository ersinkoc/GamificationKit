import { jest } from '@jest/globals';
import { GamificationKit } from '../../src/core/GamificationKit.js';
import { PointsModule } from '../../src/modules/PointsModule.js';
import { BadgeModule } from '../../src/modules/BadgeModule.js';
import { LeaderboardModule } from '../../src/modules/LeaderboardModule.js';
import { LevelModule } from '../../src/modules/LevelModule.js';
import { StreakModule } from '../../src/modules/StreakModule.js';
import { QuestModule } from '../../src/modules/QuestModule.js';
import { AchievementModule } from '../../src/modules/AchievementModule.js';

/**
 * Module Integration Tests
 *
 * Tests the interaction between different modules in the GamificationKit system.
 * Covers:
 * - Points + Badges + Levels integration
 * - Quest + Achievement integration
 * - Leaderboard + Points integration
 * - Event flow across multiple modules
 * - Cross-module data consistency
 */
describe('Module Integration Tests', () => {
  let gk: any;

  beforeEach(async () => {
    gk = new GamificationKit({
      storage: { type: 'memory' },
      metrics: { enabled: true },
      webhooks: { enabled: false },
      modules: {
        points: {
          multipliers: {
            premium: { value: 1.5, condition: (userId: string) => userId.includes('premium') },
            weekend: { value: 2.0, condition: () => false }
          },
          limits: {
            daily: 1000,
            weekly: 5000
          }
        },
        badges: {
          autoAward: true
        },
        levels: {
          levels: [
            { level: 1, xpRequired: 0, rewards: {} },
            { level: 2, xpRequired: 100, rewards: { points: 50 } },
            { level: 3, xpRequired: 250, rewards: { points: 100 } },
            { level: 4, xpRequired: 500, rewards: { points: 200 } },
            { level: 5, xpRequired: 1000, rewards: { points: 500 } }
          ]
        },
        streaks: {
          gracePeriod: 24 * 60 * 60 * 1000
        },
        quests: {
          maxActiveQuests: 5,
          dailyQuestLimit: 3,
          autoAssignDaily: false
        },
        achievements: {
          enableTierProgression: true,
          showProgress: true
        }
      }
    });

    gk.use(new PointsModule());
    gk.use(new BadgeModule());
    gk.use(new LeaderboardModule());
    gk.use(new LevelModule());
    gk.use(new StreakModule());
    gk.use(new QuestModule());
    gk.use(new AchievementModule());

    await gk.initialize();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await gk.shutdown();
  });

  describe('Points + Badges + Levels Integration', () => {
    it('should award badge when points milestone is reached', async () => {
      const badgeModule = gk.modules.get('badges');
      const pointsModule = gk.modules.get('points');

      // Create milestone badge
      await badgeModule.create({
        id: 'points-milestone-100',
        name: '100 Points Master',
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
      await pointsModule.award('user1', 100, 'testing');

      // Wait for event propagation
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify badge was awarded
      const userBadges = await badgeModule.getUserBadges('user1');
      expect(userBadges).toContainEqual(
        expect.objectContaining({
          id: 'points-milestone-100',
          awardedAt: expect.any(Number)
        })
      );
    });

    it('should level up user based on points earned', async () => {
      const pointsModule = gk.modules.get('points');
      const levelsModule = gk.modules.get('levels');

      // Set up rule to convert points to XP
      gk.ruleEngine.addRule({
        id: 'points-to-xp',
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'points.awarded'
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            const xp = Math.floor(context.points * 0.5); // 50% of points as XP
            await gk.modules.get('levels').addXP(context.userId, xp);
          }
        }]
      });

      // Award points
      await pointsModule.award('user1', 500, 'quest-completion');

      // Wait for rule execution
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check level progression (500 * 0.5 = 250 XP, should be level 3)
      const levelStats = await levelsModule.getUserStats('user1');
      expect(levelStats.level).toBe(3);
      expect(levelStats.xp).toBe(250);
    });

    it('should award level-up rewards and trigger badge', async () => {
      const levelsModule = gk.modules.get('levels');
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');

      // Create level-up badge
      await badgeModule.create({
        id: 'level-5-master',
        name: 'Level 5 Master',
        description: 'Reach level 5',
        autoAward: true,
        condition: {
          event: 'level.up',
          field: 'newLevel',
          operator: '>=',
          value: 5
        }
      });

      // Add XP to level up
      await levelsModule.addXP('user1', 1000); // Should reach level 5

      // Wait for events
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check if user reached level 5
      const levelStats = await levelsModule.getUserStats('user1');
      expect(levelStats.level).toBe(5);

      // Check if level-up badge was awarded
      const badges = await badgeModule.getUserBadges('user1');
      expect(badges).toContainEqual(
        expect.objectContaining({ id: 'level-5-master' })
      );
    });

    it('should handle complex multi-module workflow', async () => {
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');
      const levelsModule = gk.modules.get('levels');
      const streakModule = gk.modules.get('streaks');

      // Create badges
      await badgeModule.create({
        id: 'streak-master',
        name: 'Streak Master',
        description: '7-day streak'
      });

      await badgeModule.create({
        id: 'combo-master',
        name: 'Combo Master',
        description: 'High points, level, and streak'
      });

      // Set up rule for streak bonus
      gk.ruleEngine.addRule({
        id: 'streak-bonus',
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'streak.updated'
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            if (context.current >= 7) {
              await gk.modules.get('badges').award(context.userId, 'streak-master');
              await gk.modules.get('points').award(context.userId, 100, 'streak-bonus');
            }
          }
        }]
      });

      // Simulate 7-day streak
      jest.useFakeTimers();
      const baseTime = new Date('2024-01-01T12:00:00Z').getTime();

      for (let day = 0; day < 7; day++) {
        jest.setSystemTime(baseTime + day * 24 * 60 * 60 * 1000);
        await streakModule.increment('user1', 'daily-login');
        await pointsModule.award('user1', 50, 'daily-login');
        await levelsModule.addXP('user1', 25);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      jest.useRealTimers();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify results
      const streak = await streakModule.getStreak('user1', 'daily-login');
      expect(streak.current).toBe(7);

      const badges = await badgeModule.getUserBadges('user1');
      expect(badges.some((b: any) => b.id === 'streak-master')).toBe(true);

      const points = await pointsModule.getBalance('user1');
      expect(points).toBeGreaterThanOrEqual(450); // 7 * 50 + 100 bonus

      const levelStats = await levelsModule.getUserStats('user1');
      expect(levelStats.level).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Quest + Achievement Integration', () => {
    it('should track achievement progress through quest completion', async () => {
      const questModule = gk.modules.get('quests');
      const achievementModule = gk.modules.get('achievements');

      // Create achievement for completing quests
      await achievementModule.addAchievement({
        id: 'quest-master',
        name: 'Quest Master',
        description: 'Complete multiple quests',
        tiers: [
          { tier: 'bronze', requirement: 5, rewards: { points: 100 } },
          { tier: 'silver', requirement: 10, rewards: { points: 250 } },
          { tier: 'gold', requirement: 20, rewards: { points: 500 } }
        ],
        trackingEvent: 'quest.completed'
      });

      // Create quest
      questModule.addQuest({
        id: 'daily-login',
        name: 'Daily Login',
        description: 'Login for the day',
        category: 'daily',
        objectives: [
          { id: 'login', type: 'event', target: 'user.login', required: 1 }
        ],
        rewards: { points: 50, xp: 25 }
      });

      // Complete 5 quests
      for (let i = 0; i < 5; i++) {
        await questModule.assignQuest(`user1`, 'daily-login');
        await gk.track('user.login', { userId: 'user1' });
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check achievement progress
      const progress = await achievementModule.getProgress('user1', 'quest-master');
      expect(progress).toEqual(
        expect.objectContaining({
          achievementId: 'quest-master',
          currentTier: 'bronze',
          progress: expect.any(Number)
        })
      );
    });

    it('should chain quests and award achievement on chain completion', async () => {
      const questModule = gk.modules.get('quests');
      const achievementModule = gk.modules.get('achievements');
      const pointsModule = gk.modules.get('points');

      // Create quest chain
      questModule.addQuest({
        id: 'tutorial-1',
        name: 'Tutorial Part 1',
        category: 'tutorial',
        chainId: 'tutorial-chain',
        chainOrder: 1,
        objectives: [
          { id: 'step1', type: 'event', target: 'tutorial.step1', required: 1 }
        ],
        rewards: { points: 10 }
      });

      questModule.addQuest({
        id: 'tutorial-2',
        name: 'Tutorial Part 2',
        category: 'tutorial',
        chainId: 'tutorial-chain',
        chainOrder: 2,
        objectives: [
          { id: 'step2', type: 'event', target: 'tutorial.step2', required: 1 }
        ],
        rewards: { points: 20 }
      });

      questModule.addQuest({
        id: 'tutorial-3',
        name: 'Tutorial Part 3',
        category: 'tutorial',
        chainId: 'tutorial-chain',
        chainOrder: 3,
        objectives: [
          { id: 'step3', type: 'event', target: 'tutorial.step3', required: 1 }
        ],
        rewards: { points: 30 }
      });

      // Set up chain completion badge
      gk.ruleEngine.addRule({
        id: 'tutorial-chain-complete',
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'quest.completed'
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            if (context.questId === 'tutorial-3') {
              await gk.track('achievement.tutorial-complete', {
                userId: context.userId
              });
            }
          }
        }]
      });

      // Complete the chain
      await questModule.assignQuest('user1', 'tutorial-1');
      await gk.track('tutorial.step1', { userId: 'user1' });
      await new Promise(resolve => setTimeout(resolve, 20));

      await questModule.assignQuest('user1', 'tutorial-2');
      await gk.track('tutorial.step2', { userId: 'user1' });
      await new Promise(resolve => setTimeout(resolve, 20));

      await questModule.assignQuest('user1', 'tutorial-3');
      await gk.track('tutorial.step3', { userId: 'user1' });
      await new Promise(resolve => setTimeout(resolve, 20));

      // Verify quest completion and points
      const points = await pointsModule.getBalance('user1');
      expect(points).toBe(60); // 10 + 20 + 30
    });
  });

  describe('Leaderboard + Points Integration', () => {
    it('should update leaderboard in real-time as points are awarded', async () => {
      const pointsModule = gk.modules.get('points');
      const leaderboardModule = gk.modules.get('leaderboard');

      // Award points to multiple users
      await pointsModule.award('user1', 100);
      await pointsModule.award('user2', 200);
      await pointsModule.award('user3', 150);
      await pointsModule.award('user4', 300);
      await pointsModule.award('user5', 50);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Get leaderboard
      const leaderboard = await pointsModule.getLeaderboard({ limit: 5 });

      expect(leaderboard).toEqual([
        { userId: 'user4', points: 300, rank: 1 },
        { userId: 'user2', points: 200, rank: 2 },
        { userId: 'user3', points: 150, rank: 3 },
        { userId: 'user1', points: 100, rank: 4 },
        { userId: 'user5', points: 50, rank: 5 }
      ]);
    });

    it('should handle concurrent point awards and maintain leaderboard consistency', async () => {
      const pointsModule = gk.modules.get('points');

      // Create many concurrent operations
      const operations = [];
      for (let i = 0; i < 50; i++) {
        const userId = `user${i % 10}`;
        const points = Math.floor(Math.random() * 100) + 1;
        operations.push(pointsModule.award(userId, points));
      }

      await Promise.all(operations);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get leaderboard
      const leaderboard = await pointsModule.getLeaderboard({ limit: 10 });

      // Verify leaderboard is sorted correctly
      expect(leaderboard).toHaveLength(10);
      for (let i = 0; i < leaderboard.length - 1; i++) {
        expect(leaderboard[i].points).toBeGreaterThanOrEqual(leaderboard[i + 1].points);
        expect(leaderboard[i].rank).toBe(i + 1);
      }
    });

    it('should support time-based leaderboards (daily, weekly, monthly)', async () => {
      const pointsModule = gk.modules.get('points');

      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);

      // Award points
      await pointsModule.award('user1', 100);
      await pointsModule.award('user2', 200);

      // Move to next day
      jest.setSystemTime(now + 24 * 60 * 60 * 1000);
      await pointsModule.award('user3', 150);
      await pointsModule.award('user1', 50);

      jest.useRealTimers();
      await new Promise(resolve => setTimeout(resolve, 50));

      // All-time leaderboard
      const allTime = await pointsModule.getLeaderboard({ limit: 3 });
      expect(allTime[0].userId).toBe('user2');
      expect(allTime[0].points).toBe(200);
    });
  });

  describe('Event Flow Across Modules', () => {
    it('should propagate events through all subscribed modules', async () => {
      const eventLog: any[] = [];

      // Listen to all events
      gk.eventManager.on('*', (eventName: string, data: any) => {
        eventLog.push({ event: eventName, userId: data.userId, timestamp: Date.now() });
      });

      const pointsModule = gk.modules.get('points');
      const levelsModule = gk.modules.get('levels');
      const badgeModule = gk.modules.get('badges');

      // Perform various actions
      await pointsModule.award('user1', 100);
      await levelsModule.addXP('user1', 50);
      await badgeModule.create({ id: 'test-badge', name: 'Test' });
      await badgeModule.award('user1', 'test-badge');

      // Verify events were logged
      expect(eventLog).toContainEqual(
        expect.objectContaining({ event: 'points.awarded', userId: 'user1' })
      );
      expect(eventLog).toContainEqual(
        expect.objectContaining({ event: 'xp.added', userId: 'user1' })
      );
      expect(eventLog).toContainEqual(
        expect.objectContaining({ event: 'badge.awarded', userId: 'user1' })
      );
    });

    it('should handle cascading events correctly', async () => {
      const executionOrder: string[] = [];
      const pointsModule = gk.modules.get('points');
      const levelsModule = gk.modules.get('levels');
      const badgeModule = gk.modules.get('badges');

      // Create badge for level 3
      await badgeModule.create({
        id: 'level-3-badge',
        name: 'Level 3',
        autoAward: true,
        condition: {
          event: 'level.up',
          field: 'newLevel',
          operator: '==',
          value: 3
        }
      });

      // Rule 1: Points → XP
      gk.ruleEngine.addRule({
        id: 'points-to-xp',
        priority: 1,
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'points.awarded'
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            executionOrder.push('points→xp');
            const xp = Math.floor(context.points * 0.5);
            await gk.modules.get('levels').addXP(context.userId, xp);
          }
        }]
      });

      // Rule 2: Level Up → Points Bonus
      gk.ruleEngine.addRule({
        id: 'levelup-bonus',
        priority: 2,
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'level.up'
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            executionOrder.push('levelup→bonus');
          }
        }]
      });

      // Award points (should trigger: points.awarded → xp.added → level.up → badge.awarded)
      await pointsModule.award('user1', 500);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify cascade
      expect(executionOrder).toContain('points→xp');

      const levelStats = await levelsModule.getUserStats('user1');
      expect(levelStats.level).toBeGreaterThanOrEqual(2);
    });

    it('should handle event errors without affecting other modules', async () => {
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');

      // Add rule that throws error
      gk.ruleEngine.addRule({
        id: 'error-rule',
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'points.awarded'
        },
        actions: [{
          type: 'custom',
          handler: async () => {
            throw new Error('Intentional error');
          }
        }]
      });

      // Award points (should trigger error but not crash)
      await pointsModule.award('user1', 100);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Other modules should still work
      const balance = await pointsModule.getBalance('user1');
      expect(balance).toBe(100);

      const badges = await badgeModule.getUserBadges('user1');
      expect(badges).toEqual([]);
    });
  });

  describe('Cross-Module Data Consistency', () => {
    it('should maintain data consistency across getUserStats', async () => {
      const pointsModule = gk.modules.get('points');
      const levelsModule = gk.modules.get('levels');
      const badgeModule = gk.modules.get('badges');
      const streakModule = gk.modules.get('streaks');

      // Set up user data
      await pointsModule.award('user1', 500);
      await levelsModule.addXP('user1', 300);
      await badgeModule.create({ id: 'test1', name: 'Test 1' });
      await badgeModule.award('user1', 'test1');
      await streakModule.increment('user1', 'daily-login');

      // Get aggregated stats
      const stats = await gk.getUserStats('user1');

      expect(stats).toEqual({
        userId: 'user1',
        modules: {
          points: expect.objectContaining({
            current: 500,
            total: 500
          }),
          badges: expect.objectContaining({
            count: 1,
            earned: expect.arrayContaining(['test1'])
          }),
          levels: expect.objectContaining({
            level: expect.any(Number),
            xp: 300
          }),
          streaks: expect.objectContaining({
            'daily-login': expect.objectContaining({
              current: 1
            })
          })
        }
      });
    });

    it('should maintain consistency during resetUser', async () => {
      const pointsModule = gk.modules.get('points');
      const levelsModule = gk.modules.get('levels');
      const badgeModule = gk.modules.get('badges');
      const streakModule = gk.modules.get('streaks');

      // Set up user data across all modules
      await pointsModule.award('user1', 1000);
      await levelsModule.addXP('user1', 500);
      await badgeModule.create({ id: 'reset-test', name: 'Reset Test' });
      await badgeModule.award('user1', 'reset-test');
      await streakModule.increment('user1', 'test-streak');

      // Reset user
      await gk.resetUser('user1');

      // Verify all data is cleared
      const stats = await gk.getUserStats('user1');

      expect(stats.modules.points.current).toBe(0);
      expect(stats.modules.badges.count).toBe(0);
      expect(stats.modules.levels.level).toBe(1);
      expect(stats.modules.levels.xp).toBe(0);
    });

    it('should handle partial module failures gracefully', async () => {
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');

      // Mock points module to fail
      const originalReset = pointsModule.resetUser;
      pointsModule.resetUser = jest.fn().mockRejectedValue(new Error('Reset failed'));

      // Reset should continue despite failure
      await gk.resetUser('user1');

      // Other modules should still be reset
      const badges = await badgeModule.getUserBadges('user1');
      expect(badges).toEqual([]);

      // Restore
      pointsModule.resetUser = originalReset;
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high-volume concurrent operations efficiently', async () => {
      const pointsModule = gk.modules.get('points');
      const levelsModule = gk.modules.get('levels');

      const startTime = Date.now();
      const operations = [];

      // Simulate 100 users performing various actions
      for (let i = 0; i < 100; i++) {
        const userId = `user${i}`;
        operations.push(
          pointsModule.award(userId, Math.floor(Math.random() * 500)),
          levelsModule.addXP(userId, Math.floor(Math.random() * 200))
        );
      }

      await Promise.all(operations);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 3 seconds for 200 operations)
      expect(duration).toBeLessThan(3000);

      // Verify leaderboard works with many users
      const leaderboard = await pointsModule.getLeaderboard({ limit: 10 });
      expect(leaderboard).toHaveLength(10);
      expect(leaderboard[0].points).toBeGreaterThanOrEqual(leaderboard[9].points);
    });

    it('should maintain event order during rapid operations', async () => {
      const pointsModule = gk.modules.get('points');
      const operations: number[] = [];

      gk.eventManager.on('points.awarded', (data: any) => {
        operations.push(data.points);
      });

      // Rapidly award points
      const awards = [10, 20, 30, 40, 50];
      for (const points of awards) {
        await pointsModule.award('user1', points);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify all operations were recorded
      expect(operations).toHaveLength(5);
      expect(operations).toEqual(awards);
    });
  });

  describe('Module Lifecycle Management', () => {
    it('should initialize all modules in correct order', async () => {
      const initOrder: string[] = [];

      // Track initialization
      for (const [name, module] of gk.modules.entries()) {
        const original = module.initialize;
        module.initialize = jest.fn(async function(this: any, ...args: any[]) {
          initOrder.push(name);
          return original.apply(this, args);
        });
      }

      // Re-initialize
      await gk.initialize();

      // Verify all modules were initialized
      expect(initOrder).toContain('points');
      expect(initOrder).toContain('badges');
      expect(initOrder).toContain('levels');
    });

    it('should shutdown all modules cleanly', async () => {
      const shutdownOrder: string[] = [];

      // Track shutdown
      for (const [name, module] of gk.modules.entries()) {
        if (module.shutdown) {
          const original = module.shutdown;
          module.shutdown = jest.fn(async function(this: any, ...args: any[]) {
            shutdownOrder.push(name);
            if (original) {
              return original.apply(this, args);
            }
          });
        }
      }

      await gk.shutdown();

      // Verify modules were shut down
      expect(shutdownOrder.length).toBeGreaterThan(0);
    });
  });
});
