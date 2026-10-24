import { accountLink, emailLayout } from './email-layout';

export function accountActionTemplate(
  name: string,
  token: string,
  purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD',
) {
  const verify = purpose === 'VERIFY_EMAIL';
  return emailLayout({
    subject: verify
      ? 'Verify your Appliances.lk email'
      : 'Reset your Appliances.lk password',
    title: verify ? 'Verify your email address' : 'Choose a new password',
    name,
    message: verify
      ? 'Confirm your email address to activate your account and start shopping.'
      : 'We received a request to reset the password for your Appliances.lk account.',
    paragraphs: [
      verify
        ? 'This link expires in 24 hours and can be used once. If you did not create this account, you can ignore this email.'
        : 'This link expires in 30 minutes and can be used once. If you did not request a password reset, you can ignore this email. Your current password will remain unchanged.',
    ],
    link: accountLink(
      `/${verify ? 'verify-email' : 'reset-password'}#token=${token}`,
    ),
    buttonText: verify ? 'Verify email address' : 'Reset your password',
  });
}
