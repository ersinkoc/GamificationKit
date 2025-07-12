declare module '@oxog/gamification-kit' {
  // Storage Types
  export interface StorageOptions {
    type: 'memory' | 'redis' | 'mongodb' | 'postgres';
    host?: string;
    port?: number;
    database?: string;
    url?: string;
    password?: string;
    user?: string;
    db?: number;
  }

  // Configuration Types
  export interface GamificationKitConfig {
    appName?: string;
    storage?: StorageOptions;
    api?: {
      enabled?: boolean;
      port?: number;
      prefix?: string;
      cors?: boolean;
      rateLimit?: {
        windowMs?: number;
        max?: number;
      };
    };
    webhooks?: {
      enabled?: boolean;
      timeout?: number;
      retries?: number;
    };
    websocket?: {
      enabled?: boolean;
      port?: number;
      path?: string;
      authHandler?: (userId: string, req: any) => boolean | Promise<boolean>;
    };
    metrics?: {
      enabled?: boolean;
      collectInterval?: number;
    };
    logger?: {
      level?: 'debug' | 'info' | 'warn' | 'error';
      enabled?: boolean;
    };
    security?: {
      apiKey?: string | null;
      encryption?: boolean;
    };
  }

  // Module Types
  export interface ModuleContext {
    storage: any;
    eventManager: any;
    ruleEngine: any;
    logger: any;
    config: any;
  }

  export interface UserStats {
    userId: string;
    modules: {
      [moduleName: string]: any;
    };
  }

  // Points Module Types
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
        condition?: (userId: string) => boolean;
      };
    };
  }

  export interface PointsData {
    total: number;
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
    rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    imageUrl?: string;
    conditions?: {
      triggers?: Array<{
        event: string;
        conditions?: any;
      }>;
      progress?: {
        [key: string]: {
          target: number;
        };
      };
    };
    rewards?: {
      points?: number;
      xp?: number;
      [key: string]: any;
    };
    secret?: boolean;
    enabled?: boolean;
  }

  // Level Module Types
  export interface LevelModuleConfig {
    maxLevel?: number;
    xpFormula?: 'linear' | 'exponential' | 'custom';
    baseXP?: number;
    exponent?: number;
    prestigeEnabled?: boolean;
    levelRewards?: {
      [level: number]: {
        points?: number;
        badges?: string[];
        [key: string]: any;
      };
    };
  }

  export interface LevelInfo {
    userId: string;
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
  }

  // Streak Module Types
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
  }

  // Quest Module Types
  export interface Quest {
    id: string;
    name: string;
    description: string;
    category?: string;
    objectives: Array<{
      id: string;
      description: string;
      target: number;
      event: string;
      conditions?: any;
    }>;
    rewards?: {
      xp?: number;
      points?: number;
      badges?: string[];
      [key: string]: any;
    };
    requirements?: any;
    timeLimit?: number;
    repeatable?: boolean;
    maxCompletions?: number;
    dependencies?: string[];
    enabled?: boolean;
  }

  export interface QuestModuleConfig {
    maxActiveQuests?: number;
    dailyQuestLimit?: number;
    autoAssignDaily?: boolean;
  }

  // Main Classes
  export class GamificationKit {
    constructor(config?: GamificationKitConfig);
    use(module: BaseModule): this;
    initialize(): Promise<this>;
    track(eventName: string, data?: any): Promise<any>;
    getUserStats(userId: string): Promise<UserStats>;
    resetUser(userId: string): Promise<void>;
    shutdown(): Promise<void>;
    getMetrics(): any;
    getHealth(): any;
    express(): any;
    fastify(): any;
    koa(): any;
    readonly modules: Map<string, BaseModule>;
    readonly initialized: boolean;
  }

  export abstract class BaseModule {
    constructor(name: string, options?: any);
    setContext(context: ModuleContext): void;
    initialize(): Promise<void>;
    getUserStats(userId: string): Promise<any>;
    resetUser(userId: string): Promise<void>;
    shutdown(): Promise<void>;
    readonly name: string;
  }

  export class PointsModule extends BaseModule {
    constructor(config?: PointsModuleConfig);
    award(userId: string, points: number, reason?: string): Promise<any>;
    deduct(userId: string, points: number, reason?: string): Promise<any>;
    getPoints(userId: string): Promise<number>;
    getTransactionHistory(userId: string, limit?: number): Promise<any[]>;
    getTopUsers(limit?: number, period?: 'daily' | 'weekly' | 'monthly' | 'all-time'): Promise<any[]>;
    getUserStats(userId: string): Promise<any>;
    setUserMultiplier(userId: string, multiplier: number, duration?: number): Promise<any>;
    setEventMultiplier(multiplier: number, duration: number): Promise<any>;
    checkLimits(userId: string, points: number): Promise<any>;
    getUserRank(userId: string, period?: string): Promise<any>;
  }

  export class BadgeModule extends BaseModule {
    constructor(badges: Badge[]);
    award(userId: string, badgeId: string): Promise<any>;
    revoke(userId: string, badgeId: string): Promise<any>;
    getUserBadges(userId: string): Promise<Badge[]>;
    getBadgeProgress(userId: string, badgeId: string): Promise<any>;
    updateProgress(userId: string, badgeId: string, field: string, value: number): Promise<any>;
    getAllBadges(): Badge[];
  }

  export class LevelModule extends BaseModule {
    constructor(config?: LevelModuleConfig);
    addXP(userId: string, xp: number, reason?: string): Promise<LevelInfo>;
    getUserLevel(userId: string): Promise<LevelInfo>;
    prestige(userId: string): Promise<any>;
  }

  export class StreakModule extends BaseModule {
    constructor(config?: StreakModuleConfig);
    recordActivity(userId: string, type?: string, timestamp?: number): Promise<any>;
    getStreakData(userId: string, type: string): Promise<any>;
    getUserStreaks(userId: string): Promise<any>;
    freezeStreak(userId: string, type: string): Promise<any>;
    breakStreak(userId: string, type: string): Promise<any>;
    getTopStreaks(type: string, limit?: number): Promise<any[]>;
  }

  export class QuestModule extends BaseModule {
    constructor(config?: QuestModuleConfig);
    addQuest(quest: Quest): void;
    assignQuest(userId: string, questId: string): Promise<any>;
    getActiveQuests(userId: string): Promise<Quest[]>;
    getCompletedQuests(userId: string): Promise<Quest[]>;
    getUserQuests(userId: string): Promise<any>;
    updateObjectiveProgress(userId: string, questId: string, objectiveId: string, progress: number): Promise<any>;
    completeQuest(userId: string, questId: string): Promise<any>;
    assignDailyQuests(userId: string): Promise<string[]>;
  }

  export class LeaderboardModule extends BaseModule {
    constructor(config?: any);
    updateScore(userId: string, score: number, leaderboardType: string): Promise<void>;
    getLeaderboard(type: string, limit?: number, offset?: number): Promise<any[]>;
    getUserRank(userId: string, type: string): Promise<number>;
  }

  export class AchievementModule extends BaseModule {
    constructor(achievements?: any[]);
  }

  // Storage Classes
  export class MemoryStorage {
    constructor();
  }

  export class RedisStorage {
    constructor(options: any);
  }

  export class MongoStorage {
    constructor(options: any);
  }

  export class PostgresStorage {
    constructor(options: any);
  }

  // Middleware
  export function gamificationRoutes(gamificationKit: GamificationKit): any;
}