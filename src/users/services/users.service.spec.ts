/**
 * UsersService Unit Tests
 *
 * Test Case IDs: TC-USR-U-001 through TC-USR-U-010
 *
 * These tests verify the user lookup and creation service behavior.
 */

import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';

describe('UsersService', () => {
  let service: UsersService;
  let mockRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const mockUser: Partial<User> = {
    id: 'user-id-123',
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    role: UserRole.CUSTOMER,
    isActive: true,
    emailVerifiedAt: new Date(),
    deactivatedAt: null,
  };

  beforeEach(() => {
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn((value: Partial<User>) => Object.assign(new User(), value)),
      save: jest.fn(async (value: User) => value),
    };
    service = new UsersService(mockRepository as unknown as Repository<User>);
  });

  describe('findByEmail', () => {
    // TC-USR-U-001
    it('should return user when email exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    // TC-USR-U-002
    it('should return null when email does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    // TC-USR-U-003
    it('should return user when username exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByUsername('testuser');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });
    });

    // TC-USR-U-004
    it('should return null when username does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    // TC-USR-U-005
    it('should return user when ID exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findById('user-id-123');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-id-123' },
      });
    });

    // TC-USR-U-006
    it('should return null when ID does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('createCustomer', () => {
    // TC-USR-U-007
    it('should create an unverified inactive customer with CUSTOMER role', async () => {
      const result = await service.createCustomer(
        'buyer@example.com',
        'buyer',
        'hashed-password',
      );

      expect(result).toMatchObject({
        email: 'buyer@example.com',
        username: 'buyer',
        passwordHash: 'hashed-password',
        role: UserRole.CUSTOMER,
        isActive: false,
        emailVerifiedAt: null,
        deactivatedAt: null,
      });
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    // TC-USR-U-008
    it('should always set role to CUSTOMER regardless of any implicit default', async () => {
      const result = await service.createCustomer(
        'new@example.com',
        'newuser',
        'password-hash',
      );

      expect(result.role).toBe(UserRole.CUSTOMER);
      // Verify role was explicitly set in create call
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.CUSTOMER }),
      );
    });

    // TC-USR-U-009
    it('should always set isActive to false for new customers', async () => {
      const result = await service.createCustomer(
        'inactive@example.com',
        'inactiveuser',
        'password-hash',
      );

      expect(result.isActive).toBe(false);
    });

    // TC-USR-U-010
    it('should call repository save with created user entity', async () => {
      await service.createCustomer('save@example.com', 'saveuser', 'hash');

      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'save@example.com',
          username: 'saveuser',
        }),
      );
    });
  });
});
