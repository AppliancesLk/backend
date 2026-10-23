/**
 * AuthService Unit Tests
 *
 * Test Case IDs: TC-AUTH-U-001 through TC-AUTH-U-020
 *
 * These tests verify the authentication service behavior in isolation,
 * mocking all external dependencies (database, email, etc.).
 */

import { AuthService } from './auth.service';
import { UsersService } from '../../users/services/users.service';
import { Repository, DataSource } from 'typeorm';
import { AuthSession } from '../entities/auth-session.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { sessionCookieOptions } from '../session.config';
import { AccountActionsService } from './account-actions.service';
import { NotificationService } from '../../notification/notification.service';
import * as bcrypt from 'bcrypt';

// TC-AUTH-U-001 through TC-AUTH-U-006: Cookie Authentication Tests (existing)
describe('Cookie authentication', () => {
  const user = {
    id: 'user-id',
    username: 'customer',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
    isActive: true,
    emailVerifiedAt: new Date(),
  };
  const sessions = { findOne: jest.fn(), delete: jest.fn() };
  const users = { findByUsername: jest.fn() };
  const service = new AuthService(
    users as unknown as UsersService,
    sessions as unknown as Repository<AuthSession>,
    {} as NotificationService,
    {} as AccountActionsService,
    {} as DataSource,
  );
  beforeEach(() => jest.clearAllMocks());

  // TC-AUTH-U-001
  it('rejects malformed session tokens without querying the database', async () => {
    await expect(service.authenticate('invalid')).rejects.toThrow(
      'Please sign in',
    );
    expect(sessions.findOne).not.toHaveBeenCalled();
  });

  // TC-AUTH-U-002
  it('rejects and removes expired sessions', async () => {
    sessions.findOne.mockResolvedValue({
      tokenHash: 'hash',
      user,
      expiresAt: new Date(0),
    });
    await expect(service.authenticate('a'.repeat(64))).rejects.toThrow(
      'expired',
    );
    expect(sessions.delete).toHaveBeenCalledWith({ tokenHash: 'hash' });
  });

  // TC-AUTH-U-003
  it('uses the current database role and returns only public user fields', async () => {
    sessions.findOne.mockResolvedValue({
      user: { ...user, role: UserRole.ADMIN, passwordHash: 'private' },
      expiresAt: new Date(Date.now() + 60000),
    });
    expect(await service.authenticate('a'.repeat(64))).toEqual({
      id: user.id,
      username: user.username,
      email: user.email,
      role: UserRole.ADMIN,
    });
  });

  // TC-AUTH-U-004
  it('rejects deactivated users even with a valid session', async () => {
    sessions.findOne.mockResolvedValue({
      tokenHash: 'hash',
      user: { ...user, isActive: false },
      expiresAt: new Date(Date.now() + 60000),
    });
    await expect(service.authenticate('a'.repeat(64))).rejects.toThrow(
      'expired',
    );
  });

  // TC-AUTH-U-005
  it('revokes the hashed token on logout', async () => {
    await service.logout('a'.repeat(64));
    const hash = sessions.delete.mock.calls[0][0].tokenHash;
    expect(hash).toHaveLength(64);
    expect(hash).not.toEqual('a'.repeat(64));
  });

  // TC-AUTH-U-006
  it('sets secure cookies in production', () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(sessionCookieOptions()).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  // TC-AUTH-U-007
  it('rejects users with unverified email even with valid session', async () => {
    sessions.findOne.mockResolvedValue({
      tokenHash: 'hash',
      user: { ...user, emailVerifiedAt: null },
      expiresAt: new Date(Date.now() + 60000),
    });
    await expect(service.authenticate('a'.repeat(64))).rejects.toThrow(
      'expired',
    );
    expect(sessions.delete).toHaveBeenCalledWith({ tokenHash: 'hash' });
  });

  // TC-AUTH-U-008
  it('handles missing session gracefully', async () => {
    sessions.findOne.mockResolvedValue(null);
    await expect(service.authenticate('a'.repeat(64))).rejects.toThrow(
      'expired',
    );
  });

  // TC-AUTH-U-009
  it('handles undefined token gracefully', async () => {
    await expect(service.authenticate(undefined)).rejects.toThrow(
      'Please sign in',
    );
    expect(sessions.findOne).not.toHaveBeenCalled();
  });
});

// TC-AUTH-U-010 through TC-AUTH-U-015: Registration Tests
describe('User registration', () => {
  let service: AuthService;
  let mockUsersService: {
    findByEmail: jest.Mock;
    findByUsername: jest.Mock;
    createCustomer: jest.Mock;
  };
  let mockActions: { sendVerification: jest.Mock };

  beforeEach(() => {
    mockUsersService = {
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      createCustomer: jest.fn(),
    };
    mockActions = { sendVerification: jest.fn() };

    service = new AuthService(
      mockUsersService as unknown as UsersService,
      {} as unknown as Repository<AuthSession>,
      {} as NotificationService,
      mockActions as unknown as AccountActionsService,
      {} as DataSource,
    );
    jest.clearAllMocks();
  });

  // TC-AUTH-U-010
  it('should create customer with hashed password given valid registration data', async () => {
    mockUsersService.findByEmail.mockResolvedValue(null);
    mockUsersService.findByUsername.mockResolvedValue(null);
    mockUsersService.createCustomer.mockResolvedValue({
      id: 'new-user-id',
      email: 'test@example.com',
    });
    mockActions.sendVerification.mockResolvedValue(true);

    const result = await service.register({
      email: 'test@example.com',
      username: 'testuser',
      password: 'SecurePassword123!',
    });

    expect(result.requiresVerification).toBe(true);
    expect(result.email).toBe('test@example.com');

    // Verify password was hashed before storage
    const passedHash = mockUsersService.createCustomer.mock.calls[0][2];
    expect(passedHash).not.toBe('SecurePassword123!');
    expect(passedHash.startsWith('$2')).toBe(true); // bcrypt hash prefix
    expect(await bcrypt.compare('SecurePassword123!', passedHash)).toBe(true);
  });

  // TC-AUTH-U-011
  it('should reject registration when email already exists', async () => {
    mockUsersService.findByEmail.mockResolvedValue({ id: 'existing-user' });
    mockUsersService.findByUsername.mockResolvedValue(null);

    await expect(
      service.register({
        email: 'existing@example.com',
        username: 'newuser',
        password: 'Password123!',
      }),
    ).rejects.toThrow('already registered');
  });

  // TC-AUTH-U-012
  it('should reject registration when username already exists', async () => {
    mockUsersService.findByEmail.mockResolvedValue(null);
    mockUsersService.findByUsername.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.register({
        email: 'new@example.com',
        username: 'existinguser',
        password: 'Password123!',
      }),
    ).rejects.toThrow('already registered');
  });

  // TC-AUTH-U-013
  it('should reject password longer than 72 bytes', async () => {
    mockUsersService.findByEmail.mockResolvedValue(null);
    mockUsersService.findByUsername.mockResolvedValue(null);

    // 73 bytes password (bcrypt limitation)
    const longPassword = 'a'.repeat(73);

    await expect(
      service.register({
        email: 'test@example.com',
        username: 'testuser',
        password: longPassword,
      }),
    ).rejects.toThrow('72 bytes');
  });

  // TC-AUTH-U-014
  it('should send verification email after successful registration', async () => {
    mockUsersService.findByEmail.mockResolvedValue(null);
    mockUsersService.findByUsername.mockResolvedValue(null);
    mockUsersService.createCustomer.mockResolvedValue({
      id: 'new-user-id',
      email: 'test@example.com',
    });
    mockActions.sendVerification.mockResolvedValue(true);

    await service.register({
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!',
    });

    expect(mockActions.sendVerification).toHaveBeenCalledWith('new-user-id');
  });

  // TC-AUTH-U-015
  it('should return appropriate message when verification email fails', async () => {
    mockUsersService.findByEmail.mockResolvedValue(null);
    mockUsersService.findByUsername.mockResolvedValue(null);
    mockUsersService.createCustomer.mockResolvedValue({
      id: 'new-user-id',
      email: 'test@example.com',
    });
    mockActions.sendVerification.mockResolvedValue(false);

    const result = await service.register({
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!',
    });

    expect(result.requiresVerification).toBe(true);
    expect(result.message).toContain('could not send');
  });
});

