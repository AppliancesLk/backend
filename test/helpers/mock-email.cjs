const mailboxes = new WeakMap();
function mockEmail(app, send = async () => ({ sent: true })) {
  const {
    EmailService,
  } = require('../../dist/notification/email/email.service');
  const messages = [];
  mailboxes.set(app, messages);
  app.get(EmailService).send = async (message) => {
    messages.push(message);
    return send(message);
  };
}
function getMessages(app) {
  return mailboxes.get(app) ?? [];
}
module.exports = { mockEmail, getMessages };
