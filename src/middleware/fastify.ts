// @ts-nocheck
// Fix BUG-001: Factory function to wrap fastify plugin with context
import type { GamificationKitInstance } from '../types/config.js';
export function fastifyPlugin(gamificationKitInstance) {
  return async function plugin(fastify, options) {
    const gamificationKit = gamificationKitInstance || options.gamificationKit;

    if (!gamificationKit) {
      throw new Error('gamificationKit instance is required');
    }
  
  // Decorate request with gamification helpers
  fastify.decorateRequest('gamification', null);
  
  fastify.addHook('onRequest', async (request, reply) => {
    request.gamification = {
      kit: gamificationKit,
      
      // Track event helper
      track: async (eventName, data = {}) => {
        const userId = data.userId || request.user?.id || request.userId;
        
        if (!userId) {
          throw new Error('userId is required for tracking events');
        }
        
        return gamificationKit.track(eventName, {
          ...data,
          userId,
          request: {
            method: request.method,
            url: request.url,
            ip: request.ip,
            userAgent: request.headers['user-agent']
          }
        });
      },
      
      // Get user stats helper
      getUserStats: async (userId = null) => {
        const id = userId || request.user?.id || request.userId;
        
        if (!id) {
          throw new Error('userId is required');
        }
        
        return gamificationKit.getUserStats(id);
      },
      
      // Award points helper
      awardPoints: async (points, reason = 'manual', userId = null) => {
        const id = userId || request.user?.id || request.userId;
        
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
        const id = userId || request.user?.id || request.userId;
        
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
        const id = userId || request.user?.id || request.userId;
        
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
        const id = userId || request.user?.id || request.userId;
        
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
        const id = userId || request.user?.id || request.userId;
        
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
    request.startTime = Date.now();
  });
  
  // Auto-tracking hook
  if (gamificationKit.config.autoTrack) {
    fastify.addHook('onResponse', async (request, reply) => {
      try {
        // Only track successful responses
        if (reply.statusCode >= 200 && reply.statusCode < 300) {
          const userId = request.user?.id || request.userId;
          
          if (userId) {
            await gamificationKit.track('http.request', {
              userId,
              method: request.method,
              url: request.url,
              statusCode: reply.statusCode,
              duration: Date.now() - request.startTime
            });
          }
        }
      } catch (error) {
        fastify.log.error('Gamification auto-tracking error:', error);
      }
    });
  }
  
  // Register routes
  const prefix = options.prefix || '/gamification';
  
  // User stats
  fastify.get(`${prefix}/stats/:userId?`, async (request, reply) => {
    try {
      const userId = request.params.userId || request.user?.id || request.userId;
      
      if (!userId) {
        return reply.code(400).send({ error: 'userId is required' });
      }
      
      const stats = await gamificationKit.getUserStats(userId);
      return stats;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Points
  fastify.get(`${prefix}/points/:userId?`, async (request, reply) => {
    try {
      const userId = request.params.userId || request.user?.id || request.userId;
      const pointsModule = gamificationKit.modules.get('points');
      
      if (!pointsModule) {
        return reply.code(404).send({ error: 'Points module not found' });
      }
      
      const points = await pointsModule.getPoints(userId);
      return { userId, points };
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  fastify.post(`${prefix}/points/award`, {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'points'],
        properties: {
          userId: { type: 'string' },
          points: { type: 'number' },
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { userId, points, reason } = request.body;
      const pointsModule = gamificationKit.modules.get('points');
      
      if (!pointsModule) {
        return reply.code(404).send({ error: 'Points module not found' });
      }
      
      const result = await pointsModule.award(userId, points, reason);
      return result;
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });
  
  // Badges
  fastify.get(`${prefix}/badges/:userId?`, async (request, reply) => {
    try {
      const userId = request.params.userId || request.user?.id || request.userId;
      const badgeModule = gamificationKit.modules.get('badges');
      
      if (!badgeModule) {
        return reply.code(404).send({ error: 'Badge module not found' });
      }
      
      const badges = await badgeModule.getUserBadges(userId);
      return { userId, badges };
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Levels
  fastify.get(`${prefix}/level/:userId?`, async (request, reply) => {
    try {
      const userId = request.params.userId || request.user?.id || request.userId;
      const levelModule = gamificationKit.modules.get('levels');
      
      if (!levelModule) {
        return reply.code(404).send({ error: 'Level module not found' });
      }
      
      const level = await levelModule.getUserLevel(userId);
      return level;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Leaderboards
  fastify.get(`${prefix}/leaderboards/:type`, {
    schema: {
      params: {
        type: { type: 'string' }
      },
      querystring: {
        page: { type: 'integer', default: 1 },
        limit: { type: 'integer', default: 100 }
      }
    }
  }, async (request, reply) => {
    try {
      const { type } = request.params;
      const { page, limit } = request.query;
      const leaderboardModule = gamificationKit.modules.get('leaderboards');
      
      if (!leaderboardModule) {
        return reply.code(404).send({ error: 'Leaderboard module not found' });
      }
      
      const leaderboard = await leaderboardModule.getLeaderboard(type, {
        page,
        limit
      });
      
      return leaderboard;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Streaks
  fastify.get(`${prefix}/streaks/:userId?`, async (request, reply) => {
    try {
      const userId = request.params.userId || request.user?.id || request.userId;
      const streakModule = gamificationKit.modules.get('streaks');
      
      if (!streakModule) {
        return reply.code(404).send({ error: 'Streak module not found' });
      }
      
      const streaks = await streakModule.getUserStreaks(userId);
      return { userId, streaks };
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Quests
  fastify.get(`${prefix}/quests/:userId?`, async (request, reply) => {
    try {
      const userId = request.params.userId || request.user?.id || request.userId;
      const questModule = gamificationKit.modules.get('quests');
      
      if (!questModule) {
        return reply.code(404).send({ error: 'Quest module not found' });
      }
      
      const quests = await questModule.getUserQuests(userId);
      return { userId, quests };
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Events
  fastify.post(`${prefix}/track`, {
    schema: {
      body: {
        type: 'object',
        required: ['eventName'],
        properties: {
          eventName: { type: 'string' },
          userId: { type: 'string' }
        },
        additionalProperties: true
      }
    }
  }, async (request, reply) => {
    try {
      const { eventName, ...data } = request.body;
      const result = await gamificationKit.track(eventName, data);
      return result;
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });
  
  // Health check
  fastify.get(`${prefix}/health`, async (request, reply) => {
    const health = gamificationKit.getHealth();
    return health;
  });
  
  // WebSocket support
  if (options.websocket !== false) {
    fastify.register(async function (fastify) {
      fastify.get(`${prefix}/ws`, { websocket: true }, (connection, req) => {
        const { socket } = connection;
        const userId = req.query.userId;
        
        if (!userId) {
          socket.close(1008, 'userId required');
          return;
        }
        
        // Subscribe to user events
        const handleEvent = (event) => {
          if (event.data.userId === userId) {
            socket.send(JSON.stringify(event));
          }
        };
        
        gamificationKit.eventManager.onWildcard('*', handleEvent);
        
        socket.on('close', () => {
          gamificationKit.eventManager.removeListener('*', handleEvent);
        });
        
        // Send initial connection message
        socket.send(JSON.stringify({
          type: 'connected',
          userId,
          timestamp: Date.now()
        }));
      });
    });
  }
  };  // End of plugin function
}  // End of factory function

// Export as default for easier import
export default fastifyPlugin;