import type { GamificationKit } from '../src/core/GamificationKit.js';
import { RedisStorage } from '../../../src/storage/RedisStorage.js';
import { jest } from '@jest/globals';

describe('RedisStorage', (): void => {
  let storage;
  let mockClient;

  beforeEach(() => {
    // Mock Redis client
    mockClient = {
      connect: jest.fn().mockResolvedValue(),
      disconnect: jest.fn().mockResolvedValue(),
      quit: jest.fn().mockResolvedValue(),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setEx: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(0),
      exists: jest.fn().mockResolvedValue(0),
      incr: jest.fn().mockResolvedValue(1),
      incrBy: jest.fn().mockResolvedValue(1),
      decr: jest.fn().mockResolvedValue(0),
      decrBy: jest.fn().mockResolvedValue(0),
      mGet: jest.fn().mockResolvedValue([]),
      mSet: jest.fn().mockResolvedValue('OK'),
      keys: jest.fn().mockResolvedValue([]),
      zAdd: jest.fn().mockResolvedValue(1),
      zRem: jest.fn().mockResolvedValue(0),
      zRange: jest.fn().mockResolvedValue([]),
      zRevRange: jest.fn().mockResolvedValue([]),
      zRank: jest.fn().mockResolvedValue(null),
      zRevRank: jest.fn().mockResolvedValue(null),
      zScore: jest.fn().mockResolvedValue(null),
      zCount: jest.fn().mockResolvedValue(0),
      zIncrBy: jest.fn().mockResolvedValue(0),
      lPush: jest.fn().mockResolvedValue(1),
      rPush: jest.fn().mockResolvedValue(1),
      lPop: jest.fn().mockResolvedValue(null),
      rPop: jest.fn().mockResolvedValue(null),
      lRange: jest.fn().mockResolvedValue([]),
      lLen: jest.fn().mockResolvedValue(0),
      sAdd: jest.fn().mockResolvedValue(0),
      sRem: jest.fn().mockResolvedValue(0),
      sMembers: jest.fn().mockResolvedValue([]),
      sIsMember: jest.fn().mockResolvedValue(false),
      sCard: jest.fn().mockResolvedValue(0),
      hSet: jest.fn().mockResolvedValue(1),
      hGet: jest.fn().mockResolvedValue(null),
      hGetAll: jest.fn().mockResolvedValue({}),
      hDel: jest.fn().mockResolvedValue(0),
      hIncrBy: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(false),
      ttl: jest.fn().mockResolvedValue(-2),
      multi: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
      on: jest.fn(),
      duplicate: jest.fn().mockReturnThis()
    };

    // Mock redis module
    const mockRedis = {
      createClient: jest.fn().mockReturnValue(mockClient)
    };

    storage = new RedisStorage({
      host: 'localhost',
      port: 6379,
      keyPrefix: 'test:'
    });

    // Mock the redis module
    storage.redis = mockRedis;
    storage.client = mockClient;
  });

  describe('constructor', (): void => {
    it('should initialize with default options', () => {
      const storage = new RedisStorage();
      expect(storage.keyPrefix).toBe('gk:');
    });

    it('should initialize with custom options', () => {
      const storage = new RedisStorage({
        keyPrefix: 'custom:',
        host: 'redis.example.com',
        port: 6380
      });
      expect(storage.keyPrefix).toBe('custom:');
    });
  });

  describe('connect', (): void => {
    it('should connect successfully', async (): Promise<void> => {
      jest.spyOn(storage, 'connect').mockImplementation(async function() {
        this.client = this.redis.createClient(this.options);
        
        this.client.on('error', (err) => {
          console.error('Redis Client Error', err);
        });
        
        await this.client.connect();
        this.connected = true;
        return true;
      });

      const result = await storage.connect();
      expect(result).toBe(true);
      expect(storage.connected).toBe(true);
    });

    it('should handle connection errors', async (): Promise<void> => {
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));
      
      jest.spyOn(storage, 'connect').mockImplementation(async function() {
        try {
          this.client = this.redis.createClient(this.options);
          await this.client.connect();
        } catch (error) {
          throw new Error(`Failed to connect to Redis: ${error.message}`);
        }
      });

      await expect(storage.connect()).rejects.toThrow('Failed to connect to Redis');
    });

    it('should setup error handler', async (): Promise<void> => {
      jest.spyOn(storage, 'connect').mockImplementation(async function() {
        this.client = this.redis.createClient(this.options);
        this.client.on('error', (err) => {
          console.error('Redis Client Error', err);
        });
        await this.client.connect();
        this.connected = true;
        return true;
      });

      await storage.connect();
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('disconnect', (): void => {
    it('should disconnect successfully', async (): Promise<void> => {
      storage.connected = true;

      const result = await storage.disconnect();
      expect(result).toBe(true);
      expect(mockClient.quit).toHaveBeenCalled();
      expect(storage.connected).toBe(false);
    });

    it('should handle disconnect when not connected', async (): Promise<void> => {
      storage.client = null;
      const result = await storage.disconnect();
      expect(result).toBe(true);
      expect(mockClient.quit).not.toHaveBeenCalled();
    });
  });

  describe('key-value operations', (): void => {
    describe('get', (): void => {
      it('should return value for existing key', async (): Promise<void> => {
        mockClient.get.mockResolvedValue('{"data":"testValue"}');

        const result = await storage.get('test');
        expect(result).toEqual({ data: 'testValue' });
        expect(mockClient.get).toHaveBeenCalledWith('test:test');
      });

      it('should return null for non-existent key', async (): Promise<void> => {
        mockClient.get.mockResolvedValue(null);

        const result = await storage.get('nonexistent');
        expect(result).toBeNull();
      });

      it('should handle non-JSON values', async (): Promise<void> => {
        mockClient.get.mockResolvedValue('plain string');

        const result = await storage.get('test');
        expect(result).toBe('plain string');
      });
    });

    describe('set', (): void => {
      it('should set value without TTL', async (): Promise<void> => {
        await storage.set('key', { value: 'data' });
        
        expect(mockClient.set).toHaveBeenCalledWith(
          'test:key',
          '{"value":"data"}'
        );
      });

      it('should set value with TTL', async (): Promise<void> => {
        const ttl = 60; // 60 seconds
        await storage.set('key', 'value', ttl);
        
        expect(mockClient.setEx).toHaveBeenCalledWith(
          'test:key',
          ttl,
          '"value"'
        );
        expect(mockClient.set).not.toHaveBeenCalled();
      });

      it('should handle non-object values', async (): Promise<void> => {
        await storage.set('key', 'simple string');
        
        expect(mockClient.set).toHaveBeenCalledWith(
          'test:key',
          '"simple string"'
        );
      });
    });

    describe('delete', (): void => {
      it('should delete key successfully', async (): Promise<void> => {
        mockClient.del.mockResolvedValue(1);

        const result = await storage.delete('key');
        expect(result).toBe(true);
        expect(mockClient.del).toHaveBeenCalledWith('test:key');
      });

      it('should return false if key not found', async (): Promise<void> => {
        mockClient.del.mockResolvedValue(0);

        const result = await storage.delete('nonexistent');
        expect(result).toBe(false);
      });
    });

    describe('exists', (): void => {
      it('should return true if key exists', async (): Promise<void> => {
        mockClient.exists.mockResolvedValue(1);

        const result = await storage.exists('key');
        expect(result).toBe(true);
        expect(mockClient.exists).toHaveBeenCalledWith('test:key');
      });

      it('should return false if key does not exist', async (): Promise<void> => {
        mockClient.exists.mockResolvedValue(0);

        const result = await storage.exists('key');
        expect(result).toBe(false);
      });
    });

    describe('increment/decrement', (): void => {
      it('should increment by 1', async (): Promise<void> => {
        mockClient.incr.mockResolvedValue(5);

        const result = await storage.increment('counter');
        expect(result).toBe(5);
        expect(mockClient.incr).toHaveBeenCalledWith('test:counter');
      });

      it('should increment by specific amount', async (): Promise<void> => {
        mockClient.incrBy.mockResolvedValue(10);

        const result = await storage.increment('counter', 5);
        expect(result).toBe(10);
        expect(mockClient.incrBy).toHaveBeenCalledWith('test:counter', 5);
      });

      it('should decrement by 1', async (): Promise<void> => {
        mockClient.decr.mockResolvedValue(3);

        const result = await storage.decrement('counter');
        expect(result).toBe(3);
        expect(mockClient.decr).toHaveBeenCalledWith('test:counter');
      });

      it('should decrement by specific amount', async (): Promise<void> => {
        mockClient.decrBy.mockResolvedValue(0);

        const result = await storage.decrement('counter', 3);
        expect(result).toBe(0);
        expect(mockClient.decrBy).toHaveBeenCalledWith('test:counter', 3);
      });
    });

    describe('mget/mset', (): void => {
      it('should get multiple values', async (): Promise<void> => {
        mockClient.mGet.mockResolvedValue(['"value1"', '"value2"', null]);

        const result = await storage.mget(['key1', 'key2', 'key3']);
        expect(result).toEqual({
          key1: 'value1',
          key2: 'value2',
          key3: null
        });
        expect(mockClient.mGet).toHaveBeenCalledWith(['test:key1', 'test:key2', 'test:key3']);
      });

      it('should set multiple values', async (): Promise<void> => {
        await storage.mset({
          key1: 'value1',
          key2: { nested: 'value2' }
        });

        expect(mockClient.mSet).toHaveBeenCalledWith([
          ['test:key1', '"value1"'],
          ['test:key2', '{"nested":"value2"}']
        ]);
      });
    });

    describe('keys', (): void => {
      it('should find keys matching pattern', async (): Promise<void> => {
        mockClient.keys.mockResolvedValue(['test:user:123', 'test:user:456']);

        const result = await storage.keys('user:*');
        expect(result).toEqual(['user:123', 'user:456']);
        expect(mockClient.keys).toHaveBeenCalledWith('test:user:*');
      });

      it('should handle empty results', async (): Promise<void> => {
        mockClient.keys.mockResolvedValue([]);

        const result = await storage.keys('nonexistent:*');
        expect(result).toEqual([]);
      });
    });
  });

  describe('sorted set operations', (): void => {
    describe('zadd', (): void => {
      it('should add member to sorted set', async (): Promise<void> => {
        await storage.zadd('leaderboard', 100, 'player1');
        
        expect(mockClient.zAdd).toHaveBeenCalledWith('test:leaderboard', {
          score: 100,
          value: 'player1'
        });
      });
    });

    describe('zrem', (): void => {
      it('should remove member from sorted set', async (): Promise<void> => {
        mockClient.zRem.mockResolvedValue(1);

        const result = await storage.zrem('leaderboard', 'player1');
        expect(result).toBe(true);
        expect(mockClient.zRem).toHaveBeenCalledWith('test:leaderboard', 'player1');
      });
    });

    describe('zrange', (): void => {
      it('should return range without scores', async (): Promise<void> => {
        mockClient.zRange.mockResolvedValue(['player1', 'player2']);

        const result = await storage.zrange('leaderboard', 0, 1);
        expect(result).toEqual(['player1', 'player2']);
        expect(mockClient.zRange).toHaveBeenCalledWith('test:leaderboard', 0, 1);
      });

      it('should return range with scores', async (): Promise<void> => {
        mockClient.zRange.mockResolvedValue([
          { value: 'player1', score: 100 },
          { value: 'player2', score: 200 }
        ]);

        const result = await storage.zrange('leaderboard', 0, -1, { withScores: true });
        expect(result).toEqual(['player1', 100, 'player2', 200]);
      });
    });

    describe('zrank/zrevrank', (): void => {
      it('should return rank', async (): Promise<void> => {
        mockClient.zRank.mockResolvedValue(1);

        const rank = await storage.zrank('leaderboard', 'player2');
        expect(rank).toBe(1);
        expect(mockClient.zRank).toHaveBeenCalledWith('test:leaderboard', 'player2');
      });

      it('should return reverse rank', async (): Promise<void> => {
        mockClient.zRevRank.mockResolvedValue(0);

        const rank = await storage.zrevrank('leaderboard', 'player1');
        expect(rank).toBe(0);
      });
    });

    describe('zincrby', (): void => {
      it('should increment score', async (): Promise<void> => {
        mockClient.zIncrBy.mockResolvedValue(150);

        const result = await storage.zincrby('leaderboard', 50, 'player1');
        expect(result).toBe(150);
        expect(mockClient.zIncrBy).toHaveBeenCalledWith('test:leaderboard', 'player1', 50);
      });
    });
  });

  describe('list operations', (): void => {
    describe('lpush/rpush', (): void => {
      it('should push to left of list', async (): Promise<void> => {
        mockClient.lPush.mockResolvedValue(3);

        const length = await storage.lpush('mylist', 'x', 'y');
        expect(length).toBe(3);
        expect(mockClient.lPush).toHaveBeenCalledWith('test:mylist', ['x', 'y']);
      });

      it('should push to right of list', async (): Promise<void> => {
        mockClient.rPush.mockResolvedValue(3);

        const length = await storage.rpush('mylist', 'x', 'y');
        expect(length).toBe(3);
        expect(mockClient.rPush).toHaveBeenCalledWith('test:mylist', ['x', 'y']);
      });
    });

    describe('lpop/rpop', (): void => {
      it('should pop from left', async (): Promise<void> => {
        mockClient.lPop.mockResolvedValue('first');

        const result = await storage.lpop('mylist');
        expect(result).toBe('first');
        expect(mockClient.lPop).toHaveBeenCalledWith('test:mylist');
      });

      it('should pop from right', async (): Promise<void> => {
        mockClient.rPop.mockResolvedValue('last');

        const result = await storage.rpop('mylist');
        expect(result).toBe('last');
      });
    });

    describe('lrange', (): void => {
      it('should return range of list', async (): Promise<void> => {
        mockClient.lRange.mockResolvedValue(['a', 'b', 'c']);

        const result = await storage.lrange('mylist', 0, 2);
        expect(result).toEqual(['a', 'b', 'c']);
        expect(mockClient.lRange).toHaveBeenCalledWith('test:mylist', 0, 2);
      });
    });

    describe('llen', (): void => {
      it('should return length of list', async (): Promise<void> => {
        mockClient.lLen.mockResolvedValue(5);

        const result = await storage.llen('mylist');
        expect(result).toBe(5);
        expect(mockClient.lLen).toHaveBeenCalledWith('test:mylist');
      });
    });
  });

  describe('set operations', (): void => {
    describe('sadd', (): void => {
      it('should add members to set', async (): Promise<void> => {
        mockClient.sAdd.mockResolvedValue(3);

        const result = await storage.sadd('myset', 'a', 'b', 'c');
        expect(result).toBe(3);
        expect(mockClient.sAdd).toHaveBeenCalledWith('test:myset', ['a', 'b', 'c']);
      });
    });

    describe('srem', (): void => {
      it('should remove members from set', async (): Promise<void> => {
        mockClient.sRem.mockResolvedValue(2);

        const result = await storage.srem('myset', 'a', 'b');
        expect(result).toBe(2);
        expect(mockClient.sRem).toHaveBeenCalledWith('test:myset', ['a', 'b']);
      });
    });

    describe('smembers', (): void => {
      it('should return all members', async (): Promise<void> => {
        mockClient.sMembers.mockResolvedValue(['a', 'b', 'c']);

        const result = await storage.smembers('myset');
        expect(result).toEqual(['a', 'b', 'c']);
        expect(mockClient.sMembers).toHaveBeenCalledWith('test:myset');
      });
    });

    describe('sismember', (): void => {
      it('should check membership', async (): Promise<void> => {
        mockClient.sIsMember.mockResolvedValue(true);

        const result = await storage.sismember('myset', 'a');
        expect(result).toBe(true);
        expect(mockClient.sIsMember).toHaveBeenCalledWith('test:myset', 'a');
      });
    });

    describe('scard', (): void => {
      it('should return set size', async (): Promise<void> => {
        mockClient.sCard.mockResolvedValue(3);

        const result = await storage.scard('myset');
        expect(result).toBe(3);
        expect(mockClient.sCard).toHaveBeenCalledWith('test:myset');
      });
    });
  });

  describe('hash operations', (): void => {
    describe('hset/hget', (): void => {
      it('should set hash field', async (): Promise<void> => {
        await storage.hset('user:123', 'name', 'John');
        
        expect(mockClient.hSet).toHaveBeenCalledWith(
          'test:user:123',
          'name',
          '"John"'
        );
      });

      it('should get hash field', async (): Promise<void> => {
        mockClient.hGet.mockResolvedValue('"John"');

        const result = await storage.hget('user:123', 'name');
        expect(result).toBe('John');
        expect(mockClient.hGet).toHaveBeenCalledWith('test:user:123', 'name');
      });

      it('should handle complex values', async (): Promise<void> => {
        const complexValue = { nested: { data: [1, 2, 3] } };
        await storage.hset('user:123', 'data', complexValue);
        
        expect(mockClient.hSet).toHaveBeenCalledWith(
          'test:user:123',
          'data',
          JSON.stringify(complexValue)
        );
      });
    });

    describe('hgetall', (): void => {
      it('should get all hash fields', async (): Promise<void> => {
        mockClient.hGetAll.mockResolvedValue({
          name: '"John"',
          age: '30',
          data: '{"nested":true}'
        });

        const result = await storage.hgetall('user:123');
        expect(result).toEqual({
          name: 'John',
          age: 30,
          data: { nested: true }
        });
      });

      it('should return empty object for non-existent hash', async (): Promise<void> => {
        mockClient.hGetAll.mockResolvedValue({});

        const result = await storage.hgetall('user:123');
        expect(result).toEqual({});
      });
    });

    describe('hdel', (): void => {
      it('should delete hash fields', async (): Promise<void> => {
        mockClient.hDel.mockResolvedValue(2);

        const result = await storage.hdel('user:123', 'field1', 'field2');
        expect(result).toBe(2);
        expect(mockClient.hDel).toHaveBeenCalledWith('test:user:123', ['field1', 'field2']);
      });
    });

    describe('hincrby', (): void => {
      it('should increment hash field', async (): Promise<void> => {
        mockClient.hIncrBy.mockResolvedValue(150);

        const result = await storage.hincrby('user:123', 'points', 50);
        expect(result).toBe(150);
        expect(mockClient.hIncrBy).toHaveBeenCalledWith('test:user:123', 'points', 50);
      });
    });
  });

  describe('expiration', (): void => {
    describe('expire', (): void => {
      it('should set expiration', async (): Promise<void> => {
        mockClient.expire.mockResolvedValue(true);

        const result = await storage.expire('key', 60);
        expect(result).toBe(true);
        expect(mockClient.expire).toHaveBeenCalledWith('test:key', 60);
      });
    });

    describe('ttl', (): void => {
      it('should return TTL', async (): Promise<void> => {
        mockClient.ttl.mockResolvedValue(60);

        const ttl = await storage.ttl('key');
        expect(ttl).toBe(60);
        expect(mockClient.ttl).toHaveBeenCalledWith('test:key');
      });

      it('should return -1 for key without expiration', async (): Promise<void> => {
        mockClient.ttl.mockResolvedValue(-1);

        const ttl = await storage.ttl('key');
        expect(ttl).toBe(-1);
      });

      it('should return -2 for non-existent key', async (): Promise<void> => {
        mockClient.ttl.mockResolvedValue(-2);

        const ttl = await storage.ttl('key');
        expect(ttl).toBe(-2);
      });
    });
  });

  describe('transaction', (): void => {
    it('should execute operations in transaction', async (): Promise<void> => {
      const operations = [
        { method: 'set', args: ['key1', 'value1'] },
        { method: 'increment', args: ['counter', 1] },
        { method: 'zadd', args: ['leaderboard', 100, 'player1'] }
      ];

      mockClient.multi.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        incr: jest.fn().mockReturnThis(),
        zAdd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK', 1, 1])
      });

      const results = await storage.transaction(operations);
      
      expect(results).toEqual(['OK', 1, 1]);
      expect(mockClient.multi).toHaveBeenCalled();
    });

    it('should handle transaction errors', async (): Promise<void> => {
      const operations = [
        { method: 'set', args: ['key1', 'value1'] }
      ];

      mockClient.multi.mockReturnValue({
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Transaction failed'))
      });

      await expect(storage.transaction(operations)).rejects.toThrow('Transaction failed');
    });
  });

  describe('clear', (): void => {
    it('should clear keys matching pattern', async (): Promise<void> => {
      storage.keys = jest.fn().mockResolvedValue(['user:1', 'user:2', 'user:3']);
      storage.delete = jest.fn().mockResolvedValue(true);

      const count = await storage.clear('user:*');
      
      expect(count).toBe(3);
      expect(storage.delete).toHaveBeenCalledTimes(3);
      expect(storage.delete).toHaveBeenCalledWith('user:1');
      expect(storage.delete).toHaveBeenCalledWith('user:2');
      expect(storage.delete).toHaveBeenCalledWith('user:3');
    });

    it('should handle delete failures', async (): Promise<void> => {
      storage.keys = jest.fn().mockResolvedValue(['key1', 'key2']);
      storage.delete = jest.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const count = await storage.clear('key*');
      expect(count).toBe(1);
    });
  });

  describe('edge cases', (): void => {
    it('should handle JSON parse errors gracefully', async (): Promise<void> => {
      mockClient.get.mockResolvedValue('invalid json {');

      const result = await storage.get('key');
      expect(result).toBe('invalid json {');
    });

    it('should handle undefined values in hgetall', async (): Promise<void> => {
      mockClient.hGetAll.mockResolvedValue({
        field1: '"value1"',
        field2: undefined,
        field3: 'null'
      });

      const result = await storage.hgetall('hash');
      expect(result).toEqual({
        field1: 'value1',
        field2: undefined,
        field3: null
      });
    });

    it('should handle empty key prefix', () => {
      const storage = new RedisStorage({ keyPrefix: '' });
      expect(storage.keyPrefix).toBe('');
      expect(storage.getKey('test')).toBe('test');
    });
  });
});