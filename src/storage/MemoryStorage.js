import { StorageInterface } from './StorageInterface.js';

export class MemoryStorage extends StorageInterface {
  constructor(options = {}) {
    super(options);
    this.data = new Map();
    this.sortedSets = new Map();
    this.lists = new Map();
    this.sets = new Map();
    this.hashes = new Map();
    this.expires = new Map();
    this.cleanupInterval = null;
  }

  async connect() {
    this.connected = true;
    // Only set cleanup interval in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupInterval = setInterval(() => this.cleanupExpired(), 60000);
    }
    return true;
  }

  async disconnect() {
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
    return true;
  }

  cleanupExpired() {
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
  async manualCleanup() {
    this.cleanupExpired();
  }

  isExpired(key) {
    if (!this.expires.has(key)) return false;
    const expireTime = this.expires.get(key);
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

  async get(key) {
    if (this.isExpired(key)) return null;
    return this.data.has(key) ? this.data.get(key) : null;
  }

  async set(key, value, ttl) {
    // Convert undefined to null for consistency
    this.data.set(key, value === undefined ? null : value);
    if (ttl) {
      this.expires.set(key, Date.now() + ttl * 1000);
    }
    return 'OK';
  }

  async setex(key, seconds, value) {
    // Convert undefined to null for consistency
    this.data.set(key, value === undefined ? null : value);
    if (seconds <= 0) {
      this.expires.set(key, 0); // Expire immediately
    } else {
      this.expires.set(key, Date.now() + seconds * 1000);
    }
    return 'OK';
  }

  async delete(key) {
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

  async exists(key) {
    if (this.isExpired(key)) return false;
    return this.data.has(key) || 
           this.sortedSets.has(key) || 
           this.lists.has(key) || 
           this.sets.has(key) ||
           this.hashes.has(key);
  }

  async increment(key, amount = 1) {
    const current = await this.get(key) || 0;
    const newValue = Number(current) + amount;
    await this.set(key, newValue);
    return newValue;
  }

  async decrement(key, amount = 1) {
    return this.increment(key, -amount);
  }

  async mget(keys) {
    const results = {};
    for (const key of keys) {
      results[key] = await this.get(key);
    }
    return results;
  }

  async mset(entries) {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value);
    }
    return true;
  }

  async keys(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
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

  async clear(pattern) {
    const keys = await this.keys(pattern);
    for (const key of keys) {
      await this.delete(key);
    }
    return keys.length;
  }

  async zadd(key, scoreOrMembers, member) {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, new Map());
    }
    const sortedSet = this.sortedSets.get(key);
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
      if (!sortedSet.has(member)) {
        added = 1;
      }
      sortedSet.set(member, scoreOrMembers);
    }
    return added;
  }

  async zrem(key, member) {
    if (!this.sortedSets.has(key)) return 0;
    return this.sortedSets.get(key).delete(member) ? 1 : 0;
  }

  async zrange(key, start, stop, withScores = false) {
    if (!this.sortedSets.has(key)) return [];
    
    const sortedSet = this.sortedSets.get(key);
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

  async zrevrange(key, start, stop, withScores = false) {
    if (!this.sortedSets.has(key)) return [];
    
    const sortedSet = this.sortedSets.get(key);
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

  async zrank(key, member) {
    if (!this.sortedSets.has(key)) return null;
    
    const sortedSet = this.sortedSets.get(key);
    if (!sortedSet.has(member)) return null;
    
    const entries = Array.from(sortedSet.entries())
      .sort((a, b) => a[1] - b[1]);
    
    return entries.findIndex(([m]) => m === member);
  }

  async zrevrank(key, member) {
    if (!this.sortedSets.has(key)) return null;
    
    const sortedSet = this.sortedSets.get(key);
    if (!sortedSet.has(member)) return null;
    
    const entries = Array.from(sortedSet.entries())
      .sort((a, b) => b[1] - a[1]);
    
    return entries.findIndex(([m]) => m === member);
  }

  async zscore(key, member) {
    if (!this.sortedSets.has(key)) return null;
    const sortedSet = this.sortedSets.get(key);
    return sortedSet.has(member) ? sortedSet.get(member) : null;
  }

  async zcount(key, min, max) {
    if (!this.sortedSets.has(key)) return 0;
    
    const sortedSet = this.sortedSets.get(key);
    let count = 0;
    
    for (const score of sortedSet.values()) {
      if (score >= min && score <= max) {
        count++;
      }
    }
    
    return count;
  }

  async zcard(key) {
    if (!this.sortedSets.has(key)) return 0;
    return this.sortedSets.get(key).size;
  }

  async zincrby(key, increment, member) {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, new Map());
    }
    
    const sortedSet = this.sortedSets.get(key);
    const currentScore = sortedSet.get(member) || 0;
    const newScore = currentScore + increment;
    sortedSet.set(member, newScore);
    
    return newScore;
  }

  async lpush(key, ...values) {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key);
    // Push values to the left (beginning) of the list
    list.unshift(...values.reverse());
    return list.length;
  }

  async rpush(key, ...values) {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key);
    // Push values to the right (end) of the list
    list.push(...values);
    return list.length;
  }

  async lpop(key) {
    if (!this.lists.has(key)) return null;
    return this.lists.get(key).shift() || null;
  }

  async rpop(key) {
    if (!this.lists.has(key)) return null;
    return this.lists.get(key).pop() || null;
  }

  async lrange(key, start, stop) {
    if (!this.lists.has(key)) return [];
    
    const list = this.lists.get(key);
    const actualStart = start < 0 ? list.length + start : start;
    const actualStop = stop < 0 ? list.length + stop + 1 : stop + 1;
    
    return list.slice(actualStart, actualStop);
  }

  async llen(key) {
    if (!this.lists.has(key)) return 0;
    return this.lists.get(key).length;
  }

  async lrem(key, count, value) {
    if (!this.lists.has(key)) return 0;
    
    const list = this.lists.get(key);
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

  async sadd(key, ...members) {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    
    const set = this.sets.get(key);
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

  async srem(key, ...members) {
    if (!this.sets.has(key)) return 0;
    
    const set = this.sets.get(key);
    let removed = 0;
    
    for (const member of members) {
      if (set.delete(member)) {
        removed++;
      }
    }
    
    return removed;
  }

  async smembers(key) {
    if (!this.sets.has(key)) return [];
    return Array.from(this.sets.get(key));
  }

  async sismember(key, member) {
    if (!this.sets.has(key)) return false;
    return this.sets.get(key).has(member);
  }

  async scard(key) {
    if (!this.sets.has(key)) return 0;
    return this.sets.get(key).size;
  }

  async hset(key, field, value) {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    this.hashes.get(key).set(field, value);
    return true;
  }

  async hget(key, field) {
    if (!this.hashes.has(key)) return null;
    const hash = this.hashes.get(key);
    return hash.has(field) ? hash.get(field) : null;
  }

  async hgetall(key) {
    if (!this.hashes.has(key)) return {};
    
    const hash = this.hashes.get(key);
    const result = {};
    
    for (const [field, value] of hash) {
      result[field] = value;
    }
    
    return result;
  }

  async hmset(key, fields) {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    const hash = this.hashes.get(key);
    
    for (const [field, value] of Object.entries(fields)) {
      hash.set(field, value);
    }
    return 'OK';
  }

  async hmget(key, fields) {
    if (!this.hashes.has(key)) {
      return fields.map(() => null);
    }
    
    const hash = this.hashes.get(key);
    return fields.map(field => hash.get(field) || null);
  }

  async hexists(key, field) {
    if (!this.hashes.has(key)) return false;
    return this.hashes.get(key).has(field);
  }

  async hdel(key, ...fields) {
    if (!this.hashes.has(key)) return 0;
    
    const hash = this.hashes.get(key);
    let deleted = 0;
    
    for (const field of fields) {
      if (hash.delete(field)) {
        deleted++;
      }
    }
    
    return deleted;
  }

  async hincrby(key, field, increment) {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    
    const hash = this.hashes.get(key);
    const current = hash.get(field);
    
    if (current !== null && current !== undefined && isNaN(Number(current))) {
      throw new Error('Hash field is not a number');
    }
    
    const currentNum = Number(current || 0);
    const newValue = currentNum + increment;
    hash.set(field, newValue);
    
    return newValue;
  }

  async expire(key, seconds) {
    if (await this.exists(key)) {
      this.expires.set(key, Date.now() + seconds * 1000);
      return true;
    }
    return false;
  }

  async ttl(key) {
    if (!this.expires.has(key)) return -1;
    
    const expireTime = this.expires.get(key);
    const ttl = Math.floor((expireTime - Date.now()) / 1000);
    
    return ttl > 0 ? ttl : -2;
  }

  async transaction(operations) {
    const results = [];
    
    try {
      for (const op of operations) {
        const { method, args } = op;
        const result = await this[method](...args);
        results.push(result);
      }
      return results;
    } catch (error) {
      throw error;
    }
  }

  multi() {
    const commands = [];
    const self = this;
    
    const multiObject = {
      set: (key, value) => {
        commands.push({ method: 'set', args: [key, value] });
        return multiObject;
      },
      get: (key) => {
        commands.push({ method: 'get', args: [key] });
        return multiObject;
      },
      zadd: (key, score, member) => {
        commands.push({ method: 'zadd', args: [key, score, member] });
        return multiObject;
      },
      zrange: (key, start, stop) => {
        commands.push({ method: 'zrange', args: [key, start, stop] });
        return multiObject;
      },
      async exec() {
        const results = [];
        for (const cmd of commands) {
          const result = await self[cmd.method](...cmd.args);
          results.push(result);
        }
        return results;
      }
    };
    
    return multiObject;
  }
}