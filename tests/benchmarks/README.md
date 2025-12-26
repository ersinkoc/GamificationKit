# GamificationKit Performance Benchmarks

Comprehensive performance benchmarking suite for GamificationKit using the `benchmark` library.

## Overview

This benchmark suite provides detailed performance metrics for all major components of GamificationKit:

- **Points Operations**: Award, deduct, balance queries, leaderboards
- **Storage Adapters**: GET, SET, HGET, HSET, ZADD, ZRANGE operations
- **Event System**: Event emission, wildcard matching, async handlers
- **Module Operations**: Initialization, user stats, multi-module coordination

## Quick Start

### Run All Benchmarks

```bash
npm run benchmark
```

### Run Individual Suites

```bash
# Points benchmark only
npm run benchmark:points

# Storage benchmark only
npm run benchmark:storage

# Events benchmark only
npm run benchmark:events

# Modules benchmark only
npm run benchmark:modules
```

## Export Results

### Export to JSON

```bash
npm run benchmark -- --json benchmark-results.json
```

### Export to Markdown

```bash
npm run benchmark -- --markdown benchmark-report.md
# or
npm run benchmark -- --md benchmark-report.md
```

## Benchmark Suites

### 1. Points Benchmark (`points-benchmark.ts`)

Tests performance of points-related operations:

- **Award Points (Single User)**: Single point award operations
- **Get User Balance**: Balance query performance
- **Leaderboard Query (Top 10)**: Small leaderboard queries
- **Leaderboard Pagination (50 per page)**: Large leaderboard pagination
- **Concurrent Point Awards (10 parallel)**: Parallel point operations
- **Mixed Operations (70% read, 30% write)**: Real-world usage pattern
- **Deduct Points (with validation)**: Point deduction with balance checks

### 2. Storage Benchmark (`storage-benchmark.ts`)

Tests storage adapter performance:

- **Storage GET**: Simple key-value retrieval
- **Storage SET**: Simple key-value storage
- **Storage HGET**: Hash field retrieval
- **Storage HSET**: Hash field storage
- **Storage ZADD**: Sorted set additions
- **Storage ZRANGE**: Sorted set range queries
- **Storage ZREVRANGE**: Reverse sorted set queries
- **Batch Operations (10 SETs)**: Parallel batch operations
- **Storage HINCRBY**: Hash field increment operations
- **Storage DELETE**: Key deletion operations
- **Mixed Storage Ops (80% read, 20% write)**: Realistic workload

### 3. Event Benchmark (`event-benchmark.ts`)

Tests event system performance:

- **Event Emit (simple)**: Basic event emission
- **Event Emit (with payload)**: Events with data payloads
- **Event Emit (5 listeners)**: Multiple listeners per event
- **Wildcard Event Matching**: Pattern-based event matching
- **Listener Registration/Removal**: Dynamic listener management
- **High Volume Events (100 events/batch)**: Bulk event processing
- **Event History Query**: Historical event retrieval
- **Async Event Handlers**: Asynchronous handler execution
- **Concurrent Event Emissions (10 parallel)**: Parallel event processing
- **Event Statistics Collection**: Stats gathering performance

### 4. Module Benchmark (`module-benchmark.ts`)

Tests module operations and coordination:

- **Module Initialization (all modules)**: Full system startup time
- **getUserStats (all modules)**: Cross-module data aggregation
- **Track Event (multi-module)**: Event processing across modules
- **Concurrent User Operations (10 users)**: Parallel user operations
- **Badge Award Operations**: Badge system performance
- **Level XP Award Operations**: Leveling system performance
- **Streak Update Operations**: Streak tracking performance
- **Quest Progress Update**: Quest system performance
- **Reset User (all modules)**: Full user data reset
- **Multi-Module Data Aggregation**: Complex cross-module queries

## Understanding Results

### Output Format

```
🏆 Fastest Operation                    12,345.67 ops/sec  ±1.23%
   Normal Operation                      5,678.90 ops/sec  ±2.45%
🐌 Slowest Operation                       123.45 ops/sec  ±3.67%
```

- 🏆 = Fastest operation in the suite
- 🐌 = Slowest operation in the suite
- **ops/sec** = Operations per second (higher is better)
- **±%** = Margin of error / variance

### Performance Insights

The benchmark runner automatically provides:

1. **Top 5 Fastest Operations**: Best performing operations across all suites
2. **Top 5 Slowest Operations**: Operations that may need optimization
3. **Performance Recommendations**: Automated suggestions based on results
4. **Variance Warnings**: Operations with high performance variance

