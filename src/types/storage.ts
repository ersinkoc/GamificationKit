/**
 * Storage interface and related types for GamificationKit
 */

import type { UserId, Metadata, PaginationParams, PaginatedResponse } from './common.js';

// Storage key types
export type StorageKey = string;
export type StorageValue = any;

// Storage operation options
export interface StorageSetOptions {
  ttl?: number;
  nx?: boolean; // Set if not exists
  xx?: boolean; // Set if exists
  ex?: number; // Expire time in seconds
  px?: number; // Expire time in milliseconds
}

export interface StorageGetOptions {
  default?: any;
  parse?: boolean;
}

export interface StorageDeleteOptions {
  pattern?: boolean;
}

export interface StorageListOptions extends PaginationParams {
  pattern?: string;
  prefix?: string;
  cursor?: string;
}

// Storage transaction
export interface StorageTransaction {
  operations: StorageOperation[];
  execute(): Promise<any[]>;
  rollback(): Promise<void>;
}

export interface StorageOperation {
  type: 'get' | 'set' | 'delete' | 'increment' | 'decrement';
  key: StorageKey;
  value?: any;
  options?: any;
}

// Storage statistics
export interface StorageStats {
  keys: number;
  size?: number;
  memory?: number;
  hits?: number;
  misses?: number;
  uptime?: number;
  connections?: number;
  version?: string;
}

// Storage health
export interface StorageHealth {
  connected: boolean;
  latency?: number;
  error?: string;
  details?: any;
}

// Main storage interface
export interface IStorageAdapter {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Basic operations
  get(key: StorageKey, options?: StorageGetOptions): Promise<any>;
  set(key: StorageKey, value: StorageValue, options?: StorageSetOptions): Promise<void>;
  delete(key: StorageKey, options?: StorageDeleteOptions): Promise<boolean>;
  exists(key: StorageKey): Promise<boolean>;

  // Batch operations
  mget(keys: StorageKey[]): Promise<any[]>;
  mset(entries: Array<[StorageKey, StorageValue]>, options?: StorageSetOptions): Promise<void>;
  mdelete(keys: StorageKey[]): Promise<number>;

  // List operations
  list(options?: StorageListOptions): Promise<StorageKey[]>;
  keys(pattern?: string): Promise<StorageKey[]>;
  clear(pattern?: string): Promise<number>;

  // Counter operations
  increment(key: StorageKey, amount?: number): Promise<number>;
  decrement(key: StorageKey, amount?: number): Promise<number>;

  // Expiration
  expire(key: StorageKey, ttl: number): Promise<boolean>;
  ttl(key: StorageKey): Promise<number>;
  persist(key: StorageKey): Promise<boolean>;

  // Hash operations (for structured data)
  hget(key: StorageKey, field: string): Promise<any>;
  hset(key: StorageKey, field: string, value: any): Promise<void>;
  hmget(key: StorageKey, fields: string[]): Promise<any[]>;
  hmset(key: StorageKey, data: Record<string, any>): Promise<void>;
  hdel(key: StorageKey, fields: string | string[]): Promise<number>;
  hgetall(key: StorageKey): Promise<Record<string, any>>;
  hkeys(key: StorageKey): Promise<string[]>;
  hvals(key: StorageKey): Promise<any[]>;
  hexists(key: StorageKey, field: string): Promise<boolean>;
  hlen(key: StorageKey): Promise<number>;

  // Set operations
  sadd(key: StorageKey, members: any | any[]): Promise<number>;
  srem(key: StorageKey, members: any | any[]): Promise<number>;
  smembers(key: StorageKey): Promise<any[]>;
  sismember(key: StorageKey, member: any): Promise<boolean>;
  scard(key: StorageKey): Promise<number>;

  // Sorted set operations (for leaderboards)
  zadd(key: StorageKey, score: number, member: any): Promise<number>;
  zrem(key: StorageKey, member: any): Promise<number>;
  zscore(key: StorageKey, member: any): Promise<number | null>;
  zrank(key: StorageKey, member: any): Promise<number | null>;
  zrevrank(key: StorageKey, member: any): Promise<number | null>;
  zrange(key: StorageKey, start: number, stop: number, withScores?: boolean): Promise<any[]>;
  zrevrange(key: StorageKey, start: number, stop: number, withScores?: boolean): Promise<any[]>;
  zcard(key: StorageKey): Promise<number>;
  zincrby(key: StorageKey, increment: number, member: any): Promise<number>;

  // List operations
  lpush(key: StorageKey, values: any | any[]): Promise<number>;
  rpush(key: StorageKey, values: any | any[]): Promise<number>;
  lpop(key: StorageKey): Promise<any>;
  rpop(key: StorageKey): Promise<any>;
  lrange(key: StorageKey, start: number, stop: number): Promise<any[]>;
  llen(key: StorageKey): Promise<number>;
  ltrim(key: StorageKey, start: number, stop: number): Promise<void>;

  // Transaction support
  multi(): StorageTransaction | null;

  // Utility
  ping(): Promise<boolean>;
  flushAll(): Promise<void>;
  getStats(): Promise<StorageStats>;
  getHealth(): Promise<StorageHealth>;
}

// User data storage types
export interface UserData {
  userId: UserId;
  data: any;
  metadata?: Metadata;
  createdAt: string;
  updatedAt: string;
}

export interface UserModuleData {
  userId: UserId;
  module: string;
  data: any;
  metadata?: Metadata;
  createdAt: string;
  updatedAt: string;
}

// Storage query builder
export interface StorageQuery {
  collection?: string;
  filter?: Record<string, any>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  projection?: Record<string, 0 | 1>;
}

export interface StorageQueryResult<T = any> {
  data: T[];
  total: number;
  hasMore: boolean;
}

// Storage migration
export interface StorageMigration {
  version: number;
  name: string;
  up: (storage: IStorageAdapter) => Promise<void>;
  down: (storage: IStorageAdapter) => Promise<void>;
}

// Storage event types
export interface StorageEvent {
  type: 'connected' | 'disconnected' | 'error' | 'reconnecting';
  timestamp: string;
  details?: any;
}

export type StorageEventHandler = (event: StorageEvent) => void | Promise<void>;

// Storage configuration per adapter type
export interface RedisStorageConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  prefix?: string;
  retryStrategy?: (times: number) => number | null;
  reconnectOnError?: (err: Error) => boolean;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  enableOfflineQueue?: boolean;
  lazyConnect?: boolean;
  family?: 4 | 6;
  connectTimeout?: number;
  keepAlive?: number;
  sentinels?: Array<{ host: string; port: number }>;
  name?: string;
}

export interface MongoStorageConfig {
  url: string;
  database: string;
  collection?: string;
  options?: {
    useNewUrlParser?: boolean;
    useUnifiedTopology?: boolean;
    maxPoolSize?: number;
    minPoolSize?: number;
    connectTimeoutMS?: number;
    socketTimeoutMS?: number;
    serverSelectionTimeoutMS?: number;
    retryWrites?: boolean;
    w?: number | 'majority';
    journal?: boolean;
  };
}

export interface PostgresStorageConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  schema?: string;
  tableName?: string;
}

export interface MemoryStorageConfig {
  maxKeys?: number;
  ttl?: number;
  checkPeriod?: number;
}
