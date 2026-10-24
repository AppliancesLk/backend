import {
  BadRequestException,
  ConflictException,
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

describe('Order creation', () => {
  const builder = {
    addSelect: jest.fn(),
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getOne: jest.fn(),
  };
  const manager = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const dataSource = { manager, transaction: jest.fn() };
  const cart = { lockCurrentCart: jest.fn(), consumeCart: jest.fn() };
  const checkout = { prepare: jest.fn() };
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
    ] as const)
      builder[method].mockReturnValue(builder);
    manager.createQueryBuilder.mockReturnValue(builder);
    builder.getOne.mockImplementation(async () => persisted);
    manager.create.mockImplementation(
      (
        entity: typeof Order | typeof OrderItem | typeof OrderEvent,
        fields: object,
      ) => Object.assign(new entity(), fields),
    );
    manager.save.mockImplementation(
      async (
        entity: typeof Order | typeof OrderItem | typeof OrderEvent,
        values: Order | OrderItem[] | OrderEvent,
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
        return (values as OrderItem[]).map((item, index) =>
          Object.assign(item, { id: `item-${index}` }),
        );
      },
    );
    dataSource.transaction.mockImplementation(
      async (
        _isolation: string,
        action: (tx: EntityManager) => Promise<unknown>,
      ) => action(manager as unknown as EntityManager),
    );
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
      { sendOrderCreatedEmail: jest.fn() } as unknown as NotificationService,
      { redeem: jest.fn() } as unknown as LoyaltyService,
      {
        reserve: jest.fn(),
        release: jest.fn(),
      } as unknown as OrderInventoryService,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('revalidates checkout, persists trusted snapshots, and consumes the owned cart in one transaction', async () => {
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
  it('returns the original order on retry without revalidating or consuming a refilled cart', async () => {
    const first = await service.create('customer', dto);
    const repeated = await service.create('customer', dto);
    expect(repeated).toEqual(first);
    expect(checkout.prepare).toHaveBeenCalledTimes(1);
    expect(cart.consumeCart).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: 'replayed' }),
    );
  });
  it('rejects key reuse with changed delivery data', async () => {
    await service.create('customer', dto);
    await expect(
      service.create('customer', {
        idempotencyKey: dto.idempotencyKey,
        delivery: Object.assign({}, dto.delivery, { city: 'Kandy' }),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(cart.consumeCart).toHaveBeenCalledTimes(1);
  });
  it('normalizes equivalent optional-address and country formatting for retry fingerprints', async () => {
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
  it('does not write an order when checkout fails', async () => {
    checkout.prepare.mockRejectedValue(
      new BadRequestException('Cart is empty'),
    );
    await expect(service.create('customer', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(cart.consumeCart).not.toHaveBeenCalled();
  });
  it('does not consume the cart when persisting items fails', async () => {
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
  it('resolves concurrent snapshot conflicts through a fresh idempotency lookup', async () => {
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
  it('returns a safe conflict when a different flow won the concurrent cart race', async () => {
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
  it('scopes retrieval and idempotency lookup to the authenticated customer', async () => {
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
    await service.create('customer', dto);
    expect(builder.where).toHaveBeenCalledWith(
      'order.customerId = :customerId',
      { customerId: 'customer' },
    );
  });
  it('logs only safe resource context, never delivery data or fingerprints', async () => {
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
  it('returns an empty history and scopes newest-first list queries to the customer', async () => {
    manager.find.mockResolvedValue([]);
    await expect(service.findAllOwn('customer')).resolves.toEqual([]);
    expect(manager.find).toHaveBeenCalledWith(Order, {
      where: { customerId: 'customer' },
      relations: { items: true, events: true },
      order: { createdAt: 'DESC', id: 'DESC', items: { id: 'ASC' } },
    });
  });
  it('returns stored snapshots for the list and only current status fields for status reads', async () => {
    await service.create('customer', dto);
    manager.find.mockResolvedValue([persisted]);
    const list = await service.findAllOwn('customer');
    expect(list[0].items[0]).toMatchObject({
      quantity: 3,
      unitPrice: '0.10',
      lineTotal: '0.30',
    });
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
  it('uses the same not-found response for unknown and unowned status reads', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(service.findOwnStatus('customer', 'unknown')).rejects.toThrow(
      'Order not found',
    );
    expect(errorLog).not.toHaveBeenCalled();
  });
  it.each(['list', 'detail', 'status'] as const)(
    'safely logs unexpected %s retrieval failures',
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
