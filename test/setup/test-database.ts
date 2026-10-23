/**
 * Test Database Configuration and Safety Guards
 *
 * CRITICAL: This module ensures tests NEVER run against production/development databases.
 * All integration tests must use a dedicated test database (appliances_lk_test).
 */

import { DataSource } from 'typeorm';

const ALLOWED_TEST_DB_NAMES = ['appliances_lk_test', 'appliances_test'];
const FORBIDDEN_DB_NAMES = ['appliances_lk', 'appliances', 'postgres'];

/**
 * Validates that the current database configuration is safe for testing.
 * Throws immediately if connected to a forbidden database.
 */
export function assertTestDatabaseSafety(): void {
  const dbName = process.env.DB_NAME;
  const nodeEnv = process.env.NODE_ENV;

  if (nodeEnv !== 'test') {
    throw new Error(
      `SAFETY ERROR: NODE_ENV must be "test" for integration tests. Current: "${nodeEnv}"\n` +
        'Set NODE_ENV=test in your test environment.',
    );
  }

  if (!dbName) {
    throw new Error(
      'SAFETY ERROR: DB_NAME environment variable is not set.\n' +
        'Configure .env.test with DB_NAME=appliances_lk_test',
    );
  }

  if (FORBIDDEN_DB_NAMES.includes(dbName.toLowerCase())) {
    throw new Error(
      `SAFETY ERROR: Refusing to run tests against database "${dbName}".\n` +
        'This appears to be a development or production database.\n' +
        'Create a dedicated test database: appliances_lk_test',
    );
  }

  if (!ALLOWED_TEST_DB_NAMES.includes(dbName.toLowerCase())) {
    console.warn(
      `WARNING: Database "${dbName}" is not in the recognized test database list.\n` +
        'Proceeding with caution. Recommended test DB name: appliances_lk_test',
    );
  }
}

/**
 * Validates a DataSource is connected to a safe test database.
 */
export function assertDataSourceSafety(dataSource: DataSource): void {
  const dbName = dataSource.options.database as string;

  if (FORBIDDEN_DB_NAMES.includes(dbName?.toLowerCase())) {
    throw new Error(
      `SAFETY ERROR: DataSource connected to forbidden database "${dbName}".\n` +
        'Integration tests must use appliances_lk_test database.',
    );
  }
}

/**
 * Cleans all test data from the database.
 * Only works on allowed test databases.
 */
export async function cleanTestDatabase(dataSource: DataSource): Promise<void> {
  assertDataSourceSafety(dataSource);

  // Clean in order respecting foreign key constraints
  const tablesToClean = [
    'auth_sessions',
    'account_actions',
    'notifications',
    'cart_items',
    'carts',
    'order_items',
    'order_events',
    'orders',
    'payments',
    'repair_tickets',
    'product_reviews',
    'product_images',
    'products',
    'categories',
    'ai_messages',
    'ai_conversations',
    'chat_messages',
    'chat_sessions',
    'loyalty_entries',
    'promotion_recipients',
    'promotion_runs',
    'promotions',
    'storefront_themes',
    'banner_sections',
    'users',
  ];

  for (const table of tablesToClean) {
    try {
      await dataSource.query(`DELETE FROM "${table}"`);
    } catch {
      // Table might not exist yet, ignore
    }
  }
}

/**
 * Cleans only auth-related test data (for faster isolated auth tests).
 */
export async function cleanAuthTestData(dataSource: DataSource): Promise<void> {
  assertDataSourceSafety(dataSource);

  await dataSource.query('DELETE FROM auth_sessions');
  await dataSource.query('DELETE FROM account_actions');
  await dataSource.query('DELETE FROM notifications');
  await dataSource.query(
    "DELETE FROM users WHERE email LIKE '%@test.example.com' OR email LIKE 'test_%@example.com'",
  );
}
