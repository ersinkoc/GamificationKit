import React, { useState } from 'react';
import {
  GamificationProvider,
  useGamification,
  PointsDisplay,
  LevelProgress,
  BadgeGrid,
  StreakDisplay,
  QuestList,
  Leaderboard,
  StatsOverview,
  GamificationNotification
} from 'gamification-kit/react';
import './App.css';

function Dashboard() {
  const { loading, error, refresh, trackEvent } = useGamification();
  const [activeTab, setActiveTab] = useState('overview');

  const handleAction = async (action) => {
    try {
      await trackEvent(`user.action.${action}`, {
        timestamp: Date.now()
      });
      
      // Refresh stats after action
      setTimeout(refresh, 1000);
    } catch (err) {
      console.error('Failed to track action:', err);
    }
  };

  if (loading) {
    return <div className="loading">Loading gamification data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="dashboard">
      <header className="header">
        <h1>🎮 Gamification Dashboard</h1>
        <button onClick={refresh} className="refresh-btn">
          Refresh
        </button>
      </header>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab ${activeTab === 'progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('progress')}
        >
          Progress
        </button>
        <button 
          className={`tab ${activeTab === 'quests' ? 'active' : ''}`}
          onClick={() => setActiveTab('quests')}
        >
          Quests
        </button>
        <button 
          className={`tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaderboard')}
        >
          Leaderboard
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview">
            <StatsOverview className="stats-grid" />
            
            <div className="actions">
              <h2>Quick Actions</h2>
              <div className="action-buttons">
                <button onClick={() => handleAction('daily-checkin')}>
                  Daily Check-in
                </button>
                <button onClick={() => handleAction('complete-profile')}>
                  Complete Profile
                </button>
                <button onClick={() => handleAction('share-content')}>
                  Share Content
                </button>
              </div>
            </div>

            <div className="recent-badges">
              <h2>Recent Badges</h2>
              <BadgeGrid limit={8} />
            </div>
          </div>
        )}

        {activeTab === 'progress' && (
          <div className="progress-tab">
            <div className="progress-section">
              <h2>Points</h2>
              <PointsDisplay animated showLabel />
            </div>

            <div className="progress-section">
              <h2>Level Progress</h2>
              <LevelProgress showStats />
            </div>

            <div className="progress-section">
              <h2>Daily Streak</h2>
              <StreakDisplay type="daily" />
            </div>

            <div className="progress-section">
              <h2>All Badges</h2>
              <BadgeGrid />
            </div>
          </div>
        )}

        {activeTab === 'quests' && (
          <div className="quests-tab">
            <h2>Active Quests</h2>
            <QuestList filter="active" />
            
            <h2>Completed Quests</h2>
            <QuestList filter="completed" />
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="leaderboard-tab">
            <h2>Weekly Leaderboard</h2>
            <Leaderboard type="points-weekly" limit={20} showCurrentUser />
            
            <h2>All-Time Leaderboard</h2>
            <Leaderboard type="points-all-time" limit={20} showCurrentUser />
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      setUserId(`user_${username.toLowerCase().replace(/\s+/g, '_')}`);
    }
  };

  if (!userId) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>🎮 Gamification Demo</h1>
          <p>Enter your username to start</p>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <button type="submit">Start</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <GamificationProvider config={{ 
      userId,
      apiUrl: 'http://localhost:3001/gamification',
      websocket: true
    }}>
      <Dashboard />
      <GamificationNotification position="top-right" />
    </GamificationProvider>
  );
}

export default App;