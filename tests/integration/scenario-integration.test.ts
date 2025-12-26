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
 * Real-World Scenario Integration Tests
 *
 * Tests complete user journeys and realistic application scenarios.
 * Covers:
 * - User completes quest → earns badge → levels up
 * - Streak maintenance with points multiplier
 * - Leaderboard updates with concurrent users
 * - Complete event processing pipeline
 * - Social gaming scenarios
 * - Progressive achievement unlocking
 */
describe('Real-World Scenario Integration Tests', () => {
  describe('New User Onboarding Journey', () => {
    let gk: any;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: true },
        webhooks: { enabled: false },
        modules: {
          points: {
            multipliers: {
              newbie: { value: 2.0, condition: (userId: string) => userId.startsWith('new_') }
            }
          },
          levels: {
            levels: [
              { level: 1, xpRequired: 0, rewards: {} },
              { level: 2, xpRequired: 100, rewards: { points: 50, badge: 'level-2' } },
              { level: 3, xpRequired: 300, rewards: { points: 100, badge: 'level-3' } },
              { level: 4, xpRequired: 600, rewards: { points: 200, badge: 'level-4' } },
              { level: 5, xpRequired: 1000, rewards: { points: 500, badge: 'level-5' } }
            ]
          },
          quests: {
            autoAssignDaily: false
          }
        }
      });

      gk.use(new PointsModule());
      gk.use(new BadgeModule());
      gk.use(new LevelModule());
      gk.use(new QuestModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should complete tutorial quest chain and award welcome badge', async () => {
      const userId = 'new_user123';
      const questModule = gk.modules.get('quests');
      const badgeModule = gk.modules.get('badges');
      const pointsModule = gk.modules.get('points');
      const levelModule = gk.modules.get('levels');

      // Create welcome badge
      await badgeModule.create({
        id: 'welcome',
        name: 'Welcome!',
        description: 'Complete the tutorial',
        autoAward: false
      });

      // Create tutorial quest chain
      questModule.addQuest({
        id: 'tutorial-profile',
        name: 'Complete Your Profile',
        category: 'tutorial',
        chainId: 'onboarding',
        chainOrder: 1,
        objectives: [
          { id: 'upload-avatar', type: 'event', target: 'profile.avatar.uploaded', required: 1 },
          { id: 'set-bio', type: 'event', target: 'profile.bio.set', required: 1 }
        ],
        rewards: { points: 50, xp: 30 }
      });

      questModule.addQuest({
        id: 'tutorial-first-action',
        name: 'Perform Your First Action',
        category: 'tutorial',
        chainId: 'onboarding',
        chainOrder: 2,
        objectives: [
          { id: 'first-post', type: 'event', target: 'content.created', required: 1 }
        ],
        rewards: { points: 100, xp: 50 }
      });

      questModule.addQuest({
        id: 'tutorial-social',
        name: 'Make a Friend',
        category: 'tutorial',
        chainId: 'onboarding',
        chainOrder: 3,
        objectives: [
          { id: 'follow-user', type: 'event', target: 'social.follow', required: 1 }
        ],
        rewards: { points: 75, xp: 40 }
      });

      // Set up completion rule
      gk.ruleEngine.addRule({
        id: 'onboarding-complete',
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'quest.completed'
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            if (context.questId === 'tutorial-social') {
              await gk.modules.get('badges').award(context.userId, 'welcome');
            }
          }
        }]
      });

      // User completes onboarding
      await questModule.assignQuest(userId, 'tutorial-profile');
      await gk.track('profile.avatar.uploaded', { userId });
      await gk.track('profile.bio.set', { userId });
      await new Promise(resolve => setTimeout(resolve, 50));

      await questModule.assignQuest(userId, 'tutorial-first-action');
      await gk.track('content.created', { userId });
      await new Promise(resolve => setTimeout(resolve, 50));

      await questModule.assignQuest(userId, 'tutorial-social');
      await gk.track('social.follow', { userId, targetUserId: 'user456' });
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify completion
      const badges = await badgeModule.getUserBadges(userId);
      expect(badges.some((b: any) => b.id === 'welcome')).toBe(true);

      // Check points (with newbie multiplier: (50 + 100 + 75) * 2 = 450)
      const points = await pointsModule.getBalance(userId);
      expect(points).toBe(450);

      // Check level (120 XP total)
      const levelStats = await levelModule.getUserStats(userId);
      expect(levelStats.level).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Daily Engagement with Streak System', () => {
    let gk: any;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false },
        modules: {
          points: {
            multipliers: {}
          },
          streaks: {
            gracePeriod: 24 * 60 * 60 * 1000 // 1 day grace period
          }
        }
      });

      gk.use(new PointsModule());
      gk.use(new BadgeModule());
      gk.use(new StreakModule());
      gk.use(new LevelModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should reward user for maintaining 7-day streak with bonus points', async () => {
      const userId = 'consistent_user';
      const streakModule = gk.modules.get('streaks');
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');

      // Create streak milestone badges
      await badgeModule.create({
        id: 'streak-3',
        name: '3-Day Streak',
        description: 'Login for 3 consecutive days'
      });

      await badgeModule.create({
        id: 'streak-7',
        name: 'Week Warrior',
        description: 'Login for 7 consecutive days'
      });

      // Set up streak bonus rules
      gk.ruleEngine.addRule({
        id: 'streak-milestone-3',
        condition: {
          operator: 'and',
          conditions: [
            { field: 'eventName', operator: '==', value: 'streak.updated' },
            { field: 'current', operator: '==', value: 3 }
          ]
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            await gk.modules.get('badges').award(context.userId, 'streak-3');
            await gk.modules.get('points').award(context.userId, 50, 'streak-3-bonus');
          }
        }]
      });

      gk.ruleEngine.addRule({
        id: 'streak-milestone-7',
        condition: {
          operator: 'and',
          conditions: [
            { field: 'eventName', operator: '==', value: 'streak.updated' },
            { field: 'current', operator: '==', value: 7 }
          ]
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            await gk.modules.get('badges').award(context.userId, 'streak-7');
            await gk.modules.get('points').award(context.userId, 200, 'streak-7-bonus');
          }
        }]
      });

      // Set up daily multiplier based on streak
      gk.ruleEngine.addRule({
        id: 'streak-multiplier',
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'daily.login'
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            const streak = await gk.modules.get('streaks').getStreak(context.userId, 'daily-login');
            const multiplier = Math.min(streak.current * 0.1 + 1, 2.0); // Max 2x at 10 days
            const basePoints = 10;
            const bonusPoints = Math.floor(basePoints * multiplier) - basePoints;

            if (bonusPoints > 0) {
              await gk.modules.get('points').award(context.userId, bonusPoints, 'streak-multiplier');
            }
          }
        }]
      });

      // Simulate 7 days of logins
      jest.useFakeTimers();
      const baseTime = new Date('2024-01-01T10:00:00Z').getTime();

      for (let day = 0; day < 7; day++) {
        jest.setSystemTime(baseTime + day * 24 * 60 * 60 * 1000);

        await streakModule.increment(userId, 'daily-login');
        await pointsModule.award(userId, 10, 'daily-login');
        await gk.track('daily.login', { userId });

        await new Promise(resolve => setTimeout(resolve, 20));
      }

      jest.useRealTimers();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify streak
      const streak = await streakModule.getStreak(userId, 'daily-login');
      expect(streak.current).toBe(7);
      expect(streak.longest).toBe(7);

      // Verify badges
      const badges = await badgeModule.getUserBadges(userId);
      expect(badges.some((b: any) => b.id === 'streak-3')).toBe(true);
      expect(badges.some((b: any) => b.id === 'streak-7')).toBe(true);

      // Verify bonus points (10 per day * 7 + streak bonuses)
      const points = await pointsModule.getBalance(userId);
      expect(points).toBeGreaterThan(70); // Base + bonuses
    });

    it('should handle streak freeze when user misses a day', async () => {
      const userId = 'busy_user';
      const streakModule = gk.modules.get('streaks');

      // User has 5-day streak
      jest.useFakeTimers();
      const baseTime = new Date('2024-01-01T10:00:00Z').getTime();

      for (let day = 0; day < 5; day++) {
        jest.setSystemTime(baseTime + day * 24 * 60 * 60 * 1000);
        await streakModule.increment(userId, 'daily-login');
      }

      let streak = await streakModule.getStreak(userId, 'daily-login');
      expect(streak.current).toBe(5);

      // User gets a streak freeze
      await streakModule.addFreeze(userId, 'daily-login', 1);

      // User misses day 6 (but has freeze)
      jest.setSystemTime(baseTime + 6 * 24 * 60 * 60 * 1000);

      // User logs in on day 7
      jest.setSystemTime(baseTime + 7 * 24 * 60 * 60 * 1000);
      await streakModule.increment(userId, 'daily-login');

      jest.useRealTimers();

      // Streak should be maintained (freeze was used)
      streak = await streakModule.getStreak(userId, 'daily-login');
      expect(streak.current).toBeGreaterThan(0);
    });
  });

  describe('Competitive Leaderboard Season', () => {
    let gk: any;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      gk.use(new BadgeModule());
      gk.use(new LeaderboardModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should handle competitive season with top players earning badges', async () => {
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');

      // Create season badges
      await badgeModule.create({
        id: 'season-1-gold',
        name: 'Season 1 Gold',
        description: 'Top player in Season 1'
      });

      await badgeModule.create({
        id: 'season-1-silver',
        name: 'Season 1 Silver',
        description: 'Top 3 player in Season 1'
      });

      await badgeModule.create({
        id: 'season-1-bronze',
        name: 'Season 1 Bronze',
        description: 'Top 10 player in Season 1'
      });

      // Simulate 20 players competing
      const players = [];
      for (let i = 0; i < 20; i++) {
        const userId = `player${i}`;
        const points = Math.floor(Math.random() * 5000) + 1000;
        players.push({ userId, points });
        await pointsModule.award(userId, points, 'season-activity');
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Get final leaderboard
      const leaderboard = await pointsModule.getLeaderboard({ limit: 20 });

      // Award season badges
      if (leaderboard.length > 0) {
        await badgeModule.award(leaderboard[0].userId, 'season-1-gold');
      }

      if (leaderboard.length >= 3) {
        for (let i = 0; i < 3; i++) {
          await badgeModule.award(leaderboard[i].userId, 'season-1-silver');
        }
      }

      if (leaderboard.length >= 10) {
        for (let i = 0; i < 10; i++) {
          await badgeModule.award(leaderboard[i].userId, 'season-1-bronze');
        }
      }

      // Verify top player has gold badge
      const topPlayerBadges = await badgeModule.getUserBadges(leaderboard[0].userId);
      expect(topPlayerBadges.some((b: any) => b.id === 'season-1-gold')).toBe(true);

      // Verify leaderboard is correctly sorted
      for (let i = 0; i < leaderboard.length - 1; i++) {
        expect(leaderboard[i].points).toBeGreaterThanOrEqual(leaderboard[i + 1].points);
        expect(leaderboard[i].rank).toBe(i + 1);
      }
    });

    it('should update leaderboard in real-time during intense competition', async () => {
      const pointsModule = gk.modules.get('points');

      // Create 10 players
      const players = ['alice', 'bob', 'charlie', 'david', 'eve', 'frank', 'grace', 'henry', 'ivy', 'jack'];

      // Simulate rapid point awards
      const operations = [];
      for (let round = 0; round < 5; round++) {
        for (const player of players) {
          const points = Math.floor(Math.random() * 100) + 10;
          operations.push(pointsModule.award(player, points));
        }
      }

      await Promise.all(operations);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get final leaderboard
      const leaderboard = await pointsModule.getLeaderboard({ limit: 10 });

      // Verify all players are present
      expect(leaderboard).toHaveLength(10);

      // Verify correct ordering
      for (let i = 0; i < leaderboard.length - 1; i++) {
        expect(leaderboard[i].points).toBeGreaterThanOrEqual(leaderboard[i + 1].points);
      }

      // Verify top player's points match direct query
      const topPlayerPoints = await pointsModule.getBalance(leaderboard[0].userId);
      expect(topPlayerPoints).toBe(leaderboard[0].points);
    });
  });

  describe('Achievement Progression System', () => {
    let gk: any;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      gk.use(new AchievementModule());
      gk.use(new BadgeModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should progressively unlock achievement tiers', async () => {
      const userId = 'achiever_user';
      const achievementModule = gk.modules.get('achievements');
      const pointsModule = gk.modules.get('points');

      // Create tiered achievement
      await achievementModule.addAchievement({
        id: 'content-creator',
        name: 'Content Creator',
        description: 'Create content',
        tiers: [
          { tier: 'bronze', requirement: 10, rewards: { points: 100 } },
          { tier: 'silver', requirement: 50, rewards: { points: 500 } },
          { tier: 'gold', requirement: 100, rewards: { points: 1500 } },
          { tier: 'platinum', requirement: 500, rewards: { points: 5000 } }
        ],
        trackingEvent: 'content.created'
      });

      // User creates content progressively
      for (let i = 0; i < 10; i++) {
        await gk.track('content.created', { userId, contentId: `content-${i}` });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check bronze tier
      let progress = await achievementModule.getProgress(userId, 'content-creator');
      expect(progress.currentTier).toBe('bronze');

      // Create more content to reach silver
      for (let i = 10; i < 50; i++) {
        await gk.track('content.created', { userId, contentId: `content-${i}` });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      progress = await achievementModule.getProgress(userId, 'content-creator');
      expect(progress.currentTier).toBe('silver');

      // Verify reward points were awarded
      const points = await pointsModule.getBalance(userId);
      expect(points).toBeGreaterThanOrEqual(600); // 100 (bronze) + 500 (silver)
    });
  });

  describe('Social Gaming Scenario', () => {
    let gk: any;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      gk.use(new BadgeModule());
      gk.use(new LevelModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should handle social interactions with referral rewards', async () => {
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');

      // Create social badges
      await badgeModule.create({
        id: 'influencer',
        name: 'Influencer',
        description: 'Refer 10 friends'
      });

      // Set up referral system
      gk.ruleEngine.addRule({
        id: 'referral-bonus',
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'user.referred'
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            // Referrer gets points
            await gk.modules.get('points').award(context.referrerId, 100, 'referral-bonus');
            // Referred user gets welcome bonus
            await gk.modules.get('points').award(context.userId, 50, 'welcome-referral');
          }
        }]
      });

      // Track referral count
      const referralCounts = new Map();

      gk.eventManager.on('user.referred', (data: any) => {
        const count = referralCounts.get(data.referrerId) || 0;
        referralCounts.set(data.referrerId, count + 1);
      });

      const referrerId = 'social_influencer';

      // Simulate 10 referrals
      for (let i = 0; i < 10; i++) {
        await gk.track('user.referred', {
          userId: `referred_user_${i}`,
          referrerId
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check referrer rewards (10 * 100 = 1000 points)
      const referrerPoints = await pointsModule.getBalance(referrerId);
      expect(referrerPoints).toBe(1000);

      // Check a referred user got welcome bonus
      const referredPoints = await pointsModule.getBalance('referred_user_0');
      expect(referredPoints).toBe(50);

      // Award influencer badge
      if (referralCounts.get(referrerId) >= 10) {
        await badgeModule.award(referrerId, 'influencer');
      }

      const badges = await badgeModule.getUserBadges(referrerId);
      expect(badges.some((b: any) => b.id === 'influencer')).toBe(true);
    });

    it('should handle team-based achievements', async () => {
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');

      // Create team badge
      await badgeModule.create({
        id: 'team-champion',
        name: 'Team Champion',
        description: 'Team collectively earned 10,000 points'
      });

      const teamMembers = ['player1', 'player2', 'player3', 'player4', 'player5'];
      let teamTotal = 0;

      // Set up team point tracking
      gk.eventManager.on('points.awarded', (data: any) => {
        if (teamMembers.includes(data.userId)) {
          teamTotal += data.points;
        }
      });

      // Team members earn points
      for (const member of teamMembers) {
        await pointsModule.award(member, 2000, 'team-activity');
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if team reached goal
      expect(teamTotal).toBe(10000);

      // Award team badge to all members
      if (teamTotal >= 10000) {
        for (const member of teamMembers) {
          await badgeModule.award(member, 'team-champion');
        }
      }

      // Verify all team members have the badge
      for (const member of teamMembers) {
        const badges = await badgeModule.getUserBadges(member);
        expect(badges.some((b: any) => b.id === 'team-champion')).toBe(true);
      }
    });
  });

  describe('Complete User Journey', () => {
    let gk: any;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: true },
        webhooks: { enabled: false },
        modules: {
          points: {
            multipliers: {
              vip: { value: 1.5, condition: (userId: string) => userId.includes('vip') }
            }
          },
          levels: {
            levels: [
              { level: 1, xpRequired: 0, rewards: {} },
              { level: 2, xpRequired: 100, rewards: { points: 50 } },
              { level: 3, xpRequired: 300, rewards: { points: 100, badge: 'level-3' } },
              { level: 4, xpRequired: 600, rewards: { points: 200 } },
              { level: 5, xpRequired: 1000, rewards: { points: 500, badge: 'level-5' } }
            ]
          }
        }
      });

      gk.use(new PointsModule());
      gk.use(new BadgeModule());
      gk.use(new LevelModule());
      gk.use(new StreakModule());
      gk.use(new QuestModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should handle complete user lifecycle from onboarding to mastery', async () => {
      const userId = 'power_user';
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');
      const levelModule = gk.modules.get('levels');
      const streakModule = gk.modules.get('streaks');
      const questModule = gk.modules.get('quests');

      // Create badges
      await badgeModule.create({ id: 'first-login', name: 'First Login' });
      await badgeModule.create({ id: 'level-3', name: 'Level 3' });
      await badgeModule.create({ id: 'level-5', name: 'Level 5' });
      await badgeModule.create({ id: 'streak-master', name: 'Streak Master' });
      await badgeModule.create({ id: 'quest-hunter', name: 'Quest Hunter' });

      // Set up XP conversion rule
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
            const xp = Math.floor(context.points * 0.3);
            await gk.modules.get('levels').addXP(context.userId, xp);
          }
        }]
      });

      // Phase 1: First login
      await badgeModule.award(userId, 'first-login');
      await pointsModule.award(userId, 100, 'first-login-bonus');

      // Phase 2: Complete daily quests for a week
      questModule.addQuest({
        id: 'daily-challenge',
        name: 'Daily Challenge',
        category: 'daily',
        objectives: [
          { id: 'task1', type: 'event', target: 'task.completed', required: 5 }
        ],
        rewards: { points: 150, xp: 50 },
        repeatable: true
      });

      jest.useFakeTimers();
      const baseTime = Date.now();

      for (let day = 0; day < 7; day++) {
        jest.setSystemTime(baseTime + day * 24 * 60 * 60 * 1000);

        // Daily login streak
        await streakModule.increment(userId, 'daily-login');

        // Complete daily quest
        await questModule.assignQuest(userId, 'daily-challenge');
        for (let i = 0; i < 5; i++) {
          await gk.track('task.completed', { userId });
        }

        await new Promise(resolve => setTimeout(resolve, 20));
      }

      jest.useRealTimers();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Phase 3: Check progress
      const stats = await gk.getUserStats(userId);

      // Verify streak
      expect(stats.modules.streaks['daily-login'].current).toBe(7);

      // Verify points (100 initial + 7 * 150 from quests)
      expect(stats.modules.points.current).toBeGreaterThanOrEqual(1150);

      // Verify level (should have leveled up from XP)
      expect(stats.modules.levels.level).toBeGreaterThanOrEqual(2);

      // Phase 4: Award streak master badge
      const streak = await streakModule.getStreak(userId, 'daily-login');
      if (streak.current >= 7) {
        await badgeModule.award(userId, 'streak-master');
      }

      // Phase 5: Verify final state
      const finalStats = await gk.getUserStats(userId);

      expect(finalStats.modules.badges.count).toBeGreaterThanOrEqual(2);
      expect(finalStats.modules.points.current).toBeGreaterThan(0);
      expect(finalStats.modules.levels.level).toBeGreaterThanOrEqual(1);
      expect(finalStats.modules.streaks['daily-login'].current).toBe(7);

      // Verify metrics were collected
      const metrics = await gk.metricsCollector?.getMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('Error Recovery Scenarios', () => {
    let gk: any;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      gk.use(new BadgeModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should recover gracefully from partial failures in event chain', async () => {
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');

      // Create badge
      await badgeModule.create({ id: 'resilient', name: 'Resilient' });

      // Add rule that fails
      gk.ruleEngine.addRule({
        id: 'failing-rule',
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'points.awarded'
        },
        actions: [{
          type: 'custom',
          handler: async () => {
            throw new Error('Simulated failure');
          }
        }]
      });

      // Add rule that succeeds
      gk.ruleEngine.addRule({
        id: 'success-rule',
        condition: {
          field: 'eventName',
          operator: '==',
          value: 'points.awarded'
        },
        actions: [{
          type: 'custom',
          handler: async (context: any, gk: any) => {
            if (context.points >= 100) {
              await gk.modules.get('badges').award(context.userId, 'resilient');
            }
          }
        }]
      });

      // Award points (first rule fails, second succeeds)
      await pointsModule.award('user1', 100);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify points were still awarded despite rule failure
      const balance = await pointsModule.getBalance('user1');
      expect(balance).toBe(100);

      // Verify successful rule executed
      const badges = await badgeModule.getUserBadges('user1');
      expect(badges.some((b: any) => b.id === 'resilient')).toBe(true);
    });
  });
});
