import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { CartService } from '../../cart/services/cart.service';
import { CartResponseDto } from '../../cart/dto/cart-response.dto';
import { CheckoutService } from './checkout.service';
import { PrepareCheckoutDto } from '../dto/prepare-checkout.dto';

describe('Checkout preparation', () => {
  const manager = {} as EntityManager;
  const cartService = { getCurrentCart: jest.fn() };
  const log = jest.fn(),
    warn = jest.fn(),
    errorLog = jest.fn();
  const dto: PrepareCheckoutDto = {
    delivery: {
      firstName: 'Test',
      lastName: 'Customer',
      email: 'private@example.com',
      phone: '0771234567',
      addressLine1: 'Private address',
      city: 'Colombo',
      postalCode: '00100',
      countryCode: 'LK',
    },
  };
  let service: CheckoutService;
  let cart: CartResponseDto;
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(log);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(warn);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(errorLog);
    cart = {
      id: 'cart',
      currency: 'LKR',
      items: [
        {
          id: 'item',
          productId: 'product',
          name: 'Product',
          SKU: 'SKU',
          images: [],
          quantity: 3,
          stockQty: 5,
          isAvailable: true,
          unitPrice: '0.10',
          lineTotal: '999.00',
        },
      ],
      itemCount: 1,
      subtotal: '999.00',
    };
    cartService.getCurrentCart.mockResolvedValue(cart);
    service = new CheckoutService(
      {
        transaction: async (
          _isolation: string,
          action: (tx: EntityManager) => Promise<unknown>,
        ) => action(manager),
      } as unknown as DataSource,
      cartService as unknown as CartService,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('reads the authenticated cart in the caller transaction and recalculates all totals', async () => {
    const result = await service.prepare('customer', dto);
    expect(cartService.getCurrentCart).toHaveBeenCalledWith(
      'customer',
      manager,
    );
    expect(result).toMatchObject({
      cartId: 'cart',
      customerId: 'customer',
      currency: 'LKR',
      subtotal: '0.30',
      total: '0.30',
      items: [{ unitPrice: '0.10', lineTotal: '0.30' }],
      delivery: dto.delivery,
    });
    expect(new Date(result.preparedAt).toISOString()).toBe(result.preparedAt);
    expect(cart.subtotal).toBe('999.00');
  });
  it('rejects missing and empty carts', async () => {
    for (const id of [null, 'cart']) {
      cartService.getCurrentCart.mockResolvedValueOnce({
        ...cart,
        id,
        items: [],
      });
      await expect(service.prepare('customer', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(log).not.toHaveBeenCalled();
  });
  it('checks every item instead of accepting a valid first item', async () => {
    cart.items.push({
      ...cart.items[0],
      id: 'other',
      productId: 'other',
      isAvailable: false,
    });
    await expect(service.prepare('customer', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('returns stock details for quantities above current stock, including zero stock', async () => {
    cart.items[0].stockQty = 0;
    cart.items[0].isAvailable = false;
    await expect(service.prepare('customer', dto)).rejects.toMatchObject({
      response: {
        statusCode: 409,
        message: 'Insufficient stock for cart product',
        productId: 'product',
        requestedQuantity: 3,
        availableStock: 0,
      },
    });
  });
  it('rejects invalid stored quantities', async () => {
    for (const quantity of [0, -1, 1.5, 2147483648]) {
      cart.items[0].quantity = quantity;
      await expect(service.prepare('customer', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    }
  });
  it('keeps exact large monetary totals', async () => {
    cart.items[0].quantity = 2147483647;
    cart.items[0].stockQty = 2147483647;
    cart.items[0].unitPrice = '9999999999.99';
    expect((await service.prepare('customer', dto)).total).toBe(
      '21474836469978525163.53',
    );
  });
  it('propagates missing product errors from the owning Cart module', async () => {
    cartService.getCurrentCart.mockRejectedValue(
      new NotFoundException('Cart product not found'),
    );
    await expect(service.prepare('customer', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, reason: 'product_not_found' }),
    );
  });
  it('maps concurrent snapshot changes to retryable HTTP conflicts', async () => {
    cartService.getCurrentCart.mockRejectedValue(
      new QueryFailedError(
        'query',
        [],
        Object.assign(new Error('raw database details'), { code: '40001' }),
      ),
    );
    await expect(service.prepare('customer', dto)).rejects.toThrow(
      'Cart changed during checkout preparation',
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, reason: 'cart_changed' }),
    );
  });
  it('logs safe success and failure context without delivery or raw errors', async () => {
    await service.prepare('customer', dto);
    cartService.getCurrentCart.mockRejectedValue(
      new Error('private error sentinel'),
    );
    await expect(service.prepare('customer', dto)).rejects.toThrow(
      'private error sentinel',
    );
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, outcome: 'failed' }),
    );
    const logs = JSON.stringify([
      log.mock.calls,
      warn.mock.calls,
      errorLog.mock.calls,
    ]);
    for (const sensitive of [
      'private@example.com',
      '0771234567',
      'Private address',
      'sentinel',
    ])
      expect(logs).not.toContain(sensitive);
  });
});
