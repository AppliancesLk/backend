import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ProductsService } from '../../products/services/products.service';
import { Product } from '../../products/entities/product.entity';
import { CartItem } from '../entities/cart-item.entity';
import { CartService } from './cart.service';

describe('Cart business rules', () => {
  let service: CartService;
  const cart = { id: 'own-cart', userId: 'customer' };
  const builder = {
    insert: jest.fn(),
    into: jest.fn(),
    values: jest.fn(),
    orIgnore: jest.fn(),
    execute: jest.fn(),
  };
  const manager = {
    createQueryBuilder: jest.fn(),
    findOneOrFail: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const products = { findForCart: jest.fn() };
  const errorLog = jest.fn();
  let product: Product;
  beforeEach(() => {
    jest.resetAllMocks();
    for (const name of ['insert', 'into', 'values', 'orIgnore'] as const)
      builder[name].mockReturnValue(builder);
    manager.createQueryBuilder.mockReturnValue(builder);
    manager.findOneOrFail.mockResolvedValue(cart);
    manager.find.mockResolvedValue([]);
    manager.findOneBy.mockResolvedValue(null);
    product = Object.assign(new Product(), {
      productID: 'product',
      stockQty: 5,
    });
    products.findForCart.mockResolvedValue(
      new Map([['product', { product, isAvailable: true }]]),
    );
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(errorLog);
    service = new CartService(
      {
        transaction: async (
          action: (value: EntityManager) => Promise<unknown>,
        ) => action(manager as unknown as EntityManager),
      } as unknown as DataSource,
      products as unknown as ProductsService,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('rejects invalid quantities even when called outside HTTP DTO validation', async () => {
    for (const quantity of [0, -1, 1.5, Infinity, NaN, 2147483648]) {
      await expect(
        service.addItem('customer', { productId: 'product', quantity }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('checks combined quantity before persisting a repeated product', async () => {
    manager.findOneBy.mockResolvedValue({ id: 'item', quantity: 4 });
    await expect(
      service.addItem('customer', { productId: 'product', quantity: 2 }),
    ).rejects.toThrow('exceeds available stock');
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('updates the existing item and passes the active transaction into Products', async () => {
    manager.findOneBy.mockResolvedValue({ id: 'item', quantity: 4 });
    await service.addItem('customer', { productId: 'product', quantity: 1 });
    expect(manager.update).toHaveBeenCalledWith(
      CartItem,
      { id: 'item', cartId: cart.id },
      { quantity: 5 },
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(products.findForCart).toHaveBeenCalledWith(['product'], manager);
  });

  it('does not reveal or modify an item outside the authenticated cart', async () => {
    await expect(
      service.updateItem('customer', 'other-item', 1),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(manager.findOneBy).toHaveBeenCalledWith(CartItem, {
      id: 'other-item',
      cartId: cart.id,
    });
    expect(manager.update).not.toHaveBeenCalled();
    await expect(
      service.removeItem('customer', 'other-item'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('rejects unavailable and unknown products', async () => {
    products.findForCart.mockResolvedValueOnce(new Map());
    await expect(
      service.addItem('customer', { productId: 'product', quantity: 1 }),
    ).rejects.toThrow('Product not found');
    products.findForCart.mockResolvedValueOnce(
      new Map([['product', { product, isAvailable: false }]]),
    );
    await expect(
      service.addItem('customer', { productId: 'product', quantity: 1 }),
    ).rejects.toThrow('Product not found');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('logs failures using safe context without logging raw errors', async () => {
    products.findForCart.mockRejectedValue(
      new Error('sensitive database error sentinel'),
    );
    await expect(
      service.addItem('customer', { productId: 'product', quantity: 1 }),
    ).rejects.toThrow('sensitive database error sentinel');
    expect(errorLog).toHaveBeenCalledWith({
      operation: 'cart.add',
      userId: 'customer',
      outcome: 'failed',
      reason: 'unexpected_error',
      statusCode: 500,
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sentinel');
  });
});
