/**
 * Test Fixtures and Factories
 *
 * Provides deterministic test data for authentication tests.
 * All test users use @test.example.com domain for easy cleanup.
 */

import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../src/users/enums/user-role.enum';

/**
 * Test user data structure
 */
export interface TestUserData {
  username: string;
  email: string;
  password: string;
  passwordHash?: string;
  role: UserRole;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  deactivatedAt: Date | null;
}

/**
 * Generate a unique test identifier
 */
export function uniqueId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Create test customer data
 */
export function createTestCustomer(
  overrides: Partial<TestUserData> = {},
): TestUserData {
  const id = uniqueId();
  return {
    username: `test_customer_${id}`,
    email: `test_customer_${id}@test.example.com`,
    password: 'TestPassword123!',
    role: UserRole.CUSTOMER,
    isActive: true,
    emailVerifiedAt: new Date(),
    deactivatedAt: null,
    ...overrides,
  };
}

/**
 * Create test admin data
 */
export function createTestAdmin(
  overrides: Partial<TestUserData> = {},
): TestUserData {
  const id = uniqueId();
  return {
    username: `test_admin_${id}`,
    email: `test_admin_${id}@test.example.com`,
    password: 'AdminPassword123!',
    role: UserRole.ADMIN,
    isActive: true,
    emailVerifiedAt: new Date(),
    deactivatedAt: null,
    ...overrides,
  };
}

/**
 * Create test repairer data
 */
export function createTestRepairer(
  overrides: Partial<TestUserData> = {},
): TestUserData {
  const id = uniqueId();
  return {
    username: `test_repairer_${id}`,
    email: `test_repairer_${id}@test.example.com`,
    password: 'RepairerPassword123!',
    role: UserRole.REPAIRER,
    isActive: true,
    emailVerifiedAt: new Date(),
    deactivatedAt: null,
    ...overrides,
  };
}

/**
 * Create unverified user data
 */
export function createUnverifiedUser(
  overrides: Partial<TestUserData> = {},
): TestUserData {
  const id = uniqueId();
  return {
    username: `test_unverified_${id}`,
    email: `test_unverified_${id}@test.example.com`,
    password: 'UnverifiedPassword123!',
    role: UserRole.CUSTOMER,
    isActive: false,
    emailVerifiedAt: null,
    deactivatedAt: null,
    ...overrides,
  };
}

/**
 * Create inactive (deactivated) user data
 */
export function createInactiveUser(
  overrides: Partial<TestUserData> = {},
): TestUserData {
  const id = uniqueId();
  return {
    username: `test_inactive_${id}`,
    email: `test_inactive_${id}@test.example.com`,
    password: 'InactivePassword123!',
    role: UserRole.CUSTOMER,
    isActive: false,
    emailVerifiedAt: new Date(),
    deactivatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Hash a password using bcrypt (same as production)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Create test user data with pre-hashed password
 */
export async function createTestUserWithHash(
  factory: (overrides?: Partial<TestUserData>) => TestUserData,
  overrides: Partial<TestUserData> = {},
): Promise<TestUserData> {
  const user = factory(overrides);
  user.passwordHash = await hashPassword(user.password);
  return user;
}

/**
 * Standard test headers for browser security
 */
export const TEST_HEADERS = {
  Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  'X-Requested-With': 'XMLHttpRequest',
};

/**
 * Create headers with a session cookie
 */
export function headersWithCookie(cookie: string): Record<string, string> {
  return {
    ...TEST_HEADERS,
    Cookie: cookie,
  };
}

/**
 * Extract session cookie from response headers
 */
export function extractSessionCookie(
  setCookieHeaders: string | string[] | undefined,
): string | undefined {
  const headers = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : setCookieHeaders
      ? [setCookieHeaders]
      : [];

  for (const header of headers) {
    if (header.startsWith('appliances_session=')) {
      return header.split(';')[0];
    }
  }
  return undefined;
}

/**
 * Registration DTO for tests
 */
export interface RegisterDto {
  username: string;
  email: string;
  password: string;
}

/**
 * Create registration DTO from test user data
 */
export function toRegisterDto(user: TestUserData): RegisterDto {
  return {
    username: user.username,
    email: user.email,
    password: user.password,
  };
}

/**
 * Login DTO for tests
 */
export interface LoginDto {
  username: string;
  password: string;
}

/**
 * Create login DTO from test user data (using email)
 */
export function toLoginDto(user: TestUserData): LoginDto {
  return {
    username: user.email,
    password: user.password,
  };
}
