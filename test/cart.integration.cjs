const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes, randomUUID } = require('node:crypto');

(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const {
    CreateCartsAndCartItems1792220000000,
  } = require('../dist/database/migrations/1792220000000-CreateCartsAndCartItems');
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const db = app.get(DataSource);
  const suffix = randomBytes(8).toString('hex');
  const users = [],
    products = [],
    categories = [];
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const call = (method, path, cookie) => {
    const req = request(server)[method](path).set(headers).timeout(30000);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  let checks = 0;
  const check = (condition, message) => {
    assert.ok(condition, message);
    checks++;
  };
  const status = async (method, path, cookie, body, expected) => {
    await call(method, path, cookie).send(body).expect(expected);
    checks++;
  };
  const createUser = async (name) => {
    const username = `cart_${name}_${suffix}`;
    const result = await call('post', '/auth/register')
      .send({
        username,
        email: `${username}@example.com`,
        password: randomBytes(16).toString('hex'),
      })
      .expect(201);
    users.push(result.body.user.id);
    return {
      id: result.body.user.id,
      cookie: result.headers['set-cookie'][0].split(';')[0],
    };
  };
  try {
    const admin = await createUser('admin');
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const racer = await createUser('racer');
    const repairer = await createUser('repairer');
    await db.query('UPDATE users SET role=$1 WHERE id=$2', ['ADMIN', admin.id]);
    await db.query('UPDATE users SET role=$1 WHERE id=$2', [
      'REPAIRER',
      repairer.id,
    ]);
    const category = (
      await call('post', '/categories', admin.cookie)
        .send({ name: `Cart category ${suffix}` })
        .expect(201)
    ).body;
    categories.push(category.categoryID);
    const createProduct = async (name, price, stockQty) => {
      const result = await call('post', '/products', admin.cookie)
        .send({
          name,
          SKU: `${name}-${suffix}`,
          price,
          stockQty,
          categoryID: category.categoryID,
        })
        .expect(201);
      products.push(result.body.productID);
      return result.body.productID;
    };
    const productId = await createProduct('Cart decimal', 0.1, 7);
    const secondId = await createProduct('Cart second', 0.2, 9);
    const expensiveId = await createProduct(
      'Cart large',
      9999999999.99,
      2147483647,
    );
    const missing = randomUUID();
    const routes = [
      ['get', '/cart'],
      ['post', '/cart/items'],
      ['patch', `/cart/items/${missing}`],
      ['delete', `/cart/items/${missing}`],
      ['delete', '/cart'],
    ];
    for (const [method, path] of routes) {
      await status(method, path, undefined, undefined, 401);
      await status(method, path, admin.cookie, undefined, 403);
      await status(method, path, repairer.cookie, undefined, 403);
    }
    const empty = (await call('get', '/cart', alice.cookie).expect(200)).body;
    check(
      empty.id === null &&
        empty.items.length === 0 &&
        empty.subtotal === '0.00',
      'New customer gets an empty cart',
    );
    const [noCart] = await db.query(
      'SELECT count(*)::int AS count FROM carts WHERE "userId"=$1',
      [alice.id],
    );
    check(noCart.count === 0, 'GET does not create database state');
    for (const quantity of [0, -1, 1.1, '2', null, 2147483648]) {
      await status(
        'post',
        '/cart/items',
        alice.cookie,
        { productId, quantity },
        400,
      );
      await status(
        'patch',
        `/cart/items/${missing}`,
        alice.cookie,
        { quantity },
        400,
      );
    }
    await status('post', '/cart/items', alice.cookie, { productId }, 400);
    await status(
      'post',
      '/cart/items',
      alice.cookie,
      { productId: 'bad', quantity: 1 },
      400,
    );
    await status(
      'patch',
      '/cart/items/bad',
      alice.cookie,
      { quantity: 1 },
      400,
    );
    await status(
      'post',
      '/cart/items',
      alice.cookie,
      { productId, quantity: 1, userId: bob.id },
      400,
    );
    await status(
      'post',
      '/cart/items',
      alice.cookie,
      { productId, quantity: 1, price: 0 },
      400,
    );
    await status(
      'post',
      '/cart/items',
      alice.cookie,
      { productId: missing, quantity: 1 },
      404,
    );
    const first = (
      await call('post', '/cart/items', alice.cookie)
        .send({ productId: productId.toUpperCase(), quantity: 2 })
        .expect(201)
    ).body;
    const itemId = first.items[0].id;
    check(
      first.items[0].unitPrice === '0.10' &&
        first.items[0].lineTotal === '0.20',
      'Decimal totals are exact',
    );
    const repeated = (
      await call('post', '/cart/items', alice.cookie)
        .send({ productId, quantity: 3 })
        .expect(201)
    ).body;
    check(
      repeated.items.length === 1 &&
        repeated.items[0].id === itemId &&
        repeated.items[0].quantity === 5,
      'Repeated product increments same item',
    );
    await status(
      'post',
      '/cart/items',
      alice.cookie,
      { productId, quantity: 3 },
      400,
    );
    await status(
      'patch',
      `/cart/items/${itemId}`,
      alice.cookie,
      { quantity: 8 },
      400,
    );
    check(
      (await call('get', '/cart', alice.cookie)).body.items[0].quantity === 5,
      'Failed writes roll back quantity',
    );
    const edited = (
      await call('patch', `/cart/items/${itemId}`, alice.cookie)
        .send({ quantity: 3 })
        .expect(200)
    ).body;
    check(
      edited.items[0].quantity === 3 && edited.subtotal === '0.30',
      'PATCH replaces quantity',
    );
    const combined = (
      await call('post', '/cart/items', alice.cookie)
        .send({ productId: secondId, quantity: 2 })
        .expect(201)
    ).body;
    check(
      combined.itemCount === 2 && combined.subtotal === '0.70',
      'Subtotal sums current backend prices',
    );
    check(
      (await call('get', '/cart', bob.cookie)).body.items.length === 0,
      'Customer cannot read another cart',
    );
    await status(
      'patch',
      `/cart/items/${itemId}`,
      bob.cookie,
      { quantity: 1 },
      404,
    );
    await status('delete', `/cart/items/${itemId}`, bob.cookie, undefined, 404);
    await status(
      'patch',
      `/cart/items/${missing}`,
      alice.cookie,
      { quantity: 1 },
      404,
    );
    await status(
      'delete',
      `/cart/items/${missing}`,
      alice.cookie,
      undefined,
      404,
    );
    const bobCart = (
      await call('post', '/cart/items', bob.cookie)
        .send({ productId, quantity: 1 })
        .expect(201)
    ).body;
    check(
      bobCart.id !== first.id && bobCart.items[0].id !== itemId,
      'Customers own separate carts and items',
    );
    await call('delete', '/cart', bob.cookie).expect(200);
    check(
      (await call('get', '/cart', alice.cookie)).body.items.length === 2,
      'Clear affects only own cart',
    );
    const [stock] = await db.query(
      'SELECT "stockQty" FROM products WHERE "productID"=$1',
      [productId],
    );
    check(stock.stockQty === 7, 'Cart operations never reduce stock');
    await call('patch', `/products/${productId}`, admin.cookie)
      .send({ price: 0.25 })
      .expect(200);
    const repriced = (await call('get', '/cart', alice.cookie)).body;
    check(
      repriced.items[0].unitPrice === '0.25' && repriced.subtotal === '1.15',
      'Cart reads latest trusted price',
    );
    await call('patch', `/products/${productId}/stock`, admin.cookie)
      .send({ stockQty: 1 })
      .expect(200);
    check(
      (await call('get', '/cart', alice.cookie)).body.items[0].isAvailable ===
        false,
      'Reduced stock flags existing item unavailable',
    );
    await status(
      'patch',
      `/cart/items/${itemId}`,
      alice.cookie,
      { quantity: 2 },
      400,
    );
    await call('patch', `/cart/items/${itemId}`, alice.cookie)
      .send({ quantity: 1 })
      .expect(200);
    await call('patch', `/products/${productId}`, admin.cookie)
      .send({ isActive: false })
      .expect(200);
    await status(
      'post',
      '/cart/items',
      alice.cookie,
      { productId, quantity: 1 },
      404,
    );
    await status(
      'patch',
      `/cart/items/${itemId}`,
      alice.cookie,
      { quantity: 1 },
      404,
    );
    check(
      (await call('get', '/cart', alice.cookie)).body.items[0].isAvailable ===
        false,
      'Hidden product remains visible as unavailable in own cart',
    );
    const removed = (
      await call('delete', `/cart/items/${itemId}`, alice.cookie).expect(200)
    ).body;
    check(
      removed.items.length === 1 && removed.items[0].productId === secondId,
      'Unavailable item can still be removed',
    );
    await call('patch', `/categories/${category.categoryID}`, admin.cookie)
      .send({ isActive: false })
      .expect(200);
    await status(
      'post',
      '/cart/items',
      alice.cookie,
      { productId: secondId, quantity: 1 },
      404,
    );
    check(
      (await call('get', '/cart', alice.cookie)).body.items[0].isAvailable ===
        false,
      'Hidden category makes item unavailable',
    );
    await call('patch', `/categories/${category.categoryID}`, admin.cookie)
      .send({ isActive: true })
      .expect(200);
    await call('patch', `/products/${productId}`, admin.cookie)
      .send({ isActive: true })
      .expect(200);
    await call('patch', `/products/${productId}/stock`, admin.cookie)
      .send({ stockQty: 7 })
      .expect(200);
    const races = await Promise.all(
      Array.from({ length: 20 }, () =>
        call('post', '/cart/items', racer.cookie).send({
          productId,
          quantity: 1,
        }),
      ),
    );
    check(
      races.filter((res) => res.status === 201).length === 7 &&
        races.filter((res) => res.status === 400).length === 13,
      'Concurrent first-use additions enforce combined stock limit',
    );
    const raced = (await call('get', '/cart', racer.cookie).expect(200)).body;
    check(
      raced.items.length === 1 && raced.items[0].quantity === 7,
      'Concurrent additions do not duplicate or lose increments',
    );
    const [cartCount] = await db.query(
      'SELECT count(*)::int AS count FROM carts WHERE "userId"=$1',
      [racer.id],
    );
    check(
      cartCount.count === 1,
      'Concurrent first use creates exactly one cart',
    );
    const [unchangedStock] = await db.query(
      'SELECT "stockQty" FROM products WHERE "productID"=$1',
      [productId],
    );
    check(
      unchangedStock.stockQty === 7,
      'Concurrent additions do not reserve stock',
    );
    const large = (
      await call('post', '/cart/items', bob.cookie)
        .send({ productId: expensiveId, quantity: 2147483647 })
        .expect(201)
    ).body;
    const cents = 999999999999n * 2147483647n;
    check(
      large.subtotal ===
        `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`,
      'Large totals remain exact beyond JavaScript safe integer',
    );
    const cleared = (await call('delete', '/cart', alice.cookie).expect(200))
      .body;
    check(
      cleared.items.length === 0 && cleared.subtotal === '0.00',
      'Clear returns empty cart',
    );
    await call('delete', '/cart', alice.cookie).expect(200);
    checks++;
    await call('post', '/auth/logout', alice.cookie).expect(201);
    await status('get', '/cart', alice.cookie, undefined, 401);

    // Exercise migration up/down in an isolated, rolled-back schema. Existing
    // application tables and customer data are never dropped for this test.
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const schema = `cart_test_${suffix}`;
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}", public`);
      await runner.query('CREATE TABLE users (id uuid PRIMARY KEY)');
      await runner.query(
        'CREATE TABLE products ("productID" uuid PRIMARY KEY)',
      );
      const migration = new CreateCartsAndCartItems1792220000000();
      await migration.up(runner);
      const userId = randomUUID(),
        otherUserId = randomUUID(),
        cartId = randomUUID(),
        testProductId = randomUUID();
      await runner.query('INSERT INTO users VALUES ($1), ($2)', [
        userId,
        otherUserId,
      ]);
      await runner.query('INSERT INTO products VALUES ($1)', [testProductId]);
      await runner.query('INSERT INTO carts (id, "userId") VALUES ($1, $2)', [
        cartId,
        userId,
      ]);
      await runner.query(
        'INSERT INTO cart_items ("cartId", "productId", quantity) VALUES ($1, $2, 1)',
        [cartId, testProductId],
      );
      const constraintFailure = async (sql, params, code) => {
        await runner.query('SAVEPOINT constraint_test');
        await assert.rejects(
          runner.query(sql, params),
          (error) => error.driverError.code === code,
        );
        await runner.query('ROLLBACK TO SAVEPOINT constraint_test');
        checks++;
      };
      await constraintFailure(
        'INSERT INTO carts ("userId") VALUES ($1)',
        [userId],
        '23505',
      );
      await constraintFailure(
        'INSERT INTO cart_items ("cartId", "productId", quantity) VALUES ($1, $2, 2)',
        [cartId, testProductId],
        '23505',
      );
      await constraintFailure('UPDATE cart_items SET quantity=0', [], '23514');
      await constraintFailure(
        'INSERT INTO carts ("userId") VALUES ($1)',
        [randomUUID()],
        '23503',
      );
      await runner.query('DELETE FROM users WHERE id=$1', [userId]);
      check(
        (await runner.query('SELECT * FROM cart_items')).length === 0 &&
          (await runner.query('SELECT * FROM carts')).length === 0,
        'Customer deletion cascades through own cart',
      );
      await migration.down(runner);
      const remaining = await runner.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name IN ($2,$3)',
        [schema, 'carts', 'cart_items'],
      );
      check(remaining.length === 0, 'Migration down removes only cart tables');
      await migration.up(runner);
      check(
        (await runner.query('SELECT * FROM carts')).length === 0,
        'Migration can be reapplied',
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    console.log(`PASS: ${checks} cart integration checks`);
  } finally {
    // Delete only records owned by this test run. User deletion cascades carts.
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
