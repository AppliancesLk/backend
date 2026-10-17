import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
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

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly cartService: CartService,
    private readonly checkoutService: CheckoutService,
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
        relations: { items: true },
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
        relations: { items: true },
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
        relations: { customer: true, items: true },
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
      const byOrder = new Map(payments.map((payment) => [payment.orderId, payment]));
      return orders.map((order) => this.adminResponse(order, byOrder.get(order.id)));
    } catch (error: unknown) {
      return this.adminRetrievalFailure(error, 'orders.admin.list');
    }
  }

  async findForAdmin(id: string): Promise<AdminOrderResponseDto> {
    try {
      const order = await this.dataSource.manager.findOne(Order, {
        where: { id },
        relations: { customer: true, items: true },
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
  ): Promise<AdminOrderResponseDto> {
    try {
      const previous = await this.dataSource.transaction(async (manager) => {
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
          order.status = status;
          await manager.save(order);
        }
        return from;
      });
      this.logger.log({
        operation: 'orders.admin.status.update',
        adminId,
        orderId: id,
        previousStatus: previous,
        status,
        outcome: previous === status ? 'unchanged' : 'updated',
      });
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
    this.logger.error({ operation, orderId, outcome: 'failed', statusCode: 500 });
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
    return createHash('sha256').update(JSON.stringify(delivery)).digest('hex');
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
            amount: payment.amount,
            currency: payment.currency,
            updatedAt: payment.updatedAt,
          }
        : null,
    };
  }
}
