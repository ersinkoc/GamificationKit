import Benchmark from 'benchmark';
import { GamificationKit } from '../../src/core/GamificationKit.js';
import { PointsModule } from '../../src/modules/PointsModule.js';
import { BadgeModule } from '../../src/modules/BadgeModule.js';
import { LevelModule } from '../../src/modules/LevelModule.js';
import { LeaderboardModule } from '../../src/modules/LeaderboardModule.js';
import { StreakModule } from '../../src/modules/StreakModule.js';
import { QuestModule } from '../../src/modules/QuestModule.js';

/**
 * Module Benchmark Suite
 * Tests module initialization, getUserStats aggregation, and multi-module operations
 */

interface BenchmarkResult {
  name: string;
  opsPerSec: number;
  margin: number;
  samples: number;
}

export class ModuleBenchmark {
  private gamificationKit!: GamificationKit;
  private results: BenchmarkResult[] = [];

  async setup(): Promise<void> {
    this.gamificationKit = new GamificationKit({
      storage: { type: 'memory' },
      api: { enabled: false },
      webhooks: { enabled: false },
      metrics: { enabled: false },
      health: { enabled: false },
      logger: { level: 'error', enabled: false }
    });

    // Add all modules
    this.gamificationKit.use(new PointsModule());
    this.gamificationKit.use(new BadgeModule());
    this.gamificationKit.use(new LevelModule());
    this.gamificationKit.use(new LeaderboardModule());
    this.gamificationKit.use(new StreakModule());
    this.gamificationKit.use(new QuestModule());

    await this.gamificationKit.initialize();

    // Pre-populate with test data
    for (let i = 0; i < 100; i++) {
      const userId = `user_${i}`;
      await this.gamificationKit.track('user.action', {
        userId,
        action: 'test',
        points: i * 10
      });
    }
  }

  async cleanup(): Promise<void> {
    if (this.gamificationKit) {
      await this.gamificationKit.shutdown(5000);
    }
  }

