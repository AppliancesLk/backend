import type { PaymentNotice } from '../../types/notification.types';
import {
  accountLink,
  emailLayout,
  formatEmailMoney,
  orderReference,
} from './email-layout';
export function paymentFailedTemplate(name: string, payment: PaymentNotice) {
  return emailLayout({
    subject: `Payment unsuccessful for ${orderReference(payment.orderId)}`,
    title: 'Payment was not completed',
    name,
    message:
      'The payment provider reported that this payment attempt was unsuccessful.',
    reference: {
      value: orderReference(payment.orderId),
      detail: payment.orderId,
    },
    rows: [['Attempted amount', formatEmailMoney(payment.amount)]],
    paragraphs: [
      'Open your order to check its current status. You can retry payment while the order is awaiting payment. If your bank shows a charge, contact the store before retrying.',
    ],
    link: accountLink(`/orders/${payment.orderId}`),
    buttonText: 'Check your order',
  });
}
