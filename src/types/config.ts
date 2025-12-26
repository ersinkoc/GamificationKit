/**
 * Configuration types for GamificationKit
 */

import type { LogLevel, UserId, Metadata } from './common.js';

// Storage configuration
export interface StorageOptions {
  type: 'memory' | 'redis' | 'mongodb' | 'postgres';
  host?: string;
  port?: number;
  database?: string;
  url?: string;
  password?: string;
  user?: string;
  username?: string;
  db?: number;
  prefix?: string;
  ttl?: number;
  poolSize?: number;
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
  retryAttempts?: number;
  retryDelay?: number;
  options?: any;
}

// Rate limiting configuration
export interface RateLimitConfig {
  windowMs?: number;
  max?: number;
  message?: string;
  statusCode?: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

// API configuration
export interface APIConfig {
  enabled?: boolean;
  port?: number;
  host?: string;
  prefix?: string;
  cors?: boolean | {
    origin?: string | string[] | ((origin: string) => boolean);
    credentials?: boolean;
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    maxAge?: number;
  };
  rateLimit?: RateLimitConfig;
  compression?: boolean;
  bodyParser?: {
    json?: boolean | {
      limit?: string;
      strict?: boolean;
    };
    urlencoded?: boolean | {
      extended?: boolean;
      limit?: string;
    };
  };
  helmet?: boolean | any;
  trustProxy?: boolean | number | string;
}

// WebSocket configuration
export interface WebSocketConfig {
  enabled?: boolean;
  port?: number;
  host?: string;
  path?: string;
  authHandler?: (userId: UserId, req: any) => boolean | Promise<boolean>;
  heartbeatInterval?: number;
  clientTimeout?: number;
  maxConnections?: number;
  compression?: boolean;
  perMessageDeflate?: boolean | {
    zlibDeflateOptions?: any;
    zlibInflateOptions?: any;
    clientNoContextTakeover?: boolean;
    serverNoContextTakeover?: boolean;
    serverMaxWindowBits?: number;
    concurrencyLimit?: number;
    threshold?: number;
  };
}

// Webhook configuration
export interface WebhookConfig {
  enabled?: boolean;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  retryBackoff?: 'linear' | 'exponential';
  maxRetryDelay?: number;
  verifySSL?: boolean;
  headers?: Record<string, string>;
  events?: string[];
}

// Metrics configuration
export interface MetricsConfig {
  enabled?: boolean;
  collectInterval?: number;
  retention?: number;
  detailed?: boolean;
  includeSystem?: boolean;
  customMetrics?: Record<string, () => number | Promise<number>>;
}

// Logger configuration
export interface LoggerConfig {
  level?: LogLevel;
  enabled?: boolean;
  pretty?: boolean;
  colorize?: boolean;
  timestamp?: boolean;
  context?: string;
  transports?: LogTransport[];
}

export interface LogTransport {
  type: 'console' | 'file' | 'custom';
  level?: LogLevel;
  format?: string;
  filename?: string;
  maxSize?: number;
  maxFiles?: number;
  handler?: (level: LogLevel, message: string, meta?: any) => void;
}

// Security configuration
export interface SecurityConfig {
  apiKey?: string | null;
  apiKeyHeader?: string;
  encryption?: boolean;
  encryptionKey?: string;
  encryptionAlgorithm?: string;
  jwtSecret?: string;
  jwtExpiration?: string | number;
  hashSalt?: number | string;
  csrfProtection?: boolean;
  rateLimitByIP?: boolean;
  rateLimitByUser?: boolean;
  allowedOrigins?: string[];
  trustedProxies?: string[];
}

// Health check configuration
export interface HealthCheckConfig {
  enabled?: boolean;
  interval?: number;
  timeout?: number;
  checks?: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
  critical?: boolean;
  timeout?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  message?: string;
  details?: any;
  timestamp?: string;
}

// Secret management configuration
export interface SecretManagerConfig {
  provider?: 'env' | 'aws' | 'azure' | 'gcp' | 'vault' | 'custom';
  cache?: boolean;
  cacheTTL?: number;
  refreshInterval?: number;
  options?: any;
}

// Main GamificationKit configuration
export interface GamificationKitConfig {
  appName?: string;
  version?: string;
  storage?: StorageOptions;
  api?: APIConfig;
  websocket?: WebSocketConfig;
  webhooks?: WebhookConfig;
  metrics?: MetricsConfig;
  logger?: LoggerConfig;
  security?: SecurityConfig;
  healthCheck?: HealthCheckConfig;
  secretManager?: SecretManagerConfig;
  gracefulShutdown?: {
    enabled?: boolean;
    timeout?: number;
    signals?: NodeJS.Signals[];
  };
  modules?: ModuleConfig;
  plugins?: Plugin[];
  middleware?: MiddlewareConfig[];
  debug?: boolean;
  env?: string;
}

// Module configuration
export interface ModuleConfig {
  [moduleName: string]: any;
}

// Plugin interface
export interface Plugin {
  name: string;
  version?: string;
  install: (kit: any) => void | Promise<void>;
  uninstall?: (kit: any) => void | Promise<void>;
}

// Middleware configuration
export interface MiddlewareConfig {
  name: string;
  handler: (req: any, res: any, next: any) => void | Promise<void>;
  priority?: number;
  routes?: string[];
}

// Module-specific configurations
export interface PointsModuleConfig {
  dailyLimit?: number;
  weeklyLimit?: number;
  monthlyLimit?: number;
  decayEnabled?: boolean;
  decayDays?: number;
  decayPercentage?: number;
  multipliers?: {
    [key: string]: number | {
      value: number;
      condition?: (userId: UserId) => boolean | Promise<boolean>;
    };
  };
  negativePointsAllowed?: boolean;
  minPoints?: number;
  maxPoints?: number;
  roundingPrecision?: number;
}

export interface BadgeModuleConfig {
  autoAward?: boolean;
  revocable?: boolean;
  trackProgress?: boolean;
  categories?: string[];
}

export interface LevelModuleConfig {
  maxLevel?: number;
  xpFormula?: 'linear' | 'exponential' | 'custom';
  baseXP?: number;
  exponent?: number;
  customFormula?: (level: number) => number;
  prestigeEnabled?: boolean;
  prestigeRequirement?: number;
  prestigeRewards?: any;
  levelRewards?: {
    [level: number]: {
      points?: number;
      badges?: string[];
      [key: string]: any;
    };
  };
}

export interface StreakModuleConfig {
  types?: {
    [type: string]: {
      window: number;
      grace?: number;
      freezeEnabled?: boolean;
      maxFreezes?: number;
      rewards?: {
        [milestone: number]: {
          points?: number;
          badges?: string[];
          [key: string]: any;
        };
      };
    };
  };
  globalFreezeItems?: number;
  milestones?: number[];
  resetOnMiss?: boolean;
  trackHistory?: boolean;
}

export interface QuestModuleConfig {
  maxActiveQuests?: number;
  dailyQuestLimit?: number;
  weeklyQuestLimit?: number;
  autoAssignDaily?: boolean;
  autoAssignWeekly?: boolean;
  questExpiration?: number;
  allowAbandon?: boolean;
}

export interface LeaderboardModuleConfig {
  types?: string[];
  updateInterval?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  trackHistory?: boolean;
  seasonalReset?: boolean;
  resetInterval?: string;
}

export interface AchievementModuleConfig {
  trackProgress?: boolean;
  notifications?: boolean;
  retroactive?: boolean;
}
