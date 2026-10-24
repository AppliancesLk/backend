/**
 * Authentication Integration Tests
 *
 * Test Case IDs: TC-AUTH-I-001 through TC-AUTH-I-020
 *
 * These tests verify authentication endpoints against a real test database.
 * IMPORTANT: These tests require:
 * 1. A PostgreSQL test database named 'appliances_lk_test'
 * 2. Migrations run on the test database
 * 3. A .env.test file with test database credentials
 *
 * Run with: npm run test:integration:jest
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../../src/app.module';
import { configureApp } from '../../../src/app.setup';
import {
  cleanAuthTestData,
  assertTestDatabaseSafety,
} from '../../setup/test-database';
import {
  mockEmail,
  applyMocksToApp,
  resetAllMocks,
} from '../../setup/mock-providers';
import {
  createTestCustomer,
  createTestAdmin,
  createUnverifiedUser,
  hashPassword,
  TEST_HEADERS,
  extractSessionCookie,
  toRegisterDto,
  toLoginDto,
} from '../../setup/test-fixtures';
import { UserRole } from '../../../src/users/enums/user-role.enum';

describe('Authentication Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    // Verify test database safety
    assertTestDatabaseSafety();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);

    // Apply mocks for external services
    applyMocksToApp(app);

    await app.init();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await cleanAuthTestData(dataSource);
    await app.close();
  });

  beforeEach(async () => {
    resetAllMocks();
    await cleanAuthTestData(dataSource);
  });

  describe('POST /auth/register', () => {
    // TC-AUTH-I-001
    it('should register a new customer successfully', async () => {
      const userData = createTestCustomer();
      const registerDto = toRegisterDto(userData);

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set(TEST_HEADERS)
        .send(registerDto)
        .expect(201);

      expect(response.body.requiresVerification).toBe(true);
      expect(response.body.email).toBe(userData.email);

      // Verify user was created in database
      const userInDb = await dataSource.query(
        'SELECT * FROM users WHERE email = $1',
        [userData.email],
      );
      expect(userInDb).toHaveLength(1);
      expect(userInDb[0].role).toBe(UserRole.CUSTOMER);
      expect(userInDb[0].is_active).toBe(false);
      expect(userInDb[0].email_verified_at).toBeNull();

      // Verify password is hashed
      expect(userInDb[0].password_hash).not.toBe(userData.password);
      expect(userInDb[0].password_hash.startsWith('$2')).toBe(true);

      // Verify verification email was sent
      const verificationEmail = mockEmail.findVerificationEmail(userData.email);
      expect(verificationEmail).toBeDefined();
    });

    // TC-AUTH-I-002
    it('should reject registration with duplicate email', async () => {
      const userData = createTestCustomer();

      // Create user first
      const passwordHash = await hashPassword(userData.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [userData.username, userData.email, passwordHash, UserRole.CUSTOMER],
      );

      // Try to register with same email
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set(TEST_HEADERS)
        .send({
          ...toRegisterDto(userData),
          username: 'different_username',
        })
        .expect(409);

      expect(response.body.message).toContain('already registered');
    });

    // TC-AUTH-I-003
    it('should reject registration with duplicate username', async () => {
      const userData = createTestCustomer();

      // Create user first
      const passwordHash = await hashPassword(userData.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [userData.username, userData.email, passwordHash, UserRole.CUSTOMER],
      );

      // Try to register with same username
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set(TEST_HEADERS)
        .send({
          ...toRegisterDto(userData),
          email: 'different_email@test.example.com',
        })
        .expect(409);

      expect(response.body.message).toContain('already registered');
    });

    // TC-AUTH-I-004
    it('should reject registration without CSRF header', async () => {
      const userData = createTestCustomer();

      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', TEST_HEADERS.Origin)
        // Missing X-Requested-With header
        .send(toRegisterDto(userData))
        .expect(403);
    });

    // TC-AUTH-I-005
    it('should always create CUSTOMER role regardless of input', async () => {
      const userData = createTestCustomer();

      await request(app.getHttpServer())
        .post('/auth/register')
        .set(TEST_HEADERS)
        .send({
          ...toRegisterDto(userData),
          role: 'ADMIN', // Should be ignored
        })
        .expect(400); // Rejected by validation (extra field)
    });
  });

  describe('POST /auth/login', () => {
    let verifiedUser: ReturnType<typeof createTestCustomer>;

    beforeEach(async () => {
      verifiedUser = createTestCustomer();
      const passwordHash = await hashPassword(verifiedUser.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [
          verifiedUser.username,
          verifiedUser.email,
          passwordHash,
          UserRole.CUSTOMER,
        ],
      );
    });

    // TC-AUTH-I-006
    it('should login successfully with valid email credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send(toLoginDto(verifiedUser))
        .expect(201);

      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(verifiedUser.email);
      expect(response.body.user.role).toBe(UserRole.CUSTOMER);
      expect(response.body.user).not.toHaveProperty('passwordHash');

      // Verify session cookie is set
      const cookie = extractSessionCookie(response.headers['set-cookie']);
      expect(cookie).toBeDefined();
      expect(cookie).toContain('appliances_session=');
    });

    // TC-AUTH-I-007
    it('should login successfully with valid username', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send({
          username: verifiedUser.username,
          password: verifiedUser.password,
        })
        .expect(201);

      expect(response.body.user.username).toBe(verifiedUser.username);
    });

    // TC-AUTH-I-008
    it('should reject login with incorrect password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send({
          username: verifiedUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.message).toContain('Invalid');
    });

    // TC-AUTH-I-009
    it('should reject login for unverified account', async () => {
      const unverifiedUser = createUnverifiedUser();
      const passwordHash = await hashPassword(unverifiedUser.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, false, NULL)`,
        [
          unverifiedUser.username,
          unverifiedUser.email,
          passwordHash,
          UserRole.CUSTOMER,
        ],
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send(toLoginDto(unverifiedUser))
        .expect(403);

      expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    // TC-AUTH-I-010
    it('should reject login without CSRF header', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', TEST_HEADERS.Origin)
        .send(toLoginDto(verifiedUser))
        .expect(403);
    });
  });

  describe('GET /auth/profile', () => {
    let verifiedUser: ReturnType<typeof createTestCustomer>;
    let sessionCookie: string;

    beforeEach(async () => {
      verifiedUser = createTestCustomer();
      const passwordHash = await hashPassword(verifiedUser.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [
          verifiedUser.username,
          verifiedUser.email,
          passwordHash,
          UserRole.CUSTOMER,
        ],
      );

      // Login to get session
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send(toLoginDto(verifiedUser));

      sessionCookie =
        extractSessionCookie(loginResponse.headers['set-cookie']) ?? '';
    });

    // TC-AUTH-I-011
    it('should return profile for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body.username).toBe(verifiedUser.username);
      expect(response.body.email).toBe(verifiedUser.email);
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    // TC-AUTH-I-012
    it('should reject profile request without session', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    // TC-AUTH-I-013
    it('should reject profile with invalid session token', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Cookie', 'appliances_session=invalid_token')
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    let verifiedUser: ReturnType<typeof createTestCustomer>;
    let sessionCookie: string;

    beforeEach(async () => {
      verifiedUser = createTestCustomer();
      const passwordHash = await hashPassword(verifiedUser.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [
          verifiedUser.username,
          verifiedUser.email,
          passwordHash,
          UserRole.CUSTOMER,
        ],
      );

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send(toLoginDto(verifiedUser));

      sessionCookie =
        extractSessionCookie(loginResponse.headers['set-cookie']) ?? '';
    });

    // TC-AUTH-I-014
    it('should logout and invalidate session', async () => {
      // Logout
      const logoutResponse = await request(app.getHttpServer())
        .post('/auth/logout')
        .set(TEST_HEADERS)
        .set('Cookie', sessionCookie)
        .expect(201);

      // Check cookie is cleared
      const setCookie = logoutResponse.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie[0]).toContain('Expires=Thu, 01 Jan 1970');

      // Session should be invalid now
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Cookie', sessionCookie)
        .expect(401);
    });
  });

  describe('Role-based access control', () => {
    // TC-AUTH-I-015
    it('should grant access to ADMIN-only endpoint for admin user', async () => {
      const adminUser = createTestAdmin();
      const passwordHash = await hashPassword(adminUser.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [adminUser.username, adminUser.email, passwordHash, UserRole.ADMIN],
      );

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send(toLoginDto(adminUser));

      const sessionCookie =
        extractSessionCookie(loginResponse.headers['set-cookie']) ?? '';

      await request(app.getHttpServer())
        .get('/auth/test/admin')
        .set('Cookie', sessionCookie)
        .expect(200);
    });

    // TC-AUTH-I-016
    it('should deny access to ADMIN-only endpoint for customer', async () => {
      const customerUser = createTestCustomer();
      const passwordHash = await hashPassword(customerUser.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [
          customerUser.username,
          customerUser.email,
          passwordHash,
          UserRole.CUSTOMER,
        ],
      );

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send(toLoginDto(customerUser));

      const sessionCookie =
        extractSessionCookie(loginResponse.headers['set-cookie']) ?? '';

      await request(app.getHttpServer())
        .get('/auth/test/admin')
        .set('Cookie', sessionCookie)
        .expect(403);
    });

    // TC-AUTH-I-017
    it('should grant access to CUSTOMER endpoint for customer', async () => {
      const customerUser = createTestCustomer();
      const passwordHash = await hashPassword(customerUser.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [
          customerUser.username,
          customerUser.email,
          passwordHash,
          UserRole.CUSTOMER,
        ],
      );

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send(toLoginDto(customerUser));

      const sessionCookie =
        extractSessionCookie(loginResponse.headers['set-cookie']) ?? '';

      await request(app.getHttpServer())
        .get('/auth/test/customer')
        .set('Cookie', sessionCookie)
        .expect(200);
    });
  });

  describe('Email verification flow', () => {
    // TC-AUTH-I-018
    it('should complete full registration and verification flow', async () => {
      const userData = createTestCustomer();

      // Step 1: Register
      await request(app.getHttpServer())
        .post('/auth/register')
        .set(TEST_HEADERS)
        .send(toRegisterDto(userData))
        .expect(201);

      // Step 2: Get verification token from mock email
      const verificationEmail = mockEmail.findVerificationEmail(userData.email);
      expect(verificationEmail).toBeDefined();
      const token = mockEmail.extractToken(verificationEmail!);
      expect(token).toBeDefined();

      // Step 3: Verify email
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .set(TEST_HEADERS)
        .send({ token })
        .expect(201);

      // Step 4: Should be able to login now
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send(toLoginDto(userData))
        .expect(201);

      expect(loginResponse.body.user.email).toBe(userData.email);
    });
  });

  describe('Password reset flow', () => {
    let verifiedUser: ReturnType<typeof createTestCustomer>;

    beforeEach(async () => {
      verifiedUser = createTestCustomer();
      const passwordHash = await hashPassword(verifiedUser.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [
          verifiedUser.username,
          verifiedUser.email,
          passwordHash,
          UserRole.CUSTOMER,
        ],
      );
    });

    // TC-AUTH-I-019
    it('should request password reset without revealing account existence', async () => {
      // Request for existing account
      const existingResponse = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .set(TEST_HEADERS)
        .send({ email: verifiedUser.email })
        .expect(201);

      // Request for non-existing account
      const nonExistingResponse = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .set(TEST_HEADERS)
        .send({ email: 'nonexistent@test.example.com' })
        .expect(201);

      // Both should have similar messages (not reveal account existence)
      expect(existingResponse.body.message).toContain('If an active account');
      expect(nonExistingResponse.body.message).toContain('If an active account');
    });

    // TC-AUTH-I-020
    it('should complete full password reset flow', async () => {
      // Step 1: Request password reset
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .set(TEST_HEADERS)
        .send({ email: verifiedUser.email })
        .expect(201);

      // Step 2: Get reset token from mock email
      const resetEmail = mockEmail.findPasswordResetEmail(verifiedUser.email);
      expect(resetEmail).toBeDefined();
      const token = mockEmail.extractToken(resetEmail!);
      expect(token).toBeDefined();

      // Step 3: Reset password
      const newPassword = 'NewSecurePassword123!';
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .set(TEST_HEADERS)
        .send({ token, password: newPassword })
        .expect(201);

      // Step 4: Should be able to login with new password
      await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send({
          username: verifiedUser.email,
          password: newPassword,
        })
        .expect(201);

      // Step 5: Old password should not work
      await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send(toLoginDto(verifiedUser))
        .expect(401);
    });
  });

  describe('Browser security', () => {
    // TC-AUTH-I-021
    it('should include proper CORS headers in preflight', async () => {
      const response = await request(app.getHttpServer())
        .options('/auth/login')
        .set('Origin', TEST_HEADERS.Origin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-requested-with')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(
        TEST_HEADERS.Origin,
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    // TC-AUTH-I-022
    it('should reject requests from untrusted origins', async () => {
      const response = await request(app.getHttpServer())
        .options('/auth/login')
        .set('Origin', 'https://attacker.example')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-allow-origin']).not.toBe(
        'https://attacker.example',
      );
    });

    // TC-AUTH-I-023
    it('should set HttpOnly cookie for session', async () => {
      const userData = createTestCustomer();
      const passwordHash = await hashPassword(userData.password);
      await dataSource.query(
        `INSERT INTO users (username, email, "passwordHash", role, "isActive", "emailVerifiedAt")
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [userData.username, userData.email, passwordHash, UserRole.CUSTOMER],
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set(TEST_HEADERS)
        .send(toLoginDto(userData))
        .expect(201);

      const cookie = response.headers['set-cookie'][0];
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
    });
  });
});
