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
    for (const path of [
      '/products/admin/all',
      '/categories/admin/all',
      '/products/admin/00000000-0000-4000-8000-000000000000',
    ]) {
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
    await call('patch', '/products/00000000-0000-4000-8000-000000000000')
      .send({ name: 'Changed' })
      .expect(401);
    checks++;
    await call(
      'patch',
      '/products/00000000-0000-4000-8000-000000000000',
      cookie,
    )
      .send({ name: 'Changed' })
      .expect(403);
    checks++;
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
    const adminDetail = await call(
      'get',
      `/products/admin/${id}`,
      cookie,
    ).expect(200);
    check(
      adminDetail.body.productID === id &&
        adminDetail.body.category.categoryID === category.body.categoryID,
      'Admin detail includes product and category',
    );
    await call('get', '/products/admin/not-a-uuid', cookie).expect(400);
    checks++;
    await call(
      'get',
      '/products/admin/00000000-0000-4000-8000-000000000000',
      cookie,
    ).expect(404);
    checks++;
    await call(
      'patch',
      '/products/00000000-0000-4000-8000-000000000000',
      cookie,
    )
      .send({ name: 'Changed' })
      .expect(404);
    checks++;
    for (const field of [
      'name',
      'SKU',
      'price',
      'categoryID',
      'images',
      'isActive',
    ]) {
      await call('patch', `/products/${id}`, cookie)
        .send({ [field]: null })
        .expect(400);
      checks++;
    }
    for (const body of [
      { name: '' },
      { name: '   ' },
      { SKU: '' },
      { SKU: ' \t ' },
      { price: -1 },
      { price: 1.001 },
      { price: 10000000000 },
      { price: '12' },
      { categoryID: 'invalid' },
      { images: [1] },
      { images: 'url' },
      { specifications: [] },
      { specifications: 'text' },
      { isActive: 'false' },
      { stockQty: 4 },
      { unknownField: 'ignored?' },
    ]) {
      await call('patch', `/products/${id}`, cookie).send(body).expect(400);
      checks++;
    }
    await call('patch', `/products/${id}`, cookie)
      .send({
        name: 'Must not persist',
        categoryID: '00000000-0000-4000-8000-000000000000',
      })
      .expect(404);
    checks++;
    const unchanged = await call('get', `/products/admin/${id}`, cookie).expect(
      200,
    );
    check(
      unchanged.body.name === input.name &&
        unchanged.body.SKU === input.SKU &&
        unchanged.body.stockQty === 15,
      'Rejected edits leave the product unchanged',
    );
    const specifications = {
      Capacity: '9 kg',
      Programs: ['Cotton', 'Wool'],
      Smart: false,
      Dimensions: { width: 60 },
      Optional: null,
    };
    const edit = {
      name: `  Updated appliance ${suffix}  `,
      SKU: ` UPDATED-${suffix} `,
      price: 0,
      categoryID: parent.body.categoryID,
      images: ['https://example.com/front.jpg', 'https://example.com/back.jpg'],
      specifications,
      isActive: true,
    };
    const updated = await call('patch', `/products/${id}`, cookie)
      .send(edit)
      .expect(200);
    check(
      updated.body.name === edit.name.trim() &&
        updated.body.SKU === edit.SKU.trim(),
      'Updated names and SKUs are trimmed',
    );
    check(
      Number(updated.body.price) === 0 && updated.body.stockQty === 15,
      'Zero price is valid and detail edits preserve stock',
    );
    check(
      updated.body.category.categoryID === parent.body.categoryID &&
        updated.body.images.length === 2,
      'Category and image replacement persists',
    );
    assert.deepEqual(updated.body.specifications, specifications);
    checks++;
    const partial = await call('patch', `/products/${id}`, cookie)
      .send({ price: 9999999999.99 })
      .expect(200);
    check(
      Number(partial.body.price) === 9999999999.99 &&
        partial.body.name === edit.name.trim() &&
        partial.body.stockQty === 15,
      'Maximum price is accepted and omitted fields are preserved',
    );
    assert.deepEqual(partial.body.specifications, specifications);
    checks++;
    const cleared = await call('patch', `/products/${id}`, cookie)
      .send({ images: [], specifications: null })
      .expect(200);
    check(
      cleared.body.images.length === 0 && cleared.body.specifications === null,
      'Empty images and null specifications explicitly clear their values',
    );
    const emptySpecs = await call('patch', `/products/${id}`, cookie)
      .send({ specifications: {} })
      .expect(200);
    assert.deepEqual(emptySpecs.body.specifications, {});
    checks++;
    const noOp = await call('patch', `/products/${id}`, cookie)
      .send({})
      .expect(200);
    check(
      noOp.body.name === edit.name.trim() &&
        noOp.body.SKU === edit.SKU.trim() &&
        noOp.body.stockQty === 15,
      'An empty patch preserves all data',
    );
    const persisted = await call('get', `/products/admin/${id}`, cookie).expect(
      200,
    );
    check(
      persisted.body.name === edit.name.trim() &&
        Number(persisted.body.price) === 9999999999.99 &&
        persisted.body.specifications &&
        Object.keys(persisted.body.specifications).length === 0,
      'Edits are persisted and can be reloaded',
    );
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
    const inactiveDetail = await call(
      'get',
      `/products/admin/${id}`,
      cookie,
    ).expect(200);
    check(
      inactiveDetail.body.isActive === false,
      'Admin detail includes inactive products',
    );
    const inactiveEdit = await call('patch', `/products/${id}`, cookie)
      .send({ name: `Edited inactive ${suffix}` })
      .expect(200);
    check(
      inactiveEdit.body.isActive === false &&
        inactiveEdit.body.name === `Edited inactive ${suffix}`,
      'Inactive products remain editable',
    );

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
    const hiddenCategoryDetail = await call(
      'get',
      `/products/admin/${id}`,
      cookie,
    ).expect(200);
    check(
      hiddenCategoryDetail.body.category.categoryID === parent.body.categoryID,
      'Admin detail includes products in inactive categories',
    );
    const other = await call('post', '/products', cookie)
      .send({
        name: `Other appliance ${suffix}`,
        SKU: `OTHER-${suffix}`,
        price: 100,
        categoryID: category.body.categoryID,
      })
      .expect(201);
    productIDs.push(other.body.productID);
    await call('patch', `/products/${id}`, cookie)
      .send({ SKU: other.body.SKU })
      .expect(409);
    checks++;
    const raceSKU = `RACE-${suffix}`;
    const races = await Promise.all(
      [id, other.body.productID].map((productID) =>
        call('patch', `/products/${productID}`, cookie).send({ SKU: raceSKU }),
      ),
    );
    assert.deepEqual(
      races.map((response) => response.status).sort(),
      [200, 409],
    );
    checks++;
    const rows = await db.query(
      'SELECT "productID" FROM products WHERE "SKU"=$1',
      [raceSKU],
    );
    check(
      rows.length === 1,
      'Concurrent duplicate SKUs have exactly one winner',
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
