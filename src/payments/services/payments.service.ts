import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NotificationService } from '../../notification/notification.service';
import { DataSource, EntityManager, In } from 'typeorm';
import { toMinorUnits } from '../../common/utils/money';
import { Order } from '../../orders/entities/order.entity';
import { OrderItem } from '../../orders/entities/order-item.entity';
import { OrderStatus } from '../../orders/enums/order-status.enum';
import { Product } from '../../products/entities/product.entity';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { PayHereNotificationDto } from '../dto/payhere-notification.dto';
import {
  PayHereInitiationDto,
  PaymentResponseDto,
} from '../dto/payment-response.dto';
import { Payment } from '../entities/payment.entity';
import { PaymentStatus } from '../enums/payment-status.enum';

type PayHereConfig = {
  merchantId: string;
  merchantSecret: string;
  sandbox: boolean;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  async initiate(
    customerId: string,
    dto: InitiatePaymentDto,
    backendOrigin: string,
  ): Promise<PayHereInitiationDto> {
    try {
      const config = this.config();
      const payment = await this.dataSource.transaction(async (manager) => {
        const order = await manager.findOne(Order, {
          where: { id: dto.orderId, customerId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.status !== OrderStatus.PENDING_PAYMENT)
          throw new ConflictException('Order is not available for payment');
        if (toMinorUnits(order.total) <= 0n)
          throw new ConflictException('Order total is not valid for payment');

        let payment = await manager.findOne(Payment, {
          where: { orderId: order.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (payment?.status === PaymentStatus.SUCCESS)
          throw new ConflictException('Order has already been paid');
        if (!payment) {
          payment = manager.create(Payment, {
            orderId: order.id,
            customerId,
            amount: order.total,
            currency: order.currency,
            status: PaymentStatus.PENDING,
            payherePaymentId: null,
            providerStatusCode: null,
            verifiedAt: null,
          });
        } else {
          payment.amount = order.total;
          payment.currency = order.currency;
          payment.status = PaymentStatus.PENDING;
          payment.payherePaymentId = null;
          payment.providerStatusCode = null;
          payment.verifiedAt = null;
        }
        payment = await manager.save(Payment, payment);
        payment.order = order;
        return payment;
      });

      const order = payment.order;
      const delivery = order.delivery;
      const frontend = (
        process.env.FRONTEND_URL ?? 'http://localhost:5173'
      ).replace(/\/$/, '');
      const origin = backendOrigin.replace(/\/$/, '');
      const amount = this.amount(order.total);
      const paymentData = {
        sandbox: config.sandbox,
        merchant_id: config.merchantId,
        return_url: frontend + '/orders/' + order.id,
        cancel_url: frontend + '/orders/' + order.id,
        notify_url: origin + '/payments/payhere/notify',
        first_name: delivery.firstName,
        last_name: delivery.lastName,
        email: delivery.email,
        phone: delivery.phone,
        address: [delivery.addressLine1, delivery.addressLine2]
          .filter(Boolean)
          .join(', '),
        city: delivery.city,
        country: delivery.countryCode,
        order_id: order.id,
        items: 'Appliances.lk order ' + order.id,
        currency: order.currency,
        amount,
        hash: this.checkoutHash(
          config.merchantId,
          order.id,
          amount,
          order.currency,
          config.merchantSecret,
        ),
      };
      this.logger.log({
        operation: 'payments.initiate',
        customerId,
        orderId: order.id,
        paymentId: payment.id,
        outcome: 'success',
      });
      return {
        payment: this.response(payment),
        gatewayUrl: config.sandbox
          ? 'https://sandbox.payhere.lk/pay/checkout'
          : 'https://www.payhere.lk/pay/checkout',
        paymentData,
      };
    } catch (error: unknown) {
      this.logFailure('payments.initiate', error, {
        customerId,
        orderId: dto.orderId,
      });
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to initiate payment. Please try again',
      );
    }
  }

  async handleNotification(
    dto: PayHereNotificationDto,
  ): Promise<{ received: true; duplicate: boolean }> {
    const context = {
      operation: 'payments.payhere.notify',
      orderId: dto.order_id,
    };
    try {
      const config = this.config();
      if (dto.merchant_id !== config.merchantId)
        throw new BadRequestException('Invalid payment notification');
      const expected = this.notificationHash(dto, config.merchantSecret);
      if (!this.sameHash(expected, dto.md5sig))
        throw new BadRequestException('Invalid payment notification');

      const result = await this.dataSource.transaction(async (manager) => {
        const payment = await manager.findOne(Payment, {
          where: { orderId: dto.order_id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!payment) throw new NotFoundException('Payment not found');
        if (
          toMinorUnits(dto.payhere_amount) !== toMinorUnits(payment.amount) ||
          dto.payhere_currency !== payment.currency
        )
          throw new BadRequestException('Invalid payment notification');
        if (
          payment.status === PaymentStatus.SUCCESS &&
          payment.payherePaymentId !== dto.payment_id
        )
          throw new BadRequestException('Invalid payment notification');
        if (payment.status === PaymentStatus.SUCCESS)
          return { payment, duplicate: true };

        if (
          payment.status === PaymentStatus.FAILED &&
          this.providerStatus(dto.status_code) === PaymentStatus.FAILED &&
          payment.payherePaymentId === dto.payment_id
        )
          return { payment, duplicate: true };

        payment.payherePaymentId = dto.payment_id;
        payment.providerStatusCode = dto.status_code;
        payment.verifiedAt = new Date();
        const status = this.providerStatus(dto.status_code);
        if (status !== PaymentStatus.SUCCESS) {
          payment.status = status;
          await manager.save(Payment, payment);
          return { payment, duplicate: false };
        }

        const order = await manager.findOne(Order, {
          where: { id: payment.orderId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new NotFoundException('Order not found');
        const items = await manager.find(OrderItem, {
          where: { orderId: payment.orderId },
        });
        if (order.status !== OrderStatus.PENDING_PAYMENT)
          throw new ConflictException('Order is not available for payment');
        await this.deductStock(manager, items);
        payment.status = PaymentStatus.SUCCESS;
        order.status = OrderStatus.CONFIRMED;
        await manager.save(Order, order);
        await manager.save(Payment, payment);
        return { payment, duplicate: false };
      });

      if (result.duplicate) {
        this.logger.warn({
          ...context,
          paymentId: result.payment.id,
          outcome: 'duplicate',
        });
      } else {
        this.logger.log({
          ...context,
          paymentId: result.payment.id,
          paymentStatus: result.payment.status,
          outcome: 'verified',
        });
      }
      // SMTP runs only after the verified payment transaction commits.
      if (!result.duplicate && result.payment.status === PaymentStatus.SUCCESS)
        await this.notifications.sendPaymentSuccessEmail(result.payment);
      else if (!result.duplicate && result.payment.status === PaymentStatus.FAILED)
        await this.notifications.sendPaymentFailedEmail(result.payment);
      return { received: true, duplicate: result.duplicate };
    } catch (error: unknown) {
      this.logFailure('payments.payhere.notify', error, {
        orderId: dto.order_id,
      });
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to process payment notification',
      );
    }
  }

  async findOwn(
    customerId: string,
    orderId: string,
  ): Promise<PaymentResponseDto> {
    try {
      const payment = await this.dataSource.manager.findOne(Payment, {
        where: { orderId, customerId },
      });
      if (!payment) throw new NotFoundException('Payment not found');
      return this.response(payment);
    } catch (error: unknown) {
      this.logFailure('payments.read', error, { customerId, orderId });
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to retrieve payment. Please try again',
      );
    }
  }

  private async deductStock(
    manager: EntityManager,
    items: OrderItem[],
  ): Promise<void> {
    const ids = items.map((item) => item.productId);
    const products = await manager.find(Product, {
      where: { productID: In(ids) },
      relations: { category: true },
      lock: { mode: 'pessimistic_write' },
    });
    const byId = new Map(
      products.map((product) => [product.productID, product]),
    );
    for (const item of items) {
      const product = byId.get(item.productId);
      if (
        !product ||
        !product.isActive ||
        !product.category.isActive ||
        product.stockQty < item.quantity
      )
        throw new ConflictException(
          'Order inventory is no longer available for payment',
        );
      product.stockQty -= item.quantity;
    }
    await manager.save(Product, products);
  }

  private providerStatus(code: string): PaymentStatus {
    if (code === '2') return PaymentStatus.SUCCESS;
    if (code === '-1') return PaymentStatus.CANCELLED;
    if (code === '-2' || code === '-3') return PaymentStatus.FAILED;
    return PaymentStatus.PENDING;
  }

  private config(): PayHereConfig {
    const merchantId = process.env.PAYHERE_MERCHANT_ID?.trim();
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET?.trim();
    const mode = process.env.PAYHERE_MODE?.trim().toLowerCase() ?? 'sandbox';
    if (!merchantId || !merchantSecret || !['sandbox', 'live'].includes(mode))
      throw new InternalServerErrorException(
        'Payment service is not configured',
      );
    return { merchantId, merchantSecret, sandbox: mode === 'sandbox' };
  }

  private checkoutHash(
    merchantId: string,
    orderId: string,
    amount: string,
    currency: string,
    secret: string,
  ): string {
    return this.md5(
      merchantId + orderId + amount + currency + this.md5(secret),
    );
  }

  private notificationHash(
    dto: PayHereNotificationDto,
    secret: string,
  ): string {
    return this.md5(
      dto.merchant_id +
        dto.order_id +
        dto.payhere_amount +
        dto.payhere_currency +
        dto.status_code +
        this.md5(secret),
    );
  }

  private md5(value: string): string {
    return createHash('md5').update(value).digest('hex').toUpperCase();
  }

  private sameHash(expected: string, actual: string): boolean {
    const left = Buffer.from(expected.toUpperCase(), 'ascii');
    const right = Buffer.from(actual.toUpperCase(), 'ascii');
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private amount(value: string): string {
    const [whole, fraction = ''] = value.split('.');
    return whole + '.' + fraction.padEnd(2, '0');
  }

  private response(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private logFailure(
    operation: string,
    error: unknown,
    identifiers: { customerId?: string; orderId?: string },
  ): void {
    const context = {
      operation,
      ...identifiers,
      outcome: 'failed',
      statusCode: error instanceof HttpException ? error.getStatus() : 500,
    };
    if (error instanceof HttpException && error.getStatus() < 500)
      this.logger.warn(context);
    else this.logger.error(context);
  }
}
