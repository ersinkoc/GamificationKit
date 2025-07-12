# Gamification Kit for Node.js

A comprehensive, production-ready gamification system for Node.js applications that can be easily integrated with minimal code changes.

## Features

- 🎯 **Points System** - Award points with multipliers, limits, and decay
- 🏆 **Badges & Achievements** - Multi-tier achievements with progress tracking
- 📊 **Leaderboards** - Real-time rankings with multiple time periods
- 📈 **Levels & XP** - Configurable progression with prestige system
- 🔥 **Streaks** - Track consecutive actions with freeze protection
- 🎮 **Quests** - Daily/weekly challenges with dependencies
- 🪝 **Webhooks** - Real-time notifications with retry logic
- 📡 **WebSocket Support** - Live updates for user progress
- 🔌 **Framework Agnostic** - Works with Express, Fastify, Koa, or vanilla Node.js
- 💾 **Storage Options** - Memory, Redis, MongoDB, PostgreSQL
- 🎨 **Frontend Components** - Ready-to-use widget and React components

## Installation

```bash
npm install gamification-kit
```

## Quick Start

```javascript
import { GamificationKit, PointsModule, BadgeModule, LevelModule } from 'gamification-kit';

// Initialize the kit
const gamification = new GamificationKit({
  storage: { type: 'redis', host: 'localhost' }
});

// Add modules
gamification.use(new PointsModule({
  dailyLimit: 1000,
  multipliers: { weekend: 2 }
}));

gamification.use(new BadgeModule([
  {
    id: 'first-post',
    name: 'First Post',
    description: 'Create your first post',
    conditions: {
      triggers: [{
        event: 'post.created',
        conditions: { 'data.isFirst': true }
      }]
    }
  }
]));

gamification.use(new LevelModule({
  maxLevel: 50,
  xpFormula: 'exponential'
}));

// Initialize
await gamification.initialize();

// Track events
await gamification.track('post.created', {
  userId: 'user123',
  postId: 'post456',
  isFirst: true
});
```

## Express Integration

```javascript
import express from 'express';
import { GamificationKit } from 'gamification-kit';

const app = express();
const gamification = new GamificationKit();

// Use middleware
app.use(gamification.express());

// Track events in routes
app.post('/api/posts', async (req, res) => {
  const post = await createPost(req.body);
  
  // Award points for creating a post
  await req.gamification.awardPoints(10, 'post_created');
  
  // Track custom event
  await req.gamification.track('post.created', {
    postId: post.id
  });
  
  res.json(post);
});

// Use built-in routes
app.use('/api/gamification', gamificationRoutes(gamification));
```

## Configuration

```javascript
const gamification = new GamificationKit({
  // App configuration
  appName: 'my-app',
  
  // Storage configuration
  storage: {
    type: 'redis', // 'memory' | 'redis' | 'mongodb' | 'postgres'
    host: 'localhost',
    port: 6379
  },
  
  // API configuration
  api: {
    enabled: true,
    port: 3001,
    prefix: '/gamification',
    cors: true,
    rateLimit: {
      windowMs: 60000,
      max: 100
    }
  },
  
  // Webhook configuration
  webhooks: {
    enabled: true,
    timeout: 5000,
    retries: 3
  },
  
  // Security
  security: {
    apiKey: process.env.GAMIFICATION_API_KEY,
    encryption: true
  }
});
```

## Modules

### Points Module

```javascript
const pointsModule = new PointsModule({
  dailyLimit: 1000,
  weeklyLimit: 5000,
  monthlyLimit: 20000,
  decayEnabled: true,
  decayDays: 30,
  decayPercentage: 10,
  multipliers: {
    weekend: 2,
    holiday: 3
  }
});

// Award points
await pointsModule.award(userId, 100, 'quest_completed');

// Deduct points
await pointsModule.deduct(userId, 50, 'item_purchased');

// Get user points
const points = await pointsModule.getPoints(userId);

// Get leaderboard
const topUsers = await pointsModule.getTopUsers(10, 'monthly');
```

### Badge Module

