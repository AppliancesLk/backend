/**
 * ProductsService Unit Tests
 *
 * Test Case IDs: TC-PROD-U-001 through TC-PROD-U-035
 *
 * These tests verify product operations including:
 * - Finding products (all, by ID, for cart, related products)
 * - Creating products with validation
 * - Updating products with partial patches
 * - Removing products with referential integrity
 * - Stock management
 * - Price comparison validation
 */

import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError, Repository, EntityManager } from 'typeorm';
import { ProductsService } from './products.service';
import { Product } from '../entities/product.entity';
import { Category } from '../../categories/entities/category.entity';
import { CategoriesService } from '../../categories/services/categories.service';

const skuConstraint = 'UQ_d750d40dee7a63a316039f246be';
const comparePriceConstraint = 'CHK_product_compare_price';

const databaseError = (
  code = '23505',
  constraint = skuConstraint,
) =>
  new QueryFailedError(
    'UPDATE products',
    [],
    Object.assign(new Error('database failure'), { code, constraint }),
  );

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let categories: {
    findAll: jest.Mock;
    findById: jest.Mock;
  };
  let product: Product;
  let category: Category;
  let errorLogCalls: unknown[][];

  beforeEach(() => {
    jest.clearAllMocks();
    errorLogCalls = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((...args: unknown[]) => {
        errorLogCalls.push(args);
      });

    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    categories = {
      findAll: jest.fn(),
      findById: jest.fn(),
    };

    category = Object.assign(new Category(), {
      categoryID: 'category-id',
      name: 'Appliances',
      isActive: true,
    });

    product = Object.assign(new Product(), {
      productID: 'product-id',
      name: 'Washing Machine',
      SKU: 'WM-001',
      price: 50000,
      stockQty: 10,
      images: ['image1.jpg'],
      specifications: { Capacity: '8 kg' },
      isActive: true,
      category,
    });

    categories.findAll.mockResolvedValue([category]);
    repository.findOne.mockResolvedValue(product);

    service = new ProductsService(
      repository as unknown as Repository<Product>,
      categories as unknown as CategoriesService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findAll', () => {
    // TC-PROD-U-001
    it('should return active products in visible categories', async () => {
      repository.find.mockResolvedValue([product]);

      const result = await service.findAll();

      expect(result).toEqual([product]);
      expect(repository.find).toHaveBeenCalledWith({
        where: {
          isActive: true,
          category: { categoryID: expect.anything() },
        },
        relations: { category: true },
      });
    });

    // TC-PROD-U-002
    it('should return all products including inactive when includeInactive is true', async () => {
      const inactiveProduct = { ...product, isActive: false };
      repository.find.mockResolvedValue([product, inactiveProduct]);

      const result = await service.findAll(undefined, true);

      expect(result).toHaveLength(2);
      expect(repository.find).toHaveBeenCalledWith({
        relations: { category: true },
      });
    });

    // TC-PROD-U-003
    it('should filter products by category when categoryId is provided', async () => {
      repository.find.mockResolvedValue([product]);

      await service.findAll('category-id');

      expect(categories.findAll).toHaveBeenCalled();
    });

    // TC-PROD-U-004
    it('should return empty array when no visible categories exist', async () => {
      categories.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(repository.find).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    // TC-PROD-U-005
    it('should return product when found and active', async () => {
      repository.findOne.mockResolvedValue(product);

      const result = await service.findById('product-id');

      expect(result).toEqual(product);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { productID: 'product-id' },
        relations: { category: true },
      });
    });

    // TC-PROD-U-006
    it('should throw NotFoundException when product not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findById('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    // TC-PROD-U-007
    it('should throw NotFoundException when product is inactive', async () => {
      const inactiveProduct = { ...product, isActive: false };
      repository.findOne.mockResolvedValue(inactiveProduct);

      await expect(service.findById('product-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    // TC-PROD-U-008
    it('should return inactive product when includeInactive is true', async () => {
      const inactiveProduct = { ...product, isActive: false };
      repository.findOne.mockResolvedValue(inactiveProduct);

      const result = await service.findById('product-id', true);

      expect(result).toEqual(inactiveProduct);
    });

    // TC-PROD-U-009
    it('should throw NotFoundException when product category is not visible', async () => {
      categories.findAll.mockResolvedValue([]); // No visible categories

      await expect(service.findById('product-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findForCart', () => {
    // TC-PROD-U-010
    it('should return empty map when no product IDs provided', async () => {
      const result = await service.findForCart([]);

      expect(result).toEqual(new Map());
      expect(repository.find).not.toHaveBeenCalled();
    });

    // TC-PROD-U-011
    it('should return products with availability status', async () => {
      repository.find.mockResolvedValue([product]);

      const result = await service.findForCart(['product-id']);

      expect(result.get('product-id')).toEqual({
        product,
        isAvailable: true,
      });
    });

    // TC-PROD-U-012
    it('should mark inactive products as unavailable', async () => {
      const inactiveProduct = { ...product, isActive: false };
      repository.find.mockResolvedValue([inactiveProduct]);

      const result = await service.findForCart(['product-id']);

      expect(result.get('product-id')?.isAvailable).toBe(false);
    });

    // TC-PROD-U-013
    it('should mark products in hidden categories as unavailable', async () => {
      categories.findAll.mockResolvedValue([]); // No visible categories
      repository.find.mockResolvedValue([product]);

      const result = await service.findForCart(['product-id']);

      expect(result.get('product-id')?.isAvailable).toBe(false);
    });

    // TC-PROD-U-014
    it('should use provided EntityManager when available', async () => {
      const mockManager = {
        getRepository: jest.fn().mockReturnValue({
          find: jest.fn().mockResolvedValue([product]),
        }),
      };

      const result = await service.findForCart(
        ['product-id'],
        mockManager as unknown as EntityManager,
      );

      expect(mockManager.getRepository).toHaveBeenCalledWith(Product);
      expect(result.size).toBe(1);
    });
  });

  describe('create', () => {
    const createDto = {
      name: 'New Product',
      SKU: 'NEW-001',
      price: 25000,
      categoryID: 'category-id',
    };

    // TC-PROD-U-015
    it('should create product with valid data', async () => {
      repository.findOne.mockResolvedValue(null); // No existing SKU
      categories.findById.mockResolvedValue(category);
      repository.create.mockReturnValue(product);
      repository.save.mockResolvedValue(product);

      const result = await service.create(createDto);

      expect(result).toEqual(product);
      expect(categories.findById).toHaveBeenCalledWith('category-id');
    });

    // TC-PROD-U-016
    it('should throw ConflictException when SKU already exists', async () => {
      repository.findOne.mockResolvedValue(product); // SKU exists

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      await expect(service.create(createDto)).rejects.toThrow(
        'SKU already exists',
      );
    });

    // TC-PROD-U-017
    it('should throw BadRequestException when compareAtPrice is less than price', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.create({
          ...createDto,
          compareAtPrice: 20000, // Less than price of 25000
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({
          ...createDto,
          compareAtPrice: 20000,
        }),
      ).rejects.toThrow('Original price must be greater than selling price');
    });

    // TC-PROD-U-018
    it('should set default values for optional fields', async () => {
      repository.findOne.mockResolvedValue(null);
      categories.findById.mockResolvedValue(category);
      repository.create.mockImplementation((data) => data);
      repository.save.mockImplementation((data) => ({ ...data, productID: 'new-id' }));

      await service.create(createDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '',
          features: [],
          boxContents: [],
          warranty: '',
          brand: null,
          subtitle: '',
          badge: null,
          compareAtPrice: null,
          stockQty: 0,
          images: [],
          specifications: null,
          isActive: true,
        }),
      );
    });

    // TC-PROD-U-019
    it('should handle database SKU conflict during creation', async () => {
      repository.findOne.mockResolvedValue(null);
      categories.findById.mockResolvedValue(category);
      repository.create.mockReturnValue(product);
      repository.save.mockRejectedValue(databaseError());

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    // TC-PROD-U-020
    it('should patch only supplied fields', async () => {
      repository.save.mockImplementation(async (changes) => {
        Object.assign(product, changes);
        return changes;
      });

      const result = await service.update('product-id', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(repository.save).toHaveBeenCalledWith({
        productID: 'product-id',
        name: 'Updated Name',
      });
    });

    // TC-PROD-U-021
    it('should not write for an empty patch', async () => {
      const result = await service.update('product-id', {});

      expect(result).toBe(product);
      expect(repository.save).not.toHaveBeenCalled();
    });

    // TC-PROD-U-022
    it('should validate category before updating', async () => {
      categories.findById.mockRejectedValue(new NotFoundException('Category not found'));

      await expect(
        service.update('product-id', {
          categoryID: 'missing-category',
          name: 'Changed',
        }),
      ).rejects.toThrow('Category not found');
      expect(repository.save).not.toHaveBeenCalled();
    });

    // TC-PROD-U-023
    it('should throw ConflictException when updating to existing SKU', async () => {
      repository.findOne
        .mockResolvedValueOnce(product)
        .mockResolvedValueOnce({ productID: 'other', SKU: 'EXISTING-SKU' }); // Duplicate found

      await expect(
        service.update('product-id', { SKU: 'EXISTING-SKU' }),
      ).rejects.toThrow(ConflictException);
    });

    // TC-PROD-U-024
    it('should allow updating SKU to same value without conflict', async () => {
      repository.save.mockResolvedValue(product);

      // Update SKU to same value - should succeed without conflict
      await expect(
        service.update('product-id', { SKU: 'WM-001' }),
      ).resolves.toBeDefined();
    });

    // TC-PROD-U-025
    it('should validate compareAtPrice when updating price', async () => {
      const productWithComparePrice = { ...product, compareAtPrice: 60000 };
      repository.findOne.mockResolvedValue(productWithComparePrice);

      await expect(
        service.update('product-id', { price: 70000 }), // Higher than compareAtPrice
      ).rejects.toThrow('Original price must be greater than selling price');
    });

    // TC-PROD-U-026
    it('should map database SKU conflict to HTTP 409', async () => {
      repository.findOne
        .mockResolvedValueOnce(product)
        .mockResolvedValueOnce(null); // No duplicate in precheck
      repository.save.mockRejectedValue(databaseError());

      await expect(
        service.update('product-id', { SKU: 'CONCURRENT-SKU' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    // TC-PROD-U-027
    it('should map database compare price constraint violation', async () => {
      repository.save.mockRejectedValue(
        databaseError('23514', comparePriceConstraint),
      );

      await expect(
        service.update('product-id', { name: 'Test' }),
      ).rejects.toThrow('Original price must be greater than selling price');
    });
  });

  describe('updateStock', () => {
    // TC-PROD-U-028
    it('should update stock quantity', async () => {
      repository.save.mockResolvedValue({ ...product, stockQty: 25 });

      const result = await service.updateStock('product-id', 25);

      expect(result.stockQty).toBe(25);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ stockQty: 25 }),
      );
    });

    // TC-PROD-U-029
    it('should throw NotFoundException when product not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.updateStock('missing-id', 10)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    // TC-PROD-U-030
    it('should delete product when not referenced', async () => {
      repository.delete.mockResolvedValue({ affected: 1 });

      await service.remove('product-id');

      expect(repository.delete).toHaveBeenCalledWith('product-id');
    });

    // TC-PROD-U-031
    it('should throw NotFoundException when product not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    // TC-PROD-U-032
    it('should throw ConflictException when product is referenced by order', async () => {
      repository.delete.mockRejectedValue(
        new QueryFailedError('DELETE', [], new Error('FK constraint')),
      );

      await expect(service.remove('product-id')).rejects.toThrow(
        ConflictException,
      );
      await expect(service.remove('product-id')).rejects.toThrow(
        'referenced by an order',
      );
    });
  });

  describe('findRelatedPublicProducts', () => {
    // TC-PROD-U-033
    it('should return related products sorted by price proximity', async () => {
      const mockQueryBuilder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findRelatedPublicProducts('product-id');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'product.isActive = true',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'product.productID <> :productId',
        { productId: 'product-id' },
      );
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('lockForReview', () => {
    // TC-PROD-U-034
    it('should throw NotFoundException when product not found', async () => {
      const mockManager = {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue(null),
        }),
      };

      await expect(
        service.lockForReview('missing-id', mockManager as unknown as EntityManager),
      ).rejects.toThrow(NotFoundException);
    });

    // TC-PROD-U-035
    it('should throw NotFoundException for hidden product when allowHidden is false', async () => {
      const inactiveProduct = { ...product, isActive: false };
      const mockManager = {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue(inactiveProduct),
        }),
      };

      await expect(
        service.lockForReview('product-id', mockManager as unknown as EntityManager),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('error handling', () => {
    // TC-PROD-U-036
    it('should not mislabel different database constraint as duplicate SKU', async () => {
      const error = databaseError('23505', 'different_constraint');
      repository.save.mockRejectedValue(error);

      await expect(
        service.update('product-id', { name: 'Changed' }),
      ).rejects.toBe(error);
      expect(errorLogCalls).toEqual([
        [
          {
            operation: 'products.update',
            productId: 'product-id',
            outcome: 'persistence_failed',
          },
        ],
      ]);
    });

    // TC-PROD-U-037
    it('should log safe context without sensitive data when persistence fails', async () => {
      const error = new Error('private database details');
      repository.save.mockRejectedValue(error);

      await expect(
        service.update('product-id', {
          specifications: { private: 'sensitive value' },
        }),
      ).rejects.toBe(error);
      expect(JSON.stringify(errorLogCalls)).not.toContain('sensitive value');
      expect(JSON.stringify(errorLogCalls)).not.toContain(
        'private database details',
      );
    });
  });
});
