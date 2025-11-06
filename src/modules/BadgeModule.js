import { BaseModule } from './BaseModule.js';
import { validators } from '../utils/validators.js';

export class BadgeModule extends BaseModule {
  constructor(badges = [], options = {}) {
    super('badges', options);
    
    this.badges = new Map();
    this.progressTrackers = new Map();
    
    // Set default options
    this.defaultConfig = {
      autoAward: true,
      allowDuplicates: false
    };
    
    // Add badges if provided
    if (Array.isArray(badges)) {
      badges.forEach(badge => this.addBadge(badge));
    }
  }

  async onInitialize() {
    this.config = { ...this.defaultConfig, ...this.config };
    
    // Initialize progress trackers for badges with conditions
    for (const badge of this.badges.values()) {
      if (badge.conditions && badge.conditions.progress) {
        this.setupProgressTracker(badge);
      }
    }
  }

  setupEventListeners() {
    // Listen for events that might trigger badge awards
    this.eventManager.onWildcard('*', async (event) => {
      await this.checkBadgeTriggers(event);
    });
  }

  addBadge(badge) {
    validators.hasProperties(badge, ['id', 'name'], 'badge');
    
    const processedBadge = {
      id: badge.id,
      name: badge.name,
      description: badge.description || '',
      category: badge.category || 'general',
      rarity: badge.rarity || 'common',
      icon: badge.icon || null,
      metadata: badge.metadata || {},
      conditions: badge.conditions || {},
      rewards: badge.rewards || {},
      secret: badge.secret || false,
      enabled: badge.enabled !== false,
      priority: badge.priority || 0,
      maxAwards: badge.maxAwards || 1,
      expiresIn: badge.expiresIn || null,
      createdAt: Date.now()
    };
    
    this.badges.set(badge.id, processedBadge);
    if (this.logger) {
      this.logger.debug(`Badge added: ${badge.id}`);
    }
    
    return processedBadge;
  }

  removeBadge(badgeId) {
    const removed = this.badges.delete(badgeId);
    if (removed) {
      this.progressTrackers.delete(badgeId);
      if (this.logger) {
        this.logger.debug(`Badge removed: ${badgeId}`);
      }
    }
    return removed;
  }

