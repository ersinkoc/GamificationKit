export function koaMiddleware(gamificationKit) {
import type { GamificationKitInstance } from '../types/config.js';
  return async (ctx, next) => {
    // Attach gamification instance to context
    ctx.gamification = {
      kit: gamificationKit,
      
      // Track event helper
      track: async (eventName, data = {}) => {
        const userId = data.userId || ctx.state.user?.id || ctx.userId;
        
        if (!userId) {
          throw new Error('userId is required for tracking events');
        }
        
        return gamificationKit.track(eventName, {
          ...data,
          userId,
          request: {
            method: ctx.method,
            path: ctx.path,
            ip: ctx.ip,
            userAgent: ctx.get('user-agent')
          }
        });
      },
      
      // Get user stats helper
      getUserStats: async (userId = null) => {
        const id = userId || ctx.state.user?.id || ctx.userId;
        
        if (!id) {
          throw new Error('userId is required');
        }
        
        return gamificationKit.getUserStats(id);
      },
      
      // Award points helper
      awardPoints: async (points, reason = 'manual', userId = null) => {
        const id = userId || ctx.state.user?.id || ctx.userId;
        
        if (!id) {
          throw new Error('userId is required');
        }
        
        const pointsModule = gamificationKit.modules.get('points');
        if (!pointsModule) {
          throw new Error('Points module not loaded');
        }
        
        return pointsModule.award(id, points, reason);
      },
      
      // Award badge helper
      awardBadge: async (badgeId, userId = null) => {
        const id = userId || ctx.state.user?.id || ctx.userId;
        
        if (!id) {
          throw new Error('userId is required');
        }
        
        const badgeModule = gamificationKit.modules.get('badges');
        if (!badgeModule) {
          throw new Error('Badge module not loaded');
        }
        
        return badgeModule.award(id, badgeId);
      },
      
      // Add XP helper
      addXP: async (xp, reason = 'manual', userId = null) => {
        const id = userId || ctx.state.user?.id || ctx.userId;
        
        if (!id) {
          throw new Error('userId is required');
        }
        
        const levelModule = gamificationKit.modules.get('levels');
        if (!levelModule) {
          throw new Error('Level module not loaded');
        }
        
        return levelModule.addXP(id, xp, reason);
      },
      
      // Record streak activity
      recordStreak: async (type = 'daily', userId = null) => {
        const id = userId || ctx.state.user?.id || ctx.userId;
        
        if (!id) {
          throw new Error('userId is required');
        }
        
        const streakModule = gamificationKit.modules.get('streaks');
        if (!streakModule) {
          throw new Error('Streak module not loaded');
        }
        
        return streakModule.recordActivity(id, type);
      },
      
      // Update quest progress
      updateQuestProgress: async (questId, objectiveId, increment = 1, userId = null) => {
        const id = userId || ctx.state.user?.id || ctx.userId;
        
        if (!id) {
          throw new Error('userId is required');
        }
        
        const questModule = gamificationKit.modules.get('quests');
        if (!questModule) {
          throw new Error('Quest module not loaded');
        }
        
        return questModule.updateObjectiveProgress(id, questId, objectiveId, increment);
      },
      
      // Get leaderboard
      getLeaderboard: async (type = 'points-all-time', options = {}) => {
        const leaderboardModule = gamificationKit.modules.get('leaderboards');
        if (!leaderboardModule) {
          throw new Error('Leaderboard module not loaded');
        }
        
        return leaderboardModule.getLeaderboard(type, options);
      },
      
      // Module access
      modules: gamificationKit.modules
    };
    
    // Track request start time
    const startTime = Date.now();
    
    try {
      await next();
      
      // Auto-tracking
      if (gamificationKit.config.autoTrack && ctx.status >= 200 && ctx.status < 300) {
        const userId = ctx.state.user?.id || ctx.userId;
        
        if (userId) {
          await gamificationKit.track('http.request', {
            userId,
            method: ctx.method,
            path: ctx.path,
            statusCode: ctx.status,
            duration: Date.now() - startTime
          });
        }
      }
    } catch (error) {
      throw error;
    }
  };
}

