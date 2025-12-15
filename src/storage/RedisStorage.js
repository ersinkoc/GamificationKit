import { StorageInterface } from './StorageInterface.js';

export class RedisStorage extends StorageInterface {
  constructor(options = {}) {
    super(options);
    this.client = null;
    this.redis = null;
    // Fix HIGH-014: Add key prefix support
    this.keyPrefix = options.keyPrefix || '';
  }

  // Fix HIGH-014: Helper to apply key prefix
  getKey(key) {
    return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
  }

  // Fix HIGH-014: Helper to remove key prefix (for returning keys to user)
  stripPrefix(key) {
    if (this.keyPrefix && key.startsWith(this.keyPrefix)) {
      return key.slice(this.keyPrefix.length);
    }
    return key;
  }

  async connect() {
    try {
      const redis = await import('redis');
      this.redis = redis;
      
      this.client = redis.createClient({
        host: this.options.host || 'localhost',
        port: this.options.port || 6379,
        password: this.options.password,
        db: this.options.db || 0,
        ...this.options
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      await this.client.connect();
      this.connected = true;
      return true;
    } catch (error) {
      throw new Error(`Failed to connect to Redis: ${error.message}`);
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
    return true;
  }

  // Fix HIGH-014: All methods now use getKey() for key prefix support
  async get(key) {
    const value = await this.client.get(this.getKey(key));
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async set(key, value, ttl) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl) {
      return await this.client.set(this.getKey(key), serialized, { EX: ttl });
    }
    return await this.client.set(this.getKey(key), serialized);
  }

  async delete(key) {
    const result = await this.client.del(this.getKey(key));
    return result > 0;
  }

  async exists(key) {
    const result = await this.client.exists(this.getKey(key));
    return result > 0;
  }

  async increment(key, amount = 1) {
    return await this.client.incrBy(this.getKey(key), amount);
  }

  async decrement(key, amount = 1) {
    return await this.client.decrBy(this.getKey(key), amount);
  }

  async mget(keys) {
    const prefixedKeys = keys.map(k => this.getKey(k));
    const values = await this.client.mGet(prefixedKeys);
    const result = {};

    keys.forEach((key, index) => {
      try {
        result[key] = JSON.parse(values[index]);
      } catch {
        result[key] = values[index];
      }
    });

    return result;
  }

  async mset(entries) {
    const pairs = [];
    for (const [key, value] of Object.entries(entries)) {
      pairs.push(this.getKey(key));
      pairs.push(typeof value === 'string' ? value : JSON.stringify(value));
    }
    return await this.client.mSet(pairs);
  }

  async keys(pattern) {
    const prefixedPattern = this.getKey(pattern);
    const keys = await this.client.keys(prefixedPattern);
    // Return keys without prefix for consistent API
    return keys.map(k => this.stripPrefix(k));
  }

  async clear(pattern) {
    const prefixedPattern = this.getKey(pattern);
    const keys = await this.client.keys(prefixedPattern);
    if (keys.length > 0) {
      return await this.client.del(keys);
    }
    return 0;
  }

  async zadd(key, score, member) {
    // Fix BUG-037: Return count instead of boolean to match MemoryStorage
    const result = await this.client.zAdd(this.getKey(key), { score, value: member });
    return result;  // Return actual count of elements added
  }

  async zrem(key, member) {
    const result = await this.client.zRem(this.getKey(key), member);
    return result > 0;
  }

  async zrange(key, start, stop, options = {}) {
    if (options.withScores) {
      return await this.client.zRangeWithScores(this.getKey(key), start, stop);
    }
    return await this.client.zRange(this.getKey(key), start, stop);
  }

  async zrevrange(key, start, stop, options = {}) {
    if (options.withScores) {
      return await this.client.zRangeWithScores(this.getKey(key), start, stop, { REV: true });
    }
    return await this.client.zRange(this.getKey(key), start, stop, { REV: true });
  }

  async zrank(key, member) {
    return await this.client.zRank(this.getKey(key), member);
  }

  async zrevrank(key, member) {
    return await this.client.zRevRank(this.getKey(key), member);
  }

  async zscore(key, member) {
    return await this.client.zScore(this.getKey(key), member);
  }

  async zcount(key, min, max) {
    return await this.client.zCount(this.getKey(key), min, max);
  }

  async zincrby(key, increment, member) {
    return await this.client.zIncrBy(this.getKey(key), increment, member);
  }

  async lpush(key, ...values) {
    return await this.client.lPush(this.getKey(key), values);
  }

  async rpush(key, ...values) {
    return await this.client.rPush(this.getKey(key), values);
  }

  async lpop(key) {
    return await this.client.lPop(this.getKey(key));
  }

  async rpop(key) {
    return await this.client.rPop(this.getKey(key));
  }

  async lrange(key, start, stop) {
    return await this.client.lRange(this.getKey(key), start, stop);
  }

  async llen(key) {
    return await this.client.lLen(this.getKey(key));
  }

  async sadd(key, ...members) {
    return await this.client.sAdd(this.getKey(key), members);
  }

  async srem(key, ...members) {
    return await this.client.sRem(this.getKey(key), members);
  }

  async smembers(key) {
    return await this.client.sMembers(this.getKey(key));
  }

  async sismember(key, member) {
    const result = await this.client.sIsMember(this.getKey(key), member);
    return result === 1;
  }

  async scard(key) {
    return await this.client.sCard(this.getKey(key));
  }

  async hset(key, field, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const result = await this.client.hSet(this.getKey(key), field, serialized);
    return result >= 0;
  }

  async hget(key, field) {
    const value = await this.client.hGet(this.getKey(key), field);
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async hgetall(key) {
    const hash = await this.client.hGetAll(this.getKey(key));
    const result = {};

    for (const [field, value] of Object.entries(hash)) {
      try {
        result[field] = JSON.parse(value);
      } catch {
        result[field] = value;
      }
    }

    return result;
  }

  async hdel(key, ...fields) {
    return await this.client.hDel(this.getKey(key), fields);
  }

  async hincrby(key, field, increment) {
    return await this.client.hIncrBy(this.getKey(key), field, increment);
  }

  async expire(key, seconds) {
    return await this.client.expire(this.getKey(key), seconds);
  }

  async ttl(key) {
    return await this.client.ttl(this.getKey(key));
  }

  async transaction(operations) {
    const multi = this.client.multi();

    for (const op of operations) {
      const { method, args } = op;
      // Apply key prefix to the first argument (which is always the key)
      const prefixedArgs = [...args];
      if (prefixedArgs.length > 0 && typeof prefixedArgs[0] === 'string') {
        prefixedArgs[0] = this.getKey(prefixedArgs[0]);
      }
      multi[method](...prefixedArgs);
    }

    return await multi.exec();
  }
}