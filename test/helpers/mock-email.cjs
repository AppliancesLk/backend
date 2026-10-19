function mockEmail(app, send = async () => ({ sent: true })) {
  const {
    EmailService,
  } = require('../../dist/notification/email/email.service');
  app.get(EmailService).send = send;
}
module.exports = { mockEmail };
