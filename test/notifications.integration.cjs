const assert = require('node:assert/strict');
const request = require('supertest');
const { createHash, randomBytes, randomUUID } = require('node:crypto');

process.env.PAYHERE_MERCHANT_ID = 'notification-test-merchant';
process.env.PAYHERE_MERCHANT_SECRET = 'notification-test-secret';
process.env.PAYHERE_MODE = 'sandbox';
const md5 = (value) =>
  createHash('md5').update(value).digest('hex').toUpperCase();
let lastOperation = 'initialization';

(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const {
    NotificationService,
  } = require('../dist/notification/notification.service');
  const { RepairStatus } = require('../dist/repairs/enums/repair-status.enum');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  const captured = [];
  let smtpFails = false;
  require('./helpers/mock-email.cjs').mockEmail(app, async (message) => {
    if (smtpFails) throw new Error('SMTP secret must never escape');
    captured.push(message);
    return { sent: true };
  });
  await app.init();
  const db = app.get(DataSource),
    server = app.getHttpServer();
  const users = [],
    orderIds = [],
    repairIds = [],
    productIds = [];
  const suffix = randomBytes(6).toString('hex');
  let categoryId,
    checks = 0;
  const check = (value, label) => {
    assert.ok(value, label);
    checks++;
  };
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const call = (method, path, cookie) => {
    lastOperation = `${method.toUpperCase()} ${path}`;
    const req = request(server)[method](path).set(headers);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const history = (id) =>
    db.query(
      'SELECT * FROM notifications WHERE "userId"=$1 ORDER BY "createdAt", id',
      [id],
    );
  const count = async (user, type) =>
    (await history(user.id)).filter((row) => row.type === type).length;
  async function account(role) {
    const username = `notify_${role}_${suffix}`,
      password = randomBytes(12).toString('hex');
    const response = await call('post', '/auth/register')
      .send({ username, password, email: `${username}@example.com` })
      .expect(201);
    const user = {
      ...response.body.user,
      password,
      cookie: response.headers['set-cookie'][0].split(';')[0],
    };
    users.push(user.id);
    if (role === 'admin' || role === 'repairer')
      await db.query('UPDATE users SET role=$1 WHERE id=$2', [
        role.toUpperCase(),
        user.id,
      ]);
    return user;
  }
  const delivery = {
    firstName: 'Test',
    lastName: 'Buyer',
    email: 'untrusted-delivery@example.com',
    phone: '0771234567',
    addressLine1: 'Test address',
    city: 'Colombo',
    postalCode: '00100',
    countryCode: 'LK',
  };
  async function order(user, product) {
    await call('post', '/cart/items', user.cookie)
      .send({ productId: product.productID, quantity: 1 })
      .expect(201);
    const body = { delivery, idempotencyKey: randomUUID() };
    const response = await call('post', '/orders', user.cookie)
      .send(body)
      .expect(201);
    orderIds.push(response.body.id);
    return { data: response.body, body };
  }
  async function notify(orderId, statusCode, paymentId) {
    const data = {
      merchant_id: process.env.PAYHERE_MERCHANT_ID,
      order_id: orderId,
      payment_id: paymentId,
      payhere_amount: '100.00',
      payhere_currency: 'LKR',
      status_code: statusCode,
    };
    data.md5sig = md5(
      data.merchant_id +
        data.order_id +
        data.payhere_amount +
        data.payhere_currency +
        data.status_code +
        md5(process.env.PAYHERE_MERCHANT_SECRET),
    );
    return call('post', '/payments/payhere/notify').send(data).expect(200);
  }
  async function repair(user) {
    const response = await call('post', '/repairs', user.cookie)
      .send({
        device: { deviceType: 'Washer', brand: 'Samsung', model: 'Model <8>' },
        problemDescription: 'The device does not start when switched on.',
      })
      .expect(201);
    repairIds.push(response.body.id);
    return response.body;
  }
  try {
    const customer = await account('customer'),
      admin = await account('admin'),
      repairer = await account('repairer');
    check(
      (await count(customer, 'WELCOME')) === 1,
      'registration triggers welcome',
    );
    await call('post', '/auth/login')
      .send({ username: customer.username, password: customer.password })
      .expect(201);
    check(
      (await count(customer, 'LOGIN')) === 1,
      'successful login notification',
    );
    smtpFails = true;
    await call('post', '/auth/login')
      .send({ username: customer.username, password: customer.password })
      .expect(201);
    const loginRows = (await history(customer.id)).filter(
      (row) => row.type === 'LOGIN',
    );
    check(
      loginRows.some((row) => row.status === 'FAILED'),
      'SMTP exception does not fail login',
    );
    const failureAccount = await account('failure');
    check(
      (await history(failureAccount.id))[0].status === 'FAILED',
      'SMTP exception does not fail registration',
    );
    smtpFails = false;
    const category = await call('post', '/categories', admin.cookie)
      .send({ name: `Notifications ${suffix}` })
      .expect(201);
    categoryId = category.body.categoryID;
    const productResponse = await call('post', '/products', admin.cookie)
      .send({
        name: `Notification washer ${suffix}`,
        SKU: `NOTIFY-${suffix}`,
        price: 100,
        stockQty: 10,
        categoryID: categoryId,
        images: ['https://images.example.com/notification-washer.jpg'],
      })
      .expect(201);
    const product = productResponse.body;
    productIds.push(product.productID);
    const first = await order(customer, product);
    check(
      (await count(customer, 'ORDER_CREATED')) === 1,
      'order-created email after persistence',
    );
    const confirmation = captured.find((message) =>
      message.html.includes(first.data.id),
    );
    check(
      confirmation?.html.includes(
        'https://images.example.com/notification-washer.jpg',
      ) &&
        confirmation.text.includes('LKR 100.00') &&
        confirmation.attachments?.[0]?.cid,
      'order confirmation contains saved product image, price and inline logo',
    );
    await call('post', '/orders', customer.cookie).send(first.body).expect(201);
    check(
      (await count(customer, 'ORDER_CREATED')) === 1,
      'idempotent order retry sends no duplicate',
    );
    check(
      captured
        .filter((message) => message.html.includes(first.data.id))
        .every((message) => message.to === customer.email),
      'recipient uses account email, not delivery email',
    );
    await call('post', '/payments/initiate', customer.cookie)
      .send({ orderId: first.data.id })
      .expect(201);
    await call('post', '/payments/payhere/notify')
      .send({ merchant_id: 'invalid' })
      .expect(400);
    check(
      (await count(customer, 'PAYMENT_SUCCESS')) === 0,
      'unverified callback cannot send success',
    );
    await notify(first.data.id, '2', `success-${suffix}`);
    check(
      (await count(customer, 'PAYMENT_SUCCESS')) === 1,
      'verified PayHere success notification',
    );
    await notify(first.data.id, '2', `success-${suffix}`);
    check(
      (await count(customer, 'PAYMENT_SUCCESS')) === 1,
      'duplicate verified success does not send twice',
    );
    await call('patch', `/admin/orders/${first.data.id}/status`, admin.cookie)
      .send({ status: 'PROCESSING' })
      .expect(200);
    check(
      (await count(customer, 'ORDER_STATUS_UPDATED')) === 1,
      'admin order status email',
    );
    await call('patch', `/admin/orders/${first.data.id}/status`, admin.cookie)
      .send({ status: 'PROCESSING' })
      .expect(200);
    check(
      (await count(customer, 'ORDER_STATUS_UPDATED')) === 1,
      'same status sends no email',
    );
    const second = await order(customer, product);
    await call('post', '/payments/initiate', customer.cookie)
      .send({ orderId: second.data.id })
      .expect(201);
    await notify(second.data.id, '-2', `failure-${suffix}`);
    check(
      (await count(customer, 'PAYMENT_FAILED')) === 1,
      'verified failure notification',
    );
    await notify(second.data.id, '-2', `failure-${suffix}`);
    check(
      (await count(customer, 'PAYMENT_FAILED')) === 1,
      'failed callback replay suppressed',
    );
    await call('post', '/payments/initiate', customer.cookie)
      .send({ orderId: second.data.id })
      .expect(201);
    await notify(second.data.id, '-2', `second-failure-${suffix}`);
    check(
      (await count(customer, 'PAYMENT_FAILED')) === 2,
      'different payment attempt can notify failure',
    );
    smtpFails = true;
    const failedMailOrder = await order(customer, product);
    check(
      (await history(customer.id)).some(
        (row) =>
          row.type === 'ORDER_CREATED' &&
          row.relatedEntityId === failedMailOrder.data.id &&
          row.status === 'FAILED',
      ),
      'order remains successful when Gmail fails',
    );
    await call('post', '/payments/initiate', customer.cookie)
      .send({ orderId: failedMailOrder.data.id })
      .expect(201);
    await notify(
      failedMailOrder.data.id,
      '2',
      `smtp-failure-success-${suffix}`,
    );
    check(
      (
        await db.query('SELECT status FROM orders WHERE id=$1', [
          failedMailOrder.data.id,
        ])
      )[0].status === 'CONFIRMED',
      'SMTP failure does not roll back verified payment',
    );
    smtpFails = false;
    const approved = await repair(customer);
    check(
      (await count(customer, 'REPAIR_CREATED')) === 1,
      'repair submission email',
    );
    await call('patch', `/repairs/admin/${approved.id}/approve`, admin.cookie)
      .send({ id: approved.id })
      .expect(200);
    check(
      (await count(customer, 'REPAIR_APPROVED')) === 1,
      'repair approval email',
    );
    await call('patch', `/repairs/admin/${approved.id}/approve`, admin.cookie)
      .send({ id: approved.id })
      .expect(400);
    check(
      (await count(customer, 'REPAIR_APPROVED')) === 1,
      'repeated approval sends no extra email',
    );
    const rejected = await repair(customer);
    await call('patch', `/repairs/admin/${rejected.id}/reject`, admin.cookie)
      .send({ id: rejected.id, rejectionReason: 'Not supported' })
      .expect(200);
    check(
      (await count(customer, 'REPAIR_REJECTED')) === 1,
      'repair rejection email',
    );
    // Assignment has no API in the current project; set only this test fixture through SQL.
    await db.query(
      'UPDATE repair_tickets SET "assignedRepairerId"=$1 WHERE id=$2',
      [repairer.id, approved.id],
    );
    await call(
      'patch',
      `/repairs/repairer/${approved.id}/status`,
      repairer.cookie,
    )
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    check(
      (await count(customer, 'REPAIR_STATUS_UPDATED')) === 1,
      'repair progress email',
    );
    const genericBefore = await count(customer, 'REPAIR_STATUS_UPDATED');
    await call(
      'patch',
      `/repairs/repairer/${approved.id}/status`,
      repairer.cookie,
    )
      .send({ status: 'READY_FOR_COLLECTION' })
      .expect(200);
    check(
      (await count(customer, 'REPAIR_READY_FOR_COLLECTION')) === 1,
      'dedicated ready-for-collection email',
    );
    check(
      (await count(customer, 'REPAIR_STATUS_UPDATED')) === genericBefore,
      'no generic plus dedicated duplicate',
    );
    smtpFails = true;
    await call(
      'patch',
      `/repairs/repairer/${approved.id}/status`,
      repairer.cookie,
    )
      .send({ status: 'COMPLETED' })
      .expect(200);
    check(
      (
        await db.query('SELECT status FROM repair_tickets WHERE id=$1', [
          approved.id,
        ])
      )[0].status === RepairStatus.COMPLETED,
      'repair status remains saved despite Gmail failure',
    );
    smtpFails = false;
    const notifications = app.get(NotificationService);
    const results = await Promise.all([
      notifications.sendWelcomeEmail(customer.id),
      notifications.sendWelcomeEmail(customer.id),
    ]);
    check(
      results.every((result) => result.status === 'DUPLICATE'),
      'persisted unique event key suppresses concurrent duplicate sends',
    );
    const race = await Promise.all([
      notifications.sendPromotionEmail(
        customer.id,
        { title: 'Test offer', description: 'Internal test only' },
        'same-event',
      ),
      notifications.sendPromotionEmail(
        customer.id,
        { title: 'Test offer', description: 'Internal test only' },
        'same-event',
      ),
    ]);
    check(
      race.filter((result) => result.status === 'SENT').length === 1 &&
        race.filter((result) => result.status === 'DUPLICATE').length === 1,
      'concurrent first claims send exactly once',
    );
    check(
      (await history(customer.id)).every((row) =>
        ['SENT', 'FAILED'].includes(row.status),
      ),
      'attempt statuses persisted',
    );
    console.log(
      `Notification integration: ${checks} checks passed (real HTTP/auth/database; SMTP mocked).`,
    );
  } finally {
    if (users.length)
      await db.query(
        'DELETE FROM payments WHERE "customerId"=ANY($1::uuid[])',
        [users],
      );
    if (orderIds.length)
      await db.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [orderIds]);
    if (repairIds.length)
      await db.query('DELETE FROM repair_tickets WHERE id=ANY($1::uuid[])', [
        repairIds,
      ]);
    if (users.length)
      await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
    if (productIds.length)
      await db.query('DELETE FROM products WHERE "productID"=ANY($1::uuid[])', [
        productIds,
      ]);
    if (categoryId)
      await db.query('DELETE FROM categories WHERE "categoryID"=$1', [
        categoryId,
      ]);
    await app.close();
  }
})().catch((error) => {
  console.error(
    'Notification integration failed:',
    lastOperation,
    error.message,
  );
  process.exitCode = 1;
});
