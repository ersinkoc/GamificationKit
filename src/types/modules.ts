/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Module system types for GamificationKit
 */

import type {
  UserId,
  Metadata,
  Reward,
  BadgeRarity,
  XPFormula as _XPFormula, // May be used in future
  TimePeriod,
  QuestStatus
} from './common.js';
import type { IStorageAdapter } from './storage.js';
import type { IEventManager } from './events.js';

// Module context
export interface ModuleContext {
  storage: IStorageAdapter;
  eventManager: IEventManager;
  ruleEngine: IRuleEngine;
  logger: ILogger;
  config: any;
}

// Base module interface
export interface IBaseModule {
  readonly name: string;
  readonly version?: string;

  setContext(context: ModuleContext): void;
  initialize(): Promise<void>;
  getUserStats(userId: UserId): Promise<any>;
  resetUser(userId: UserId): Promise<void>;
  shutdown(): Promise<void>;

  getRoutes?(): ModuleRoute[];
  getMetrics?(): ModuleMetrics;
  getHealth?(): ModuleHealth;
}

// Module route
export interface ModuleRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: (req: any, res: any) => void | Promise<void>;
  middleware?: any[];
  description?: string;
}

// Module metrics
export interface ModuleMetrics {
  [key: string]: number | string | boolean;
}

// Module health
export interface ModuleHealth {
  healthy: boolean;
  message?: string;
  details?: any;
}

// Points Module Types
export interface PointsData {
  total: number;
  daily: number;
  weekly: number;
  monthly: number;
  lastUpdated: string;
}

export interface PointsTransaction {
  id: string;
  userId: UserId;
  amount: number;
  type: 'award' | 'deduct';
  reason?: string;
  balance: number;
  metadata?: Metadata;
  timestamp: string;
}

export interface PointsMultiplier {
  value: number;
  expiresAt?: string;
  reason?: string;
}

export interface PointsLimit {
  daily: number;
  weekly: number;
  monthly: number;
}

// Badge Module Types
export interface Badge {
  id: string;
  name: string;
  description: string;
  category?: string;
  rarity?: BadgeRarity;
  imageUrl?: string;
  conditions?: {
    triggers?: Array<{
      event: string;
      conditions?: any;
    }>;
    progress?: {
      [key: string]: {
        target: number;
        description?: string;
      };
    };
  };
  rewards?: Reward;
  secret?: boolean;
  enabled?: boolean;
  metadata?: Metadata;
}

export interface UserBadge {
  badgeId: string;
  awardedAt: string;
  progress?: Record<string, number>;
  metadata?: Metadata;
}

export interface BadgeProgress {
  badgeId: string;
  progress: Record<string, number>;
  completed: boolean;
  percentage: number;
}

// Level Module Types
export interface LevelInfo {
  userId: UserId;
  level: number;
  totalXP: number;
  currentLevelXP: number;
  prestige: number;
  progress: {
    current: number;
    required: number;
    next: number;
    percentage: number;
  };
  metadata?: Metadata;
}

export interface XPTransaction {
  id: string;
  userId: UserId;
  amount: number;
  reason?: string;
  level: number;
  totalXP: number;
  timestamp: string;
}

// Streak Module Types
export interface StreakData {
  userId: UserId;
  type: string;
  currentStreak: number;
  longestStreak: number;
  lastActivity: string;
  freezesUsed: number;
  freezesRemaining: number;
  status: 'active' | 'broken' | 'frozen';
  metadata?: Metadata;
}

export interface StreakTypeConfig {
  window: number;
  grace?: number;
  freezeEnabled?: boolean;
  maxFreezes?: number;
  rewards?: {
    [milestone: number]: Reward;
  };
}

// Quest Module Types
export interface Quest {
  id: string;
  name: string;
  description: string;
  category?: string;
  objectives: QuestObjective[];
  rewards?: Reward;
  requirements?: QuestRequirement;
  timeLimit?: number;
  repeatable?: boolean;
  maxCompletions?: number;
  dependencies?: string[];
  enabled?: boolean;
  metadata?: Metadata;
}

export interface QuestObjective {
  id: string;
  description: string;
  target: number;
  event: string;
  conditions?: any;
  optional?: boolean;
}

export interface QuestRequirement {
  level?: number;
  badges?: string[];
  quests?: string[];
  points?: number;
  custom?: (userId: UserId) => boolean | Promise<boolean>;
}

export interface UserQuest {
  questId: string;
  status: QuestStatus;
  startedAt: string;
  completedAt?: string;
  expiresAt?: string;
  progress: QuestProgress;
  metadata?: Metadata;
}

export interface QuestProgress {
  objectives: {
    [objectiveId: string]: {
      current: number;
      target: number;
      completed: boolean;
    };
  };
  percentage: number;
  completed: boolean;
}

// Leaderboard Module Types
export interface LeaderboardEntry {
  userId: UserId;
  score: number;
  rank: number;
  metadata?: Metadata;
  updatedAt: string;
}

export interface LeaderboardOptions {
  type: string;
  period?: TimePeriod;
  limit?: number;
  offset?: number;
  includeUser?: UserId;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  total: number;
  userEntry?: LeaderboardEntry;
  period: TimePeriod;
  type: string;
}

// Achievement Module Types
export interface Achievement {
  id: string;
  name: string;
  description: string;
  category?: string;
  points?: number;
  hidden?: boolean;
  conditions?: any;
  rewards?: Reward;
  metadata?: Metadata;
}

export interface UserAchievement {
  achievementId: string;
  unlockedAt: string;
  progress?: number;
  metadata?: Metadata;
}

// Rule Engine Types
export interface Rule {
  id: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  conditions: RuleConditions;
  actions: RuleAction[];
  metadata?: Metadata;
}

export interface RuleConditions {
  all?: RuleCondition[];
  any?: RuleCondition[];
  none?: RuleCondition[];
}

export interface RuleCondition {
  field: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not_in' | 'contains' | 'not_contains' | 'exists' | 'not_exists';
  value: any;
}

export interface RuleAction {
  type: string;
  params?: any;
  [key: string]: any;
}

export interface IRuleEngine {
  addRule(rule: Rule): void;
  removeRule(ruleId: string): void;
  evaluateRule(rule: Rule, context: any): Promise<boolean>;
  evaluateConditions(conditions: RuleConditions, context: any): Promise<boolean>;
  executeActions(actions: RuleAction[], context: any): Promise<void>;
  getRules(): Rule[];
  getRule(ruleId: string): Rule | undefined;
}

// Logger Interface
export interface ILogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  setLevel(level: string): void;
  setContext(context: string): void;
}

// User stats aggregation
export interface UserStats {
  userId: UserId;
  modules: {
    points?: PointsData & {
      transactions?: PointsTransaction[];
      multiplier?: PointsMultiplier;
    };
    badges?: {
      badges: UserBadge[];
      count: number;
      progress?: BadgeProgress[];
    };
    levels?: LevelInfo;
    streaks?: StreakData[];
    quests?: {
      active: UserQuest[];
      completed: UserQuest[];
      available?: Quest[];
    };
    leaderboards?: {
      [type: string]: LeaderboardEntry;
    };
    achievements?: {
      achievements: UserAchievement[];
      count: number;
      points: number;
    };
    [key: string]: any;
  };
  lastUpdated: string;
}
