/**
 * CartService Unit Tests
 *
 * Test Case IDs: TC-CART-U-001 through TC-CART-U-015
 *
 * These tests verify cart operations including:
 * - Adding items with quantity validation
 * - Updating item quantities
 * - Removing items
 * - Stock availability checking
 * - Cart ownership protection
 */

import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ProductsService } from '../../products/services/products.service';
import { Product } from '../../products/entities/product.entity';
import { CartItem } from '../entities/cart-item.entity';
import { Cart } from '../entities/cart.entity';
import { CartService } from './cart.service';

describe('CartService', () => {
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
    findOne: jest.fn(),
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
      name: 'Test Product',
      SKU: 'TEST-001',
      price: '1000.00',
      images: [],
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

  describe('addItem', () => {
    // TC-CART-U-001
    it('should reject zero quantity', async () => {
      await expect(
        service.addItem('customer', { productId: 'product', quantity: 0 }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    // TC-CART-U-002
    it('should reject negative quantities', async () => {
      await expect(
        service.addItem('customer', { productId: 'product', quantity: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    // TC-CART-U-003
    it('should reject non-integer quantities', async () => {
      await expect(
        service.addItem('customer', { productId: 'product', quantity: 1.5 }),
      ).rejects.toThrow(BadRequestException);
    });

    // TC-CART-U-004
    it('should reject quantities exceeding max integer', async () => {
      await expect(
        service.addItem('customer', { productId: 'product', quantity: 2147483648 }),
      ).rejects.toThrow(BadRequestException);
    });

    // TC-CART-U-005
    it('should check combined quantity when adding to existing item', async () => {
      manager.findOneBy.mockResolvedValue({ id: 'item', quantity: 4 });

      await expect(
        service.addItem('customer', { productId: 'product', quantity: 2 }),
      ).rejects.toThrow('exceeds available stock');

      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    // TC-CART-U-006
    it('should update existing item when adding more of same product', async () => {
      manager.findOneBy.mockResolvedValue({ id: 'item', quantity: 4 });

      await service.addItem('customer', { productId: 'product', quantity: 1 });

      expect(manager.update).toHaveBeenCalledWith(
        CartItem,
        { id: 'item', cartId: cart.id },
        { quantity: 5 },
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    // TC-CART-U-007
    it('should create new item when product not in cart', async () => {
      manager.findOneBy.mockResolvedValue(null);
      manager.create.mockReturnValue({ productId: 'product', quantity: 2 });

      await service.addItem('customer', { productId: 'product', quantity: 2 });

      expect(manager.save).toHaveBeenCalled();
    });

    // TC-CART-U-008
    it('should reject unavailable products', async () => {
      products.findForCart.mockResolvedValueOnce(
        new Map([['product', { product, isAvailable: false }]]),
      );

      await expect(
        service.addItem('customer', { productId: 'product', quantity: 1 }),
      ).rejects.toThrow('Product not found');
    });

    // TC-CART-U-009
    it('should reject unknown products', async () => {
      products.findForCart.mockResolvedValueOnce(new Map());

      await expect(
        service.addItem('customer', { productId: 'product', quantity: 1 }),
      ).rejects.toThrow('Product not found');
    });
  });

  describe('updateItem', () => {
    // TC-CART-U-010
    it('should reject update on non-existent cart item', async () => {
      manager.findOneBy.mockResolvedValue(null);

      await expect(
        service.updateItem('customer', 'missing-item', 1),
      ).rejects.toThrow(NotFoundException);

      expect(manager.update).not.toHaveBeenCalled();
    });

    // TC-CART-U-011
    it('should update item quantity when valid', async () => {
      manager.findOneBy.mockResolvedValue({
        id: 'item',
        cartId: cart.id,
        productId: 'product',
        quantity: 2
      });

      await service.updateItem('customer', 'item', 3);

      expect(manager.update).toHaveBeenCalledWith(
        CartItem,
        { id: 'item', cartId: cart.id },
        { quantity: 3 },
      );
    });

    // TC-CART-U-012
    it('should reject update exceeding stock', async () => {
      manager.findOneBy.mockResolvedValue({
        id: 'item',
        cartId: cart.id,
        productId: 'product'
      });

      await expect(
        service.updateItem('customer', 'item', 10),
      ).rejects.toThrow('exceeds available stock');
    });
  });

  describe('removeItem', () => {
    // TC-CART-U-013
    it('should reject removal of non-existent item', async () => {
      manager.findOneBy.mockResolvedValue(null);

      await expect(
        service.removeItem('customer', 'missing-item'),
      ).rejects.toThrow(NotFoundException);

      expect(manager.delete).not.toHaveBeenCalled();
    });

    // TC-CART-U-014
    it('should delete item from cart', async () => {
      manager.findOneBy.mockResolvedValue({ id: 'item', cartId: cart.id });

      await service.removeItem('customer', 'item');

      expect(manager.delete).toHaveBeenCalledWith(CartItem, {
        id: 'item',
        cartId: cart.id
      });
    });
  });

  describe('clearCart', () => {
    // TC-CART-U-015
    it('should delete all items from cart', async () => {
      await service.clearCart('customer');

      expect(manager.delete).toHaveBeenCalledWith(CartItem, { cartId: cart.id });
    });
  });

  describe('error handling', () => {
    // TC-CART-U-016
    it('should log failures with safe context without exposing raw errors', async () => {
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
      // Ensure sensitive error details are not logged
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sentinel');
    });
  });

  describe('consumeCart', () => {
    // TC-CART-U-017
    it('should throw NotFoundException when cart not found during consume', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.consumeCart('customer', 'cart-id', manager as unknown as EntityManager),
      ).rejects.toThrow(NotFoundException);
    });

    // TC-CART-U-018
    it('should delete all cart items and update cart timestamp', async () => {
      manager.findOne.mockResolvedValue({ id: 'cart-id', userId: 'customer' });

      await service.consumeCart('customer', 'cart-id', manager as unknown as EntityManager);

      expect(manager.delete).toHaveBeenCalledWith(CartItem, { cartId: 'cart-id' });
      expect(manager.update).toHaveBeenCalledWith(
        Cart,
        { id: 'cart-id' },
        expect.objectContaining({ updatedAt: expect.any(Date) }),
      );
    });
  });

  describe('lockCurrentCart', () => {
    // TC-CART-U-019
    it('should throw BadRequestException when cart is empty', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.lockCurrentCart('customer', manager as unknown as EntityManager),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
