export default {
  testEnvironment: 'node',
  testTimeout: 15000,
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  maxWorkers: 1,
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/utils/**/*.js',
    'src/core/RuleEngine.js',
    'src/storage/MemoryStorage.js',
    '!src/**/*.test.js',
    '!src/**/index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 15,
      functions: 15,
      lines: 15,
      statements: 15
    }
  },
  transform: {}
};