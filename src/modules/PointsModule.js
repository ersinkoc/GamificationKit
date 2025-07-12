import { BaseModule } from './BaseModule.js';
import { validators } from '../utils/validators.js';

export class PointsModule extends BaseModule {
  constructor(options = {}) {
    super('points', options);
    
    this.defaultConfig = {
      dailyLimit: null,
      weeklyLimit: null,
      monthlyLimit: null,
      decayEnabled: false,
      decayDays: 30,
      decayPercentage: 10,
      multipliers: {},
      minimumPoints: 0
    };
  }

  async onInitialize() {
    this.config = { ...this.defaultConfig, ...this.config };
    
    if (this.config.decayEnabled) {
      this.startDecayJob();
    }
  }

  setupEventListeners() {
    // Listen for custom point events
    this.eventManager.on('points.award', async (event) => {
      const { userId, points, reason } = event.data;
      await this.award(userId, points, reason);
    });

    this.eventManager.on('points.deduct', async (event) => {
      const { userId, points, reason } = event.data;
      await this.deduct(userId, points, reason);
    });
  }

  async award(userId, points, reason = 'manual') {
    validators.isUserId(userId);
    validators.isPositiveNumber(points, 'points');
    
    const now = Date.now();
    const multiplier = await this.getActiveMultiplier(userId, reason);
    const actualPoints = Math.floor(points * multiplier);
    
    // Check limits
    const canAward = await this.checkLimits(userId, actualPoints);
    if (!canAward.allowed) {
      this.logger.warn(`Points award blocked for user ${userId}: ${canAward.reason}`);
      await this.emitEvent('award.blocked', {
        userId,
        points: actualPoints,
        reason: canAward.reason
      });
      
      return {
        success: false,
        reason: canAward.reason,
        limit: canAward.limit,
        current: canAward.current
      };
    }
    
    // Award points
    const transaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type: 'award',
      points: actualPoints,
      originalPoints: points,
      multiplier,
      reason,
      timestamp: now
    };
    
    // Update user points
    const newTotal = await this.storage.hincrby(
      this.getStorageKey('users'),
      userId,
      actualPoints
    );
    
    // Record transaction
    await this.storage.lpush(
      this.getStorageKey(`transactions:${userId}`),
      JSON.stringify(transaction)
    );
    
    // Update period totals
    await this.updatePeriodTotals(userId, actualPoints);
    
    // Update leaderboards
    await this.updateLeaderboards(userId, newTotal);
    
    // Emit event
    await this.emitEvent('awarded', {
      userId,
      points: actualPoints,
      total: newTotal,
      transaction
    });
    
    this.logger.info(`Awarded ${actualPoints} points to user ${userId} (${reason})`);
    
