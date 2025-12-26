import { Logger } from '../utils/logger.js';
import type { StorageInterface } from '../types/storage.js';

/**
 * Advanced Rate Limiter with multiple strategies
 * Supports IP-based, user-based, and distributed rate limiting
 */
export class RateLimiter {
  constructor(options: any = {}) {
    this.logger = new Logger({ prefix: 'RateLimiter', ...options.logger });
    this.strategy = options.strategy || 'sliding-window';
    this.storage = options.storage; // Optional: Redis for distributed
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.max || 100;
    this.keyPrefix = options.keyPrefix || 'ratelimit';

    // Separate limits for authenticated vs anonymous
    this.authenticatedMax = options.authenticatedMax || this.maxRequests * 5;
    this.anonymousMax = options.anonymousMax || this.maxRequests;

    // Skip rate limiting for certain IPs/users
    this.whitelist = new Set(options.whitelist || []);
    this.blacklist = new Set(options.blacklist || []);

    // Local cache for fixed-window and sliding-window
    this.cache = new Map();
    this.cleanupInterval = options.cleanupInterval || 60000;
    this.cleanupTimer = null;

    // Rate limit headers
    this.includeHeaders = options.includeHeaders !== false;

    // Callbacks
    this.onLimitReached = options.onLimitReached;
    this.onRequest = options.onRequest;

    this.startCleanup();
  }

