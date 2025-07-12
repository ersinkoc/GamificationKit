import { StorageInterface } from './StorageInterface.js';

export class RedisStorage extends StorageInterface {
  constructor(options = {}) {
    super(options);
    this.client = null;
    this.redis = null;
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

  async get(key) {
    const value = await this.client.get(key);
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async set(key, value, ttl) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl) {
      return await this.client.set(key, serialized, { EX: ttl });
    }
    return await this.client.set(key, serialized);
  }

  async delete(key) {
    const result = await this.client.del(key);
    return result > 0;
  }

  async exists(key) {
    const result = await this.client.exists(key);
    return result > 0;
  }

  async increment(key, amount = 1) {
    return await this.client.incrBy(key, amount);
  }

  async decrement(key, amount = 1) {
    return await this.client.decrBy(key, amount);
  }

  async mget(keys) {
    const values = await this.client.mGet(keys);
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
      pairs.push(key);
      pairs.push(typeof value === 'string' ? value : JSON.stringify(value));
    }
    return await this.client.mSet(pairs);
  }

  async keys(pattern) {
    return await this.client.keys(pattern);
  }

  async clear(pattern) {
    const keys = await this.keys(pattern);
    if (keys.length > 0) {
      return await this.client.del(keys);
    }
    return 0;
  }

  async zadd(key, score, member) {
    const result = await this.client.zAdd(key, { score, value: member });
    return result > 0;
  }

  async zrem(key, member) {
    const result = await this.client.zRem(key, member);
    return result > 0;
  }

  async zrange(key, start, stop, options = {}) {
    if (options.withScores) {
      return await this.client.zRangeWithScores(key, start, stop);
    }
    return await this.client.zRange(key, start, stop);
  }

  async zrevrange(key, start, stop, options = {}) {
    if (options.withScores) {
      return await this.client.zRangeWithScores(key, start, stop, { REV: true });
    }
    return await this.client.zRange(key, start, stop, { REV: true });
  }

  async zrank(key, member) {
    return await this.client.zRank(key, member);
  }

  async zrevrank(key, member) {
    return await this.client.zRevRank(key, member);
  }

  async zscore(key, member) {
    return await this.client.zScore(key, member);
  }

  async zcount(key, min, max) {
    return await this.client.zCount(key, min, max);
  }

  async zincrby(key, increment, member) {
    return await this.client.zIncrBy(key, increment, member);
  }

  async lpush(key, ...values) {
    return await this.client.lPush(key, values);
  }

  async rpush(key, ...values) {
    return await this.client.rPush(key, values);
  }

  async lpop(key) {
    return await this.client.lPop(key);
  }

  async rpop(key) {
    return await this.client.rPop(key);
  }

  async lrange(key, start, stop) {
    return await this.client.lRange(key, start, stop);
  }

  async llen(key) {
    return await this.client.lLen(key);
  }

  async sadd(key, ...members) {
    return await this.client.sAdd(key, members);
  }

  async srem(key, ...members) {
    return await this.client.sRem(key, members);
  }

  async smembers(key) {
    return await this.client.sMembers(key);
  }

  async sismember(key, member) {
    const result = await this.client.sIsMember(key, member);
    return result === 1;
  }

  async scard(key) {
    return await this.client.sCard(key);
  }

  async hset(key, field, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const result = await this.client.hSet(key, field, serialized);
    return result >= 0;
  }

  async hget(key, field) {
    const value = await this.client.hGet(key, field);
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async hgetall(key) {
    const hash = await this.client.hGetAll(key);
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
    return await this.client.hDel(key, fields);
  }

  async hincrby(key, field, increment) {
    return await this.client.hIncrBy(key, field, increment);
  }

  async expire(key, seconds) {
    return await this.client.expire(key, seconds);
  }

  async ttl(key) {
    return await this.client.ttl(key);
  }

  async transaction(operations) {
    const multi = this.client.multi();
    
    for (const op of operations) {
      const { method, args } = op;
      multi[method](...args);
    }
    
    return await multi.exec();
  }
}