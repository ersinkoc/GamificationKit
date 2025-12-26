import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui';

export const Examples: React.FC = () => {
  const examples = [
    {
      title: 'Basic Points System',
      description: 'Simple points awarding and tracking',
      code: `import { GamificationKit } from '@oxog/gamification-kit';

const gamification = new GamificationKit({
  storage: { type: 'memory' }
});

await gamification.initialize();

// Award points
await gamification.points.award('user123', {
  points: 100,
  reason: 'Completed profile'
});

// Get points
const points = await gamification.points.getPoints('user123');
console.log(\`User has \${points} points\`);`
    },
    {
      title: 'Badge System with Progress',
      description: 'Create badges that unlock based on user actions',
      code: `// Define a badge
await gamification.badges.defineBadge({
  id: 'power-user',
  name: 'Power User',
  description: 'Log in 7 days in a row',
  criteria: {
    type: 'streak',
    target: 7
  },
  icon: '🔥'
});

// Track user action
await gamification.streaks.record('user123', 'daily_login');

// Check for unlocks
await gamification.badges.checkProgress('user123');

// Get user badges
const badges = await gamification.badges.getUserBadges('user123');`
    },
    {
      title: 'Leaderboard Implementation',
      description: 'Track and display top users',
      code: `// Get weekly leaderboard
const leaderboard = await gamification.leaderboard
  .getLeaderboard({
    period: 'weekly',
    limit: 10
  });

// Get user rank
const userRank = await gamification.leaderboard
  .getUserRank('user123', { period: 'weekly' });

console.log(\`You are rank #\${userRank} this week!\`);`
    },
    {
      title: 'Quest System',
      description: 'Create daily and weekly quests',
      code: `// Define a daily quest
await gamification.quests.defineQuest({
  id: 'daily-posts',
  name: 'Daily Poster',
  description: 'Create 3 posts today',
  type: 'daily',
  objectives: [
    {
      id: 'posts',
      description: 'Create posts',
      target: 3,
      current: 0
    }
  ],
  rewards: {
    points: 50,
    badges: ['active-user']
  }
});

// Update quest progress
await gamification.quests.updateProgress('user123', 'daily-posts', {
  objectiveId: 'posts',
  increment: 1
});`
    },
    {
      title: 'Event-Driven Automation',
      description: 'Use events for automatic rewards',
      code: `// Listen for level ups
gamification.eventManager.on('level.up', async (data) => {
  console.log(\`\${data.userId} reached level \${data.newLevel}!\`);

  // Award bonus points
  await gamification.points.award(data.userId, {
    points: data.newLevel * 100,
    reason: 'Level up bonus'
  });
});

// Listen for badge unlocks
gamification.eventManager.on('badge.awarded', async (data) => {
  // Send notification
  await sendNotification(data.userId, {
    title: 'New Badge!',
    message: \`You unlocked: \${data.badge.name}\`
  });
});`
    },
    {
      title: 'Rule Engine for Automation',
      description: 'Create complex automated reward rules',
      code: `// Define a rule
await gamification.ruleEngine.addRule({
  id: 'weekend-bonus',
  conditions: {
    all: [
      { field: 'data.points', operator: '>=', value: 100 },
      { field: 'data.dayOfWeek', operator: 'in', value: [6, 7] }
    ]
  },
  actions: [
    {
      type: 'award_points',
      points: 50,
      reason: 'Weekend bonus'
    },
    {
      type: 'award_badge',
      badgeId: 'weekend-warrior'
    }
  ]
});

// Rules evaluate automatically on events`
    },
    {
      title: 'Express Integration',
      description: 'Add gamification to Express app',
      code: `import express from 'express';
import { GamificationKit } from '@oxog/gamification-kit';

const app = express();
const gamification = new GamificationKit({
  storage: {
    type: 'redis',
    url: process.env.REDIS_URL
  }
});

await gamification.initialize();

// Add middleware
app.use(gamification.express());

// Access in routes
app.post('/actions', async (req, res) => {
  const userId = req.user.id;

  await req.gamification.points.award(userId, {
    points: 10,
    reason: 'Performed action'
  });

  res.json({ success: true });
});

app.listen(3000);`
    },
    {
      title: 'WebSocket Real-time Updates',
      description: 'Send real-time updates to clients',
      code: `// Enable WebSocket server
const gamification = new GamificationKit({
  storage: { type: 'redis' },
  websocket: {
    enabled: true,
    port: 3002
  }
});

await gamification.initialize();

// Clients automatically receive events
// when points, badges, etc. are awarded

// Client-side example:
const ws = new WebSocket('ws://localhost:3002/gamification/ws?userId=user123');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  if (event.type === 'points.awarded') {
    console.log('Points received:', event.data.points);
  }
});`
    }
  ];

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Examples
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            Learn by example with these common use cases and patterns
          </p>

          <div className="space-y-8">
            {examples.map((example, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle>{example.title}</CardTitle>
                  <CardDescription>{example.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="code-block">
                    <pre className="text-xs">{example.code}</pre>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-12 bg-gradient-to-br from-primary-50 to-secondary-50">
            <CardHeader>
              <CardTitle>More Examples</CardTitle>
              <CardDescription>
                Find more examples in our GitHub repository including complete applications and integration demos.
              </CardDescription>
              <div className="mt-4">
                <a
                  href="https://github.com/ersinkoc/GamificationKit/tree/main/examples"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  View on GitHub →
                </a>
              </div>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
};
