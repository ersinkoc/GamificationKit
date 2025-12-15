import { BaseModule } from './BaseModule.js';
import { validators } from '../utils/validators.js';

export class LevelModule extends BaseModule {
  constructor(options = {}) {
    super('levels', options);
    
    this.defaultConfig = {
      startingLevel: 1,
      startingXP: 0,
      maxLevel: 100,
      xpFormula: 'exponential', // linear, exponential, custom
      baseXP: 100,
      exponent: 1.5,
      customThresholds: null,
      prestigeEnabled: false,
      prestigeMaxLevel: 10,
      levelRewards: {},
      xpMultipliers: {}
    };
    
    this.levelCache = new Map();
  }

  async onInitialize() {
    this.config = { ...this.defaultConfig, ...this.config };
    
    // Pre-calculate level thresholds
    this.calculateLevelThresholds();
  }

  setupEventListeners() {
    // Listen for XP events
    this.eventManager.on('levels.addXP', async (event) => {
      const { userId, xp, reason } = event.data;
      await this.addXP(userId, xp, reason);
    });

    this.eventManager.on('levels.setLevel', async (event) => {
      const { userId, level } = event.data;
      await this.setLevel(userId, level);
    });
  }

  calculateLevelThresholds() {
    this.thresholds = new Map();
    this.thresholds.set(1, 0);
    
    if (this.config.customThresholds) {
      // Use custom thresholds
      Object.entries(this.config.customThresholds).forEach(([level, xp]) => {
        this.thresholds.set(parseInt(level), xp);
      });
    } else {
      // Calculate thresholds based on formula
      for (let level = 2; level <= this.config.maxLevel; level++) {
        const xp = this.calculateXPForLevel(level);
        this.thresholds.set(level, xp);
      }
    }
  }

  calculateXPForLevel(level) {
    switch (this.config.xpFormula) {
      case 'linear':
        return (level - 1) * this.config.baseXP;
      
      case 'exponential':
        return Math.floor(
          this.config.baseXP * Math.pow(level - 1, this.config.exponent)
        );
      
      case 'custom':
        if (this.config.customFormula) {
          return this.config.customFormula(level);
        }
        // Fall back to exponential
        return Math.floor(
          this.config.baseXP * Math.pow(level - 1, this.config.exponent)
        );
      
      default:
        return (level - 1) * this.config.baseXP;
    }
  }

  async addXP(userId, xp, reason = 'manual') {
    validators.isUserId(userId);
    validators.isPositiveNumber(xp, 'xp');

    const multiplier = await this.getXPMultiplier(userId, reason);
    const actualXP = Math.floor(xp * multiplier);

    // Fix HIGH-007: Use atomic increment to prevent race condition
    // First, ensure user exists with default data if needed
    const existingData = await this.storage.hget(
      this.getStorageKey('users'),
      userId
    );

    if (!existingData) {
      // Initialize user with starting values
      await this.storage.hset(
        this.getStorageKey('users'),
        userId,
        {
          level: this.config.startingLevel,
          totalXP: this.config.startingXP,
          currentLevelXP: 0,
          prestige: 0,
          updatedAt: Date.now()
        }
      );
    }

    // Use atomic increment for XP - this is the key fix for race condition
    const xpKey = this.getStorageKey(`xp:${userId}`);
    const newTotalXP = await this.storage.increment(xpKey, actualXP);

    // Get user data after atomic increment to get prestige info
    const userData = await this.getUserData(userId);
    const oldLevel = userData.level;

    // Calculate new level based on atomically updated XP
    const newLevel = this.calculateLevelFromXP(newTotalXP, userData.prestige);
    const levelChanged = newLevel !== oldLevel;

    // Update user data with new level (XP is authoritative from atomic counter)
    const transaction = {
      userId,
      type: 'xp_gain',
      amount: actualXP,
      originalAmount: xp,
      multiplier,
      reason,
      oldLevel,
      newLevel,
      oldXP: newTotalXP - actualXP,
      newXP: newTotalXP,
      timestamp: Date.now()
    };

    await this.storage.hset(
      this.getStorageKey('users'),
      userId,
      {
        level: newLevel,
        totalXP: newTotalXP,
        currentLevelXP: this.getCurrentLevelXP(newTotalXP, newLevel, userData.prestige),
        prestige: userData.prestige,
        updatedAt: Date.now()
      }
    );

    // Record transaction
    await this.storage.lpush(
      this.getStorageKey(`history:${userId}`),
      JSON.stringify(transaction)
    );

    // Process level up if needed
    if (levelChanged) {
      await this.processLevelChange(userId, oldLevel, newLevel, userData.prestige);
    }

    // Update leaderboards
    await this.updateLeaderboards(userId, newTotalXP, newLevel);

    // Emit event
    await this.emitEvent('xp.gained', {
      userId,
      xp: actualXP,
      totalXP: newTotalXP,
      level: newLevel,
      levelChanged,
      transaction
    });

    this.logger.info(`User ${userId} gained ${actualXP} XP (${reason})`);

    return {
      success: true,
      xpGained: actualXP,
      totalXP: newTotalXP,
      level: newLevel,
      levelChanged,
      nextLevelXP: this.getXPForLevel(newLevel + 1, userData.prestige),
      progress: this.getLevelProgress(newTotalXP, newLevel, userData.prestige)
    };
  }

