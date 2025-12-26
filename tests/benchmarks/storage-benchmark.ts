import Benchmark from 'benchmark';
import { MemoryStorage } from '../../src/storage/MemoryStorage.js';
import type { StorageInterface } from '../../src/types/storage.js';

/**
 * Storage Benchmark Suite
 * Compares performance of storage operations across different adapters
 */

interface BenchmarkResult {
  name: string;
  opsPerSec: number;
  margin: number;
  samples: number;
}

export class StorageBenchmark {
  private results: BenchmarkResult[] = [];
  private storage!: StorageInterface;

  async setup(storageType: 'memory' | 'redis' = 'memory'): Promise<void> {
    if (storageType === 'memory') {
      this.storage = new MemoryStorage();
    }
    // Note: Redis would need actual Redis instance
    // For benchmark purposes, we'll focus on MemoryStorage and simulated Redis patterns

    await this.storage.connect();

    // Pre-populate with test data
    for (let i = 0; i < 1000; i++) {
      await this.storage.set(`test_key_${i}`, `test_value_${i}`);
    }

    // Populate sorted sets
    for (let i = 0; i < 500; i++) {
      await this.storage.zadd(`leaderboard`, i, `player_${i}`);
    }

    // Populate hashes
    for (let i = 0; i < 100; i++) {
      await this.storage.hset(`user:${i}`, 'points', String(i * 100));
      await this.storage.hset(`user:${i}`, 'level', String(Math.floor(i / 10)));
    }
  }

  async cleanup(): Promise<void> {
    if (this.storage) {
      await this.storage.disconnect();
    }
  }

  /**
   * Benchmark: Simple GET operations
   */
  async benchmarkGet(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Storage GET', {
          defer: true,
          fn: async (deferred: any) => {
            await this.storage.get(`test_key_${counter % 1000}`);
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
   * Benchmark: Simple SET operations
   */
  async benchmarkSet(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Storage SET', {
          defer: true,
          fn: async (deferred: any) => {
            await this.storage.set(`bench_key_${counter}`, `bench_value_${counter}`);
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
   * Benchmark: Hash operations (HGET)
   */
  async benchmarkHGet(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Storage HGET', {
          defer: true,
          fn: async (deferred: any) => {
            await this.storage.hget(`user:${counter % 100}`, 'points');
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
   * Benchmark: Hash operations (HSET)
   */
  async benchmarkHSet(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Storage HSET', {
          defer: true,
          fn: async (deferred: any) => {
            await this.storage.hset(`bench_user:${counter % 50}`, 'score', String(counter));
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
   * Benchmark: Sorted set operations (ZADD)
   */
  async benchmarkZAdd(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Storage ZADD', {
          defer: true,
          fn: async (deferred: any) => {
            await this.storage.zadd(`bench_leaderboard`, counter, `bench_player_${counter}`);
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
   * Benchmark: Sorted set range query
   */
  async benchmarkZRange(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();

      suite
        .add('Storage ZRANGE (top 10)', {
          defer: true,
          fn: async (deferred: any) => {
            await this.storage.zrange(`leaderboard`, 0, 9);
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
   * Benchmark: Sorted set reverse range query
   */
  async benchmarkZRevRange(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();

      suite
        .add('Storage ZREVRANGE (top 50)', {
          defer: true,
          fn: async (deferred: any) => {
            await this.storage.zrevrange(`leaderboard`, 0, 49, { withScores: true });
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
   * Benchmark: Batch operations
   */
  async benchmarkBatchOperations(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Batch Operations (10 SETs)', {
          defer: true,
          fn: async (deferred: any) => {
            const promises = [];
            for (let i = 0; i < 10; i++) {
              promises.push(
                this.storage.set(`batch_${counter}_${i}`, `value_${counter}_${i}`)
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
   * Benchmark: HINCRBY operations (common for counters)
   */
  async benchmarkHIncrBy(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Storage HINCRBY', {
          defer: true,
          fn: async (deferred: any) => {
            await this.storage.hincrby(`counter:user_${counter % 50}`, 'points', 10);
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
   * Benchmark: DELETE operations
   */
  async benchmarkDelete(): Promise<BenchmarkResult> {
    await this.setup();

    // Pre-populate keys to delete
    for (let i = 0; i < 2000; i++) {
      await this.storage.set(`delete_key_${i}`, `value_${i}`);
    }

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Storage DELETE', {
          defer: true,
          fn: async (deferred: any) => {
            await this.storage.delete(`delete_key_${counter}`);
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
   * Benchmark: Mixed read/write operations
   */
  async benchmarkMixedOperations(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Mixed Storage Ops (80% read, 20% write)', {
          defer: true,
          fn: async (deferred: any) => {
            if (counter % 10 < 8) {
              // 80% reads
              await this.storage.get(`test_key_${counter % 1000}`);
            } else {
              // 20% writes
              await this.storage.set(`mixed_key_${counter}`, `value_${counter}`);
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
   * Run all benchmarks
   */
  async runAll(): Promise<BenchmarkResult[]> {
    console.log('\n=== Storage Benchmark Suite ===\n');

    await this.benchmarkGet();
    await this.benchmarkSet();
    await this.benchmarkHGet();
    await this.benchmarkHSet();
    await this.benchmarkZAdd();
    await this.benchmarkZRange();
    await this.benchmarkZRevRange();
    await this.benchmarkBatchOperations();
    await this.benchmarkHIncrBy();
    await this.benchmarkDelete();
    await this.benchmarkMixedOperations();

    return this.results;
  }

  getResults(): BenchmarkResult[] {
    return this.results;
  }
}

// Run benchmarks if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new StorageBenchmark();
  benchmark.runAll()
    .then((results) => {
      console.log('\n=== Storage Benchmark Results ===');
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
