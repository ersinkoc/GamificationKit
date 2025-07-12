import { 
  GamificationKit, 
  PointsModule, 
  BadgeModule, 
  LevelModule,
  StreakModule
} from '../../index.js';

console.log('🎮 GamificationKit Demo\n');

async function runDemo() {
  try {
    // Create gamification instance
    const gamification = new GamificationKit({
      storage: { type: 'memory' },
      api: { enabled: false },
      websocket: { enabled: false }
    });

    // Configure Points Module
    const pointsModule = new PointsModule({
      dailyLimit: 1000,
      multipliers: {
        weekend: 1.5,
        firstAction: 2
      }
    });

    // Configure Badges
    const badges = [
      {
        id: 'first-points',
        name: 'Point Collector',
        description: 'Earn your first points',
        conditions: {
          triggers: [{
            event: 'points.awarded',
            conditions: { 'data.total': { min: 1 } }
          }]
        }
      },
      {
        id: 'high-scorer',
        name: 'High Scorer',
        description: 'Earn 500 points',
        conditions: {
          progress: {
            points: { target: 500 }
          }
        }
      }
    ];

    const badgeModule = new BadgeModule(badges);

    // Configure Level Module
    const levelModule = new LevelModule({
      maxLevel: 10,
      baseXP: 100,
      levelRewards: {
        2: { points: 100 },
        5: { points: 500, badges: ['level-5'] }
      }
    });

    // Configure Streak Module
    const streakModule = new StreakModule({
      types: {
        daily: {
          window: 24 * 60 * 60 * 1000,
          rewards: {
            3: { points: 50 },
            7: { points: 200 }
          }
        }
      }
    });

    // Add modules
    gamification.use(pointsModule);
    gamification.use(badgeModule);
    gamification.use(levelModule);
    gamification.use(streakModule);

    // Initialize
    console.log('Initializing GamificationKit...');
    await gamification.initialize();
    console.log('✅ Initialized successfully\n');

    // Demo user
    const userId = 'demo-user-123';

    // Award some points
    console.log('📊 Awarding points...');
    await gamification.track('points.award', {
      userId,
      points: 100,
      reason: 'demo_action'
    });
    console.log('✅ Awarded 100 points\n');

    // Add XP
    console.log('⭐ Adding XP...');
    const levelResult = await levelModule.addXP(userId, 150, 'demo_xp');
    console.log(`✅ Added 150 XP. Current level: ${levelResult.level}\n`);

    // Record daily activity
    console.log('🔥 Recording streak activity...');
    const streakResult = await streakModule.recordActivity(userId, 'daily');
    console.log(`✅ Streak recorded. Current streak: ${streakResult.streak}\n`);

    // Get user stats
    console.log('📈 Getting user stats...');
    const stats = await gamification.getUserStats(userId);
    console.log('User Stats:', JSON.stringify(stats, null, 2));

    // Check for badges
    console.log('\n🏆 Checking badges...');
    const userBadges = await badgeModule.getUserBadges(userId);
    console.log(`User has ${userBadges.length} badge(s)`);
    userBadges.forEach(badge => {
      console.log(`  - ${badge.name}: ${badge.description}`);
    });

    // Get points details
    console.log('\n💰 Points details:');
    const points = await pointsModule.getPoints(userId);
    console.log(`Total points: ${points}`);
    console.log(`Points from stats: ${stats.modules.points.total}`);

    // Clean shutdown
    console.log('\n🔚 Shutting down...');
    await gamification.shutdown();
    console.log('✅ Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the demo
runDemo();