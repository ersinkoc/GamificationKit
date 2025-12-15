export function expressMiddleware(gamificationKit) {
  return async (req, res, next) => {
    // Attach gamification instance to request
    req.gamification = {
      kit: gamificationKit,
      
      // Track event helper
      track: async (eventName, data = {}) => {
        const userId = data.userId || req.user?.id || req.userId;
        
        if (!userId) {
          throw new Error('userId is required for tracking events');
        }
        
        return gamificationKit.track(eventName, {
          ...data,
          userId,
          request: {
            method: req.method,
            path: req.path,
            ip: req.ip,
            userAgent: req.get('user-agent')
          }
        });
      },
      
      // Get user stats helper
      getUserStats: async (userId = null) => {
        const id = userId || req.user?.id || req.userId;
        
        if (!id) {
          throw new Error('userId is required');
        }
        
        return gamificationKit.getUserStats(id);
      },
      
      // Award points helper
      awardPoints: async (points, reason = 'manual', userId = null) => {
        const id = userId || req.user?.id || req.userId;
        
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
        const id = userId || req.user?.id || req.userId;
        
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
        const id = userId || req.user?.id || req.userId;
        
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
        const id = userId || req.user?.id || req.userId;
        
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
        const id = userId || req.user?.id || req.userId;
        
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
    
    // Auto-tracking middleware
    res.on('finish', async () => {
      try {
        // Only track successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const userId = req.user?.id || req.userId;
          
          if (userId && gamificationKit.config.autoTrack) {
            await gamificationKit.track('http.request', {
              userId,
              method: req.method,
              path: req.path,
              statusCode: res.statusCode,
              duration: Date.now() - req._startTime
            });
          }
        }
      } catch (error) {
        console.error('Gamification auto-tracking error:', error);
      }
    });
    
    // Track request start time
    req._startTime = Date.now();
    
    next();
  };
}

// Route helpers
// Fix CRIT-009: Add authorization support for user endpoints
export function gamificationRoutes(gamificationKit, options = {}) {
  const router = require('express').Router();

  // Admin keys for bypassing authorization
  const adminKeys = new Set(options.adminKeys || []);

  // Fix CRIT-009: Helper to check if user is authorized to access another user's data
  const isAuthorized = (req, targetUserId) => {
    // Check for admin API key
    const apiKey = req.get('x-api-key');
    if (apiKey && adminKeys.has(apiKey)) {
      return true;
    }

    // Allow if no target user specified (will default to authenticated user)
    if (!targetUserId) {
      return true;
    }

    // Allow if authenticated user is accessing their own data
    const authenticatedUserId = req.user?.id || req.userId;
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
  router.get('/stats/:userId?', async (req, res) => {
    try {
      const userId = req.params.userId || req.user?.id || req.userId;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(req, req.params.userId)) {
        return res.status(403).json({ error: 'Not authorized to access this user\'s data' });
      }

      const stats = await gamificationKit.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Points
  router.get('/points/:userId?', async (req, res) => {
    try {
      const userId = req.params.userId || req.user?.id || req.userId;
      const pointsModule = gamificationKit.modules.get('points');

      if (!pointsModule) {
        return res.status(404).json({ error: 'Points module not found' });
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(req, req.params.userId)) {
        return res.status(403).json({ error: 'Not authorized to access this user\'s data' });
      }

      const points = await pointsModule.getPoints(userId);
      res.json({ userId, points });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  router.post('/points/award', async (req, res) => {
    try {
      const { userId, points, reason } = req.body;

      // Fix CRIT-008: Validate input before processing
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        return res.status(400).json({ error: 'userId is required and must be a non-empty string' });
      }

      if (typeof points !== 'number' || !Number.isFinite(points)) {
        return res.status(400).json({ error: 'points must be a finite number' });
      }

      if (points <= 0) {
        return res.status(400).json({ error: 'points must be greater than 0' });
      }

      // Enforce reasonable maximum to prevent abuse
      const MAX_POINTS = 1000000;
      if (points > MAX_POINTS) {
        return res.status(400).json({ error: `points cannot exceed ${MAX_POINTS}` });
      }

      const pointsModule = gamificationKit.modules.get('points');

      if (!pointsModule) {
        return res.status(404).json({ error: 'Points module not found' });
      }

      const result = await pointsModule.award(userId.trim(), points, reason);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
  
  // Badges
  router.get('/badges/:userId?', async (req, res) => {
    try {
      const userId = req.params.userId || req.user?.id || req.userId;
      const badgeModule = gamificationKit.modules.get('badges');

      if (!badgeModule) {
        return res.status(404).json({ error: 'Badge module not found' });
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(req, req.params.userId)) {
        return res.status(403).json({ error: 'Not authorized to access this user\'s data' });
      }

      const badges = await badgeModule.getUserBadges(userId);
      res.json({ userId, badges });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Levels
  router.get('/level/:userId?', async (req, res) => {
    try {
      const userId = req.params.userId || req.user?.id || req.userId;
      const levelModule = gamificationKit.modules.get('levels');

      if (!levelModule) {
        return res.status(404).json({ error: 'Level module not found' });
      }

      // Fix CRIT-009: Check authorization
      if (!isAuthorized(req, req.params.userId)) {
        return res.status(403).json({ error: 'Not authorized to access this user\'s data' });
      }

      const level = await levelModule.getUserLevel(userId);
      res.json(level);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Leaderboards
  router.get('/leaderboards/:type', async (req, res) => {
    try {
      const { type } = req.params;
      const { page = 1, limit = 100 } = req.query;
      const leaderboardModule = gamificationKit.modules.get('leaderboards');
      
      if (!leaderboardModule) {
        return res.status(404).json({ error: 'Leaderboard module not found' });
      }
      
      const leaderboard = await leaderboardModule.getLeaderboard(type, {
        page: parseInt(page),
        limit: parseInt(limit)
      });
      
      res.json(leaderboard);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Events
  router.post('/track', async (req, res) => {
    try {
      const { eventName, ...data } = req.body;
      
      if (!eventName) {
        return res.status(400).json({ error: 'eventName is required' });
      }
      
      const result = await gamificationKit.track(eventName, data);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
  
  // Health check
  router.get('/health', (req, res) => {
    const health = gamificationKit.getHealth();
    res.json(health);
  });
  
  return router;
}

// WebSocket support for Express
// Fix CRIT-010: Add authentication support for WebSocket connections
export function gamificationWebSocket(gamificationKit, server, options = {}) {
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server });

  // Admin/auth tokens for WebSocket authentication
  const validTokens = new Set(options.authTokens || []);
  const adminKeys = new Set(options.adminKeys || []);

  // Token validator function (can be overridden via options)
  const validateToken = options.validateToken || ((token, userId) => {
    // Default: check against static token list or admin keys
    return validTokens.has(token) || adminKeys.has(token);
  });

  wss.on('connection', async (ws, req) => {
    // Parse query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    const token = url.searchParams.get('token');

    if (!userId) {
      ws.close(1008, 'userId required');
      return;
    }

    // Fix CRIT-010: Require authentication unless explicitly disabled
    if (options.requireAuth !== false) {
      if (!token) {
        ws.close(1008, 'Authentication token required');
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
        ws.close(1008, 'Invalid authentication token');
        return;
      }
    }

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

  return wss;
}