// TC-AUTH-U-016 through TC-AUTH-U-020: Login Tests
describe('User login', () => {
  let service: AuthService;
  let mockUsersService: {
    findByEmail: jest.Mock;
    findByUsername: jest.Mock;
  };
  let mockSessions: {
    delete: jest.Mock;
  };
  let mockNotifications: { sendLoginNotification: jest.Mock };
  let mockDataSource: {
    transaction: jest.Mock;
  };

  const validUser = {
    id: 'user-id',
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: '', // Will be set in beforeEach
    role: UserRole.CUSTOMER,
    isActive: true,
    emailVerifiedAt: new Date(),
    deactivatedAt: null,
  };

  beforeEach(async () => {
    // Hash the test password
    validUser.passwordHash = await bcrypt.hash('ValidPassword123!', 12);

    mockUsersService = {
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
    };
    mockSessions = {
      delete: jest.fn(),
    };
    mockNotifications = {
      sendLoginNotification: jest.fn().mockResolvedValue({}),
    };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback({
          findOne: jest.fn().mockResolvedValue(validUser),
          create: jest.fn().mockImplementation((_, data) => data),
          save: jest.fn().mockResolvedValue({}),
        });
      }),
    };

    service = new AuthService(
      mockUsersService as unknown as UsersService,
      mockSessions as unknown as Repository<AuthSession>,
      mockNotifications as unknown as NotificationService,
      {} as AccountActionsService,
      mockDataSource as unknown as DataSource,
    );
    jest.clearAllMocks();
  });

  // TC-AUTH-U-016
  it('should return session token given valid credentials with email', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);

    const result = await service.login({
      username: 'test@example.com',
      password: 'ValidPassword123!',
    });

    expect(result.token).toBeDefined();
    expect(result.token).toHaveLength(64); // 32 bytes hex = 64 chars
    expect(result.user).toEqual({
      id: validUser.id,
      username: validUser.username,
      email: validUser.email,
      role: validUser.role,
    });
  });

  // TC-AUTH-U-017
  it('should return session token given valid credentials with username', async () => {
    mockUsersService.findByUsername.mockResolvedValue(validUser);

    const result = await service.login({
      username: 'testuser',
      password: 'ValidPassword123!',
    });

    expect(result.token).toBeDefined();
    expect(result.user.username).toBe('testuser');
  });

  // TC-AUTH-U-018
  it('should reject login with incorrect password', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);

    await expect(
      service.login({
        username: 'test@example.com',
        password: 'WrongPassword123!',
      }),
    ).rejects.toThrow('Invalid username or password');
  });

  // TC-AUTH-U-019
  it('should reject login for unknown user', async () => {
    mockUsersService.findByEmail.mockResolvedValue(null);
    mockUsersService.findByUsername.mockResolvedValue(null);

    await expect(
      service.login({
        username: 'nonexistent@example.com',
        password: 'AnyPassword123!',
      }),
    ).rejects.toThrow('Invalid username or password');
  });

  // TC-AUTH-U-020
  it('should reject login for unverified email', async () => {
    const unverifiedUser = { ...validUser, emailVerifiedAt: null };
    mockUsersService.findByEmail.mockResolvedValue(unverifiedUser);

    await expect(
      service.login({
        username: 'test@example.com',
        password: 'ValidPassword123!',
      }),
    ).rejects.toThrow('Verify your email');
  });

  // TC-AUTH-U-021
  it('should reject login for inactive account', async () => {
    const inactiveUser = { ...validUser, isActive: false };
    mockUsersService.findByEmail.mockResolvedValue(inactiveUser);

    await expect(
      service.login({
        username: 'test@example.com',
        password: 'ValidPassword123!',
      }),
    ).rejects.toThrow('Invalid username or password');
  });

  // TC-AUTH-U-022
  it('should reject login for deactivated account', async () => {
    const deactivatedUser = { ...validUser, deactivatedAt: new Date() };
    mockUsersService.findByEmail.mockResolvedValue(deactivatedUser);

    await expect(
      service.login({
        username: 'test@example.com',
        password: 'ValidPassword123!',
      }),
    ).rejects.toThrow('Invalid username or password');
  });

  // TC-AUTH-U-023
  it('should send login notification on successful login', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);

    await service.login({
      username: 'test@example.com',
      password: 'ValidPassword123!',
    });

    expect(mockNotifications.sendLoginNotification).toHaveBeenCalledWith(
      validUser.id,
    );
  });

  // TC-AUTH-U-024
  it('should not expose password hash in returned user object', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);

    const result = await service.login({
      username: 'test@example.com',
      password: 'ValidPassword123!',
    });

    expect(result.user).not.toHaveProperty('passwordHash');
  });

  // TC-AUTH-U-025
  it('should reject passwords exceeding 72 bytes at login', async () => {
    mockUsersService.findByEmail.mockResolvedValue(validUser);

    // 73 bytes is over bcrypt limit
    const longPassword = 'a'.repeat(73);

    await expect(
      service.login({
        username: 'test@example.com',
        password: longPassword,
      }),
    ).rejects.toThrow('Invalid username or password');
  });
});

// TC-AUTH-U-026: publicUser method tests
describe('publicUser', () => {
  const service = new AuthService(
    {} as unknown as UsersService,
    {} as unknown as Repository<AuthSession>,
    {} as NotificationService,
    {} as AccountActionsService,
    {} as DataSource,
  );

  // TC-AUTH-U-026
  it('should return only public fields from user object', () => {
    const fullUser = {
      id: 'user-id',
      username: 'testuser',
      email: 'test@example.com',
      passwordHash: 'secret-hash',
      role: UserRole.CUSTOMER,
      isActive: true,
      emailVerifiedAt: new Date(),
      deactivatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      loyaltyBalance: '100.00',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publicUser = service.publicUser(fullUser as any);

    expect(publicUser).toEqual({
      id: 'user-id',
      username: 'testuser',
      email: 'test@example.com',
      role: UserRole.CUSTOMER,
    });
    expect(publicUser).not.toHaveProperty('passwordHash');
    expect(publicUser).not.toHaveProperty('isActive');
    expect(publicUser).not.toHaveProperty('createdAt');
  });
});
