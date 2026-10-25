import type { Order } from '../../orders/entities/order.entity';
import type { Payment } from '../../payments/entities/payment.entity';
import type { RepairTicket } from '../../repairs/entities/repair-ticket.entity';

export const NOTIFICATION_TYPES = [
  'WELCOME',
  'LOGIN',
  'ORDER_CREATED',
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'ORDER_STATUS_UPDATED',
  'REPAIR_CREATED',
  'REPAIR_APPROVED',
  'REPAIR_REJECTED',
  'REPAIR_STATUS_UPDATED',
  'REPAIR_READY_FOR_COLLECTION',
  'PROMOTION',
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';
export type RelatedEntityType = 'USER' | 'ORDER' | 'PAYMENT' | 'REPAIR';
export type OrderStatusNotice = Pick<
  Order,
  'id' | 'customerId' | 'status' | 'updatedAt'
>;
export type RepairNotice = Pick<
  RepairTicket,
  | 'id'
  | 'customerId'
  | 'reference'
  | 'device'
  | 'problemDescription'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
>;
export type PaymentNotice = Pick<
  Payment,
  | 'id'
  | 'orderId'
  | 'customerId'
  | 'amount'
  | 'currency'
  | 'payherePaymentId'
  | 'status'
>;
export interface PromotionNotice {
  subject?: string;
  preheader?: string;
  buttonText?: string;
  footerNote?: string;
  products?: { name: string; price: string; images: string[]; link?: string }[];
  title: string;
  description: string;
  productName?: string;
  message?: string;
  link?: string;
  validUntil?: string;
}
export interface NotificationResult {
  uncertain?: boolean;
  status: NotificationStatus | 'DUPLICATE' | 'SKIPPED';
  notificationId?: string;
}
