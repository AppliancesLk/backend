import type { Order } from '../../../orders/entities/order.entity';
import {
  accountLink,
  emailLayout,
  formatEmailDate,
  statusLabel,
} from './email-layout';
export function orderCreatedTemplate(name: string, order: Order) {
  const d = order.delivery;
  return emailLayout({
    subject: `Your Appliances.lk order has been placed – #${order.id}`,
    title: 'Your order has been placed',
    name,
    message:
      'We have received your order. Payment is still required before it is confirmed.',
    rows: [
      ['Order reference', order.id],
      ['Order date', formatEmailDate(order.createdAt)],
      ['Status', statusLabel(order.status)],
      ...order.items.map((item): [string, string] => [
        item.name,
        `${item.quantity} × LKR ${item.unitPrice} = LKR ${item.lineTotal}`,
      ]),
      ['Total', `LKR ${order.total}`],
      [
        'Delivery to',
        `${d.firstName} ${d.lastName}\n${[d.addressLine1, d.addressLine2, d.city, d.postalCode, d.countryCode].filter(Boolean).join(', ')}`,
      ],
    ],
    link: accountLink(`/orders/${order.id}`),
    buttonText: 'View your order',
  });
}