  /**
   * Benchmark: Module initialization time
   */
  async benchmarkModuleInitialization(): Promise<BenchmarkResult> {
    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();

      suite
        .add('Module Initialization (all modules)', {
          defer: true,
          fn: async (deferred: any) => {
            const kit = new GamificationKit({
              storage: { type: 'memory' },
              api: { enabled: false },
              webhooks: { enabled: false },
              metrics: { enabled: false },
              health: { enabled: false },
              logger: { level: 'error', enabled: false }
            });

            kit.use(new PointsModule());
            kit.use(new BadgeModule());
            kit.use(new LevelModule());
            kit.use(new LeaderboardModule());
            kit.use(new StreakModule());
            kit.use(new QuestModule());

            await kit.initialize();
            await kit.shutdown(1000);
            deferred.resolve();
          }
        })
        .on('cycle', (event: any) => {
          console.log(String(event.target));
        })
        .on('complete', (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: getUserStats aggregation
   */
  async benchmarkGetUserStats(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('getUserStats (all modules)', {
          defer: true,
          fn: async (deferred: any) => {
            await this.gamificationKit.getUserStats(`user_${counter % 100}`);
            counter++;
            deferred.resolve();
          }
        })
        .on('cycle', (event: any) => {
          console.log(String(event.target));
        })
        .on('complete', async (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          await this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Track event (triggers multiple modules)
   */
  async benchmarkTrackEvent(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Track Event (multi-module)', {
          defer: true,
          fn: async (deferred: any) => {
            await this.gamificationKit.track('user.action', {
              userId: `user_${counter % 100}`,
              action: 'benchmark',
              points: 10,
              timestamp: Date.now()
            });
            counter++;
            deferred.resolve();
          }
        })
        .on('cycle', (event: any) => {
          console.log(String(event.target));
        })
        .on('complete', async (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          await this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Concurrent user operations
   */
  async benchmarkConcurrentUserOps(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Concurrent User Operations (10 users)', {
          defer: true,
          fn: async (deferred: any) => {
            const promises = [];
            for (let i = 0; i < 10; i++) {
              promises.push(
                this.gamificationKit.track('user.action', {
                  userId: `concurrent_user_${(counter * 10 + i) % 50}`,
                  action: 'concurrent',
                  points: 5
                })
              );
            }
            await Promise.all(promises);
            counter++;
            deferred.resolve();
          }
        })
        .on('cycle', (event: any) => {
          console.log(String(event.target));
        })
        .on('complete', async (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          await this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Badge operations
   */
  async benchmarkBadgeOperations(): Promise<BenchmarkResult> {
    await this.setup();

    const badgeModule = this.gamificationKit.modules.get('badges') as any;

    // Create test badges
    await badgeModule.createBadge({
      id: 'test-badge-1',
      name: 'Test Badge 1',
      description: 'Test badge for benchmarking',
      icon: 'icon.png'
    });

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Badge Award Operations', {
          defer: true,
          fn: async (deferred: any) => {
            await badgeModule.award(`badge_user_${counter}`, 'test-badge-1');
            counter++;
            deferred.resolve();
          }
        })
        .on('cycle', (event: any) => {
          console.log(String(event.target));
        })
        .on('complete', async (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          await this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Level operations
   */
  async benchmarkLevelOperations(): Promise<BenchmarkResult> {
    await this.setup();

    const levelModule = this.gamificationKit.modules.get('levels') as any;

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Level XP Award Operations', {
          defer: true,
          fn: async (deferred: any) => {
            await levelModule.addXP(`level_user_${counter % 50}`, 50);
            counter++;
            deferred.resolve();
          }
        })
        .on('cycle', (event: any) => {
          console.log(String(event.target));
        })
        .on('complete', async (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          await this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Streak operations
   */
  async benchmarkStreakOperations(): Promise<BenchmarkResult> {
    await this.setup();

    const streakModule = this.gamificationKit.modules.get('streaks') as any;

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Streak Update Operations', {
          defer: true,
          fn: async (deferred: any) => {
            await streakModule.recordActivity(`streak_user_${counter % 30}`, 'daily_login');
            counter++;
            deferred.resolve();
          }
        })
        .on('cycle', (event: any) => {
          console.log(String(event.target));
        })
        .on('complete', async (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          await this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Quest operations
   */
  async benchmarkQuestOperations(): Promise<BenchmarkResult> {
    await this.setup();

    const questModule = this.gamificationKit.modules.get('quests') as any;

    // Create test quest
    await questModule.createQuest({
      id: 'daily-quest-1',
      name: 'Daily Quest',
      description: 'Complete daily objectives',
      type: 'daily',
      objectives: [
        {
          id: 'obj1',
          description: 'Do something',
          type: 'count',
          target: 10,
          current: 0
        }
      ]
    });

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Quest Progress Update', {
          defer: true,
          fn: async (deferred: any) => {
            await questModule.updateProgress(
              `quest_user_${counter % 40}`,
              'daily-quest-1',
              'obj1',
              1
            );
            counter++;
            deferred.resolve();
          }
        })
        .on('cycle', (event: any) => {
          console.log(String(event.target));
        })
        .on('complete', async (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          await this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Reset user (all modules)
   */
  async benchmarkResetUser(): Promise<BenchmarkResult> {
    await this.setup();

    // Pre-populate users
    for (let i = 0; i < 50; i++) {
      const userId = `reset_user_${i}`;
      await this.gamificationKit.track('user.action', {
        userId,
        action: 'setup',
        points: 100
      });
    }

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Reset User (all modules)', {
          defer: true,
          fn: async (deferred: any) => {
            await this.gamificationKit.resetUser(`reset_user_${counter % 50}`);
            counter++;
            deferred.resolve();
          }
        })
        .on('cycle', (event: any) => {
          console.log(String(event.target));
        })
        .on('complete', async (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          await this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Multi-module data aggregation
   */
  async benchmarkMultiModuleAggregation(): Promise<BenchmarkResult> {
    await this.setup();

    // Populate with diverse data
    for (let i = 0; i < 50; i++) {
      const userId = `agg_user_${i}`;
      const pointsModule = this.gamificationKit.modules.get('points') as any;
      const levelModule = this.gamificationKit.modules.get('levels') as any;
      const streakModule = this.gamificationKit.modules.get('streaks') as any;

      await pointsModule.award(userId, i * 100, 'setup');
      await levelModule.addXP(userId, i * 50);
      await streakModule.recordActivity(userId, 'login');
    }

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Multi-Module Data Aggregation', {
          defer: true,
          fn: async (deferred: any) => {
            const userId = `agg_user_${counter % 50}`;
            const stats = await this.gamificationKit.getUserStats(userId);

            // Additional processing to simulate real-world usage
            const summary = {
              userId,
              totalPoints: stats.modules.points?.balance || 0,
              level: stats.modules.levels?.level || 0,
              streaks: stats.modules.streaks?.activeStreaks || 0,
              badges: stats.modules.badges?.earned?.length || 0
            };

            counter++;
            deferred.resolve();
          }
        })
        .on('cycle', (event: any) => {
          console.log(String(event.target));
        })
        .on('complete', async (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          await this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Run all benchmarks
   */
  async runAll(): Promise<BenchmarkResult[]> {
    console.log('\n=== Module Benchmark Suite ===\n');

    await this.benchmarkModuleInitialization();
    await this.benchmarkGetUserStats();
    await this.benchmarkTrackEvent();
    await this.benchmarkConcurrentUserOps();
    await this.benchmarkBadgeOperations();
    await this.benchmarkLevelOperations();
    await this.benchmarkStreakOperations();
    await this.benchmarkQuestOperations();
    await this.benchmarkResetUser();
    await this.benchmarkMultiModuleAggregation();

    return this.results;
  }

  getResults(): BenchmarkResult[] {
    return this.results;
  }
}

// Run benchmarks if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new ModuleBenchmark();
  benchmark.runAll()
    .then((results) => {
      console.log('\n=== Module Benchmark Results ===');
      results.forEach(result => {
        console.log(`${result.name}: ${result.opsPerSec.toFixed(2)} ops/sec ±${result.margin.toFixed(2)}%`);
      });
      process.exit(0);
    })
    .catch((error) => {
      console.error('Benchmark failed:', error);
      process.exit(1);
    });
}
