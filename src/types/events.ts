/**
 * Event system types for GamificationKit
 */

import type { UserId, Metadata, Reward } from './common.js';

// Event priority levels
export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

// Event handler function types
export type EventHandler<T = any> = (data: T) => void | Promise<void>;
export type EventMiddleware = (event: GameEvent, next: () => void | Promise<void>) => void | Promise<void>;
export type EventFilter = (event: GameEvent) => boolean | Promise<boolean>;

// Base event data interface
export interface BaseEventData {
  userId?: UserId;
  timestamp?: string;
  metadata?: Metadata;
  [key: string]: any;
}

// Game event structure
export interface GameEvent<T extends BaseEventData = BaseEventData> {
  type: string;
  data: T;
  priority?: EventPriority;
  id?: string;
  timestamp: string;
  source?: string;
  version?: string;
}

// Event listener options
export interface EventListenerOptions {
  priority?: number;
  once?: boolean;
  filter?: EventFilter;
  debounce?: number;
  throttle?: number;
  async?: boolean;
}

// Event emitter options
export interface EventEmitOptions {
  priority?: EventPriority;
  delay?: number;
  persist?: boolean;
  broadcast?: boolean;
}

// Standard event types for each module

// Points events
export interface PointsAwardedEvent extends BaseEventData {
  userId: UserId;
  points: number;
  total: number;
  reason?: string;
  multiplier?: number;
}

export interface PointsDeductedEvent extends BaseEventData {
  userId: UserId;
  points: number;
  total: number;
  reason?: string;
}

export interface PointsLimitReachedEvent extends BaseEventData {
  userId: UserId;
  limit: number;
  period: 'daily' | 'weekly' | 'monthly';
}

// Badge events
export interface BadgeAwardedEvent extends BaseEventData {
  userId: UserId;
  badgeId: string;
  badgeName: string;
  category?: string;
  rarity?: string;
  rewards?: Reward;
}

export interface BadgeProgressEvent extends BaseEventData {
  userId: UserId;
  badgeId: string;
  progress: Record<string, number>;
  completed: boolean;
}

export interface BadgeRevokedEvent extends BaseEventData {
  userId: UserId;
  badgeId: string;
  reason?: string;
}

// Level events
export interface LevelUpEvent extends BaseEventData {
  userId: UserId;
  oldLevel: number;
  newLevel: number;
  totalXP: number;
  rewards?: Reward;
}

export interface XPAwardedEvent extends BaseEventData {
  userId: UserId;
  xp: number;
  total: number;
  reason?: string;
}

export interface PrestigeEvent extends BaseEventData {
  userId: UserId;
  prestigeLevel: number;
  previousLevel: number;
  rewards?: Reward;
}

// Streak events
export interface StreakUpdatedEvent extends BaseEventData {
  userId: UserId;
  type: string;
  currentStreak: number;
  longestStreak: number;
  status: 'active' | 'broken' | 'frozen';
}

export interface StreakBrokenEvent extends BaseEventData {
  userId: UserId;
  type: string;
  previousStreak: number;
  reason?: string;
}

export interface StreakMilestoneEvent extends BaseEventData {
  userId: UserId;
  type: string;
  milestone: number;
  rewards?: Reward;
}

export interface StreakFrozenEvent extends BaseEventData {
  userId: UserId;
  type: string;
  freezesRemaining: number;
}

// Quest events
export interface QuestStartedEvent extends BaseEventData {
  userId: UserId;
  questId: string;
  questName: string;
  objectives: any[];
}

export interface QuestProgressEvent extends BaseEventData {
  userId: UserId;
  questId: string;
  objectiveId: string;
  progress: number;
  target: number;
  percentage: number;
}

export interface QuestCompletedEvent extends BaseEventData {
  userId: UserId;
  questId: string;
  questName: string;
  rewards?: Reward;
  completionTime?: number;
}

export interface QuestFailedEvent extends BaseEventData {
  userId: UserId;
  questId: string;
  reason?: string;
}

export interface QuestAbandonedEvent extends BaseEventData {
  userId: UserId;
  questId: string;
}

