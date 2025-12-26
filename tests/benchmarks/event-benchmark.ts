import Benchmark from 'benchmark';
import { EventManager } from '../../src/core/EventManager.js';

/**
 * Event Benchmark Suite
 * Tests performance of event emission, wildcard matching, and high-volume event processing
 */

interface BenchmarkResult {
  name: string;
  opsPerSec: number;
  margin: number;
  samples: number;
}

export class EventBenchmark {
  private eventManager!: EventManager;
  private results: BenchmarkResult[] = [];

  setup(): void {
    this.eventManager = new EventManager({
      logger: { level: 'error', enabled: false },
      maxListeners: 500,
      enableHistory: true,
      historyLimit: 5000
    });

    // Setup some listeners for benchmarks
    this.eventManager.on('test.event', () => {
      // Simple handler
    });

    this.eventManager.on('test.event.detailed', (data) => {
      // Handler with data processing
      const processed = { ...data, processed: true };
      return processed;
    });

    // Multiple listeners on same event
    for (let i = 0; i < 5; i++) {
      this.eventManager.on('test.multiple', () => {
        // Multiple handlers
      });
    }
  }

  cleanup(): void {
    if (this.eventManager) {
      this.eventManager.destroy();
    }
  }

  /**
   * Benchmark: Simple event emission
   */
  async benchmarkSimpleEmit(): Promise<BenchmarkResult> {
    this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();

      suite
        .add('Event Emit (simple)', {
          defer: true,
          fn: async (deferred: any) => {
            await this.eventManager.emitAsync('test.event', {});
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
          this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Event emission with data payload
   */
  async benchmarkEmitWithPayload(): Promise<BenchmarkResult> {
    this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Event Emit (with payload)', {
          defer: true,
          fn: async (deferred: any) => {
            await this.eventManager.emitAsync('test.event.detailed', {
              userId: `user_${counter}`,
              points: counter * 10,
              timestamp: Date.now(),
              metadata: {
                source: 'benchmark',
                iteration: counter
              }
            });
            counter++;
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
          this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Multiple listeners on same event
   */
  async benchmarkMultipleListeners(): Promise<BenchmarkResult> {
    this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();

      suite
        .add('Event Emit (5 listeners)', {
          defer: true,
          fn: async (deferred: any) => {
            await this.eventManager.emitAsync('test.multiple', { data: 'test' });
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
          this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Wildcard event matching
   */
  async benchmarkWildcardMatching(): Promise<BenchmarkResult> {
    this.setup();

    // Setup wildcard handlers
    this.eventManager.onPattern('user.*', () => {
      // Wildcard handler
    });

    this.eventManager.onPattern('points.**', () => {
      // Multi-level wildcard
    });

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Wildcard Event Matching', {
          defer: true,
          fn: async (deferred: any) => {
            const events = [
              'user.created',
              'user.updated',
              'points.awarded',
              'points.deducted'
            ];
            await this.eventManager.emitAsync(events[counter % events.length], {});
            counter++;
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
          this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Event listener registration/unregistration
   */
  async benchmarkListenerManagement(): Promise<BenchmarkResult> {
    this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Listener Registration/Removal', {
          defer: true,
          fn: async (deferred: any) => {
            const handler = () => { /* test */ };
            this.eventManager.on(`dynamic.event.${counter}`, handler);
            this.eventManager.off(`dynamic.event.${counter}`, handler);
            counter++;
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
          this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: High-volume event processing
   */
  async benchmarkHighVolumeEvents(): Promise<BenchmarkResult> {
    this.setup();

    // Setup handler that does some processing
    this.eventManager.on('high.volume', (data) => {
      const result = {
        userId: data.data.userId,
        timestamp: Date.now(),
        processed: true
      };
      return result;
    });

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('High Volume Events (100 events/batch)', {
          defer: true,
          fn: async (deferred: any) => {
            const promises = [];
            for (let i = 0; i < 100; i++) {
              promises.push(
                this.eventManager.emitAsync('high.volume', {
                  userId: `user_${counter}_${i}`,
                  data: { value: i }
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
        .on('complete', (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Event history queries
   */
  async benchmarkEventHistory(): Promise<BenchmarkResult> {
    this.setup();

    // Populate event history
    for (let i = 0; i < 1000; i++) {
      await this.eventManager.emitAsync(`history.event.${i % 10}`, { value: i });
    }

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();

      suite
        .add('Event History Query', {
          fn: () => {
            this.eventManager.getEventHistory('history.event.5', 50);
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
          this.cleanup();
          resolve(result);
        })
        .run();
    });
  }

  /**
   * Benchmark: Async handler execution
   */
  async benchmarkAsyncHandlers(): Promise<BenchmarkResult> {
    this.setup();

    // Setup async handlers
    this.eventManager.on('async.event', async (data) => {
      // Simulate async operation
      await new Promise(resolve => setImmediate(resolve));
      return { processed: true, ...data };
    });

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Async Event Handlers', {
          defer: true,
          fn: async (deferred: any) => {
            await this.eventManager.emitAsync('async.event', {
              id: counter,
              timestamp: Date.now()
            });
            counter++;
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
          this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Concurrent event emissions
   */
  async benchmarkConcurrentEmissions(): Promise<BenchmarkResult> {
    this.setup();

    // Setup multiple handlers
    for (let i = 0; i < 3; i++) {
      this.eventManager.on('concurrent.event', () => {
        // Handler
      });
    }

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();
      let counter = 0;

      suite
        .add('Concurrent Event Emissions (10 parallel)', {
          defer: true,
          fn: async (deferred: any) => {
            const promises = [];
            for (let i = 0; i < 10; i++) {
              promises.push(
                this.eventManager.emitAsync('concurrent.event', {
                  id: `${counter}_${i}`
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
        .on('complete', (event: any) => {
          const bench = event.currentTarget[0];
          const result: BenchmarkResult = {
            name: bench.name,
            opsPerSec: bench.hz,
            margin: bench.stats.rme,
            samples: bench.stats.sample.length
          };
          this.results.push(result);
          this.cleanup();
          resolve(result);
        })
        .run({ async: true });
    });
  }

  /**
   * Benchmark: Event statistics collection
   */
  async benchmarkEventStats(): Promise<BenchmarkResult> {
    this.setup();

    // Generate some events
    for (let i = 0; i < 100; i++) {
      await this.eventManager.emitAsync(`stats.event.${i % 10}`, {});
    }

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();

      suite
        .add('Event Statistics Collection', {
          fn: () => {
            this.eventManager.getStats();
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
          this.cleanup();
          resolve(result);
        })
        .run();
    });
  }

  /**
   * Run all benchmarks
   */
  async runAll(): Promise<BenchmarkResult[]> {
    console.log('\n=== Event Benchmark Suite ===\n');

    await this.benchmarkSimpleEmit();
    await this.benchmarkEmitWithPayload();
    await this.benchmarkMultipleListeners();
    await this.benchmarkWildcardMatching();
    await this.benchmarkListenerManagement();
    await this.benchmarkHighVolumeEvents();
    await this.benchmarkEventHistory();
    await this.benchmarkAsyncHandlers();
    await this.benchmarkConcurrentEmissions();
    await this.benchmarkEventStats();

    return this.results;
  }

  getResults(): BenchmarkResult[] {
    return this.results;
  }
}

// Run benchmarks if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new EventBenchmark();
  benchmark.runAll()
    .then((results) => {
      console.log('\n=== Event Benchmark Results ===');
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
