/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js', '**/*.spec.js'],
  collectCoverageFrom: [
    'functions/**/*.js',
    '!functions/node_modules/**',
    '!**/coverage/**',
    '!functions/index.js',
    '!functions/subscription.js',
    '!functions/subscription-sync.js',
    '!functions/rate-limiter.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  verbose: true,
  testTimeout: 10000,
  transform: {},
};
