import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { NotificationService } from '../../notification/notification.service';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { CartService } from '../../cart/services/cart.service';
import { CheckoutService } from '../../checkout/services/checkout.service';
import { Payment } from '../../payments/entities/payment.entity';
import { CreateOrderDto } from '../dto/create-order.dto';
import {
  AdminOrderResponseDto,
  OrderResponseDto,
  OrderStatusResponseDto,
} from '../dto/order-response.dto';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';
import { PaymentStatus } from '../../payments/enums/payment-status.enum';
import { OrderEvent } from '../entities/order-event.entity';
import { LoyaltyService } from '../../loyalty/services/loyalty.service';
import { OrderInventoryService } from '../../products/services/order-inventory.service';
import { formatMinorUnits, toMinorUnits } from '../../common/utils/money';

@Injectable()
export class OrdersService {
  async hasDeliveredPurchase(
    customerId: string,
    productId: string,
  ): Promise<boolean> {
    return this.dataSource
      .getRepository(Order)
      .createQueryBuilder('order')
      .innerJoin('order.items', 'item')
      .where('order.customerId = :customerId', { customerId })
      .andWhere('order.status = :status', { status: OrderStatus.DELIVERED })
      .andWhere('item.productId = :productId', { productId })
      .getExists();
  }
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly cartService: CartService,
    private readonly checkoutService: CheckoutService,
    private readonly notifications: NotificationService,
    private readonly loyalty: LoyaltyService,
    private readonly inventory: OrderInventoryService,
  ) {}

  async create(
    customerId: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    try {
      const fingerprint = this.fingerprint(dto);
      let result: { order: Order; replayed: boolean };
      try {
        result = await this.dataSource.transaction(
          'REPEATABLE READ',
          async (manager) => {
            const existing = await this.findByKey(
              manager,
              customerId,
              dto.idempotencyKey,
            );
            if (existing) {
              this.assertSameRequest(existing, fingerprint);
              return { order: existing, replayed: true };
            }
            // Serialize with Cart writes, including different idempotency keys.
            await this.cartService.lockCurrentCart(customerId, manager);
            // Re-run checkout inside this transaction; never accept a client summary.
            const checkout = await this.checkoutService.prepare(
              customerId,
              dto,
              manager,
            );
            const order = await manager.save(
              Order,
              manager.create(Order, {
                customerId,
                sourceCartId: checkout.cartId,
                idempotencyKey: dto.idempotencyKey,
                requestHash: fingerprint,
                status: OrderStatus.PENDING_PAYMENT,
                paymentMethod: dto.paymentMethod ?? PaymentMethod.PAYHERE,
                loyaltyRedeemed: '0.00',
                loyaltyEarned: '0.00',
                stockReserved: false,
                delivery: checkout.delivery,
                currency: checkout.currency,
                subtotal: checkout.subtotal,
                total: checkout.total,
                preparedAt: new Date(checkout.preparedAt),
              }),
            );
            order.items = await manager.save(
              OrderItem,
              checkout.items.map((item) =>
                manager.create(OrderItem, {
                  orderId: order.id,
                  productId: item.productId,
                  name: item.name,
                  SKU: item.SKU,
                  images: item.images,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  lineTotal: item.lineTotal,
                }),
              ),
            );
            await this.loyalty.redeem(
              manager,
              order,
              dto.loyaltyAmount ?? '0.00',
            );
            if (toMinorUnits(order.total) === 0n)
              order.paymentMethod = PaymentMethod.LOYALTY;
            if (order.paymentMethod !== PaymentMethod.PAYHERE) {
              await this.inventory.reserve(manager, order.items);
              order.stockReserved = true;
              order.status = OrderStatus.CONFIRMED;
              await manager.save(
                Payment,
                manager.create(Payment, {
                  orderId: order.id,
                  customerId,
                  method: order.paymentMethod,
                  amount: order.total,
                  currency: order.currency,
                  status:
                    order.paymentMethod === PaymentMethod.LOYALTY
                      ? PaymentStatus.SUCCESS
                      : PaymentStatus.PENDING,
                  verifiedAt:
                    order.paymentMethod === PaymentMethod.LOYALTY
                      ? new Date()
                      : null,
                }),
              );
            }
            await manager.save(Order, order);
            order.events = [
              await manager.save(
                OrderEvent,
                manager.create(OrderEvent, {
                  orderId: order.id,
                  status: order.status,
                }),
              ),
            ];
            await this.cartService.consumeCart(
              customerId,
              checkout.cartId,
              manager,
            );
            return { order, replayed: false };
          },
        );
      } catch (error: unknown) {
        const driver =
          error instanceof QueryFailedError
            ? (error.driverError as { code?: string; constraint?: string })
            : null;
        const retryable =
          driver?.code === '40001' ||
          driver?.code === '40P01' ||
          (driver?.code === '23505' &&
            driver.constraint === 'UQ_orders_customer_key');
        if (!retryable) throw error;
        // A concurrent winner may have committed after our snapshot was taken.
        // Resolve retries with a fresh read, without running checkout again.
        const existing = await this.findByKey(
          this.dataSource.manager,
          customerId,
          dto.idempotencyKey,
        );
        if (!existing)
          throw new ConflictException(
            'Cart changed during order creation. Refresh checkout and try again',
          );
        this.assertSameRequest(existing, fingerprint);
        result = { order: existing, replayed: true };
      }
      this.logger.log({
        operation: 'orders.create',
        customerId,
        orderId: result.order.id,
        outcome: result.replayed ? 'replayed' : 'created',
      });
      if (!result.replayed)
        await this.notifications.sendOrderCreatedEmail(result.order);
      return this.response(result.order);
    } catch (error: unknown) {
      const context = {
        operation: 'orders.create',
        customerId,
        outcome: 'failed',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      // Query errors may carry bound delivery data. Do not hand raw errors to
      // Nest's default logger/exception handler for this write operation.
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to create order. Please try again',
      );
    }
  }

  async findAllOwn(customerId: string): Promise<OrderResponseDto[]> {
    try {
      const orders = await this.dataSource.manager.find(Order, {
        where: { customerId },
        relations: { items: true, events: true },
        order: { createdAt: 'DESC', id: 'DESC', items: { id: 'ASC' } },
      });
      return orders.map((order) => this.response(order));
    } catch (error: unknown) {
      return this.retrievalFailure(error, 'orders.list', customerId);
    }
  }

  async findOwn(customerId: string, id: string): Promise<OrderResponseDto> {
    try {
      const order = await this.dataSource.manager.findOne(Order, {
        where: { id, customerId },
        relations: { items: true, events: true },
        order: { items: { id: 'ASC' } },
      });
      if (!order) throw new NotFoundException('Order not found');
      return this.response(order);
    } catch (error: unknown) {
      return this.retrievalFailure(error, 'orders.detail', customerId, id);
    }
  }

  async findOwnStatus(
    customerId: string,
    id: string,
  ): Promise<OrderStatusResponseDto> {
    try {
      const order = await this.dataSource.manager.findOne(Order, {
        where: { id, customerId },
        select: { id: true, status: true, updatedAt: true },
      });
      if (!order) throw new NotFoundException('Order not found');
      return { id: order.id, status: order.status, updatedAt: order.updatedAt };
    } catch (error: unknown) {
      return this.retrievalFailure(error, 'orders.status', customerId, id);
    }
  }

  async findAllForAdmin(): Promise<AdminOrderResponseDto[]> {
    try {
      const orders = await this.dataSource.manager.find(Order, {
        relations: { customer: true, items: true, events: true },
        order: { createdAt: 'DESC', id: 'DESC', items: { id: 'ASC' } },
      });
      const payments = orders.length
        ? await this.dataSource.manager
            .createQueryBuilder(Payment, 'payment')
            .where('payment.orderId IN (:...orderIds)', {
              orderIds: orders.map((order) => order.id),
            })
            .getMany()
        : [];
      const byOrder = new Map(
        payments.map((payment) => [payment.orderId, payment]),
      );
      return orders.map((order) =>
        this.adminResponse(order, byOrder.get(order.id)),
      );
    } catch (error: unknown) {
      return this.adminRetrievalFailure(error, 'orders.admin.list');
    }
  }

  async findForAdmin(id: string): Promise<AdminOrderResponseDto> {
    try {
      const order = await this.dataSource.manager.findOne(Order, {
        where: { id },
        relations: { customer: true, items: true, events: true },
        order: { items: { id: 'ASC' } },
      });
      if (!order) throw new NotFoundException('Order not found');
      const payment = await this.dataSource.manager.findOne(Payment, {
        where: { orderId: id },
      });
      return this.adminResponse(order, payment ?? undefined);
    } catch (error: unknown) {
      return this.adminRetrievalFailure(error, 'orders.admin.detail', id);
    }
  }

  async updateStatus(
    adminId: string,
    id: string,
    status: OrderStatus,
    paymentCollected = false,
  ): Promise<AdminOrderResponseDto> {
    try {
      const change = await this.dataSource.transaction(async (manager) => {
        const order = await manager.findOne(Order, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new NotFoundException('Order not found');
        const from = order.status;
        if (from !== status && !this.allowedStatuses(from).includes(status))
          throw new ConflictException(
            `Order status cannot change from ${from} to ${status}`,
          );
        if (from !== status) {
          await this.applyStatus(manager, order, status, paymentCollected);
        }
        return { previous: from, order };
      });
      this.logger.log({
        operation: 'orders.admin.status.update',
        adminId,
        orderId: id,
        previousStatus: change.previous,
        status,
        outcome: change.previous === status ? 'unchanged' : 'updated',
      });
      if (change.previous !== status)
        await this.notifications.sendOrderStatusUpdatedEmail(
          change.order,
          change.previous,
        );
      return this.findForAdmin(id);
    } catch (error: unknown) {
      const context = {
        operation: 'orders.admin.status.update',
        adminId,
        orderId: id,
        status,
        outcome: 'failed',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to update order status. Please try again',
      );
    }
  }

  async cancelOwn(customerId: string, id: string): Promise<OrderResponseDto> {
    try {
      await this.dataSource
        .transaction(async (manager) => {
          const order = await manager.findOne(Order, {
            where: { id, customerId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!order) throw new NotFoundException('Order not found');
          if (order.status === OrderStatus.CANCELLED) return;
          if (
            order.status !== OrderStatus.PENDING_PAYMENT &&
            !(
              order.status === OrderStatus.CONFIRMED &&
              order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
            )
          )
            throw new ConflictException(
              'Contact the store to cancel an order that is already being prepared',
            );
          const previous = order.status;
          await this.applyStatus(manager, order, OrderStatus.CANCELLED, false);
          return previous;
        })
        .then(async (previous) => {
          if (previous) {
            this.logger.log({
              operation: 'orders.customer.cancel',
              customerId,
              orderId: id,
            });
            const order = await this.dataSource.manager.findOneByOrFail(Order, {
              id,
            });
            await this.notifications.sendOrderStatusUpdatedEmail(
              order,
              previous,
            );
          }
        });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error({
        operation: 'orders.customer.cancel.failed',
        customerId,
        orderId: id,
      });
      throw new InternalServerErrorException(
        'Unable to cancel this order. Please try again',
      );
    }
    return this.findOwn(customerId, id);
  }

  private async applyStatus(
    manager: EntityManager,
    order: Order,
    status: OrderStatus,
    paymentCollected: boolean,
  ) {
    const payment = await manager.findOne(Payment, {
      where: { orderId: order.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (status === OrderStatus.DELIVERED) {
      if (!payment) throw new ConflictException('Order payment is unavailable');
      if (
        order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
        payment.status !== PaymentStatus.SUCCESS
      ) {
        if (!paymentCollected)
          throw new ConflictException(
            'Confirm that the cash payment was collected before completing delivery',
          );
        payment.status = PaymentStatus.SUCCESS;
        payment.verifiedAt = new Date();
        await manager.save(Payment, payment);
      }
      if (payment.status !== PaymentStatus.SUCCESS)
        throw new ConflictException(
          'A paid order is required to complete delivery',
        );
      await this.loyalty.complete(manager, order);
    }
    if (status === OrderStatus.CANCELLED) {
      await this.loyalty.refund(manager, order);
      if (order.stockReserved) {
        const items = await manager.find(OrderItem, {
          where: { orderId: order.id },
        });
        await this.inventory.release(manager, items);
        order.stockReserved = false;
      }
      if (payment && payment.status !== PaymentStatus.SUCCESS) {
        payment.status = PaymentStatus.CANCELLED;
        await manager.save(Payment, payment);
      }
    }
    order.status = status;
    await manager.save(Order, order);
    await manager.save(
      OrderEvent,
      manager.create(OrderEvent, { orderId: order.id, status }),
    );
  }

  private retrievalFailure(
    error: unknown,
    operation: string,
    customerId: string,
    orderId?: string,
  ): never {
    if (error instanceof HttpException) throw error;
    // Raw query errors can contain SQL parameters and personal data.
    this.logger.error({
      operation,
      customerId,
      orderId,
      outcome: 'failed',
      statusCode: 500,
    });
    throw new InternalServerErrorException(
      'Unable to retrieve orders. Please try again',
    );
  }

  private adminRetrievalFailure(
    error: unknown,
    operation: string,
    orderId?: string,
  ): never {
    if (error instanceof HttpException) throw error;
    this.logger.error({
      operation,
      orderId,
      outcome: 'failed',
      statusCode: 500,
    });
    throw new InternalServerErrorException(
      'Unable to retrieve orders. Please try again',
    );
  }

  private allowedStatuses(status: OrderStatus): OrderStatus[] {
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING_PAYMENT]: [OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
    };
    return transitions[status];
  }

  private findByKey(
    manager: EntityManager,
    customerId: string,
    idempotencyKey: string,
  ): Promise<Order | null> {
    return manager
      .createQueryBuilder(Order, 'order')
      .addSelect('order.requestHash')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('order.events', 'event')
      .where('order.customerId = :customerId', { customerId })
      .andWhere('order.idempotencyKey = :idempotencyKey', { idempotencyKey })
      .orderBy('item.id', 'ASC')
      .getOne();
  }
  private assertSameRequest(order: Order, fingerprint: string): void {
    if (order.requestHash !== fingerprint)
      throw new ConflictException(
        'Idempotency key has already been used with different delivery information',
      );
  }
  private fingerprint(dto: CreateOrderDto): string {
    const d = dto.delivery;
    const delivery = {
      firstName: d.firstName.trim(),
      lastName: d.lastName.trim(),
      email: d.email.trim(),
      phone: d.phone.trim(),
      addressLine1: d.addressLine1.trim(),
      addressLine2: d.addressLine2?.trim() || null,
      city: d.city.trim(),
      postalCode: d.postalCode.trim(),
      countryCode: d.countryCode.trim().toUpperCase(),
    };
    // Preserve legacy fingerprints when no new payment/loyalty choice is supplied.
    const amount = formatMinorUnits(toMinorUnits(dto.loyaltyAmount ?? '0.00'));
    const payload =
      (dto.paymentMethod ?? PaymentMethod.PAYHERE) === PaymentMethod.PAYHERE &&
      amount === '0.00'
        ? delivery
        : {
            delivery,
            paymentMethod: dto.paymentMethod ?? PaymentMethod.PAYHERE,
            loyaltyAmount: amount,
          };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
  private response(order: Order): OrderResponseDto {
    return {
      id: order.id,
      customerId: order.customerId,
      sourceCartId: order.sourceCartId,
      status: order.status,
      currency: order.currency,
      delivery: order.delivery,
      subtotal: order.subtotal,
      total: order.total,
      paymentMethod: order.paymentMethod,
      loyaltyRedeemed: order.loyaltyRedeemed,
      loyaltyEarned: order.loyaltyEarned,
      history: [...(order.events ?? [])]
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id),
        )
        .map(({ id, status, createdAt }) => ({ id, status, createdAt })),
      preparedAt: order.preparedAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: [...order.items]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.name,
          SKU: item.SKU,
          images: item.images,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
    };
  }

  private adminResponse(
    order: Order,
    payment?: Payment,
  ): AdminOrderResponseDto {
    return {
      ...this.response(order),
      customer: {
        id: order.customer.id,
        username: order.customer.username,
        email: order.customer.email,
      },
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            method: payment.method,
            amount: payment.amount,
            currency: payment.currency,
            updatedAt: payment.updatedAt,
          }
        : null,
    };
  }
}
