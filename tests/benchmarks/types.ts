/**
 * Shared TypeScript types for benchmarks
 */

/**
 * Result of a single benchmark test
 */
export interface BenchmarkResult {
  name: string;
  opsPerSec: number;
  margin: number;
  samples: number;
  fastest?: boolean;
  slowest?: boolean;
}

/**
 * Results of a complete benchmark suite
 */
export interface SuiteResults {
  suiteName: string;
  results: BenchmarkResult[];
  duration: number;
  totalTests: number;
  timestamp: string;
}

/**
 * Complete benchmark report
 */
export interface BenchmarkReport {
  suites: SuiteResults[];
  totalDuration: number;
  totalTests: number;
  timestamp: string;
  environment: BenchmarkEnvironment;
}

/**
 * System environment information
 */
export interface BenchmarkEnvironment {
  node: string;
  platform: string;
  arch: string;
  cpus: number;
  memory: string;
  hostname?: string;
}

/**
 * Options for benchmark configuration
 */
export interface BenchmarkOptions {
  minSamples?: number;
  maxTime?: number;
  delay?: number;
  initCount?: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number;
  marginOfError: number;
  relativeMarginOfError: number;
}

/**
 * Benchmark comparison
 */
export interface BenchmarkComparison {
  baseline: BenchmarkResult;
  current: BenchmarkResult;
  difference: number;
  percentChange: number;
  significant: boolean;
}

/**
 * Base interface for benchmark suites
 */
export interface BenchmarkSuite {
  setup(): void | Promise<void>;
  cleanup(): void | Promise<void>;
  runAll(): Promise<BenchmarkResult[]>;
  getResults(): BenchmarkResult[];
}

/**
 * Storage benchmark specific types
 */
export interface StorageBenchmarkOptions {
  storageType: 'memory' | 'redis' | 'mongodb' | 'postgres';
  dataSize?: number;
  iterations?: number;
}

/**
 * Event benchmark specific types
 */
export interface EventBenchmarkOptions {
  maxListeners?: number;
  enableHistory?: boolean;
  historyLimit?: number;
}

/**
 * Module benchmark specific types
 */
export interface ModuleBenchmarkOptions {
  modules?: string[];
  userCount?: number;
  prePopulate?: boolean;
}

/**
 * Points benchmark specific types
 */
export interface PointsBenchmarkOptions {
  userCount?: number;
  dailyLimit?: number;
  weeklyLimit?: number;
  monthlyLimit?: number;
}
