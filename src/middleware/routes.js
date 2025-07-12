import express from 'express';

export function gamificationRoutes(gamificationKit) {
  const router = express.Router();

  // Middleware to check if gamification kit is initialized
  router.use((req, res, next) => {
    if (!gamificationKit.initialized) {
      return res.status(503).json({ error: 'Gamification system not initialized' });
    }
    next();
  });

  // User stats endpoint
  router.get('/users/:userId', async (req, res, next) => {
    try {
      const { userId } = req.params;
      const stats = await gamificationKit.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  // Points endpoints
  router.get('/users/:userId/points', async (req, res, next) => {
    try {
      const { userId } = req.params;
      const pointsModule = gamificationKit.modules.get('points');
      if (!pointsModule) {
        return res.status(404).json({ error: 'Points module not found' });
      }
      
      const points = await pointsModule.getPoints(userId);
      const history = await pointsModule.getPointsHistory(userId, 10);
      
      res.json({ points, history });
    } catch (error) {
      next(error);
    }
  });

  // Badges endpoints
  router.get('/users/:userId/badges', async (req, res, next) => {
    try {
      const { userId } = req.params;
      const badgeModule = gamificationKit.modules.get('badges');
      if (!badgeModule) {
        return res.status(404).json({ error: 'Badge module not found' });
      }
      
      const badges = await badgeModule.getUserBadges(userId);
      res.json({ badges });
    } catch (error) {
      next(error);
    }
  });

  router.get('/badges', async (req, res, next) => {
    try {
      const badgeModule = gamificationKit.modules.get('badges');
      if (!badgeModule) {
        return res.status(404).json({ error: 'Badge module not found' });
      }
      
      const badges = badgeModule.getAllBadges();
      res.json({ badges });
    } catch (error) {
      next(error);
    }
  });

  // Level endpoints
  router.get('/users/:userId/level', async (req, res, next) => {
    try {
      const { userId } = req.params;
      const levelModule = gamificationKit.modules.get('levels');
      if (!levelModule) {
        return res.status(404).json({ error: 'Level module not found' });
      }
      
      const levelInfo = await levelModule.getUserLevel(userId);
      res.json(levelInfo);
    } catch (error) {
      next(error);
    }
  });

  // Streaks endpoints
  router.get('/users/:userId/streaks', async (req, res, next) => {
    try {
      const { userId } = req.params;
      const streakModule = gamificationKit.modules.get('streaks');
      if (!streakModule) {
        return res.status(404).json({ error: 'Streak module not found' });
      }
      
      const streaks = await streakModule.getUserStreaks(userId);
      res.json({ streaks });
    } catch (error) {
      next(error);
    }
  });

  // Quests endpoints
  router.get('/users/:userId/quests', async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { status } = req.query;
      const questModule = gamificationKit.modules.get('quests');
      if (!questModule) {
        return res.status(404).json({ error: 'Quest module not found' });
      }
      
      let quests;
      if (status === 'active') {
        quests = await questModule.getActiveQuests(userId);
      } else if (status === 'completed') {
        quests = await questModule.getCompletedQuests(userId);
      } else {
        quests = await questModule.getUserQuests(userId);
      }
      
      res.json({ quests });
    } catch (error) {
      next(error);
    }
  });

  router.post('/users/:userId/quests/:questId/assign', async (req, res, next) => {
    try {
      const { userId, questId } = req.params;
      const questModule = gamificationKit.modules.get('quests');
      if (!questModule) {
        return res.status(404).json({ error: 'Quest module not found' });
      }
      
      const result = await questModule.assignQuest(userId, questId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Leaderboards endpoints
  router.get('/leaderboards/:type', async (req, res, next) => {
    try {
      const { type } = req.params;
      const { limit = 10, offset = 0 } = req.query;
      const leaderboardModule = gamificationKit.modules.get('leaderboards');
      if (!leaderboardModule) {
        return res.status(404).json({ error: 'Leaderboard module not found' });
      }
      
      const leaderboard = await leaderboardModule.getLeaderboard(type, parseInt(limit), parseInt(offset));
      res.json({ leaderboard });
    } catch (error) {
      next(error);
    }
  });

  // Event tracking endpoint
  router.post('/events', async (req, res, next) => {
    try {
      const { eventName, ...data } = req.body;
      if (!eventName) {
        return res.status(400).json({ error: 'Event name is required' });
      }
      
      const result = await gamificationKit.track(eventName, data);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Admin endpoints
  router.post('/admin/reset/:userId', async (req, res, next) => {
    try {
      const { userId } = req.params;
      await gamificationKit.resetUser(userId);
      res.json({ success: true, message: `User ${userId} reset successfully` });
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/metrics', async (req, res, next) => {
    try {
      const metrics = gamificationKit.getMetrics();
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/health', async (req, res, next) => {
    try {
      const health = gamificationKit.getHealth();
      res.json(health);
    } catch (error) {
      next(error);
    }
  });

  // Error handler
  router.use((error, req, res, next) => {
    console.error('Gamification route error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Internal server error',
      code: error.code
    });
  });

  return router;
}

// Also export as default for compatibility
export default gamificationRoutes;