const { registerVerified } = require('./helpers/register-verified.cjs');
const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes } = require('node:crypto');

// Runs against the configured database; temporary accounts are always removed.
(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  configureApp(app);
  require('./helpers/mock-email.cjs').mockEmail(app);
  await app.init();
  const db = app.get(DataSource);
  const server = app.getHttpServer();
  const username = 'test_' + randomBytes(8).toString('hex');
  const password = randomBytes(20).toString('hex');
  const email = username + '@example.com';
  const origin = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    Origin: origin,
  };
  let userId;
  let checks = 0;
  const check = (condition, message) => {
    assert.ok(condition, message);
    checks++;
  };
  try {
    const preflight = await request(server)
      .options('/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-requested-with')
      .expect(204);
    check(
      preflight.headers['access-control-allow-origin'] === origin,
      'Preflight allows the configured frontend origin',
    );
    check(
      preflight.headers['access-control-allow-credentials'] === 'true',
      'Preflight allows cookie credentials',
    );
    check(
      preflight.headers['access-control-allow-headers']
        .toLowerCase()
        .includes('x-requested-with'),
      'Preflight allows the CSRF request header',
    );
    const anonymous = await request(server)
      .get('/auth/profile')
      .set('Origin', origin)
      .expect(401);
    check(
      anonymous.headers['access-control-allow-origin'] === origin &&
        anonymous.headers['access-control-allow-credentials'] === 'true',
      'Auth errors remain readable by the frontend',
    );
    const rejected = await request(server)
      .post('/auth/login')
      .set('Origin', origin)
      .send({})
      .expect(403);
    check(
      rejected.headers['access-control-allow-origin'] === origin,
      'CSRF errors retain CORS headers',
    );
    const untrusted = await request(server)
      .options('/auth/login')
      .set('Origin', 'https://attacker.example')
      .set('Access-Control-Request-Method', 'POST');
    check(
      untrusted.headers['access-control-allow-origin'] !==
        'https://attacker.example',
      'Preflight must not permit untrusted origins',
    );
    await request(server).get('/products').expect(200);
    checks++;
    await request(server).get('/categories').expect(200);
    checks++;
    await request(server).get('/auth/profile').expect(401);
    checks++;
    await request(server)
      .post('/auth/login')
      .send({ username, password })
      .expect(403);
    checks++;
    await request(server)
      .post('/auth/login')
      .set({ ...headers, Origin: 'https://attacker.example' })
      .send({ username, password })
      .expect(403);
    checks++;
    await request(server)
      .post('/auth/register')
      .set(headers)
      .send({ username, email, password, role: 'ADMIN' })
      .expect(400);
    checks++;
    const created = await registerVerified(app, {
      username: username.toUpperCase(),
      email,
      password,
    });
    userId = created.body.user.id;
    check(
      created.body.user.role === 'CUSTOMER',
      'Registration must always create customers',
    );
    check(created.body.user.username === username, 'Username normalization');
    check(
      !created.body.token &&
        !created.body.accessToken &&
        !created.body.user.passwordHash,
      'No secret exposed in JSON',
    );
    const cookieHeader = created.headers['set-cookie'][0];
    check(
      cookieHeader.includes('HttpOnly') &&
        cookieHeader.includes('SameSite=Lax') &&
        cookieHeader.includes('Path=/'),
      'Cookie protections',
    );
    const cookie = cookieHeader.split(';')[0];
    const rawToken = cookie.split('=')[1];
    const sessionRows = await db.query(
      'SELECT "tokenHash" FROM auth_sessions WHERE "userId"=$1',
      [userId],
    );
    check(
      sessionRows.length === 1 && sessionRows[0].tokenHash !== rawToken,
      'Store hashed session token',
    );
    const profile = await request(server)
      .get('/auth/profile')
      .set('Cookie', cookie)
      .expect(200);
    check(
      profile.body.id === userId && profile.body.username === username,
      'Restored session profile',
    );
    await request(server)
      .get('/auth/test/admin')
      .set('Cookie', cookie)
      .expect(403);
    checks++;
    await request(server)
      .get('/auth/test/customer')
      .set('Cookie', cookie)
      .expect(200);
    checks++;
    await request(server)
      .post('/products')
      .set(headers)
      .set('Cookie', cookie)
      .send({})
      .expect(403);
    checks++;
    await request(server)
      .post('/auth/register')
      .set(headers)
      .send({ username, email, password })
      .expect(409);
    checks++;
    await request(server)
      .post('/auth/login')
      .set(headers)
      .send({ username, password: 'incorrect-password' })
      .expect(401);
    checks++;
    const login = await request(server)
      .post('/auth/login')
      .set(headers)
      .send({ username: email, password })
      .expect(201);
    const loginCookie = login.headers['set-cookie'][0].split(';')[0];
    await db.query('UPDATE users SET role=$1 WHERE id=$2', ['ADMIN', userId]);
    await request(server)
      .get('/auth/test/admin')
      .set('Cookie', loginCookie)
      .expect(200);
    checks++;
    await db.query('UPDATE users SET role=$1 WHERE id=$2', [
      'REPAIRER',
      userId,
    ]);
    await request(server)
      .get('/auth/test/admin')
      .set('Cookie', loginCookie)
      .expect(403);
    checks++;
    await request(server)
      .get('/auth/test/repairer')
      .set('Cookie', loginCookie)
      .expect(200);
    checks++;
    const logout = await request(server)
      .post('/auth/logout')
      .set(headers)
      .set('Cookie', loginCookie)
      .expect(201);
    check(
      logout.headers['set-cookie'][0].includes('Expires=Thu, 01 Jan 1970'),
      'Cookie cleared',
    );
    await request(server)
      .get('/auth/profile')
      .set('Cookie', loginCookie)
      .expect(401);
    checks++;
    await db.query('UPDATE users SET "isActive"=false WHERE id=$1', [userId]);
    await request(server)
      .get('/auth/profile')
      .set('Cookie', cookie)
      .expect(401);
    checks++;
    await request(server)
      .post('/auth/login')
      .set(headers)
      .send({ username, password })
      .expect(401);
    checks++;
    await db.query('UPDATE users SET "isActive"=true WHERE id=$1', [userId]);
    const fresh = await request(server)
      .post('/auth/login')
      .set(headers)
      .send({ username, password })
      .expect(201);
    await db.query(
      'UPDATE auth_sessions SET "expiresAt"=now() - interval \'1 minute\' WHERE "userId"=$1',
      [userId],
    );
    await request(server)
      .get('/auth/profile')
      .set('Cookie', fresh.headers['set-cookie'][0].split(';')[0])
      .expect(401);
    checks++;
    console.log(`PASS: ${checks} authentication/security checks`);
  } finally {
    await db.query('DELETE FROM users WHERE email=$1', [email]);
    await app.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
