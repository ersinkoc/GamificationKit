import type { GamificationKit } from '../src/core/GamificationKit.js';
import { jest } from '@jest/globals';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';

describe('MemoryStorage', (): void => {
  let storage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.connect();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await storage.disconnect();
  });

  describe('connect/disconnect', (): void => {
    it('should connect successfully', async (): Promise<void> => {
      const newStorage = new MemoryStorage();
      await expect(newStorage.connect()).resolves.not.toThrow();
    });

    it('should disconnect successfully', async (): Promise<void> => {
      await expect(storage.disconnect()).resolves.not.toThrow();
    });

    it('should clear data on disconnect', async (): Promise<void> => {
      await storage.set('test', 'value');
      await storage.disconnect();
      await storage.connect();
      
      const value = await storage.get('test');
      expect(value).toBeNull();
    });
  });

  describe('basic operations', (): void => {
    describe('get/set', (): void => {
      it('should set and get values', async (): Promise<void> => {
        await storage.set('key', 'value');
        const result = await storage.get('key');
        expect(result).toBe('value');
      });

      it('should handle objects', async (): Promise<void> => {
        const obj = { name: 'test', value: 123 };
        await storage.set('obj', obj);
        const result = await storage.get('obj');
        expect(result).toEqual(obj);
      });

      it('should handle arrays', async (): Promise<void> => {
        const arr = [1, 2, 3, 'test'];
        await storage.set('arr', arr);
        const result = await storage.get('arr');
        expect(result).toEqual(arr);
      });

      it('should return null for non-existent keys', async (): Promise<void> => {
        const result = await storage.get('nonexistent');
        expect(result).toBeNull();
      });

      it('should overwrite existing values', async (): Promise<void> => {
        await storage.set('key', 'value1');
        await storage.set('key', 'value2');
        const result = await storage.get('key');
        expect(result).toBe('value2');
      });
    });

    describe('setex', (): void => {
      it('should set value with expiration', async (): Promise<void> => {
        jest.useFakeTimers();
        const now = Date.now();
        jest.setSystemTime(now);
        
        await storage.setex('temp', 1, 'value');
        
        const value1 = await storage.get('temp');
        expect(value1).toBe('value');
        
        jest.setSystemTime(now + 1001);
        
        const value2 = await storage.get('temp');
        expect(value2).toBeNull();
        
        jest.useRealTimers();
      });

      it('should handle immediate expiration', async (): Promise<void> => {
        await storage.setex('temp', 0, 'value');
        const value = await storage.get('temp');
        expect(value).toBeNull();
      });
    });

    describe('delete', (): void => {
      it('should delete existing key', async (): Promise<void> => {
        await storage.set('key', 'value');
        const deleted = await storage.delete('key');
        expect(deleted).toBe(true);
        
        const value = await storage.get('key');
        expect(value).toBeNull();
      });

      it('should return false for non-existent key', async (): Promise<void> => {
        const deleted = await storage.delete('nonexistent');
        expect(deleted).toBe(false);
      });
    });

    describe('exists', (): void => {
      it('should return true for existing key', async (): Promise<void> => {
        await storage.set('key', 'value');
        const exists = await storage.exists('key');
        expect(exists).toBe(true);
      });

      it('should return false for non-existent key', async (): Promise<void> => {
        const exists = await storage.exists('nonexistent');
        expect(exists).toBe(false);
      });

      it('should return false for expired key', async (): Promise<void> => {
        jest.useFakeTimers();
        const now = Date.now();
        jest.setSystemTime(now);
        
        await storage.setex('temp', 1, 'value');
        jest.setSystemTime(now + 1001);
        
        const exists = await storage.exists('temp');
        expect(exists).toBe(false);
        
        jest.useRealTimers();
      });
    });

    describe('expire', (): void => {
      it('should set expiration on existing key', async (): Promise<void> => {
        jest.useFakeTimers();
        const now = Date.now();
        jest.setSystemTime(now);
        
        await storage.set('key', 'value');
        await storage.expire('key', 1);
        
        const value1 = await storage.get('key');
        expect(value1).toBe('value');
        
        jest.setSystemTime(now + 1001);
        
        const value2 = await storage.get('key');
        expect(value2).toBeNull();
        
        jest.useRealTimers();
      });

      it('should handle non-existent key', async (): Promise<void> => {
        const result = await storage.expire('nonexistent', 1000);
        expect(result).toBe(false);
      });
    });

    describe('keys', (): void => {
      it('should return all keys matching pattern', async (): Promise<void> => {
        await storage.set('user:123', 'data1');
        await storage.set('user:456', 'data2');
        await storage.set('post:789', 'data3');
        
        const userKeys = await storage.keys('user:*');
        expect(userKeys).toEqual(['user:123', 'user:456']);
      });

      it('should return all keys with * pattern', async (): Promise<void> => {
        await storage.set('key1', 'value1');
        await storage.set('key2', 'value2');
        
        const allKeys = await storage.keys('*');
        expect(allKeys).toContain('key1');
        expect(allKeys).toContain('key2');
      });

      it('should handle complex patterns', async (): Promise<void> => {
        await storage.set('test:user:123', 'data1');
        await storage.set('test:post:456', 'data2');
        await storage.set('prod:user:789', 'data3');
        
        const keys = await storage.keys('test:*:*');
        expect(keys).toEqual(['test:user:123', 'test:post:456']);
      });

      it('should not include expired keys', async (): Promise<void> => {
        jest.useFakeTimers();
        const now = Date.now();
        jest.setSystemTime(now);
        
        await storage.set('permanent', 'value');
        await storage.setex('temporary', 1, 'value');
        
        jest.setSystemTime(now + 1001);
        
        const keys = await storage.keys('*');
        expect(keys).toContain('permanent');
        expect(keys).not.toContain('temporary');
        
        jest.useRealTimers();
      });
    });
  });

  describe('sorted sets', (): void => {
    describe('zadd', (): void => {
      it('should add single member', async (): Promise<void> => {
        await storage.zadd('leaderboard', 100, 'user1');
        const score = await storage.zscore('leaderboard', 'user1');
        expect(score).toBe(100);
      });

      it('should add multiple members', async (): Promise<void> => {
        await storage.zadd('leaderboard', [
          { score: 100, member: 'user1' },
          { score: 200, member: 'user2' },
          { score: 150, member: 'user3' }
        ]);
        
        const score1 = await storage.zscore('leaderboard', 'user1');
        const score2 = await storage.zscore('leaderboard', 'user2');
        const score3 = await storage.zscore('leaderboard', 'user3');
        
        expect(score1).toBe(100);
        expect(score2).toBe(200);
        expect(score3).toBe(150);
      });

      it('should update existing member score', async (): Promise<void> => {
        await storage.zadd('leaderboard', 100, 'user1');
        await storage.zadd('leaderboard', 200, 'user1');
        
        const score = await storage.zscore('leaderboard', 'user1');
        expect(score).toBe(200);
      });
    });

    describe('zrange', (): void => {
      beforeEach(async () => {
        await storage.zadd('leaderboard', [
          { score: 100, member: 'user1' },
          { score: 200, member: 'user2' },
          { score: 150, member: 'user3' },
          { score: 50, member: 'user4' }
        ]);
      });

      it('should return range in ascending order', async (): Promise<void> => {
        const range = await storage.zrange('leaderboard', 0, 2);
        expect(range).toEqual(['user4', 'user1', 'user3']);
      });

      it('should return range with scores', async (): Promise<void> => {
        const range = await storage.zrange('leaderboard', 0, 2, true);
        expect(range).toEqual([
          { member: 'user4', score: 50 },
          { member: 'user1', score: 100 },
          { member: 'user3', score: 150 }
        ]);
      });

      it('should handle negative indices', async (): Promise<void> => {
        const range = await storage.zrange('leaderboard', -2, -1);
        expect(range).toEqual(['user3', 'user2']);
      });

      it('should return empty array for non-existent key', async (): Promise<void> => {
        const range = await storage.zrange('nonexistent', 0, -1);
        expect(range).toEqual([]);
      });
    });

    describe('zrevrange', (): void => {
      beforeEach(async () => {
        await storage.zadd('leaderboard', [
          { score: 100, member: 'user1' },
          { score: 200, member: 'user2' },
          { score: 150, member: 'user3' },
          { score: 50, member: 'user4' }
        ]);
      });

      it('should return range in descending order', async (): Promise<void> => {
        const range = await storage.zrevrange('leaderboard', 0, 2);
        expect(range).toEqual(['user2', 'user3', 'user1']);
      });

      it('should return range with scores', async (): Promise<void> => {
        const range = await storage.zrevrange('leaderboard', 0, 2, true);
        expect(range).toEqual([
          { member: 'user2', score: 200 },
          { member: 'user3', score: 150 },
          { member: 'user1', score: 100 }
        ]);
      });
    });

    describe('zrank/zrevrank', (): void => {
      beforeEach(async () => {
        await storage.zadd('leaderboard', [
          { score: 100, member: 'user1' },
          { score: 200, member: 'user2' },
          { score: 150, member: 'user3' },
          { score: 50, member: 'user4' }
        ]);
      });

      it('should return ascending rank', async (): Promise<void> => {
        expect(await storage.zrank('leaderboard', 'user4')).toBe(0);
        expect(await storage.zrank('leaderboard', 'user1')).toBe(1);
        expect(await storage.zrank('leaderboard', 'user3')).toBe(2);
        expect(await storage.zrank('leaderboard', 'user2')).toBe(3);
      });

      it('should return descending rank', async (): Promise<void> => {
        expect(await storage.zrevrank('leaderboard', 'user2')).toBe(0);
        expect(await storage.zrevrank('leaderboard', 'user3')).toBe(1);
        expect(await storage.zrevrank('leaderboard', 'user1')).toBe(2);
        expect(await storage.zrevrank('leaderboard', 'user4')).toBe(3);
      });

      it('should return null for non-existent member', async (): Promise<void> => {
        expect(await storage.zrank('leaderboard', 'nonexistent')).toBeNull();
        expect(await storage.zrevrank('leaderboard', 'nonexistent')).toBeNull();
      });
    });

    describe('zscore', (): void => {
      it('should return member score', async (): Promise<void> => {
        await storage.zadd('leaderboard', 100, 'user1');
        const score = await storage.zscore('leaderboard', 'user1');
        expect(score).toBe(100);
      });

      it('should return null for non-existent member', async (): Promise<void> => {
        const score = await storage.zscore('leaderboard', 'nonexistent');
        expect(score).toBeNull();
      });
    });

    describe('zincrby', (): void => {
      it('should increment existing member score', async (): Promise<void> => {
        await storage.zadd('leaderboard', 100, 'user1');
        const newScore = await storage.zincrby('leaderboard', 50, 'user1');
        expect(newScore).toBe(150);
      });

      it('should create member if not exists', async (): Promise<void> => {
        const newScore = await storage.zincrby('leaderboard', 100, 'user1');
        expect(newScore).toBe(100);
      });

      it('should handle negative increments', async (): Promise<void> => {
        await storage.zadd('leaderboard', 100, 'user1');
        const newScore = await storage.zincrby('leaderboard', -30, 'user1');
        expect(newScore).toBe(70);
      });
    });

    describe('zrem', (): void => {
      it('should remove member', async (): Promise<void> => {
        await storage.zadd('leaderboard', 100, 'user1');
        const removed = await storage.zrem('leaderboard', 'user1');
        expect(removed).toBe(1);
        
        const score = await storage.zscore('leaderboard', 'user1');
        expect(score).toBeNull();
      });

      it('should return 0 for non-existent member', async (): Promise<void> => {
        const removed = await storage.zrem('leaderboard', 'nonexistent');
        expect(removed).toBe(0);
      });
    });

    describe('zcard', (): void => {
      it('should return cardinality', async (): Promise<void> => {
        await storage.zadd('leaderboard', [
          { score: 100, member: 'user1' },
          { score: 200, member: 'user2' }
        ]);
        
        const card = await storage.zcard('leaderboard');
        expect(card).toBe(2);
      });

      it('should return 0 for non-existent key', async (): Promise<void> => {
        const card = await storage.zcard('nonexistent');
        expect(card).toBe(0);
      });
    });
  });

  describe('hash operations', (): void => {
    describe('hset/hget', (): void => {
      it('should set and get hash field', async (): Promise<void> => {
        await storage.hset('user:123', 'name', 'John');
        const value = await storage.hget('user:123', 'name');
        expect(value).toBe('John');
      });

      it('should handle objects as values', async (): Promise<void> => {
        const data = { level: 10, xp: 500 };
        await storage.hset('user:123', 'stats', data);
        const value = await storage.hget('user:123', 'stats');
        expect(value).toEqual(data);
      });

      it('should overwrite existing field', async (): Promise<void> => {
        await storage.hset('user:123', 'name', 'John');
        await storage.hset('user:123', 'name', 'Jane');
        const value = await storage.hget('user:123', 'name');
        expect(value).toBe('Jane');
      });

      it('should return null for non-existent field', async (): Promise<void> => {
        const value = await storage.hget('user:123', 'nonexistent');
        expect(value).toBeNull();
      });
    });

    describe('hmset/hmget', (): void => {
      it('should set multiple fields', async (): Promise<void> => {
        await storage.hmset('user:123', {
          name: 'John',
          age: 30,
          city: 'New York'
        });
        
        const name = await storage.hget('user:123', 'name');
        const age = await storage.hget('user:123', 'age');
        const city = await storage.hget('user:123', 'city');
        
        expect(name).toBe('John');
        expect(age).toBe(30);
        expect(city).toBe('New York');
      });

      it('should get multiple fields', async (): Promise<void> => {
        await storage.hmset('user:123', {
          name: 'John',
          age: 30,
          city: 'New York'
        });
        
        const values = await storage.hmget('user:123', ['name', 'age', 'nonexistent']);
        expect(values).toEqual(['John', 30, null]);
      });
    });

    describe('hgetall', (): void => {
      it('should get all fields', async (): Promise<void> => {
        await storage.hmset('user:123', {
          name: 'John',
          age: 30,
          city: 'New York'
        });
        
        const all = await storage.hgetall('user:123');
        expect(all).toEqual({
          name: 'John',
          age: 30,
          city: 'New York'
        });
      });

      it('should return empty object for non-existent key', async (): Promise<void> => {
        const all = await storage.hgetall('nonexistent');
        expect(all).toEqual({});
      });
    });

    describe('hdel', (): void => {
      it('should delete field', async (): Promise<void> => {
        await storage.hset('user:123', 'name', 'John');
        const deleted = await storage.hdel('user:123', 'name');
        expect(deleted).toBe(1);
        
        const value = await storage.hget('user:123', 'name');
        expect(value).toBeNull();
      });

      it('should return 0 for non-existent field', async (): Promise<void> => {
        const deleted = await storage.hdel('user:123', 'nonexistent');
        expect(deleted).toBe(0);
      });
    });

    describe('hexists', (): void => {
      it('should check field existence', async (): Promise<void> => {
        await storage.hset('user:123', 'name', 'John');
        
        expect(await storage.hexists('user:123', 'name')).toBe(true);
        expect(await storage.hexists('user:123', 'age')).toBe(false);
        expect(await storage.hexists('nonexistent', 'name')).toBe(false);
      });
    });

    describe('hincrby', (): void => {
      it('should increment field value', async (): Promise<void> => {
        await storage.hset('user:123', 'points', 100);
        const newValue = await storage.hincrby('user:123', 'points', 50);
        expect(newValue).toBe(150);
      });

      it('should create field if not exists', async (): Promise<void> => {
        const newValue = await storage.hincrby('user:123', 'points', 100);
        expect(newValue).toBe(100);
      });

      it('should handle negative increments', async (): Promise<void> => {
        await storage.hset('user:123', 'points', 100);
        const newValue = await storage.hincrby('user:123', 'points', -30);
        expect(newValue).toBe(70);
      });

      it('should throw error for non-numeric field', async (): Promise<void> => {
        await storage.hset('user:123', 'name', 'John');
        await expect(
          storage.hincrby('user:123', 'name', 10)
        ).rejects.toThrow('Hash field is not a number');
      });
    });
  });

  describe('list operations', (): void => {
    describe('lpush/rpush', (): void => {
      it('should push to left', async (): Promise<void> => {
        await storage.lpush('list', 'a');
        await storage.lpush('list', 'b');
        await storage.lpush('list', 'c');
        
        const range = await storage.lrange('list', 0, -1);
        expect(range).toEqual(['c', 'b', 'a']);
      });

      it('should push to right', async (): Promise<void> => {
        await storage.rpush('list', 'a');
        await storage.rpush('list', 'b');
        await storage.rpush('list', 'c');
        
        const range = await storage.lrange('list', 0, -1);
        expect(range).toEqual(['a', 'b', 'c']);
      });
    });

    describe('lpop/rpop', (): void => {
      beforeEach(async () => {
        await storage.rpush('list', ['a', 'b', 'c']);
      });

      it('should pop from left', async (): Promise<void> => {
        const value = await storage.lpop('list');
        expect(value).toBe('a');
        
        const range = await storage.lrange('list', 0, -1);
        expect(range).toEqual(['b', 'c']);
      });

      it('should pop from right', async (): Promise<void> => {
        const value = await storage.rpop('list');
        expect(value).toBe('c');
        
        const range = await storage.lrange('list', 0, -1);
        expect(range).toEqual(['a', 'b']);
      });

      it('should return null for empty list', async (): Promise<void> => {
        await storage.lpop('list');
        await storage.lpop('list');
        await storage.lpop('list');
        
        expect(await storage.lpop('list')).toBeNull();
        expect(await storage.rpop('list')).toBeNull();
      });
    });

    describe('lrange', (): void => {
      beforeEach(async () => {
        await storage.rpush('list', ['a', 'b', 'c', 'd', 'e']);
      });

      it('should return range', async (): Promise<void> => {
        const range = await storage.lrange('list', 1, 3);
        expect(range).toEqual(['b', 'c', 'd']);
      });

      it('should handle negative indices', async (): Promise<void> => {
        const range = await storage.lrange('list', -3, -1);
        expect(range).toEqual(['c', 'd', 'e']);
      });

      it('should return all elements with 0, -1', async () => {
        const range = await storage.lrange('list', 0, -1);
        expect(range).toEqual(['a', 'b', 'c', 'd', 'e']);
      });

      it('should return empty array for non-existent key', async (): Promise<void> => {
        const range = await storage.lrange('nonexistent', 0, -1);
        expect(range).toEqual([]);
      });
    });

    describe('llen', (): void => {
      it('should return list length', async (): Promise<void> => {
        await storage.rpush('list', ['a', 'b', 'c']);
        const len = await storage.llen('list');
        expect(len).toBe(3);
      });

      it('should return 0 for non-existent key', async (): Promise<void> => {
        const len = await storage.llen('nonexistent');
        expect(len).toBe(0);
      });
    });

    describe('lrem', (): void => {
      beforeEach(async () => {
        await storage.rpush('list', ['a', 'b', 'a', 'c', 'a']);
      });

      it('should remove all occurrences', async (): Promise<void> => {
        const removed = await storage.lrem('list', 0, 'a');
        expect(removed).toBe(3);
        
        const range = await storage.lrange('list', 0, -1);
        expect(range).toEqual(['b', 'c']);
      });

      it('should remove from head', async (): Promise<void> => {
        const removed = await storage.lrem('list', 2, 'a');
        expect(removed).toBe(2);
        
        const range = await storage.lrange('list', 0, -1);
        expect(range).toEqual(['b', 'c', 'a']);
      });

      it('should remove from tail', async (): Promise<void> => {
        const removed = await storage.lrem('list', -1, 'a');
        expect(removed).toBe(1);
        
        const range = await storage.lrange('list', 0, -1);
        expect(range).toEqual(['a', 'b', 'a', 'c']);
      });
    });
  });

  describe('set operations', (): void => {
    describe('sadd/srem', (): void => {
      it('should add members to set', async (): Promise<void> => {
        await storage.sadd('set', 'a');
        await storage.sadd('set', 'b');
        await storage.sadd('set', 'a'); // Duplicate
        
        const members = await storage.smembers('set');
        expect(members.sort()).toEqual(['a', 'b']);
      });

      it('should remove members from set', async (): Promise<void> => {
        await storage.sadd('set', ['a', 'b', 'c']);
        const removed = await storage.srem('set', 'b');
        expect(removed).toBe(1);
        
        const members = await storage.smembers('set');
        expect(members.sort()).toEqual(['a', 'c']);
      });
    });

    describe('sismember', (): void => {
      it('should check membership', async (): Promise<void> => {
        await storage.sadd('set', ['a', 'b']);
        
        expect(await storage.sismember('set', 'a')).toBe(true);
        expect(await storage.sismember('set', 'c')).toBe(false);
        expect(await storage.sismember('nonexistent', 'a')).toBe(false);
      });
    });

    describe('smembers', (): void => {
      it('should return all members', async (): Promise<void> => {
        await storage.sadd('set', ['a', 'b', 'c']);
        const members = await storage.smembers('set');
        expect(members.sort()).toEqual(['a', 'b', 'c']);
      });

      it('should return empty array for non-existent key', async (): Promise<void> => {
        const members = await storage.smembers('nonexistent');
        expect(members).toEqual([]);
      });
    });

    describe('scard', (): void => {
      it('should return cardinality', async (): Promise<void> => {
        await storage.sadd('set', ['a', 'b', 'c']);
        const card = await storage.scard('set');
        expect(card).toBe(3);
      });

      it('should return 0 for non-existent key', async (): Promise<void> => {
        const card = await storage.scard('nonexistent');
        expect(card).toBe(0);
      });
    });
  });

  describe('transaction support', (): void => {
    it('should execute transaction successfully', async (): Promise<void> => {
      const result = await storage.multi()
        .set('key1', 'value1')
        .set('key2', 'value2')
        .get('key1')
        .exec();

      expect(result).toEqual(['OK', 'OK', 'value1']);
      
      const value2 = await storage.get('key2');
      expect(value2).toBe('value2');
    });

    it('should handle empty transaction', async (): Promise<void> => {
      const result = await storage.multi().exec();
      expect(result).toEqual([]);
    });

    it('should queue operations correctly', async (): Promise<void> => {
      const multi = storage.multi();
      multi.zadd('scores', 100, 'user1');
      multi.zadd('scores', 200, 'user2');
      multi.zrange('scores', 0, -1);
      
      const result = await multi.exec();
      expect(result).toEqual([1, 1, ['user1', 'user2']]);
    });
  });

  describe('increment/decrement', (): void => {
    it('should increment numeric values', async (): Promise<void> => {
      await storage.set('counter', 5);
      const result = await storage.increment('counter');
      expect(result).toBe(6);
      
      const value = await storage.get('counter');
      expect(value).toBe(6);
    });

    it('should increment by custom amount', async (): Promise<void> => {
      await storage.set('counter', 10);
      const result = await storage.increment('counter', 5);
      expect(result).toBe(15);
    });

    it('should handle non-existent key as 0', async (): Promise<void> => {
      const result = await storage.increment('newCounter');
      expect(result).toBe(1);
    });

    it('should decrement values', async (): Promise<void> => {
      await storage.set('counter', 10);
      const result = await storage.decrement('counter');
      expect(result).toBe(9);
    });

    it('should decrement by custom amount', async (): Promise<void> => {
      await storage.set('counter', 20);
      const result = await storage.decrement('counter', 5);
      expect(result).toBe(15);
    });
  });

  describe('mget/mset', (): void => {
    it('should get multiple values', async (): Promise<void> => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.set('key3', 'value3');
      
      const results = await storage.mget(['key1', 'key2', 'key3']);
      expect(results).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3'
      });
    });

    it('should handle non-existent keys in mget', async (): Promise<void> => {
      await storage.set('exists', 'value');
      
      const results = await storage.mget(['exists', 'notExists']);
      expect(results).toEqual({
        exists: 'value',
        notExists: null
      });
    });

    it('should set multiple values', async (): Promise<void> => {
      const entries = {
        key1: 'value1',
        key2: 'value2',
        key3: 'value3'
      };
      
      const result = await storage.mset(entries);
      expect(result).toBe(true);
      
      const value1 = await storage.get('key1');
      const value2 = await storage.get('key2');
      const value3 = await storage.get('key3');
      
      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
      expect(value3).toBe('value3');
    });

    it('should handle empty mset', async (): Promise<void> => {
      const result = await storage.mset({});
      expect(result).toBe(true);
    });
  });

  describe('edge cases', (): void => {
    it('should handle null values', async (): Promise<void> => {
      await storage.set('null', null);
      const value = await storage.get('null');
      expect(value).toBeNull();
    });

    it('should handle undefined values as null', async (): Promise<void> => {
      await storage.set('undefined', undefined);
      const value = await storage.get('undefined');
      expect(value).toBeNull();
    });

    it('should handle empty strings', async (): Promise<void> => {
      await storage.set('empty', '');
      const value = await storage.get('empty');
      expect(value).toBe('');
    });

    it('should handle very large objects', async (): Promise<void> => {
      const largeObj = {
        data: new Array(1000).fill(0).map((_, i) => ({
          id: i,
          value: `value${i}`,
          nested: { deep: { data: i } }
        }))
      };
      
      await storage.set('large', largeObj);
      const retrieved = await storage.get('large');
      expect(retrieved).toEqual(largeObj);
    });
  });

  describe('cleanup', (): void => {
    it('should clean up expired keys periodically', async (): Promise<void> => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);
      
      await storage.setex('temp1', 1, 'value1');
      await storage.setex('temp2', 2, 'value2');
      await storage.set('permanent', 'value3');
      
      // Advance time to expire temp1
      jest.setSystemTime(now + 1500);
      
      // Manually trigger cleanup
      await storage.manualCleanup();
      
      expect(await storage.exists('temp1')).toBe(false);
      expect(await storage.exists('temp2')).toBe(true);
      expect(await storage.exists('permanent')).toBe(true);
      
      // Advance more time to expire temp2
      jest.setSystemTime(now + 2500);
      await storage.manualCleanup();
      
      expect(await storage.exists('temp2')).toBe(false);
      expect(await storage.exists('permanent')).toBe(true);
      
      jest.useRealTimers();
    });
  });
});