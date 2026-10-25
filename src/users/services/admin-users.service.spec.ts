/**
 * AdminUsersService Unit Tests
 *
 * Test Case IDs: TC-USR-U-011 through TC-USR-U-025
 *
 * These tests verify admin user management functionality including:
 * - User listing with filters
 * - User detail retrieval
 * - User activation/deactivation
 * - RBAC enforcement
 */

import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminUsersService } from './admin-users.service';
import { UserRole } from '../enums/user-role.enum';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let mockDataSource: {
    getRepository: jest.Mock;
    manager: { findOneBy: jest.Mock };
    transaction: jest.Mock;
  };

  const adminUser = {
    id: 'admin-id',
    username: 'admin',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    isActive: true,
    emailVerifiedAt: new Date(),
    deactivatedAt: null,
    loyaltyBalance: '0.00',
    createdAt: new Date(),
  };

  const customerUser = {
    id: 'customer-id',
    username: 'customer',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
    isActive: true,
    emailVerifiedAt: new Date(),
    deactivatedAt: null,
    loyaltyBalance: '100.00',
    createdAt: new Date(),
  };

  const inactiveUser = {
    ...customerUser,
    id: 'inactive-id',
    isActive: false,
    deactivatedAt: new Date(),
  };

  beforeEach(() => {
    mockDataSource = {
      getRepository: jest.fn(),
      manager: { findOneBy: jest.fn() },
      transaction: jest.fn(),
    };
    service = new AdminUsersService(mockDataSource as unknown as DataSource);
  });

  describe('list', () => {
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    beforeEach(() => {
      mockDataSource.getRepository.mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      });
    });

    // TC-USR-U-011
    it('should return paginated list of users', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[adminUser, customerUser], 2]);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    // TC-USR-U-012
    it('should filter users by search term', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[customerUser], 1]);

      await service.list({ page: 1, limit: 20, search: 'customer' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(user.username ILIKE :search OR user.email ILIKE :search)',
        { search: '%customer%' },
      );
    });

    // TC-USR-U-013
    it('should filter users by role', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[adminUser], 1]);

      await service.list({ page: 1, limit: 20, role: UserRole.ADMIN });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.role = :role',
        { role: UserRole.ADMIN },
      );
    });

    // TC-USR-U-014
    it('should filter users by active status', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[customerUser], 1]);

      await service.list({ page: 1, limit: 20, status: 'active' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.isActive = true AND user.emailVerifiedAt IS NOT NULL',
      );
    });

    // TC-USR-U-015
    it('should filter users by inactive status', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[inactiveUser], 1]);

      await service.list({ page: 1, limit: 20, status: 'inactive' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.deactivatedAt IS NOT NULL',
      );
    });

    // TC-USR-U-016
    it('should filter users by pending status', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.list({ page: 1, limit: 20, status: 'pending' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.emailVerifiedAt IS NULL AND user.deactivatedAt IS NULL',
      );
    });

    // TC-USR-U-017
    it('should not expose password hash in response', async () => {
      const userWithHash = { ...customerUser, passwordHash: 'secret-hash' };
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[userWithHash], 1]);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.items[0]).not.toHaveProperty('passwordHash');
    });
  });

  describe('detail', () => {
    // TC-USR-U-018
    it('should return user details when user exists', async () => {
      mockDataSource.manager.findOneBy.mockResolvedValue(customerUser);

      const result = await service.detail('customer-id');

      expect(result.id).toBe('customer-id');
      expect(result.username).toBe('customer');
      expect(result).not.toHaveProperty('passwordHash');
    });

    // TC-USR-U-019
    it('should throw NotFoundException when user does not exist', async () => {
      mockDataSource.manager.findOneBy.mockResolvedValue(null);

      await expect(service.detail('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setActive', () => {
    // TC-USR-U-020
    it('should activate a deactivated user', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue(undefined),
        findOneBy: jest.fn().mockResolvedValue(adminUser),
        findOne: jest.fn().mockResolvedValue({ ...inactiveUser }),
        countBy: jest.fn().mockResolvedValue(2),
        save: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      };
      mockDataSource.transaction.mockImplementation(async (cb) => cb(mockManager));
      mockDataSource.manager.findOneBy.mockResolvedValue({
        ...inactiveUser,
        isActive: true,
        deactivatedAt: null,
      });

      const result = await service.setActive('admin-id', 'inactive-id', true);

      expect(mockManager.save).toHaveBeenCalled();
      expect(result.id).toBe('inactive-id');
    });

    // TC-USR-U-021
    it('should deactivate a user and clear their sessions', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue(undefined),
        findOneBy: jest.fn().mockResolvedValue(adminUser),
        findOne: jest.fn().mockResolvedValue({ ...customerUser }),
        countBy: jest.fn().mockResolvedValue(2),
        save: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      };
      mockDataSource.transaction.mockImplementation(async (cb) => cb(mockManager));
      mockDataSource.manager.findOneBy.mockResolvedValue({
        ...customerUser,
        isActive: false,
        deactivatedAt: new Date(),
      });

      await service.setActive('admin-id', 'customer-id', false);

      // Should delete sessions and account actions
      expect(mockManager.delete).toHaveBeenCalledTimes(2);
    });

    // TC-USR-U-022
    it('should prevent admin from deactivating their own account', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue(undefined),
        findOneBy: jest.fn().mockResolvedValue(adminUser),
        findOne: jest.fn().mockResolvedValue(adminUser),
        countBy: jest.fn().mockResolvedValue(2),
        save: jest.fn(),
        delete: jest.fn(),
      };
      mockDataSource.transaction.mockImplementation(async (cb) => cb(mockManager));

      await expect(
        service.setActive('admin-id', 'admin-id', false),
      ).rejects.toThrow(ConflictException);
    });

    // TC-USR-U-023
    it('should prevent deactivation of the last active admin', async () => {
      const lastAdmin = { ...adminUser, id: 'last-admin-id' };
      const mockManager = {
        query: jest.fn().mockResolvedValue(undefined),
        findOneBy: jest.fn().mockResolvedValue(adminUser),
        findOne: jest.fn().mockResolvedValue(lastAdmin),
        countBy: jest.fn().mockResolvedValue(1), // Only 1 active admin
        save: jest.fn(),
        delete: jest.fn(),
      };
      mockDataSource.transaction.mockImplementation(async (cb) => cb(mockManager));

      await expect(
        service.setActive('admin-id', 'last-admin-id', false),
      ).rejects.toThrow('last active administrator');
    });

    // TC-USR-U-024
    it('should throw NotFoundException when target user does not exist', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue(undefined),
        findOneBy: jest.fn().mockResolvedValue(adminUser),
        findOne: jest.fn().mockResolvedValue(null),
        countBy: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
      };
      mockDataSource.transaction.mockImplementation(async (cb) => cb(mockManager));

      await expect(
        service.setActive('admin-id', 'nonexistent-id', false),
      ).rejects.toThrow(NotFoundException);
    });

    // TC-USR-U-025
    it('should throw ForbiddenException when actor is not an active admin', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue(undefined),
        findOneBy: jest.fn().mockResolvedValue(customerUser), // Not an admin
        findOne: jest.fn(),
        countBy: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
      };
      mockDataSource.transaction.mockImplementation(async (cb) => cb(mockManager));

      await expect(
        service.setActive('customer-id', 'some-user-id', false),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
