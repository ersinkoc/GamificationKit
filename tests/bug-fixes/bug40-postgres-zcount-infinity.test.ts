import type { GamificationKit } from '../src/core/GamificationKit.js';
/**
 * Bug Fix #40: PostgresStorage.zcount() handles '-inf' and '+inf' special values
 *
 * Issue: The zcount method passed min/max directly to SQL but didn't handle
 * Redis special values '-inf' and '+inf', which would cause SQL errors.
 *
 * Fix: Added special value handling before the query to properly convert
 * infinity values to appropriate SQL conditions.
 */

import { MemoryStorage } from '../../src/storage/MemoryStorage.js';

describe('Bug Fix #40: Storage zcount with infinity values', (): void => {
  let storage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.connect();

    // Add test data
    await storage.zadd('test:leaderboard', 10, 'user1');
    await storage.zadd('test:leaderboard', 20, 'user2');
    await storage.zadd('test:leaderboard', 30, 'user3');
    await storage.zadd('test:leaderboard', 40, 'user4');
    await storage.zadd('test:leaderboard', 50, 'user5');
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  test('should count all elements with -inf to +inf', async (): Promise<void> => {
    const count = await storage.zcount('test:leaderboard', '-inf', '+inf');
    expect(count).toBe(5);
  });

  test('should count elements from -inf to specific value', async (): Promise<void> => {
    const count = await storage.zcount('test:leaderboard', '-inf', 30);
    expect(count).toBe(3);
  });

  test('should count elements from specific value to +inf', async (): Promise<void> => {
    const count = await storage.zcount('test:leaderboard', 30, '+inf');
    expect(count).toBe(3);
  });

  test('should count elements within specific range', async (): Promise<void> => {
    const count = await storage.zcount('test:leaderboard', 20, 40);
    expect(count).toBe(3);
  });

  test('should return 0 for empty range', async (): Promise<void> => {
    const count = await storage.zcount('test:leaderboard', 100, 200);
    expect(count).toBe(0);
  });
});