```javascript
const badges = [
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Complete 10 quests',
    conditions: {
      progress: {
        questsCompleted: { target: 10 }
      }
    },
    rewards: { points: 500, xp: 100 }
  }
];

const badgeModule = new BadgeModule(badges);

// Award badge manually
await badgeModule.award(userId, 'explorer');

// Check progress
const progress = await badgeModule.getProgress(userId, 'explorer');

// Get user badges
const userBadges = await badgeModule.getUserBadges(userId);
```

### Level Module

```javascript
const levelModule = new LevelModule({
  maxLevel: 100,
  xpFormula: 'exponential',
  baseXP: 100,
  exponent: 1.5,
  prestigeEnabled: true,
  levelRewards: {
    10: { points: 1000, badges: ['level-10'] },
    25: { points: 5000, badges: ['level-25'] }
  }
});

// Add XP
await levelModule.addXP(userId, 250, 'boss_defeated');

// Get user level
const levelInfo = await levelModule.getUserLevel(userId);

// Prestige
await levelModule.prestige(userId);
```

### Streak Module

```javascript
const streakModule = new StreakModule({
  types: {
    daily: {
      window: 24 * 60 * 60 * 1000,
      grace: 6 * 60 * 60 * 1000,
      freezeEnabled: true,
      rewards: {
        7: { points: 100 },
        30: { points: 500, badges: ['streak-30'] }
      }
    }
  }
});

// Record activity
await streakModule.recordActivity(userId, 'daily');

// Freeze streak
await streakModule.freezeStreak(userId, 'daily');

// Get user streaks
const streaks = await streakModule.getUserStreaks(userId);
```

### Quest Module

```javascript
const questModule = new QuestModule({
  maxActiveQuests: 3,
  dailyQuestLimit: 5,
  autoAssignDaily: true
});

// Add quest
questModule.addQuest({
  id: 'dragon-slayer',
  name: 'Dragon Slayer',
  objectives: [
    {
      id: 'defeat-dragons',
      description: 'Defeat 5 dragons',
      target: 5,
      event: 'enemy.defeated',
      conditions: { 'data.enemyType': 'dragon' }
    }
  ],
  rewards: { xp: 1000, points: 500 },
  timeLimit: 86400 // 24 hours
});

// Assign quest
await questModule.assignQuest(userId, 'dragon-slayer');

// Get active quests
const activeQuests = await questModule.getActiveQuests(userId);
```

## Frontend Integration

### Vanilla JavaScript Widget

```html
<script src="/gamification/widget.js"></script>
<script>
  const widget = new GamificationWidget({
    userId: 'user123',
    position: 'bottom-right',
    theme: 'dark',
    modules: ['points', 'level', 'badges', 'streaks'],
    websocket: true
  });
  
  widget.init();
</script>
```

### React Components

```jsx
import { 
  GamificationProvider,
  PointsDisplay,
  LevelProgress,
  BadgeGrid,
  StreakDisplay,
  QuestList,
  Leaderboard
} from 'gamification-kit/react';

function App() {
  return (
    <GamificationProvider config={{ userId: 'user123' }}>
      <div className="gamification-panel">
        <PointsDisplay animated />
        <LevelProgress showStats />
        <BadgeGrid limit={6} />
        <StreakDisplay type="daily" />
        <QuestList filter="active" />
        <Leaderboard type="points-weekly" limit={10} />
      </div>
    </GamificationProvider>
  );
}
```

## API Endpoints

The kit automatically creates RESTful endpoints:

```
GET    /gamification/users/:userId                    # Full user stats
GET    /gamification/users/:userId/points             # Points details
GET    /gamification/users/:userId/badges             # User badges
GET    /gamification/users/:userId/level              # Level info
GET    /gamification/users/:userId/streaks            # Active streaks
GET    /gamification/users/:userId/quests             # Active quests
GET    /gamification/leaderboards/:type               # Get leaderboard
POST   /gamification/events                           # Track event
POST   /gamification/admin/reset/:userId             # Reset user
WS     /gamification/ws                               # WebSocket connection
```

## Rule Engine

Create complex conditions for automated rewards:

```javascript
gamification.ruleEngine.addRule('power-user', {
  conditions: {
    all: [
      { field: 'data.postsCount', operator: '>=', value: 10 },
      { field: 'data.commentsCount', operator: '>=', value: 50 },
      { field: 'data.daysActive', operator: '>=', value: 7 }
    ]
  },
  actions: [
    { type: 'award_badge', badgeId: 'power-user' },
    { type: 'award_points', points: 1000 }
  ]
});
```

