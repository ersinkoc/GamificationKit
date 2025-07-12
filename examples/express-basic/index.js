import express from 'express';
import { 
  GamificationKit, 
  PointsModule, 
  BadgeModule, 
  LevelModule,
  StreakModule,
  LeaderboardModule,
  QuestModule
} from '@oxog/gamification-kit';

const app = express();
app.use(express.json());

// Initialize Gamification Kit
const gamification = new GamificationKit({
  storage: { type: 'memory' },
  api: {
    enabled: true,
    port: 3001,
    cors: true
  }
});

// Configure modules
const pointsModule = new PointsModule({
  dailyLimit: 1000,
  multipliers: {
    weekend: 1.5,
    firstAction: 2
  }
});

const badges = [
  {
    id: 'welcome',
    name: 'Welcome!',
    description: 'Join the community',
    conditions: {
      triggers: [{
        event: 'user.registered'
      }]
    },
    rewards: { points: 100 }
  },
  {
    id: 'first-post',
    name: 'First Post',
    description: 'Create your first post',
    conditions: {
      triggers: [{
        event: 'post.created',
        conditions: { 'isFirst': true }
      }]
    },
    rewards: { points: 50, xp: 25 }
  },
  {
    id: 'contributor',
    name: 'Contributor',
    description: 'Create 10 posts',
    conditions: {
      progress: {
        posts: { target: 10 }
      },
      events: ['post.created']
    },
    rewards: { points: 500, xp: 100 }
  }
];

const badgeModule = new BadgeModule(badges);

const levelModule = new LevelModule({
  maxLevel: 50,
  baseXP: 100,
  levelRewards: {
    5: { points: 500, badges: ['level-5'] },
    10: { points: 1000, badges: ['level-10'] },
    25: { points: 5000, badges: ['level-25'] }
  }
});

const streakModule = new StreakModule({
  types: {
    daily: {
      window: 24 * 60 * 60 * 1000,
      rewards: {
        3: { points: 50 },
        7: { points: 200, badges: ['week-streak'] },
        30: { points: 1000, badges: ['month-streak'] }
      }
    }
  }
});

const leaderboardModule = new LeaderboardModule({
  periods: ['daily', 'weekly', 'monthly', 'all-time']
});

const questModule = new QuestModule({
  maxActiveQuests: 3
});

// Add quests
questModule.addQuest({
  id: 'daily-poster',
  name: 'Daily Poster',
  description: 'Create a post today',
  category: 'daily',
  objectives: [{
    id: 'create-post',
    description: 'Create 1 post',
    target: 1,
    event: 'post.created'
  }],
  rewards: { points: 50, xp: 20 },
  timeLimit: 86400 // 24 hours
});

questModule.addQuest({
  id: 'social-butterfly',
  name: 'Social Butterfly',
  description: 'Interact with the community',
  category: 'weekly',
  objectives: [
    {
      id: 'create-posts',
      description: 'Create 5 posts',
      target: 5,
      event: 'post.created'
    },
    {
      id: 'create-comments',
      description: 'Comment 10 times',
      target: 10,
      event: 'comment.created'
    }
  ],
  rewards: { points: 300, xp: 100 },
  timeLimit: 604800 // 7 days
});

// Add modules to gamification kit
gamification.use(pointsModule);
gamification.use(badgeModule);
gamification.use(levelModule);
gamification.use(streakModule);
gamification.use(leaderboardModule);
gamification.use(questModule);

// Initialize
await gamification.initialize();

// Use gamification middleware
app.use(gamification.express());

// In-memory data store for demo
const users = new Map();
const posts = new Map();
const comments = new Map();

// Helper to ensure user exists
const ensureUser = (userId) => {
  if (!users.has(userId)) {
    users.set(userId, {
      id: userId,
      username: `user_${userId}`,
      posts: [],
      comments: [],
      createdAt: Date.now()
    });
  }
  return users.get(userId);
};

// Routes

