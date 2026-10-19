import type { PaymentNotice } from '../../types/notification.types';
import { accountLink, emailLayout } from './email-layout';
export function paymentFailedTemplate(name: string, payment: PaymentNotice) {
  return emailLayout({
    subject: `Payment unsuccessful for order #${payment.orderId}`,
    title: 'Payment was not completed',
    name,
    message:
      'The payment provider reported that this payment attempt was unsuccessful.',
    rows: [
      ['Order reference', payment.orderId],
      ['Attempted amount', `LKR ${payment.amount}`],
    ],
    paragraphs: [
      'Open your order to check its current status. You can retry payment while the order is awaiting payment. If your bank shows a charge, contact the store before retrying.',
    ],
    link: accountLink(`/orders/${payment.orderId}`),
    buttonText: 'Check your order',
  });
}
