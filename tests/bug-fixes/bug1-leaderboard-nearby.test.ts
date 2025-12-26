import type { GamificationKit } from '../src/core/GamificationKit.js';
import { jest } from '@jest/globals';
import { LeaderboardModule } from '../../src/modules/LeaderboardModule.js';
import { MemoryStorage } from '../../src/storage/MemoryStorage.js';
import { EventManager } from '../../src/core/EventManager.js';
import { Logger } from '../../src/utils/logger.js';

describe('Bug Fix #1: LeaderboardModule nearbyCount default', (): void => {
  let leaderboardModule;
  let storage;
  let eventManager;
  let logger;

  beforeEach(async () => {
    storage = new MemoryStorage();
    eventManager = new EventManager();
    logger = new Logger({ prefix: 'LeaderboardModule' });
    await storage.connect();

    leaderboardModule = new LeaderboardModule({
      updateInterval: 100,
      maxEntries: 100
    });

    leaderboardModule.setContext({
      storage,
      eventManager,
      logger,
      config: {}
    });

    await leaderboardModule.initialize();
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  it('should NOT include nearby users when includeUser is used without nearbyCount', async (): Promise<void> => {
    // Setup: Add users to leaderboard
    await leaderboardModule.updateScore('global', 'user1', 500);
    await leaderboardModule.updateScore('global', 'user2', 300);
    await leaderboardModule.updateScore('global', 'user3', 700);
    await leaderboardModule.updateScore('global', 'user4', 400);
    await leaderboardModule.updateScore('global', 'user5', 600);

    // Test: Get leaderboard with includeUser but WITHOUT nearbyCount
    const result = await leaderboardModule.getLeaderboard('global', {
      limit: 3,
      includeUser: 'user4'
    });

    // Verify: userPosition should NOT have nearby array
    expect(result.userPosition).toEqual({
      userId: 'user4',
      score: 400,
      rank: 4
    });
    expect(result.userPosition.nearby).toBeUndefined();
  });

  it('should include nearby users when nearbyCount is explicitly provided', async (): Promise<void> => {
    // Setup: Add users to leaderboard
    await leaderboardModule.updateScore('global', 'user1', 500);
    await leaderboardModule.updateScore('global', 'user2', 300);
    await leaderboardModule.updateScore('global', 'user3', 700);

    // Test: Get leaderboard with includeUser AND nearbyCount
    const result = await leaderboardModule.getLeaderboard('global', {
      limit: 2,
      includeUser: 'user2',
      nearbyCount: 1
    });

    // Verify: userPosition SHOULD have nearby array
    expect(result.userPosition.userId).toBe('user2');
    expect(result.userPosition.nearby).toBeDefined();
    expect(Array.isArray(result.userPosition.nearby)).toBe(true);
  });
});
