import { BaseModule } from './BaseModule.js';
import { validators } from '../utils/validators.js';

export class AchievementModule extends BaseModule {
  constructor(options = {}) {
    super('achievements', options);
    
    this.defaultConfig = {
      tiers: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
      tierMultipliers: {
        bronze: 1,
        silver: 2,
        gold: 3,
        platinum: 5,
        diamond: 10
      },
      enableTierProgression: true,
      showProgress: true,
      categories: ['gameplay', 'social', 'collection', 'special']
    };
    
    // Merge config early for constructor tests
    this.config = this.mergeDeep(this.defaultConfig, options);
    
    this.achievements = new Map();
    this.trackers = new Map();
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
    // Deep merge config to properly handle nested objects
    this.config = this.mergeDeep(this.defaultConfig, this.config);
  }

  setupEventListeners() {
    // Listen for achievement-related events
    this.eventManager.onWildcard('*', async (event) => {
      await this.checkAchievementProgress(event);
    });
  }

  addAchievement(achievement) {
    validators.hasProperties(achievement, ['id', 'name', 'tiers'], 'achievement');
    
    const processedAchievement = {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description || '',
      category: achievement.category || 'general',
      tiers: this.processTiers(achievement.tiers),
      icon: achievement.icon || null,
      hidden: achievement.hidden || false,
      enabled: achievement.enabled !== false,
      trackingEvent: achievement.trackingEvent || null,
      metadata: achievement.metadata || {},
      createdAt: Date.now()
    };
    
    this.achievements.set(achievement.id, processedAchievement);
    
    // Set up tracker if needed
    if (processedAchievement.trackingEvent) {
      this.setupTracker(processedAchievement);
    }
    
    this.logger.debug(`Achievement added: ${achievement.id}`);
    
    return processedAchievement;
  }

  processTiers(tiers) {
    const processedTiers = {};
    
    for (const [tier, config] of Object.entries(tiers)) {
      if (this.config.tiers.includes(tier)) {
        processedTiers[tier] = {
          name: config.name || `${tier} ${this.name}`,
          description: config.description || '',
          requirement: config.requirement,
          rewards: config.rewards || {},
          icon: config.icon || null
        };
      }
    }
    
    return processedTiers;
  }

  setupTracker(achievement) {
    const tracker = {
      achievementId: achievement.id,
      event: achievement.trackingEvent,
      field: achievement.trackingField || 'value',
      aggregation: achievement.aggregation || 'sum'
    };
    
    this.trackers.set(achievement.id, tracker);
  }