// Leaderboard events
export interface LeaderboardUpdatedEvent extends BaseEventData {
  userId: UserId;
  type: string;
  score: number;
  rank?: number;
  previousRank?: number;
}

export interface LeaderboardRankChangedEvent extends BaseEventData {
  userId: UserId;
  type: string;
  oldRank: number;
  newRank: number;
  score: number;
}

// Achievement events
export interface AchievementUnlockedEvent extends BaseEventData {
  userId: UserId;
  achievementId: string;
  achievementName: string;
  rewards?: Reward;
}

// System events
export interface SystemEvent extends BaseEventData {
  type: 'startup' | 'shutdown' | 'error' | 'warning';
  message: string;
  details?: any;
}

export interface ModuleEvent extends BaseEventData {
  module: string;
  action: 'initialized' | 'started' | 'stopped' | 'error';
  details?: any;
}

// Webhook events
export interface WebhookEvent extends BaseEventData {
  url: string;
  event: GameEvent;
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  attempts?: number;
  response?: any;
  error?: string;
}

// Rule engine events
export interface RuleTriggeredEvent extends BaseEventData {
  ruleId: string;
  ruleName?: string;
  conditions: any;
  actions: any[];
  result: 'success' | 'failure';
}

// Custom event builder
export interface EventBuilder<T extends BaseEventData = BaseEventData> {
  type(eventType: string): EventBuilder<T>;
  data(eventData: T): EventBuilder<T>;
  priority(priority: EventPriority): EventBuilder<T>;
  source(source: string): EventBuilder<T>;
  metadata(meta: Metadata): EventBuilder<T>;
  build(): GameEvent<T>;
}

// Event registry for type safety
export interface EventRegistry {
  'points.awarded': PointsAwardedEvent;
  'points.deducted': PointsDeductedEvent;
  'points.limit_reached': PointsLimitReachedEvent;
  'badge.awarded': BadgeAwardedEvent;
  'badge.progress': BadgeProgressEvent;
  'badge.revoked': BadgeRevokedEvent;
  'level.up': LevelUpEvent;
  'xp.awarded': XPAwardedEvent;
  'prestige': PrestigeEvent;
  'streak.updated': StreakUpdatedEvent;
  'streak.broken': StreakBrokenEvent;
  'streak.milestone': StreakMilestoneEvent;
  'streak.frozen': StreakFrozenEvent;
  'quest.started': QuestStartedEvent;
  'quest.progress': QuestProgressEvent;
  'quest.completed': QuestCompletedEvent;
  'quest.failed': QuestFailedEvent;
  'quest.abandoned': QuestAbandonedEvent;
  'leaderboard.updated': LeaderboardUpdatedEvent;
  'leaderboard.rank_changed': LeaderboardRankChangedEvent;
  'achievement.unlocked': AchievementUnlockedEvent;
  'system': SystemEvent;
  'module': ModuleEvent;
  'webhook': WebhookEvent;
  'rule.triggered': RuleTriggeredEvent;
  [key: string]: BaseEventData; // Allow custom events
}

// Event manager interface
export interface IEventManager {
  on<K extends keyof EventRegistry>(
    event: K,
    handler: EventHandler<EventRegistry[K]>,
    options?: EventListenerOptions
  ): void;

  off<K extends keyof EventRegistry>(
    event: K,
    handler: EventHandler<EventRegistry[K]>
  ): void;

  once<K extends keyof EventRegistry>(
    event: K,
    handler: EventHandler<EventRegistry[K]>
  ): void;

  emit<K extends keyof EventRegistry>(
    event: K,
    data: EventRegistry[K],
    options?: EventEmitOptions
  ): Promise<void>;

  removeAllListeners(event?: keyof EventRegistry): void;

  listenerCount(event: keyof EventRegistry): number;

  eventNames(): Array<keyof EventRegistry>;
}

// Event history
export interface EventHistoryEntry {
  event: GameEvent;
  handlers: number;
  duration: number;
  errors?: Error[];
}

export interface EventHistory {
  events: EventHistoryEntry[];
  total: number;
  errors: number;
  averageDuration: number;
}
