import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { UsersService } from '../users/services/users.service';
import { OrderStatus } from '../orders/enums/order-status.enum';
import type { Order } from '../orders/entities/order.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { RepairStatus } from '../repairs/enums/repair-status.enum';
import { Notification } from './entities/notification.entity';
import { EmailService } from './email/email.service';
import type { EmailContent } from './email/email.types';
import type {
  NotificationResult,
  NotificationType,
  OrderStatusNotice,
  PaymentNotice,
  PromotionNotice,
  RelatedEntityType,
  RepairNotice,
} from './types/notification.types';
import { welcomeEmailTemplate } from './email/templates/welcome-email.template';
import { loginNotificationTemplate } from './email/templates/login-notification.template';
import { orderCreatedTemplate } from './email/templates/order-created.template';
import { paymentSuccessTemplate } from './email/templates/payment-success.template';
import { paymentFailedTemplate } from './email/templates/payment-failed.template';
import { orderStatusUpdatedTemplate } from './email/templates/order-status-updated.template';
import { repairRequestCreatedTemplate } from './email/templates/repair-request-created.template';
import { repairApprovedTemplate } from './email/templates/repair-approved.template';
import { repairRejectedTemplate } from './email/templates/repair-rejected.template';
import { repairStatusUpdatedTemplate } from './email/templates/repair-status-updated.template';
import { repairReadyForCollectionTemplate } from './email/templates/repair-ready-for-collection.template';
import { promotionTemplate } from './email/templates/promotion.template';
import { accountActionTemplate } from './email/templates/account-action.template';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  constructor(
    @InjectRepository(Notification)
    private readonly history: Repository<Notification>,
    private readonly users: UsersService,
    private readonly email: EmailService,
  ) {}

  sendWelcomeEmail(userId: string) {
    return this.deliver(
      'WELCOME',
      userId,
      `welcome:${userId}`,
      'USER',
      userId,
      welcomeEmailTemplate,
    );
  }
  sendEmailVerificationEmail(userId: string, token: string) {
    return this.deliver(
      'EMAIL_VERIFICATION',
      userId,
      `verification:${randomUUID()}`,
      'USER',
      userId,
      (name) => accountActionTemplate(name, token, 'VERIFY_EMAIL'),
    );
  }
  sendPasswordResetEmail(userId: string, token: string) {
    return this.deliver(
      'PASSWORD_RESET',
      userId,
      `password-reset:${randomUUID()}`,
      'USER',
      userId,
      (name) => accountActionTemplate(name, token, 'RESET_PASSWORD'),
    );
  }
  sendLoginNotification(userId: string, at = new Date()) {
    return this.deliver(
      'LOGIN',
      userId,
      `login:${randomUUID()}`,
      'USER',
      userId,
      (name) => loginNotificationTemplate(name, at),
    );
  }
  sendOrderCreatedEmail(order: Order) {
    return this.deliver(
      'ORDER_CREATED',
      order.customerId,
      `order-created:${order.id}`,
      'ORDER',
      order.id,
      (name) => orderCreatedTemplate(name, order),
    );
  }
  sendPaymentSuccessEmail(payment: PaymentNotice) {
    if (payment.status !== PaymentStatus.SUCCESS)
      return Promise.resolve<NotificationResult>({ status: 'FAILED' });
    return this.deliver(
      'PAYMENT_SUCCESS',
      payment.customerId,
      `payment-success:${payment.id}`,
      'PAYMENT',
      payment.id,
      (name) => paymentSuccessTemplate(name, payment),
    );
  }
  sendPaymentFailedEmail(payment: PaymentNotice) {
    if (payment.status !== PaymentStatus.FAILED)
      return Promise.resolve<NotificationResult>({ status: 'FAILED' });
    const attempt = createHash('sha256')
      .update(payment.payherePaymentId ?? 'unknown')
      .digest('hex');
    return this.deliver(
      'PAYMENT_FAILED',
      payment.customerId,
      `payment-failed:${payment.id}:${attempt}`,
      'PAYMENT',
      payment.id,
      (name) => paymentFailedTemplate(name, payment),
    );
  }
  sendOrderStatusUpdatedEmail(order: OrderStatusNotice, previous: OrderStatus) {
    if (previous === order.status)
      return Promise.resolve<NotificationResult>({ status: 'DUPLICATE' });
    return this.deliver(
      'ORDER_STATUS_UPDATED',
      order.customerId,
      `order-status:${order.id}:${order.status}`,
      'ORDER',
      order.id,
      (name) => orderStatusUpdatedTemplate(name, order, previous),
    );
  }
  sendRepairRequestCreatedEmail(repair: RepairNotice) {
    return this.repair('REPAIR_CREATED', repair, repairRequestCreatedTemplate);
  }
  sendRepairApprovedEmail(repair: RepairNotice) {
    return this.repair('REPAIR_APPROVED', repair, repairApprovedTemplate);
  }
  sendRepairRejectedEmail(repair: RepairNotice) {
    return this.repair('REPAIR_REJECTED', repair, repairRejectedTemplate);
  }
  sendRepairStatusUpdatedEmail(repair: RepairNotice) {
    if (repair.status === RepairStatus.READY_FOR_COLLECTION)
      return this.sendRepairReadyForCollectionEmail(repair);
    return this.repair(
      'REPAIR_STATUS_UPDATED',
      repair,
      repairStatusUpdatedTemplate,
      `${repair.status}:${repair.updatedAt.toISOString()}`,
    );
  }
  sendRepairReadyForCollectionEmail(repair: RepairNotice) {
    return this.repair(
      'REPAIR_READY_FOR_COLLECTION',
      repair,
      repairReadyForCollectionTemplate,
    );
  }
  sendPromotionEmail(
    userId: string,
    promotion: PromotionNotice,
    eventId = randomUUID(),
  ) {
    return this.deliver(
      'PROMOTION',
      userId,
      `promotion:${userId}:${eventId}`,
      null,
      null,
      (name) => promotionTemplate(name, promotion),
    );
  }
  private repair(
    type: NotificationType,
    repair: RepairNotice,
    template: (name: string, value: RepairNotice) => EmailContent,
    suffix = '',
  ) {
    return this.deliver(
      type,
      repair.customerId,
      `${type}:${repair.id}:${suffix}`,
      'REPAIR',
      repair.id,
      (name) => template(name, repair),
    );
  }

  private async deliver(
    type: NotificationType,
    userId: string,
    eventKey: string,
    relatedEntityType: RelatedEntityType | null,
    relatedEntityId: string | null,
    template: (name: string) => EmailContent,
  ): Promise<NotificationResult> {
    const started = Date.now();
    let id: string | undefined;
    let acceptedBySmtp = false;
    const context = { notificationType: type, userId, relatedEntityId };
    this.logger.log({ operation: 'notification.attempted', ...context });
    try {
      // Recipient always comes from the account, never the delivery form or public input.
      const user = await this.users.findById(userId);
      if (!user) throw new Error('Notification account unavailable');
      const content = template(user.username);
      try {
        const record = await this.history.save(
          this.history.create({
            userId,
            type,
            channel: 'EMAIL',
            recipient: user.email,
            subject: content.subject,
            status: 'PENDING',
            eventKey,
            relatedEntityType,
            relatedEntityId,
            sentAt: null,
            failedAt: null,
          }),
        );
        id = record.id;
      } catch (error) {
        if (
          error instanceof QueryFailedError &&
          (error.driverError as { code?: string; constraint?: string }).code ===
            '23505' &&
          (error.driverError as { constraint?: string }).constraint ===
            'UQ_notifications_event_key'
        ) {
          this.logger.log({ operation: 'notification.duplicate', ...context });
          return { status: 'DUPLICATE' };
        }
        throw error;
      }
      const result = await this.email.send({ to: user.email, ...content });
      acceptedBySmtp = result.sent;
      const status = result.sent ? 'SENT' : 'FAILED';
      await this.history.update(id, {
        status,
        sentAt: result.sent ? new Date() : null,
        failedAt: result.sent ? null : new Date(),
      });
      const log = {
        operation: 'notification.completed',
        ...context,
        notificationId: id,
        status,
        durationMs: Date.now() - started,
      };
      if (result.sent) this.logger.log(log);
      else this.logger.warn(log);
      return { status, notificationId: id };
    } catch {
      // Database/SMTP exceptions can contain personal data and credentials. Do not rethrow.
      this.logger.warn({
        operation: 'notification.failed',
        ...context,
        notificationId: id,
        durationMs: Date.now() - started,
      });
      if (id && !acceptedBySmtp) {
        try {
          await this.history.update(id, {
            status: 'FAILED',
            failedAt: new Date(),
          });
        } catch {
          this.logger.warn({
            operation: 'notification.history.failed',
            notificationId: id,
          });
        }
      }
      if (acceptedBySmtp)
        this.logger.warn({
          operation: 'notification.history.failed',
          notificationId: id,
          reason: 'accepted_email_not_recorded',
        });
      return { status: acceptedBySmtp ? 'SENT' : 'FAILED', notificationId: id };
    }
  }
}
