/**
 * OrdersService Unit Tests
 *
 * Test Case IDs: TC-ORD-U-001 through TC-ORD-U-030
 *
 * These tests verify order operations including:
 * - Order creation with idempotency
 * - Order retrieval (own and admin)
 * - Status transitions and validation
 * - Customer cancellation rules
 * - Safe error handling and logging
 */

import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { CartService } from '../../cart/services/cart.service';
import { CheckoutService } from '../../checkout/services/checkout.service';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { CreateOrderDto } from '../dto/create-order.dto';
import { LoyaltyService } from '../../loyalty/services/loyalty.service';
import { OrderInventoryService } from '../../products/services/order-inventory.service';
import { OrderEvent } from '../entities/order-event.entity';
import { OrdersService } from './orders.service';
import { NotificationService } from '../../notification/notification.service';
import { Payment } from '../../payments/entities/payment.entity';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';
import { PaymentStatus } from '../../payments/enums/payment-status.enum';

describe('OrdersService', () => {
  const builder = {
    addSelect: jest.fn(),
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getOne: jest.fn(),
    innerJoin: jest.fn(),
    getExists: jest.fn(),
    getMany: jest.fn(),
  };
  const manager = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findOneByOrFail: jest.fn(),
  };
  const dataSource = { manager, transaction: jest.fn(), getRepository: jest.fn() };
  const cart = { lockCurrentCart: jest.fn(), consumeCart: jest.fn() };
  const checkout = { prepare: jest.fn() };
  const notifications = {
    sendOrderCreatedEmail: jest.fn(),
    sendOrderStatusUpdatedEmail: jest.fn(),
  };
  const loyalty = {
    redeem: jest.fn(),
    complete: jest.fn(),
    refund: jest.fn(),
  };
  const inventory = {
    reserve: jest.fn(),
    release: jest.fn(),
  };
  const log = jest.fn(),
    warn = jest.fn(),
    errorLog = jest.fn();
  const dto: CreateOrderDto = {
    idempotencyKey: '018c6a4e-36a7-49f8-9036-a7330f61b252',
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
  let service: OrdersService;
  let persisted: Order | null;

  beforeEach(() => {
    jest.resetAllMocks();
    persisted = null;
    for (const method of [
      'addSelect',
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orderBy',
      'innerJoin',
    ] as const)
      builder[method].mockReturnValue(builder);
    manager.createQueryBuilder.mockReturnValue(builder);
    builder.getOne.mockImplementation(async () => persisted);
    builder.getExists.mockResolvedValue(false);
    builder.getMany.mockResolvedValue([]);
    manager.create.mockImplementation(
      (
        entity: typeof Order | typeof OrderItem | typeof OrderEvent | typeof Payment,
        fields: object,
      ) => Object.assign(new entity(), fields),
    );
    manager.save.mockImplementation(
      async (
        entity: typeof Order | typeof OrderItem | typeof OrderEvent | typeof Payment,
        values: Order | OrderItem[] | OrderEvent | Payment,
      ) => {
        if (entity === Order) {
          persisted = Object.assign(values, {
            id: 'order',
            createdAt: new Date(),
            updatedAt: new Date(),
          }) as Order;
          return persisted;
        }
        if (entity === OrderEvent)
          return Object.assign(values, { id: 'event', createdAt: new Date() });
        if (entity === Payment)
          return Object.assign(values, { id: 'payment' });
        return (values as OrderItem[]).map((item, index) =>
          Object.assign(item, { id: `item-${index}` }),
        );
      },
    );
    dataSource.transaction.mockImplementation(
      async (
        isolationOrAction: string | ((tx: EntityManager) => Promise<unknown>),
        action?: (tx: EntityManager) => Promise<unknown>,
      ) => {
        const callback = typeof isolationOrAction === 'function' ? isolationOrAction : action!;
        return callback(manager as unknown as EntityManager);
      },
    );
    dataSource.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    });
    checkout.prepare.mockResolvedValue({
      cartId: 'cart',
      customerId: 'customer',
      currency: 'LKR',
      subtotal: '0.30',
      total: '0.30',
      preparedAt: new Date().toISOString(),
      delivery: dto.delivery,
      items: [
        {
          productId: 'product',
          name: 'Snapshot',
          SKU: 'SKU',
          images: ['image'],
          quantity: 3,
          unitPrice: '0.10',
          lineTotal: '0.30',
        },
      ],
    });
    jest.spyOn(Logger.prototype, 'log').mockImplementation(log);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(warn);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(errorLog);
    service = new OrdersService(
      dataSource as unknown as DataSource,
      cart as unknown as CartService,
      checkout as unknown as CheckoutService,
      notifications as unknown as NotificationService,
      loyalty as unknown as LoyaltyService,
      inventory as unknown as OrderInventoryService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    // TC-ORD-U-001
    it('should revalidate checkout, persist trusted snapshots, and consume cart in one transaction', async () => {
      const result = await service.create('customer', dto);
      expect(checkout.prepare).toHaveBeenCalledWith('customer', dto, manager);
      expect(cart.lockCurrentCart).toHaveBeenCalledWith('customer', manager);
      expect(result).toMatchObject({
        customerId: 'customer',
        status: OrderStatus.PENDING_PAYMENT,
        total: '0.30',
        items: [
          {
            productId: 'product',
            name: 'Snapshot',
            images: ['image'],
            quantity: 3,
            unitPrice: '0.10',
            lineTotal: '0.30',
          },
        ],
      });
      expect(cart.consumeCart).toHaveBeenCalledWith('customer', 'cart', manager);
      expect(result).not.toHaveProperty('requestHash');
      expect(result).not.toHaveProperty('idempotencyKey');
    });

    // TC-ORD-U-002
    it('should return original order on retry without revalidating checkout', async () => {
      const first = await service.create('customer', dto);
      const repeated = await service.create('customer', dto);
      expect(repeated).toEqual(first);
      expect(checkout.prepare).toHaveBeenCalledTimes(1);
      expect(cart.consumeCart).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenLastCalledWith(
        expect.objectContaining({ outcome: 'replayed' }),
      );
    });

    // TC-ORD-U-003
    it('should reject key reuse with changed delivery data', async () => {
      await service.create('customer', dto);
      await expect(
        service.create('customer', {
          idempotencyKey: dto.idempotencyKey,
          delivery: Object.assign({}, dto.delivery, { city: 'Kandy' }),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(cart.consumeCart).toHaveBeenCalledTimes(1);
    });

    // TC-ORD-U-004
    it('should normalize equivalent address formatting for retry fingerprints', async () => {
      await service.create('customer', dto);
      await expect(
        service.create('customer', {
          idempotencyKey: dto.idempotencyKey,
          delivery: Object.assign({}, dto.delivery, {
            countryCode: ' lk ',
            addressLine2: ' ',
          }),
        }),
      ).resolves.toHaveProperty('id', 'order');
    });

    // TC-ORD-U-005
    it('should not write an order when checkout fails', async () => {
      checkout.prepare.mockRejectedValue(
        new BadRequestException('Cart is empty'),
      );
      await expect(service.create('customer', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(manager.save).not.toHaveBeenCalled();
      expect(cart.consumeCart).not.toHaveBeenCalled();
    });

    // TC-ORD-U-006
    it('should not consume cart when persisting items fails', async () => {
      manager.save
        .mockResolvedValueOnce(Object.assign(new Order(), { id: 'order' }))
        .mockRejectedValueOnce(new Error('private database sentinel'));
      await expect(service.create('customer', dto)).rejects.toThrow(
        'Unable to create order. Please try again',
      );
      expect(cart.consumeCart).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 }),
      );
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sentinel');
    });

    // TC-ORD-U-007
    it('should resolve concurrent snapshot conflicts through fresh idempotency lookup', async () => {
      await service.create('customer', dto);
      dataSource.transaction.mockRejectedValueOnce(
        new QueryFailedError(
          'query',
          [],
          Object.assign(new Error('details'), { code: '40001' }),
        ),
      );
      await expect(service.create('customer', dto)).resolves.toHaveProperty(
        'id',
        'order',
      );
      expect(checkout.prepare).toHaveBeenCalledTimes(1);
    });

    // TC-ORD-U-008
    it('should return safe conflict when different flow won the cart race', async () => {
      dataSource.transaction.mockRejectedValueOnce(
        new QueryFailedError(
          'query',
          [],
          Object.assign(new Error('details'), { code: '40001' }),
        ),
      );
      await expect(service.create('customer', dto)).rejects.toThrow(
        'Cart changed during order creation',
      );
    });

    // TC-ORD-U-009
    it('should send order created notification on successful creation', async () => {
      await service.create('customer', dto);
      expect(notifications.sendOrderCreatedEmail).toHaveBeenCalled();
    });

    // TC-ORD-U-010
    it('should not send notification on replayed order', async () => {
      await service.create('customer', dto);
      notifications.sendOrderCreatedEmail.mockClear();
      await service.create('customer', dto);
      expect(notifications.sendOrderCreatedEmail).not.toHaveBeenCalled();
    });
  });

  describe('findAllOwn', () => {
    // TC-ORD-U-011
    it('should scope queries to authenticated customer', async () => {
      manager.find.mockResolvedValue([]);
      await expect(service.findAllOwn('customer')).resolves.toEqual([]);
      expect(manager.find).toHaveBeenCalledWith(Order, {
        where: { customerId: 'customer' },
        relations: { items: true, events: true },
        order: { createdAt: 'DESC', id: 'DESC', items: { id: 'ASC' } },
      });
    });

    // TC-ORD-U-012
    it('should return stored snapshots for list', async () => {
      await service.create('customer', dto);
      manager.find.mockResolvedValue([persisted]);
      const list = await service.findAllOwn('customer');
      expect(list[0].items[0]).toMatchObject({
        quantity: 3,
        unitPrice: '0.10',
        lineTotal: '0.30',
      });
    });
  });

  describe('findOwn', () => {
    // TC-ORD-U-013
    it('should scope retrieval to authenticated customer', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(
        service.findOwn('other-customer', 'order'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(manager.findOne).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          where: { id: 'order', customerId: 'other-customer' },
        }),
      );
    });

    // TC-ORD-U-014
    it('should scope idempotency lookup to authenticated customer', async () => {
      await service.create('customer', dto);
      expect(builder.where).toHaveBeenCalledWith(
        'order.customerId = :customerId',
        { customerId: 'customer' },
      );
    });
  });

  describe('findOwnStatus', () => {
    // TC-ORD-U-015
    it('should return only current status fields', async () => {
      await service.create('customer', dto);
      manager.findOne.mockResolvedValue(persisted);
      await expect(service.findOwnStatus('customer', 'order')).resolves.toEqual({
        id: 'order',
        status: OrderStatus.PENDING_PAYMENT,
        updatedAt: persisted?.updatedAt,
      });
      expect(manager.findOne).toHaveBeenCalledWith(Order, {
        where: { id: 'order', customerId: 'customer' },
        select: { id: true, status: true, updatedAt: true },
      });
    });

    // TC-ORD-U-016
    it('should use same not-found response for unknown and unowned orders', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.findOwnStatus('customer', 'unknown')).rejects.toThrow(
        'Order not found',
      );
      expect(errorLog).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    // TC-ORD-U-017
    it('should log only safe resource context, never delivery data', async () => {
      await service.create('customer', dto);
      const logs = JSON.stringify([
        log.mock.calls,
        warn.mock.calls,
        errorLog.mock.calls,
      ]);
      for (const secret of [
        'private@example.com',
        '0771234567',
        'Private address',
        dto.idempotencyKey,
        (manager.save.mock.calls[0][1] as Order).requestHash,
      ])
        expect(logs).not.toContain(secret);
    });

    // TC-ORD-U-018
    it.each(['list', 'detail', 'status'] as const)(
      'should safely log unexpected %s retrieval failures',
      async (operation) => {
        const failure = new Error('private SQL and delivery sentinel');
        manager.find.mockRejectedValue(failure);
        manager.findOne.mockRejectedValue(failure);
        const result =
          operation === 'list'
            ? service.findAllOwn('customer')
            : operation === 'detail'
              ? service.findOwn('customer', 'order')
              : service.findOwnStatus('customer', 'order');
        await expect(result).rejects.toThrow(
          'Unable to retrieve orders. Please try again',
        );
        expect(errorLog).toHaveBeenCalledWith(
          expect.objectContaining({
            operation: `orders.${operation}`,
            customerId: 'customer',
            statusCode: 500,
          }),
        );
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sentinel');
      },
    );
  });

  describe('updateStatus', () => {
    const confirmedOrder = Object.assign(new Order(), {
      id: 'order',
      customerId: 'customer',
      status: OrderStatus.CONFIRMED,
      paymentMethod: PaymentMethod.PAYHERE,
      stockReserved: true,
      customer: { id: 'customer', username: 'test', email: 'test@test.com' },
      items: [],
      events: [],
    });

    // TC-ORD-U-019
    it('should allow valid status transitions', async () => {
      manager.findOne
        .mockResolvedValueOnce(confirmedOrder)
        .mockResolvedValueOnce({ status: PaymentStatus.SUCCESS }) // payment
        .mockResolvedValueOnce({ ...confirmedOrder, status: OrderStatus.PROCESSING }); // reload
      manager.find.mockResolvedValue([]);

      await service.updateStatus('admin', 'order', OrderStatus.PROCESSING);

      expect(manager.save).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({ status: OrderStatus.PROCESSING }),
      );
    });

    // TC-ORD-U-020
    it('should reject invalid status transitions', async () => {
      manager.findOne.mockResolvedValueOnce(confirmedOrder);

      await expect(
        service.updateStatus('admin', 'order', OrderStatus.DELIVERED),
      ).rejects.toThrow('cannot change from');
    });

    // TC-ORD-U-021
    it('should throw NotFoundException when order not found', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus('admin', 'missing', OrderStatus.PROCESSING),
      ).rejects.toThrow(NotFoundException);
    });

    // TC-ORD-U-022
    it('should call notification service after status change', async () => {
      // Mock the transaction to return a successful status change
      const orderWithChange = { ...confirmedOrder, status: OrderStatus.PROCESSING };
      dataSource.transaction.mockResolvedValueOnce({
        previous: OrderStatus.CONFIRMED,
        order: orderWithChange,
      });

      // findForAdmin uses dataSource.manager
      manager.findOne
        .mockResolvedValueOnce(orderWithChange)
        .mockResolvedValueOnce(null);

      await service.updateStatus('admin', 'order', OrderStatus.PROCESSING);

      expect(notifications.sendOrderStatusUpdatedEmail).toHaveBeenCalledWith(
        orderWithChange,
        OrderStatus.CONFIRMED,
      );
    });
  });

  describe('cancelOwn', () => {
    const pendingOrder = Object.assign(new Order(), {
      id: 'order',
      customerId: 'customer',
      status: OrderStatus.PENDING_PAYMENT,
      paymentMethod: PaymentMethod.PAYHERE,
      stockReserved: false,
      items: [],
      events: [],
    });

    // TC-ORD-U-023
    it('should allow cancellation of pending payment orders', async () => {
      manager.findOne.mockResolvedValue(pendingOrder);
      manager.findOneByOrFail.mockResolvedValue(pendingOrder);
      manager.find.mockResolvedValue([]);

      await service.cancelOwn('customer', 'order');

      expect(manager.save).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({ status: OrderStatus.CANCELLED }),
      );
    });

    // TC-ORD-U-024
    it('should allow cancellation of COD confirmed orders', async () => {
      const codOrder = Object.assign(new Order(), {
        ...pendingOrder,
        status: OrderStatus.CONFIRMED,
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      });
      manager.findOne.mockResolvedValue(codOrder);
      manager.findOneByOrFail.mockResolvedValue(codOrder);
      manager.find.mockResolvedValue([]);

      await service.cancelOwn('customer', 'order');

      expect(manager.save).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({ status: OrderStatus.CANCELLED }),
      );
    });

    // TC-ORD-U-025
    it('should reject cancellation of processing orders', async () => {
      const processingOrder = Object.assign(new Order(), {
        ...pendingOrder,
        status: OrderStatus.PROCESSING,
      });
      manager.findOne.mockResolvedValue(processingOrder);

      await expect(service.cancelOwn('customer', 'order')).rejects.toThrow(
        'Contact the store',
      );
    });

    // TC-ORD-U-026
    it('should throw NotFoundException when order not found', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.cancelOwn('customer', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    // TC-ORD-U-027
    it('should be idempotent for already cancelled orders', async () => {
      const cancelledOrder = Object.assign(new Order(), {
        ...pendingOrder,
        status: OrderStatus.CANCELLED,
      });
      manager.findOne.mockResolvedValue(cancelledOrder);

      const result = await service.cancelOwn('customer', 'order');

      expect(result).toBeDefined();
      // Should not save again
      expect(manager.save).not.toHaveBeenCalledWith(
        Order,
        expect.objectContaining({ status: OrderStatus.CANCELLED }),
      );
    });

    // TC-ORD-U-028
    it('should release inventory when cancelling reserved order', async () => {
      const reservedOrder = Object.assign(new Order(), {
        ...pendingOrder,
        status: OrderStatus.CONFIRMED,
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        stockReserved: true,
      });
      const items = [{ id: 'item-1', productId: 'product', quantity: 2 }];
      manager.findOne.mockResolvedValue(reservedOrder);
      manager.findOneByOrFail.mockResolvedValue(reservedOrder);
      manager.find.mockResolvedValue(items);

      await service.cancelOwn('customer', 'order');

      expect(inventory.release).toHaveBeenCalledWith(manager, items);
    });
  });

  describe('hasDeliveredPurchase', () => {
    // TC-ORD-U-029
    it('should return true when customer has delivered purchase of product', async () => {
      builder.getExists.mockResolvedValue(true);

      const result = await service.hasDeliveredPurchase('customer', 'product');

      expect(result).toBe(true);
      expect(builder.where).toHaveBeenCalledWith(
        'order.customerId = :customerId',
        { customerId: 'customer' },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        'order.status = :status',
        { status: OrderStatus.DELIVERED },
      );
    });

    // TC-ORD-U-030
    it('should return false when customer has no delivered purchase', async () => {
      builder.getExists.mockResolvedValue(false);

      const result = await service.hasDeliveredPurchase('customer', 'product');

      expect(result).toBe(false);
    });
  });
});
