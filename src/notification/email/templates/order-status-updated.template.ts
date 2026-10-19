import { OrderStatus } from '../../../orders/enums/order-status.enum';
import type { OrderStatusNotice } from '../../types/notification.types';
import { accountLink, emailLayout, statusLabel } from './email-layout';
const messages: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Your order is awaiting payment.',
  CONFIRMED: 'Your order has been confirmed.',
  PROCESSING: 'Your order is being prepared.',
  SHIPPED: 'Your order has been marked as shipped.',
  DELIVERED:
    'Your order has been marked as delivered. Thank you for shopping with us.',
  CANCELLED:
    'Your order has been cancelled. Contact the store about any payment already made; this email does not confirm a refund.',
};
export function orderStatusUpdatedTemplate(
  name: string,
  order: OrderStatusNotice,
  previous: OrderStatus,
) {
  return emailLayout({
    subject: `Order #${order.id} is now ${statusLabel(order.status)}`,
    title: 'Order status updated',
    name,
    message: messages[order.status],
    rows: [
      ['Order reference', order.id],
      ['Previous status', statusLabel(previous)],
      ['New status', statusLabel(order.status)],
    ],
    link: accountLink(`/orders/${order.id}`),
    buttonText: 'View your order',
  });
}
