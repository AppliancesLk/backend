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
  await app.init();
  const server = app.getHttpServer();
  const db = app.get(DataSource);
  const suffix = randomBytes(8).toString('hex');
  const email = `test_${suffix}@example.com`;
  const password = randomBytes(20).toString('hex');
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  let userId;
  const categoryIDs = [];
  const productIDs = [];
  let checks = 0;
  const check = (condition, message) => {
    assert.ok(condition, message);
    checks++;
  };
  const call = (method, url, cookie) => {
    const req = request(server)[method](url).set(headers);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  try {
    const registered = await call('post', '/auth/register')
      .send({ username: `test_${suffix}`, email, password })
      .expect(201);
    userId = registered.body.user.id;
    const cookie = registered.headers['set-cookie'][0].split(';')[0];
    for (const path of ['/products/admin/all', '/categories/admin/all']) {
      await call('get', path).expect(401);
      checks++;
      await call('get', path, cookie).expect(403);
      checks++;
    }
    for (const [path, body] of [
      ['/products', {}],
      ['/categories', {}],
      ['/products/00000000-0000-4000-8000-000000000000/stock', { stockQty: 1 }],
    ]) {
      const method = path.endsWith('/stock') ? 'patch' : 'post';
      await call(method, path).send(body).expect(401);
      checks++;
      await call(method, path, cookie).send(body).expect(403);
      checks++;
    }
    await db.query('UPDATE users SET role=$1 WHERE id=$2', ['ADMIN', userId]);
    const parent = await call('post', '/categories', cookie)
      .send({ name: `Test parent ${suffix}` })
      .expect(201);
    categoryIDs.push(parent.body.categoryID);
    const category = await call('post', '/categories', cookie)
      .send({ name: `Test child ${suffix}`, parentID: parent.body.categoryID })
      .expect(201);
    categoryIDs.push(category.body.categoryID);
    check(
      category.body.parent.categoryID === parent.body.categoryID,
      'Category parent persists',
    );
    const input = {
      name: `Test appliance ${suffix}`,
      SKU: `TEST-${suffix}`,
      price: 1234.5,
      categoryID: category.body.categoryID,
      stockQty: 7,
      images: ['https://example.com/appliance.jpg'],
      specifications: { Capacity: '8 kg' },
    };
    const created = await call('post', '/products', cookie)
      .send(input)
      .expect(201);
    const id = created.body.productID;
    productIDs.push(id);
    check(
      created.body.stockQty === 7 &&
        created.body.category.categoryID === category.body.categoryID,
      'Initial stock and category persist',
    );
    check(
      created.body.specifications.Capacity === '8 kg',
      'Product specifications persist',
    );
    await call('post', '/products', cookie).send(input).expect(409);
    checks++;
    for (const stockQty of [-1, 1.5, '2', 2147483648]) {
      await call('patch', `/products/${id}/stock`, cookie)
        .send({ stockQty })
        .expect(400);
      checks++;
    }
    const zero = await call('patch', `/products/${id}/stock`, cookie)
      .send({ stockQty: 0 })
      .expect(200);
    check(zero.body.stockQty === 0, 'Zero stock is valid');
    const changed = await call('patch', `/products/${id}/stock`, cookie)
      .send({ stockQty: 15 })
      .expect(200);
    check(
      changed.body.stockQty === 15 && changed.body.name === input.name,
      'Stock updates preserve product details',
    );
    await call(
      'patch',
      '/products/00000000-0000-4000-8000-000000000000/stock',
      cookie,
    )
      .send({ stockQty: 1 })
      .expect(404);
    checks++;
    await call('patch', `/products/${id}/stock`, cookie)
      .send({ stockQty: 1, price: 99 })
      .expect(400);
    checks++;
    const publicProducts = await call('get', '/products').expect(200);
    check(
      publicProducts.body.some(
        (product) => product.productID === id && product.stockQty === 15,
      ),
      'Public catalog sees created product and updated stock',
    );
    await call('patch', `/products/${id}`, cookie)
      .send({ isActive: false })
      .expect(200);
    const hidden = await call('get', '/products').expect(200);
    check(
      !hidden.body.some((product) => product.productID === id),
      'Inactive products are hidden publicly',
    );
    await call('get', `/products/${id}`).expect(404);
    checks++;
    const adminProducts = await call(
      'get',
      '/products/admin/all',
      cookie,
    ).expect(200);
    check(
      adminProducts.body.some((product) => product.productID === id),
      'Admin can manage inactive products',
    );
    await call('patch', `/products/${id}`, cookie)
      .send({ isActive: true })
      .expect(200);
    await call('patch', `/categories/${parent.body.categoryID}`, cookie)
      .send({ isActive: false })
      .expect(200);
    const categories = await call('get', '/categories').expect(200);
    check(
      !categories.body.some((item) => categoryIDs.includes(item.categoryID)),
      'Inactive category branches are hidden',
    );
    const branchProducts = await call('get', '/products').expect(200);
    check(
      !branchProducts.body.some((product) => product.productID === id),
      'Products in inactive category branches are hidden',
    );
    const adminCategories = await call(
      'get',
      '/categories/admin/all',
      cookie,
    ).expect(200);
    check(
      adminCategories.body.some(
        (item) => item.categoryID === parent.body.categoryID,
      ),
      'Admin can reactivate categories',
    );
    console.log(`PASS: ${checks} admin management checks`);
  } finally {
    for (const id of productIDs)
      await db.query('DELETE FROM products WHERE "productID"=$1', [id]);
    for (const id of categoryIDs.reverse())
      await db.query('DELETE FROM categories WHERE "categoryID"=$1', [id]);
    await db.query('DELETE FROM users WHERE email=$1', [email]);
    await app.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
