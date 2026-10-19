import { emailLayout, formatEmailDate } from './email-layout';
export function loginNotificationTemplate(name: string, date: Date) {
  return emailLayout({
    subject: 'New login to your Appliances.lk account',
    title: 'Successful account login',
    name,
    message: 'A successful login was detected on your Appliances.lk account.',
    rows: [['Login time', formatEmailDate(date)]],
    paragraphs: [
      'If this was not you, contact the store for assistance securing your Appliances.lk account.',
    ],
  });
}
