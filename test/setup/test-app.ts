/**
 * Test Application Factory
 *
 * Creates properly configured NestJS test applications
 * with all necessary mocks and configurations.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { applyMocksToApp, mockEmail, resetAllMocks } from './mock-providers';
import { assertTestDatabaseSafety } from './test-database';

/**
 * Test application context
 */
export interface TestAppContext {
  app: INestApplication;
  module: TestingModule;
  mockEmail: typeof mockEmail;
}

/**
 * Create a fully configured test application
 *
 * This creates an app with:
 * - All production modules
 * - Validation pipes
 * - Email service mocked
 * - Database safety verified
 */
export async function createTestApp(): Promise<TestAppContext> {
  // Verify we're not about to destroy production data
  assertTestDatabaseSafety();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // Apply same configuration as production
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Apply mocks for external services
  applyMocksToApp(app);

  await app.init();

  return {
    app,
    module: moduleFixture,
    mockEmail,
  };
}

/**
 * Cleanup and close a test application
 */
export async function closeTestApp(context: TestAppContext): Promise<void> {
  resetAllMocks();
  await context.app.close();
}

/**
 * Get the HTTP server from a test app (for supertest)
 */
export function getHttpServer(context: TestAppContext): unknown {
  return context.app.getHttpServer();
}
