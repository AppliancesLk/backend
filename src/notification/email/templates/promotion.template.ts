import type { PromotionNotice } from '../../types/notification.types';
import { emailLayout } from './email-layout';
export function promotionTemplate(name: string, promotion: PromotionNotice) {
  return emailLayout({
    subject: promotion.subject ?? promotion.title,
    title: promotion.title,
    name,
    message: promotion.description,
    preheader: promotion.preheader,
    featuredProducts: promotion.products,
    closingNote: promotion.footerNote,
    preserveLineBreaks: true,
    rows: [
      ...(promotion.productName
        ? [['Product', promotion.productName] as [string, string]]
        : []),
      ...(promotion.validUntil
        ? [['Valid until', promotion.validUntil] as [string, string]]
        : []),
    ],
    paragraphs: promotion.message ? [promotion.message] : [],
    link: promotion.link,
    buttonText: promotion.buttonText || 'View promotion',
  });
}
