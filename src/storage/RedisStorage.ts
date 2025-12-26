// @ts-nocheck
import { StorageInterface, ZRangeOptions, type StorageOptions } from './StorageInterface.js';
import type { StorageKey, StorageValue } from '../types/storage.js';
import type { RedisClientType } from 'redis';

interface RedisStorageOptions extends StorageOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

interface MultiCommand {
  method: string;
  args: any[];
}

export class RedisStorage extends StorageInterface {
  private client: RedisClientType | null;
  private keyPrefix: string;

  constructor(options: RedisStorageOptions = {}) {
    super(options);
    this.client = null;
    // Fix HIGH-014: Add key prefix support
    this.keyPrefix = options.keyPrefix || '';
  }

  // Fix HIGH-014: Helper to apply key prefix
  private getKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
  }

  // Fix HIGH-014: Helper to remove key prefix (for returning keys to user)
  private stripPrefix(key: string): string {
    if (this.keyPrefix && key.startsWith(this.keyPrefix)) {
      return key.slice(this.keyPrefix.length);
    }
    return key;
  }

  async connect(): Promise<void> {
    try {
      const redis = await import('redis');
      

      this.client = redis.createClient({
        socket: {
          host: (this.options as RedisStorageOptions).host || 'localhost',
          port: (this.options as RedisStorageOptions).port || 6379,
        },
        password: (this.options as RedisStorageOptions).password,
        database: (this.options as RedisStorageOptions).db || 0,
        ...this.options
      }) as RedisClientType;

      this.client.on('error', (err: Error) => {
        console.error('Redis Client Error:', err);
      });

      await this.client.connect();
      this.connected = true;
    } catch (error: any) {
      throw new Error(`Failed to connect to Redis: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }

  // Fix HIGH-014: All methods now use getKey() for key prefix support
  async get(key: StorageKey): Promise<StorageValue> {
    const value = await this.client!.get(this.getKey(key));
    try {
      return JSON.parse(value!);
    } catch {
      return value;
    }
  }

  async set(key: StorageKey, value: StorageValue, ttl?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl) {
      await this.client!.set(this.getKey(key), serialized, { EX: ttl });
    } else {
      await this.client!.set(this.getKey(key), serialized);
    }
  }

  async delete(key: StorageKey): Promise<boolean> {
    const result = await this.client!.del(this.getKey(key));
    return result > 0;
  }

  async exists(key: StorageKey): Promise<boolean> {
    const result = await this.client!.exists(this.getKey(key));
    return result > 0;
  }

  async increment(key: StorageKey, amount: number = 1): Promise<number> {
    return await this.client!.incrBy(this.getKey(key), amount);
  }

  async decrement(key: StorageKey, amount: number = 1): Promise<number> {
    return await this.client!.decrBy(this.getKey(key), amount);
  }

  async mget(keys: StorageKey[]): Promise<Record<string, any>> {
    const prefixedKeys = keys.map(k => this.getKey(k));
    const values = await this.client!.mGet(prefixedKeys);
    const result: Record<string, any> = {};

    keys.forEach((key, index) => {
      try {
        result[key] = JSON.parse(values[index]!);
      } catch {
        result[key] = values[index];
      }
    });

    return result;
  }

  async mset(entries: Record<string, any>): Promise<void> {
    const pairs: string[] = [];
    for (const [key, value] of Object.entries(entries)) {
      pairs.push(this.getKey(key));
      pairs.push(typeof value === 'string' ? value : JSON.stringify(value));
    }
    await this.client!.mSet(pairs);
  }

  async keys(pattern: string = '*'): Promise<StorageKey[]> {
    const prefixedPattern = this.getKey(pattern);
    const keys = await this.client!.keys(prefixedPattern);
    // Return keys without prefix for consistent API
    return keys.map(k => this.stripPrefix(k));
  }

  async clear(pattern: string = '*'): Promise<number> {
    const prefixedPattern = this.getKey(pattern);
    const keys = await this.client!.keys(prefixedPattern);
    if (keys.length > 0) {
      return await this.client!.del(keys);
    }
    return 0;
  }

  async zadd(key: StorageKey, score: number, member: any): Promise<number> {
    // Fix BUG-037: Return count instead of boolean to match MemoryStorage
    const result = await this.client!.zAdd(this.getKey(key), { score, value: member });
    return result;  // Return actual count of elements added
  }

  async zrem(key: StorageKey, member: any): Promise<number> {
    const result = await this.client!.zRem(this.getKey(key), member);
    return result > 0 ? 1 : 0;
  }

  async zrange(key: StorageKey, start: number, stop: number, options: ZRangeOptions = {}): Promise<any[]> {
    if (options.withScores) {
      return await this.client!.zRangeWithScores(this.getKey(key), start, stop);
    }
    return await this.client!.zRange(this.getKey(key), start, stop);
  }

  async zrevrange(key: StorageKey, start: number, stop: number, options: ZRangeOptions = {}): Promise<any[]> {
    if (options.withScores) {
      return await this.client!.zRangeWithScores(this.getKey(key), start, stop, { REV: true });
    }
    return await this.client!.zRange(this.getKey(key), start, stop, { REV: true });
  }

  async zrank(key: StorageKey, member: any): Promise<number | null> {
    return await this.client!.zRank(this.getKey(key), member);
  }

  async zrevrank(key: StorageKey, member: any): Promise<number | null> {
    return await this.client!.zRevRank(this.getKey(key), member);
  }

  async zscore(key: StorageKey, member: any): Promise<number | null> {
    return await this.client!.zScore(this.getKey(key), member);
  }

  async zcount(key: StorageKey, min: string | number, max: string | number): Promise<number> {
    return await this.client!.zCount(this.getKey(key), min, max);
  }

  async zincrby(key: StorageKey, increment: number, member: any): Promise<number> {
    return await this.client!.zIncrBy(this.getKey(key), increment, member);
  }

  async lpush(key: StorageKey, ...values: any[]): Promise<number> {
    return await this.client!.lPush(this.getKey(key), values);
  }

  async rpush(key: StorageKey, ...values: any[]): Promise<number> {
    return await this.client!.rPush(this.getKey(key), values);
  }

  async lpop(key: StorageKey): Promise<any> {
    return await this.client!.lPop(this.getKey(key));
  }

  async rpop(key: StorageKey): Promise<any> {
    return await this.client!.rPop(this.getKey(key));
  }

  async lrange(key: StorageKey, start: number, stop: number): Promise<any[]> {
    return await this.client!.lRange(this.getKey(key), start, stop);
  }

  async llen(key: StorageKey): Promise<number> {
    return await this.client!.lLen(this.getKey(key));
  }

  async sadd(key: StorageKey, ...members: any[]): Promise<number> {
    return await this.client!.sAdd(this.getKey(key), members);
  }

  async srem(key: StorageKey, ...members: any[]): Promise<number> {
    return await this.client!.sRem(this.getKey(key), members);
  }

  async smembers(key: StorageKey): Promise<any[]> {
    return await this.client!.sMembers(this.getKey(key));
  }

  async sismember(key: StorageKey, member: any): Promise<boolean> {
    const result = await this.client!.sIsMember(this.getKey(key), member);
    return Boolean(result);
  }

  async scard(key: StorageKey): Promise<number> {
    return await this.client!.sCard(this.getKey(key));
  }

  async hset(key: StorageKey, field: string, value: any): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await this.client!.hSet(this.getKey(key), field, serialized);
  }

  async hget(key: StorageKey, field: string): Promise<any> {
    const value = await this.client!.hGet(this.getKey(key), field);
    try {
      return JSON.parse(value!);
    } catch {
      return value;
    }
  }

  async hgetall(key: StorageKey): Promise<Record<string, any>> {
    const hash = await this.client!.hGetAll(this.getKey(key));
    const result: Record<string, any> = {};

    for (const [field, value] of Object.entries(hash)) {
      try {
        result[field] = JSON.parse(value);
      } catch {
        result[field] = value;
      }
    }

    return result;
  }

  async hdel(key: StorageKey, ...fields: string[]): Promise<number> {
    return await this.client!.hDel(this.getKey(key), fields);
  }

  async hincrby(key: StorageKey, field: string, increment: number): Promise<number> {
    return await this.client!.hIncrBy(this.getKey(key), field, increment);
  }

  async expire(key: StorageKey, seconds: number): Promise<boolean> {
    return await this.client!.expire(this.getKey(key), seconds);
  }

  async ttl(key: StorageKey): Promise<number> {
    return await this.client!.ttl(this.getKey(key));
  }

  async transaction(operations: MultiCommand[]): Promise<any[]> {
    const multi = this.client!.multi();

    for (const op of operations) {
      const { method, args } = op;
      // Apply key prefix to the first argument (which is always the key)
      const prefixedArgs = [...args];
      if (prefixedArgs.length > 0 && typeof prefixedArgs[0] === 'string') {
        prefixedArgs[0] = this.getKey(prefixedArgs[0]);
      }
      (multi as any)[method](...prefixedArgs);
    }

    return await multi.exec() as any[];
  }
}
