const { registerVerified } = require('./helpers/register-verified.cjs');
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
  await app.init();
  const db = app.get(DataSource),
    server = app.getHttpServer();
  const suffix = randomBytes(6).toString('hex');
  const categories = [],
    products = [],
    users = [];
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  let checks = 0;
  const check = (value, message) => {
    assert.ok(value, message);
    checks++;
  };
  let cookie;
  const call = (method, url, authenticated = true) => {
    const req = request(server)[method](url).set(headers);
    return authenticated && cookie ? req.set('Cookie', cookie) : req;
  };
  try {
    const registered = await registerVerified(app, {
      username: `catalog_${suffix}`,
      email: `catalog_${suffix}@example.com`,
      password: randomBytes(20).toString('hex'),
    });
    users.push(registered.body.user.id);
    cookie = registered.headers['set-cookie'][0].split(';')[0];
    await call('get', '/products/catalog', false).expect(200);
    checks++;
    await call('post', '/products')
      .send({
        name: 'Forbidden',
        SKU: 'x',
        price: 10,
        categoryID: '00000000-0000-4000-8000-000000000000',
        brand: 'Atlas',
      })
      .expect(403);
    checks++;
    await db.query('UPDATE users SET role=$1 WHERE id=$2', ['ADMIN', users[0]]);
    async function category(name, parentID, isActive = true) {
      const response = await call('post', '/categories')
        .send({ name: `${name} ${suffix}`, parentID, isActive })
        .expect(201);
      categories.push(response.body.categoryID);
      return response.body.categoryID;
    }
    const parent = await category('Catalog parent');
    const child = await category('Catalog child', parent);
    const hidden = await category('Hidden parent', undefined, false);
    const hiddenChild = await category('Hidden child', hidden);
    async function product(index, categoryID = child, isActive = true) {
      const response = await call('post', '/products')
        .send({
          name: `Catalog ${suffix} ${String(index).padStart(2, '0')}`,
          SKU: `CAT-${suffix}-${index}`,
          price: (index + 1) * 100,
          categoryID,
          stockQty: index === 2 ? 0 : 5,
          brand: index % 2 ? 'Nova' : 'Atlas',
          subtitle: '128 GB - Black',
          badge: index === 0 ? 'DEAL' : null,
          compareAtPrice: index === 0 ? 200 : null,
          isActive,
        })
        .expect(201);
      products.push(response.body.productID);
      return response.body;
    }
    for (let i = 0; i < 14; i++) await product(i);
    await product(14, child, false);
    await product(15, hiddenChild);
    const get = async (params) =>
      (
        await call(
          'get',
          `/products/catalog?q=${suffix}&${params}`,
          false,
        ).expect(200)
      ).body;
    let result = await get('limit=12');
    check(
      result.total === 14 &&
        result.items.length === 12 &&
        result.totalPages === 2,
      'pagination hides inactive products and categories',
    );
    check(
      result.facets.categories.find((item) => item.categoryID === parent)
        .count === 14,
      'parent category counts include descendants',
    );
    check(
      result.facets.brands.find((item) => item.name === 'Atlas').count === 7,
      'brand facet counts are real',
    );
    check(
      (await get('page=2')).items.length === 2,
      'last page has remaining products',
    );
    check(
      (await get('page=999')).page === 2,
      'out-of-range pages clamp to last page',
    );
    check(
      (await get(`categoryId=${parent}`)).total === 14,
      'parent selection includes descendants',
    );
    check(
      (await get(`categoryId=${hidden}`)).total === 0,
      'hidden parent cannot expose descendants',
    );
    check((await get('brands=atlas')).total === 7, 'brand filters ignore case');
    check(
      (await get('brands=Atlas,Nova')).total === 14,
      'multiple brands use OR semantics',
    );
    result = await get('minPrice=200&maxPrice=500&sort=price-desc');
    check(
      result.total === 4 && Number(result.items[0].price) === 500,
      'price bounds are inclusive and sorting is numeric',
    );
    check(
      (await get('sort=price-asc')).items[0].compareAtPrice === '200.00',
      'metadata persisted and is public',
    );
    check(
      (await get('sort=newest')).items[0].productID === products[13],
      'newest sorting uses actual creation date',
    );
    for (const query of [
      'page=0',
      'limit=49',
      'sort=popular',
      'categoryId=invalid',
      'minPrice=-1',
      'minPrice=500&maxPrice=100',
      'minPrice=abc',
      'q=' + 'a'.repeat(121),
    ]) {
      await call('get', '/products/catalog?' + query, false).expect(400);
      checks++;
    }
    const injection = await call(
      'get',
      `/products/catalog?q=${encodeURIComponent("' OR 1=1 --")}`,
      false,
    ).expect(200);
    check(injection.body.total === 0, 'search values are parameterized');
    const wildcard = await call('get', '/products/catalog?q=%25', false).expect(
      200,
    );
    check(wildcard.body.total === 0, 'search treats wildcard text literally');
    await call('patch', `/products/${products[0]}`)
      .send({ price: 300 })
      .expect(400);
    checks++;
    await call('patch', `/products/${products[0]}`)
      .send({ compareAtPrice: 100 })
      .expect(400);
    checks++;
    const cleared = await call('patch', `/products/${products[0]}`)
      .send({ compareAtPrice: null, brand: null, badge: null, subtitle: '' })
      .expect(200);
    check(
      cleared.body.compareAtPrice === null && cleared.body.brand === null,
      'optional metadata can be cleared',
    );
    await call('patch', `/products/${products[0]}`)
      .send({ brand: 'Invalid,Brand' })
      .expect(400);
    checks++;
    const legacy = await call('get', '/products', false).expect(200);
    check(
      Array.isArray(legacy.body),
      'legacy products endpoint remains an array',
    );
    console.log(`Catalog integration: ${checks} checks passed.`);
  } finally {
    try {
      for (const id of products)
        await db.query('DELETE FROM products WHERE "productID"=$1', [id]);
      for (const id of [...categories].reverse())
        await db.query('DELETE FROM categories WHERE "categoryID"=$1', [id]);
      for (const id of users)
        await db.query('DELETE FROM users WHERE id=$1', [id]);
    } finally {
      await app.close();
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
