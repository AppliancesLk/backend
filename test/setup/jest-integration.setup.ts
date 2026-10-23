/**
 * Jest Integration Test Setup
 *
 * Runs before integration tests to:
 * - Verify test database safety
 * - Load test environment variables
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { assertTestDatabaseSafety } from './test-database';

// Load test environment
const envPath = resolve(__dirname, '../../.env.test');
config({ path: envPath });

// Fallback to .env if .env.test doesn't set NODE_ENV
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Safety check - fail fast if not using test database
try {
  assertTestDatabaseSafety();
} catch (error) {
  console.error('\n' + (error as Error).message + '\n');
  console.error(
    'Create a .env.test file based on .env.test.example with test database settings.',
  );
  process.exit(1);
}

// Increase Jest timeout for integration tests
jest.setTimeout(60000);