// User registration
app.post('/api/register', async (req, res) => {
  const { username } = req.body;
  const userId = `user_${Date.now()}`;
  
  users.set(userId, {
    id: userId,
    username,
    posts: [],
    comments: [],
    createdAt: Date.now()
  });

  // Track registration event
  await req.gamification.track('user.registered', { userId });
  
  // Record daily streak
  const streakModule = req.gamification.modules.get('streaks');
  if (streakModule) {
    await streakModule.recordActivity(userId, 'daily');
  }

  res.json({ userId, username });
});

// Create post
app.post('/api/posts', async (req, res) => {
  const { userId, title, content } = req.body;
  const user = ensureUser(userId);
  
  const postId = `post_${Date.now()}`;
  const post = {
    id: postId,
    userId,
    title,
    content,
    createdAt: Date.now()
  };
  
  posts.set(postId, post);
  user.posts.push(postId);
  
  const isFirst = user.posts.length === 1;
  
  // Track post creation
  await req.gamification.track('post.created', {
    userId,
    postId,
    isFirst
  });
  
  // Update badge progress
  const badgeModule = req.gamification.modules.get('badges');
  await badgeModule.updateProgress(userId, 'contributor', 'posts', 1);
  
  // Award bonus points for first post
  if (isFirst) {
    const pointsModule = req.gamification.modules.get('points');
    if (pointsModule) {
      await pointsModule.award(userId, 50, 'first_post');
    }
  }
  
  res.json(post);
});

// Create comment
app.post('/api/comments', async (req, res) => {
  const { userId, postId, content } = req.body;
  const user = ensureUser(userId);
  
  const commentId = `comment_${Date.now()}`;
  const comment = {
    id: commentId,
    userId,
    postId,
    content,
    createdAt: Date.now()
  };
  
  comments.set(commentId, comment);
  user.comments.push(commentId);
  
  // Track comment creation
  await req.gamification.track('comment.created', {
    userId,
    postId,
    commentId
  });
  
  // Award points for commenting
  const pointsModule = req.gamification.modules.get('points');
  if (pointsModule) {
    await pointsModule.award(userId, 5, 'comment_created');
  }
  
  res.json(comment);
});

// Like a post
app.post('/api/posts/:postId/like', async (req, res) => {
  const { userId } = req.body;
  const { postId } = req.params;
  
  const post = posts.get(postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  // Award points to post creator
  const pointsModule = req.gamification.modules.get('points');
  if (pointsModule) {
    await pointsModule.award(post.userId, 10, 'post_liked');
  }
  
  // Track like event
  await req.gamification.track('post.liked', {
    userId,
    postId,
    postAuthorId: post.userId
  });
  
  res.json({ success: true });
});

// Get user profile with gamification stats
app.get('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const user = users.get(userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Get gamification stats
  const stats = await req.gamification.getUserStats(userId);
  
  res.json({
    ...user,
    gamification: stats
  });
});

// Assign daily quests
app.post('/api/quests/daily/:userId', async (req, res) => {
  const { userId } = req.params;
  
  const questModule = req.gamification.modules.get('quests');
  const assigned = await questModule.assignDailyQuests(userId);
  
  res.json({ assigned });
});

// Get active quests
app.get('/api/quests/:userId', async (req, res) => {
  const { userId } = req.params;
  
  const questModule = req.gamification.modules.get('quests');
  const quests = await questModule.getActiveQuests(userId);
  
  res.json({ quests });
});

// Manual XP award (for testing)
app.post('/api/admin/xp', async (req, res) => {
  const { userId, xp, reason } = req.body;
  
  const levelModule = req.gamification.modules.get('levels');
  if (!levelModule) {
    return res.status(404).json({ error: 'Level module not found' });
  }
  
  const result = await levelModule.addXP(userId, xp, reason);
  
  res.json(result);
});

// Serve static files
app.use(express.static('public'));

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Example app listening at http://localhost:${PORT}`);
  console.log(`Gamification API available at http://localhost:3001`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await gamification.shutdown();
  process.exit(0);
});