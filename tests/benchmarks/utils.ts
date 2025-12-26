/**
 * Utility functions for benchmarks
 */

import type { BenchmarkResult, PerformanceMetrics, BenchmarkComparison } from './types.js';

/**
 * Format number as operations per second
 */
export function formatOpsPerSec(opsPerSec: number): string {
  if (opsPerSec >= 1000000) {
    return `${(opsPerSec / 1000000).toFixed(2)}M ops/sec`;
  } else if (opsPerSec >= 1000) {
    return `${(opsPerSec / 1000).toFixed(2)}K ops/sec`;
  } else {
    return `${opsPerSec.toFixed(2)} ops/sec`;
  }
}

/**
 * Format duration in milliseconds
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Format bytes as human-readable size
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Calculate performance metrics from benchmark results
 */
export function calculateMetrics(results: BenchmarkResult[]): PerformanceMetrics {
  const opsPerSecValues = results.map(r => r.opsPerSec);
  const sorted = [...opsPerSecValues].sort((a, b) => a - b);

  const mean = opsPerSecValues.reduce((sum, val) => sum + val, 0) / opsPerSecValues.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Calculate standard deviation
  const variance = opsPerSecValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / opsPerSecValues.length;
  const standardDeviation = Math.sqrt(variance);

  // Calculate margin of error (95% confidence interval)
  const marginOfError = 1.96 * (standardDeviation / Math.sqrt(opsPerSecValues.length));
  const relativeMarginOfError = (marginOfError / mean) * 100;

  return {
    mean,
    median,
    min,
    max,
    standardDeviation,
    marginOfError,
    relativeMarginOfError
  };
}

/**
 * Compare two benchmark results
 */
export function compareBenchmarks(
  baseline: BenchmarkResult,
  current: BenchmarkResult
): BenchmarkComparison {
  const difference = current.opsPerSec - baseline.opsPerSec;
  const percentChange = (difference / baseline.opsPerSec) * 100;

  // Consider significant if change is > 5% and outside margin of error
  const significant = Math.abs(percentChange) > 5 &&
    Math.abs(difference) > (baseline.margin + current.margin);

  return {
    baseline,
    current,
    difference,
    percentChange,
    significant
  };
}

/**
 * Generate a random user ID
 */
export function generateUserId(index?: number): string {
  if (index !== undefined) {
    return `user_${index}`;
  }
  return `user_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generate random test data
 */
export function generateTestData(count: number): Array<{ userId: string; value: number }> {
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push({
      userId: generateUserId(i),
      value: Math.floor(Math.random() * 1000)
    });
  }
  return data;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a progress bar
 */
export function createProgressBar(current: number, total: number, width: number = 40): string {
  const percentage = (current / total) * 100;
  const filled = Math.floor((current / total) * width);
  const empty = width - filled;

  return `[${'█'.repeat(filled)}${' '.repeat(empty)}] ${percentage.toFixed(1)}%`;
}

/**
 * Print benchmark result in a formatted way
 */
export function printBenchmarkResult(result: BenchmarkResult, padding: number = 50): void {
  const name = result.name.padEnd(padding);
  const ops = formatOpsPerSec(result.opsPerSec).padStart(15);
  const margin = `±${result.margin.toFixed(2)}%`.padStart(8);

  let marker = '  ';
  if (result.fastest) marker = '🏆';
  else if (result.slowest) marker = '🐌';

  console.log(`${marker} ${name} ${ops} ${margin}`);
}

/**
 * Print a table of results
 */
export function printResultsTable(
  results: BenchmarkResult[],
  title: string = 'Benchmark Results'
): void {
  console.log(`\n${title}`);
  console.log('─'.repeat(80));

  const sortedResults = [...results].sort((a, b) => b.opsPerSec - a.opsPerSec);

  if (sortedResults.length > 0) {
    sortedResults[0].fastest = true;
    if (sortedResults.length > 1) {
      sortedResults[sortedResults.length - 1].slowest = true;
    }
  }

  for (const result of results) {
    printBenchmarkResult(result);
  }
}

/**
 * Calculate percentile from array of values
 */
export function calculatePercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Get memory usage in a readable format
 */
export function getMemoryUsage(): { heap: string; external: string; total: string } {
  const usage = process.memoryUsage();
  return {
    heap: formatBytes(usage.heapUsed),
    external: formatBytes(usage.external),
    total: formatBytes(usage.heapUsed + usage.external)
  };
}

/**
 * Measure execution time of a function
 */
export async function measureExecutionTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; duration: number }> {
  const startTime = performance.now();
  const result = await fn();
  const duration = performance.now() - startTime;

  return { result, duration };
}

/**
 * Run a function multiple times and return average execution time
 */
export async function averageExecutionTime(
  fn: () => any | Promise<any>,
  iterations: number = 100
): Promise<number> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const { duration } = await measureExecutionTime(fn);
    times.push(duration);
  }

  return times.reduce((sum, time) => sum + time, 0) / times.length;
}

/**
 * Create a simple ASCII chart
 */
export function createChart(
  data: Array<{ label: string; value: number }>,
  maxWidth: number = 50
): string {
  const maxValue = Math.max(...data.map(d => d.value));
  const scale = maxWidth / maxValue;

  let chart = '';
  for (const item of data) {
    const barWidth = Math.floor(item.value * scale);
    const bar = '█'.repeat(barWidth);
    chart += `${item.label.padEnd(30)} ${bar} ${item.value.toFixed(2)}\n`;
  }

  return chart;
}

/**
 * Export results to JSON file
 */
export function exportToJSON(data: any, filename: string): void {
  const fs = require('fs');
  const path = require('path');

  const outputPath = path.join(process.cwd(), filename);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
}

/**
 * Load baseline results for comparison
 */
export function loadBaseline(filename: string): any {
  const fs = require('fs');
  const path = require('path');

  try {
    const baselinePath = path.join(process.cwd(), filename);
    const content = fs.readFileSync(baselinePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

/**
 * Generate a summary statistics object
 */
export function generateSummaryStats(results: BenchmarkResult[]) {
  const metrics = calculateMetrics(results);

  return {
    count: results.length,
    mean: formatOpsPerSec(metrics.mean),
    median: formatOpsPerSec(metrics.median),
    min: formatOpsPerSec(metrics.min),
    max: formatOpsPerSec(metrics.max),
    stdDev: metrics.standardDeviation.toFixed(2),
    marginOfError: `±${metrics.relativeMarginOfError.toFixed(2)}%`
  };
}
