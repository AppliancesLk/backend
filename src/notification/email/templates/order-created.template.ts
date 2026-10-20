import type { Order } from '../../../orders/entities/order.entity';
import {
  accountLink,
  emailLayout,
  formatEmailDate,
  orderReference,
  statusLabel,
} from './email-layout';
export function orderCreatedTemplate(name: string, order: Order) {
  const d = order.delivery;
  return emailLayout({
    subject: `${orderReference(order.id)} has been placed`,
    title: 'Your order has been placed',
    name,
    message:
      'We have received your order. Payment is still required before it is confirmed.',
    reference: { value: orderReference(order.id), detail: order.id },
    rows: [
      ['Order date', formatEmailDate(order.createdAt)],
      ['Status', statusLabel(order.status)],
      [
        'Delivery to',
        `${d.firstName} ${d.lastName}\n${[d.addressLine1, d.addressLine2, d.city, d.postalCode, d.countryCode].filter(Boolean).join(', ')}`,
      ],
    ],
    items: order.items,
    total: order.total,
    link: accountLink(`/orders/${order.id}`),
    buttonText: 'View your order',
  });
}
