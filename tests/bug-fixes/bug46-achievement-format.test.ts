import type { GamificationKit } from '../src/core/GamificationKit.js';
/**
 * Bug Fix #46: AchievementModule.getTopScorers handles correct zrevrange format
 *
 * Issue: The code only handled flat array format [userId, score, userId, score...]
 * but storage adapters return [{member, score}, ...] format. This caused incorrect
 * parsing of leaderboard data.
 *
 * Fix: Updated to check for and handle object array format first, with backwards
 * compatibility for flat array format.
 */

import { AchievementModule } from '../../src/modules/AchievementModule.js';
import { MemoryStorage } from '../../src/storage/MemoryStorage.js';
import { EventManager } from '../../src/core/EventManager.js';
import { Logger } from '../../src/utils/logger.js';

describe('Bug Fix #46: AchievementModule getTopScorers format handling', (): void => {
  let achievementModule;
  let storage;
  let eventManager;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.connect();
    eventManager = new EventManager();

    achievementModule = new AchievementModule();
    achievementModule.setContext({
      storage,
      eventManager,
      logger: new Logger({ prefix: 'AchievementModule' })
    });
    await achievementModule.initialize();
  });

  afterEach(async () => {
    await achievementModule.shutdown();
    await storage.disconnect();
  });

  test('should correctly parse top scorers from object array format', async (): Promise<void> => {
    // Add some achievement scores
    await storage.zadd(achievementModule.getStorageKey('leaderboard'), 100, 'user1');
    await storage.zadd(achievementModule.getStorageKey('leaderboard'), 200, 'user2');
    await storage.zadd(achievementModule.getStorageKey('leaderboard'), 150, 'user3');

    const topScorers = await achievementModule.getTopScorers(10);

    expect(Array.isArray(topScorers)).toBe(true);
    expect(topScorers.length).toBe(3);

    // Should be in descending order
    expect(topScorers[0].userId).toBe('user2');
    expect(topScorers[0].score).toBe(200);
    expect(topScorers[0].rank).toBe(1);

    expect(topScorers[1].userId).toBe('user3');
    expect(topScorers[1].score).toBe(150);
    expect(topScorers[1].rank).toBe(2);

    expect(topScorers[2].userId).toBe('user1');
    expect(topScorers[2].score).toBe(100);
    expect(topScorers[2].rank).toBe(3);
  });

  test('should return empty array when no scores exist', async (): Promise<void> => {
    const topScorers = await achievementModule.getTopScorers(10);

    expect(Array.isArray(topScorers)).toBe(true);
    expect(topScorers.length).toBe(0);
  });

  test('should respect limit parameter', async (): Promise<void> => {
    await storage.zadd(achievementModule.getStorageKey('leaderboard'), 100, 'user1');
    await storage.zadd(achievementModule.getStorageKey('leaderboard'), 200, 'user2');
    await storage.zadd(achievementModule.getStorageKey('leaderboard'), 150, 'user3');
    await storage.zadd(achievementModule.getStorageKey('leaderboard'), 300, 'user4');
    await storage.zadd(achievementModule.getStorageKey('leaderboard'), 250, 'user5');

    const topScorers = await achievementModule.getTopScorers(3);

    expect(topScorers.length).toBe(3);
    expect(topScorers[0].userId).toBe('user4'); // highest
    expect(topScorers[1].userId).toBe('user5');
    expect(topScorers[2].userId).toBe('user2');
  });
});
