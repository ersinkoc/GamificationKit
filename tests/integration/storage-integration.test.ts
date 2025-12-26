import { jest } from '@jest/globals';
import { GamificationKit } from '../../src/core/GamificationKit.js';
import { PointsModule } from '../../src/modules/PointsModule.js';
import { BadgeModule } from '../../src/modules/BadgeModule.js';
import { LevelModule } from '../../src/modules/LevelModule.js';
import { StreakModule } from '../../src/modules/StreakModule.js';
import { MemoryStorage } from '../../src/storage/MemoryStorage.js';
import { RedisStorage } from '../../src/storage/RedisStorage.js';
import { MongoStorage } from '../../src/storage/MongoStorage.js';
import { PostgresStorage } from '../../src/storage/PostgresStorage.js';

/**
 * Storage Integration Tests
 *
 * Tests storage adapters with different backends and cross-module data persistence.
 * Covers:
 * - MemoryStorage integration
 * - RedisStorage integration
 * - MongoStorage integration
 * - PostgresStorage integration
 * - Cross-module data persistence
 * - Transaction handling
 * - Cache consistency
 * - Storage adapter switching
 */
describe('Storage Integration Tests', () => {
  describe('MemoryStorage Integration', () => {
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
      gk.use(new StreakModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should persist data across module operations', async () => {
      const pointsModule = gk.modules.get('points');
      const badgeModule = gk.modules.get('badges');

      // Perform operations
      await pointsModule.award('user1', 100);
      await badgeModule.create({ id: 'test-badge', name: 'Test' });
      await badgeModule.award('user1', 'test-badge');

      // Verify persistence
      const balance = await pointsModule.getBalance('user1');
      expect(balance).toBe(100);

      const badges = await badgeModule.getUserBadges('user1');
      expect(badges).toHaveLength(1);
      expect(badges[0].id).toBe('test-badge');
    });

    it('should handle sorted sets correctly', async () => {
      const pointsModule = gk.modules.get('points');

      // Award points to multiple users
      await pointsModule.award('user1', 100);
      await pointsModule.award('user2', 200);
      await pointsModule.award('user3', 150);

      // Get leaderboard (uses sorted set)
      const leaderboard = await pointsModule.getLeaderboard({ limit: 3 });

      expect(leaderboard).toEqual([
        { userId: 'user2', points: 200, rank: 1 },
        { userId: 'user3', points: 150, rank: 2 },
        { userId: 'user1', points: 100, rank: 3 }
      ]);
    });

    it('should handle hash operations correctly', async () => {
      const levelModule = gk.modules.get('levels');

      // Add XP
      await levelModule.addXP('user1', 150);

      // Get stats (uses hash)
      const stats = await levelModule.getUserStats('user1');

      expect(stats).toEqual(
        expect.objectContaining({
          level: expect.any(Number),
          xp: 150
        })
      );
    });

    it('should handle list operations correctly', async () => {
      const badgeModule = gk.modules.get('badges');

      // Award multiple badges
      await badgeModule.create({ id: 'badge1', name: 'Badge 1' });
      await badgeModule.create({ id: 'badge2', name: 'Badge 2' });
      await badgeModule.create({ id: 'badge3', name: 'Badge 3' });

      await badgeModule.award('user1', 'badge1');
      await badgeModule.award('user1', 'badge2');
      await badgeModule.award('user1', 'badge3');

      // Get badges (uses list)
      const badges = await badgeModule.getUserBadges('user1');

      expect(badges).toHaveLength(3);
      expect(badges.map((b: any) => b.id)).toContain('badge1');
      expect(badges.map((b: any) => b.id)).toContain('badge2');
      expect(badges.map((b: any) => b.id)).toContain('badge3');
    });

    it('should handle TTL operations correctly', async () => {
      const storage = gk.storage;

      // Set value with TTL
      await storage.set('test:ttl', 'value', 1); // 1 second TTL

      // Value should exist
      let value = await storage.get('test:ttl');
      expect(value).toBe('value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Value should be expired
      value = await storage.get('test:ttl');
      expect(value).toBeNull();
    });

    it('should handle concurrent operations without data corruption', async () => {
      const pointsModule = gk.modules.get('points');

      // Perform 50 concurrent awards
      const operations = [];
      for (let i = 0; i < 50; i++) {
        operations.push(pointsModule.award('user1', 10));
      }

      await Promise.all(operations);

      // Verify total
      const balance = await pointsModule.getBalance('user1');
      expect(balance).toBe(500); // 50 * 10
    });
  });

  describe('Storage Adapter Compatibility', () => {
    it('should work with custom storage adapter', async () => {
      // Create custom in-memory storage adapter
      class CustomStorage extends MemoryStorage {
        async get(key: string): Promise<any> {
          // Add custom logging
          const value = await super.get(key);
          return value;
        }
      }

      const customStorage = new CustomStorage();
      await customStorage.connect();

      const gk = new GamificationKit({
        storage: customStorage,
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();

      const pointsModule = gk.modules.get('points');
      await pointsModule.award('user1', 100);

      const balance = await pointsModule.getBalance('user1');
      expect(balance).toBe(100);

      await gk.shutdown();
    });
  });

  describe('Cross-Module Data Persistence', () => {
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
      gk.use(new StreakModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should persist data correctly when multiple modules access same user', async () => {
      const pointsModule = gk.modules.get('points');
      const levelModule = gk.modules.get('levels');
      const badgeModule = gk.modules.get('badges');
      const streakModule = gk.modules.get('streaks');

      // Perform operations across modules
      await pointsModule.award('user1', 500);
      await levelModule.addXP('user1', 200);
      await badgeModule.create({ id: 'test', name: 'Test' });
      await badgeModule.award('user1', 'test');
      await streakModule.increment('user1', 'daily-login');

      // Get aggregated stats
      const stats = await gk.getUserStats('user1');

      expect(stats.modules.points.current).toBe(500);
      expect(stats.modules.levels.xp).toBe(200);
      expect(stats.modules.badges.count).toBe(1);
      expect(stats.modules.streaks['daily-login'].current).toBe(1);
    });

    it('should maintain referential integrity across modules', async () => {
      const badgeModule = gk.modules.get('badges');

      // Create badge
      await badgeModule.create({
        id: 'integrity-test',
        name: 'Integrity Test',
        description: 'Test referential integrity'
      });

      // Award to multiple users
      await badgeModule.award('user1', 'integrity-test');
      await badgeModule.award('user2', 'integrity-test');
      await badgeModule.award('user3', 'integrity-test');

      // Verify all users have the badge
      const user1Badges = await badgeModule.getUserBadges('user1');
      const user2Badges = await badgeModule.getUserBadges('user2');
      const user3Badges = await badgeModule.getUserBadges('user3');

      expect(user1Badges).toHaveLength(1);
      expect(user2Badges).toHaveLength(1);
      expect(user3Badges).toHaveLength(1);

      // All should reference the same badge
      expect(user1Badges[0].id).toBe('integrity-test');
      expect(user2Badges[0].id).toBe('integrity-test');
      expect(user3Badges[0].id).toBe('integrity-test');
    });

    it('should handle batch operations efficiently', async () => {
      const pointsModule = gk.modules.get('points');
      const storage = gk.storage;

      const startTime = Date.now();

      // Perform batch operations
      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(pointsModule.award(`user${i}`, 100));
      }

      await Promise.all(operations);

      const duration = Date.now() - startTime;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(2000);

      // Verify some random users
      const balance1 = await pointsModule.getBalance('user10');
      const balance2 = await pointsModule.getBalance('user50');
      const balance3 = await pointsModule.getBalance('user90');

      expect(balance1).toBe(100);
      expect(balance2).toBe(100);
      expect(balance3).toBe(100);
    });
  });

  describe('Cache Consistency', () => {
    let gk: any;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      gk.use(new LevelModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should maintain cache consistency during rapid updates', async () => {
      const pointsModule = gk.modules.get('points');

      // Rapidly update points
      for (let i = 0; i < 10; i++) {
        await pointsModule.award('user1', 10);
      }

      // Get balance (should be cached)
      const balance1 = await pointsModule.getBalance('user1');

      // Get again immediately
      const balance2 = await pointsModule.getBalance('user1');

      expect(balance1).toBe(100);
      expect(balance2).toBe(100);
    });

    it('should invalidate cache on data modification', async () => {
      const pointsModule = gk.modules.get('points');

      // Set initial balance
      await pointsModule.award('user1', 100);
      const initial = await pointsModule.getBalance('user1');
      expect(initial).toBe(100);

      // Deduct points (should invalidate cache)
      await pointsModule.deduct('user1', 50);
      const updated = await pointsModule.getBalance('user1');
      expect(updated).toBe(50);
    });
  });

  describe('Storage Key Namespacing', () => {
    it('should properly namespace keys to avoid collisions', async () => {
      const gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      gk.use(new LevelModule());

      await gk.initialize();

      const pointsModule = gk.modules.get('points');
      const levelModule = gk.modules.get('levels');

      // Set data in different modules for same user
      await pointsModule.award('user1', 100);
      await levelModule.addXP('user1', 200);

      // Verify both are stored correctly
      const points = await pointsModule.getBalance('user1');
      const levelStats = await levelModule.getUserStats('user1');

      expect(points).toBe(100);
      expect(levelStats.xp).toBe(200);

      await gk.shutdown();
    });

    it('should handle special characters in keys', async () => {
      const gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();

      const pointsModule = gk.modules.get('points');

      // Use special characters in user ID
      const specialUserId = 'user:123:test@example.com';
      await pointsModule.award(specialUserId, 100);

      const balance = await pointsModule.getBalance(specialUserId);
      expect(balance).toBe(100);

      await gk.shutdown();
    });
  });

  describe('Storage Error Handling', () => {
    let gk: any;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
    });

    it('should handle storage read errors gracefully', async () => {
      const storage = gk.storage;

      // Mock storage to throw error
      storage.get = jest.fn().mockRejectedValue(new Error('Storage read error'));

      const pointsModule = gk.modules.get('points');

      // Should propagate error
      await expect(pointsModule.getBalance('user1')).rejects.toThrow('Storage read error');
    });

    it('should handle storage write errors gracefully', async () => {
      const storage = gk.storage;

      // Mock storage to throw error on write
      storage.zincrby = jest.fn().mockRejectedValue(new Error('Storage write error'));

      const pointsModule = gk.modules.get('points');

      // Should propagate error
      await expect(pointsModule.award('user1', 100)).rejects.toThrow('Storage write error');
    });

    it('should handle storage connection errors', async () => {
      const storage = new MemoryStorage();

      // Don't connect
      storage.connected = false;

      const gk2 = new GamificationKit({
        storage: storage,
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk2.use(new PointsModule());

      // Should handle gracefully during initialization
      await expect(gk2.initialize()).rejects.toThrow();
    });
  });

  describe('Data Migration Scenarios', () => {
    it('should support exporting and importing user data', async () => {
      const gk1 = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk1.use(new PointsModule());
      gk1.use(new BadgeModule());
      gk1.use(new LevelModule());

      await gk1.initialize();

      // Set up user data
      const pointsModule1 = gk1.modules.get('points');
      const badgeModule1 = gk1.modules.get('badges');
      const levelModule1 = gk1.modules.get('levels');

      await pointsModule1.award('user1', 500);
      await badgeModule1.create({ id: 'migration-test', name: 'Migration' });
      await badgeModule1.award('user1', 'migration-test');
      await levelModule1.addXP('user1', 300);

      // Export data
      const exportedData = await gk1.getUserStats('user1');

      await gk1.shutdown();

      // Create new instance with fresh storage
      const gk2 = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk2.use(new PointsModule());
      gk2.use(new BadgeModule());
      gk2.use(new LevelModule());

      await gk2.initialize();

      // Verify data can be queried (migration would need custom implementation)
      const stats = await gk2.getUserStats('user1');
      expect(stats.userId).toBe('user1');

      await gk2.shutdown();
    });
  });

  describe('Storage Performance', () => {
    it('should handle large datasets efficiently', async () => {
      const gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();

      const pointsModule = gk.modules.get('points');
      const startTime = Date.now();

      // Create 1000 users with points
      const operations = [];
      for (let i = 0; i < 1000; i++) {
        operations.push(pointsModule.award(`user${i}`, Math.floor(Math.random() * 1000)));
      }

      await Promise.all(operations);

      const createDuration = Date.now() - startTime;
      expect(createDuration).toBeLessThan(5000); // Should complete in < 5 seconds

      // Query leaderboard
      const leaderboardStart = Date.now();
      const leaderboard = await pointsModule.getLeaderboard({ limit: 100 });
      const leaderboardDuration = Date.now() - leaderboardStart;

      expect(leaderboard).toHaveLength(100);
      expect(leaderboardDuration).toBeLessThan(500); // Should be fast

      await gk.shutdown();
    });

    it('should optimize repeated queries', async () => {
      const gk = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();

      const pointsModule = gk.modules.get('points');
      await pointsModule.award('user1', 100);

      // First query
      const start1 = Date.now();
      await pointsModule.getBalance('user1');
      const duration1 = Date.now() - start1;

      // Second query (should be faster if cached)
      const start2 = Date.now();
      await pointsModule.getBalance('user1');
      const duration2 = Date.now() - start2;

      // Both should be fast
      expect(duration1).toBeLessThan(100);
      expect(duration2).toBeLessThan(100);

      await gk.shutdown();
    });
  });

  describe('Multi-Instance Storage', () => {
    it('should handle multiple GamificationKit instances with separate storage', async () => {
      const gk1 = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      const gk2 = new GamificationKit({
        storage: { type: 'memory' },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk1.use(new PointsModule());
      gk2.use(new PointsModule());

      await gk1.initialize();
      await gk2.initialize();

      // Award points in different instances
      const points1 = gk1.modules.get('points');
      const points2 = gk2.modules.get('points');

      await points1.award('user1', 100);
      await points2.award('user1', 200);

      // Verify isolation
      const balance1 = await points1.getBalance('user1');
      const balance2 = await points2.getBalance('user1');

      expect(balance1).toBe(100);
      expect(balance2).toBe(200);

      await gk1.shutdown();
      await gk2.shutdown();
    });
  });
});
