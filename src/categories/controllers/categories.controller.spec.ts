/**
 * CategoriesController Unit Tests
 *
 * Test Case IDs: TC-CAT-U-016 through TC-CAT-U-021
 *
 * These tests verify controller method delegation to service.
 */

import { CategoriesController } from './categories.controller';
import { CategoriesService } from '../services/categories.service';
import { Category } from '../entities/category.entity';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let mockService: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  const mockCategory: Partial<Category> = {
    categoryID: 'cat-id',
    name: 'Electronics',
    isActive: true,
    imageUrl: null,
  };

  beforeEach(() => {
    mockService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    controller = new CategoriesController(mockService as unknown as CategoriesService);
  });

  // TC-CAT-U-016
  it('findAll should call service.findAll without includeInactive', async () => {
    mockService.findAll.mockResolvedValue([mockCategory]);

    const result = await controller.findAll();

    expect(mockService.findAll).toHaveBeenCalledWith();
    expect(result).toHaveLength(1);
  });

  // TC-CAT-U-017
  it('findAllForAdmin should call service.findAll with includeInactive=true', async () => {
    mockService.findAll.mockResolvedValue([mockCategory]);

    const result = await controller.findAllForAdmin();

    expect(mockService.findAll).toHaveBeenCalledWith(true);
    expect(result).toHaveLength(1);
  });

  // TC-CAT-U-018
  it('findOne should call service.findById with the provided ID', async () => {
    mockService.findById.mockResolvedValue(mockCategory);

    const result = await controller.findOne('cat-id');

    expect(mockService.findById).toHaveBeenCalledWith('cat-id');
    expect(result.categoryID).toBe('cat-id');
  });

  // TC-CAT-U-019
  it('create should call service.create with the provided DTO', async () => {
    const dto = { name: 'New Category' };
    mockService.create.mockResolvedValue({ ...mockCategory, name: 'New Category' });

    const result = await controller.create(dto);

    expect(mockService.create).toHaveBeenCalledWith(dto);
    expect(result.name).toBe('New Category');
  });

  // TC-CAT-U-020
  it('update should call service.update with ID and DTO', async () => {
    const dto = { name: 'Updated Name' };
    mockService.update.mockResolvedValue({ ...mockCategory, name: 'Updated Name' });

    const result = await controller.update('cat-id', dto);

    expect(mockService.update).toHaveBeenCalledWith('cat-id', dto);
    expect(result.name).toBe('Updated Name');
  });
});