  async award(userId, badgeId, metadata = {}) {
    validators.isUserId(userId);
    
    const badge = this.badges.get(badgeId);
    if (!badge) {
      throw new Error(`Badge not found: ${badgeId}`);
    }
    
    if (!badge.enabled) {
      return {
        success: false,
        reason: 'badge_disabled'
      };
    }
    
    // Check if already awarded
    const userBadges = await this.getUserBadges(userId);
    const existingAwards = userBadges.filter(b => b.badgeId === badgeId);
    
    if (existingAwards.length >= badge.maxAwards) {
      return {
        success: false,
        reason: 'max_awards_reached',
        maxAwards: badge.maxAwards
      };
    }
    
    // Create award record
    const award = {
      id: `award_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId,
      badgeId,
      badge: {
        name: badge.name,
        description: badge.description,
        category: badge.category,
        rarity: badge.rarity,
        icon: badge.icon
      },
      awardedAt: Date.now(),
      expiresAt: badge.expiresIn ? Date.now() + badge.expiresIn * 1000 : null,
      metadata
    };
    
    // Store award
    await this.storage.sadd(
      this.getStorageKey(`user:${userId}`),
      badgeId
    );
    
    await this.storage.lpush(
      this.getStorageKey(`awards:${userId}`),
      JSON.stringify(award)
    );
    
    // Update badge stats
    await this.storage.hincrby(
      this.getStorageKey('stats'),
      badgeId,
      1
    );
    
    // Process rewards
    if (badge.rewards) {
      await this.processRewards(userId, badge.rewards);
    }
    
    // Emit event
    await this.emitEvent('awarded', {
      userId,
      badgeId,
      badge,
      award
    });
    
    this.logger.info(`Badge ${badgeId} awarded to user ${userId}`);
    
    return {
      success: true,
      award
    };
  }

  async revoke(userId, badgeId) {
    validators.isUserId(userId);
    
    const removed = await this.storage.srem(
      this.getStorageKey(`user:${userId}`),
      badgeId
    );
    
    if (removed) {
      await this.emitEvent('revoked', {
        userId,
        badgeId
      });
      
      this.logger.info(`Badge ${badgeId} revoked from user ${userId}`);
    }
    
    return { success: removed > 0 };
  }

  async getUserBadges(userId) {
    validators.isUserId(userId);
    
    const awards = await this.storage.lrange(
      this.getStorageKey(`awards:${userId}`),
      0,
      -1
    );
    
    const parsedAwards = awards
      .map(a => JSON.parse(a))
      .filter(a => !a.expiresAt || a.expiresAt > Date.now());
    
    // Clean up expired badges
    const expiredBadges = awards
      .map(a => JSON.parse(a))
      .filter(a => a.expiresAt && a.expiresAt <= Date.now());
    
    for (const expired of expiredBadges) {
      await this.storage.srem(
        this.getStorageKey(`user:${userId}`),
        expired.badgeId
      );
    }
    
    return parsedAwards;
  }

  async hasBadge(userId, badgeId) {
    validators.isUserId(userId);
    
    return await this.storage.sismember(
      this.getStorageKey(`user:${userId}`),
      badgeId
    );
  }

  async getProgress(userId, badgeId) {
    validators.isUserId(userId);
    
    const badge = this.badges.get(badgeId);
    if (!badge || !badge.conditions.progress) {
      return null;
    }
    
    const progressKey = this.getStorageKey(`progress:${userId}:${badgeId}`);
    const progress = await this.storage.hgetall(progressKey);
    
    const result = {
      badgeId,
      userId,
      requirements: {},
      completed: true
    };
    
    for (const [key, requirement] of Object.entries(badge.conditions.progress)) {
      const current = Number(progress[key] || 0);
      const needed = requirement.target || requirement;
      const completed = current >= needed;
      
      result.requirements[key] = {
        current,
        target: needed,
        percentage: Math.min(100, (current / needed) * 100),
        completed
      };
      
      if (!completed) {
        result.completed = false;
      }
    }
    
    return result;
  }

  async updateProgress(userId, badgeId, key, increment = 1) {
    validators.isUserId(userId);
    
    const badge = this.badges.get(badgeId);
    if (!badge || !badge.conditions.progress || !badge.conditions.progress[key]) {
      return null;
    }
    
    const progressKey = this.getStorageKey(`progress:${userId}:${badgeId}`);
    const newValue = await this.storage.hincrby(progressKey, key, increment);
    
    // Check if badge should be awarded
    const progress = await this.getProgress(userId, badgeId);
    
    if (progress.completed) {
      const alreadyHas = await this.hasBadge(userId, badgeId);
      if (!alreadyHas || badge.maxAwards > 1) {
        await this.award(userId, badgeId, { 
          trigger: 'progress_complete',
          progress 
        });
      }
    }
    
    await this.emitEvent('progress.updated', {
      userId,
      badgeId,
      key,
      value: newValue,
      progress
    });
    
    return progress;
  }

  setupProgressTracker(badge) {
    const tracker = {
      badgeId: badge.id,
      conditions: badge.conditions.progress,
      events: badge.conditions.events || []
    };
    
    this.progressTrackers.set(badge.id, tracker);
    
    // Listen for specific events
    tracker.events.forEach(eventPattern => {
      this.eventManager.onWildcard(eventPattern, async (event) => {
        await this.handleProgressEvent(badge.id, event);
      });
    });
  }

  async handleProgressEvent(badgeId, event) {
    const tracker = this.progressTrackers.get(badgeId);
    if (!tracker) return;
    
    const { userId } = event.data;
    if (!userId) return;
    
    // Update progress based on event
    for (const [key, condition] of Object.entries(tracker.conditions)) {
      if (condition.event === event.eventName) {
        const increment = condition.increment || 1;
        await this.updateProgress(userId, badgeId, key, increment);
      }
    }
  }

  async checkBadgeTriggers(event) {
    const { userId } = event.data;
    if (!userId) return;
    
    for (const badge of this.badges.values()) {
      if (!badge.enabled || !badge.conditions.triggers) continue;
      
      // Check event triggers
      for (const trigger of badge.conditions.triggers) {
        if (this.matchesTrigger(event, trigger)) {
          const alreadyHas = await this.hasBadge(userId, badge.id);
          
          if (!alreadyHas || badge.maxAwards > 1) {
            await this.award(userId, badge.id, {
              trigger: 'event',
              event: event.eventName
            });
          }
        }
      }
    }
  }

  matchesTrigger(event, trigger) {
    // Event name match
    if (trigger.event) {
      const regex = new RegExp(
        '^' + trigger.event.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      
      if (!regex.test(event.eventName)) {
        return false;
      }
    }
    
    // Data conditions
    if (trigger.conditions) {
      for (const [field, condition] of Object.entries(trigger.conditions)) {
        const value = this.getNestedValue(event.data, field);
        
        if (!this.evaluateCondition(value, condition)) {
          return false;
        }
      }
    }
    
    return true;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  evaluateCondition(value, condition) {
    if (typeof condition === 'object') {
      if (condition.equals !== undefined) return value === condition.equals;
      if (condition.min !== undefined && value < condition.min) return false;
      if (condition.max !== undefined && value > condition.max) return false;
      if (condition.in !== undefined) return condition.in.includes(value);
      if (condition.contains !== undefined) return String(value).includes(condition.contains);
    } else {
      return value === condition;
    }
    
    return true;
  }

  async processRewards(userId, rewards) {
    if (rewards.points && this.eventManager) {
      await this.eventManager.emitAsync('points.award', {
        userId,
        points: rewards.points,
        reason: 'badge_reward'
      });
    }
    
    if (rewards.xp && this.eventManager) {
      await this.eventManager.emitAsync('levels.addXP', {
        userId,
        xp: rewards.xp,
        reason: 'badge_reward'
      });
    }
    
    if (rewards.custom && this.eventManager) {
      await this.eventManager.emitAsync('badge.reward.custom', {
        userId,
        rewards: rewards.custom
      });
    }
  }

  async getAllBadges(includeSecret = false) {
    const badges = Array.from(this.badges.values());
    
    if (!includeSecret) {
      return badges.filter(b => !b.secret);
    }
    
    return badges;
  }

  async getBadgeStats() {
    const stats = await this.storage.hgetall(this.getStorageKey('stats'));
    const result = {};
    
    for (const [badgeId, count] of Object.entries(stats)) {
      const badge = this.badges.get(badgeId);
      if (badge) {
        result[badgeId] = {
          badge: {
            name: badge.name,
            category: badge.category,
            rarity: badge.rarity
          },
          awardCount: Number(count),
          rarity: this.calculateRarity(Number(count))
        };
      }
    }
    
    return result;
  }

  calculateRarity(awardCount) {
    if (awardCount === 0) return 'unobtained';
    if (awardCount < 10) return 'ultra_rare';
    if (awardCount < 100) return 'rare';
    if (awardCount < 1000) return 'uncommon';
    return 'common';
  }

  async getUserStats(userId) {
    const badges = await this.getUserBadges(userId);
    const allBadges = Array.from(this.badges.values());
    
    const byCategory = {};
    const byRarity = {};
    
    badges.forEach(award => {
      const badge = this.badges.get(award.badgeId);
      if (!badge) return;
      
      byCategory[badge.category] = (byCategory[badge.category] || 0) + 1;
      byRarity[badge.rarity] = (byRarity[badge.rarity] || 0) + 1;
    });
    
    const progress = [];
    for (const badge of allBadges) {
      if (badge.conditions.progress && !badge.secret) {
        const prog = await this.getProgress(userId, badge.id);
        if (prog && !prog.completed) {
          progress.push({
            badge: {
              id: badge.id,
              name: badge.name,
              description: badge.description
            },
            progress: prog
          });
        }
      }
    }
    
    return {
      total: badges.length,
      badges: badges.map(a => ({
        ...a.badge,
        awardedAt: a.awardedAt
      })),
      byCategory,
      byRarity,
      progress,
      completion: {
        earned: badges.length,
        available: allBadges.filter(b => !b.secret).length,
        percentage: (badges.length / allBadges.filter(b => !b.secret).length) * 100
      }
    };
  }

  async resetUser(userId) {
    await super.resetUser(userId);
    
    // Remove all badges
    await this.storage.delete(this.getStorageKey(`user:${userId}`));
    await this.storage.delete(this.getStorageKey(`awards:${userId}`));
    
    // Remove progress
    const progressKeys = await this.storage.keys(
      this.getStorageKey(`progress:${userId}:*`)
    );
    
    for (const key of progressKeys) {
      await this.storage.delete(key);
    }
    
    await this.emitEvent('user.reset', { userId });
  }
}