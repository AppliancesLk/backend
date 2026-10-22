import { Logger } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import { Notification } from './entities/notification.entity';
import { UsersService } from '../users/services/users.service';
import { EmailService } from './email/email.service';
import { Order } from '../orders/entities/order.entity';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { RepairStatus } from '../repairs/enums/repair-status.enum';
import type { PaymentNotice, RepairNotice } from './types/notification.types';
import { escapeHtml, safeEmailLink } from './email/templates/email-layout';
import { promotionTemplate } from './email/templates/promotion.template';

describe('Business notifications', () => {
  const history = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
    update: jest.fn(),
  };
  const users = { findById: jest.fn() };
  const email = { send: jest.fn() };
  let service: NotificationService;
  const repair: RepairNotice = {
    id: 'repair',
    customerId: 'user',
    reference: 'RPR-20261019-ABCDEF12',
    device: { deviceType: 'Washer', brand: 'Samsung', model: '8 kg' },
    problemDescription: '<script>bad()</script>',
    status: RepairStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const payment: PaymentNotice = {
    id: 'payment',
    orderId: 'order',
    customerId: 'user',
    amount: '1234.50',
    currency: 'LKR',
    payherePaymentId: 'provider-reference',
    status: PaymentStatus.SUCCESS,
  };
  const order = Object.assign(new Order(), {
    id: 'order',
    customerId: 'user',
    status: OrderStatus.PENDING_PAYMENT,
    total: '1234.50',
    createdAt: new Date(),
    updatedAt: new Date(),
    delivery: {
      firstName: 'Buyer',
      lastName: 'Name',
      email: 'untrusted-delivery@example.com',
      addressLine1: 'Address',
      city: 'Colombo',
      postalCode: '00100',
      countryCode: 'LK',
    },
    items: [
      {
        name: '<img onerror=bad()>',
        SKU: 'AP-001',
        images: ['https://images.example.com/product.jpg'],
        quantity: 1,
        unitPrice: '1234.50',
        lineTotal: '1234.50',
      },
    ],
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    users.findById.mockResolvedValue({
      isActive: true,
      emailVerifiedAt: new Date(),
      deactivatedAt: null,
      username: '<User>',
      email: 'account@example.com',
    });
    history.save.mockResolvedValue({ id: 'notification' });
    history.update.mockResolvedValue({ affected: 1 });
    email.send.mockResolvedValue({ sent: true });
    service = new NotificationService(
      history as unknown as Repository<Notification>,
      users as unknown as UsersService,
      email as unknown as EmailService,
    );
  });
  afterEach(() => jest.restoreAllMocks());
  it('uses the backend account recipient and persists an attempt followed by SENT', async () => {
    await service.sendOrderCreatedEmail(order);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'account@example.com',
        text: expect.stringContaining('LKR 1,234.50'),
      }),
    );
    expect(history.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING',
        type: 'ORDER_CREATED',
        recipient: 'account@example.com',
      }),
    );
    expect(history.update).toHaveBeenCalledWith(
      'notification',
      expect.objectContaining({ status: 'SENT', sentAt: expect.any(Date) }),
    );
    expect(email.send.mock.calls[0][0].html).not.toContain('<img onerror');
    expect(email.send.mock.calls[0][0].html).toContain(
      'https://images.example.com/product.jpg',
    );
  });
  it('suppresses the same order status without creating or sending anything', async () => {
    expect(
      (
        await service.sendOrderStatusUpdatedEmail(
          order,
          OrderStatus.PENDING_PAYMENT,
        )
      ).status,
    ).toBe('DUPLICATE');
    expect(email.send).not.toHaveBeenCalled();
  });
  it('claims an event once using the named unique constraint', async () => {
    history.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], {
        code: '23505',
        constraint: 'UQ_notifications_event_key',
      }),
    );
    expect((await service.sendWelcomeEmail('user')).status).toBe('DUPLICATE');
    expect(email.send).not.toHaveBeenCalled();
  });
  it('catches SMTP exceptions and records failure without rejecting the caller', async () => {
    email.send.mockRejectedValue(
      new Error('EMAIL_APP_PASSWORD must not escape'),
    );
    expect((await service.sendWelcomeEmail('user')).status).toBe('FAILED');
    expect(history.update).toHaveBeenCalledWith(
      'notification',
      expect.objectContaining({ status: 'FAILED', failedAt: expect.any(Date) }),
    );
  });
  it('also contains account/history database failures', async () => {
    users.findById.mockRejectedValue(new Error('private SQL'));
    await expect(service.sendLoginNotification('user')).resolves.toMatchObject({
      status: 'FAILED',
    });
    expect(email.send).not.toHaveBeenCalled();
  });
  it('does not label an accepted email as an SMTP failure when the history update fails', async () => {
    history.update.mockRejectedValueOnce(
      new Error('database unavailable after SMTP acceptance'),
    );
    expect(await service.sendWelcomeEmail('user')).toMatchObject({
      status: 'SENT',
    });
    expect(history.update).toHaveBeenCalledTimes(1);
  });
  it('sends a dedicated ready email instead of the generic repair template', async () => {
    await service.sendRepairStatusUpdatedEmail({
      ...repair,
      status: RepairStatus.READY_FOR_COLLECTION,
    });
    expect(history.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REPAIR_READY_FOR_COLLECTION' }),
    );
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0].subject).toBe(
      'Your device is ready for collection',
    );
  });
  it('requires a verified success/failed state before payment templates are sent', async () => {
    await service.sendPaymentSuccessEmail({
      ...payment,
      status: PaymentStatus.PENDING,
    });
    await service.sendPaymentFailedEmail({
      ...payment,
      status: PaymentStatus.CANCELLED,
    });
    expect(email.send).not.toHaveBeenCalled();
    await service.sendPaymentSuccessEmail(payment);
    await service.sendPaymentFailedEmail({
      ...payment,
      status: PaymentStatus.FAILED,
    });
    expect(email.send).toHaveBeenCalledTimes(2);
  });
  it('uses separate failure keys per provider payment attempt', async () => {
    await service.sendPaymentFailedEmail({
      ...payment,
      status: PaymentStatus.FAILED,
    });
    await service.sendPaymentFailedEmail({
      ...payment,
      status: PaymentStatus.FAILED,
      payherePaymentId: 'second-attempt',
    });
    expect(history.create.mock.calls[0][0].eventKey).not.toBe(
      history.create.mock.calls[1][0].eventKey,
    );
  });
  it('renders all twelve notification types without raw HTML or invented collection details', async () => {
    await service.sendWelcomeEmail('user');
    await service.sendLoginNotification('user');
    await service.sendOrderCreatedEmail(order);
    await service.sendPaymentSuccessEmail(payment);
    await service.sendPaymentFailedEmail({
      ...payment,
      status: PaymentStatus.FAILED,
    });
    await service.sendOrderStatusUpdatedEmail(
      {
        id: order.id,
        customerId: order.customerId,
        updatedAt: order.updatedAt,
        status: OrderStatus.PROCESSING,
      },
      OrderStatus.CONFIRMED,
    );
    await service.sendRepairRequestCreatedEmail(repair);
    await service.sendRepairApprovedEmail({
      ...repair,
      status: RepairStatus.APPROVED,
    });
    await service.sendRepairRejectedEmail({
      ...repair,
      status: RepairStatus.REJECTED,
    });
    await service.sendRepairStatusUpdatedEmail({
      ...repair,
      status: RepairStatus.IN_PROGRESS,
    });
    await service.sendRepairReadyForCollectionEmail({
      ...repair,
      status: RepairStatus.READY_FOR_COLLECTION,
    });
    await service.sendPromotionEmail('user', {
      title: 'Sale',
      description: '<script>bad()</script>',
      productName: 'Washer',
      message: 'Offer',
      link: 'https://appliances.example/products',
      validUntil: '31 October 2026',
    });
    expect(
      new Set(history.create.mock.calls.map(([value]) => value.type)).size,
    ).toBe(12);
    for (const [message] of email.send.mock.calls) {
      expect(message.html).toContain('Appliances.lk');
      expect(message.html).not.toContain('<script>');
      expect(message.text.length).toBeGreaterThan(30);
      expect(message.html).not.toContain('<User>');
    }
  });
  it('escapes dynamic content and rejects executable or credential-bearing links', () => {
    expect(escapeHtml('<b>"&\'')).toBe('&lt;b&gt;&quot;&amp;&#39;');
    for (const link of [
      'javascript:alert(1)',
      'data:text/html,bad',
      'https://user:password@example.com',
    ])
      expect(safeEmailLink(link)).toBeUndefined();
    expect(
      promotionTemplate('Customer', {
        title: 'Sale\r\nBcc: bad',
        description: 'Offer',
        link: 'javascript:alert(1)',
      }).html,
    ).not.toContain('javascript:');
    expect(
      promotionTemplate('Customer', {
        title: 'Sale\r\nBcc: bad',
        description: 'Offer',
      }).subject,
    ).not.toContain('\r\n');
  });
});
