const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes, randomUUID } = require('node:crypto');
(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const {
    CheckoutService,
  } = require('../dist/checkout/services/checkout.service');
  const { CartService } = require('../dist/cart/services/cart.service');
  const {
    CreateOrdersAndOrderItems1792230000000,
  } = require('../dist/database/migrations/1792230000000-CreateOrdersAndOrderItems');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const db = app.get(DataSource),
    server = app.getHttpServer();
  const suffix = randomBytes(6).toString('hex');
  const users = [],
    products = [],
    categories = [];
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const delivery = {
    firstName: 'Test',
    lastName: 'Customer',
    email: 'order@example.com',
    phone: '0771234567',
    addressLine1: '123 Test Road',
    city: 'Colombo',
    postalCode: '00100',
    countryCode: 'LK',
  };
  let checks = 0;
  const check = (value, message) => {
    assert.ok(value, message);
    checks++;
  };
  const call = (method, path, cookie) => {
    const req = request(server)[method](path).set(headers).timeout(30000);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const status = async (cookie, body, expected) => {
    const result = await call('post', '/orders', cookie)
      .send(body)
      .expect(expected);
    checks++;
    return result;
  };
  const createUser = async (name) => {
    const username = `ord_${name}_${suffix}`;
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
    assert.deepEqual(
      (await call('get', '/orders', alice.cookie).expect(200)).body,
      [],
    );
    checks++;
    for (const path of ['/orders', `/orders/${randomUUID()}/status`]) {
      await call('get', path).expect(401);
      await call('get', path, 'appliances_session=invalid').expect(401);
      await call('get', path, admin.cookie).expect(403);
      await call('get', path, repairer.cookie).expect(403);
      checks += 4;
    }
    const body = { idempotencyKey: randomUUID(), delivery };
    await status(undefined, body, 401);
    await status('appliances_session=invalid', body, 401);
    await status(admin.cookie, body, 403);
    await status(repairer.cookie, body, 403);
    await request(server)
      .post('/orders')
      .set('Cookie', alice.cookie)
      .send(body)
      .expect(403);
    checks++;
    await status(alice.cookie, body, 400);
    for (const invalid of [
      { delivery },
      { ...body, idempotencyKey: 'bad' },
      { ...body, idempotencyKey: null },
      { idempotencyKey: randomUUID() },
      { ...body, delivery: null },
      { ...body, delivery: { ...delivery, email: 'bad' } },
    ])
      await status(alice.cookie, invalid, 400);
    for (const key of [
      'userId',
      'customerId',
      'cartId',
      'items',
      'total',
      'subtotal',
      'price',
      'status',
      'checkoutSummary',
    ])
      await status(
        alice.cookie,
        { ...body, [key]: key.endsWith('Id') ? bob.id : 0 },
        400,
      );
    const category = (
      await call('post', '/categories', admin.cookie)
        .send({ name: `Orders ${suffix}` })
        .expect(201)
    ).body;
    categories.push(category.categoryID);
    const createProduct = async (name, price, stockQty) => {
      const result = await call('post', '/products', admin.cookie)
        .send({
          name,
          SKU: `${name}-${suffix}`,
          images: ['https://example.com/original.jpg'],
          price,
          stockQty,
          categoryID: category.categoryID,
        })
        .expect(201);
      products.push(result.body.productID);
      return result.body;
    };
    const product = await createProduct('Purchase snapshot', 100, 5);
    const second = await createProduct('Other snapshot', 0.2, 8);
    const add = async (
      customer = alice,
      quantity = 3,
      productId = product.productID,
    ) => {
      await call('post', '/cart/items', customer.cookie)
        .send({ productId, quantity })
        .expect(201);
    };
    await add();
    await add(alice, 2, second.productID);
    const checkout = (
      await call('post', '/checkout/prepare', alice.cookie)
        .send({ delivery })
        .expect(200)
    ).body;
    check(
      checkout.total === '300.40',
      'An initial checkout summary is available',
    );
    await call('patch', `/products/${product.productID}/stock`, admin.cookie)
      .send({ stockQty: 2 })
      .expect(200);
    await status(alice.cookie, body, 409);
    check(
      (await call('get', '/cart', alice.cookie)).body.items.length === 2,
      'Stock failure preserves cart',
    );
    await call('patch', `/products/${product.productID}/stock`, admin.cookie)
      .send({ stockQty: 5 })
      .expect(200);
    await call('patch', `/products/${second.productID}`, admin.cookie)
      .send({ isActive: false })
      .expect(200);
    await status(alice.cookie, body, 409);
    await call('patch', `/products/${second.productID}`, admin.cookie)
      .send({ isActive: true })
      .expect(200);
    await call('patch', `/categories/${category.categoryID}`, admin.cookie)
      .send({ isActive: false })
      .expect(200);
    await status(alice.cookie, body, 409);
    await call('patch', `/categories/${category.categoryID}`, admin.cookie)
      .send({ isActive: true })
      .expect(200);
    await call('patch', `/products/${product.productID}`, admin.cookie)
      .send({ price: 0.1 })
      .expect(200);
    const created = (
      await status(
        alice.cookie,
        {
          ...body,
          delivery: { ...delivery, firstName: ' Test ', countryCode: ' lk ' },
        },
        201,
      )
    ).body;
    check(
      created.customerId === alice.id && created.status === 'PENDING_PAYMENT',
      'Order belongs to authenticated customer and starts unpaid',
    );
    check(
      created.sourceCartId === checkout.cartId && created.items.length === 2,
      'Order preserves source cart and all items',
    );
    check(
      created.total === '0.70' && created.subtotal === '0.70',
      'Creation revalidates current backend prices rather than stale checkout total',
    );
    const snapshot = created.items.find(
      (item) => item.productId === product.productID,
    );
    check(
      snapshot.name === product.name &&
        snapshot.SKU === product.SKU &&
        snapshot.quantity === 3 &&
        snapshot.unitPrice === '0.10' &&
        snapshot.lineTotal === '0.30' &&
        snapshot.images[0] === 'https://example.com/original.jpg',
      'Purchase-time identity, name, SKU, image, quantity and money are stored',
    );
    check(
      created.delivery.firstName === 'Test' &&
        created.delivery.countryCode === 'LK',
      'Normalized delivery information is persisted',
    );
    check(
      !('idempotencyKey' in created) &&
        !('requestHash' in created) &&
        !JSON.stringify(created).includes('passwordHash'),
      'Internal fingerprints and authentication secrets are not returned',
    );
    const rows = await db.query(
      'SELECT o.id, o.total, count(i.id)::int AS count FROM orders o JOIN order_items i ON i."orderId"=o.id WHERE o.id=$1 GROUP BY o.id',
      [created.id],
    );
    check(
      rows.length === 1 && rows[0].count === 2 && rows[0].total === '0.70',
      'Order and items are persisted in PostgreSQL',
    );
    check(
      (await call('get', '/cart', alice.cookie)).body.items.length === 0,
      'Cart is consumed only after successful creation',
    );
    check(
      (await call('get', `/products/${product.productID}`)).body.stockQty === 5,
      'Pending order does not deduct or reserve inventory',
    );
    const replay = (await status(alice.cookie, body, 201)).body;
    assert.deepEqual(replay, created);
    checks++;
    await status(
      alice.cookie,
      { ...body, delivery: { ...delivery, city: 'Kandy' } },
      409,
    );
    await status(alice.cookie, { ...body, idempotencyKey: randomUUID() }, 400);
    await call('get', `/orders/${created.id}`).expect(401);
    checks++;
    await call('get', `/orders/${created.id}`, admin.cookie).expect(403);
    checks++;
    await call('get', `/orders/${created.id}`, repairer.cookie).expect(403);
    checks++;
    await call('get', `/orders/${created.id}`, bob.cookie).expect(404);
    checks++;
    await call('get', `/orders/${randomUUID()}`, alice.cookie).expect(404);
    checks++;
    await call('get', '/orders/bad', alice.cookie).expect(400);
    checks++;
    const fetched = (
      await call('get', `/orders/${created.id}`, alice.cookie).expect(200)
    ).body;
    assert.deepEqual(fetched, created);
    checks++;
    await call('patch', `/products/${product.productID}`, admin.cookie)
      .send({
        name: 'Changed later',
        SKU: `CHANGED-${suffix}`,
        price: 999,
        images: ['https://example.com/changed.jpg'],
        isActive: false,
      })
      .expect(200);
    const historical = (
      await call('get', `/orders/${created.id}`, alice.cookie)
    ).body;
    assert.deepEqual(historical, created);
    checks++;
    await assert.rejects(
      db.query('DELETE FROM products WHERE "productID"=$1', [
        product.productID,
      ]),
      (error) => ['23503', '23001'].includes(error.driverError.code),
    );
    checks++;
    await assert.rejects(
      db.query('DELETE FROM users WHERE id=$1', [alice.id]),
      (error) => ['23503', '23001'].includes(error.driverError.code),
    );
    checks++;
    await call('patch', `/products/${product.productID}`, admin.cookie)
      .send({ isActive: true, price: 0.1 })
      .expect(200);

    // Same key replay must not consume the customer's next cart.
    await add(alice, 1);
    await status(alice.cookie, body, 201);
    check(
      (await call('get', '/cart', alice.cookie)).body.items[0].quantity === 1,
      'Replaying a previous flow leaves newly added cart items intact',
    );
    const raceBody = { idempotencyKey: randomUUID(), delivery };
    const races = await Promise.all(
      Array.from({ length: 10 }, () =>
        call('post', '/orders', alice.cookie).send(raceBody),
      ),
    );
    check(
      races.every((res) => res.status === 201) &&
        new Set(races.map((res) => res.body.id)).size === 1,
      'Concurrent same-key requests return one persisted order',
    );
    check(
      (
        await db.query(
          'SELECT id FROM orders WHERE "customerId"=$1 AND "idempotencyKey"=$2',
          [alice.id, raceBody.idempotencyKey],
        )
      ).length === 1,
      'Database enforces idempotency uniqueness',
    );
    await add(alice, 1);
    const different = await Promise.all(
      Array.from({ length: 3 }, () =>
        call('post', '/orders', alice.cookie).send({
          idempotencyKey: randomUUID(),
          delivery,
        }),
      ),
    );
    check(
      different.filter((res) => res.status === 201).length === 1 &&
        different.every((res) => [201, 400, 409].includes(res.status)),
      'Different keys cannot convert the same cart contents twice',
    );
    await add(bob, 1);
    const bobOrder = (await status(bob.cookie, body, 201)).body;
    check(
      bobOrder.id !== created.id && bobOrder.customerId === bob.id,
      'Idempotency keys are scoped to their authenticated customer',
    );

    // Read APIs use persisted snapshots and isolate every query by owner.
    const history = (await call('get', '/orders', alice.cookie).expect(200))
      .body;
    const expectedHistory = await db.query(
      'SELECT id FROM orders WHERE "customerId"=$1 ORDER BY "createdAt" DESC, id DESC',
      [alice.id],
    );
    assert.deepEqual(
      history.map((order) => order.id),
      expectedHistory.map((row) => row.id),
    );
    check(
      history.every(
        (order) => order.customerId === alice.id && order.id !== bobOrder.id,
      ),
      'History contains only owned orders',
    );
    check(
      history.every(
        (order) =>
          order.items.length &&
          order.createdAt &&
          order.delivery &&
          order.total,
      ),
      'History includes items, dates, delivery and totals',
    );
    assert.deepEqual(
      history.find((order) => order.id === created.id).items,
      created.items,
    );
    checks += 2;
    for (const id of [bobOrder.id, randomUUID()]) {
      await call('get', `/orders/${id}/status`, alice.cookie).expect(404);
      checks++;
    }
    await call('get', '/orders/bad/status', alice.cookie).expect(400);
    checks++;
    const { OrderStatus } = require('../dist/orders/enums/order-status.enum');
    for (const value of Object.values(OrderStatus)) {
      await db.query('UPDATE orders SET status=$1 WHERE id=$2', [
        value,
        created.id,
      ]);
      const current = (
        await call('get', `/orders/${created.id}/status`, alice.cookie).expect(
          200,
        )
      ).body;
      assert.deepEqual(current, {
        id: created.id,
        status: value,
        updatedAt: created.updatedAt,
      });
      check(
        (await call('get', `/orders/${created.id}`, alice.cookie)).body
          .status === value,
        'Details return persisted current status',
      );
      check(
        (await call('get', '/orders', alice.cookie)).body.find(
          (order) => order.id === created.id,
        ).status === value,
        'History returns persisted current status',
      );
    }

    // Inject failures only in this isolated app instance to prove actual DB
    // rollback of an already-inserted order header and consumed cart rows.
    await add(alice, 2);
    const cartBefore = (await call('get', '/cart', alice.cookie)).body;
    const [beforeCount] = await db.query(
      'SELECT count(*)::int AS count FROM orders WHERE "customerId"=$1',
      [alice.id],
    );
    const checkoutService = app.get(CheckoutService),
      originalPrepare = checkoutService.prepare.bind(checkoutService);
    const failedBody = { idempotencyKey: randomUUID(), delivery };
    checkoutService.prepare = async function (...args) {
      const valid = await originalPrepare.apply(this, args);
      valid.items[0].lineTotal = '999.00';
      return valid;
    };
    try {
      await status(alice.cookie, failedBody, 500);
    } finally {
      checkoutService.prepare = originalPrepare;
    }
    const [afterItemsFailure] = await db.query(
      'SELECT count(*)::int AS count FROM orders WHERE "customerId"=$1',
      [alice.id],
    );
    check(
      afterItemsFailure.count === beforeCount.count,
      'Item insert failure rolls back the order header',
    );
    assert.deepEqual(
      (await call('get', '/cart', alice.cookie)).body,
      cartBefore,
    );
    checks++;
    const cartService = app.get(CartService),
      originalConsume = cartService.consumeCart.bind(cartService);
    cartService.consumeCart = async function (...args) {
      await originalConsume.apply(this, args);
      throw new Error('injected rollback');
    };
    try {
      await status(alice.cookie, failedBody, 500);
    } finally {
      cartService.consumeCart = originalConsume;
    }
    const [afterConsumeFailure] = await db.query(
      'SELECT count(*)::int AS count FROM orders WHERE "customerId"=$1',
      [alice.id],
    );
    check(
      afterConsumeFailure.count === beforeCount.count,
      'Failure after consumption rolls back header and items',
    );
    assert.deepEqual(
      (await call('get', '/cart', alice.cookie)).body,
      cartBefore,
    );
    checks++;
    await status(alice.cookie, failedBody, 201);
    check(
      (
        await db.query(
          'SELECT id FROM orders WHERE "customerId"=$1 AND "idempotencyKey"=$2',
          [alice.id, failedBody.idempotencyKey],
        )
      ).length === 1,
      'A rolled-back idempotency key can safely retry',
    );
    const huge = await createProduct('Large order', 9999999999.99, 2147483647);
    await add(alice, 2147483647, huge.productID);
    check(
      (
        await status(
          alice.cookie,
          { idempotencyKey: randomUUID(), delivery },
          201,
        )
      ).body.total === '21474836469978525163.53',
      'Persisted order totals preserve large decimal precision',
    );

    // Migration reversal and constraints are tested in an isolated schema.
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const schema = `orders_test_${suffix}`;
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}", public`);
      await runner.query('CREATE TABLE users (id uuid PRIMARY KEY)');
      await runner.query(
        'CREATE TABLE products ("productID" uuid PRIMARY KEY)',
      );
      const migration = new CreateOrdersAndOrderItems1792230000000();
      await migration.up(runner);
      const userId = randomUUID(),
        productId = randomUUID(),
        orderId = randomUUID(),
        key = randomUUID();
      await runner.query('INSERT INTO users VALUES ($1)', [userId]);
      await runner.query('INSERT INTO products VALUES ($1)', [productId]);
      await runner.query(
        `INSERT INTO orders (id,"customerId","idempotencyKey","requestHash","sourceCartId",subtotal,total,delivery,"preparedAt") VALUES ($1,$2,$3,$4,$5,0.30,0.30,$6,now())`,
        [
          orderId,
          userId,
          key,
          'a'.repeat(64),
          randomUUID(),
          JSON.stringify(delivery),
        ],
      );
      await runner.query(
        'INSERT INTO order_items ("orderId","productId",name,"SKU",quantity,"unitPrice","lineTotal") VALUES ($1,$2,$3,$4,3,0.10,0.30)',
        [orderId, productId, 'Snapshot', 'SKU'],
      );
      const reject = async (sql, params, code) => {
        await runner.query('SAVEPOINT constraint_test');
        await assert.rejects(
          runner.query(sql, params),
          (error) =>
            error.driverError.code === code ||
            (code === '23503' && error.driverError.code === '23001'),
        );
        await runner.query('ROLLBACK TO SAVEPOINT constraint_test');
        checks++;
      };
      await reject('UPDATE order_items SET quantity=0', [], '23514');
      await reject('UPDATE order_items SET "lineTotal"=0.31', [], '23514');
      await reject('UPDATE orders SET total=-1', [], '23514');
      await reject(`UPDATE orders SET currency='USD'`, [], '23514');
      await reject(
        'DELETE FROM products WHERE "productID"=$1',
        [productId],
        '23503',
      );
      await reject('DELETE FROM users WHERE id=$1', [userId], '23503');
      await reject(
        `INSERT INTO orders ("customerId","idempotencyKey","requestHash","sourceCartId",subtotal,total,delivery,"preparedAt") SELECT "customerId","idempotencyKey","requestHash","sourceCartId",subtotal,total,delivery,"preparedAt" FROM orders`,
        [],
        '23505',
      );
      await runner.query('DELETE FROM orders WHERE id=$1', [orderId]);
      check(
        (await runner.query('SELECT * FROM order_items')).length === 0,
        'Deleting an order cascades only its own items',
      );
      await migration.down(runner);
      check(
        (
          await runner.query(
            'SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name IN ($2,$3)',
            [schema, 'orders', 'order_items'],
          )
        ).length === 0,
        'Migration down removes isolated order tables',
      );
      await migration.up(runner);
      check(
        (await runner.query('SELECT * FROM orders')).length === 0,
        'Order migration can be reapplied',
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    await call('post', '/auth/logout', alice.cookie).expect(201);
    await status(alice.cookie, body, 401);
    await call('get', '/orders', alice.cookie).expect(401);
    await call('get', `/orders/${created.id}/status`, alice.cookie).expect(401);
    checks += 2;
    console.log(`PASS: ${checks} order integration checks`);
  } finally {
    // Restrictive history FKs mean our temporary orders are removed first.
    for (const id of users)
      await db.query('DELETE FROM orders WHERE "customerId"=$1', [id]);
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
