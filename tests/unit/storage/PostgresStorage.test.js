import { PostgresStorage } from '../../../src/storage/PostgresStorage.js';
import { jest } from '@jest/globals';

describe('PostgresStorage', () => {
  let storage;
  let mockPool;
  let mockClient;
  let cleanupInterval;

  beforeEach(() => {
    // Mock query results
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    };

    // Mock Pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(),
      on: jest.fn()
    };

    // Mock pg module
    const mockPg = {
      Pool: jest.fn().mockImplementation(() => mockPool),
      default: {
        Pool: jest.fn().mockImplementation(() => mockPool)
      }
    };

    storage = new PostgresStorage({
      host: 'localhost',
      port: 5432,
      database: 'test_gamification',
      user: 'test',
      password: 'test'
    });

    // Mock the pg module
    storage.pg = mockPg;
    storage.client = mockPool;

    // Capture setInterval
    jest.spyOn(global, 'setInterval').mockImplementation((fn, time) => {
      cleanupInterval = { fn, time };
      return 123; // mock interval ID
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const storage = new PostgresStorage();
      expect(storage.tablePrefix).toBe('gk_');
    });

    it('should initialize with custom options', () => {
      const storage = new PostgresStorage({
        tablePrefix: 'custom_'
      });
      expect(storage.tablePrefix).toBe('custom_');
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      jest.spyOn(storage, 'connect').mockImplementation(async function() {
        const { Pool } = this.pg.default || this.pg;
        this.client = new Pool(this.options);
        await this.createTables();
        this.connected = true;
        this.startCleanupJob();
        return true;
      });

      const result = await storage.connect();
      expect(result).toBe(true);
      expect(storage.connected).toBe(true);
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockPool.query.mockRejectedValue(error);

      jest.spyOn(storage, 'createTables').mockRejectedValue(error);
      
      await expect(storage.createTables()).rejects.toThrow();
    });

    it('should create tables on connect', async () => {
      await storage.createTables();
      
      // Check that all table creation queries were executed
      const queries = mockPool.query.mock.calls.map(call => call[0]);
      
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS gk_keyvalue'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS gk_sortedsets'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS gk_lists'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS gk_sets'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS gk_hashes'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE INDEX'))).toBe(true);
    });

    it('should start cleanup job', () => {
      storage.startCleanupJob();
      
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
      expect(cleanupInterval.time).toBe(60000);
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      storage.connected = true;

      const result = await storage.disconnect();
      expect(result).toBe(true);
      expect(mockPool.end).toHaveBeenCalled();
      expect(storage.connected).toBe(false);
    });

    it('should handle disconnect when not connected', async () => {
      storage.client = null;
      const result = await storage.disconnect();
      expect(result).toBe(true);
    });
  });

  describe('key-value operations', () => {
    describe('get', () => {
      it('should return value for existing key', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{
            value: JSON.stringify({ data: 'testValue' })
          }]
        });

        const result = await storage.get('test');
        expect(result).toEqual({ data: 'testValue' });
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT value FROM'),
          ['test']
        );
      });

      it('should return null for non-existent key', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await storage.get('nonexistent');
        expect(result).toBeNull();
      });

      it('should handle expired keys', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await storage.get('expired');
        expect(result).toBeNull();
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('expires_at IS NULL OR expires_at > NOW()'),
          expect.any(Array)
        );
      });
    });

    describe('set', () => {
      it('should set value without TTL', async () => {
        await storage.set('key', { value: 'data' });
        
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO'),
          ['key', JSON.stringify({ value: 'data' }), null]
        );
      });

      it('should set value with TTL', async () => {
        const ttl = 60; // 60 seconds
        await storage.set('key', 'value', ttl);
        
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO'),
          expect.arrayContaining(['key', JSON.stringify('value')])
        );
        
        // Check that expiration is set
        const expirationArg = mockPool.query.mock.calls[0][1][2];
        expect(expirationArg).toMatch(/interval '\d+ seconds'/);
      });
    });

    describe('delete', () => {
      it('should delete key from all tables', async () => {
        mockPool.query.mockResolvedValue({ rowCount: 1 });

        const result = await storage.delete('key');
        expect(result).toBe(true);
        
        // Check that delete was attempted on all tables
        const queries = mockPool.query.mock.calls.map(call => call[0]);
        expect(queries.some(q => q.includes('DELETE FROM gk_keyvalue'))).toBe(true);
        expect(queries.some(q => q.includes('DELETE FROM gk_sortedsets'))).toBe(true);
        expect(queries.some(q => q.includes('DELETE FROM gk_lists'))).toBe(true);
      });

      it('should return false if key not found', async () => {
        mockPool.query.mockResolvedValue({ rowCount: 0 });

        const result = await storage.delete('nonexistent');
        expect(result).toBe(false);
      });
    });

    describe('exists', () => {
      it('should return true if key exists', async () => {
        mockPool.query.mockResolvedValue({ rows: [{ count: '1' }] });

        const result = await storage.exists('key');
        expect(result).toBe(true);
      });

      it('should check all tables', async () => {
        mockPool.query
          .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // keyvalue
          .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // sortedsets
          .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // lists

        const result = await storage.exists('key');
        expect(result).toBe(true);
        expect(mockPool.query).toHaveBeenCalledTimes(3);
      });
    });

    describe('increment/decrement', () => {
      it('should increment value', async () => {
        mockPool.query.mockResolvedValue({ 
          rows: [{ value: JSON.stringify(5) }]
        });

        const result = await storage.increment('counter', 2);
        expect(result).toBe(5);
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('ON CONFLICT'),
          expect.arrayContaining(['counter', 2])
        );
      });

      it('should decrement value', async () => {
        mockPool.query.mockResolvedValue({ 
          rows: [{ value: JSON.stringify(3) }]
        });

        const result = await storage.decrement('counter', 2);
        expect(result).toBe(3);
      });
    });

    describe('mget/mset', () => {
      it('should get multiple values', async () => {
        mockPool.query.mockResolvedValue({
          rows: [
            { key: 'key1', value: JSON.stringify('value1') },
            { key: 'key2', value: JSON.stringify('value2') }
          ]
        });

        const result = await storage.mget(['key1', 'key2', 'key3']);
        expect(result).toEqual({
          key1: 'value1',
          key2: 'value2',
          key3: null
        });
      });

      it('should set multiple values in transaction', async () => {
        const beginMock = jest.fn();
        const commitMock = jest.fn();
        const rollbackMock = jest.fn();

        mockClient.query
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({}) // INSERT 1
          .mockResolvedValueOnce({}) // INSERT 2
          .mockResolvedValueOnce({}); // COMMIT

        mockPool.connect.mockResolvedValue({
          query: mockClient.query,
          release: jest.fn()
        });

        await storage.mset({
          key1: 'value1',
          key2: 'value2'
        });

        const queries = mockClient.query.mock.calls.map(call => call[0]);
        expect(queries[0]).toBe('BEGIN');
        expect(queries.slice(1, -1).every(q => q.includes('INSERT INTO'))).toBe(true);
        expect(queries[queries.length - 1]).toBe('COMMIT');
      });
    });

    describe('keys', () => {
      it('should find keys matching pattern', async () => {
        mockPool.query
          .mockResolvedValueOnce({ rows: [{ key: 'user:123' }, { key: 'user:456' }] })
          .mockResolvedValue({ rows: [] });

        const result = await storage.keys('user:*');
        expect(result).toContain('user:123');
        expect(result).toContain('user:456');
      });

      it('should convert pattern to SQL LIKE', async () => {
        await storage.keys('user:*:profile');
        
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('WHERE key LIKE $1'),
          ['user:%:profile']
        );
      });
    });
  });

  describe('sorted set operations', () => {
    describe('zadd', () => {
      it('should add member to sorted set', async () => {
        await storage.zadd('leaderboard', 100, 'player1');
        
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO gk_sortedsets'),
          ['leaderboard', 'player1', 100]
        );
      });
    });

    describe('zrem', () => {
      it('should remove member from sorted set', async () => {
        mockPool.query.mockResolvedValue({ rowCount: 1 });

        const result = await storage.zrem('leaderboard', 'player1');
        expect(result).toBe(true);
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM gk_sortedsets'),
          ['leaderboard', 'player1']
        );
      });
    });

    describe('zrange', () => {
      it('should return range without scores', async () => {
        mockPool.query.mockResolvedValue({
          rows: [
            { member: 'player1', score: 100 },
            { member: 'player2', score: 200 }
          ]
        });

        const result = await storage.zrange('leaderboard', 0, 1);
        expect(result).toEqual(['player1', 'player2']);
      });

      it('should return range with scores', async () => {
        mockPool.query.mockResolvedValue({
          rows: [
            { member: 'player1', score: 100 },
            { member: 'player2', score: 200 }
          ]
        });

        const result = await storage.zrange('leaderboard', 0, -1, { withScores: true });
        expect(result).toEqual(['player1', 100, 'player2', 200]);
      });
    });

    describe('zrank/zrevrank', () => {
      it('should return rank in ascending order', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ rank: '1' }]
        });

        const rank = await storage.zrank('leaderboard', 'player2');
        expect(rank).toBe(1);
      });

      it('should return null for non-existent member', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const rank = await storage.zrank('leaderboard', 'unknown');
        expect(rank).toBeNull();
      });
    });

    describe('zincrby', () => {
      it('should increment score', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ score: 150 }]
        });

        const result = await storage.zincrby('leaderboard', 50, 'player1');
        expect(result).toBe(150);
      });
    });
  });

  describe('list operations', () => {
    describe('lpush/rpush', () => {
      it('should push to left of list', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ values: JSON.stringify(['x', 'y', 'a', 'b']) }]
        });

        const length = await storage.lpush('mylist', 'x', 'y');
        expect(length).toBe(4);
        
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('jsonb_build_array'),
          expect.any(Array)
        );
      });

      it('should push to right of list', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ values: JSON.stringify(['a', 'b', 'x', 'y']) }]
        });

        const length = await storage.rpush('mylist', 'x', 'y');
        expect(length).toBe(4);
      });
    });

    describe('lrange', () => {
      it('should return range of list', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{
            values: JSON.stringify(['a', 'b', 'c', 'd', 'e'])
          }]
        });

        const result = await storage.lrange('mylist', 1, 3);
        expect(result).toEqual(['b', 'c', 'd']);
      });

      it('should return empty array for non-existent list', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await storage.lrange('mylist', 0, -1);
        expect(result).toEqual([]);
      });
    });
  });

  describe('set operations', () => {
    describe('sadd', () => {
      it('should add members to set', async () => {
        await storage.sadd('myset', 'a', 'b', 'c');
        
        expect(mockPool.query).toHaveBeenCalledTimes(3);
        const queries = mockPool.query.mock.calls;
        expect(queries[0][1]).toEqual(['myset', 'a']);
        expect(queries[1][1]).toEqual(['myset', 'b']);
        expect(queries[2][1]).toEqual(['myset', 'c']);
      });
    });

    describe('smembers', () => {
      it('should return all members', async () => {
        mockPool.query.mockResolvedValue({
          rows: [
            { member: 'a' },
            { member: 'b' },
            { member: 'c' }
          ]
        });

        const result = await storage.smembers('myset');
        expect(result).toEqual(['a', 'b', 'c']);
      });
    });

    describe('sismember', () => {
      it('should check membership', async () => {
        mockPool.query.mockResolvedValue({ rows: [{ exists: true }] });

        const result = await storage.sismember('myset', 'a');
        expect(result).toBe(true);
      });
    });
  });

  describe('hash operations', () => {
    describe('hset/hget', () => {
      it('should set hash field', async () => {
        await storage.hset('user:123', 'name', 'John');
        
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO gk_hashes'),
          ['user:123', 'name', JSON.stringify('John')]
        );
      });

      it('should get hash field', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ value: JSON.stringify('John') }]
        });

        const result = await storage.hget('user:123', 'name');
        expect(result).toBe('John');
      });
    });

    describe('hgetall', () => {
      it('should get all hash fields', async () => {
        mockPool.query.mockResolvedValue({
          rows: [
            { field: 'name', value: JSON.stringify('John') },
            { field: 'age', value: JSON.stringify(30) }
          ]
        });

        const result = await storage.hgetall('user:123');
        expect(result).toEqual({
          name: 'John',
          age: 30
        });
      });
    });

    describe('hincrby', () => {
      it('should increment hash field', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ value: JSON.stringify(150) }]
        });

        const result = await storage.hincrby('user:123', 'points', 50);
        expect(result).toBe(150);
      });
    });
  });

  describe('expiration', () => {
    describe('expire', () => {
      it('should set expiration', async () => {
        mockPool.query.mockResolvedValue({ rowCount: 1 });

        const result = await storage.expire('key', 60);
        expect(result).toBe(true);
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE gk_keyvalue SET expires_at'),
          expect.any(Array)
        );
      });
    });

    describe('ttl', () => {
      it('should return TTL for key with expiration', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ ttl: 60 }]
        });

        const ttl = await storage.ttl('key');
        expect(ttl).toBe(60);
      });

      it('should return -1 for key without expiration', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ ttl: null }]
        });

        const ttl = await storage.ttl('key');
        expect(ttl).toBe(-1);
      });

      it('should return -2 for non-existent key', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const ttl = await storage.ttl('key');
        expect(ttl).toBe(-2);
      });
    });
  });

  describe('transaction', () => {
    it('should execute operations in transaction', async () => {
      const operations = [
        { method: 'set', args: ['key1', 'value1'] },
        { method: 'increment', args: ['counter', 1] },
        { method: 'zadd', args: ['leaderboard', 100, 'player1'] }
      ];

      mockPool.connect.mockResolvedValue({
        query: jest.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({}) // set
          .mockResolvedValueOnce({ rows: [{ value: JSON.stringify(1) }] }) // increment
          .mockResolvedValueOnce({}) // zadd
          .mockResolvedValueOnce({}), // COMMIT
        release: jest.fn()
      });

      // Mock the methods
      storage.set = jest.fn().mockResolvedValue(true);
      storage.increment = jest.fn().mockResolvedValue(1);
      storage.zadd = jest.fn().mockResolvedValue(true);

      const results = await storage.transaction(operations);
      
      expect(results).toEqual([true, 1, true]);
    });
  });

  describe('cleanup job', () => {
    it('should run cleanup periodically', async () => {
      storage.startCleanupJob();
      
      // Execute the cleanup function
      await cleanupInterval.fn();
      
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM gk_keyvalue WHERE expires_at < NOW()')
      );
    });

    it('should handle cleanup errors', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      mockPool.query.mockRejectedValue(new Error('Cleanup failed'));
      
      storage.startCleanupJob();
      await cleanupInterval.fn();
      
      expect(consoleError).toHaveBeenCalledWith('Cleanup job error:', expect.any(Error));
      consoleError.mockRestore();
    });
  });

  describe('clear', () => {
    it('should clear keys matching pattern', async () => {
      storage.keys = jest.fn().mockResolvedValue(['user:1', 'user:2', 'user:3']);
      storage.delete = jest.fn().mockResolvedValue(true);

      const count = await storage.clear('user:*');
      
      expect(count).toBe(3);
      expect(storage.delete).toHaveBeenCalledTimes(3);
    });
  });
});