  async setLevel(userId, level) {
    validators.isUserId(userId);
    validators.isInteger(level, 'level');
    validators.isInRange(level, this.config.startingLevel, this.config.maxLevel, 'level');
    
    const userData = await this.getUserData(userId);
    const oldLevel = userData.level;
    const totalXP = this.getXPForLevel(level, userData.prestige);
    
    await this.storage.hset(
      this.getStorageKey('users'),
      userId,
      {
        level,
        totalXP,
        currentLevelXP: 0,
        prestige: userData.prestige,
        updatedAt: Date.now()
      }
    );
    
    if (level !== oldLevel) {
      await this.processLevelChange(userId, oldLevel, level, userData.prestige);
    }
    
    await this.updateLeaderboards(userId, totalXP, level);
    
    await this.emitEvent('level.set', {
      userId,
      oldLevel,
      newLevel: level,
      totalXP
    });
    
    return {
      success: true,
      level,
      totalXP
    };
  }

  async processLevelChange(userId, oldLevel, newLevel, prestige) {
    const isLevelUp = newLevel > oldLevel;
    
    // Process rewards for each level gained
    if (isLevelUp) {
      for (let level = oldLevel + 1; level <= newLevel; level++) {
        await this.processLevelRewards(userId, level, prestige);
      }
    }
    
    // Emit level change event
    await this.emitEvent(isLevelUp ? 'level.up' : 'level.down', {
      userId,
      oldLevel,
      newLevel,
      prestige,
      levelsChanged: Math.abs(newLevel - oldLevel)
    });
    
    // Check for max level and prestige
    if (this.config.prestigeEnabled && newLevel >= this.config.maxLevel) {
      await this.emitEvent('max.level.reached', {
        userId,
        level: newLevel,
        prestige,
        canPrestige: prestige < this.config.prestigeMaxLevel
      });
    }
  }

  async processLevelRewards(userId, level, prestige) {
    const rewards = this.config.levelRewards[level] || {};
    const prestigeBonus = prestige > 0 ? 1 + (prestige * 0.1) : 1;
    
    if (rewards.points) {
      await this.eventManager.emitAsync('points.award', {
        userId,
        points: Math.floor(rewards.points * prestigeBonus),
        reason: `level_${level}_reward`
      });
    }
    
    if (rewards.badges) {
      for (const badgeId of rewards.badges) {
        await this.eventManager.emitAsync('badges.award', {
          userId,
          badgeId,
          metadata: { level, prestige }
        });
      }
    }
    
    if (rewards.custom) {
      await this.eventManager.emitAsync('level.reward.custom', {
        userId,
        level,
        prestige,
        rewards: rewards.custom
      });
    }
    
    await this.emitEvent('rewards.processed', {
      userId,
      level,
      rewards,
      prestigeBonus
    });
  }

