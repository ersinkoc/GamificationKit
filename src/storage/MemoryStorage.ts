import { StorageInterface, ZRangeOptions, type StorageOptions } from './StorageInterface.js';
import type { StorageKey, StorageValue } from '../types/storage.js';

interface SortedSetMember {
  member: string;
  score: number;
}

interface MultiCommand {
  method: string;
  args: any[];
}

interface MultiObject {
  set(key: string, value: any): MultiObject;
  get(key: string): MultiObject;
  zadd(key: string, score: number, member: string): MultiObject;
  zrange(key: string, start: number, stop: number): MultiObject;
  exec(): Promise<any[]>;
}

export class MemoryStorage extends StorageInterface {
  private data: Map<string, any>;
  private sortedSets: Map<string, Map<string, number>>;
  private lists: Map<string, any[]>;
  private sets: Map<string, Set<any>>;
  private hashes: Map<string, Map<string, any>>;
  private expires: Map<string, number>;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(options: StorageOptions = {}) {
    super(options);
    this.data = new Map();
    this.sortedSets = new Map();
    this.lists = new Map();
    this.sets = new Map();
    this.hashes = new Map();
    this.expires = new Map();
    this.cleanupInterval = null;
  }

  async connect(): Promise<void> {
    this.connected = true;
    // Only set cleanup interval in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupInterval = setInterval(() => this.cleanupExpired(), 60000);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Clear all data on disconnect
    this.data.clear();
    this.sortedSets.clear();
    this.lists.clear();
    this.sets.clear();
    this.hashes.clear();
    this.expires.clear();
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, expireTime] of this.expires.entries()) {
      if (expireTime <= now) {
        this.data.delete(key);
        this.sortedSets.delete(key);
        this.lists.delete(key);
        this.sets.delete(key);
        this.hashes.delete(key);
        this.expires.delete(key);
      }
    }
  }

  // Method for testing - manually trigger cleanup
  async manualCleanup(): Promise<void> {
    this.cleanupExpired();
  }

  private isExpired(key: string): boolean {
    if (!this.expires.has(key)) return false;
    const expireTime = this.expires.get(key)!;
    if (expireTime <= Date.now()) {
      this.data.delete(key);
      this.sortedSets.delete(key);
      this.lists.delete(key);
      this.sets.delete(key);
      this.hashes.delete(key);
      this.expires.delete(key);
      return true;
    }
    return false;
  }

  async get(key: StorageKey): Promise<StorageValue> {
    if (this.isExpired(key)) return null;
    return this.data.has(key) ? this.data.get(key) : null;
  }

  async set(key: StorageKey, value: StorageValue, ttl?: number): Promise<void> {
    // Convert undefined to null for consistency
    this.data.set(key, value === undefined ? null : value);
    if (ttl) {
      this.expires.set(key, Date.now() + ttl * 1000);
    }
  }

  async setex(key: StorageKey, seconds: number, value: StorageValue): Promise<string> {
    // Convert undefined to null for consistency
    this.data.set(key, value === undefined ? null : value);
    if (seconds <= 0) {
      this.expires.set(key, 0); // Expire immediately
    } else {
      this.expires.set(key, Date.now() + seconds * 1000);
    }
    return 'OK';
  }

  async delete(key: StorageKey): Promise<boolean> {
    const existed = this.data.has(key) ||
                   this.sortedSets.has(key) ||
                   this.lists.has(key) ||
                   this.sets.has(key) ||
                   this.hashes.has(key);

    this.data.delete(key);
    this.sortedSets.delete(key);
    this.lists.delete(key);
    this.sets.delete(key);
    this.hashes.delete(key);
    this.expires.delete(key);

    return existed;
  }

  async exists(key: StorageKey): Promise<boolean> {
    if (this.isExpired(key)) return false;
    return this.data.has(key) ||
           this.sortedSets.has(key) ||
           this.lists.has(key) ||
           this.sets.has(key) ||
           this.hashes.has(key);
  }

  async increment(key: StorageKey, amount: number = 1): Promise<number> {
    const current = await this.get(key) || 0;
    const newValue = Number(current) + amount;

    // Fix BUG-015: Preserve TTL when incrementing
    const existingExpiry = this.expires.get(key);
    await this.set(key, newValue);
    if (existingExpiry) {
      this.expires.set(key, existingExpiry);
    }

    return newValue;
  }

  async decrement(key: StorageKey, amount: number = 1): Promise<number> {
    return this.increment(key, -amount);
  }

  async mget(keys: StorageKey[]): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    for (const key of keys) {
      results[key] = await this.get(key);
    }
    return results;
  }

  async mset(entries: Record<string, any> | Array<[StorageKey, StorageValue]>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value);
    }
    return;
  }

  async keys(pattern: string = '*'): Promise<StorageKey[]> {
    // Fix BUG-026: Escape regex special characters before converting wildcards
    // This prevents regex injection and ensures patterns like 'user.name' match literally
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
      .replace(/\*/g, '.*')  // Then convert wildcards
      .replace(/\?/g, '.');
    const regex = new RegExp('^' + escaped + '$');
    const allKeys = new Set([
      ...this.data.keys(),
      ...this.sortedSets.keys(),
      ...this.lists.keys(),
      ...this.sets.keys(),
      ...this.hashes.keys()
    ]);

    return Array.from(allKeys).filter(key => {
      if (this.isExpired(key)) return false;
      return regex.test(key);
    });
  }

  async clear(pattern: string = '*'): Promise<number> {
    const keys = await this.keys(pattern);
    for (const key of keys) {
      await this.delete(key);
    }
    return keys.length;
  }

  async zadd(key: StorageKey, scoreOrMembers: number | SortedSetMember[], member?: string): Promise<number> {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, new Map());
    }
    const sortedSet = this.sortedSets.get(key)!;
    let added = 0;

    if (Array.isArray(scoreOrMembers)) {
      // Multiple members
      for (const item of scoreOrMembers) {
        if (!sortedSet.has(item.member)) {
          added++;
        }
        sortedSet.set(item.member, item.score);
      }
    } else {
      // Single member
      if (!sortedSet.has(member!)) {
        added = 1;
      }
      sortedSet.set(member!, scoreOrMembers);
    }
    return added;
  }

  async zrem(key: StorageKey, member: any): Promise<number> {
    if (!this.sortedSets.has(key)) return 0;
    return this.sortedSets.get(key)!.delete(member) ? 1 : 0;
  }

  async zrange(key: StorageKey, start: number, stop: number, options: ZRangeOptions | boolean = false): Promise<any[]> {
    if (!this.sortedSets.has(key)) return [];

    // Handle both boolean and options object formats
    const withScores = typeof options === 'object' && options !== null ? options.withScores : options;

    const sortedSet = this.sortedSets.get(key)!;
    const entries = Array.from(sortedSet.entries())
      .sort((a, b) => a[1] - b[1]);

    const actualStart = start < 0 ? entries.length + start : start;
    const actualStop = stop < 0 ? entries.length + stop + 1 : stop + 1;

    const result = entries.slice(actualStart, actualStop);

    if (withScores) {
      return result.map(([member, score]) => ({ member, score }));
    }
    return result.map(([member]) => member);
  }

  async zrevrange(key: StorageKey, start: number, stop: number, options: ZRangeOptions | boolean = false): Promise<any[]> {
    if (!this.sortedSets.has(key)) return [];

    // Handle both boolean and options object formats
    const withScores = typeof options === 'object' && options !== null ? options.withScores : options;

    const sortedSet = this.sortedSets.get(key)!;
    const entries = Array.from(sortedSet.entries())
      .sort((a, b) => b[1] - a[1]);

    const actualStart = start < 0 ? entries.length + start : start;
    const actualStop = stop < 0 ? entries.length + stop + 1 : stop + 1;

    const result = entries.slice(actualStart, actualStop);

    if (withScores) {
      return result.map(([member, score]) => ({ member, score }));
    }
    return result.map(([member]) => member);
  }

  async zrank(key: StorageKey, member: any): Promise<number | null> {
    if (!this.sortedSets.has(key)) return null;

    const sortedSet = this.sortedSets.get(key)!;
    if (!sortedSet.has(member)) return null;

    const entries = Array.from(sortedSet.entries())
      .sort((a, b) => a[1] - b[1]);

    return entries.findIndex(([m]) => m === member);
  }

  async zrevrank(key: StorageKey, member: any): Promise<number | null> {
    if (!this.sortedSets.has(key)) return null;

    const sortedSet = this.sortedSets.get(key)!;
    if (!sortedSet.has(member)) return null;

    const entries = Array.from(sortedSet.entries())
      .sort((a, b) => b[1] - a[1]);

    return entries.findIndex(([m]) => m === member);
  }

  async zscore(key: StorageKey, member: any): Promise<number | null> {
    if (!this.sortedSets.has(key)) return null;
    const sortedSet = this.sortedSets.get(key)!;
    return sortedSet.has(member) ? sortedSet.get(member)! : null;
  }

  async zcount(key: StorageKey, min: string | number, max: string | number): Promise<number> {
    if (!this.sortedSets.has(key)) return 0;

    const sortedSet = this.sortedSets.get(key)!;
    let count = 0;

    // Handle special Redis values '-inf' and '+inf'
    const minValue = min === '-inf' ? -Infinity : Number(min);
    const maxValue = max === '+inf' ? Infinity : Number(max);

    for (const score of sortedSet.values()) {
      if (score >= minValue && score <= maxValue) {
        count++;
      }
    }

    return count;
  }

  async zcard(key: StorageKey): Promise<number> {
    if (!this.sortedSets.has(key)) return 0;
    return this.sortedSets.get(key)!.size;
  }

  async zincrby(key: StorageKey, increment: number, member: any): Promise<number> {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, new Map());
    }

    const sortedSet = this.sortedSets.get(key)!;
    const currentScore = sortedSet.get(member) || 0;
    const newScore = currentScore + increment;
    sortedSet.set(member, newScore);

    return newScore;
  }

  async lpush(key: StorageKey, ...values: any[]): Promise<number> {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key)!;
    // Fix BUG-009: Clone array before reversing to avoid mutating input
    list.unshift(...[...values].reverse());
    return list.length;
  }

  async rpush(key: StorageKey, ...values: any[]): Promise<number> {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key)!;
    // Push values to the right (end) of the list
    list.push(...values);
    return list.length;
  }

  async lpop(key: StorageKey): Promise<any> {
    if (!this.lists.has(key)) return null;
    // Fix BUG-010: Check undefined instead of falsy to preserve 0, false, ""
    const value = this.lists.get(key)!.shift();
    return value !== undefined ? value : null;
  }

  async rpop(key: StorageKey): Promise<any> {
    if (!this.lists.has(key)) return null;
    // Fix BUG-010: Check undefined instead of falsy to preserve 0, false, ""
    const value = this.lists.get(key)!.pop();
    return value !== undefined ? value : null;
  }

  async lrange(key: StorageKey, start: number, stop: number): Promise<any[]> {
    if (!this.lists.has(key)) return [];

    const list = this.lists.get(key)!;
    const actualStart = start < 0 ? list.length + start : start;
    const actualStop = stop < 0 ? list.length + stop + 1 : stop + 1;

    return list.slice(actualStart, actualStop);
  }

  async llen(key: StorageKey): Promise<number> {
    if (!this.lists.has(key)) return 0;
    return this.lists.get(key)!.length;
  }

  async lrem(key: StorageKey, count: number, value: any): Promise<number> {
    if (!this.lists.has(key)) return 0;

    const list = this.lists.get(key)!;
    let removed = 0;

    if (count === 0) {
      // Remove all occurrences
      const newList = list.filter(item => {
        if (item === value) {
          removed++;
          return false;
        }
        return true;
      });
      this.lists.set(key, newList);
    } else if (count > 0) {
      // Remove from head
      const newList = [];
      let toRemove = count;
      for (const item of list) {
        if (item === value && toRemove > 0) {
          removed++;
          toRemove--;
        } else {
          newList.push(item);
        }
      }
      this.lists.set(key, newList);
    } else {
      // Remove from tail
      const newList = [];
      let toRemove = Math.abs(count);
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] === value && toRemove > 0) {
          removed++;
          toRemove--;
        } else {
          newList.unshift(list[i]);
        }
      }
      this.lists.set(key, newList);
    }

    return removed;
  }

  async sadd(key: StorageKey, ...members: any[]): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }

    const set = this.sets.get(key)!;
    let added = 0;

    // Handle array of members
    const membersToAdd = members.length === 1 && Array.isArray(members[0]) ? members[0] : members;

    for (const member of membersToAdd) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }

    return added;
  }

  async srem(key: StorageKey, ...members: any[]): Promise<number> {
    if (!this.sets.has(key)) return 0;

    const set = this.sets.get(key)!;
    let removed = 0;

    for (const member of members) {
      if (set.delete(member)) {
        removed++;
      }
    }

    return removed;
  }

  async smembers(key: StorageKey): Promise<any[]> {
    if (!this.sets.has(key)) return [];
    return Array.from(this.sets.get(key)!);
  }

  async sismember(key: StorageKey, member: any): Promise<boolean> {
    if (!this.sets.has(key)) return false;
    return this.sets.get(key)!.has(member);
  }

  async scard(key: StorageKey): Promise<number> {
    if (!this.sets.has(key)) return 0;
    return this.sets.get(key)!.size;
  }

  async hset(key: StorageKey, field: string, value: any): Promise<void> {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    this.hashes.get(key)!.set(field, value);
  }

  async hget(key: StorageKey, field: string): Promise<any> {
    if (!this.hashes.has(key)) return null;
    const hash = this.hashes.get(key)!;
    return hash.has(field) ? hash.get(field) : null;
  }

  async hgetall(key: StorageKey): Promise<Record<string, any>> {
    if (!this.hashes.has(key)) return {};

    const hash = this.hashes.get(key)!;
    const result: Record<string, any> = {};

    for (const [field, value] of hash) {
      result[field] = value;
    }

    return result;
  }

  async hmset(key: StorageKey, fields: Record<string, any>): Promise<string> {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    const hash = this.hashes.get(key)!;

    for (const [field, value] of Object.entries(fields)) {
      hash.set(field, value);
    }
    return 'OK';
  }

  async hmget(key: StorageKey, fields: string[]): Promise<any[]> {
    if (!this.hashes.has(key)) {
      return fields.map(() => null);
    }

    const hash = this.hashes.get(key)!;
    return fields.map(field => hash.get(field) || null);
  }

  async hexists(key: StorageKey, field: string): Promise<boolean> {
    if (!this.hashes.has(key)) return false;
    return this.hashes.get(key)!.has(field);
  }

  async hdel(key: StorageKey, ...fields: string[]): Promise<number> {
    if (!this.hashes.has(key)) return 0;

    const hash = this.hashes.get(key)!;
    let deleted = 0;

    for (const field of fields) {
      if (hash.delete(field)) {
        deleted++;
      }
    }

    return deleted;
  }

  async hincrby(key: StorageKey, field: string, increment: number): Promise<number> {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }

    const hash = this.hashes.get(key)!;
    const current = hash.get(field);

    if (current !== null && current !== undefined && isNaN(Number(current))) {
      throw new Error('Hash field is not a number');
    }

    const currentNum = Number(current || 0);
    const newValue = currentNum + increment;
    hash.set(field, newValue);

    return newValue;
  }

  async expire(key: StorageKey, seconds: number): Promise<boolean> {
    if (await this.exists(key)) {
      this.expires.set(key, Date.now() + seconds * 1000);
      return true;
    }
    return false;
  }

  async ttl(key: StorageKey): Promise<number> {
    if (!this.expires.has(key)) return -1;

    const expireTime = this.expires.get(key)!;
    const ttl = Math.floor((expireTime - Date.now()) / 1000);

    return ttl > 0 ? ttl : -2;
  }

  async transaction(operations: MultiCommand[]): Promise<any[]> {
    const results: any[] = [];

    try {
      for (const op of operations) {
        const { method, args } = op;
        const result = await (this as any)[method](...args);
        results.push(result);
      }
      return results;
    } catch (error) {
      throw error;
    }
  }

  multi(): MultiObject {
    const commands: MultiCommand[] = [];
    const self = this;

    const multiObject: MultiObject = {
      set: (key: string, value: any) => {
        commands.push({ method: 'set', args: [key, value] });
        return multiObject;
      },
      get: (key: string) => {
        commands.push({ method: 'get', args: [key] });
        return multiObject;
      },
      zadd: (key: string, score: number, member: string) => {
        commands.push({ method: 'zadd', args: [key, score, member] });
        return multiObject;
      },
      zrange: (key: string, start: number, stop: number) => {
        commands.push({ method: 'zrange', args: [key, start, stop] });
        return multiObject;
      },
      async exec() {
        const results: any[] = [];
        for (const cmd of commands) {
          const result = await (self as any)[cmd.method](...cmd.args);
          results.push(result);
        }
        return results;
      }
    };

    return multiObject;
  }
}
