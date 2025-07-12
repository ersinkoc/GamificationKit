import React, { useState, useEffect, useContext, createContext } from 'react';

// Gamification Context
const GamificationContext = createContext();

export const useGamification = () => {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamification must be used within GamificationProvider');
  }
  return context;
};

// Provider Component
export const GamificationProvider = ({ children, config = {} }) => {
  const [data, setData] = useState({
    points: 0,
    level: null,
    badges: [],
    streaks: {},
    quests: [],
    achievements: [],
    leaderboard: []
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ws, setWs] = useState(null);

  const defaultConfig = {
    apiUrl: '/gamification',
    userId: null,
    autoRefresh: true,
    refreshInterval: 30000,
    websocket: true,
    ...config
  };

  const fetchData = async () => {
    if (!defaultConfig.userId) {
      setError('userId is required');
      setLoading(false);
      return;
    }

    try {
      const endpoints = [
        `/points/${defaultConfig.userId}`,
        `/level/${defaultConfig.userId}`,
        `/badges/${defaultConfig.userId}`,
        `/streaks/${defaultConfig.userId}`,
        `/quests/${defaultConfig.userId}`,
        `/achievements/${defaultConfig.userId}`
      ];

      const responses = await Promise.all(
        endpoints.map(endpoint => 
          fetch(`${defaultConfig.apiUrl}${endpoint}`).then(res => res.json())
        )
      );

      setData({
        points: responses[0]?.points || 0,
        level: responses[1] || null,
        badges: responses[2]?.badges || [],
        streaks: responses[3]?.streaks || {},
        quests: responses[4]?.quests || [],
        achievements: responses[5]?.achievements || []
      });

      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const trackEvent = async (eventName, data = {}) => {
    try {
      const response = await fetch(`${defaultConfig.apiUrl}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName,
          userId: defaultConfig.userId,
          ...data
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.error('Failed to track event:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchData();

    // Set up auto-refresh
    let refreshInterval;
    if (defaultConfig.autoRefresh) {
      refreshInterval = setInterval(fetchData, defaultConfig.refreshInterval);
    }

    // Set up WebSocket
    if (defaultConfig.websocket && defaultConfig.userId) {
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${defaultConfig.apiUrl}/ws?userId=${defaultConfig.userId}`;
      const websocket = new WebSocket(wsUrl);

      websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        // Refresh data on relevant events
        if (['points.awarded', 'badge.awarded', 'level.up', 'quest.completed'].includes(message.type)) {
          fetchData();
        }
      };

      setWs(websocket);
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
      if (ws) ws.close();
    };
  }, [defaultConfig.userId]);

  const value = {
    ...data,
    loading,
    error,
    refresh: fetchData,
    trackEvent,
    config: defaultConfig
  };

  return (
    <GamificationContext.Provider value={value}>
      {children}
    </GamificationContext.Provider>
  );
};

// Points Display Component
export const PointsDisplay = ({ className = '', showLabel = true, animated = true }) => {
  const { points } = useGamification();
  const [displayPoints, setDisplayPoints] = useState(points);

  useEffect(() => {
    if (!animated) {
      setDisplayPoints(points);
      return;
    }

    const start = displayPoints;
    const end = points;
    const duration = 1000;
    const startTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / duration, 1);
      const current = Math.floor(start + (end - start) * progress);
      
      setDisplayPoints(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [points]);

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  return (
    <div className={`gk-points-display ${className}`}>
      <div className="gk-points-value">{formatNumber(displayPoints)}</div>
      {showLabel && <div className="gk-points-label">Points</div>}
    </div>
  );
};

// Level Progress Component
export const LevelProgress = ({ className = '', showStats = true }) => {
  const { level } = useGamification();

  if (!level) return null;

  const progress = level.progress || {};

  return (
    <div className={`gk-level-display ${className}`}>
      <div className="gk-level-header">
        <div className="gk-level-badge">Level {level.level}</div>
        {level.prestige > 0 && (
          <div className="gk-prestige-badge">Prestige {level.prestige}</div>
        )}
      </div>
      
      <div className="gk-level-progress">
        <div className="gk-progress-bar">
          <div 
            className="gk-progress-fill" 
            style={{ width: `${progress.percentage || 0}%` }}
          />
        </div>
        {showStats && (
          <div className="gk-progress-text">
            {progress.current || 0} / {progress.required || 0} XP
          </div>
        )}
      </div>
    </div>
  );
};

// Badge Grid Component
export const BadgeGrid = ({ className = '', limit = null, showLocked = false }) => {
  const { badges } = useGamification();

  const displayBadges = limit ? badges.slice(0, limit) : badges;

  return (
    <div className={`gk-badge-grid ${className}`}>
      {displayBadges.map(badge => (
        <div
          key={badge.id}
          className="gk-badge earned"
          title={badge.name}
        >
          <span className="gk-badge-icon">{badge.icon || '🏆'}</span>
          <div className="gk-badge-tooltip">{badge.name}</div>
        </div>
      ))}
    </div>
  );
};

// Streak Display Component
export const StreakDisplay = ({ type = 'daily', className = '' }) => {
  const { streaks } = useGamification();
  const streak = streaks[type];

  if (!streak) return null;

  return (
    <div className={`gk-streak-display ${className}`}>
      <div className="gk-streak-icon">🔥</div>
      <div className="gk-streak-info">
        <div className="gk-streak-count">{streak.currentStreak}</div>
        <div className="gk-streak-label">day streak</div>
      </div>
      {streak.frozen && (
        <div className="gk-streak-freeze">Frozen</div>
      )}
    </div>
  );
};

// Quest List Component
export const QuestList = ({ className = '', filter = 'active' }) => {
  const { quests } = useGamification();

  const filteredQuests = quests.filter(quest => {
    if (filter === 'active') return !quest.completed;
    if (filter === 'completed') return quest.completed;
    return true;
  });

  return (
    <div className={`gk-quest-list ${className}`}>
      {filteredQuests.map(quest => {
        const totalObjectives = quest.objectives?.length || 0;
        const completedObjectives = quest.objectives?.filter(o => o.completed).length || 0;
        const progress = totalObjectives > 0 ? (completedObjectives / totalObjectives) * 100 : 0;

        return (
          <div key={quest.id} className="gk-quest">
            <div className="gk-quest-header">
              <div className="gk-quest-name">{quest.questData?.name}</div>
              {quest.expiresAt && (
                <div className="gk-quest-timer">
                  {new Date(quest.expiresAt).toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="gk-quest-progress">
              <div className="gk-progress-bar">
                <div 
                  className="gk-progress-fill" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span>{completedObjectives}/{totalObjectives}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Leaderboard Component
export const Leaderboard = ({ 
  type = 'points-all-time', 
  limit = 10, 
  className = '',
  showCurrentUser = true 
}) => {
  const { config } = useGamification();
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(
          `${config.apiUrl}/leaderboards/${type}?limit=${limit}`
        );
        const data = await response.json();
        setLeaderboard(data);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [type, limit]);

  if (loading) return <div className="gk-loading">Loading...</div>;
  if (!leaderboard) return null;

  return (
    <div className={`gk-leaderboard ${className}`}>
      <div className="gk-leaderboard-list">
        {leaderboard.entries?.map(entry => (
          <div 
            key={entry.userId} 
            className={`gk-leaderboard-entry ${entry.userId === config.userId ? 'current-user' : ''}`}
          >
            <div className="gk-leaderboard-rank">{entry.rank}</div>
            <div className="gk-leaderboard-user">{entry.userId}</div>
            <div className="gk-leaderboard-score">{entry.score}</div>
          </div>
        ))}
      </div>
      
      {showCurrentUser && leaderboard.userPosition && (
        <div className="gk-leaderboard-user-position">
          <div className="gk-leaderboard-entry current-user">
            <div className="gk-leaderboard-rank">{leaderboard.userPosition.rank}</div>
            <div className="gk-leaderboard-user">You</div>
            <div className="gk-leaderboard-score">{leaderboard.userPosition.score}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// Achievement Progress Component
export const AchievementProgress = ({ achievementId, className = '' }) => {
  const { achievements } = useGamification();
  const achievement = achievements.find(a => a.achievementId === achievementId);

  if (!achievement) return null;

  return (
    <div className={`gk-achievement-progress ${className}`}>
      <div className="gk-achievement-header">
        <div className="gk-achievement-name">{achievement.achievementData?.name}</div>
        <div className="gk-achievement-tier">{achievement.tier}</div>
      </div>
      
      {achievement.progress && (
        <div className="gk-achievement-tiers">
          {Object.entries(achievement.progress.tiers).map(([tier, data]) => (
            <div key={tier} className={`gk-tier ${data.unlocked ? 'unlocked' : ''}`}>
              <div className="gk-tier-name">{tier}</div>
              <div className="gk-progress-bar">
                <div 
                  className="gk-progress-fill" 
                  style={{ width: `${data.percentage}%` }}
                />
              </div>
              <div className="gk-tier-progress">
                {data.progress} / {data.requirement}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Notification Component
export const GamificationNotification = ({ position = 'top-right', duration = 3000 }) => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Listen for gamification events
    const handleEvent = (event) => {
      const { detail } = event;
      let message = '';
      let type = 'info';

      switch (detail.type) {
        case 'points.awarded':
          message = `+${detail.points} points!`;
          type = 'success';
          break;
        case 'badge.awarded':
          message = `New badge: ${detail.badge.name}!`;
          type = 'success';
          break;
        case 'level.up':
          message = `Level ${detail.newLevel} reached!`;
          type = 'success';
          break;
        case 'quest.completed':
          message = `Quest completed: ${detail.quest.name}!`;
          type = 'success';
          break;
        case 'achievement.unlocked':
          message = `Achievement unlocked: ${detail.achievement.name}!`;
          type = 'success';
          break;
      }

      if (message) {
        const notification = {
          id: Date.now(),
          message,
          type
        };

        setNotifications(prev => [...prev, notification]);

        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notification.id));
        }, duration);
      }
    };

    window.addEventListener('gamification', handleEvent);
    return () => window.removeEventListener('gamification', handleEvent);
  }, [duration]);

  return (
    <div className={`gk-notifications ${position}`}>
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`gk-notification ${notification.type}`}
        >
          {notification.message}
        </div>
      ))}
    </div>
  );
};

// Stats Overview Component
export const StatsOverview = ({ className = '' }) => {
  const data = useGamification();

  return (
    <div className={`gk-stats-overview ${className}`}>
      <div className="gk-stat">
        <div className="gk-stat-value">{data.points}</div>
        <div className="gk-stat-label">Points</div>
      </div>
      
      <div className="gk-stat">
        <div className="gk-stat-value">{data.level?.level || 0}</div>
        <div className="gk-stat-label">Level</div>
      </div>
      
      <div className="gk-stat">
        <div className="gk-stat-value">{data.badges.length}</div>
        <div className="gk-stat-label">Badges</div>
      </div>
      
      <div className="gk-stat">
        <div className="gk-stat-value">{data.streaks.daily?.currentStreak || 0}</div>
        <div className="gk-stat-label">Day Streak</div>
      </div>
    </div>
  );
};