  async prestige(userId) {
    validators.isUserId(userId);
    
    if (!this.config.prestigeEnabled) {
      return {
        success: false,
        reason: 'prestige_disabled'
      };
    }
    
    const userData = await this.getUserData(userId);
    
    if (userData.level < this.config.maxLevel) {
      return {
        success: false,
        reason: 'max_level_not_reached',
        currentLevel: userData.level,
        requiredLevel: this.config.maxLevel
      };
    }
    
    if (userData.prestige >= this.config.prestigeMaxLevel) {
      return {
        success: false,
        reason: 'max_prestige_reached',
        currentPrestige: userData.prestige
      };
    }
    
    const newPrestige = userData.prestige + 1;
    
    // Reset to starting level but keep prestige
    await this.storage.hset(
      this.getStorageKey('users'),
      userId,
      {
        level: this.config.startingLevel,
        totalXP: this.config.startingXP,
        currentLevelXP: 0,
        prestige: newPrestige,
        prestigedAt: Date.now(),
        updatedAt: Date.now()
      }
    );
    
    // Process prestige rewards
    await this.processPrestigeRewards(userId, newPrestige);
    
    // Update prestige leaderboard
    await this.storage.zadd(
      this.getStorageKey('leaderboard:prestige'),
      newPrestige,
      userId
    );
    
    await this.emitEvent('prestiged', {
      userId,
      oldPrestige: userData.prestige,
      newPrestige,
      timestamp: Date.now()
    });
    
    this.logger.info(`User ${userId} prestiged to level ${newPrestige}`);
    
    return {
      success: true,
      prestige: newPrestige,
      level: this.config.startingLevel,
      totalXP: this.config.startingXP
    };
  }

  async processPrestigeRewards(userId, prestige) {
    const rewards = this.config.prestigeRewards?.[prestige] || {};
    
    if (rewards.points) {
      await this.eventManager.emitAsync('points.award', {
        userId,
        points: rewards.points,
        reason: `prestige_${prestige}_reward`
      });
    }
    
    if (rewards.badges) {
      for (const badgeId of rewards.badges) {
        await this.eventManager.emitAsync('badges.award', {
          userId,
          badgeId,
          metadata: { prestige }
        });
      }
    }
    
    if (rewards.multiplier) {
      await this.setXPMultiplier(userId, rewards.multiplier, rewards.multiplierDuration);
    }
  }

  calculateLevelFromXP(totalXP, prestige = 0) {
    let level = this.config.startingLevel;
    
    for (const [lvl, threshold] of this.thresholds) {
      if (totalXP >= threshold) {
        level = lvl;
      } else {
        break;
      }
    }
    
    return Math.min(level, this.config.maxLevel);
  }

  getXPForLevel(level, prestige = 0) {
    return this.thresholds.get(level) || 0;
  }

  getCurrentLevelXP(totalXP, level, prestige = 0) {
    const currentLevelThreshold = this.getXPForLevel(level, prestige);
    return totalXP - currentLevelThreshold;
  }

  getLevelProgress(totalXP, level, prestige = 0) {
    if (level >= this.config.maxLevel) {
      return {
        current: totalXP,
        required: totalXP,
        next: 0,
        percentage: 100
      };
    }
    
    const currentLevelXP = this.getXPForLevel(level, prestige);
    const nextLevelXP = this.getXPForLevel(level + 1, prestige);
    const currentProgress = totalXP - currentLevelXP;
    const required = nextLevelXP - currentLevelXP;
    
    return {
      current: currentProgress,
      required,
      next: required - currentProgress,
      percentage: (currentProgress / required) * 100
    };
  }

  async getUserData(userId) {
    const data = await this.storage.hget(
      this.getStorageKey('users'),
      userId
    );
    
    if (!data) {
      return {
        level: this.config.startingLevel,
        totalXP: this.config.startingXP,
        currentLevelXP: 0,
        prestige: 0
      };
    }
    
    return data;
  }

  async getUserLevel(userId) {
    const userData = await this.getUserData(userId);
    const progress = this.getLevelProgress(
      userData.totalXP,
      userData.level,
      userData.prestige
    );
    
    return {
      userId,
      level: userData.level,
      totalXP: userData.totalXP,
      currentLevelXP: userData.currentLevelXP,
      prestige: userData.prestige,
      progress,
      maxLevel: this.config.maxLevel,
      canPrestige: this.config.prestigeEnabled && 
                   userData.level >= this.config.maxLevel &&
                   userData.prestige < this.config.prestigeMaxLevel
    };
  }

