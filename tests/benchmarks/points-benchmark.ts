import Benchmark from 'benchmark';
import { GamificationKit } from '../../src/core/GamificationKit.js';
import { PointsModule } from '../../src/modules/PointsModule.js';
import { MemoryStorage } from '../../src/storage/MemoryStorage.js';

/**
 * Points Benchmark Suite
 * Tests performance of points operations including awards, balance queries, leaderboards, and concurrent operations
 */

interface BenchmarkResult {
  name: string;
  opsPerSec: number;
  margin: number;
  samples: number;
}

export class PointsBenchmark {
  private gamificationKit!: GamificationKit;
  private pointsModule!: PointsModule;
  private results: BenchmarkResult[] = [];

  async setup(): Promise<void> {
    // Create fresh instances for each benchmark
    this.gamificationKit = new GamificationKit({
      storage: { type: 'memory' },
      api: { enabled: false },
      webhooks: { enabled: false },
      metrics: { enabled: false },
      health: { enabled: false },
      logger: { level: 'error', enabled: false }
    });

    this.pointsModule = new PointsModule({
      dailyLimit: 10000,
      weeklyLimit: 50000,
      monthlyLimit: 200000
    });

    this.gamificationKit.use(this.pointsModule);
    await this.gamificationKit.initialize();

    // Pre-populate with test users
    for (let i = 0; i < 100; i++) {
      await this.pointsModule.award(`user_${i}`, 100 * i, 'setup');
    }
  }

  async cleanup(): Promise<void> {
    if (this.gamificationKit) {
      await this.gamificationKit.shutdown(5000);
    }
  }

  /**
   * Benchmark: Award points to a single user
   */
  async benchmarkAwardPoints(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Award Points (Single User)', {
          defer: true,
          fn: async (deferred: any) => {
            await this.pointsModule.award(`bench_user_${counter % 10}`, 10, 'benchmark');
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
   * Benchmark: Get user balance
   */
  async benchmarkGetBalance(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Get User Balance', {
          defer: true,
          fn: async (deferred: any) => {
            await this.pointsModule.getBalance(`user_${counter % 100}`);
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
   * Benchmark: Query leaderboard
   */
  async benchmarkLeaderboardQuery(): Promise<BenchmarkResult> {
    await this.setup();

    // Add leaderboard module
    const { LeaderboardModule } = await import('../../src/modules/LeaderboardModule.js');
    const leaderboardModule = new LeaderboardModule();
    this.gamificationKit.use(leaderboardModule);

    // Populate leaderboard
    for (let i = 0; i < 500; i++) {
      await leaderboardModule.updateScore(`global`, `user_${i}`, i * 100);
    }

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();

      suite
        .add('Leaderboard Query (Top 10)', {
          defer: true,
          fn: async (deferred: any) => {
            await leaderboardModule.getLeaderboard('global', { limit: 10 });
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
   * Benchmark: Leaderboard query with pagination
   */
  async benchmarkLeaderboardPagination(): Promise<BenchmarkResult> {
    await this.setup();

    const { LeaderboardModule } = await import('../../src/modules/LeaderboardModule.js');
    const leaderboardModule = new LeaderboardModule();
    this.gamificationKit.use(leaderboardModule);

    for (let i = 0; i < 1000; i++) {
      await leaderboardModule.updateScore(`global`, `user_${i}`, i * 100);
    }

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let page = 0;

      suite
        .add('Leaderboard Pagination (50 per page)', {
          defer: true,
          fn: async (deferred: any) => {
            const offset = (page % 20) * 50;
            await leaderboardModule.getLeaderboard('global', { offset, limit: 50 });
            page++;
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
   * Benchmark: Concurrent point operations
   */
  async benchmarkConcurrentOperations(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();

      suite
        .add('Concurrent Point Awards (10 parallel)', {
          defer: true,
          fn: async (deferred: any) => {
            const promises = [];
            for (let i = 0; i < 10; i++) {
              promises.push(
                this.pointsModule.award(`concurrent_user_${i}`, 5, 'concurrent')
              );
            }
            await Promise.all(promises);
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
   * Benchmark: Mixed read/write operations
   */
  async benchmarkMixedOperations(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Mixed Operations (70% read, 30% write)', {
          defer: true,
          fn: async (deferred: any) => {
            const userId = `user_${counter % 100}`;

            if (counter % 10 < 7) {
              // 70% reads
              await this.pointsModule.getBalance(userId);
            } else {
              // 30% writes
              await this.pointsModule.award(userId, 10, 'mixed');
            }

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
   * Benchmark: Deduct points with validation
   */
  async benchmarkDeductPoints(): Promise<BenchmarkResult> {
    await this.setup();

    // Pre-populate users with sufficient balance
    for (let i = 0; i < 50; i++) {
      await this.pointsModule.award(`deduct_user_${i}`, 10000, 'setup');
    }

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Deduct Points (with validation)', {
          defer: true,
          fn: async (deferred: any) => {
            const userId = `deduct_user_${counter % 50}`;
            await this.pointsModule.deduct(userId, 10, 'benchmark');
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
    console.log('\n=== Points Benchmark Suite ===\n');

    await this.benchmarkAwardPoints();
    await this.benchmarkGetBalance();
    await this.benchmarkLeaderboardQuery();
    await this.benchmarkLeaderboardPagination();
    await this.benchmarkConcurrentOperations();
    await this.benchmarkMixedOperations();
    await this.benchmarkDeductPoints();

    return this.results;
  }

  getResults(): BenchmarkResult[] {
    return this.results;
  }
}

// Run benchmarks if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new PointsBenchmark();
  benchmark.runAll()
    .then((results) => {
      console.log('\n=== Points Benchmark Results ===');
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
