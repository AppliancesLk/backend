const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes } = require('node:crypto');

(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  configureApp(app);
  require('./helpers/mock-email.cjs').mockEmail(app);
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const db = app.get(DataSource);
  const users = [],
    products = [],
    categories = [];
  const suffix = randomBytes(6).toString('hex');
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  let checks = 0;
  const check = (condition, description) => {
    assert.ok(condition, description);
    checks++;
  };
  const call = (method, path, cookie) => {
    const req = request(server)[method](path).set(headers).timeout(30000);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const delivery = {
    firstName: 'Test',
    lastName: 'Customer',
    email: 'delivery@example.com',
    phone: '0771234567',
    addressLine1: '123 Test Road',
    city: 'Colombo',
    postalCode: '00100',
    countryCode: 'LK',
  };
  const status = async (cookie, body, expected) => {
    const res = await call('post', '/checkout/prepare', cookie)
      .send(body)
      .expect(expected);
    checks++;
    return res;
  };
  const createUser = async (name) => {
    const username = `co_${name}_${suffix}`;
    const result = await call('post', '/auth/register')
      .send({
        username,
        email: `${username}@example.com`,
        password: randomBytes(20).toString('hex'),
      })
      .expect(201);
    users.push(result.body.user.id);
    return {
      id: result.body.user.id,
      cookie: result.headers['set-cookie'][0].split(';')[0],
    };
  };
  try {
    const admin = await createUser('admin'),
      alice = await createUser('alice'),
      bob = await createUser('bob'),
      repairer = await createUser('repairer');
    await db.query('UPDATE users SET role=$1 WHERE id=$2', ['ADMIN', admin.id]);
    await db.query('UPDATE users SET role=$1 WHERE id=$2', [
      'REPAIRER',
      repairer.id,
    ]);
    await status(undefined, { delivery }, 401);
    await status('appliances_session=invalid', { delivery }, 401);
    await status(admin.cookie, { delivery }, 403);
    await status(repairer.cookie, { delivery }, 403);
    await request(server)
      .post('/checkout/prepare')
      .set('Cookie', alice.cookie)
      .send({ delivery })
      .expect(403);
    checks++;
    await status(alice.cookie, { delivery }, 400);
    const [unused] = await db.query(
      'SELECT count(*)::int AS count FROM carts WHERE "userId"=$1',
      [alice.id],
    );
    check(
      unused.count === 0,
      'Preparing an empty cart does not create database state',
    );

    for (const body of [
      {},
      { delivery: null },
      { delivery: [] },
      { delivery: 'bad' },
      { delivery: {} },
    ])
      await status(alice.cookie, body, 400);
    for (const field of Object.keys(delivery)) {
      const missing = { ...delivery };
      delete missing[field];
      await status(alice.cookie, { delivery: missing }, 400);
      await status(
        alice.cookie,
        { delivery: { ...delivery, [field]: null } },
        400,
      );
    }
    for (const [field, value] of [
      ['firstName', '   '],
      ['lastName', 'x'.repeat(81)],
      ['email', 'not-an-email'],
      ['email', 'x'.repeat(255)],
      ['phone', '123'],
      ['phone', 771234567],
      ['addressLine1', ' '],
      ['addressLine1', 'x'.repeat(201)],
      ['addressLine2', null],
      ['addressLine2', 3],
      ['addressLine2', 'x'.repeat(201)],
      ['city', ' '],
      ['city', 'x'.repeat(101)],
      ['postalCode', ''],
      ['postalCode', '<invalid>'],
      ['postalCode', 'x'.repeat(21)],
      ['countryCode', 'ZZ'],
      ['countryCode', 'Sri Lanka'],
    ])
      await status(
        alice.cookie,
        { delivery: { ...delivery, [field]: value } },
        400,
      );
    for (const field of [
      'userId',
      'customerId',
      'cartId',
      'items',
      'price',
      'subtotal',
      'total',
      'deliveryFee',
      'discount',
    ])
      await status(
        alice.cookie,
        { delivery, [field]: field.endsWith('Id') ? bob.id : 0 },
        400,
      );
    await status(alice.cookie, { delivery: { ...delivery, total: 0 } }, 400);

    const parent = (
      await call('post', '/categories', admin.cookie)
        .send({ name: `Checkout parent ${suffix}` })
        .expect(201)
    ).body;
    categories.push(parent.categoryID);
    const category = (
      await call('post', '/categories', admin.cookie)
        .send({ name: `Checkout child ${suffix}`, parentID: parent.categoryID })
        .expect(201)
    ).body;
    categories.push(category.categoryID);
    const createProduct = async (name, price, stockQty) => {
      const res = await call('post', '/products', admin.cookie)
        .send({
          name,
          SKU: `${name}-${suffix}`,
          price,
          stockQty,
          categoryID: category.categoryID,
        })
        .expect(201);
      products.push(res.body.productID);
      return res.body.productID;
    };
    const productId = await createProduct('Checkout appliance', 100, 5);
    const secondId = await createProduct('Checkout second', 0.2, 9);
    await call('post', '/cart/items', alice.cookie)
      .send({ productId, quantity: 3 })
      .expect(201);
    await call('post', '/cart/items', alice.cookie)
      .send({ productId: secondId, quantity: 2 })
      .expect(201);
    const before = (await call('get', '/cart', alice.cookie).expect(200)).body;
    await call('patch', `/products/${productId}`, admin.cookie)
      .send({ price: 0.1 })
      .expect(200);
    const stateBefore = await db.query(
      'SELECT c.id, c."updatedAt", i.id AS "itemId", i.quantity FROM carts c JOIN cart_items i ON i."cartId"=c.id WHERE c."userId"=$1 ORDER BY i.id',
      [alice.id],
    );
    const first = (
      await status(
        alice.cookie,
        {
          delivery: {
            ...delivery,
            firstName: '  Test  ',
            city: ' Colombo ',
            countryCode: ' lk ',
            addressLine2: '  Unit 2  ',
          },
        },
        200,
      )
    ).body;
    check(
      first.customerId === alice.id && first.cartId === before.id,
      'Identity and cart ownership come from the verified session',
    );
    check(
      first.items.length === 2 && first.itemCount === 2,
      'Summary includes every persisted cart product',
    );
    check(
      first.subtotal === '0.70' &&
        first.total === '0.70' &&
        first.currency === 'LKR',
      'Recalculates subtotal and final total from current backend prices',
    );
    const priced = first.items.find((item) => item.productId === productId);
    check(
      priced.unitPrice === '0.10' &&
        priced.lineTotal === '0.30' &&
        priced.quantity === 3,
      'Recalculates each line after an admin price change',
    );
    check(
      first.delivery.firstName === 'Test' &&
        first.delivery.city === 'Colombo' &&
        first.delivery.countryCode === 'LK' &&
        first.delivery.addressLine2 === 'Unit 2',
      'Delivery data is validated and normalized',
    );
    check(
      Number.isFinite(Date.parse(first.preparedAt)),
      'Summary records preparation time',
    );
    check(
      !JSON.stringify(first).includes('passwordHash') &&
        !('accessToken' in first),
      'Response contains no authentication secrets',
    );
    const stateAfter = await db.query(
      'SELECT c.id, c."updatedAt", i.id AS "itemId", i.quantity FROM carts c JOIN cart_items i ON i."cartId"=c.id WHERE c."userId"=$1 ORDER BY i.id',
      [alice.id],
    );
    assert.deepEqual(stateAfter, stateBefore);
    checks++;
    const stock = await db.query(
      'SELECT "stockQty" FROM products WHERE "productID"=$1',
      [productId],
    );
    check(
      stock[0].stockQty === 5,
      'Preparation does not deduct or reserve inventory',
    );
    check(
      (await call('get', '/cart', alice.cookie)).body.items.length === 2,
      'Successful preparation does not clear the cart',
    );
    await status(bob.cookie, { delivery }, 400);

    await call('patch', `/products/${productId}/stock`, admin.cookie)
      .send({ stockQty: 2 })
      .expect(200);
    const lowStock = (await status(alice.cookie, { delivery }, 409)).body;
    check(
      lowStock.message === 'Insufficient stock for cart product' &&
        lowStock.productId === productId &&
        lowStock.requestedQuantity === 3 &&
        lowStock.availableStock === 2,
      'Insufficient stock identifies affected product and quantities',
    );
    await call('patch', `/products/${productId}/stock`, admin.cookie)
      .send({ stockQty: 0 })
      .expect(200);
    await status(alice.cookie, { delivery }, 409);
    await call('patch', `/products/${productId}/stock`, admin.cookie)
      .send({ stockQty: 5 })
      .expect(200);
    await call('patch', `/products/${secondId}`, admin.cookie)
      .send({ isActive: false })
      .expect(200);
    const inactive = (await status(alice.cookie, { delivery }, 409)).body;
    check(
      inactive.message === 'Cart product is no longer available' &&
        inactive.productId === secondId,
      'Every product is checked, including a later inactive item',
    );
    await call('patch', `/products/${secondId}`, admin.cookie)
      .send({ isActive: true })
      .expect(200);
    await call('patch', `/categories/${parent.categoryID}`, admin.cookie)
      .send({ isActive: false })
      .expect(200);
    await status(alice.cookie, { delivery }, 409);
    await call('patch', `/categories/${parent.categoryID}`, admin.cookie)
      .send({ isActive: true })
      .expect(200);
    const parallel = await Promise.all(
      [1, 2, 3].map(() =>
        call('post', '/checkout/prepare', alice.cookie)
          .send({ delivery })
          .expect(200),
      ),
    );
    check(
      parallel.every((res) => res.body.total === '0.70'),
      'Repeated/concurrent preparation is read-only and consistent',
    );

    await call('delete', '/cart', alice.cookie).expect(200);
    await status(alice.cookie, { delivery }, 400);
    const hugeId = await createProduct(
      'Checkout large',
      9999999999.99,
      2147483647,
    );
    await call('post', '/cart/items', alice.cookie)
      .send({ productId: hugeId, quantity: 2147483647 })
      .expect(201);
    check(
      (await status(alice.cookie, { delivery }, 200)).body.total ===
        '21474836469978525163.53',
      'Large totals remain exact beyond Number precision',
    );
    await call('delete', '/cart', alice.cookie).expect(200);
    await call('patch', `/products/${productId}`, admin.cookie)
      .send({ price: 0 })
      .expect(200);
    await call('post', '/cart/items', alice.cookie)
      .send({ productId, quantity: 1 })
      .expect(201);
    check(
      (await status(alice.cookie, { delivery }, 200)).body.total === '0.00',
      'Zero backend prices are handled exactly without inventing payment rules',
    );
    await db.query('DELETE FROM products WHERE "productID"=$1', [productId]);
    await status(alice.cookie, { delivery }, 400);
    check(
      (await call('get', '/cart', alice.cookie)).body.items.length === 0,
      'Hard-deleted products cascade out of the cart and cannot be checked out',
    );
    await db.query('UPDATE users SET "isActive"=false WHERE id=$1', [bob.id]);
    await status(bob.cookie, { delivery }, 401);
    await call('post', '/auth/logout', alice.cookie).expect(201);
    await status(alice.cookie, { delivery }, 401);
    console.log(`PASS: ${checks} checkout integration checks`);
  } finally {
    for (const id of users)
      await db.query('DELETE FROM users WHERE id=$1', [id]);
    for (const id of products)
      await db.query('DELETE FROM products WHERE "productID"=$1', [id]);
    for (const id of categories.reverse())
      await db.query('DELETE FROM categories WHERE "categoryID"=$1', [id]);
    await app.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
