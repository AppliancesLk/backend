/**
 * PaymentsService Unit Tests
 *
 * Test Case IDs: TC-PAY-U-001 through TC-PAY-U-025
 *
 * These tests verify payment operations including:
 * - Payment initiation with PayHere
 * - PayHere notification handling
 * - Payment retrieval
 * - Hash verification
 * - Status mapping
 * - Error handling and logging
 */

import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { PaymentsService } from './payments.service';
import { Payment } from '../entities/payment.entity';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { Order } from '../../orders/entities/order.entity';
import { OrderStatus } from '../../orders/enums/order-status.enum';
import { NotificationService } from '../../notification/notification.service';
import { OrderInventoryService } from '../../products/services/order-inventory.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let dataSource: {
    manager: {
      findOne: jest.Mock;
    };
    transaction: jest.Mock;
  };
  let notifications: {
    sendPaymentSuccessEmail: jest.Mock;
    sendPaymentFailedEmail: jest.Mock;
  };
  let inventory: {
    reserve: jest.Mock;
  };
  let log: jest.Mock;
  let warn: jest.Mock;
  let errorLog: jest.Mock;

  const order: Order = Object.assign(new Order(), {
    id: 'order-id',
    customerId: 'customer-id',
    status: OrderStatus.PENDING_PAYMENT,
    paymentMethod: PaymentMethod.PAYHERE,
    total: '5000.00',
    currency: 'LKR',
    delivery: {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '+94771234567',
      addressLine1: '123 Main St',
      addressLine2: '',
      city: 'Colombo',
      countryCode: 'LK',
    },
  });

  const payment: Payment = Object.assign(new Payment(), {
    id: 'payment-id',
    orderId: 'order-id',
    customerId: 'customer-id',
    method: PaymentMethod.PAYHERE,
    amount: '5000.00',
    currency: 'LKR',
    status: PaymentStatus.PENDING,
    payherePaymentId: null,
    providerStatusCode: null,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const md5 = (value: string): string =>
    createHash('md5').update(value).digest('hex').toUpperCase();

  beforeEach(() => {
    jest.resetAllMocks();

    // Set required env vars
    process.env.PAYHERE_MERCHANT_ID = 'test-merchant';
    process.env.PAYHERE_MERCHANT_SECRET = 'test-secret';
    process.env.PAYHERE_MODE = 'sandbox';

    dataSource = {
      manager: {
        findOne: jest.fn(),
      },
      transaction: jest.fn(),
    };

    notifications = {
      sendPaymentSuccessEmail: jest.fn().mockResolvedValue({}),
      sendPaymentFailedEmail: jest.fn().mockResolvedValue({}),
    };

    inventory = {
      reserve: jest.fn().mockResolvedValue(undefined),
    };

    log = jest.fn();
    warn = jest.fn();
    errorLog = jest.fn();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(log);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(warn);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(errorLog);

    service = new PaymentsService(
      dataSource as unknown as DataSource,
      notifications as unknown as NotificationService,
      inventory as unknown as OrderInventoryService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.PAYHERE_MERCHANT_ID;
    delete process.env.PAYHERE_MERCHANT_SECRET;
    delete process.env.PAYHERE_MODE;
  });

  describe('initiate', () => {
    // TC-PAY-U-001
    it('should create payment initiation for valid order', async () => {
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(order)
          .mockResolvedValueOnce(null), // no existing payment
        create: jest.fn().mockReturnValue({ ...payment, order }),
        save: jest.fn().mockResolvedValue({ ...payment, order }),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      const result = await service.initiate(
        'customer-id',
        { orderId: 'order-id' },
        'https://api.example.com',
      );

      expect(result).toHaveProperty('payment');
      expect(result).toHaveProperty('gatewayUrl');
      expect(result).toHaveProperty('paymentData');
      expect(result.gatewayUrl).toContain('sandbox.payhere.lk');
      expect(result.paymentData.merchant_id).toBe('test-merchant');
    });

    // TC-PAY-U-002
    it('should throw NotFoundException when order not found', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      await expect(
        service.initiate('customer-id', { orderId: 'missing' }, 'https://api.example.com'),
      ).rejects.toThrow(NotFoundException);
    });

    // TC-PAY-U-003
    it('should throw ConflictException when order not pending payment', async () => {
      const confirmedOrder = { ...order, status: OrderStatus.CONFIRMED };
      const manager = {
        findOne: jest.fn().mockResolvedValue(confirmedOrder),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      await expect(
        service.initiate('customer-id', { orderId: 'order-id' }, 'https://api.example.com'),
      ).rejects.toThrow(ConflictException);
    });

    // TC-PAY-U-004
    it('should throw ConflictException when order already paid', async () => {
      const paidPayment = { ...payment, status: PaymentStatus.SUCCESS };
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(order)
          .mockResolvedValueOnce(paidPayment),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      await expect(
        service.initiate('customer-id', { orderId: 'order-id' }, 'https://api.example.com'),
      ).rejects.toThrow('already been paid');
    });

    // TC-PAY-U-005
    it('should throw ConflictException when order total is zero', async () => {
      const zeroOrder = { ...order, total: '0.00' };
      const manager = {
        findOne: jest.fn().mockResolvedValue(zeroOrder),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      await expect(
        service.initiate('customer-id', { orderId: 'order-id' }, 'https://api.example.com'),
      ).rejects.toThrow('not valid for payment');
    });

    // TC-PAY-U-006
    it('should update existing pending payment', async () => {
      const existingPayment = { ...payment };
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(order)
          .mockResolvedValueOnce(existingPayment),
        save: jest.fn().mockResolvedValue({ ...existingPayment, order }),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      await service.initiate('customer-id', { orderId: 'order-id' }, 'https://api.example.com');

      expect(manager.save).toHaveBeenCalled();
    });

    // TC-PAY-U-007
    it('should throw InternalServerErrorException when PayHere not configured', async () => {
      delete process.env.PAYHERE_MERCHANT_ID;

      await expect(
        service.initiate('customer-id', { orderId: 'order-id' }, 'https://api.example.com'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('handleNotification', () => {
    const validNotification = {
      merchant_id: 'test-merchant',
      order_id: 'order-id',
      payment_id: 'payhere-123',
      payhere_amount: '5000.00',
      payhere_currency: 'LKR',
      status_code: '2', // SUCCESS
      md5sig: '', // Will be calculated
    };

    beforeEach(() => {
      // Calculate valid md5sig
      const secretHash = md5('test-secret');
      validNotification.md5sig = md5(
        validNotification.merchant_id +
          validNotification.order_id +
          validNotification.payhere_amount +
          validNotification.payhere_currency +
          validNotification.status_code +
          secretHash,
      );
    });

    // TC-PAY-U-008
    it('should process valid successful payment notification', async () => {
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(order)
          .mockResolvedValueOnce(payment),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, data) => data),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      const result = await service.handleNotification(validNotification);

      expect(result).toEqual({ received: true, duplicate: false });
      expect(notifications.sendPaymentSuccessEmail).toHaveBeenCalled();
    });

    // TC-PAY-U-009
    it('should reject notification with invalid merchant ID', async () => {
      const invalidNotification = { ...validNotification, merchant_id: 'wrong-merchant' };

      await expect(
        service.handleNotification(invalidNotification),
      ).rejects.toThrow(BadRequestException);
    });

    // TC-PAY-U-010
    it('should reject notification with invalid signature', async () => {
      const invalidNotification = { ...validNotification, md5sig: 'invalid-hash' };

      await expect(
        service.handleNotification(invalidNotification),
      ).rejects.toThrow('Invalid payment notification');
    });

    // TC-PAY-U-011
    it('should throw NotFoundException when order not found', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      await expect(
        service.handleNotification(validNotification),
      ).rejects.toThrow(NotFoundException);
    });

    // TC-PAY-U-012
    it('should return duplicate for already successful payment', async () => {
      const successfulPayment = {
        ...payment,
        status: PaymentStatus.SUCCESS,
        payherePaymentId: 'payhere-123',
      };
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(order)
          .mockResolvedValueOnce(successfulPayment),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      const result = await service.handleNotification(validNotification);

      expect(result).toEqual({ received: true, duplicate: true });
      expect(notifications.sendPaymentSuccessEmail).not.toHaveBeenCalled();
    });

    // TC-PAY-U-013
    it('should reject notification with mismatched amount', async () => {
      const mismatchedNotification = { ...validNotification, payhere_amount: '1000.00' };
      // Recalculate hash with wrong amount
      const secretHash = md5('test-secret');
      mismatchedNotification.md5sig = md5(
        mismatchedNotification.merchant_id +
          mismatchedNotification.order_id +
          mismatchedNotification.payhere_amount +
          mismatchedNotification.payhere_currency +
          mismatchedNotification.status_code +
          secretHash,
      );

      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(order)
          .mockResolvedValueOnce(payment),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      await expect(
        service.handleNotification(mismatchedNotification),
      ).rejects.toThrow('Invalid payment notification');
    });

    // TC-PAY-U-014
    it('should handle failed payment status', async () => {
      const failedNotification = { ...validNotification, status_code: '-2' };
      // Recalculate hash
      const secretHash = md5('test-secret');
      failedNotification.md5sig = md5(
        failedNotification.merchant_id +
          failedNotification.order_id +
          failedNotification.payhere_amount +
          failedNotification.payhere_currency +
          failedNotification.status_code +
          secretHash,
      );

      // Fresh pending order and payment
      const pendingOrder = {
        ...order,
        status: OrderStatus.PENDING_PAYMENT,
        paymentMethod: PaymentMethod.PAYHERE,
      };
      const pendingPayment = {
        ...payment,
        status: PaymentStatus.PENDING,
        payherePaymentId: null,
      };
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(pendingOrder)
          .mockResolvedValueOnce(pendingPayment),
        save: jest.fn().mockResolvedValue({}),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      const result = await service.handleNotification(failedNotification);

      expect(result).toEqual({ received: true, duplicate: false });
      expect(notifications.sendPaymentFailedEmail).toHaveBeenCalled();
    });

    // TC-PAY-U-015
    it('should handle cancelled payment status', async () => {
      const cancelledNotification = { ...validNotification, status_code: '-1' };
      const secretHash = md5('test-secret');
      cancelledNotification.md5sig = md5(
        cancelledNotification.merchant_id +
          cancelledNotification.order_id +
          cancelledNotification.payhere_amount +
          cancelledNotification.payhere_currency +
          cancelledNotification.status_code +
          secretHash,
      );

      // Fresh pending order and payment
      const pendingOrder = {
        ...order,
        status: OrderStatus.PENDING_PAYMENT,
        paymentMethod: PaymentMethod.PAYHERE,
      };
      const pendingPayment = {
        ...payment,
        status: PaymentStatus.PENDING,
        payherePaymentId: null,
      };
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(pendingOrder)
          .mockResolvedValueOnce(pendingPayment),
        save: jest.fn().mockResolvedValue({}),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      const result = await service.handleNotification(cancelledNotification);

      // Payment should be saved with CANCELLED status
      expect(result).toEqual({ received: true, duplicate: false });
      expect(manager.save).toHaveBeenCalled();
    });

    // TC-PAY-U-016
    it('should reserve inventory on successful payment', async () => {
      const items = [{ productId: 'product-1', quantity: 2 }];
      // Fresh pending order and payment for this test
      const pendingOrder = {
        ...order,
        status: OrderStatus.PENDING_PAYMENT,
        paymentMethod: PaymentMethod.PAYHERE,
      };
      const pendingPayment = {
        ...payment,
        status: PaymentStatus.PENDING,
        payherePaymentId: null,
      };
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(pendingOrder)
          .mockResolvedValueOnce(pendingPayment),
        find: jest.fn().mockResolvedValue(items),
        save: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation((_, data) => data),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      await service.handleNotification(validNotification);

      expect(inventory.reserve).toHaveBeenCalledWith(expect.anything(), items);
    });

    // TC-PAY-U-017
    it('should reject notification when order not using PayHere', async () => {
      const codOrder = { ...order, paymentMethod: PaymentMethod.CASH_ON_DELIVERY };
      const manager = {
        findOne: jest.fn().mockResolvedValue(codOrder),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      await expect(
        service.handleNotification(validNotification),
      ).rejects.toThrow('does not use PayHere');
    });
  });

  describe('findOwn', () => {
    // TC-PAY-U-018
    it('should return payment for valid order and customer', async () => {
      const pendingPayment = { ...payment, status: PaymentStatus.PENDING };
      dataSource.manager.findOne.mockResolvedValue(pendingPayment);

      const result = await service.findOwn('customer-id', 'order-id');

      expect(result).toHaveProperty('id', 'payment-id');
      expect(result).toHaveProperty('status', 'PENDING');
    });

    // TC-PAY-U-019
    it('should throw NotFoundException when payment not found', async () => {
      dataSource.manager.findOne.mockResolvedValue(null);

      await expect(
        service.findOwn('customer-id', 'missing-order'),
      ).rejects.toThrow(NotFoundException);
    });

    // TC-PAY-U-020
    it('should scope query to customer ID', async () => {
      dataSource.manager.findOne.mockResolvedValue(payment);

      await service.findOwn('customer-id', 'order-id');

      expect(dataSource.manager.findOne).toHaveBeenCalledWith(Payment, {
        where: { orderId: 'order-id', customerId: 'customer-id' },
      });
    });
  });

  describe('configuration', () => {
    // TC-PAY-U-021
    it('should throw when merchant ID is missing', async () => {
      delete process.env.PAYHERE_MERCHANT_ID;

      await expect(
        service.initiate('customer-id', { orderId: 'order-id' }, 'https://api.example.com'),
      ).rejects.toThrow('not configured');
    });

    // TC-PAY-U-022
    it('should throw when merchant secret is missing', async () => {
      delete process.env.PAYHERE_MERCHANT_SECRET;

      await expect(
        service.initiate('customer-id', { orderId: 'order-id' }, 'https://api.example.com'),
      ).rejects.toThrow('not configured');
    });

    // TC-PAY-U-023
    it('should use live URL when mode is live', async () => {
      process.env.PAYHERE_MODE = 'live';

      const pendingOrder = {
        ...order,
        status: OrderStatus.PENDING_PAYMENT,
        paymentMethod: PaymentMethod.PAYHERE,
      };
      const manager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(pendingOrder)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockReturnValue({ ...payment, order: pendingOrder }),
        save: jest.fn().mockResolvedValue({ ...payment, order: pendingOrder }),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      const result = await service.initiate(
        'customer-id',
        { orderId: 'order-id' },
        'https://api.example.com',
      );

      expect(result.gatewayUrl).toContain('www.payhere.lk');
      expect(result.paymentData.sandbox).toBe(false);
    });
  });

  describe('error handling', () => {
    // TC-PAY-U-024
    it('should log safe context on failure', async () => {
      const manager = {
        findOne: jest.fn().mockRejectedValue(new Error('private db error')),
      };
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager as unknown as EntityManager),
      );

      await expect(
        service.initiate('customer-id', { orderId: 'order-id' }, 'https://api.example.com'),
      ).rejects.toThrow(InternalServerErrorException);

      expect(errorLog).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'payments.initiate',
          statusCode: 500,
        }),
      );
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('private db error');
    });

    // TC-PAY-U-025
    it('should wrap unknown errors in InternalServerErrorException', async () => {
      dataSource.manager.findOne.mockRejectedValue(new Error('unexpected'));

      await expect(
        service.findOwn('customer-id', 'order-id'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
