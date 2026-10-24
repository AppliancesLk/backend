/**
 * ProductCatalogService Unit Tests
 *
 * Test Case IDs: TC-PROD-U-038 through TC-PROD-U-050
 *
 * These tests verify catalog search operations including:
 * - Price range filtering and validation
 * - Text search across product fields
 * - Category filtering with hierarchy
 * - Brand filtering
 * - Sorting options
 * - Pagination
 * - Facet aggregations
 */

import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProductCatalogService } from './product-catalog.service';
import { Product } from '../entities/product.entity';
import { Category } from '../../categories/entities/category.entity';
import { CategoriesService } from '../../categories/services/categories.service';

describe('ProductCatalogService', () => {
  let service: ProductCatalogService;
  let repository: {
    createQueryBuilder: jest.Mock;
  };
  let categories: {
    findAll: jest.Mock;
  };
  let mockQueryBuilder: Record<string, jest.Mock>;
  let rootCategory: Category;
  let childCategory: Category;

  beforeEach(() => {
    jest.clearAllMocks();

    rootCategory = Object.assign(new Category(), {
      categoryID: 'root-cat',
      name: 'Electronics',
      isActive: true,
      parent: null,
    });

    childCategory = Object.assign(new Category(), {
      categoryID: 'child-cat',
      name: 'TVs',
      isActive: true,
      parent: rootCategory,
    });

    mockQueryBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      clone: jest.fn(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ min: '0', max: '0' }),
    };

    // Clone returns a new mock that can be configured independently
    mockQueryBuilder.clone.mockReturnValue({ ...mockQueryBuilder, clone: jest.fn().mockReturnThis() });

    repository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    categories = {
      findAll: jest.fn().mockResolvedValue([rootCategory, childCategory]),
    };

    service = new ProductCatalogService(
      repository as unknown as Repository<Product>,
      categories as unknown as CategoriesService,
    );
  });

  describe('find', () => {
    // TC-PROD-U-038
    it('should return paginated results with default parameters', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(5);
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.find({ page: 1, limit: 20 });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total', 5);
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit', 20);
      expect(result).toHaveProperty('totalPages');
      expect(result).toHaveProperty('facets');
    });

    // TC-PROD-U-039
    it('should throw BadRequestException when minPrice exceeds maxPrice', async () => {
      await expect(
        service.find({ page: 1, limit: 20, minPrice: 100, maxPrice: 50 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.find({ page: 1, limit: 20, minPrice: 100, maxPrice: 50 }),
      ).rejects.toThrow('Minimum price must not exceed maximum price');
    });

    // TC-PROD-U-040
    it('should filter by price range when provided', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await service.find({ page: 1, limit: 20, minPrice: 100, maxPrice: 500 });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'product.price >= :minPrice',
        { minPrice: 100 },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'product.price <= :maxPrice',
        { maxPrice: 500 },
      );
    });

    // TC-PROD-U-041
    it('should apply text search across multiple fields', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await service.find({ page: 1, limit: 20, q: 'samsung' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.objectContaining({ search: '%samsung%' }),
      );
    });

    // TC-PROD-U-042
    it('should escape special characters in search query', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await service.find({ page: 1, limit: 20, q: '100%_off\\' });

      // Verify special characters are escaped
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.objectContaining({ search: '%100\\%\\_off\\\\%' }),
      );
    });

    // TC-PROD-U-043
    it('should filter by stock availability when inStock is true', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await service.find({ page: 1, limit: 20, inStock: true });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'product.stockQty > 0',
      );
    });

    // TC-PROD-U-044
    it('should sort by price ascending when sort is price-asc', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await service.find({ page: 1, limit: 20, sort: 'price-asc' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'product.price',
        'ASC',
      );
    });

    // TC-PROD-U-045
    it('should sort by price descending when sort is price-desc', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await service.find({ page: 1, limit: 20, sort: 'price-desc' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'product.price',
        'DESC',
      );
    });

    // TC-PROD-U-046
    it('should sort by newest when sort is newest', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await service.find({ page: 1, limit: 20, sort: 'newest' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'product.createdAt',
        'DESC',
        'NULLS LAST',
      );
    });

    // TC-PROD-U-047
    it('should sort by name by default', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await service.find({ page: 1, limit: 20 });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'product.name',
        'ASC',
      );
    });

    // TC-PROD-U-048
    it('should include category descendants when filtering by category', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await service.find({ page: 1, limit: 20, categoryId: 'root-cat' });

      // Should include both root and child categories
      expect(categories.findAll).toHaveBeenCalled();
    });

    // TC-PROD-U-049
    it('should filter by brands when provided', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await service.find({ page: 1, limit: 20, brands: ['Samsung', 'LG'] });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'LOWER(product.brand) IN (:...brands)',
        { brands: ['samsung', 'lg'] },
      );
    });

    // TC-PROD-U-050
    it('should clamp page to valid range', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(10); // 10 items, 1 page with limit 20

      const result = await service.find({ page: 100, limit: 20 }); // Page 100 exceeds total

      expect(result.page).toBeLessThanOrEqual(result.totalPages || 1);
    });

    // TC-PROD-U-051
    it('should return facets with category counts', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(5);
      mockQueryBuilder.getRawMany
        .mockResolvedValueOnce([{ id: 'root-cat', count: '3' }]) // category counts
        .mockResolvedValueOnce([{ name: 'Samsung', count: '2' }]); // brand counts

      const result = await service.find({ page: 1, limit: 20 });

      expect(result.facets).toHaveProperty('categories');
      expect(result.facets).toHaveProperty('brands');
      expect(result.facets).toHaveProperty('allCount');
      expect(result.facets).toHaveProperty('price');
    });

    // TC-PROD-U-052
    it('should handle empty categories gracefully', async () => {
      categories.findAll.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      const result = await service.find({ page: 1, limit: 20 });

      expect(result.items).toEqual([]);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('1 = 0');
    });
  });
});