## Interpreting Results

### Good Performance Indicators

- ✅ **>1000 ops/sec**: Excellent for most operations
- ✅ **>100 ops/sec**: Good for complex operations
- ✅ **<5% margin of error**: Consistent performance
- ✅ **>50 samples**: Reliable statistics

### Performance Concerns

- ⚠️ **<100 ops/sec**: May need optimization
- ⚠️ **>10% margin of error**: High variance, investigate
- ⚠️ **<20 samples**: Insufficient data, run longer

## Best Practices

### Running Benchmarks

1. **Close other applications**: Minimize background processes
2. **Run multiple times**: Performance can vary between runs
3. **Use consistent hardware**: Compare results on same machine
4. **Monitor system resources**: Check CPU/memory during runs
5. **Disable power saving**: Run on AC power with high-performance mode

### Comparing Results

1. **Baseline comparison**: Save results and compare over time
2. **Check environment**: Ensure same Node version and dependencies
3. **Look for trends**: Focus on relative performance, not absolute
4. **Consider variance**: High variance indicates inconsistent performance

### Optimizing Based on Results

1. **Identify bottlenecks**: Focus on slowest operations first
2. **Profile before optimizing**: Use Node profiler for detailed analysis
3. **Test optimizations**: Re-run benchmarks after changes
4. **Document improvements**: Track performance gains

## Architecture

### Benchmark Structure

```
tests/benchmarks/
├── points-benchmark.ts      # Points operations benchmarks
├── storage-benchmark.ts     # Storage adapter benchmarks
├── event-benchmark.ts       # Event system benchmarks
├── module-benchmark.ts      # Module operations benchmarks
├── run-benchmarks.ts        # Main benchmark runner
├── types.ts                 # Shared TypeScript types
├── utils.ts                 # Utility functions
└── README.md               # This file
```

### Adding New Benchmarks

1. Create a new benchmark class extending the pattern:

```typescript
import Benchmark from 'benchmark';
import type { BenchmarkResult } from './types.js';

export class MyBenchmark {
  private results: BenchmarkResult[] = [];

  async setup(): Promise<void> {
    // Initialize resources
  }

  async cleanup(): Promise<void> {
    // Clean up resources
  }

  async benchmarkMyOperation(): Promise<BenchmarkResult> {
    await this.setup();

    return new Promise((resolve) => {
      const suite = new Benchmark.Suite();

      suite
        .add('My Operation', {
          defer: true,
          fn: async (deferred: any) => {
            await myOperation();
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

  async runAll(): Promise<BenchmarkResult[]> {
    await this.benchmarkMyOperation();
    return this.results;
  }

  getResults(): BenchmarkResult[] {
    return this.results;
  }
}
```

2. Add to `run-benchmarks.ts`:

```typescript
import { MyBenchmark } from './my-benchmark.js';

// In runAll() method:
const myBenchmark = new MyBenchmark();
const myResults = await this.runSuite('My Benchmark Suite', myBenchmark);
this.report.suites.push(myResults);
```

3. Add npm script to `package.json`:

```json
"benchmark:my": "tsx tests/benchmarks/my-benchmark.ts"
```

## Troubleshooting

### Memory Issues

If benchmarks fail with out-of-memory errors:

1. Reduce data size in setup methods
2. Run suites individually instead of all at once
3. Increase Node heap size: `NODE_OPTIONS="--max-old-space-size=4096" npm run benchmark`

### Inconsistent Results

If results vary significantly between runs:

1. Check system load (CPU/memory usage)
2. Ensure no other applications are running
3. Disable system background tasks
4. Run benchmarks multiple times and average

### Slow Execution

If benchmarks take too long:

1. Reduce sample size in individual benchmarks
2. Skip slow operations or suites
3. Run specific suites instead of all

## Performance Targets

Based on typical production workloads:

| Operation Type | Target (ops/sec) | Acceptable (ops/sec) |
|---------------|------------------|---------------------|
| Point Award | >5,000 | >1,000 |
| Balance Query | >10,000 | >2,000 |
| Event Emission | >50,000 | >10,000 |
| Storage GET | >20,000 | >5,000 |
| Storage SET | >10,000 | >2,000 |
| Leaderboard Query | >1,000 | >200 |
| User Stats Aggregation | >500 | >100 |

## Contributing

When adding new benchmarks:

1. Follow existing patterns and structure
2. Include comprehensive comments
3. Add proper setup and cleanup
4. Handle async operations correctly
5. Update this README with new benchmarks
6. Test benchmarks before committing

## License

Same as GamificationKit main project (MIT)