  async unlock(userId, achievementId, tier) {
    validators.isUserId(userId);
    validators.isInArray(tier, this.config.tiers, 'tier');
    
    // Use a simple lock mechanism to prevent concurrent unlocks
    const lockKey = `${userId}:${achievementId}:${tier}`;
    if (this.unlockLocks?.has(lockKey)) {
      return {
        success: false,
        reason: 'already_unlocking'
      };
    }
    
    if (!this.unlockLocks) {
      this.unlockLocks = new Set();
    }
    this.unlockLocks.add(lockKey);
    
    try {
      const achievement = this.achievements.get(achievementId);
      if (!achievement) {
        throw new Error(`Achievement not found: ${achievementId}`);
      }
    
      if (!achievement.enabled) {
        return {
          success: false,
          reason: 'achievement_disabled'
        };
      }
      
      if (!achievement.tiers[tier]) {
        return {
          success: false,
          reason: 'tier_not_found'
        };
      }
      
      // Check if already unlocked
      const userAchievements = await this.getUserAchievements(userId);
      const existing = userAchievements.find(
        a => a.achievementId === achievementId && a.tier === tier
      );
      
      if (existing) {
        return {
          success: false,
          reason: 'already_unlocked'
        };
      }
      
      // Check if previous tier is required
      if (this.config.enableTierProgression) {
        const tierIndex = this.config.tiers.indexOf(tier);
        if (tierIndex > 0) {
          const previousTier = this.config.tiers[tierIndex - 1];
          const hasPrevious = userAchievements.some(
            a => a.achievementId === achievementId && a.tier === previousTier
          );
          
          if (!hasPrevious) {
            return {
              success: false,
              reason: 'previous_tier_required',
              requiredTier: previousTier
            };
          }
        }
      }
      
      // Create unlock record
      const unlock = {
        id: `unlock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        achievementId,
        tier,
        achievementData: {
          name: achievement.name,
          description: achievement.description,
          category: achievement.category,
          tierName: achievement.tiers[tier].name,
          tierDescription: achievement.tiers[tier].description
        },
        unlockedAt: Date.now()
      };
      
      // Store unlock
      await this.storage.lpush(
        this.getStorageKey(`unlocks:${userId}`),
        JSON.stringify(unlock)
      );
      
      await this.storage.sadd(
        this.getStorageKey(`user:${userId}:${achievementId}`),
        tier
      );
      
      // Update stats
      await this.storage.hincrby(
        this.getStorageKey('stats'),
        `${achievementId}:${tier}`,
        1
      );
      
      // Process rewards
      const rewards = achievement.tiers[tier].rewards;
      if (rewards) {
        await this.processRewards(userId, rewards, tier);
      }
      
      // Calculate achievement points
      const points = await this.calculateAchievementPoints(achievement, tier);
      await this.updateAchievementScore(userId, points);
      
      await this.emitEvent('unlocked', {
        userId,
        achievementId,
        tier,
        achievement,
        unlock,
        points
      });
      
      this.logger.info(`Achievement ${achievementId} (${tier}) unlocked for user ${userId}`);
      
      return {
        success: true,
        unlock,
        points,
        rewards
      };
    } finally {
      this.unlockLocks.delete(lockKey);
    }
  }

  async calculateAchievementPoints(achievement, tier) {
    const basePoints = 100;
    const tierMultiplier = this.config.tierMultipliers[tier] || 1;
    const categoryMultiplier = 1; // Could be configured per category
    
    return Math.floor(basePoints * tierMultiplier * categoryMultiplier);
  }

  async updateAchievementScore(userId, points) {
    const newScore = await this.storage.hincrby(
      this.getStorageKey('scores'),
      userId,
      points
    );
    
    // Update leaderboard
    await this.storage.zadd(
      this.getStorageKey('leaderboard'),
      newScore,
      userId
    );
    
    return newScore;
  }

  async updateProgress(userId, achievementId, value, increment = true) {
    validators.isUserId(userId);
    
    const achievement = this.achievements.get(achievementId);
    if (!achievement) return null;
    
    const key = this.getStorageKey(`progress:${userId}:${achievementId}`);
    let progress;
    
    if (increment) {
      progress = await this.storage.increment(key, value);
    } else {
      await this.storage.set(key, value);
      progress = value;
    }
    
    // Check if any tiers are unlocked
    const unlockedTiers = await this.checkTierUnlocks(userId, achievementId, progress);
    
    if (unlockedTiers.length > 0) {
      for (const tier of unlockedTiers) {
        await this.unlock(userId, achievementId, tier);
      }
    }
    
    await this.emitEvent('progress.updated', {
      userId,
      achievementId,
      progress,
      unlockedTiers
    });
    
    return {
      progress,
      unlockedTiers
    };
  }

  async checkTierUnlocks(userId, achievementId, progress) {
    const achievement = this.achievements.get(achievementId);
    if (!achievement) return [];
    
    const userTiers = await this.storage.smembers(
      this.getStorageKey(`user:${userId}:${achievementId}`)
    );
    
    const unlockedTiers = [];
    
    if (this.config.enableTierProgression) {
      // With progression enabled, unlock tiers in order only
      for (const tier of this.config.tiers) {
        if (achievement.tiers[tier] && !userTiers.includes(tier) && progress >= achievement.tiers[tier].requirement) {
          const tierIndex = this.config.tiers.indexOf(tier);
          if (tierIndex === 0 || userTiers.includes(this.config.tiers[tierIndex - 1])) {
            unlockedTiers.push(tier);
            // Only unlock one tier at a time when progression is enabled
            break;
          }
        }
      }
    } else {
      // Without progression, unlock all qualifying tiers
      for (const [tier, config] of Object.entries(achievement.tiers)) {
        if (!userTiers.includes(tier) && progress >= config.requirement) {
          unlockedTiers.push(tier);
        }
      }
    }
    
    return unlockedTiers;
  }

  async checkAchievementProgress(event) {
    const { userId } = event.data;
    if (!userId) return;
    
    for (const [achievementId, tracker] of this.trackers) {
      if (tracker.event === event.eventName) {
        const value = event.data[tracker.field] || 1;
        await this.updateProgress(userId, achievementId, value);
      }
    }
  }

  async processRewards(userId, rewards, tier) {
    const multiplier = this.config.tierMultipliers[tier] || 1;
    
    if (rewards.points) {
      await this.eventManager.emitAsync('points.award', {
        userId,
        points: Math.floor(rewards.points * multiplier),
        reason: `achievement_${tier}`
      });
    }
    
    if (rewards.xp) {
      await this.eventManager.emitAsync('levels.addXP', {
        userId,
        xp: Math.floor(rewards.xp * multiplier),
        reason: `achievement_${tier}`
      });
    }
    
    if (rewards.badges) {
      for (const badgeId of rewards.badges) {
        await this.eventManager.emitAsync('badges.award', {
          userId,
          badgeId,
          metadata: { achievementTier: tier }
        });
      }
    }
    
    if (rewards.custom) {
      await this.eventManager.emitAsync('achievement.reward.custom', {
        userId,
        tier,
        rewards: rewards.custom
      });
    }
  }

  async getUserAchievements(userId) {
    validators.isUserId(userId);
    
    const unlocks = await this.storage.lrange(
      this.getStorageKey(`unlocks:${userId}`),
      0,
      -1
    );
    
    // Parse and sort by unlock time (most recent first)
    return unlocks
      .map(u => JSON.parse(u))
      .sort((a, b) => a.unlockedAt - b.unlockedAt);
  }

  async getUserProgress(userId, achievementId = null) {
    validators.isUserId(userId);
    
    if (achievementId) {
      const progress = await this.storage.get(
        this.getStorageKey(`progress:${userId}:${achievementId}`)
      ) || 0;
      
      const achievement = this.achievements.get(achievementId);
      if (!achievement) return null;
      
      const userTiers = await this.storage.smembers(
        this.getStorageKey(`user:${userId}:${achievementId}`)
      );
      
      const tierProgress = {};
      for (const [tier, config] of Object.entries(achievement.tiers)) {
        tierProgress[tier] = {
          unlocked: userTiers.includes(tier),
          progress,
          requirement: config.requirement,
          percentage: Math.min(100, (progress / config.requirement) * 100)
        };
      }
      
      return {
        achievementId,
        progress,
        tiers: tierProgress,
        nextTier: this.getNextTier(userTiers, achievement)
      };
    }
    
    // Get progress for all achievements
    const allProgress = {};
    
    for (const achievement of this.achievements.values()) {
      if (!achievement.hidden || (await this.hasAnyTier(userId, achievement.id))) {
        allProgress[achievement.id] = await this.getUserProgress(userId, achievement.id);
      }
    }
    
    return allProgress;
  }

  getNextTier(unlockedTiers, achievement) {
    for (const tier of this.config.tiers) {
      if (!unlockedTiers.includes(tier) && achievement.tiers[tier]) {
        return {
          tier,
          requirement: achievement.tiers[tier].requirement
        };
      }
    }
    return null;
  }

  async hasAnyTier(userId, achievementId) {
    const tiers = await this.storage.smembers(
      this.getStorageKey(`user:${userId}:${achievementId}`)
    );
    return tiers.length > 0;
  }

  async getAchievementScore(userId) {
    validators.isUserId(userId);
    
    return await this.storage.hget(
      this.getStorageKey('scores'),
      userId
    ) || 0;
  }

  async getTopScorers(limit = 10) {
    const results = await this.storage.zrevrange(
      this.getStorageKey('leaderboard'),
      0,
      limit - 1,
      { withScores: true }
    );

    const users = [];

    // Fix BUG-046: Handle correct storage result format [{member, score}, ...]
    if (Array.isArray(results)) {
      if (results.length > 0 && typeof results[0] === 'object' && 'member' in results[0]) {
        // Handle array of objects format [{member, score}, ...] from all storage adapters
        for (let i = 0; i < results.length; i++) {
          const userId = results[i].member;
          const score = parseInt(results[i].score);

          const achievements = await this.getUserAchievements(userId);
          users.push({
            rank: i + 1,
            userId,
            score,
            totalAchievements: achievements.length,
            tierBreakdown: this.getTierBreakdown(achievements)
          });
        }
      } else {
        // Handle flat array format [userId, score, userId, score...] for backwards compatibility
        for (let i = 0; i < results.length; i += 2) {
          const userId = results[i];
          const score = parseInt(results[i + 1]);

          const achievements = await this.getUserAchievements(userId);
          users.push({
            rank: (i / 2) + 1,
            userId,
            score,
            totalAchievements: achievements.length,
            tierBreakdown: this.getTierBreakdown(achievements)
          });
        }
      }
    } else if (results && typeof results === 'object') {
      // Handle object format from some storage implementations
      let rank = 1;
      for (const [userId, score] of Object.entries(results)) {
        const achievements = await this.getUserAchievements(userId);
        users.push({
          rank,
          userId,
          score: parseInt(score),
          totalAchievements: achievements.length,
          tierBreakdown: this.getTierBreakdown(achievements)
        });
        rank++;
      }
    }

    return users;
  }

  getTierBreakdown(achievements) {
    const breakdown = {};
    
    for (const tier of this.config.tiers) {
      breakdown[tier] = achievements.filter(a => a.tier === tier).length;
    }
    
    return breakdown;
  }

  async getAllAchievements(includeHidden = false) {
    const achievements = Array.from(this.achievements.values());
    
    if (!includeHidden) {
      return achievements.filter(a => !a.hidden);
    }
    
    return achievements;
  }

  async getAchievementStats() {
    const stats = await this.storage.hgetall(this.getStorageKey('stats'));
    const result = {};
    
    for (const achievement of this.achievements.values()) {
      result[achievement.id] = {
        name: achievement.name,
        tiers: {}
      };
      
      for (const tier of this.config.tiers) {
        const count = stats[`${achievement.id}:${tier}`] || 0;
        result[achievement.id].tiers[tier] = {
          unlocks: Number(count),
          rarity: this.calculateRarity(Number(count))
        };
      }
    }
    
    return result;
  }

  calculateRarity(unlockCount) {
    if (unlockCount === 0) return 'locked';
    if (unlockCount < 10) return 'legendary';
    if (unlockCount < 50) return 'epic';
    if (unlockCount < 200) return 'rare';
    if (unlockCount < 1000) return 'uncommon';
    return 'common';
  }

  async getUserStats(userId) {
    const achievements = await this.getUserAchievements(userId);
    const score = await this.getAchievementScore(userId);
    const rank = await this.storage.zrevrank(
      this.getStorageKey('leaderboard'),
      userId
    );
    
    const byCategory = {};
    const byTier = {};
    const completedAchievements = new Set();
    
    for (const unlock of achievements) {
      const achievement = this.achievements.get(unlock.achievementId);
      if (!achievement) continue;
      
      completedAchievements.add(unlock.achievementId);
      
      byCategory[achievement.category] = (byCategory[achievement.category] || 0) + 1;
      byTier[unlock.tier] = (byTier[unlock.tier] || 0) + 1;
    }
    
    // Calculate completion percentage
    const totalAchievements = Array.from(this.achievements.values())
      .filter(a => !a.hidden).length;
    const totalPossibleUnlocks = totalAchievements * this.config.tiers.length;
    
    return {
      score,
      rank: rank !== null ? rank + 1 : null,
      totalUnlocks: achievements.length,
      uniqueAchievements: completedAchievements.size,
      byCategory,
      byTier,
      completion: {
        achievements: (completedAchievements.size / totalAchievements) * 100,
        totalUnlocks: (achievements.length / totalPossibleUnlocks) * 100
      },
      recentUnlocks: achievements.slice(0, 10).map(u => ({
        ...u.achievementData,
        tier: u.tier,
        unlockedAt: u.unlockedAt
      }))
    };
  }

  async resetUser(userId) {
    await super.resetUser(userId);
    
    // Delete unlocks
    await this.storage.delete(
      this.getStorageKey(`unlocks:${userId}`)
    );
    
    // Delete progress
    const progressKeys = await this.storage.keys(
      this.getStorageKey(`progress:${userId}:*`)
    );
    for (const key of progressKeys) {
      await this.storage.delete(key);
    }
    
    // Delete tier tracking
    const tierKeys = await this.storage.keys(
      this.getStorageKey(`user:${userId}:*`)
    );
    for (const key of tierKeys) {
      await this.storage.delete(key);
    }
    
    // Reset score
    await this.storage.hdel(
      this.getStorageKey('scores'),
      userId
    );
    
    // Remove from leaderboard
    await this.storage.zrem(
      this.getStorageKey('leaderboard'),
      userId
    );
    
    await this.emitEvent('user.reset', { userId });
  }
}