import type { PaymentNotice } from '../../types/notification.types';
import {
  accountLink,
  emailLayout,
  formatEmailMoney,
  orderReference,
} from './email-layout';
export function paymentSuccessTemplate(name: string, payment: PaymentNotice) {
  return emailLayout({
    subject: `Payment confirmed for ${orderReference(payment.orderId)}`,
    title: 'Payment confirmed',
    name,
    message: 'Your payment has been verified and your order is confirmed.',
    reference: {
      value: orderReference(payment.orderId),
      detail: payment.orderId,
    },
    rows: [
      ['Paid amount', formatEmailMoney(payment.amount)],
      ...(payment.payherePaymentId
        ? [['Payment reference', payment.payherePaymentId] as [string, string]]
        : []),
      ['Order status', 'Confirmed'],
    ],
    link: accountLink(`/orders/${payment.orderId}`),
    buttonText: 'View your order',
  });
}
