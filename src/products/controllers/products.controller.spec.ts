/**
 * ProductsController Unit Tests
 *
 * Test Case IDs: TC-PROD-U-053 through TC-PROD-U-062
 *
 * These tests verify controller endpoint delegation to services.
 */

import { ProductsController } from './products.controller';
import { ProductsService } from '../services/products.service';
import { ProductCatalogService } from '../services/product-catalog.service';
import { Product } from '../entities/product.entity';
import { Category } from '../../categories/entities/category.entity';

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsService: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateStock: jest.Mock;
    remove: jest.Mock;
  };
  let catalogService: {
    find: jest.Mock;
  };
  let product: Product;

  beforeEach(() => {
    jest.clearAllMocks();

    const category = Object.assign(new Category(), {
      categoryID: 'category-id',
      name: 'Appliances',
    });

    product = Object.assign(new Product(), {
      productID: 'product-id',
      name: 'Washing Machine',
      SKU: 'WM-001',
      price: 50000,
      stockQty: 10,
      isActive: true,
      category,
    });

    productsService = {
      findAll: jest.fn().mockResolvedValue([product]),
      findById: jest.fn().mockResolvedValue(product),
      create: jest.fn().mockResolvedValue(product),
      update: jest.fn().mockResolvedValue(product),
      updateStock: jest.fn().mockResolvedValue(product),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    catalogService = {
      find: jest.fn().mockResolvedValue({
        items: [product],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        facets: {},
      }),
    };

    controller = new ProductsController(
      productsService as unknown as ProductsService,
      catalogService as unknown as ProductCatalogService,
    );
  });

  // TC-PROD-U-053
  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findCatalog', () => {
    // TC-PROD-U-054
    it('should delegate to catalog service with query params', async () => {
      const query = { page: 1, limit: 20, q: 'washing' };

      await controller.findCatalog(query);

      expect(catalogService.find).toHaveBeenCalledWith(query);
    });
  });

  describe('findAll', () => {
    // TC-PROD-U-055
    it('should delegate to products service', async () => {
      const result = await controller.findAll();

      expect(result).toEqual([product]);
      expect(productsService.findAll).toHaveBeenCalledWith(undefined);
    });

    // TC-PROD-U-056
    it('should pass categoryId when provided', async () => {
      await controller.findAll('category-id');

      expect(productsService.findAll).toHaveBeenCalledWith('category-id');
    });
  });

  describe('findAllForAdmin', () => {
    // TC-PROD-U-057
    it('should include inactive products for admin', async () => {
      await controller.findAllForAdmin();

      expect(productsService.findAll).toHaveBeenCalledWith(undefined, true);
    });
  });

  describe('findOne', () => {
    // TC-PROD-U-058
    it('should delegate to findById', async () => {
      const result = await controller.findOne('product-id');

      expect(result).toEqual(product);
      expect(productsService.findById).toHaveBeenCalledWith('product-id');
    });
  });

  describe('findOneForAdmin', () => {
    // TC-PROD-U-059
    it('should include inactive products for admin view', async () => {
      await controller.findOneForAdmin('product-id');

      expect(productsService.findById).toHaveBeenCalledWith('product-id', true);
    });
  });

  describe('create', () => {
    // TC-PROD-U-060
    it('should delegate to products service create', async () => {
      const dto = {
        name: 'New Product',
        SKU: 'NEW-001',
        price: 25000,
        categoryID: 'category-id',
      };

      const result = await controller.create(dto);

      expect(result).toEqual(product);
      expect(productsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateStock', () => {
    // TC-PROD-U-061
    it('should delegate to products service updateStock', async () => {
      await controller.updateStock('product-id', { stockQty: 50 });

      expect(productsService.updateStock).toHaveBeenCalledWith('product-id', 50);
    });
  });

  describe('update', () => {
    // TC-PROD-U-062
    it('should delegate to products service update', async () => {
      const dto = { name: 'Updated Name' };

      await controller.update('product-id', dto);

      expect(productsService.update).toHaveBeenCalledWith('product-id', dto);
    });
  });

  describe('remove', () => {
    // TC-PROD-U-063
    it('should delegate to products service remove', async () => {
      await controller.remove('product-id');

      expect(productsService.remove).toHaveBeenCalledWith('product-id');
    });
  });
});
