import { emailLayout } from './email-layout';
export function welcomeEmailTemplate(name: string) {
  return emailLayout({
    subject: 'Welcome to Appliances.lk',
    title: 'Welcome to Appliances.lk',
    name,
    message: 'Your customer account has been created successfully.',
    paragraphs: [
      'You can now browse products, place orders, track your purchases, and request appliance repairs.',
    ],
  });
}