// Koa Router factory
// Fix CRIT-011: Support admin authentication for admin routes
export function gamificationRouter(gamificationKit, options = {}) {
  const Router = require('@koa/router');
  const router = new Router({ prefix: '/gamification' });

  // Fix CRIT-011: Admin keys for authorization
  const adminKeys = new Set(options.adminKeys || []);

  // Helper to check admin authorization
  const isAdminRequest = (ctx) => {
    const apiKey = ctx.get('x-api-key');
    return adminKeys.size > 0 && adminKeys.has(apiKey);
  };

  // Fix CRIT-009: Helper to check if user is authorized to access another user's data
  const isAuthorized = (ctx, targetUserId) => {
    // Check for admin API key
    if (isAdminRequest(ctx)) {
      return true;
    }

    // Allow if no target user specified (will default to authenticated user)
    if (!targetUserId) {
      return true;
    }

    // Allow if authenticated user is accessing their own data
    const authenticatedUserId = ctx.state.user?.id || ctx.userId;
    if (authenticatedUserId && authenticatedUserId === targetUserId) {
      return true;
    }

    // If no authentication required (public endpoints mode)
    if (options.publicEndpoints === true) {
      return true;
    }

    // Not authorized
    return false;
  };

  // User stats
  router.get('/stats/:userId?', async (ctx) => {
    try {
      const userId = ctx.params.userId || ctx.state.user?.id || ctx.userId;

      if (!userId) {
        ctx.status = 400;
        ctx.body = { error: 'userId is required' };
        return;
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(ctx, ctx.params.userId)) {
        ctx.status = 403;
        ctx.body = { error: 'Not authorized to access this user\'s data' };
        return;
      }

      const stats = await gamificationKit.getUserStats(userId);
      ctx.body = stats;
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  });

  // Points
  router.get('/points/:userId?', async (ctx) => {
    try {
      const userId = ctx.params.userId || ctx.state.user?.id || ctx.userId;
      const pointsModule = gamificationKit.modules.get('points');

      if (!pointsModule) {
        ctx.status = 404;
        ctx.body = { error: 'Points module not found' };
        return;
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(ctx, ctx.params.userId)) {
        ctx.status = 403;
        ctx.body = { error: 'Not authorized to access this user\'s data' };
        return;
      }

      const points = await pointsModule.getPoints(userId);
      ctx.body = { userId, points };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  });
  
  router.post('/points/award', async (ctx) => {
    try {
      const { userId, points, reason } = ctx.request.body;

      // Fix CRIT-008: Validate input before processing
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        ctx.status = 400;
        ctx.body = { error: 'userId is required and must be a non-empty string' };
        return;
      }

      if (typeof points !== 'number' || !Number.isFinite(points)) {
        ctx.status = 400;
        ctx.body = { error: 'points must be a finite number' };
        return;
      }

      if (points <= 0) {
        ctx.status = 400;
        ctx.body = { error: 'points must be greater than 0' };
        return;
      }

      // Enforce reasonable maximum to prevent abuse
      const MAX_POINTS = 1000000;
      if (points > MAX_POINTS) {
        ctx.status = 400;
        ctx.body = { error: `points cannot exceed ${MAX_POINTS}` };
        return;
      }

      const pointsModule = gamificationKit.modules.get('points');

      if (!pointsModule) {
        ctx.status = 404;
        ctx.body = { error: 'Points module not found' };
        return;
      }

      const result = await pointsModule.award(userId.trim(), points, reason);
      ctx.body = result;
    } catch (error) {
      ctx.status = 400;
      ctx.body = { error: error.message };
    }
  });
  
  // Badges
  router.get('/badges/:userId?', async (ctx) => {
    try {
      const userId = ctx.params.userId || ctx.state.user?.id || ctx.userId;
      const badgeModule = gamificationKit.modules.get('badges');

      if (!badgeModule) {
        ctx.status = 404;
        ctx.body = { error: 'Badge module not found' };
        return;
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(ctx, ctx.params.userId)) {
        ctx.status = 403;
        ctx.body = { error: 'Not authorized to access this user\'s data' };
        return;
      }

      const badges = await badgeModule.getUserBadges(userId);
      ctx.body = { userId, badges };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  });

  // Levels
  router.get('/level/:userId?', async (ctx) => {
    try {
      const userId = ctx.params.userId || ctx.state.user?.id || ctx.userId;
      const levelModule = gamificationKit.modules.get('levels');

      if (!levelModule) {
        ctx.status = 404;
        ctx.body = { error: 'Level module not found' };
        return;
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(ctx, ctx.params.userId)) {
        ctx.status = 403;
        ctx.body = { error: 'Not authorized to access this user\'s data' };
        return;
      }

      const level = await levelModule.getUserLevel(userId);
      ctx.body = level;
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  });
  
  // Leaderboards
  router.get('/leaderboards/:type', async (ctx) => {
    try {
      const { type } = ctx.params;
      const { page = 1, limit = 100 } = ctx.query;
      const leaderboardModule = gamificationKit.modules.get('leaderboards');
      
      if (!leaderboardModule) {
        ctx.status = 404;
        ctx.body = { error: 'Leaderboard module not found' };
        return;
      }
      
      const leaderboard = await leaderboardModule.getLeaderboard(type, {
        page: parseInt(page),
        limit: parseInt(limit)
      });
      
      ctx.body = leaderboard;
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  });
  
  // Streaks
  router.get('/streaks/:userId?', async (ctx) => {
    try {
      const userId = ctx.params.userId || ctx.state.user?.id || ctx.userId;
      const streakModule = gamificationKit.modules.get('streaks');

      if (!streakModule) {
        ctx.status = 404;
        ctx.body = { error: 'Streak module not found' };
        return;
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(ctx, ctx.params.userId)) {
        ctx.status = 403;
        ctx.body = { error: 'Not authorized to access this user\'s data' };
        return;
      }

      const streaks = await streakModule.getUserStreaks(userId);
      ctx.body = { userId, streaks };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  });

  // Quests
  router.get('/quests/:userId?', async (ctx) => {
    try {
      const userId = ctx.params.userId || ctx.state.user?.id || ctx.userId;
      const questModule = gamificationKit.modules.get('quests');

      if (!questModule) {
        ctx.status = 404;
        ctx.body = { error: 'Quest module not found' };
        return;
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(ctx, ctx.params.userId)) {
        ctx.status = 403;
        ctx.body = { error: 'Not authorized to access this user\'s data' };
        return;
      }

      const quests = await questModule.getUserQuests(userId);
      ctx.body = { userId, quests };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  });

  // Achievements
  router.get('/achievements/:userId?', async (ctx) => {
    try {
      const userId = ctx.params.userId || ctx.state.user?.id || ctx.userId;
      const achievementModule = gamificationKit.modules.get('achievements');

      if (!achievementModule) {
        ctx.status = 404;
        ctx.body = { error: 'Achievement module not found' };
        return;
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(ctx, ctx.params.userId)) {
        ctx.status = 403;
        ctx.body = { error: 'Not authorized to access this user\'s data' };
        return;
      }

      const achievements = await achievementModule.getUserAchievements(userId);
      ctx.body = { userId, achievements };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  });
  
  // Events
  router.post('/track', async (ctx) => {
    try {
      const { eventName, ...data } = ctx.request.body;
      
      if (!eventName) {
        ctx.status = 400;
        ctx.body = { error: 'eventName is required' };
        return;
      }
      
      const result = await gamificationKit.track(eventName, data);
      ctx.body = result;
    } catch (error) {
      ctx.status = 400;
      ctx.body = { error: error.message };
    }
  });
  
  // Health check
  router.get('/health', async (ctx) => {
    const health = gamificationKit.getHealth();
    ctx.body = health;
  });
  
  // Admin routes
  // Fix CRIT-011: Require admin authentication for admin routes
  router.post('/admin/reset/:userId', async (ctx) => {
    try {
      // Fix CRIT-011: Check admin authorization
      if (!isAdminRequest(ctx)) {
        ctx.status = 403;
        ctx.body = { error: 'Admin access required' };
        return;
      }

      const { userId } = ctx.params;

      // Validate userId
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        ctx.status = 400;
        ctx.body = { error: 'userId is required' };
        return;
      }

      const result = await gamificationKit.resetUser(userId.trim());
      ctx.body = result;
    } catch (error) {
      ctx.status = 400;
      ctx.body = { error: error.message };
    }
  });

  router.post('/admin/award', async (ctx) => {
    try {
      // Fix CRIT-011: Check admin authorization
      if (!isAdminRequest(ctx)) {
        ctx.status = 403;
        ctx.body = { error: 'Admin access required' };
        return;
      }

      const { userId, type, value, reason } = ctx.request.body;

      if (!userId || !type || value === undefined) {
        ctx.status = 400;
        ctx.body = { error: 'userId, type, and value are required' };
        return;
      }

      // Fix: Validate value is positive and finite
      if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) {
          ctx.status = 400;
          ctx.body = { error: 'value must be a positive finite number' };
          return;
        }
        const MAX_VALUE = 1000000;
        if (value > MAX_VALUE) {
          ctx.status = 400;
          ctx.body = { error: `value cannot exceed ${MAX_VALUE}` };
          return;
        }
      }

      let result;

      switch (type) {
        case 'points':
          const pointsModule = gamificationKit.modules.get('points');
          if (pointsModule) {
            result = await pointsModule.award(userId, value, reason);
          }
          break;

        case 'badge':
          const badgeModule = gamificationKit.modules.get('badges');
          if (badgeModule) {
            result = await badgeModule.award(userId, value);
          }
          break;

        case 'xp':
          const levelModule = gamificationKit.modules.get('levels');
          if (levelModule) {
            result = await levelModule.addXP(userId, value, reason);
          }
          break;

        default:
          ctx.status = 400;
          ctx.body = { error: `Unknown award type: ${type}` };
          return;
      }

      if (!result) {
        ctx.status = 404;
        ctx.body = { error: `Module not found for type: ${type}` };
        return;
      }

      ctx.body = { success: true, result };
    } catch (error) {
      ctx.status = 400;
      ctx.body = { error: error.message };
    }
  });
  
  return router;
}

// WebSocket middleware for Koa
// Fix CRIT-010: Add authentication support for WebSocket connections
export function gamificationWebSocket(gamificationKit, app, options = {}) {
  const WebSocket = require('ws');

  // Admin/auth tokens for WebSocket authentication
  const validTokens = new Set(options.authTokens || []);
  const adminKeys = new Set(options.adminKeys || []);

  // Token validator function (can be overridden via options)
  const validateToken = options.validateToken || ((token, userId) => {
    // Default: check against static token list or admin keys
    return validTokens.has(token) || adminKeys.has(token);
  });

  app.use(async (ctx, next) => {
    if (ctx.path === '/gamification/ws' && ctx.get('upgrade') === 'websocket') {
      const userId = ctx.query.userId;
      const token = ctx.query.token;

      if (!userId) {
        ctx.status = 400;
        ctx.body = 'userId required';
        return;
      }

      // Fix CRIT-010: Require authentication unless explicitly disabled
      if (options.requireAuth !== false) {
        if (!token) {
          ctx.status = 401;
          ctx.body = 'Authentication token required';
          return;
        }

        // Validate the token
        let isValid = false;
        try {
          isValid = await validateToken(token, userId);
        } catch (error) {
          console.error('WebSocket token validation error:', error);
          isValid = false;
        }

        if (!isValid) {
          ctx.status = 401;
          ctx.body = 'Invalid authentication token';
          return;
        }
      }

      const wss = new WebSocket.Server({ noServer: true });

      ctx.respond = false;

      wss.handleUpgrade(ctx.req, ctx.request.socket, Buffer.alloc(0), (ws) => {
        // Subscribe to user events
        const handleEvent = (event) => {
          if (event.data.userId === userId) {
            ws.send(JSON.stringify(event));
          }
        };

        gamificationKit.eventManager.onWildcard('*', handleEvent);

        ws.on('close', () => {
          gamificationKit.eventManager.removeListener('*', handleEvent);
        });

        // Send initial connection message
        ws.send(JSON.stringify({
          type: 'connected',
          userId,
          timestamp: Date.now()
        }));
      });
    } else {
      await next();
    }
  });
}