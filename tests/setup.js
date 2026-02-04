// Jest setup file
// This file runs before each test file

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

// Global test utilities
globalThis.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