    return {
      success: true,
      points: actualPoints,
      total: newTotal,
      transaction
    };
  }

  async deduct(userId, points, reason = 'manual') {
    validators.isUserId(userId);
    validators.isPositiveNumber(points, 'points');
    
    const currentPoints = await this.getPoints(userId);
    
    if (currentPoints < points) {
      return {
        success: false,
        reason: 'insufficient_points',
        current: currentPoints,
        required: points
      };
    }
    
    const transaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type: 'deduct',
      points: -points,
      reason,
      timestamp: Date.now()
    };
    
    // Update user points
    const newTotal = await this.storage.hincrby(
      this.getStorageKey('users'),
      userId,
      -points
    );
    
    // Ensure minimum points
    if (newTotal < this.config.minimumPoints) {
      await this.storage.hset(
        this.getStorageKey('users'),
        userId,
        this.config.minimumPoints
      );
    }
    
    // Record transaction
    await this.storage.lpush(
      this.getStorageKey(`transactions:${userId}`),
      JSON.stringify(transaction)
    );
    
    // Update leaderboards
    await this.updateLeaderboards(userId, newTotal);
    
    // Emit event
    await this.emitEvent('deducted', {
      userId,
      points,
      total: newTotal,
      transaction
    });
    
    this.logger.info(`Deducted ${points} points from user ${userId} (${reason})`);
    
    return {
      success: true,
      points,
      total: newTotal,
      transaction
    };
  }

  async getPoints(userId) {
    validators.isUserId(userId);
    
    const points = await this.storage.hget(
      this.getStorageKey('users'),
      userId
    );
    
    return points || 0;
  }

  async getTopUsers(limit = 10, period = 'all-time') {
    const leaderboardKey = this.getLeaderboardKey(period);
    const results = await this.storage.zrevrange(
      leaderboardKey,
      0,
      limit - 1,
      { withScores: true }
    );
    
    const users = [];
    for (let i = 0; i < results.length; i += 2) {
      users.push({
        userId: results[i],
        points: results[i + 1],
        rank: (i / 2) + 1
      });
    }
    
    return users;
  }

  async getUserRank(userId, period = 'all-time') {
    validators.isUserId(userId);
    
    const leaderboardKey = this.getLeaderboardKey(period);
    const rank = await this.storage.zrevrank(leaderboardKey, userId);
    
    if (rank === null) return null;
    
    const points = await this.storage.zscore(leaderboardKey, userId);
    
    return {
      userId,
      rank: rank + 1,
      points
    };
  }

  async getTransactionHistory(userId, limit = 100) {
    validators.isUserId(userId);
    
    const transactions = await this.storage.lrange(
      this.getStorageKey(`transactions:${userId}`),
      0,
      limit - 1
    );
    
    return transactions.map(t => JSON.parse(t));
  }

  async checkLimits(userId, points) {
    const now = Date.now();
    const checks = [];
    
    if (this.config.dailyLimit) {
      checks.push(this.checkPeriodLimit(userId, points, 'daily', this.config.dailyLimit));
    }
    
    if (this.config.weeklyLimit) {
      checks.push(this.checkPeriodLimit(userId, points, 'weekly', this.config.weeklyLimit));
    }
    
    if (this.config.monthlyLimit) {
      checks.push(this.checkPeriodLimit(userId, points, 'monthly', this.config.monthlyLimit));
    }
    
    const results = await Promise.all(checks);
    const blocked = results.find(r => !r.allowed);
    
    return blocked || { allowed: true };
  }

  async checkPeriodLimit(userId, points, period, limit) {
    const key = this.getPeriodKey(userId, period);
    const current = await this.storage.get(key) || 0;
    
    if (current + points > limit) {
      return {
        allowed: false,
        reason: `${period}_limit_exceeded`,
        limit,
        current,
        remaining: Math.max(0, limit - current)
      };
    }
    
    return { allowed: true };
  }

  async updatePeriodTotals(userId, points) {
    const periods = ['daily', 'weekly', 'monthly'];
    const now = new Date();
    
    for (const period of periods) {
      const key = this.getPeriodKey(userId, period);
      const ttl = this.getPeriodTTL(period, now);
      
      const newTotal = await this.storage.increment(key, points);
      await this.storage.expire(key, ttl);
    }
  }

  async updateLeaderboards(userId, totalPoints) {
    const periods = ['all-time', 'monthly', 'weekly', 'daily'];
    
    for (const period of periods) {
      const key = this.getLeaderboardKey(period);
      await this.storage.zadd(key, totalPoints, userId);
      
      if (period !== 'all-time') {
        const ttl = this.getPeriodTTL(period, new Date());
        await this.storage.expire(key, ttl);
      }
    }
  }

  async getActiveMultiplier(userId, reason) {
    let multiplier = 1;
    
    // Global multipliers
    if (this.config.multipliers.global) {
      multiplier *= this.config.multipliers.global;
    }
    
    // Reason-specific multipliers
    if (this.config.multipliers[reason]) {
      multiplier *= this.config.multipliers[reason];
    }
    
    // Time-based multipliers (e.g., weekend bonus)
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    if (this.config.multipliers.weekend && (dayOfWeek === 0 || dayOfWeek === 6)) {
      multiplier *= this.config.multipliers.weekend;
    }
    
    // User-specific multipliers
    const userMultiplier = await this.storage.hget(
      this.getStorageKey('multipliers'),
      userId
    );
    
    if (userMultiplier) {
      multiplier *= userMultiplier;
    }
    
    // Event-based multipliers
    const eventMultiplier = await this.storage.get(
      this.getStorageKey('event-multiplier')
    );
    
    if (eventMultiplier) {
      multiplier *= eventMultiplier;
    }
    
    return multiplier;
  }

  async setUserMultiplier(userId, multiplier, duration) {
    validators.isUserId(userId);
    validators.isPositiveNumber(multiplier, 'multiplier');
    
    await this.storage.hset(
      this.getStorageKey('multipliers'),
      userId,
      multiplier
    );
    
    if (duration) {
      const key = `${this.getStorageKey('multipliers')}:${userId}`;
      await this.storage.expire(key, duration);
    }
    
    await this.emitEvent('multiplier.set', {
      userId,
      multiplier,
      duration
    });
    
    return { success: true, multiplier, duration };
  }

  async setEventMultiplier(multiplier, duration) {
    validators.isPositiveNumber(multiplier, 'multiplier');
    
    await this.storage.set(
      this.getStorageKey('event-multiplier'),
      multiplier,
      duration
    );
    
    await this.emitEvent('multiplier.event', {
      multiplier,
      duration,
      expiresAt: Date.now() + duration * 1000
    });
    
    return { success: true, multiplier, duration };
  }

  getPeriodKey(userId, period) {
    const now = new Date();
    let suffix;
    
    switch (period) {
      case 'daily':
        suffix = now.toISOString().split('T')[0];
        break;
      case 'weekly':
        const week = this.getWeekNumber(now);
        suffix = `${now.getFullYear()}-W${week}`;
        break;
      case 'monthly':
        suffix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        break;
    }
    
    return this.getStorageKey(`period:${period}:${suffix}:${userId}`);
  }

  getLeaderboardKey(period) {
    const now = new Date();
    let suffix;
    
    switch (period) {
      case 'all-time':
        return this.getStorageKey('leaderboard:all-time');
      case 'daily':
        suffix = now.toISOString().split('T')[0];
        break;
      case 'weekly':
        const week = this.getWeekNumber(now);
        suffix = `${now.getFullYear()}-W${week}`;
        break;
      case 'monthly':
        suffix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        break;
    }
    
    return this.getStorageKey(`leaderboard:${period}:${suffix}`);
  }

  getPeriodTTL(period, now) {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    
    switch (period) {
      case 'daily':
        return Math.floor((endOfDay - now) / 1000) + 1;
      case 'weekly':
        const daysUntilSunday = 7 - now.getDay();
        const endOfWeek = new Date(now);
        endOfWeek.setDate(now.getDate() + daysUntilSunday);
        endOfWeek.setHours(23, 59, 59, 999);
        return Math.floor((endOfWeek - now) / 1000) + 1;
      case 'monthly':
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);
        return Math.floor((endOfMonth - now) / 1000) + 1;
    }
  }

  getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  startDecayJob() {
    // Run decay check daily
    setInterval(async () => {
      await this.processDecay();
    }, 24 * 60 * 60 * 1000);
    
    // Run initial check after a delay
    setTimeout(async () => {
      await this.processDecay();
    }, 60000);
  }

  async processDecay() {
    this.logger.info('Processing point decay...');
    
    const cutoffDate = Date.now() - (this.config.decayDays * 24 * 60 * 60 * 1000);
    const users = await this.storage.hgetall(this.getStorageKey('users'));
    
    for (const [userId, points] of Object.entries(users)) {
      if (points <= this.config.minimumPoints) continue;
      
      // Check last activity
      const lastTransaction = await this.storage.lrange(
        this.getStorageKey(`transactions:${userId}`),
        0,
        0
      );
      
      if (lastTransaction.length === 0) continue;
      
      const transaction = JSON.parse(lastTransaction[0]);
      
      if (transaction.timestamp < cutoffDate) {
        const decayAmount = Math.floor(points * (this.config.decayPercentage / 100));
        
        if (decayAmount > 0) {
          await this.deduct(userId, decayAmount, 'decay');
          this.logger.info(`Decayed ${decayAmount} points from user ${userId}`);
        }
      }
    }
  }

  async getUserStats(userId) {
    const [
      total,
      dailyPoints,
      weeklyPoints,
      monthlyPoints,
      rank,
      transactions
    ] = await Promise.all([
      this.getPoints(userId),
      this.storage.get(this.getPeriodKey(userId, 'daily')) || 0,
      this.storage.get(this.getPeriodKey(userId, 'weekly')) || 0,
      this.storage.get(this.getPeriodKey(userId, 'monthly')) || 0,
      this.getUserRank(userId),
      this.getTransactionHistory(userId, 10)
    ]);
    
    return {
      total,
      daily: dailyPoints,
      weekly: weeklyPoints,
      monthly: monthlyPoints,
      rank: rank?.rank || null,
      recentTransactions: transactions,
      limits: {
        daily: {
          limit: this.config.dailyLimit,
          used: dailyPoints,
          remaining: this.config.dailyLimit ? Math.max(0, this.config.dailyLimit - dailyPoints) : null
        },
        weekly: {
          limit: this.config.weeklyLimit,
          used: weeklyPoints,
          remaining: this.config.weeklyLimit ? Math.max(0, this.config.weeklyLimit - weeklyPoints) : null
        },
        monthly: {
          limit: this.config.monthlyLimit,
          used: monthlyPoints,
          remaining: this.config.monthlyLimit ? Math.max(0, this.config.monthlyLimit - monthlyPoints) : null
        }
      }
    };
  }

  async resetUser(userId) {
    await super.resetUser(userId);
    
    // Delete user points
    await this.storage.hdel(this.getStorageKey('users'), userId);
    
    // Delete transactions
    await this.storage.delete(this.getStorageKey(`transactions:${userId}`));
    
    // Remove from leaderboards
    const leaderboards = await this.storage.keys(this.getStorageKey('leaderboard:*'));
    for (const key of leaderboards) {
      await this.storage.zrem(key, userId);
    }
    
    // Remove multipliers
    await this.storage.hdel(this.getStorageKey('multipliers'), userId);
    
    // Clear period totals
    const periodKeys = await this.storage.keys(this.getStorageKey(`period:*:${userId}`));
    for (const key of periodKeys) {
      await this.storage.delete(key);
    }
    
    await this.emitEvent('user.reset', { userId });
  }
}