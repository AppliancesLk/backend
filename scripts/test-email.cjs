require('dotenv/config');
const { EmailService } = require('../dist/notification/email/email.service');
const {
  welcomeEmailTemplate,
} = require('../dist/notification/email/templates/welcome-email.template');

(async () => {
  // Local-only script: send only to the configured SMTP account, never a public endpoint.
  if (process.env.NODE_ENV === 'production')
    throw new Error('Run this local test outside production.');
  const to = process.env.EMAIL_USER?.trim();
  if (!to || !process.env.EMAIL_APP_PASSWORD?.trim())
    throw new Error(
      'Fill EMAIL_USER and EMAIL_APP_PASSWORD in backend/.env first.',
    );
  const email = new EmailService();
  try {
    const template = welcomeEmailTemplate('Email test');
    const result = await email.send({
      to,
      ...template,
      subject: 'Appliances.lk — Gmail SMTP test',
    });
    if (!result.sent)
      throw new Error(
        'SMTP did not accept the test email. Check the safe email.failed reason in the log.',
      );
    console.log(
      'Gmail accepted the test email for EMAIL_USER. Check your inbox and spam folder.',
    );
  } finally {
    email.onModuleDestroy();
  }
})().catch((error) => {
  // Only locally authored errors reach this handler; EmailService sanitizes SMTP failures.
  console.error(error.message);
  process.exitCode = 1;
});
