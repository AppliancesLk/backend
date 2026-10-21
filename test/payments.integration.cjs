const { registerVerified } = require('./helpers/register-verified.cjs');
const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const request = require('supertest');

process.env.PAYHERE_MERCHANT_ID = 'integration-merchant';
process.env.PAYHERE_MERCHANT_SECRET = 'integration-sandbox-secret';
process.env.PAYHERE_MODE = 'sandbox';

const md5 = (value) =>
  createHash('md5').update(value).digest('hex').toUpperCase();
const callbackHash = (input) =>
  md5(
    input.merchant_id +
      input.order_id +
      input.payhere_amount +
      input.payhere_currency +
      input.status_code +
      md5(process.env.PAYHERE_MERCHANT_SECRET),
  );

(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  require('./helpers/mock-email.cjs').mockEmail(app);
  await app.listen(0, '127.0.0.1');
  const db = app.get(DataSource);
  const server = app.getHttpServer();
  const suffix = randomBytes(6).toString('hex');
  const users = [];
  const products = [];
  const categories = [];
  let checks = 0;
  const check = (value, message) => {
    assert.ok(value, message);
    checks++;
  };
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const call = (method, path, cookie) => {
    const result = request(server)[method](path).set(headers).timeout(30000);
    return cookie ? result.set('Cookie', cookie) : result;
  };
  const register = async (name) => {
    const username = 'pay_' + name + '_' + suffix;
    const response = await registerVerified(app, {
      username,
      email: username + '@example.com',
      password: randomBytes(20).toString('hex'),
    });
    users.push(response.body.user.id);
    return {
      id: response.body.user.id,
      cookie: response.headers['set-cookie'][0].split(';')[0],
    };
  };
  const notify = async (input, expected) => {
    const response = await request(server)
      .post('/payments/payhere/notify')
      .type('form')
      .send({ ...input, md5sig: input.md5sig ?? callbackHash(input) })
      .expect(expected);
    checks++;
    return response;
  };

  try {
    const admin = await register('admin');
    const customer = await register('customer');
    const other = await register('other');
    await db.query('UPDATE users SET role=$1 WHERE id=$2', ['ADMIN', admin.id]);

    const category = (
      await call('post', '/categories', admin.cookie)
        .send({ name: 'Payment ' + suffix })
        .expect(201)
    ).body;
    categories.push(category.categoryID);
    const product = (
      await call('post', '/products', admin.cookie)
        .send({
          name: 'Payment appliance',
          SKU: 'PAY-' + suffix,
          price: 1234.5,
          stockQty: 5,
          categoryID: category.categoryID,
          images: [],
        })
        .expect(201)
    ).body;
    products.push(product.productID);
    await call('post', '/cart/items', customer.cookie)
      .send({ productId: product.productID, quantity: 2 })
      .expect(201);
    const delivery = {
      firstName: 'Test',
      lastName: 'Customer',
      email: 'payment@example.com',
      phone: '0771234567',
      addressLine1: '123 Test Road',
      city: 'Colombo',
      postalCode: '00100',
      countryCode: 'LK',
    };
    const order = (
      await call('post', '/orders', customer.cookie)
        .send({ idempotencyKey: randomUUID(), delivery })
        .expect(201)
    ).body;

    await call('post', '/payments/initiate')
      .send({ orderId: order.id })
      .expect(401);
    checks++;
    await call('post', '/payments/initiate', admin.cookie)
      .send({ orderId: order.id })
      .expect(403);
    checks++;
    await call('post', '/payments/initiate', other.cookie)
      .send({ orderId: order.id })
      .expect(404);
    checks++;
    await call('post', '/payments/initiate', customer.cookie)
      .send({ orderId: order.id, amount: '0.01' })
      .expect(400);
    checks++;

    const initiated = (
      await call('post', '/payments/initiate', customer.cookie)
        .send({ orderId: order.id })
        .expect(201)
    ).body;
    const data = initiated.paymentData;
    check(initiated.gatewayUrl.includes('sandbox.payhere.lk'), 'Uses sandbox');
    check(
      data.amount === '2469.00' && data.currency === 'LKR',
      'Trusted total',
    );
    check(data.order_id === order.id, 'Uses persisted order reference');
    check(
      data.hash ===
        md5(
          process.env.PAYHERE_MERCHANT_ID +
            order.id +
            '2469.00' +
            'LKR' +
            md5(process.env.PAYHERE_MERCHANT_SECRET),
        ),
      'Uses the official checkout hash',
    );
    check(
      !JSON.stringify(initiated).includes(process.env.PAYHERE_MERCHANT_SECRET),
      'Merchant secret is never returned',
    );
    const [pending] = await db.query(
      'SELECT status, amount FROM payments WHERE "orderId"=$1',
      [order.id],
    );
    check(
      pending.status === 'PENDING' && pending.amount === '2469.00',
      'Pending payment persists',
    );
    await call('get', '/payments/orders/' + order.id).expect(401);
    checks++;
    await call('get', '/payments/orders/' + order.id, admin.cookie).expect(403);
    checks++;
    await call('get', '/payments/orders/' + order.id, other.cookie).expect(404);
    checks++;
    const pendingRead = (
      await call('get', '/payments/orders/' + order.id, customer.cookie).expect(
        200,
      )
    ).body;
    check(
      pendingRead.status === 'PENDING' &&
        pendingRead.amount === '2469.00' &&
        !('payherePaymentId' in pendingRead) &&
        !('providerStatusCode' in pendingRead),
      'Customer reads only the safe verified payment state',
    );

    const base = {
      merchant_id: process.env.PAYHERE_MERCHANT_ID,
      order_id: order.id,
      payment_id: 'PH-' + suffix,
      payhere_amount: '2469.00',
      payhere_currency: 'LKR',
      status_code: '2',
    };
    await notify({ ...base, md5sig: '0'.repeat(32) }, 400);
    let [state] = await db.query(
      'SELECT p.status, o.status AS "orderStatus", pr."stockQty" FROM payments p JOIN orders o ON o.id=p."orderId" JOIN order_items i ON i."orderId"=o.id JOIN products pr ON pr."productID"=i."productId" WHERE p."orderId"=$1',
      [order.id],
    );
    check(
      state.status === 'PENDING' &&
        state.orderStatus === 'PENDING_PAYMENT' &&
        state.stockQty === 5,
      'Invalid callback changes nothing',
    );
    const wrongAmount = { ...base, payhere_amount: '0.01' };
    await notify(wrongAmount, 400);
    await notify({ ...base, merchant_id: 'different-merchant' }, 400);
    await notify({ ...base, payhere_currency: 'USD' }, 400);

    const failed = { ...base, status_code: '-2' };
    await notify(failed, 200);
    [state] = await db.query('SELECT status FROM payments WHERE "orderId"=$1', [
      order.id,
    ]);
    check(state.status === 'FAILED', 'Verified failure persists');
    const cancelled = { ...base, status_code: '-1' };
    await notify(cancelled, 200);
    [state] = await db.query('SELECT status FROM payments WHERE "orderId"=$1', [
      order.id,
    ]);
    check(state.status === 'CANCELLED', 'Verified cancellation persists');
    await call('post', '/payments/initiate', customer.cookie)
      .send({ orderId: order.id })
      .expect(201);
    checks++;

    const successes = await Promise.all(
      Array.from({ length: 5 }, () => notify(base, 200)),
    );
    check(
      successes.filter((response) => response.body.duplicate === false)
        .length === 1 &&
        successes.filter((response) => response.body.duplicate === true)
          .length === 4,
      'Concurrent callbacks perform the success transition once',
    );
    [state] = await db.query(
      'SELECT p.status, p."payherePaymentId", o.status AS "orderStatus", pr."stockQty" FROM payments p JOIN orders o ON o.id=p."orderId" JOIN order_items i ON i."orderId"=o.id JOIN products pr ON pr."productID"=i."productId" WHERE p."orderId"=$1',
      [order.id],
    );
    check(
      state.status === 'SUCCESS' &&
        state.payherePaymentId === base.payment_id &&
        state.orderStatus === 'CONFIRMED' &&
        state.stockQty === 3,
      'Verified success atomically confirms and deducts stock',
    );
    const duplicate = await notify(base, 200);
    check(duplicate.body.duplicate === true, 'Duplicate is acknowledged');
    const [afterDuplicate] = await db.query(
      'SELECT "stockQty" FROM products WHERE "productID"=$1',
      [product.productID],
    );
    check(afterDuplicate.stockQty === 3, 'Duplicate does not deduct twice');
    const otherProviderPayment = {
      ...base,
      payment_id: 'PH-DIFFERENT-' + suffix,
    };
    await notify(otherProviderPayment, 400);
    await call('post', '/payments/initiate', customer.cookie)
      .send({ orderId: order.id })
      .expect(409);
    checks++;

    console.log('PASS: ' + checks + ' payment integration checks');
  } finally {
    for (const id of users)
      await db.query('DELETE FROM payments WHERE "customerId"=$1', [id]);
    for (const id of users)
      await db.query('DELETE FROM orders WHERE "customerId"=$1', [id]);
    for (const id of users)
      await db.query('DELETE FROM users WHERE id=$1', [id]);
    for (const id of products)
      await db.query('DELETE FROM products WHERE "productID"=$1', [id]);
    for (const id of categories)
      await db.query('DELETE FROM categories WHERE "categoryID"=$1', [id]);
    await app.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
