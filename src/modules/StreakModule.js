import { BaseModule } from './BaseModule.js';
import { validators } from '../utils/validators.js';

export class StreakModule extends BaseModule {
  constructor(options = {}) {
    super('streaks', options);
    
    this.defaultConfig = {
      types: {
        daily: {
          window: 24 * 60 * 60 * 1000, // 24 hours
          grace: 6 * 60 * 60 * 1000,   // 6 hours grace period
          freezeEnabled: true,
          maxFreezes: 3,
          rewards: {}
        }
      },
      globalFreezeItems: 10,
      milestones: [3, 7, 14, 30, 60, 90, 180, 365],
      resetOnMiss: true
    };
    
    // Merge config early for constructor tests
    this.config = this.mergeDeep(this.defaultConfig, options);
    
    this.checkInterval = null;
  }

  mergeDeep(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeDeep(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  async onInitialize() {
    // Deep merge config to properly handle nested objects like types  
    this.config = this.mergeDeep(this.defaultConfig, this.config);
    
    // Start periodic check for expired streaks
    this.startStreakChecker();
  }

  setupEventListeners() {
    // Listen for streak-related events
    this.eventManager.on('streak.record', async (event) => {
      const { userId, type, timestamp } = event.data;
      await this.recordActivity(userId, type, timestamp);
    });

    this.eventManager.on('streak.freeze', async (event) => {
      const { userId, type } = event.data;
      await this.freezeStreak(userId, type);
    });
  }

  async recordActivity(userId, type = 'daily', timestamp = Date.now()) {
    validators.isUserId(userId);
    validators.isNonEmptyString(type, 'type');
    
    const typeConfig = this.config.types[type];
    if (!typeConfig) {
      throw new Error(`Unknown streak type: ${type}`);
    }
    
    const streakData = await this.getStreakData(userId, type);
    const lastActivity = streakData.lastActivity;
    const currentStreak = streakData.currentStreak;
    const window = typeConfig.window;
    const grace = typeConfig.grace || 0;
    
    // Check if this is a valid streak continuation
    let newStreak = currentStreak;
    let streakBroken = false;
    
    if (!lastActivity) {
      // First activity
      newStreak = 1;
    } else {
      const timeSinceLastActivity = timestamp - lastActivity;
      
      if (timeSinceLastActivity < window) {
        // Activity within same window, no change
        return {
          success: true,
          streak: currentStreak,
          message: 'Activity already recorded for this window'
        };
      } else if (timeSinceLastActivity <= window + grace) {
        // Valid continuation
        newStreak = currentStreak + 1;
      } else if (streakData.frozen && timeSinceLastActivity <= (window + grace) * 2) {
        // Streak was frozen, continue but consume freeze
        newStreak = currentStreak + 1;
        await this.consumeFreeze(userId, type);
      } else {
        // Streak broken
        streakBroken = true;
        newStreak = this.config.resetOnMiss ? 1 : 0;
      }
    }
    
    // Update streak data
    const updatedData = {
      currentStreak: newStreak,
      longestStreak: Math.max(streakData.longestStreak, newStreak),
      lastActivity: timestamp,
      totalActivities: streakData.totalActivities + 1,
      frozen: false,
      updatedAt: Date.now()
    };
    
    await this.storage.hset(
      this.getStorageKey(`users:${type}`),
      userId,
      updatedData
    );
    
    // Record activity in history
    await this.storage.lpush(
      this.getStorageKey(`history:${userId}:${type}`),
      JSON.stringify({
        timestamp,
        streak: newStreak,
        broken: streakBroken
      })
    );
    
    // Update leaderboards
    await this.updateLeaderboards(userId, type, newStreak, updatedData.longestStreak);
    
    // Check for milestones
    if (newStreak > currentStreak) {
      await this.checkMilestones(userId, type, newStreak);
    }
    
    // Emit events
    if (streakBroken) {
      await this.emitEvent('broken', {
        userId,
        type,
        previousStreak: currentStreak,
        timestamp
      });
    } else if (newStreak > currentStreak) {
      await this.emitEvent('continued', {
        userId,
        type,
        streak: newStreak,
        timestamp
      });
    }
    
    this.logger.info(`Streak recorded for user ${userId}: ${type} = ${newStreak}`);
    
    return {
      success: true,
      streak: newStreak,
      longestStreak: updatedData.longestStreak,
      broken: streakBroken,
      milestones: this.getMilestonesAchieved(newStreak)
    };
  }

  async freezeStreak(userId, type = 'daily') {
    validators.isUserId(userId);
    
    const typeConfig = this.config.types[type];
    if (!typeConfig || !typeConfig.freezeEnabled) {
      return {
        success: false,
        reason: 'freeze_not_enabled'
      };
    }
    
    const streakData = await this.getStreakData(userId, type);
    
    if (streakData.frozen) {
      return {
        success: false,
        reason: 'already_frozen'
      };
    }
    
    if (streakData.currentStreak === 0) {
      return {
        success: false,
        reason: 'no_active_streak'
      };
    }
    
    // Check if user has freeze items
    const freezeItems = await this.getFreezeItems(userId, type);
    
    if (freezeItems <= 0) {
      return {
        success: false,
        reason: 'no_freeze_items',
        freezeItems: 0
      };
    }
    
    // Apply freeze
    await this.storage.hset(
      this.getStorageKey(`users:${type}`),
      userId,
      {
        ...streakData,
        frozen: true,
        frozenAt: Date.now()
      }
    );
    
    // Consume a freeze item
    await this.consumeFreezeItem(userId, type);
    
    await this.emitEvent('frozen', {
      userId,
      type,
      streak: streakData.currentStreak,
      freezeItemsRemaining: freezeItems - 1
    });
    
    this.logger.info(`Streak frozen for user ${userId}: ${type}`);
    
    return {
      success: true,
      streak: streakData.currentStreak,
      freezeItemsRemaining: freezeItems - 1
    };
  }

  async getFreezeItems(userId, type) {
    const typeConfig = this.config.types[type];
    
    // Check type-specific freeze items
    const typeSpecific = await this.storage.hget(
      this.getStorageKey(`freeze-items:${type}`),
      userId
    );
    const typeCount = typeSpecific !== null ? parseInt(typeSpecific) : (typeConfig.maxFreezes || 0);
    
    // Check global freeze items
    const global = await this.storage.hget(
      this.getStorageKey('freeze-items:global'),
      userId
    );
    const globalCount = global !== null ? parseInt(global) : this.config.globalFreezeItems || 0;
    
    return typeCount + globalCount;
  }

  async consumeFreezeItem(userId, type) {
    const typeConfig = this.config.types[type];
    
    // Try to consume type-specific freeze first
    const typeSpecific = await this.storage.hget(
      this.getStorageKey(`freeze-items:${type}`),
      userId
    );
    const typeCount = typeSpecific !== null ? parseInt(typeSpecific) : (typeConfig.maxFreezes || 0);
    
    if (typeCount > 0) {
      await this.storage.hincrby(
        this.getStorageKey(`freeze-items:${type}`),
        userId,
        -1
      );
    } else {
      // Consume global freeze
      await this.storage.hincrby(
        this.getStorageKey('freeze-items:global'),
        userId,
        -1
      );
    }
  }

  async consumeFreeze(userId, type) {
    const streakData = await this.getStreakData(userId, type);
    
    await this.storage.hset(
      this.getStorageKey(`users:${type}`),
      userId,
      {
        ...streakData,
        frozen: false,
        lastFreezeUsed: Date.now()
      }
    );
    
    await this.emitEvent('freeze.consumed', {
      userId,
      type,
      streak: streakData.currentStreak
    });
  }

  async addFreezeItems(userId, count, type = 'global') {
    validators.isUserId(userId);
    validators.isPositiveNumber(count, 'count');
    
    const key = type === 'global' ? 
      this.getStorageKey('freeze-items:global') :
      this.getStorageKey(`freeze-items:${type}`);
    
    const newCount = await this.storage.hincrby(key, userId, count);
    
    await this.emitEvent('freeze.items.added', {
      userId,
      type,
      count,
      total: newCount
    });
    
    return {
      success: true,
      added: count,
      total: newCount
    };
  }

  async checkMilestones(userId, type, streak) {
    const achieved = [];
    
    for (const milestone of this.config.milestones) {
      if (streak === milestone) {
        achieved.push(milestone);
        
        // Process milestone rewards
        const rewards = this.config.types[type].rewards?.[milestone] || {};
        await this.processMilestoneRewards(userId, type, milestone, rewards);
      }
    }
    
    if (achieved.length > 0) {
      await this.emitEvent('milestone.achieved', {
        userId,
        type,
        streak,
        milestones: achieved
      });
    }
    
    return achieved;
  }

  async processMilestoneRewards(userId, type, milestone, rewards) {
    if (rewards.points) {
      await this.eventManager.emitAsync('points.award', {
        userId,
        points: rewards.points,
        reason: `streak_${type}_${milestone}`
      });
    }
    
    if (rewards.badges) {
      for (const badgeId of rewards.badges) {
        await this.eventManager.emitAsync('badges.award', {
          userId,
          badgeId,
          metadata: { streakType: type, milestone }
        });
      }
    }
    
    if (rewards.freezeItems) {
      await this.addFreezeItems(userId, rewards.freezeItems, type);
    }
    
    if (rewards.custom) {
      await this.eventManager.emitAsync('streak.milestone.reward', {
        userId,
        type,
        milestone,
        rewards: rewards.custom
      });
    }
  }

  getMilestonesAchieved(streak) {
    return this.config.milestones.filter(m => streak >= m);
  }

  async getStreakData(userId, type) {
    const data = await this.storage.hget(
      this.getStorageKey(`users:${type}`),
      userId
    );
    
    if (data) {
      // Ensure all properties are present
      return {
        currentStreak: data.currentStreak || 0,
        longestStreak: data.longestStreak || 0,
        lastActivity: data.lastActivity || null,
        totalActivities: data.totalActivities || 0,
        frozen: data.frozen || false,
        frozenAt: data.frozenAt || null,
        lastFreezeUsed: data.lastFreezeUsed || null,
        updatedAt: data.updatedAt || null
      };
    }
    
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActivity: null,
      totalActivities: 0,
      frozen: false,
      frozenAt: null,
      lastFreezeUsed: null
    };
  }

  async getUserStreaks(userId) {
    validators.isUserId(userId);
    
    const streaks = {};
    
    for (const type of Object.keys(this.config.types)) {
      const data = await this.getStreakData(userId, type);
      const freezeItems = await this.getFreezeItems(userId, type);
      const nextMilestone = this.config.milestones.find(m => m > data.currentStreak);
      
      streaks[type] = {
        ...data,
        freezeItems,
        nextMilestone,
        progressToNextMilestone: nextMilestone ? 
          (data.currentStreak / nextMilestone) * 100 : 100,
        achievedMilestones: this.getMilestonesAchieved(data.currentStreak)
      };
    }
    
    return streaks;
  }

  async getTopStreaks(type = 'daily', limit = 10, metric = 'current') {
    const key = metric === 'longest' ?
      this.getStorageKey(`leaderboard:${type}:longest`) :
      this.getStorageKey(`leaderboard:${type}:current`);
    
    const results = await this.storage.zrevrange(key, 0, limit - 1, { withScores: true });
    
    const users = [];

    // Handle different storage implementations
    if (Array.isArray(results)) {
      if (results.length > 0 && typeof results[0] === 'object' && 'member' in results[0]) {
        // Handle array of objects format [{member, score}, ...]
        for (let i = 0; i < results.length; i++) {
          users.push({
            rank: i + 1,
            userId: results[i].member,
            streak: parseInt(results[i].score)
          });
        }
      } else {
        // Handle flat array format [userId, score, userId, score...]
        for (let i = 0; i < results.length; i += 2) {
          const userId = results[i];
          const score = parseInt(results[i + 1]);

          users.push({
            rank: (i / 2) + 1,
            userId,
            streak: score
          });
        }
      }
    } else if (results && typeof results === 'object') {
      // Handle object format from some storage implementations
      let rank = 1;
      for (const [userId, score] of Object.entries(results)) {
        users.push({
          rank,
          userId,
          streak: parseInt(score)
        });
        rank++;
      }
    }
    
    return users;
  }

  async updateLeaderboards(userId, type, currentStreak, longestStreak) {
    // Update current streak leaderboard
    await this.storage.zadd(
      this.getStorageKey(`leaderboard:${type}:current`),
      currentStreak,
      userId
    );
    
    // Update longest streak leaderboard
    await this.storage.zadd(
      this.getStorageKey(`leaderboard:${type}:longest`),
      longestStreak,
      userId
    );
  }

  startStreakChecker() {
    // Check every hour for expired streaks
    this.checkInterval = setInterval(async () => {
      await this.checkExpiredStreaks();
    }, 60 * 60 * 1000);
    
    // Run initial check after 1 minute
    setTimeout(() => this.checkExpiredStreaks(), 60000);
  }

  async checkExpiredStreaks() {
    this.logger.debug('Checking for expired streaks...');
    
    for (const [type, config] of Object.entries(this.config.types)) {
      const users = await this.storage.hgetall(
        this.getStorageKey(`users:${type}`)
      );
      
      const now = Date.now();
      const expiryTime = config.window + (config.grace || 0);
      
      for (const [userId, data] of Object.entries(users)) {
        if (!data.lastActivity || data.currentStreak === 0) continue;
        
        const timeSinceLastActivity = now - data.lastActivity;
        
        // Check if streak should expire
        if (timeSinceLastActivity > expiryTime && !data.frozen) {
          // Check if we should break the streak
          if (timeSinceLastActivity > expiryTime * 2 || !data.frozen) {
            await this.breakStreak(userId, type, 'expired');
          }
        }
      }
    }
  }

  async breakStreak(userId, type, reason = 'manual') {
    const streakData = await this.getStreakData(userId, type);
    
    if (streakData.currentStreak === 0) {
      return { success: false, reason: 'no_active_streak' };
    }
    
    const brokenStreak = streakData.currentStreak;
    
    await this.storage.hset(
      this.getStorageKey(`users:${type}`),
      userId,
      {
        ...streakData,
        currentStreak: 0,
        brokenAt: Date.now(),
        frozen: false
      }
    );
    
    // Remove from current streak leaderboard
    await this.storage.zrem(
      this.getStorageKey(`leaderboard:${type}:current`),
      userId
    );
    
    await this.emitEvent('broken', {
      userId,
      type,
      previousStreak: brokenStreak,
      reason,
      timestamp: Date.now()
    });
    
    this.logger.info(`Streak broken for user ${userId}: ${type} (${reason})`);
    
    return {
      success: true,
      previousStreak: brokenStreak,
      reason
    };
  }

  async getUserStats(userId) {
    const streaks = await this.getUserStreaks(userId);
    const stats = {
      streaks,
      summary: {
        activeStreaks: 0,
        totalMilestones: 0,
        totalFreezeItems: 0
      }
    };
    
    for (const [type, data] of Object.entries(streaks)) {
      if (data.currentStreak > 0) {
        stats.summary.activeStreaks++;
      }
      stats.summary.totalMilestones += data.achievedMilestones.length;
      stats.summary.totalFreezeItems += data.freezeItems;
    }
    
    return stats;
  }

  async resetUser(userId) {
    await super.resetUser(userId);
    
    // Delete user data for all streak types
    for (const type of Object.keys(this.config.types)) {
      await this.storage.hdel(
        this.getStorageKey(`users:${type}`),
        userId
      );
      
      await this.storage.delete(
        this.getStorageKey(`history:${userId}:${type}`)
      );
      
      // Remove from leaderboards
      await this.storage.zrem(
        this.getStorageKey(`leaderboard:${type}:current`),
        userId
      );
      
      await this.storage.zrem(
        this.getStorageKey(`leaderboard:${type}:longest`),
        userId
      );
    }
    
    // Delete freeze items
    await this.storage.hdel(
      this.getStorageKey('freeze-items:global'),
      userId
    );
    
    for (const type of Object.keys(this.config.types)) {
      await this.storage.hdel(
        this.getStorageKey(`freeze-items:${type}`),
        userId
      );
    }
    
    await this.emitEvent('user.reset', { userId });
  }

  async shutdown() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    await super.shutdown();
  }
}