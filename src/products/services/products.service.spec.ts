import { ConflictException, Logger } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { ProductsService } from './products.service';
import { Product } from '../entities/product.entity';
import { Category } from '../../categories/entities/category.entity';
import { CategoriesService } from '../../categories/services/categories.service';

const skuConstraint = 'UQ_d750d40dee7a63a316039f246be';
const databaseError = (constraint = skuConstraint) =>
  new QueryFailedError(
    'UPDATE products',
    [],
    Object.assign(new Error('database failure'), { code: '23505', constraint }),
  );

describe('Product editing persistence', () => {
  const repository = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
  const categories = { findById: jest.fn() };
  let service: ProductsService;
  let product: Product;
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
    service = new ProductsService(
      repository as unknown as Repository<Product>,
      categories as unknown as CategoriesService,
    );
    product = Object.assign(new Product(), {
      productID: 'product-id',
      name: 'Original',
      SKU: 'SKU-1',
      price: 100,
      stockQty: 7,
      images: ['image'],
      specifications: { Capacity: '8 kg' },
      isActive: false,
      category: Object.assign(new Category(), { categoryID: 'category-id' }),
    });
    repository.findOne.mockResolvedValue(product);
  });
  afterEach(() => jest.restoreAllMocks());

  it('patches only supplied fields and preserves a concurrent stock/price update', async () => {
    repository.save.mockImplementation(async (changes) => {
      product.stockQty = 25;
      product.price = 200;
      Object.assign(product, changes);
      return changes;
    });
    const result = await service.update(product.productID, { name: 'Updated' });
    expect(result).toMatchObject({
      name: 'Updated',
      stockQty: 25,
      price: 200,
      isActive: false,
    });
    expect(repository.save).toHaveBeenCalledWith({
      productID: product.productID,
      name: 'Updated',
    });
  });
  it('does not write for an empty patch', async () => {
    expect(await service.update(product.productID, {})).toBe(product);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('validates a replacement category before persisting anything', async () => {
    categories.findById.mockRejectedValue(new Error('Category not found'));
    await expect(
      service.update(product.productID, {
        categoryID: 'missing-category',
        name: 'Changed',
      }),
    ).rejects.toThrow('Category not found');
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('maps a database SKU conflict after the precheck to HTTP 409', async () => {
    repository.findOne
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce(null);
    repository.save.mockRejectedValue(databaseError());
    await expect(
      service.update(product.productID, { SKU: 'CONCURRENT-SKU' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('maps the same database race during creation to HTTP 409', async () => {
    repository.findOne.mockResolvedValue(null);
    categories.findById.mockResolvedValue(product.category);
    repository.create.mockReturnValue(product);
    repository.save.mockRejectedValue(databaseError());
    await expect(
      service.create({
        name: 'Product',
        SKU: 'CONCURRENT-SKU',
        price: 100,
        categoryID: 'category-id',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not mislabel another database constraint as a duplicate SKU', async () => {
    const error = databaseError('different_constraint');
    repository.save.mockRejectedValue(error);
    await expect(
      service.update(product.productID, { name: 'Changed' }),
    ).rejects.toBe(error);
    expect(errorLogCalls).toEqual([
      [
        {
          operation: 'products.update',
          productId: product.productID,
          outcome: 'persistence_failed',
        },
      ],
    ]);
  });
  it('logs safe context without request data when persistence fails', async () => {
    const error = new Error('private database details');
    repository.save.mockRejectedValue(error);
    await expect(
      service.update(product.productID, {
        specifications: { private: 'sensitive value' },
      }),
    ).rejects.toBe(error);
    expect(JSON.stringify(errorLogCalls)).not.toContain('sensitive value');
    expect(JSON.stringify(errorLogCalls)).not.toContain(
      'private database details',
    );
  });
});