## Webhooks

Register webhooks for real-time notifications:

```javascript
gamification.webhookManager.addWebhook({
  id: 'slack-notifications',
  url: 'https://hooks.slack.com/services/...',
  events: ['badge.awarded', 'level.up'],
  headers: {
    'Content-Type': 'application/json'
  }
});
```

## Storage Adapters

### Redis

```javascript
const gamification = new GamificationKit({
  storage: {
    type: 'redis',
    host: 'localhost',
    port: 6379,
    password: 'optional',
    db: 0
  }
});
```

### MongoDB

```javascript
const gamification = new GamificationKit({
  storage: {
    type: 'mongodb',
    url: 'mongodb://localhost:27017',
    database: 'gamification'
  }
});
```

### PostgreSQL

```javascript
const gamification = new GamificationKit({
  storage: {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'gamification',
    user: 'postgres',
    password: 'password'
  }
});
```

## Advanced Usage

### Custom Modules

```javascript
import { BaseModule } from 'gamification-kit';

class KarmaModule extends BaseModule {
  constructor(options) {
    super('karma', options);
  }

  async onInitialize() {
    // Initialize module
  }

  async giveKarma(fromUserId, toUserId, amount) {
    // Implementation
  }

  async getUserKarma(userId) {
    // Implementation
  }
}

gamification.use(new KarmaModule());
```

### Event Tracking Patterns

```javascript
// Automatic tracking with middleware
app.post('/api/comments', async (req, res) => {
  const comment = await createComment(req.body);
  
  // Track with metadata
  await req.gamification.track('comment.created', {
    commentId: comment.id,
    postId: comment.postId,
    length: comment.text.length,
    sentiment: analyzeSentiment(comment.text)
  });
  
  res.json(comment);
});

// Bulk operations
await gamification.track('user.bulk_action', {
  userId: 'user123',
  action: 'import',
  itemCount: 1000
});
```

### Performance Optimization

```javascript
// Batch updates for high-throughput scenarios
const leaderboardModule = new LeaderboardModule({
  enableRealtime: false,
  updateInterval: 5000, // Batch updates every 5 seconds
  cacheExpiry: 300 // Cache for 5 minutes
});

// Use transactions for atomic operations
await gamification.storage.transaction([
  { method: 'hincrby', args: ['points:user123', 'total', 100] },
  { method: 'zadd', args: ['leaderboard:daily', 1500, 'user123'] }
]);
```

## Testing

```javascript
import { GamificationKit, MemoryStorage } from 'gamification-kit';

describe('Gamification Tests', () => {
  let gamification;

  beforeEach(async () => {
    gamification = new GamificationKit({
      storage: { type: 'memory' }
    });
    await gamification.initialize();
  });

  test('should award points', async () => {
    const result = await gamification.track('test.event', {
      userId: 'test-user',
      points: 100
    });
    
    expect(result.processed).toBe(true);
  });
});
```

## Monitoring

Access metrics and health status:

```javascript
// Get system metrics
const metrics = gamification.getMetrics();
console.log(metrics);

// Check health
const health = gamification.getHealth();
console.log(health);

// Export metrics in different formats
const prometheusMetrics = await gamification.metricsCollector.exportMetrics('prometheus');
```

## Security Best Practices

1. Always use API keys in production:
   ```javascript
   const gamification = new GamificationKit({
     security: {
       apiKey: process.env.GAMIFICATION_API_KEY
     }
   });
   ```

2. Validate user permissions:
   ```javascript
   app.post('/gamification/admin/award', requireAdmin, async (req, res) => {
     // Admin-only endpoint
   });
   ```

3. Rate limit API endpoints:
   ```javascript
   api: {
     rateLimit: {
       windowMs: 60000,
       max: 100
     }
   }
   ```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT

## Support

- Documentation: [https://docs.gamification-kit.io](https://docs.gamification-kit.io)
- Issues: [GitHub Issues](https://github.com/yourusername/gamification-kit/issues)
- Discord: [Join our community](https://discord.gg/gamification-kit)