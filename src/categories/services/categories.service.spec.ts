/**
 * CategoriesService Unit Tests
 *
 * Test Case IDs: TC-CAT-U-001 through TC-CAT-U-015
 *
 * These tests verify category CRUD operations and hierarchy management.
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CategoriesService } from './categories.service';
import { Category } from '../entities/category.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const rootCategory: Partial<Category> = {
    categoryID: 'root-id',
    name: 'Electronics',
    isActive: true,
    imageUrl: null,
    parent: null,
  };

  const childCategory: Partial<Category> = {
    categoryID: 'child-id',
    name: 'Refrigerators',
    isActive: true,
    imageUrl: 'https://storage.example.com/fridge.jpg',
    parent: rootCategory as Category,
  };

  const inactiveCategory: Partial<Category> = {
    categoryID: 'inactive-id',
    name: 'Discontinued',
    isActive: false,
    imageUrl: null,
    parent: null,
  };

  beforeEach(() => {
    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => ({ categoryID: 'new-id', ...value })),
    };
    service = new CategoriesService(mockRepository as unknown as Repository<Category>);
  });

  describe('findAll', () => {
    // TC-CAT-U-001
    it('should return only active categories by default', async () => {
      mockRepository.find.mockResolvedValue([
        rootCategory,
        childCategory,
        inactiveCategory,
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.categoryID)).toContain('root-id');
      expect(result.map((c) => c.categoryID)).toContain('child-id');
      expect(result.map((c) => c.categoryID)).not.toContain('inactive-id');
    });

    // TC-CAT-U-002
    it('should include inactive categories when includeInactive is true', async () => {
      mockRepository.find.mockResolvedValue([
        rootCategory,
        childCategory,
        inactiveCategory,
      ]);

      const result = await service.findAll(true);

      expect(result).toHaveLength(3);
      expect(result.map((c) => c.categoryID)).toContain('inactive-id');
    });

    // TC-CAT-U-003
    it('should exclude children of inactive parent categories', async () => {
      const childOfInactive = {
        categoryID: 'child-of-inactive-id',
        name: 'Hidden Child',
        isActive: true,
        parent: inactiveCategory as Category,
      };
      mockRepository.find.mockResolvedValue([
        rootCategory,
        inactiveCategory,
        childOfInactive,
      ]);

      const result = await service.findAll(false);

      expect(result.map((c) => c.categoryID)).not.toContain('child-of-inactive-id');
    });

    // TC-CAT-U-004
    it('should load parent relations', async () => {
      mockRepository.find.mockResolvedValue([childCategory]);

      await service.findAll();

      expect(mockRepository.find).toHaveBeenCalledWith({
        relations: { parent: true },
      });
    });
  });

  describe('findById', () => {
    // TC-CAT-U-005
    it('should return category when it exists', async () => {
      mockRepository.findOne.mockResolvedValue(rootCategory);

      const result = await service.findById('root-id');

      expect(result.categoryID).toBe('root-id');
      expect(result.name).toBe('Electronics');
    });

    // TC-CAT-U-006
    it('should throw NotFoundException when category does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    // TC-CAT-U-007
    it('should create a root category without parent', async () => {
      const result = await service.create({
        name: 'New Category',
        isActive: true,
      });

      expect(result.name).toBe('New Category');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Category',
          isActive: true,
          parent: null,
        }),
      );
    });

    // TC-CAT-U-008
    it('should create a child category with parent', async () => {
      mockRepository.findOne.mockResolvedValue(rootCategory);

      const result = await service.create({
        name: 'Child Category',
        parentID: 'root-id',
      });

      expect(result.name).toBe('Child Category');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Child Category',
          parent: rootCategory,
        }),
      );
    });

    // TC-CAT-U-009
    it('should set imageUrl when provided', async () => {
      const result = await service.create({
        name: 'Category with Image',
        imageUrl: 'https://storage.example.com/image.jpg',
      });

      expect(result.imageUrl).toBe('https://storage.example.com/image.jpg');
    });

    // TC-CAT-U-010
    it('should default isActive to true when not specified', async () => {
      await service.create({ name: 'Default Active' });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      mockRepository.findOne.mockResolvedValue({ ...rootCategory });
      mockRepository.find.mockResolvedValue([rootCategory, childCategory]);
    });

    // TC-CAT-U-011
    it('should update category name', async () => {
      await service.update('root-id', { name: 'Updated Name' });

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated Name' }),
      );
    });

    // TC-CAT-U-012
    it('should update category isActive status', async () => {
      await service.update('root-id', { isActive: false });

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    // TC-CAT-U-013
    it('should reject setting category as its own parent', async () => {
      await expect(
        service.update('root-id', { parentID: 'root-id' }),
      ).rejects.toThrow(BadRequestException);
    });

    // TC-CAT-U-014
    it('should reject circular parent hierarchy', async () => {
      // Setup: child -> root, trying to set root -> child (would create cycle)
      const child = { ...childCategory, parent: { ...rootCategory } };
      mockRepository.findOne
        .mockResolvedValueOnce({ ...rootCategory }) // First call for findById in update
        .mockResolvedValueOnce(child); // Second call when setting parent
      mockRepository.find.mockResolvedValue([rootCategory, child]);

      await expect(
        service.update('root-id', { parentID: 'child-id' }),
      ).rejects.toThrow('cycle');
    });

    // TC-CAT-U-015
    it('should allow setting parent to null (making it a root)', async () => {
      mockRepository.findOne.mockResolvedValue({ ...childCategory });

      await service.update('child-id', { parentID: null });

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ parent: null }),
      );
    });
  });
});
