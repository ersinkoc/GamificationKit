/**
 * Common types and utility types for GamificationKit
 */

// Log Levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Generic callback types
export type Callback<T = void> = (error?: Error | null, result?: T) => void;
export type AsyncCallback<T = void> = (error?: Error | null, result?: T) => Promise<void>;

// Callback event handler (different from event system EventHandler)
export type CallbackHandler<T = any> = (data: T) => void | Promise<void>;
export type AsyncHandler<T = any> = (data: T) => Promise<void>;

// Condition operators
export type ConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not_in' | 'contains' | 'not_contains' | 'exists' | 'not_exists';

// Time periods
export type TimePeriod = 'daily' | 'weekly' | 'monthly' | 'all-time';

// Badge rarity levels
export type BadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

// Quest status
export type QuestStatus = 'available' | 'active' | 'completed' | 'failed' | 'expired';

// Streak status
export type StreakStatus = 'active' | 'broken' | 'frozen';

// XP formulas
export type XPFormula = 'linear' | 'exponential' | 'custom';

// Generic metadata object
export interface Metadata {
  [key: string]: any;
}

// Timestamp types
export interface TimestampData {
  createdAt: string;
  updatedAt?: string;
}

// User ID type (always string)
export type UserId = string;

// Generic error response
export interface ErrorResponse {
  error: string;
  message: string;
  code?: string | number;
  details?: any;
}

// Success response
export interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

// Generic response union
export type GenericResponse<T = any> = SuccessResponse<T> | ErrorResponse;

// Pagination
export interface PaginationParams {
  limit?: number;
  offset?: number;
  page?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Filter and sort options
export interface FilterOptions {
  field: string;
  operator: ConditionOperator;
  value: any;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

// Reward types
export interface Reward {
  points?: number;
  xp?: number;
  badges?: string[];
  items?: string[];
  currency?: {
    [currencyType: string]: number;
  };
  [key: string]: any;
}

// Transaction types
export interface Transaction {
  id: string;
  userId: UserId;
  type: string;
  amount: number;
  reason?: string;
  metadata?: Metadata;
  timestamp: string;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
  }[Keys];

export type RequireOnlyOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>
  }[Keys];

// Async function type
export type AsyncFunction<T = any, R = any> = (arg: T) => Promise<R>;

// Function with optional async
export type MaybeAsyncFunction<T = any, R = any> = (arg: T) => R | Promise<R>;

// Generic class constructor
export type Constructor<T = any> = new (...args: any[]) => T;

// Generic class type
export type Class<T = any> = Constructor<T>;

// Tuple utility
export type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never;
type _TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : _TupleOf<T, N, [T, ...R]>;

// JSON value types
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
export interface JSONObject {
  [key: string]: JSONValue;
}
export interface JSONArray extends Array<JSONValue> {}

// Type guard utilities
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

export function isPromise<T = any>(value: unknown): value is Promise<T> {
  return value instanceof Promise || (isObject(value) && isFunction((value as any).then));
}
