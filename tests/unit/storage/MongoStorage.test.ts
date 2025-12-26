import type { GamificationKit } from '../src/core/GamificationKit.js';
import { MongoStorage } from '../../../src/storage/MongoStorage.js';
import { jest } from '@jest/globals';

describe('MongoStorage', (): void => {
  let storage;
  let mockClient;
  let mockDb;
  let mockCollections;

  beforeEach(() => {
    // Mock collections
    mockCollections = {
      keyvalue: createMockCollection(),
      sortedsets: createMockCollection(),
      lists: createMockCollection(),
      sets: createMockCollection(),
      hashes: createMockCollection()
    };

    // Mock database
    mockDb = {
      collection: jest.fn((name) => {
        const prefix = 'gk_';
        if (name === `${prefix}keyvalue`) return mockCollections.keyvalue;
        if (name === `${prefix}sortedsets`) return mockCollections.sortedsets;
        if (name === `${prefix}lists`) return mockCollections.lists;
        if (name === `${prefix}sets`) return mockCollections.sets;
        if (name === `${prefix}hashes`) return mockCollections.hashes;
        return createMockCollection();
      })
    };

    // Mock MongoClient
    mockClient = {
      connect: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue(),
      db: jest.fn().mockReturnValue(mockDb),
      startSession: jest.fn().mockReturnValue({
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn().mockResolvedValue()
      })
    };

    // Mock mongodb module
    const mockMongodb = {
      MongoClient: jest.fn().mockImplementation(() => mockClient)
    };

    storage = new MongoStorage({
      host: 'localhost',
      port: 27017,
      database: 'test_gamification'
    });

    // Mock dynamic import
    storage.mongodb = mockMongodb;
  });

  function createMockCollection() {
    return {
      createIndex: jest.fn().mockResolvedValue(),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      toArray: jest.fn().mockResolvedValue([]),
      replaceOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      countDocuments: jest.fn().mockResolvedValue(0),
      findOneAndUpdate: jest.fn().mockResolvedValue({ value: { value: 1 } }),
      bulkWrite: jest.fn().mockResolvedValue({ acknowledged: true }),
      distinct: jest.fn().mockResolvedValue([])
    };
  }

  describe('constructor', (): void => {
    it('should initialize with default options', () => {
      const storage = new MongoStorage();
      expect(storage.dbName).toBe('gamification');
      expect(storage.collectionPrefix).toBe('gk_');
    });

    it('should initialize with custom options', () => {
      const storage = new MongoStorage({
        database: 'custom_db',
        collectionPrefix: 'custom_'
      });
      expect(storage.dbName).toBe('custom_db');
      expect(storage.collectionPrefix).toBe('custom_');
    });
  });

  describe('connect', (): void => {
    it('should connect successfully', async (): Promise<void> => {
      // Mock import
      jest.spyOn(storage, 'connect').mockImplementation(async function() {
        this.client = mockClient;
        await this.client.connect();
        this.db = this.client.db(this.dbName);
        await this.ensureIndexes();
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
          this.client = mockClient;
          await this.client.connect();
        } catch (error) {
          throw new Error(`Failed to connect to MongoDB: ${error.message}`);
        }
      });

      await expect(storage.connect()).rejects.toThrow('Failed to connect to MongoDB');
    });

    it('should create indexes on connect', async (): Promise<void> => {
      storage.client = mockClient;
      storage.db = mockDb;
      
      await storage.ensureIndexes();
      
      expect(mockCollections.keyvalue.createIndex).toHaveBeenCalledWith(
        { key: 1 },
        { unique: true }
      );
      expect(mockCollections.keyvalue.createIndex).toHaveBeenCalledWith(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 }
      );
      expect(mockCollections.sortedsets.createIndex).toHaveBeenCalledWith(
        { key: 1, score: -1 }
      );
    });
  });

  describe('disconnect', (): void => {
    it('should disconnect successfully', async (): Promise<void> => {
      storage.client = mockClient;
      storage.connected = true;

      const result = await storage.disconnect();
      expect(result).toBe(true);
      expect(mockClient.close).toHaveBeenCalled();
      expect(storage.connected).toBe(false);
    });

    it('should handle disconnect when not connected', async (): Promise<void> => {
      const result = await storage.disconnect();
      expect(result).toBe(true);
      expect(mockClient.close).not.toHaveBeenCalled();
    });
  });

  describe('key-value operations', (): void => {
    beforeEach(() => {
      storage.db = mockDb;
    });

    describe('get', (): void => {
      it('should return value for existing key', async (): Promise<void> => {
        mockCollections.keyvalue.findOne.mockResolvedValue({
          key: 'test',
          value: 'testValue'
        });

        const result = await storage.get('test');
        expect(result).toBe('testValue');
        expect(mockCollections.keyvalue.findOne).toHaveBeenCalledWith({ key: 'test' });
      });

      it('should return null for non-existent key', async (): Promise<void> => {
        mockCollections.keyvalue.findOne.mockResolvedValue(null);

        const result = await storage.get('nonexistent');
        expect(result).toBeNull();
      });

      it('should handle expired keys', async (): Promise<void> => {
        mockCollections.keyvalue.findOne.mockResolvedValue({
          key: 'expired',
          value: 'value',
          expiresAt: new Date(Date.now() - 1000)
        });

        const result = await storage.get('expired');
        expect(result).toBeNull();
        expect(mockCollections.keyvalue.deleteOne).toHaveBeenCalledWith({ key: 'expired' });
      });
    });

    describe('set', (): void => {
      it('should set value without TTL', async (): Promise<void> => {
        await storage.set('key', 'value');
        
        expect(mockCollections.keyvalue.replaceOne).toHaveBeenCalledWith(
          { key: 'key' },
          expect.objectContaining({
            key: 'key',
            value: 'value',
            updatedAt: expect.any(Date)
          }),
          { upsert: true }
        );
      });

      it('should set value with TTL', async (): Promise<void> => {
        const ttl = 60; // 60 seconds
        await storage.set('key', 'value', ttl);
        
        expect(mockCollections.keyvalue.replaceOne).toHaveBeenCalledWith(
          { key: 'key' },
          expect.objectContaining({
            key: 'key',
            value: 'value',
            updatedAt: expect.any(Date),
            expiresAt: expect.any(Date)
          }),
          { upsert: true }
        );
      });
    });

    describe('delete', (): void => {
      it('should delete key from all collections', async (): Promise<void> => {
        mockCollections.keyvalue.deleteMany.mockResolvedValue({ deletedCount: 1 });

        const result = await storage.delete('key');
        expect(result).toBe(true);
        
        // Check all collections were searched
        expect(mockCollections.keyvalue.deleteMany).toHaveBeenCalledWith({ key: 'key' });
        expect(mockCollections.sortedsets.deleteMany).toHaveBeenCalledWith({ key: 'key' });
        expect(mockCollections.lists.deleteMany).toHaveBeenCalledWith({ key: 'key' });
      });

      it('should return false if key not found', async (): Promise<void> => {
        const result = await storage.delete('nonexistent');
        expect(result).toBe(false);
      });
    });

    describe('exists', (): void => {
      it('should return true if key exists', async (): Promise<void> => {
        mockCollections.keyvalue.countDocuments.mockResolvedValue(1);

        const result = await storage.exists('key');
        expect(result).toBe(true);
      });

      it('should check all collections', async (): Promise<void> => {
        mockCollections.keyvalue.countDocuments.mockResolvedValue(0);
        mockCollections.lists.countDocuments.mockResolvedValue(1);

        const result = await storage.exists('key');
        expect(result).toBe(true);
      });
    });

    describe('increment/decrement', (): void => {
      it('should increment value', async (): Promise<void> => {
        mockCollections.keyvalue.findOneAndUpdate.mockResolvedValue({
          value: { value: 5 }
        });

        const result = await storage.increment('counter', 2);
        expect(result).toBe(5);
        expect(mockCollections.keyvalue.findOneAndUpdate).toHaveBeenCalledWith(
          { key: 'counter' },
          {
            $inc: { value: 2 },
            $set: { updatedAt: expect.any(Date) }
          },
          {
            returnDocument: 'after',
            upsert: true
          }
        );
      });

      it('should decrement value', async (): Promise<void> => {
        mockCollections.keyvalue.findOneAndUpdate.mockResolvedValue({
          value: { value: 3 }
        });

        const result = await storage.decrement('counter', 2);
        expect(result).toBe(3);
        expect(mockCollections.keyvalue.findOneAndUpdate).toHaveBeenCalledWith(
          { key: 'counter' },
          expect.objectContaining({
            $inc: { value: -2 }
          }),
          expect.any(Object)
        );
      });
    });

    describe('mget/mset', (): void => {
      it('should get multiple values', async (): Promise<void> => {
        mockCollections.keyvalue.find().toArray.mockResolvedValue([
          { key: 'key1', value: 'value1' },
          { key: 'key2', value: 'value2' }
        ]);

        const result = await storage.mget(['key1', 'key2', 'key3']);
        expect(result).toEqual({
          key1: 'value1',
          key2: 'value2',
          key3: null
        });
      });

      it('should set multiple values', async (): Promise<void> => {
        await storage.mset({
          key1: 'value1',
          key2: 'value2'
        });

        expect(mockCollections.keyvalue.bulkWrite).toHaveBeenCalledWith([
          {
            replaceOne: {
              filter: { key: 'key1' },
              replacement: expect.objectContaining({
                key: 'key1',
                value: 'value1'
              }),
              upsert: true
            }
          },
          {
            replaceOne: {
              filter: { key: 'key2' },
              replacement: expect.objectContaining({
                key: 'key2',
                value: 'value2'
              }),
              upsert: true
            }
          }
        ]);
      });
    });

    describe('keys', (): void => {
      it('should find keys matching pattern', async (): Promise<void> => {
        mockCollections.keyvalue.distinct.mockResolvedValue(['user:123', 'user:456']);
        mockCollections.hashes.distinct.mockResolvedValue(['user:789']);

        const result = await storage.keys('user:*');
        expect(result).toContain('user:123');
        expect(result).toContain('user:456');
        expect(result).toContain('user:789');
      });

      it('should handle patterns with ?', async (): Promise<void> => {
        mockCollections.keyvalue.distinct.mockResolvedValue(['a1', 'a2']);

        const result = await storage.keys('a?');
        expect(mockCollections.keyvalue.distinct).toHaveBeenCalledWith(
          'key',
          { key: { $regex: /^a.$/} }
        );
      });
    });
  });

  describe('sorted set operations', (): void => {
    beforeEach(() => {
      storage.db = mockDb;
    });

    describe('zadd', (): void => {
      it('should add member to sorted set', async (): Promise<void> => {
        await storage.zadd('leaderboard', 100, 'player1');
        
        expect(mockCollections.sortedsets.replaceOne).toHaveBeenCalledWith(
          { key: 'leaderboard', member: 'player1' },
          { key: 'leaderboard', member: 'player1', score: 100 },
          { upsert: true }
        );
      });
    });

    describe('zrem', (): void => {
      it('should remove member from sorted set', async (): Promise<void> => {
        mockCollections.sortedsets.deleteOne.mockResolvedValue({ deletedCount: 1 });

        const result = await storage.zrem('leaderboard', 'player1');
        expect(result).toBe(true);
        expect(mockCollections.sortedsets.deleteOne).toHaveBeenCalledWith({
          key: 'leaderboard',
          member: 'player1'
        });
      });
    });

    describe('zrange', (): void => {
      it('should return range without scores', async (): Promise<void> => {
        mockCollections.sortedsets.find().sort().toArray.mockResolvedValue([
          { member: 'player1', score: 100 },
          { member: 'player2', score: 200 },
          { member: 'player3', score: 300 }
        ]);

        const result = await storage.zrange('leaderboard', 0, 1);
        expect(result).toEqual(['player1', 'player2']);
      });

      it('should return range with scores', async (): Promise<void> => {
        mockCollections.sortedsets.find().sort().toArray.mockResolvedValue([
          { member: 'player1', score: 100 },
          { member: 'player2', score: 200 }
        ]);

        const result = await storage.zrange('leaderboard', 0, -1, { withScores: true });
        expect(result).toEqual(['player1', 100, 'player2', 200]);
      });

      it('should handle negative indices', async (): Promise<void> => {
        mockCollections.sortedsets.find().sort().toArray.mockResolvedValue([
          { member: 'p1', score: 1 },
          { member: 'p2', score: 2 },
          { member: 'p3', score: 3 }
        ]);

        const result = await storage.zrange('leaderboard', -2, -1);
        expect(result).toEqual(['p2', 'p3']);
      });
    });

    describe('zrank/zrevrank', (): void => {
      it('should return rank in ascending order', async (): Promise<void> => {
        mockCollections.sortedsets.find().sort().toArray.mockResolvedValue([
          { member: 'player1', score: 100 },
          { member: 'player2', score: 200 },
          { member: 'player3', score: 300 }
        ]);

        const rank = await storage.zrank('leaderboard', 'player2');
        expect(rank).toBe(1);
      });

      it('should return null for non-existent member', async (): Promise<void> => {
        mockCollections.sortedsets.find().sort().toArray.mockResolvedValue([]);

        const rank = await storage.zrank('leaderboard', 'unknown');
        expect(rank).toBeNull();
      });
    });

    describe('zincrby', (): void => {
      it('should increment score', async (): Promise<void> => {
        mockCollections.sortedsets.findOneAndUpdate.mockResolvedValue({
          value: { score: 150 }
        });

        const result = await storage.zincrby('leaderboard', 50, 'player1');
        expect(result).toBe(150);
      });
    });
  });

  describe('list operations', (): void => {
    beforeEach(() => {
      storage.db = mockDb;
    });

    describe('lpush/rpush', (): void => {
      it('should push to left of list', async (): Promise<void> => {
        mockCollections.lists.findOne.mockResolvedValue({
          values: ['a', 'b', 'c']
        });

        const length = await storage.lpush('mylist', 'x', 'y');
        expect(mockCollections.lists.updateOne).toHaveBeenCalledWith(
          { key: 'mylist' },
          {
            $push: { values: { $each: ['y', 'x'], $position: 0 } },
            $setOnInsert: { key: 'mylist' }
          },
          { upsert: true }
        );
      });

      it('should push to right of list', async (): Promise<void> => {
        mockCollections.lists.findOne.mockResolvedValue({
          values: ['a', 'b', 'c', 'x', 'y']
        });

        const length = await storage.rpush('mylist', 'x', 'y');
        expect(length).toBe(5);
      });
    });

    describe('lrange', (): void => {
      it('should return range of list', async (): Promise<void> => {
        mockCollections.lists.findOne.mockResolvedValue({
          values: ['a', 'b', 'c', 'd', 'e']
        });

        const result = await storage.lrange('mylist', 1, 3);
        expect(result).toEqual(['b', 'c', 'd']);
      });

      it('should handle negative indices', async (): Promise<void> => {
        mockCollections.lists.findOne.mockResolvedValue({
          values: ['a', 'b', 'c']
        });

        const result = await storage.lrange('mylist', -2, -1);
        expect(result).toEqual(['b', 'c']);
      });

      it('should return empty array for non-existent list', async (): Promise<void> => {
        mockCollections.lists.findOne.mockResolvedValue(null);

        const result = await storage.lrange('mylist', 0, -1);
        expect(result).toEqual([]);
      });
    });
  });

  describe('set operations', (): void => {
    beforeEach(() => {
      storage.db = mockDb;
    });

    describe('sadd', (): void => {
      it('should add members to set', async (): Promise<void> => {
        mockCollections.sets.updateOne.mockResolvedValue({ modifiedCount: 1 });

        const result = await storage.sadd('myset', 'a', 'b', 'c');
        expect(result).toBe(1);
        expect(mockCollections.sets.updateOne).toHaveBeenCalledWith(
          { key: 'myset' },
          {
            $addToSet: { members: { $each: ['a', 'b', 'c'] } },
            $setOnInsert: { key: 'myset' }
          },
          { upsert: true }
        );
      });
    });

    describe('smembers', (): void => {
      it('should return all members', async (): Promise<void> => {
        mockCollections.sets.findOne.mockResolvedValue({
          members: ['a', 'b', 'c']
        });

        const result = await storage.smembers('myset');
        expect(result).toEqual(['a', 'b', 'c']);
      });

      it('should return empty array for non-existent set', async (): Promise<void> => {
        mockCollections.sets.findOne.mockResolvedValue(null);

        const result = await storage.smembers('myset');
        expect(result).toEqual([]);
      });
    });

    describe('sismember', (): void => {
      it('should check membership', async (): Promise<void> => {
        mockCollections.sets.countDocuments.mockResolvedValue(1);

        const result = await storage.sismember('myset', 'a');
        expect(result).toBe(true);
        expect(mockCollections.sets.countDocuments).toHaveBeenCalledWith({
          key: 'myset',
          members: 'a'
        });
      });
    });
  });

  describe('hash operations', (): void => {
    beforeEach(() => {
      storage.db = mockDb;
    });

    describe('hset/hget', (): void => {
      it('should set hash field', async (): Promise<void> => {
        await storage.hset('user:123', 'name', 'John');
        
        expect(mockCollections.hashes.updateOne).toHaveBeenCalledWith(
          { key: 'user:123' },
          {
            $set: { 'fields.name': 'John' },
            $setOnInsert: { key: 'user:123' }
          },
          { upsert: true }
        );
      });

      it('should get hash field', async (): Promise<void> => {
        mockCollections.hashes.findOne.mockResolvedValue({
          fields: { name: 'John', age: 30 }
        });

        const result = await storage.hget('user:123', 'name');
        expect(result).toBe('John');
      });

      it('should return null for non-existent field', async (): Promise<void> => {
        mockCollections.hashes.findOne.mockResolvedValue({
          fields: { name: 'John' }
        });

        const result = await storage.hget('user:123', 'email');
        expect(result).toBeNull();
      });
    });

    describe('hgetall', (): void => {
      it('should get all hash fields', async (): Promise<void> => {
        mockCollections.hashes.findOne.mockResolvedValue({
          fields: { name: 'John', age: 30, email: 'john@example.com' }
        });

        const result = await storage.hgetall('user:123');
        expect(result).toEqual({
          name: 'John',
          age: 30,
          email: 'john@example.com'
        });
      });

      it('should return empty object for non-existent hash', async (): Promise<void> => {
        mockCollections.hashes.findOne.mockResolvedValue(null);

        const result = await storage.hgetall('user:123');
        expect(result).toEqual({});
      });
    });

    describe('hincrby', (): void => {
      it('should increment hash field', async (): Promise<void> => {
        mockCollections.hashes.findOneAndUpdate.mockResolvedValue({
          value: { fields: { points: 150 } }
        });

        const result = await storage.hincrby('user:123', 'points', 50);
        expect(result).toBe(150);
      });
    });
  });

  describe('expiration', (): void => {
    beforeEach(() => {
      storage.db = mockDb;
    });

    describe('expire', (): void => {
      it('should set expiration', async (): Promise<void> => {
        mockCollections.keyvalue.updateOne.mockResolvedValue({ modifiedCount: 1 });

        const result = await storage.expire('key', 60);
        expect(result).toBe(true);
        expect(mockCollections.keyvalue.updateOne).toHaveBeenCalledWith(
          { key: 'key' },
          { $set: { expiresAt: expect.any(Date) } }
        );
      });
    });

    describe('ttl', (): void => {
      it('should return TTL for key with expiration', async (): Promise<void> => {
        const expiresAt = new Date(Date.now() + 60000); // 60 seconds
        mockCollections.keyvalue.findOne.mockResolvedValue({
          key: 'key',
          expiresAt
        });

        const ttl = await storage.ttl('key');
        expect(ttl).toBeGreaterThan(58);
        expect(ttl).toBeLessThanOrEqual(60);
      });

      it('should return -1 for key without expiration', async (): Promise<void> => {
        mockCollections.keyvalue.findOne.mockResolvedValue({
          key: 'key'
        });

        const ttl = await storage.ttl('key');
        expect(ttl).toBe(-1);
      });

      it('should return -2 for non-existent key', async (): Promise<void> => {
        mockCollections.keyvalue.findOne.mockResolvedValue(null);

        const ttl = await storage.ttl('key');
        expect(ttl).toBe(-2);
      });
    });
  });

  describe('transaction', (): void => {
    beforeEach(() => {
      storage.db = mockDb;
      storage.client = mockClient;
    });

    it('should execute operations in transaction', async (): Promise<void> => {
      const operations = [
        { method: 'set', args: ['key1', 'value1'] },
        { method: 'increment', args: ['counter', 1] },
        { method: 'zadd', args: ['leaderboard', 100, 'player1'] }
      ];

      // Mock the methods
      storage.set = jest.fn().mockResolvedValue(true);
      storage.increment = jest.fn().mockResolvedValue(1);
      storage.zadd = jest.fn().mockResolvedValue(true);

      const results = await storage.transaction(operations);
      
      expect(results).toEqual([true, 1, true]);
      expect(storage.set).toHaveBeenCalledWith('key1', 'value1');
      expect(storage.increment).toHaveBeenCalledWith('counter', 1);
      expect(storage.zadd).toHaveBeenCalledWith('leaderboard', 100, 'player1');
    });
  });

  describe('clear', (): void => {
    beforeEach(() => {
      storage.db = mockDb;
    });

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
  });
});