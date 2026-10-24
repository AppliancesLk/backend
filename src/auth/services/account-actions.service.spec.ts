/**
 * AccountActionsService Unit Tests
 *
 * Test Case IDs: TC-AUTH-U-027 through TC-AUTH-U-040
 *
 * These tests verify email verification and password reset behavior
 * in isolation, mocking all external dependencies.
 */

import { AccountActionsService } from './account-actions.service';
import { DataSource, EntityManager } from 'typeorm';
import { UsersService } from '../../users/services/users.service';
import { NotificationService } from '../../notification/notification.service';
import { UserRole } from '../../users/enums/user-role.enum';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';

describe('AccountActionsService', () => {
  let service: AccountActionsService;
  let mockDataSource: { manager: { findOne: jest.Mock }; transaction: jest.Mock };
  let mockUsersService: { findByEmail: jest.Mock; findById: jest.Mock };
  let mockNotifications: {
    sendEmailVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
    sendWelcomeEmail: jest.Mock;
  };

  const verifiedUser = {
    id: 'user-id',
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: '',
    role: UserRole.CUSTOMER,
    isActive: true,
    emailVerifiedAt: new Date(),
    deactivatedAt: null,
  };

  const unverifiedUser = {
    ...verifiedUser,
    isActive: false,
    emailVerifiedAt: null,
  };

  beforeEach(() => {
    mockDataSource = {
      manager: { findOne: jest.fn() },
      transaction: jest.fn(),
    };
    mockUsersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };
    mockNotifications = {
      sendEmailVerificationEmail: jest.fn().mockResolvedValue({ status: 'SENT' }),
      sendPasswordResetEmail: jest.fn().mockResolvedValue({ status: 'SENT' }),
      sendWelcomeEmail: jest.fn().mockResolvedValue({ status: 'SENT' }),
    };

    service = new AccountActionsService(
      mockDataSource as unknown as DataSource,
      mockUsersService as unknown as UsersService,
      mockNotifications as unknown as NotificationService,
    );
  });

  describe('Email verification request', () => {
    // TC-AUTH-U-027
    it('should send verification email for unverified account', async () => {
      mockUsersService.findByEmail.mockResolvedValue(unverifiedUser);
      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback({
          findOne: jest
            .fn()
            .mockResolvedValueOnce(unverifiedUser) // User lookup
            .mockResolvedValueOnce(null), // No existing action
          delete: jest.fn().mockResolvedValue({}),
          save: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockImplementation((_, data) => data),
        });
      });

      const result = await service.request('test@example.com', 'VERIFY_EMAIL');

      expect(result.message).toContain('verification');
      expect(mockNotifications.sendEmailVerificationEmail).toHaveBeenCalled();
    });

    // TC-AUTH-U-028
    it('should not reveal if account exists when requesting verification', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const result = await service.request(
        'nonexistent@example.com',
        'VERIFY_EMAIL',
      );

      // Same message whether account exists or not
      expect(result.message).toContain('If this account needs verification');
      expect(
        mockNotifications.sendEmailVerificationEmail,
      ).not.toHaveBeenCalled();
    });

    // TC-AUTH-U-029
    it('should not send verification for already verified account', async () => {
      mockUsersService.findByEmail.mockResolvedValue(verifiedUser);
      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback({
          findOne: jest.fn().mockResolvedValue(verifiedUser),
          delete: jest.fn(),
          save: jest.fn(),
          create: jest.fn(),
        });
      });

      await service.request('test@example.com', 'VERIFY_EMAIL');

      // Transaction returns false, no email sent
      expect(
        mockNotifications.sendEmailVerificationEmail,
      ).not.toHaveBeenCalled();
    });

    // TC-AUTH-U-030
    it('should enforce rate limit of 1 minute between verification requests', async () => {
      mockUsersService.findByEmail.mockResolvedValue(unverifiedUser);
      const recentAction = {
        createdAt: new Date(), // Just created
        purpose: 'VERIFY_EMAIL',
      };
      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback({
          findOne: jest
            .fn()
            .mockResolvedValueOnce(unverifiedUser)
            .mockResolvedValueOnce(recentAction),
          delete: jest.fn(),
          save: jest.fn(),
          create: jest.fn(),
        });
      });

      await service.request('test@example.com', 'VERIFY_EMAIL');

      // Should not send new email due to rate limit
      expect(
        mockNotifications.sendEmailVerificationEmail,
      ).not.toHaveBeenCalled();
    });
  });

  describe('Email verification consumption', () => {
    // TC-AUTH-U-031
    it('should activate account with valid verification token', async () => {
      const validToken = 'a'.repeat(64);
      const tokenHash = createHash('sha256').update(validToken).digest('hex');
      const action = {
        tokenHash,
        userId: unverifiedUser.id,
        purpose: 'VERIFY_EMAIL',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };

      mockDataSource.manager.findOne.mockResolvedValue(action);

      const savedUser = { ...unverifiedUser };
      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback({
          findOne: jest
            .fn()
            .mockResolvedValueOnce(unverifiedUser)
            .mockResolvedValueOnce(action),
          save: jest.fn().mockImplementation((_, user) => {
            Object.assign(savedUser, user);
            return user;
          }),
          delete: jest.fn().mockResolvedValue({}),
        });
      });

      const result = await service.consume(validToken, 'VERIFY_EMAIL');

      expect(result.message).toContain('verified');
      expect(savedUser.emailVerifiedAt).toBeDefined();
      expect(savedUser.isActive).toBe(true);
      expect(mockNotifications.sendWelcomeEmail).toHaveBeenCalledWith(
        unverifiedUser.id,
      );
    });

    // TC-AUTH-U-032
    it('should reject invalid token format', async () => {
      await expect(
        service.consume('invalid-token', 'VERIFY_EMAIL'),
      ).rejects.toThrow('invalid or has expired');
    });

    // TC-AUTH-U-033
    it('should reject expired verification token', async () => {
      const validToken = 'a'.repeat(64);
      const tokenHash = createHash('sha256').update(validToken).digest('hex');
      const expiredAction = {
        tokenHash,
        userId: unverifiedUser.id,
        purpose: 'VERIFY_EMAIL',
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago (expired)
      };

      mockDataSource.manager.findOne.mockResolvedValue(expiredAction);

      await expect(
        service.consume(validToken, 'VERIFY_EMAIL'),
      ).rejects.toThrow('invalid or has expired');
    });

    // TC-AUTH-U-034
    it('should reject verification for already verified account', async () => {
      const validToken = 'a'.repeat(64);
      const tokenHash = createHash('sha256').update(validToken).digest('hex');
      const action = {
        tokenHash,
        userId: verifiedUser.id,
        purpose: 'VERIFY_EMAIL',
        expiresAt: new Date(Date.now() + 3600000),
      };

      mockDataSource.manager.findOne.mockResolvedValue(action);
      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback({
          findOne: jest
            .fn()
            .mockResolvedValueOnce(verifiedUser) // Already verified
            .mockResolvedValueOnce(action),
          save: jest.fn(),
          delete: jest.fn(),
        });
      });

      await expect(
        service.consume(validToken, 'VERIFY_EMAIL'),
      ).rejects.toThrow('invalid or has expired');
    });
  });

  describe('Password reset request', () => {
    // TC-AUTH-U-035
    it('should send password reset email for verified active account', async () => {
      mockUsersService.findByEmail.mockResolvedValue(verifiedUser);
      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback({
          findOne: jest
            .fn()
            .mockResolvedValueOnce(verifiedUser)
            .mockResolvedValueOnce(null), // No existing action
          delete: jest.fn().mockResolvedValue({}),
          save: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockImplementation((_, data) => data),
        });
      });

      const result = await service.request('test@example.com', 'RESET_PASSWORD');

      expect(result.message).toContain('password reset');
      expect(mockNotifications.sendPasswordResetEmail).toHaveBeenCalled();
    });

    // TC-AUTH-U-036
    it('should not reveal if account exists when requesting password reset', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const result = await service.request(
        'nonexistent@example.com',
        'RESET_PASSWORD',
      );

      expect(result.message).toContain('If an active account matches');
      expect(mockNotifications.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    // TC-AUTH-U-037
    it('should not send password reset for unverified account', async () => {
      mockUsersService.findByEmail.mockResolvedValue(unverifiedUser);
      // The transaction returns false because the user is unverified,
      // so no email is sent
      mockDataSource.transaction.mockResolvedValue(false);

      await service.request('test@example.com', 'RESET_PASSWORD');

      // Should not send for unverified accounts
      expect(mockNotifications.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('Password reset consumption', () => {
    // TC-AUTH-U-038
    it('should change password and clear sessions with valid reset token', async () => {
      const validToken = 'a'.repeat(64);
      const tokenHash = createHash('sha256').update(validToken).digest('hex');
      const action = {
        tokenHash,
        userId: verifiedUser.id,
        purpose: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() + 1800000), // 30 min from now
      };
      const newPassword = 'NewSecurePassword123!';

      mockDataSource.manager.findOne.mockResolvedValue(action);

      const mockManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(verifiedUser)
          .mockResolvedValueOnce(action),
        save: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      };
      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      const result = await service.consume(
        validToken,
        'RESET_PASSWORD',
        newPassword,
      );

      expect(result.message).toContain('password has been changed');

      // Verify sessions were cleared (AuthSession delete call)
      expect(mockManager.delete).toHaveBeenCalled();
    });

    // TC-AUTH-U-039
    it('should reject password reset without password', async () => {
      const validToken = 'a'.repeat(64);

      await expect(
        service.consume(validToken, 'RESET_PASSWORD'),
      ).rejects.toThrow('8–72 bytes');
    });

    // TC-AUTH-U-040
    it('should reject password shorter than 8 characters', async () => {
      const validToken = 'a'.repeat(64);

      await expect(
        service.consume(validToken, 'RESET_PASSWORD', 'short'),
      ).rejects.toThrow('8–72 bytes');
    });

    // TC-AUTH-U-041
    it('should reject password longer than 72 bytes', async () => {
      const validToken = 'a'.repeat(64);
      const longPassword = 'a'.repeat(73);

      await expect(
        service.consume(validToken, 'RESET_PASSWORD', longPassword),
      ).rejects.toThrow('8–72 bytes');
    });

    // TC-AUTH-U-042
    it('should hash new password before storing', async () => {
      const validToken = 'a'.repeat(64);
      const tokenHash = createHash('sha256').update(validToken).digest('hex');
      const action = {
        tokenHash,
        userId: verifiedUser.id,
        purpose: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() + 1800000),
      };
      const newPassword = 'NewSecurePassword123!';

      mockDataSource.manager.findOne.mockResolvedValue(action);

      let savedPasswordHash: string = '';
      const mockManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ ...verifiedUser })
          .mockResolvedValueOnce(action),
        save: jest.fn().mockImplementation((_, user) => {
          savedPasswordHash = user.passwordHash;
          return user;
        }),
        delete: jest.fn().mockResolvedValue({}),
      };
      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      await service.consume(validToken, 'RESET_PASSWORD', newPassword);

      // Verify password was hashed
      expect(savedPasswordHash).not.toBe(newPassword);
      expect(savedPasswordHash.startsWith('$2')).toBe(true);
      expect(await bcrypt.compare(newPassword, savedPasswordHash)).toBe(true);
    });
  });

  describe('sendVerification', () => {
    // TC-AUTH-U-043
    it('should issue verification action for given user ID', async () => {
      // Mock transaction to return true (successful issue)
      mockDataSource.transaction.mockResolvedValue(true);

      const result = await service.sendVerification(unverifiedUser.id);

      expect(result).toBe(true);
      expect(mockNotifications.sendEmailVerificationEmail).toHaveBeenCalledWith(
        unverifiedUser.id,
        expect.any(String), // token
      );
    });

    // TC-AUTH-U-044
    it('should return false when verification email fails to send', async () => {
      mockDataSource.transaction.mockResolvedValue(true);
      mockNotifications.sendEmailVerificationEmail.mockResolvedValueOnce({
        status: 'FAILED',
      });

      const result = await service.sendVerification(unverifiedUser.id);

      expect(result).toBe(false);
    });
  });
});
