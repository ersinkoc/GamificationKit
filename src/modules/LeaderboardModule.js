import { BaseModule } from './BaseModule.js';
import { validators } from '../utils/validators.js';

export class LeaderboardModule extends BaseModule {
  constructor(options = {}) {
    super('leaderboards', options);
    
    this.defaultConfig = {
      updateInterval: 60000, // 1 minute
      cacheExpiry: 300, // 5 minutes
      defaultPageSize: 100,
      maxPageSize: 1000,
      enableRealtime: true,
      periods: ['daily', 'weekly', 'monthly', 'all-time'],
      customLeaderboards: []
    };
    
    // Merge config early for constructor tests
    this.config = this.mergeDeep(this.defaultConfig, options);
    
    this.updateQueues = new Map();
    this.caches = new Map();
    this.updateIntervalId = null;
  }

  async onInitialize() {
    // Deep merge config to properly handle nested objects
    this.config = this.mergeDeep(this.defaultConfig, this.config);
    
    // Initialize custom leaderboards
    for (const leaderboard of this.config.customLeaderboards) {
      await this.createLeaderboard(leaderboard);
    }
    
    // Start update interval if real-time is disabled
    if (!this.config.enableRealtime) {
      this.startBatchUpdates();
    }
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

  setupEventListeners() {
    // Listen for score updates
    this.eventManager.on('leaderboard.update', async (event) => {
      const { leaderboardId, userId, score, increment } = event.data;
      
      if (this.config.enableRealtime) {
        await this.updateScore(leaderboardId, userId, score, increment);
      } else {
        this.queueUpdate(leaderboardId, userId, score, increment);
      }
    });
    
    // Listen for points events to update default leaderboards
    this.eventManager.on('points.awarded', async (event) => {
      const { userId, total } = event.data;
      
      for (const period of this.config.periods) {
        const leaderboardId = `points-${period}`;
        
        if (this.config.enableRealtime) {
          await this.updateScore(leaderboardId, userId, total);
        } else {
          this.queueUpdate(leaderboardId, userId, total);
        }
      }
    });
  }

  async createLeaderboard(config) {
    validators.hasProperties(config, ['id', 'name'], 'leaderboard config');
    
    const leaderboard = {
      id: config.id,
      name: config.name,
      description: config.description || '',
      scoreType: config.scoreType || 'numeric',
      order: config.order || 'desc',
      resetPeriod: config.resetPeriod || null,
      metadata: config.metadata || {},
      createdAt: Date.now()
    };
    
    await this.storage.hset(
      this.getStorageKey('definitions'),
      config.id,
      leaderboard
    );
    
    this.logger.info(`Leaderboard created: ${config.id}`);
    
    return leaderboard;
  }

  async updateScore(leaderboardId, userId, score, increment = false) {
    validators.isNonEmptyString(leaderboardId, 'leaderboardId');
    validators.isUserId(userId);
    
    const key = this.getLeaderboardKey(leaderboardId);
    
    let newScore;
    if (increment) {
      newScore = await this.storage.zincrby(key, score, userId);
    } else {
      await this.storage.zadd(key, score, userId);
      newScore = score;
    }
    
    // Invalidate cache
    this.invalidateCache(leaderboardId);
    
    // Set expiry for periodic leaderboards
    await this.setLeaderboardExpiry(leaderboardId, key);
    
    // Emit update event
    await this.emitEvent('score.updated', {
      leaderboardId,
      userId,
      score: newScore,
      timestamp: Date.now()
    });
    
    return {
      leaderboardId,
      userId,
      score: newScore
    };
  }

  async getLeaderboard(leaderboardId, options = {}) {
    validators.isNonEmptyString(leaderboardId, 'leaderboardId');
    
    const {
      page = 1,
      limit = this.config.defaultPageSize,
      includeUser = null,
      nearbyCount = 5
    } = options;
    
    const pageSize = Math.min(limit, this.config.maxPageSize);
    const offset = (page - 1) * pageSize;
    
    // Check cache
    const cacheKey = `${leaderboardId}:${page}:${pageSize}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const key = this.getLeaderboardKey(leaderboardId);
    
    // Get total count
    const totalCount = await this.storage.zcount(key, '-inf', '+inf');
    
    // Get page data
    const results = await this.storage.zrevrange(
      key,
      offset,
      offset + pageSize - 1,
      { withScores: true }
    );
    
    const entries = [];
    
    // Handle different storage implementations result formats
    if (Array.isArray(results)) {
      // Handle Redis/MemoryStorage result format [userId, score, userId, score...]
      for (let i = 0; i < results.length; i += 2) {
        entries.push({
          rank: offset + (i / 2) + 1,
          userId: results[i],
          score: parseInt(results[i + 1])
        });
      }
    } else if (results && typeof results === 'object') {
      // Handle object format from some storage implementations
      let rankIndex = 0;
      for (const [userId, score] of Object.entries(results)) {
        entries.push({
          rank: offset + rankIndex + 1,
          userId,
          score: parseInt(score)
        });
        rankIndex++;
      }
    }
    
    const response = {
      leaderboardId,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      totalCount,
      entries
    };
    
    // Include user's position if requested
    if (includeUser) {
      const userPosition = await this.getUserPosition(leaderboardId, includeUser, {
        nearbyCount
      });
      response.userPosition = userPosition;
    }
    
    // Cache the response
    this.setCache(cacheKey, response);
    
    return response;
  }

  async getUserPosition(leaderboardId, userId, options = {}) {
    validators.isNonEmptyString(leaderboardId, 'leaderboardId');
    validators.isUserId(userId);
    
    const { nearbyCount = 5 } = options;
    
    const key = this.getLeaderboardKey(leaderboardId);
    
    // Get user's rank and score
    const [rank, score] = await Promise.all([
      this.storage.zrevrank(key, userId),
      this.storage.zscore(key, userId)
    ]);
    
    if (rank === null) {
      return null;
    }
    
    const position = {
      userId,
      rank: rank + 1,
      score
    };
    
    // Get nearby users if requested
    if (nearbyCount > 0) {
      const start = Math.max(0, rank - nearbyCount);
      const end = rank + nearbyCount;
      
      const nearby = await this.storage.zrevrange(
        key,
        start,
        end,
        { withScores: true }
      );
      
      position.nearby = [];
      for (let i = 0; i < nearby.length; i += 2) {
        if (nearby[i] !== userId) {
          position.nearby.push({
            rank: start + (i / 2) + 1,
            userId: nearby[i],
            score: nearby[i + 1]
          });
        }
      }
    }
    
    return position;
  }

  async getMultipleLeaderboards(leaderboardIds, options = {}) {
    const results = await Promise.all(
      leaderboardIds.map(id => this.getLeaderboard(id, options))
    );
    
    return results.reduce((acc, result) => {
      acc[result.leaderboardId] = result;
      return acc;
    }, {});
  }

  async getUserRankings(userId, leaderboardIds = null) {
    validators.isUserId(userId);
    
    const ids = leaderboardIds || this.config.periods.map(p => `points-${p}`);
    const rankings = {};
    
    for (const id of ids) {
      const position = await this.getUserPosition(id, userId);
      if (position) {
        rankings[id] = {
          rank: position.rank,
          score: position.score
        };
      }
    }
    
    return rankings;
  }

  async removeUser(leaderboardId, userId) {
    validators.isNonEmptyString(leaderboardId, 'leaderboardId');
    validators.isUserId(userId);
    
    const key = this.getLeaderboardKey(leaderboardId);
    const removed = await this.storage.zrem(key, userId);
    
    if (removed > 0) {
      this.invalidateCache(leaderboardId);
      
      await this.emitEvent('user.removed', {
        leaderboardId,
        userId
      });
    }
    
    return { success: removed > 0 };
  }

  async resetLeaderboard(leaderboardId) {
    validators.isNonEmptyString(leaderboardId, 'leaderboardId');
    
    const key = this.getLeaderboardKey(leaderboardId);
    await this.storage.delete(key);
    
    this.invalidateCache(leaderboardId);
    
    await this.emitEvent('reset', {
      leaderboardId,
      timestamp: Date.now()
    });
    
    this.logger.info(`Leaderboard reset: ${leaderboardId}`);
    
    return { success: true };
  }

  async archiveLeaderboard(leaderboardId) {
    validators.isNonEmptyString(leaderboardId, 'leaderboardId');
    
    const key = this.getLeaderboardKey(leaderboardId);
    const archiveKey = this.getStorageKey(`archive:${leaderboardId}:${Date.now()}`);
    
    // Get all entries
    const entries = await this.storage.zrevrange(key, 0, -1, { withScores: true });
    
    if (entries.length > 0) {
      // Store archive
      const archive = {
        leaderboardId,
        archivedAt: Date.now(),
        entries: []
      };
      
      for (let i = 0; i < entries.length; i += 2) {
        archive.entries.push({
          rank: (i / 2) + 1,
          userId: entries[i],
          score: entries[i + 1]
        });
      }
      
      await this.storage.set(archiveKey, archive);
      
      // Store archive reference
      await this.storage.lpush(
        this.getStorageKey(`archives:${leaderboardId}`),
        archiveKey
      );
    }
    
    return { success: true, entriesArchived: entries.length / 2 };
  }

  async getArchives(leaderboardId, limit = 10) {
    validators.isNonEmptyString(leaderboardId, 'leaderboardId');
    
    const archiveKeys = await this.storage.lrange(
      this.getStorageKey(`archives:${leaderboardId}`),
      0,
      limit - 1
    );
    
    const archives = [];
    for (const key of archiveKeys) {
      const archive = await this.storage.get(key);
      if (archive) {
        archives.push(archive);
      }
    }
    
    return archives;
  }

  getLeaderboardKey(leaderboardId) {
    const [type, period] = leaderboardId.split('-');
    
    if (this.config.periods.includes(period)) {
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
        case 'all-time':
          return this.getStorageKey(`board:${leaderboardId}`);
      }
      
      return this.getStorageKey(`board:${leaderboardId}:${suffix}`);
    }
    
    return this.getStorageKey(`board:${leaderboardId}`);
  }

  async setLeaderboardExpiry(leaderboardId, key) {
    const [type, period] = leaderboardId.split('-');
    
    if (!this.config.periods.includes(period) || period === 'all-time') {
      return;
    }
    
    const now = new Date();
    let ttl;
    
    switch (period) {
      case 'daily':
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        ttl = Math.floor((endOfDay - now) / 1000) + 1;
        break;
      case 'weekly':
        const daysUntilSunday = 7 - now.getDay();
        const endOfWeek = new Date(now);
        endOfWeek.setDate(now.getDate() + daysUntilSunday);
        endOfWeek.setHours(23, 59, 59, 999);
        ttl = Math.floor((endOfWeek - now) / 1000) + 1;
        break;
      case 'monthly':
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);
        ttl = Math.floor((endOfMonth - now) / 1000) + 1;
        break;
    }
    
    if (ttl) {
      await this.storage.expire(key, ttl);
    }
  }

  getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  queueUpdate(leaderboardId, userId, score, increment) {
    if (!this.updateQueues.has(leaderboardId)) {
      this.updateQueues.set(leaderboardId, []);
    }
    
    this.updateQueues.get(leaderboardId).push({
      userId,
      score,
      increment,
      timestamp: Date.now()
    });
  }

  startBatchUpdates() {
    this.updateIntervalId = setInterval(async () => {
      await this.processBatchUpdates();
    }, this.config.updateInterval);
  }

  async processBatchUpdates() {
    for (const [leaderboardId, updates] of this.updateQueues) {
      if (updates.length === 0) continue;
      
      const key = this.getLeaderboardKey(leaderboardId);
      const operations = [];
      
      // Group updates by user
      const userUpdates = new Map();
      
      for (const update of updates) {
        if (!userUpdates.has(update.userId)) {
          userUpdates.set(update.userId, {
            score: 0,
            increment: false
          });
        }
        
        const current = userUpdates.get(update.userId);
        
        if (update.increment) {
          current.score += update.score;
          current.increment = true;
        } else {
          current.score = update.score;
          current.increment = false;
        }
      }
      
      // Apply updates
      for (const [userId, update] of userUpdates) {
        if (update.increment) {
          operations.push({
            method: 'zincrby',
            args: [key, update.score, userId]
          });
        } else {
          operations.push({
            method: 'zadd',
            args: [key, update.score, userId]
          });
        }
      }
      
      if (operations.length > 0) {
        await this.storage.transaction(operations);
        this.invalidateCache(leaderboardId);
      }
      
      // Clear queue
      this.updateQueues.set(leaderboardId, []);
    }
  }

  getFromCache(key) {
    const cached = this.caches.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.config.cacheExpiry * 1000) {
      this.caches.delete(key);
      return null;
    }
    
    return cached.data;
  }

  setCache(key, data) {
    this.caches.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  invalidateCache(leaderboardId) {
    const keysToDelete = [];
    
    for (const key of this.caches.keys()) {
      if (key.startsWith(leaderboardId)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.caches.delete(key));
  }

  async getUserStats(userId) {
    const rankings = await this.getUserRankings(userId);
    
    const stats = {
      rankings,
      topRanking: null,
      averageRank: null
    };
    
    const ranks = Object.values(rankings).map(r => r.rank).filter(r => r !== null);
    
    if (ranks.length > 0) {
      stats.topRanking = {
        leaderboard: Object.entries(rankings).find(([k, v]) => v.rank === Math.min(...ranks))[0],
        rank: Math.min(...ranks)
      };
      
      stats.averageRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    }
    
    return stats;
  }

  async resetUser(userId) {
    await super.resetUser(userId);
    
    // Remove from all leaderboards
    const leaderboards = await this.storage.keys(this.getStorageKey('board:*'));
    
    for (const key of leaderboards) {
      await this.storage.zrem(key, userId);
    }
    
    // Invalidate all caches
    this.caches.clear();
    
    await this.emitEvent('user.reset', { userId });
  }

  // Backward compatibility method for tests
  async update(userId, score, leaderboardId = 'global') {
    return await this.updateScore(leaderboardId, userId, score);
  }

  // Method for periodic reset checks (used in tests)
  async checkPeriodicResets() {
    // This would normally be triggered by a cron job or scheduler
    // For testing purposes, we'll reset weekly and monthly leaderboards
    const now = new Date();
    
    // Check weekly reset (Monday at midnight)
    if (now.getDay() === 1 && now.getHours() === 0) {
      const weeklyBoards = await this.storage.keys(this.getStorageKey('board:*weekly*'));
      for (const key of weeklyBoards) {
        await this.storage.delete(key);
      }
    }
    
    // Check monthly reset (1st of month at midnight)
    if (now.getDate() === 1 && now.getHours() === 0) {
      const monthlyBoards = await this.storage.keys(this.getStorageKey('board:*monthly*'));
      for (const key of monthlyBoards) {
        await this.storage.delete(key);
      }
    }
  }

  async shutdown() {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      
      // Process any remaining updates
      await this.processBatchUpdates();
    }
    
    await super.shutdown();
  }
}