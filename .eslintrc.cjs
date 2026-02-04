module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['html'],
  globals: {
    // Firebase globals loaded from CDN
    firebase: 'readonly',
    // Google Tag Manager
    dataLayer: 'readonly',
    gtag: 'readonly',
    // QR Code library
    QRCode: 'readonly',
  },
  rules: {
    // Error prevention
    'no-console': 'off',
    'no-debugger': 'error',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // Code style - relaxed for existing code
    'prefer-const': 'warn',
    'no-var': 'warn',
    'eqeqeq': ['warn', 'always'],
    'curly': 'off',
  },
  overrides: [
    {
      // CommonJS files (Cloud Functions)
      files: ['functions/**/*.js', '**/*.cjs'],
      env: {
        node: true,
        browser: false,
      },
      parserOptions: {
        sourceType: 'script',
      },
    },
    {
      // Test files
      files: ['**/*.test.js', '**/*.spec.js', 'tests/**/*'],
      env: {
        jest: true,
      },
    },
    {
      // Config files
      files: ['*.config.js', '*.config.cjs', 'vite.config.js'],
      env: {
        node: true,
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '.firebase/',
    'functions/node_modules/',
    'emulator-data/',
    '*.min.js',
  ],
};
