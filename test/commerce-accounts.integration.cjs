const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
process.env.PAYHERE_MERCHANT_ID = 'commerce-test-merchant';
process.env.PAYHERE_MERCHANT_SECRET = 'commerce-test-secret';
process.env.PAYHERE_MODE = 'sandbox';

(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const { mockEmail, getMessages } = require('./helpers/mock-email.cjs');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  let mailFails = false;
  mockEmail(app, async () =>
    mailFails ? { sent: false, reason: 'test_failure' } : { sent: true },
  );
  await app.init();
  const db = app.get(DataSource),
    server = app.getHttpServer();
  const suffix = randomBytes(5).toString('hex');
  const users = [],
    products = [],
    orders = [];
  let categoryId,
    checks = 0,
    operation = 'setup';
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const call = (method, path, cookie) => {
    operation = `${method.toUpperCase()} ${path}`;
    const req = request(server)[method](path).set(headers).timeout(30000);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const check = (condition, label) => {
    assert.ok(condition, label);
    checks++;
  };
  const cookie = (response) => response.headers['set-cookie'][0].split(';')[0];
  const latest = (email, subject) =>
    getMessages(app).findLast(
      (mail) => mail.to === email && mail.subject.includes(subject),
    );
  const token = (mail) => {
    const value = mail?.text.match(/#token=([a-f0-9]{64})/)?.[1];
    if (!value) throw new Error('Expected mocked account email');
    return value;
  };
  const login = (account, password = account.password) =>
    call('post', '/auth/login').send({ username: account.email, password });
  async function register(name, verify = true) {
    const draft = {
      username: `flow_${name}_${suffix}`,
      email: `flow_${name}_${suffix}@example.com`,
      password: randomBytes(12).toString('hex'),
    };
    const response = await call('post', '/auth/register')
      .send(draft)
      .expect(201);
    const row = (
      await db.query(
        'SELECT id, "isActive", "emailVerifiedAt" FROM users WHERE email=$1',
        [draft.email],
      )
    )[0];
    users.push(row.id);
    const account = {
      ...draft,
      id: row.id,
      verification: token(latest(draft.email, 'Verify your')),
    };
    check(
      response.body.requiresVerification &&
        !response.body.user &&
        !response.body.token &&
        !row.isActive &&
        !row.emailVerifiedAt,
      'registration stays inactive and does not expose a session',
    );
    if (verify) {
      await call('post', '/auth/verify-email')
        .send({ token: account.verification })
        .expect(201);
      account.cookie = cookie(await login(account).expect(201));
    }
    return account;
  }
  const delivery = {
    firstName: 'Test',
    lastName: 'Buyer',
    email: 'delivery@example.com',
    phone: '0771234567',
    addressLine1: 'Test address',
    city: 'Colombo',
    postalCode: '00100',
    countryCode: 'LK',
  };
  async function place(account, product, options = {}) {
    await call('post', '/cart/items', account.cookie)
      .send({ productId: product.productID, quantity: 1 })
      .expect(201);
    const draft = { delivery, idempotencyKey: randomUUID(), ...options };
    const response = await call('post', '/orders', account.cookie)
      .send(draft)
      .expect(201);
    orders.push(response.body.id);
    return { ...response.body, draft };
  }
  const stock = async (product) =>
    (
      await db.query('SELECT "stockQty" FROM products WHERE "productID"=$1', [
        product.productID,
      ])
    )[0].stockQty;
  const balance = async (account) =>
    (await call('get', '/loyalty', account.cookie).expect(200)).body.balance;
  const md5 = (value) =>
    createHash('md5').update(value).digest('hex').toUpperCase();
  async function callback(order, expected = 200) {
    const data = {
      merchant_id: process.env.PAYHERE_MERCHANT_ID,
      order_id: order.id,
      payment_id: `test-${order.id}`,
      payhere_amount: order.total,
      payhere_currency: 'LKR',
      status_code: '2',
    };
    data.md5sig = md5(
      data.merchant_id +
        data.order_id +
        data.payhere_amount +
        data.payhere_currency +
        data.status_code +
        md5(process.env.PAYHERE_MERCHANT_SECRET),
    );
    return call('post', '/payments/payhere/notify').send(data).expect(expected);
  }
  try {
    const admin = await register('admin'),
      buyer = await register('buyer'),
      other = await register('other');
    await db.query('UPDATE users SET role=$1 WHERE id=$2', ['ADMIN', admin.id]);
    const pending = await register('pending', false);
    await login(pending).expect(403);
    checks++;
    await call('get', '/auth/profile').expect(401);
    checks++;
    const savedToken = (
      await db.query(
        'SELECT "tokenHash", "expiresAt" FROM account_actions WHERE "userId"=$1',
        [pending.id],
      )
    )[0];
    check(
      savedToken.tokenHash !== pending.verification &&
        savedToken.tokenHash.length === 64 &&
        savedToken.expiresAt > new Date(),
      'verification tokens are hashed and expire',
    );
    const beforeResend = getMessages(app).length;
    const resend = await call('post', '/auth/resend-verification')
      .send({ email: pending.email })
      .expect(201);
    const unknownResend = await call('post', '/auth/resend-verification')
      .send({ email: 'unknown@example.com' })
      .expect(201);
    check(
      resend.body.message === unknownResend.body.message &&
        getMessages(app).length === beforeResend,
      'resend is generic and has a per-account cooldown',
    );
    await db.query(
      `UPDATE account_actions SET "expiresAt"=now()-interval '1 minute', "createdAt"=now()-interval '2 minutes' WHERE "userId"=$1`,
      [pending.id],
    );
    await call('post', '/auth/verify-email')
      .send({ token: pending.verification })
      .expect(400);
    checks++;
    await call('post', '/auth/resend-verification')
      .send({ email: pending.email })
      .expect(201);
    const replacement = token(latest(pending.email, 'Verify your'));
    check(replacement !== pending.verification, 'resending rotates the token');
    await call('post', '/auth/verify-email')
      .send({ token: pending.verification })
      .expect(400);
    checks++;
    await call('post', '/auth/verify-email')
      .send({ token: replacement })
      .expect(201);
    await call('post', '/auth/verify-email')
      .send({ token: replacement })
      .expect(400);
    checks++;
    pending.cookie = cookie(await login(pending).expect(201));

    const forgotUnknown = await call('post', '/auth/forgot-password')
      .send({ email: 'unknown@example.com' })
      .expect(201);
    const forgot = await call('post', '/auth/forgot-password')
      .send({ email: buyer.email })
      .expect(201);
    check(
      forgot.body.message === forgotUnknown.body.message,
      'password requests do not enumerate accounts',
    );
    let reset = token(latest(buyer.email, 'Reset your'));
    await call('post', '/auth/verify-email').send({ token: reset }).expect(400);
    checks++;
    const resetRow = (
      await db.query(
        `SELECT "tokenHash", "expiresAt" FROM account_actions WHERE "userId"=$1 AND purpose='RESET_PASSWORD'`,
        [buyer.id],
      )
    )[0];
    check(
      resetRow.tokenHash !== reset &&
        resetRow.expiresAt.getTime() <= Date.now() + 30 * 60000,
      'reset token is hashed and short-lived',
    );
    const expiredReset = reset;
    await db.query(
      `UPDATE account_actions SET "expiresAt"=now()-interval '1 minute', "createdAt"=now()-interval '2 minutes' WHERE "userId"=$1 AND purpose='RESET_PASSWORD'`,
      [buyer.id],
    );
    await call('post', '/auth/reset-password')
      .send({ token: reset, password: 'expired-password' })
      .expect(400);
    checks++;
    await call('post', '/auth/forgot-password')
      .send({ email: buyer.email })
      .expect(201);
    reset = token(latest(buyer.email, 'Reset your'));
    check(
      reset !== expiredReset,
      'expired password links can be replaced by a fresh request',
    );
    await call('post', '/auth/reset-password')
      .send({ token: expiredReset, password: 'expired-password' })
      .expect(400);
    checks++;
    await call('post', '/auth/reset-password')
      .send({ token: reset, password: 'short' })
      .expect(400);
    checks++;
    await call('post', '/auth/reset-password')
      .send({ token: reset, password: '密'.repeat(25) })
      .expect(400);
    checks++;
    const newPassword = randomBytes(12).toString('hex');
    await call('post', '/auth/reset-password')
      .send({ token: reset, password: newPassword })
      .expect(201);
    await call('post', '/auth/reset-password')
      .send({ token: reset, password: newPassword })
      .expect(400);
    checks++;
    await call('get', '/auth/profile', buyer.cookie).expect(401);
    checks++;
    await login(buyer).expect(401);
    checks++;
    buyer.password = newPassword;
    buyer.cookie = cookie(await login(buyer).expect(201));
    await call('post', '/auth/reset-password')
      .send({ token: 'a'.repeat(64), password: newPassword })
      .expect(400);
    checks++;

    const category = await call('post', '/categories', admin.cookie)
      .send({ name: `Commerce ${suffix}` })
      .expect(201);
    categoryId = category.body.categoryID;
    const product = (
      await call('post', '/products', admin.cookie)
        .send({
          name: `Commerce appliance ${suffix}`,
          SKU: `FLOW-${suffix}`,
          price: 100000,
          stockQty: 20,
          categoryID: categoryId,
          images: ['https://images.example.com/appliance.jpg'],
        })
        .expect(201)
    ).body;
    products.push(product.productID);
    const cod = await place(buyer, product, {
      paymentMethod: 'CASH_ON_DELIVERY',
    });
    check(
      cod.status === 'CONFIRMED' &&
        cod.paymentMethod === 'CASH_ON_DELIVERY' &&
        cod.history.length === 1 &&
        (await stock(product)) === 19,
      'COD confirms, records tracking and reserves stock immediately',
    );
    await callback(cod, 409);
    checks++;
    const confirmation = getMessages(app).findLast((mail) =>
      mail.text.includes(cod.id),
    );
    check(
      confirmation.text.includes('cash') &&
        confirmation.html.includes('https://images.example.com/appliance.jpg'),
      'COD email has correct payment instructions and product image',
    );
    await call('post', '/orders', buyer.cookie).send(cod.draft).expect(201);
    check(
      (await stock(product)) === 19,
      'idempotent COD retry does not reserve stock twice',
    );
    await call('post', '/orders', buyer.cookie)
      .send({ ...cod.draft, paymentMethod: 'PAYHERE' })
      .expect(409);
    checks++;
    await call('post', '/payments/initiate', buyer.cookie)
      .send({ orderId: cod.id })
      .expect(409);
    checks++;
    await call('get', `/orders/${cod.id}`, other.cookie).expect(404);
    checks++;
    await call('get', '/admin/users', buyer.cookie).expect(403);
    checks++;
    await call('patch', `/admin/orders/${cod.id}/status`, admin.cookie)
      .send({ status: 'DELIVERED', paymentCollected: true })
      .expect(409);
    checks++;
    async function advance(order, complete = true) {
      for (const status of ['PROCESSING', 'SHIPPED'])
        await call('patch', `/admin/orders/${order.id}/status`, admin.cookie)
          .send({ status })
          .expect(200);
      if (complete)
        return (
          await call('patch', `/admin/orders/${order.id}/status`, admin.cookie)
            .send({ status: 'DELIVERED', paymentCollected: true })
            .expect(200)
        ).body;
    }
    await advance(cod, false);
    await call('patch', `/admin/orders/${cod.id}/status`, admin.cookie)
      .send({ status: 'DELIVERED' })
      .expect(409);
    checks++;
    check(
      (await balance(buyer)) === '0.00',
      'loyalty is not earned before delivery and payment collection',
    );
    const delivered = (
      await call('patch', `/admin/orders/${cod.id}/status`, admin.cookie)
        .send({ status: 'DELIVERED', paymentCollected: true })
        .expect(200)
    ).body;
    check(
      delivered.payment.status === 'SUCCESS' &&
        delivered.history.map((event) => event.status).join(',') ===
          'CONFIRMED,PROCESSING,SHIPPED,DELIVERED' &&
        delivered.loyaltyEarned === '100.00',
      'delivered COD records cash collection, full timeline and 0.1% reward',
    );
    await call('patch', `/admin/orders/${cod.id}/status`, admin.cookie)
      .send({ status: 'DELIVERED', paymentCollected: true })
      .expect(200);
    check(
      (await balance(buyer)) === '100.00',
      'repeat delivery does not duplicate loyalty credit',
    );
    await call('patch', `/admin/orders/${cod.id}/status`, admin.cookie)
      .send({ status: 'CANCELLED' })
      .expect(409);
    checks++;
    await call('post', `/orders/${cod.id}/cancel`, buyer.cookie).expect(409);
    checks++;

    const discounted = await place(buyer, product, {
      paymentMethod: 'CASH_ON_DELIVERY',
      loyaltyAmount: '25.50',
    });
    check(
      discounted.total === '99974.50' &&
        discounted.loyaltyRedeemed === '25.50' &&
        (await balance(buyer)) === '74.50',
      'loyalty redemption reduces the amount due and debits once',
    );
    const discountedDone = await advance(discounted);
    check(
      discountedDone.loyaltyEarned === '99.97' &&
        (await balance(buyer)) === '174.47',
      'reward excludes redeemed credit and rounds down to cents',
    );
    await call('patch', `/products/${product.productID}`, admin.cookie)
      .send({ price: 50 })
      .expect(200);
    const covered = await place(buyer, product, {
      paymentMethod: 'PAYHERE',
      loyaltyAmount: '50.00',
    });
    check(
      covered.status === 'CONFIRMED' &&
        covered.paymentMethod === 'LOYALTY' &&
        covered.total === '0.00',
      'credit can fully cover a purchase without a payment gateway',
    );
    const coveredDone = await advance(covered);
    check(
      coveredDone.payment.status === 'SUCCESS' &&
        coveredDone.loyaltyEarned === '0.00' &&
        (await balance(buyer)) === '124.47',
      'fully redeemed orders are paid without generating further rewards',
    );
    const cancelled = await place(buyer, product, {
      paymentMethod: 'CASH_ON_DELIVERY',
      loyaltyAmount: '20.00',
    });
    const reserved = await stock(product);
    await call('post', `/orders/${cancelled.id}/cancel`, other.cookie).expect(
      404,
    );
    checks++;
    await call('post', `/orders/${cancelled.id}/cancel`, buyer.cookie).expect(
      201,
    );
    await call('post', `/orders/${cancelled.id}/cancel`, buyer.cookie).expect(
      201,
    );
    check(
      (await stock(product)) === reserved + 1 &&
        (await balance(buyer)) === '124.47',
      'customer cancellation returns reserved stock and loyalty once',
    );
    await call('post', '/cart/items', buyer.cookie)
      .send({ productId: product.productID, quantity: 1 })
      .expect(201);
    const invalidDraft = {
      delivery,
      idempotencyKey: randomUUID(),
      paymentMethod: 'CASH_ON_DELIVERY',
      loyaltyAmount: '999.00',
    };
    await call('post', '/orders', buyer.cookie).send(invalidDraft).expect(409);
    checks++;
    await call('post', '/orders', buyer.cookie)
      .send({ ...invalidDraft, loyaltyAmount: '-1.00' })
      .expect(400);
    checks++;
    await call('post', '/orders', buyer.cookie)
      .send({
        ...invalidDraft,
        loyaltyAmount: '0.00',
        paymentMethod: 'LOYALTY',
      })
      .expect(400);
    checks++;
    const races = await Promise.all(
      [1, 2].map(() =>
        call('post', '/orders', buyer.cookie).send({
          delivery,
          idempotencyKey: randomUUID(),
          paymentMethod: 'CASH_ON_DELIVERY',
          loyaltyAmount: '20.00',
        }),
      ),
    );
    const winner = races.find((res) => res.status === 201);
    check(
      races.filter((res) => res.status === 201).length === 1 &&
        races.some((res) => [400, 409].includes(res.status)),
      'concurrent checkout cannot consume the same cart and credit twice',
    );
    orders.push(winner.body.id);
    await call('post', `/orders/${winner.body.id}/cancel`, buyer.cookie).expect(
      201,
    );
    check(
      (await balance(buyer)) === '124.47',
      'race cancellation restores the original balance',
    );

    const online = await place(buyer, product, { loyaltyAmount: '10.00' });
    check(
      online.status === 'PENDING_PAYMENT' && online.total === '40.00',
      'existing PayHere order flow supports partial loyalty credit',
    );
    const initiation = (
      await call('post', '/payments/initiate', buyer.cookie)
        .send({ orderId: online.id })
        .expect(201)
    ).body;
    check(
      initiation.paymentData.amount === '40.00',
      'PayHere charges only the remainder',
    );
    const onlineStock = await stock(product);
    await callback(online);
    await callback(online);
    check(
      (await stock(product)) === onlineStock - 1,
      'verified duplicate PayHere callbacks reserve inventory once',
    );
    await advance(online);
    check(
      (await balance(buyer)) === '114.51',
      'verified online orders also earn loyalty after delivery',
    );
    const awaiting = await place(buyer, product, { loyaltyAmount: '10.00' });
    await call('post', '/payments/initiate', buyer.cookie)
      .send({ orderId: awaiting.id })
      .expect(201);
    await call('post', `/orders/${awaiting.id}/cancel`, buyer.cookie).expect(
      201,
    );
    await callback(awaiting, 409);
    checks++;
    check(
      (await balance(buyer)) === '114.51',
      'cancelled online orders refund credit and reject late successful callbacks',
    );

    const list = (
      await call(
        'get',
        `/admin/users?search=${buyer.username}`,
        admin.cookie,
      ).expect(200)
    ).body;
    check(
      list.total === 1 &&
        list.items[0].email === buyer.email &&
        !JSON.stringify(list).includes('passwordHash') &&
        !JSON.stringify(list).includes('tokenHash'),
      'admin search returns safe user fields only',
    );
    await call('patch', `/admin/users/${admin.id}/active`, admin.cookie)
      .send({ isActive: false })
      .expect(409);
    checks++;
    await call('patch', `/admin/users/${buyer.id}/active`, other.cookie)
      .send({ isActive: false })
      .expect(403);
    checks++;
    await call('post', '/auth/forgot-password')
      .send({ email: other.email })
      .expect(201);
    const disabledReset = token(latest(other.email, 'Reset your'));
    await call('patch', `/admin/users/${other.id}/active`, admin.cookie)
      .send({ isActive: false })
      .expect(200);
    await call('get', '/auth/profile', other.cookie).expect(401);
    checks++;
    await login(other).expect(401);
    checks++;
    await call('post', '/auth/reset-password')
      .send({ token: disabledReset, password: randomBytes(12).toString('hex') })
      .expect(400);
    checks++;
    const beforeDisabled = getMessages(app).length;
    await call('post', '/auth/forgot-password')
      .send({ email: other.email })
      .expect(201);
    check(
      getMessages(app).length === beforeDisabled,
      'deactivated accounts cannot reset their way back into the store',
    );
    await call('patch', `/admin/users/${other.id}/active`, admin.cookie)
      .send({ isActive: true })
      .expect(200);
    await login(other).expect(201);
    checks++;
    const blocked = await register('blocked', false);
    await call('patch', `/admin/users/${blocked.id}/active`, admin.cookie)
      .send({ isActive: false })
      .expect(200);
    await call('post', '/auth/verify-email')
      .send({ token: blocked.verification })
      .expect(400);
    checks++;
    const restored = (
      await call('patch', `/admin/users/${blocked.id}/active`, admin.cookie)
        .send({ isActive: true })
        .expect(200)
    ).body;
    check(
      !restored.isActive &&
        !restored.deactivatedAt &&
        !restored.emailVerifiedAt,
      'admin restoration cannot bypass email verification',
    );
    await call('post', '/auth/resend-verification')
      .send({ email: blocked.email })
      .expect(201);
    await call('post', '/auth/verify-email')
      .send({ token: token(latest(blocked.email, 'Verify your')) })
      .expect(201);
    mailFails = true;
    const deliveryFailure = await register('mailfailed', false);
    mailFails = false;
    const failedAccount = (
      await db.query('SELECT "isActive" FROM users WHERE id=$1', [
        deliveryFailure.id,
      ])
    )[0];
    check(
      !failedAccount.isActive,
      'mail delivery failure never activates an account',
    );
    await db.query(
      `UPDATE account_actions SET "createdAt"=now()-interval '2 minutes' WHERE "userId"=$1`,
      [deliveryFailure.id],
    );
    await call('post', '/auth/resend-verification')
      .send({ email: deliveryFailure.email })
      .expect(201);
    await call('post', '/auth/verify-email')
      .send({ token: token(latest(deliveryFailure.email, 'Verify your')) })
      .expect(201);
    check(
      (
        await db.query('SELECT "isActive" FROM users WHERE id=$1', [
          deliveryFailure.id,
        ])
      )[0].isActive,
      'a failed verification email can be recovered by resending',
    );
    await call('get', '/admin/users').expect(401);
    checks++;
    await call('get', '/admin/users?limit=1000', admin.cookie).expect(400);
    checks++;
    const inactive = (
      await call('get', '/admin/users?status=inactive', admin.cookie).expect(
        200,
      )
    ).body;
    check(
      !inactive.items.some((item) => item.id === blocked.id),
      'verified restored accounts are no longer filtered as deactivated',
    );
    console.log(
      `Commerce/account integration: ${checks} checks passed (HTTP, auth and real PostgreSQL; SMTP and gateway notifications mocked).`,
    );
  } catch (error) {
    console.error(
      `Commerce/account integration failed at ${operation}: ${error.message}`,
    );
    process.exitCode = 1;
  } finally {
    if (users.length) {
      await db.query(
        'DELETE FROM payments WHERE "customerId"=ANY($1::uuid[])',
        [users],
      );
      await db.query('DELETE FROM orders WHERE "customerId"=ANY($1::uuid[])', [
        users,
      ]);
      await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
    }
    if (products.length)
      await db.query('DELETE FROM products WHERE "productID"=ANY($1::uuid[])', [
        products,
      ]);
    if (categoryId)
      await db.query('DELETE FROM categories WHERE "categoryID"=$1', [
        categoryId,
      ]);
    await app.close();
  }
})().catch(() => {
  console.error(
    'Unable to initialize or clean up commerce/account integration fixtures.',
  );
  process.exitCode = 1;
});
