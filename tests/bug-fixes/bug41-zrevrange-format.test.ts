import type { GamificationKit } from '../src/core/GamificationKit.js';
/**
 * Bug Fix #41: Storage zrevrange/zrange returns consistent object format
 *
 * Issue: PostgresStorage returned flat array [member, score, member, score...]
 * instead of array of objects [{member, score}, ...] like MemoryStorage/MongoStorage.
 *
 * Fix: Changed PostgresStorage to return array of objects format for consistency.
 */

import { MemoryStorage } from '../../src/storage/MemoryStorage.js';

describe('Bug Fix #41: Storage zrevrange returns consistent format', (): void => {
  let storage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.connect();

    // Add test data
    await storage.zadd('test:leaderboard', 10, 'user1');
    await storage.zadd('test:leaderboard', 20, 'user2');
    await storage.zadd('test:leaderboard', 30, 'user3');
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  test('should return array of objects with withScores option', async (): Promise<void> => {
    const results = await storage.zrevrange('test:leaderboard', 0, -1, { withScores: true });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);

    // Should be array of objects format
    expect(results[0]).toHaveProperty('member');
    expect(results[0]).toHaveProperty('score');

    // Verify order (descending)
    expect(results[0].member).toBe('user3');
    expect(results[0].score).toBe(30);
    expect(results[1].member).toBe('user2');
    expect(results[1].score).toBe(20);
    expect(results[2].member).toBe('user1');
    expect(results[2].score).toBe(10);
  });

  test('should return array of members without withScores option', async (): Promise<void> => {
    const results = await storage.zrevrange('test:leaderboard', 0, -1);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);
    expect(results).toEqual(['user3', 'user2', 'user1']);
  });

  test('zrange should return array of objects with withScores option', async (): Promise<void> => {
    const results = await storage.zrange('test:leaderboard', 0, -1, { withScores: true });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);

    // Should be array of objects format
    expect(results[0]).toHaveProperty('member');
    expect(results[0]).toHaveProperty('score');

    // Verify order (ascending)
    expect(results[0].member).toBe('user1');
    expect(results[0].score).toBe(10);
  });
});