  /**
   * Start periodic cleanup of expired entries
   */
  startCleanup() {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, data] of this.cache.entries()) {
        if (this.strategy === 'fixed-window') {
          if (now > data.resetTime) {
            this.cache.delete(key);
            cleaned++;
          }
        } else if (this.strategy === 'sliding-window') {
          // Remove old requests
          data.requests = data.requests.filter(ts => now - ts < this.windowMs);
          if (data.requests.length === 0) {
            this.cache.delete(key);
            cleaned++;
          }
        } else if (this.strategy === 'token-bucket') {
          // Token buckets don't expire, but we can clean very old ones
          if (now - data.lastRefill > this.windowMs * 10) {
            this.cache.delete(key);
            cleaned++;
          }
        }
      }

      if (cleaned > 0) {
        this.logger.debug(`Cleaned ${cleaned} expired rate limit entries`);
      }
    }, this.cleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Check if request is allowed
   * @param {Object} options - { ip, userId, endpoint }
   * @returns {Object} - { allowed, limit, remaining, resetTime }
   */
  async checkLimit(options: any): Promise<any> {
    const { ip, userId, endpoint } = options;

    // Check whitelist/blacklist
    if (this.whitelist.has(ip) || (userId && this.whitelist.has(userId))) {
      return { allowed: true, limit: Infinity, remaining: Infinity, resetTime: null };
    }

    if (this.blacklist.has(ip) || (userId && this.blacklist.has(userId))) {
      return { allowed: false, limit: 0, remaining: 0, resetTime: null, reason: 'blacklisted' };
    }

    // Determine rate limit based on authentication
    const limit = userId ? this.authenticatedMax : this.anonymousMax;

    // Generate key
    const key = this.generateKey({ ip, userId, endpoint });

    // Check based on strategy
    let result;
    if (this.storage) {
      // Distributed rate limiting with Redis
      result = await this.checkDistributed(key, limit);
    } else {
      // Local rate limiting
      switch (this.strategy) {
        case 'fixed-window':
          result = this.checkFixedWindow(key, limit);
          break;
        case 'sliding-window':
          result = this.checkSlidingWindow(key, limit);
          break;
        case 'token-bucket':
          result = this.checkTokenBucket(key, limit);
          break;
        default:
          result = this.checkSlidingWindow(key, limit);
      }
    }

    // Call callbacks
    if (this.onRequest) {
      this.onRequest({ ...options, ...result });
    }

    if (!result.allowed && this.onLimitReached) {
      this.onLimitReached({ ...options, ...result });
    }

    return result;
  }

  /**
   * Generate cache key
   */
  generateKey({ ip, userId, endpoint }) {
    // Per-user rate limit (if authenticated)
    if (userId) {
      return endpoint ?
        `${this.keyPrefix}:user:${userId}:${endpoint}` :
        `${this.keyPrefix}:user:${userId}`;
    }

    // Per-IP rate limit (anonymous)
    return endpoint ?
      `${this.keyPrefix}:ip:${ip}:${endpoint}` :
      `${this.keyPrefix}:ip:${ip}`;
  }

  /**
   * Fixed window rate limiting
   */
  checkFixedWindow(key, limit) {
    const now = Date.now();
    let data = this.cache.get(key);

    if (!data || now > data.resetTime) {
      // New window
      data = {
        count: 1,
        resetTime: now + this.windowMs
      };
      this.cache.set(key, data);

      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetTime: data.resetTime
      };
    }

    // Existing window
    data.count++;

    if (data.count > limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetTime: data.resetTime
      };
    }

    return {
      allowed: true,
      limit,
      remaining: limit - data.count,
      resetTime: data.resetTime
    };
  }

  /**
   * Sliding window rate limiting (more accurate)
   */
  checkSlidingWindow(key, limit) {
    const now = Date.now();
    let data = this.cache.get(key);

    if (!data) {
      data = { requests: [] };
      this.cache.set(key, data);
    }

    // Remove requests outside the window
    data.requests = data.requests.filter(ts => now - ts < this.windowMs);

    // Add current request
    data.requests.push(now);

    const count = data.requests.length;
    const resetTime = data.requests[0] + this.windowMs;

    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetTime
    };
  }

  /**
   * Token bucket rate limiting (allows bursts)
   */
  checkTokenBucket(key, limit) {
    const now = Date.now();
    let data = this.cache.get(key);

    if (!data) {
      data = {
        tokens: limit,
        lastRefill: now
      };
      this.cache.set(key, data);
    }

    // Refill tokens based on time elapsed
    const timeElapsed = now - data.lastRefill;
    const tokensToAdd = (timeElapsed / this.windowMs) * limit;
    data.tokens = Math.min(limit, data.tokens + tokensToAdd);
    data.lastRefill = now;

    // Try to consume a token
    if (data.tokens >= 1) {
      data.tokens -= 1;

      return {
        allowed: true,
        limit,
        remaining: Math.floor(data.tokens),
        resetTime: now + (this.windowMs * (limit - data.tokens) / limit)
      };
    }

    return {
      allowed: false,
      limit,
      remaining: 0,
      resetTime: now + (this.windowMs * (1 - data.tokens) / limit)
    };
  }

  /**
   * Distributed rate limiting with Redis
   */
  async checkDistributed(key, limit) {
    if (!this.storage || !this.storage.isConnected()) {
      this.logger.warn('Storage not available, falling back to local rate limiting');
      return this.checkSlidingWindow(key, limit);
    }

    try {
      const now = Date.now();
      const windowStart = now - this.windowMs;

      // Use Redis sorted set for sliding window
      // Remove old entries
      await this.storage.zremrangebyscore?.(key, 0, windowStart) ||
            this.storage.zrem?.(key, windowStart);

      // Count current requests
      const count = await this.storage.zcount?.(key, windowStart, now) ||
                   (await this.storage.zrange?.(key, 0, -1) || []).length;

      // Add current request
      if (count < limit) {
        await this.storage.zadd?.(key, now, `${now}-${Math.random()}`);
        await this.storage.expire?.(key, Math.ceil(this.windowMs / 1000));
      }

      // Get oldest request for reset time
      const oldest = await this.storage.zrange?.(key, 0, 0) || [];
      const resetTime = oldest.length > 0 ?
        parseInt(oldest[0]) + this.windowMs :
        now + this.windowMs;

      return {
        allowed: count < limit,
        limit,
        remaining: Math.max(0, limit - count - 1),
        resetTime
      };
    } catch (error) {
      this.logger.error('Distributed rate limiting failed', { error: error.message });
      // Fallback to local
      return this.checkSlidingWindow(key, limit);
    }
  }

  /**
   * Add IP/user to whitelist
   */
  addToWhitelist(identifier) {
    this.whitelist.add(identifier);
    this.logger.info(`Added to whitelist: ${identifier}`);
  }

  /**
   * Remove from whitelist
   */
  removeFromWhitelist(identifier) {
    this.whitelist.delete(identifier);
    this.logger.info(`Removed from whitelist: ${identifier}`);
  }

  /**
   * Add IP/user to blacklist
   */
  addToBlacklist(identifier) {
    this.blacklist.add(identifier);
    this.logger.info(`Added to blacklist: ${identifier}`);
  }

  /**
   * Remove from blacklist
   */
  removeFromBlacklist(identifier) {
    this.blacklist.delete(identifier);
    this.logger.info(`Removed from blacklist: ${identifier}`);
  }

  /**
   * Get rate limit headers
   */
  getHeaders(result) {
    if (!this.includeHeaders) return {};

    const headers = {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString()
    };

    if (result.resetTime) {
      headers['X-RateLimit-Reset'] = Math.ceil(result.resetTime / 1000).toString();
      headers['Retry-After'] = Math.ceil((result.resetTime - Date.now()) / 1000).toString();
    }

    return headers;
  }

  /**
   * Reset rate limit for a key
   */
  async reset(options) {
    const key = this.generateKey(options);

    if (this.storage) {
      await this.storage.delete?.(key);
    } else {
      this.cache.delete(key);
    }

    this.logger.info(`Rate limit reset for: ${key}`);
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      strategy: this.strategy,
      cacheSize: this.cache.size,
      whitelistSize: this.whitelist.size,
      blacklistSize: this.blacklist.size,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests,
      distributed: !!this.storage
    };
  }

  /**
   * Shutdown rate limiter
   */
  shutdown() {
    this.stopCleanup();
    this.cache.clear();
    this.logger.info('Rate limiter shut down');
  }
}

/**
 * Express middleware factory
 */
export function createRateLimitMiddleware(rateLimiter, options = {}) {
  const skipPaths = new Set(options.skipPaths || []);
  const skipSuccessfulRequests = options.skipSuccessfulRequests || false;

  return async (req, res, next) => {
    // Skip if path is in skip list
    if (skipPaths.has(req.path)) {
      return next();
    }

    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.user?.id || req.userId;
    const endpoint = req.path;

    try {
      const result = await rateLimiter.checkLimit({ ip, userId, endpoint });

      // Add headers
      const headers = rateLimiter.getHeaders(result);
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }

      if (!result.allowed) {
        res.status(429).json({
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: headers['Retry-After']
        });
        return;
      }

      // Skip successful requests if configured
      if (skipSuccessfulRequests) {
        res.on('finish', () => {
          if (res.statusCode < 400) {
            // Don't count this request
            rateLimiter.reset({ ip, userId, endpoint });
          }
        });
      }

      next();
    } catch (error) {
      // Log error but don't block request
      rateLimiter.logger.error('Rate limiting error', { error: error.message });
      next();
    }
  };
}
