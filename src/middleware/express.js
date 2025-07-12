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
export function gamificationRoutes(gamificationKit) {
  const router = require('express').Router();
  
  // User stats
  router.get('/stats/:userId?', async (req, res) => {
    try {
      const userId = req.params.userId || req.user?.id || req.userId;
      
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
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
      
      const points = await pointsModule.getPoints(userId);
      res.json({ userId, points });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  router.post('/points/award', async (req, res) => {
    try {
      const { userId, points, reason } = req.body;
      const pointsModule = gamificationKit.modules.get('points');
      
      if (!pointsModule) {
        return res.status(404).json({ error: 'Points module not found' });
      }
      
      const result = await pointsModule.award(userId, points, reason);
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
export function gamificationWebSocket(gamificationKit, server) {
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws, req) => {
    const userId = req.url.split('?userId=')[1];
    
    if (!userId) {
      ws.close(1008, 'userId required');
      return;
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