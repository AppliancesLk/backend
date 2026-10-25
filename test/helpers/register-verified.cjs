// Existing feature fixtures use the same verification and login endpoints as customers.
const request = require('supertest');
const { getMessages } = require('./mock-email.cjs');
async function registerVerified(app, draft) {
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const server = app.getHttpServer();
  const registered = await request(server)
    .post('/auth/register')
    .set(headers)
    .send(draft)
    .expect(201);
  if (!registered.body.requiresVerification || registered.body.user)
    throw new Error('Registration must require email verification');
  const mail = getMessages(app).findLast(
    (message) =>
      message.to === draft.email.toLowerCase() &&
      message.subject.includes('Verify your'),
  );
  const token = mail?.text.match(/#token=([a-f0-9]{64})/)?.[1];
  if (!token)
    throw new Error('Verification email was not captured by the SMTP mock');
  await request(server)
    .post('/auth/verify-email')
    .set(headers)
    .send({ token })
    .expect(201);
  return request(server)
    .post('/auth/login')
    .set(headers)
    .send({ username: draft.email, password: draft.password })
    .expect(201);
}
module.exports = { registerVerified };