  async getTopUsers(limit = 10, type = 'level') {
    const key = type === 'prestige' ? 
      this.getStorageKey('leaderboard:prestige') :
      this.getStorageKey('leaderboard:xp');
    
    const results = await this.storage.zrevrange(key, 0, limit - 1, { withScores: true });
    
    const users = [];
    for (let i = 0; i < results.length; i++) {
      const { member: userId, score } = results[i];
      const userData = await this.getUserData(userId);
      users.push({
        rank: i + 1,
        userId,
        level: userData.level,
        totalXP: userData.totalXP,
        prestige: userData.prestige,
        score
      });
    }
    
    return users;
  }

  async getXPMultiplier(userId, reason) {
    let multiplier = 1;
    
    // Global multipliers
    if (this.config.xpMultipliers.global) {
      multiplier *= this.config.xpMultipliers.global;
    }
    
    // Reason-specific multipliers
    if (this.config.xpMultipliers[reason]) {
      multiplier *= this.config.xpMultipliers[reason];
    }
    
    // User-specific multipliers
    const userMultiplier = await this.storage.hget(
      this.getStorageKey('multipliers'),
      userId
    );
    
    // Fix BUG-011: Add defensive check for expires property
    if (userMultiplier && userMultiplier.expires && userMultiplier.expires > Date.now()) {
      multiplier *= userMultiplier.value;
    }
    
    // Prestige bonus
    const userData = await this.getUserData(userId);
    if (userData.prestige > 0) {
      multiplier *= 1 + (userData.prestige * 0.1);
    }
    
    return multiplier;
  }

  async setXPMultiplier(userId, multiplier, duration) {
    validators.isUserId(userId);
    validators.isPositiveNumber(multiplier, 'multiplier');
    
    const expires = duration ? Date.now() + duration * 1000 : null;
    
    await this.storage.hset(
      this.getStorageKey('multipliers'),
      userId,
      {
        value: multiplier,
        expires
      }
    );
    
    await this.emitEvent('multiplier.set', {
      userId,
      multiplier,
      duration,
      expires
    });
    
    return { success: true, multiplier, duration, expires };
  }

  async updateLeaderboards(userId, totalXP, level) {
    // Update XP leaderboard
    await this.storage.zadd(
      this.getStorageKey('leaderboard:xp'),
      totalXP,
      userId
    );
    
    // Update level leaderboard
    await this.storage.zadd(
      this.getStorageKey('leaderboard:level'),
      level,
      userId
    );
  }

  getLevelStructure() {
    const structure = [];
    
    for (const [level, xp] of this.thresholds) {
      structure.push({
        level,
        totalXPRequired: xp,
        xpFromPrevious: level > 1 ? xp - this.thresholds.get(level - 1) : 0,
        rewards: this.config.levelRewards[level] || {}
      });
    }
    
    return structure;
  }

  async getUserStats(userId) {
    const userData = await this.getUserLevel(userId);
    const history = await this.storage.lrange(
      this.getStorageKey(`history:${userId}`),
      0,
      9
    );
    
    const [xpRank, levelRank, prestigeRank] = await Promise.all([
      this.storage.zrevrank(this.getStorageKey('leaderboard:xp'), userId),
      this.storage.zrevrank(this.getStorageKey('leaderboard:level'), userId),
      this.storage.zrevrank(this.getStorageKey('leaderboard:prestige'), userId)
    ]);
    
    return {
      ...userData,
      rankings: {
        xp: xpRank !== null ? xpRank + 1 : null,
        level: levelRank !== null ? levelRank + 1 : null,
        prestige: prestigeRank !== null ? prestigeRank + 1 : null
      },
      recentHistory: history.map(h => JSON.parse(h)),
      nextLevelRewards: this.config.levelRewards[userData.level + 1] || {}
    };
  }

  async resetUser(userId) {
    await super.resetUser(userId);
    
    // Delete user data
    await this.storage.hdel(this.getStorageKey('users'), userId);
    
    // Delete history
    await this.storage.delete(this.getStorageKey(`history:${userId}`));
    
    // Remove from leaderboards
    await this.storage.zrem(this.getStorageKey('leaderboard:xp'), userId);
    await this.storage.zrem(this.getStorageKey('leaderboard:level'), userId);
    await this.storage.zrem(this.getStorageKey('leaderboard:prestige'), userId);
    
    // Remove multipliers
    await this.storage.hdel(this.getStorageKey('multipliers'), userId);
    
    await this.emitEvent('user.reset', { userId });
  }
}