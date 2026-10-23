import type { Order } from '../../../orders/entities/order.entity';
import { PaymentMethod } from '../../../payments/enums/payment-method.enum';
import {
  accountLink,
  emailLayout,
  formatEmailDate,
  orderReference,
  formatEmailMoney,
  statusLabel,
} from './email-layout';
export function orderCreatedTemplate(name: string, order: Order) {
  const d = order.delivery;
  return emailLayout({
    subject: `${orderReference(order.id)} has been placed`,
    title: 'Your order has been placed',
    name,
    message:
      order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
        ? 'Your order is confirmed. Please pay the remaining amount in cash when your order is delivered.'
        : order.paymentMethod === PaymentMethod.LOYALTY
          ? 'Your order is confirmed and fully covered by your loyalty credit. No further payment is required.'
          : 'We have received your order. Payment is still required before it is confirmed.',
    reference: { value: orderReference(order.id), detail: order.id },
    rows: [
      ['Order date', formatEmailDate(order.createdAt)],
      ['Status', statusLabel(order.status)],
      [
        'Payment method',
        order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
          ? 'Cash on delivery'
          : order.paymentMethod === PaymentMethod.LOYALTY
            ? 'Loyalty credit'
            : 'PayHere',
      ],
      ...(order.loyaltyRedeemed && order.loyaltyRedeemed !== '0.00'
        ? [
            ['Subtotal', formatEmailMoney(order.subtotal)] as [string, string],
            [
              'Loyalty credit used',
              formatEmailMoney(order.loyaltyRedeemed),
            ] as [string, string],
          ]
        : []),
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
