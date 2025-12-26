#!/usr/bin/env tsx

/**
 * Validation script to ensure all benchmarks are properly configured
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  file: string;
  exists: boolean;
  valid: boolean;
  errors: string[];
}

class BenchmarkValidator {
  private results: ValidationResult[] = [];

  async validate(): Promise<void> {
    console.log('🔍 Validating GamificationKit Benchmarks...\n');

    // Check required files
    await this.checkFiles();

    // Check imports
    await this.checkImports();

    // Print results
    this.printResults();
  }

  private async checkFiles(): Promise<void> {
    const requiredFiles = [
      'points-benchmark.ts',
      'storage-benchmark.ts',
      'event-benchmark.ts',
      'module-benchmark.ts',
      'run-benchmarks.ts',
      'types.ts',
      'utils.ts',
      'index.ts',
      'README.md'
    ];

    console.log('📁 Checking required files...');

    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, file);
      const exists = fs.existsSync(filePath);

      this.results.push({
        file,
        exists,
        valid: exists,
        errors: exists ? [] : ['File not found']
      });

      console.log(`  ${exists ? '✅' : '❌'} ${file}`);
    }

    console.log('');
  }

  private async checkImports(): Promise<void> {
    console.log('📦 Checking imports...');

    const importTests = [
      {
        name: 'PointsBenchmark',
        test: async () => {
          const { PointsBenchmark } = await import('./points-benchmark.js');
          return PointsBenchmark !== undefined;
        }
      },
      {
        name: 'StorageBenchmark',
        test: async () => {
          const { StorageBenchmark } = await import('./storage-benchmark.js');
          return StorageBenchmark !== undefined;
        }
      },
      {
        name: 'EventBenchmark',
        test: async () => {
          const { EventBenchmark } = await import('./event-benchmark.js');
          return EventBenchmark !== undefined;
        }
      },
      {
        name: 'ModuleBenchmark',
        test: async () => {
          const { ModuleBenchmark } = await import('./module-benchmark.js');
          return ModuleBenchmark !== undefined;
        }
      },
      {
        name: 'BenchmarkRunner',
        test: async () => {
          const { BenchmarkRunner } = await import('./run-benchmarks.js');
          return BenchmarkRunner !== undefined;
        }
      }
    ];

    for (const importTest of importTests) {
      try {
        const valid = await importTest.test();
        console.log(`  ${valid ? '✅' : '❌'} ${importTest.name}`);

        if (!valid) {
          this.results.push({
            file: importTest.name,
            exists: true,
            valid: false,
            errors: ['Import failed']
          });
        }
      } catch (error: any) {
        console.log(`  ❌ ${importTest.name} (${error.message})`);
        this.results.push({
          file: importTest.name,
          exists: true,
          valid: false,
          errors: [error.message]
        });
      }
    }

    console.log('');
  }

  private printResults(): void {
    const totalChecks = this.results.length;
    const passedChecks = this.results.filter(r => r.valid).length;
    const failedChecks = totalChecks - passedChecks;

    console.log('═'.repeat(80));
    console.log('  VALIDATION RESULTS');
    console.log('═'.repeat(80));
    console.log(`  Total Checks: ${totalChecks}`);
    console.log(`  Passed: ${passedChecks} ✅`);
    console.log(`  Failed: ${failedChecks} ${failedChecks > 0 ? '❌' : '✅'}`);
    console.log('═'.repeat(80));

    if (failedChecks > 0) {
      console.log('\n❌ Validation Failed:');
      for (const result of this.results.filter(r => !r.valid)) {
        console.log(`  - ${result.file}: ${result.errors.join(', ')}`);
      }
      process.exit(1);
    } else {
      console.log('\n✅ All validations passed!');
      console.log('\nYou can now run benchmarks with:');
      console.log('  npm run benchmark              # Run all benchmarks');
      console.log('  npm run benchmark:points       # Run points benchmarks');
      console.log('  npm run benchmark:storage      # Run storage benchmarks');
      console.log('  npm run benchmark:events       # Run event benchmarks');
      console.log('  npm run benchmark:modules      # Run module benchmarks');
      process.exit(0);
    }
  }
}

// Run validation
const validator = new BenchmarkValidator();
validator.validate().catch((error) => {
  console.error('❌ Validation error:', error);
  process.exit(1);
});
