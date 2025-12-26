import type { StorageKey, StorageValue } from '../types/storage.js';

export interface StorageOptions {
  [key: string]: any;
}

export interface ZRangeOptions {
  withScores?: boolean;
  reverse?: boolean;
}

export class StorageInterface {
  protected options: StorageOptions;
  protected connected: boolean;

  constructor(options: StorageOptions = {}) {
    this.options = options;
    this.connected = false;
  }

  async connect(): Promise<void> {
    throw new Error('connect() must be implemented by storage adapter');
  }

  async disconnect(): Promise<void> {
    throw new Error('disconnect() must be implemented by storage adapter');
  }

  async get(_key: StorageKey): Promise<StorageValue> {
    throw new Error('get() must be implemented by storage adapter');
  }

  async set(_key: StorageKey, _value: StorageValue, _ttl?: number): Promise<void> {
    throw new Error('set() must be implemented by storage adapter');
  }

  async delete(_key: StorageKey): Promise<boolean> {
    throw new Error('delete() must be implemented by storage adapter');
  }

  async exists(_key: StorageKey): Promise<boolean> {
    throw new Error('exists() must be implemented by storage adapter');
  }

  async increment(_key: StorageKey, _amount: number = 1): Promise<number> {
    throw new Error('increment() must be implemented by storage adapter');
  }

  async decrement(_key: StorageKey, _amount: number = 1): Promise<number> {
    throw new Error('decrement() must be implemented by storage adapter');
  }

  async mget(_keys: StorageKey[]): Promise<Record<string, any>> {
    throw new Error('mget() must be implemented by storage adapter');
  }

  async mset(_entries: Record<string, any> | Array<[StorageKey, StorageValue]>): Promise<void> {
    throw new Error('mset() must be implemented by storage adapter');
  }

  async keys(_pattern?: string): Promise<StorageKey[]> {
    throw new Error('keys() must be implemented by storage adapter');
  }

  async clear(_pattern?: string): Promise<number> {
    throw new Error('clear() must be implemented by storage adapter');
  }

  async zadd(_key: StorageKey, _score: number, _member: any): Promise<number> {
    throw new Error('zadd() must be implemented by storage adapter');
  }

  async zrem(_key: StorageKey, _member: any): Promise<number> {
    throw new Error('zrem() must be implemented by storage adapter');
  }

  async zrange(_key: StorageKey, _start: number, _stop: number, _options: ZRangeOptions = {}): Promise<any[]> {
    throw new Error('zrange() must be implemented by storage adapter');
  }

  async zrevrange(_key: StorageKey, _start: number, _stop: number, _options: ZRangeOptions = {}): Promise<any[]> {
    throw new Error('zrevrange() must be implemented by storage adapter');
  }

  async zrank(_key: StorageKey, _member: any): Promise<number | null> {
    throw new Error('zrank() must be implemented by storage adapter');
  }

  async zrevrank(_key: StorageKey, _member: any): Promise<number | null> {
    throw new Error('zrevrank() must be implemented by storage adapter');
  }

  async zscore(_key: StorageKey, _member: any): Promise<number | null> {
    throw new Error('zscore() must be implemented by storage adapter');
  }

  async zcount(_key: StorageKey, _min: string | number, _max: string | number): Promise<number> {
    throw new Error('zcount() must be implemented by storage adapter');
  }

  async zincrby(_key: StorageKey, _increment: number, _member: any): Promise<number> {
    throw new Error('zincrby() must be implemented by storage adapter');
  }

  async lpush(_key: StorageKey, ..._values: any[]): Promise<number> {
    throw new Error('lpush() must be implemented by storage adapter');
  }

  async rpush(_key: StorageKey, ..._values: any[]): Promise<number> {
    throw new Error('rpush() must be implemented by storage adapter');
  }

  async lpop(_key: StorageKey): Promise<any> {
    throw new Error('lpop() must be implemented by storage adapter');
  }

  async rpop(_key: StorageKey): Promise<any> {
    throw new Error('rpop() must be implemented by storage adapter');
  }

  async lrange(_key: StorageKey, _start: number, _stop: number): Promise<any[]> {
    throw new Error('lrange() must be implemented by storage adapter');
  }

  async llen(_key: StorageKey): Promise<number> {
    throw new Error('llen() must be implemented by storage adapter');
  }

  async sadd(_key: StorageKey, ..._members: any[]): Promise<number> {
    throw new Error('sadd() must be implemented by storage adapter');
  }

  async srem(_key: StorageKey, ..._members: any[]): Promise<number> {
    throw new Error('srem() must be implemented by storage adapter');
  }

  async smembers(_key: StorageKey): Promise<any[]> {
    throw new Error('smembers() must be implemented by storage adapter');
  }

  async sismember(_key: StorageKey, _member: any): Promise<boolean> {
    throw new Error('sismember() must be implemented by storage adapter');
  }

  async scard(_key: StorageKey): Promise<number> {
    throw new Error('scard() must be implemented by storage adapter');
  }

  async hset(_key: StorageKey, _field: string, _value: any): Promise<void> {
    throw new Error('hset() must be implemented by storage adapter');
  }

  async hget(_key: StorageKey, _field: string): Promise<any> {
    throw new Error('hget() must be implemented by storage adapter');
  }

  async hgetall(_key: StorageKey): Promise<Record<string, any>> {
    throw new Error('hgetall() must be implemented by storage adapter');
  }

  async hdel(_key: StorageKey, ..._fields: string[]): Promise<number> {
    throw new Error('hdel() must be implemented by storage adapter');
  }

  async hincrby(_key: StorageKey, _field: string, _increment: number): Promise<number> {
    throw new Error('hincrby() must be implemented by storage adapter');
  }

  async expire(_key: StorageKey, _seconds: number): Promise<boolean> {
    throw new Error('expire() must be implemented by storage adapter');
  }

  async ttl(_key: StorageKey): Promise<number> {
    throw new Error('ttl() must be implemented by storage adapter');
  }

  async transaction(_operations: any[]): Promise<any[]> {
    throw new Error('transaction() must be implemented by storage adapter');
  }

  isConnected(): boolean {
    return this.connected;
  }
}
