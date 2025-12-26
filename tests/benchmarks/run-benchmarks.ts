#!/usr/bin/env tsx

/**
 * Main Benchmark Runner
 * Runs all benchmark suites and generates a comprehensive report
 */

import { PointsBenchmark } from './points-benchmark.js';
import { StorageBenchmark } from './storage-benchmark.js';
import { EventBenchmark } from './event-benchmark.js';
import { ModuleBenchmark } from './module-benchmark.js';

interface BenchmarkResult {
  name: string;
  opsPerSec: number;
  margin: number;
  samples: number;
}

interface SuiteResults {
  suiteName: string;
  results: BenchmarkResult[];
  duration: number;
  totalTests: number;
}

interface BenchmarkReport {
  suites: SuiteResults[];
  totalDuration: number;
  totalTests: number;
  timestamp: string;
  environment: {
    node: string;
    platform: string;
    arch: string;
    cpus: number;
    memory: string;
  };
}

class BenchmarkRunner {
  private report: BenchmarkReport = {
    suites: [],
    totalDuration: 0,
    totalTests: 0,
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: require('os').cpus().length,
      memory: `${Math.round(require('os').totalmem() / 1024 / 1024 / 1024)}GB`
    }
  };

  /**
   * Print a formatted banner
   */
  private printBanner(): void {
    console.log('\n' + '='.repeat(80));
    console.log('  GamificationKit Performance Benchmarks');
    console.log('='.repeat(80));
    console.log(`  Node: ${this.report.environment.node}`);
    console.log(`  Platform: ${this.report.environment.platform} (${this.report.environment.arch})`);
    console.log(`  CPUs: ${this.report.environment.cpus}`);
    console.log(`  Memory: ${this.report.environment.memory}`);
    console.log(`  Timestamp: ${this.report.timestamp}`);
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Run a single benchmark suite
   */
  private async runSuite(
    suiteName: string,
    benchmark: any
  ): Promise<SuiteResults> {
    console.log(`\n📊 Running ${suiteName}...`);
    const startTime = Date.now();

    try {
      const results = await benchmark.runAll();
      const duration = Date.now() - startTime;

      console.log(`✅ ${suiteName} completed in ${(duration / 1000).toFixed(2)}s`);

      return {
        suiteName,
        results,
        duration,
        totalTests: results.length
      };
    } catch (error: any) {
      console.error(`❌ ${suiteName} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Run all benchmark suites
   */
  async runAll(): Promise<void> {
    this.printBanner();

    const startTime = Date.now();

    try {
      // Run Points Benchmarks
      const pointsBenchmark = new PointsBenchmark();
      const pointsResults = await this.runSuite('Points Benchmark Suite', pointsBenchmark);
      this.report.suites.push(pointsResults);

      // Run Storage Benchmarks
      const storageBenchmark = new StorageBenchmark();
      const storageResults = await this.runSuite('Storage Benchmark Suite', storageBenchmark);
      this.report.suites.push(storageResults);

      // Run Event Benchmarks
      const eventBenchmark = new EventBenchmark();
      const eventResults = await this.runSuite('Event Benchmark Suite', eventBenchmark);
      this.report.suites.push(eventResults);

      // Run Module Benchmarks
      const moduleBenchmark = new ModuleBenchmark();
      const moduleResults = await this.runSuite('Module Benchmark Suite', moduleBenchmark);
      this.report.suites.push(moduleResults);

      this.report.totalDuration = Date.now() - startTime;
      this.report.totalTests = this.report.suites.reduce((sum, suite) => sum + suite.totalTests, 0);

      this.printReport();
    } catch (error: any) {
      console.error('\n❌ Benchmark run failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Print comprehensive benchmark report
   */
  private printReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('  BENCHMARK RESULTS SUMMARY');
    console.log('='.repeat(80) + '\n');

    for (const suite of this.report.suites) {
      console.log(`\n📦 ${suite.suiteName}`);
      console.log('─'.repeat(80));

      // Sort results by ops/sec (descending)
      const sortedResults = [...suite.results].sort((a, b) => b.opsPerSec - a.opsPerSec);

      // Find fastest and slowest
      const fastest = sortedResults[0];
      const slowest = sortedResults[sortedResults.length - 1];

      for (const result of suite.results) {
        const isFastest = result === fastest;
        const isSlowest = result === slowest && sortedResults.length > 1;

        let marker = '  ';
        if (isFastest) marker = '🏆';
        else if (isSlowest) marker = '🐌';

        console.log(
          `${marker} ${result.name.padEnd(50)} ` +
          `${result.opsPerSec.toFixed(2).padStart(12)} ops/sec ` +
          `±${result.margin.toFixed(2).padStart(5)}%`
        );
      }

      console.log(`\n   Duration: ${(suite.duration / 1000).toFixed(2)}s`);
      console.log(`   Tests: ${suite.totalTests}`);
    }

    // Performance insights
    console.log('\n' + '='.repeat(80));
    console.log('  PERFORMANCE INSIGHTS');
    console.log('='.repeat(80) + '\n');

    this.printPerformanceInsights();

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('  OVERALL SUMMARY');
    console.log('='.repeat(80));
    console.log(`  Total Suites: ${this.report.suites.length}`);
    console.log(`  Total Tests: ${this.report.totalTests}`);
    console.log(`  Total Duration: ${(this.report.totalDuration / 1000).toFixed(2)}s`);
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Analyze and print performance insights
   */
  private printPerformanceInsights(): void {
    // Find top performers across all suites
    const allResults: Array<BenchmarkResult & { suite: string }> = [];

    for (const suite of this.report.suites) {
      for (const result of suite.results) {
        allResults.push({ ...result, suite: suite.suiteName });
      }
    }

    const sortedBySpeed = [...allResults].sort((a, b) => b.opsPerSec - a.opsPerSec);

    console.log('🚀 Top 5 Fastest Operations:');
    for (let i = 0; i < Math.min(5, sortedBySpeed.length); i++) {
      const result = sortedBySpeed[i];
      console.log(
        `   ${i + 1}. ${result.name} (${result.suite}): ` +
        `${result.opsPerSec.toFixed(2)} ops/sec`
      );
    }

    console.log('\n🐢 Top 5 Slowest Operations:');
    for (let i = 0; i < Math.min(5, sortedBySpeed.length); i++) {
      const result = sortedBySpeed[sortedBySpeed.length - 1 - i];
      console.log(
        `   ${i + 1}. ${result.name} (${result.suite}): ` +
        `${result.opsPerSec.toFixed(2)} ops/sec`
      );
    }

    // Performance recommendations
    console.log('\n💡 Performance Recommendations:');

    const slowOperations = sortedBySpeed.filter(r => r.opsPerSec < 100);
    if (slowOperations.length > 0) {
      console.log('   ⚠️  Consider optimizing operations with < 100 ops/sec:');
      slowOperations.slice(0, 3).forEach(op => {
        console.log(`      - ${op.name} (${op.opsPerSec.toFixed(2)} ops/sec)`);
      });
    } else {
      console.log('   ✅ All operations are performing well (>100 ops/sec)');
    }

    // High variance warnings
    const highVariance = allResults.filter(r => r.margin > 10);
    if (highVariance.length > 0) {
      console.log('\n   ⚠️  High variance detected (>10% margin of error):');
      highVariance.slice(0, 3).forEach(op => {
        console.log(`      - ${op.name} (±${op.margin.toFixed(2)}%)`);
      });
    }
  }

  /**
   * Export results to JSON
   */
  exportToJSON(filename: string = 'benchmark-results.json'): void {
    const fs = require('fs');
    const path = require('path');

    const outputPath = path.join(process.cwd(), filename);
    fs.writeFileSync(outputPath, JSON.stringify(this.report, null, 2));

    console.log(`\n📄 Results exported to: ${outputPath}`);
  }

  /**
   * Export results to Markdown
   */
  exportToMarkdown(filename: string = 'benchmark-results.md'): void {
    const fs = require('fs');
    const path = require('path');

    let markdown = '# GamificationKit Performance Benchmarks\n\n';
    markdown += `**Timestamp:** ${this.report.timestamp}\n\n`;
    markdown += '## Environment\n\n';
    markdown += `- **Node:** ${this.report.environment.node}\n`;
    markdown += `- **Platform:** ${this.report.environment.platform} (${this.report.environment.arch})\n`;
    markdown += `- **CPUs:** ${this.report.environment.cpus}\n`;
    markdown += `- **Memory:** ${this.report.environment.memory}\n\n`;

    for (const suite of this.report.suites) {
      markdown += `## ${suite.suiteName}\n\n`;
      markdown += `**Duration:** ${(suite.duration / 1000).toFixed(2)}s | **Tests:** ${suite.totalTests}\n\n`;
      markdown += '| Benchmark | ops/sec | Margin |\n';
      markdown += '|-----------|---------|--------|\n';

      for (const result of suite.results) {
        markdown += `| ${result.name} | ${result.opsPerSec.toFixed(2)} | ±${result.margin.toFixed(2)}% |\n`;
      }

      markdown += '\n';
    }

    markdown += '## Summary\n\n';
    markdown += `- **Total Suites:** ${this.report.suites.length}\n`;
    markdown += `- **Total Tests:** ${this.report.totalTests}\n`;
    markdown += `- **Total Duration:** ${(this.report.totalDuration / 1000).toFixed(2)}s\n`;

    const outputPath = path.join(process.cwd(), filename);
    fs.writeFileSync(outputPath, markdown);

    console.log(`📄 Results exported to: ${outputPath}`);
  }
}

// Main execution
async function main() {
  const runner = new BenchmarkRunner();

  try {
    await runner.runAll();

    // Export results based on command line args
    const args = process.argv.slice(2);

    if (args.includes('--json')) {
      const filename = args[args.indexOf('--json') + 1] || 'benchmark-results.json';
      runner.exportToJSON(filename);
    }

    if (args.includes('--markdown') || args.includes('--md')) {
      const argIndex = args.indexOf('--markdown') !== -1 ? args.indexOf('--markdown') : args.indexOf('--md');
      const filename = args[argIndex + 1] || 'benchmark-results.md';
      runner.exportToMarkdown(filename);
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { BenchmarkRunner };
