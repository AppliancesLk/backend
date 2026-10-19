const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const request = require('supertest');

(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { ServiceUnavailableException } = await import('@nestjs/common');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const { GeminiService } = require('../dist/ai/services/gemini.service');
  const { AiToolsService } = require('../dist/ai/services/ai-tools.service');
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  configureApp(app);
  await app.init();
  const db = app.get(DataSource),
    server = app.getHttpServer();
  const suffix = randomBytes(6).toString('hex');
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const users = [],
    products = [];
  let categoryId,
    captured,
    checks = 0;
  const call = (method, path, cookie) => {
    const req = request(server)[method](path).set(headers);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const check = (condition, label) => {
    assert.ok(condition, label);
    checks++;
  };
  async function account(role) {
    const result = await call('post', '/auth/register')
      .send({
        username: `ai_${role}_${suffix}`,
        email: `ai_${role}_${suffix}@example.com`,
        password: randomBytes(15).toString('hex'),
      })
      .expect(201);
    users.push(result.body.user.id);
    if (role === 'admin')
      await db.query('UPDATE users SET role=$1 WHERE id=$2', [
        'ADMIN',
        result.body.user.id,
      ]);
    return {
      id: result.body.user.id,
      cookie: result.headers['set-cookie'][0].split(';')[0],
    };
  }
  const gemini = app.get(GeminiService);
  gemini.generate = async (system, contents) => {
    captured = { system, contents: structuredClone(contents) };
    const last = contents.at(-1).parts[0];
    if (last.functionResponse)
      return {
        role: 'model',
        parts: [{ text: 'Here are the catalog options.' }],
      };
    if (last.text === 'FAIL')
      throw new ServiceUnavailableException(
        'The product assistant is temporarily unavailable. Please try again',
      );
    if (last.text === 'CHEAPER')
      return {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'searchProducts',
              args: { categoryId, maxPrice: 99, inStock: true },
            },
          },
        ],
      };
    if (last.text === 'UNSUPPORTED')
      return {
        role: 'model',
        parts: [{ functionCall: { name: 'addToCart', args: {} } }],
      };
    return {
      role: 'model',
      parts: [{ text: 'The catalog price is LKR 100.00 and stock is 3.' }],
    };
  };
  try {
    const admin = await account('admin'),
      alice = await account('alice'),
      bob = await account('bob');
    const category = await call('post', '/categories', admin.cookie)
      .send({ name: `AI test ${suffix}` })
      .expect(201);
    categoryId = category.body.categoryID;
    async function product(name, price, stockQty, isActive = true) {
      const result = await call('post', '/products', admin.cookie)
        .send({
          name: `${name} ${suffix}`,
          SKU: `${name}-${suffix}`,
          categoryID: categoryId,
          price,
          stockQty,
          isActive,
          brand: 'Samsung',
          specifications: { Capacity: '8 kg' },
        })
        .expect(201);
      products.push(result.body.productID);
      return result.body;
    }
    const current = await product('Current', 100, 3),
      cheaper = await product('Cheaper', 90, 2);
    await product('OutOfStock', 80, 0);
    await product('Inactive', 70, 4, false);
    const body = { productId: current.productID, message: 'Stock?' };
    await call('post', '/ai/chat').send(body).expect(401);
    checks++;
    for (const invalid of [
      { ...body, productId: 'bad' },
      { ...body, message: '   ' },
      { ...body, price: 1 },
      { ...body, message: 'x'.repeat(2001) },
    ]) {
      await call('post', '/ai/chat', alice.cookie).send(invalid).expect(400);
      checks++;
    }
    await call('post', '/ai/chat', alice.cookie)
      .send({ ...body, productId: randomUUID() })
      .expect(404);
    checks++;
    const answer = await call('post', '/ai/chat', alice.cookie)
      .send(body)
      .expect(201);
    const conversationId = answer.body.conversationId;
    check(
      captured.system.includes('"stockQty":3') &&
        captured.system.includes('"price":"100.00"'),
      'fresh backend product data',
    );
    check(
      !captured.system.includes(alice.id) &&
        !captured.system.includes('passwordHash'),
      'no private user context',
    );
    check(
      (
        await db.query('SELECT * FROM ai_messages WHERE "conversationId"=$1', [
          conversationId,
        ])
      ).length === 2,
      'persistent message pair',
    );
    await call('post', '/ai/chat', bob.cookie)
      .send({ ...body, conversationId })
      .expect(404);
    checks++;
    await call('post', '/ai/chat', alice.cookie)
      .send({ ...body, productId: cheaper.productID, conversationId })
      .expect(404);
    checks++;
    await call('post', '/ai/chat', alice.cookie)
      .send({ ...body, conversationId, message: 'CHEAPER' })
      .expect(201);
    check(
      captured.contents.some((turn) =>
        turn.parts.some((part) => part.text === 'Stock?'),
      ),
      'recent conversation included',
    );
    const tools = app.get(AiToolsService);
    const found = await tools.execute('searchProducts', {
      categoryId,
      maxPrice: 99,
      inStock: true,
    });
    check(
      found.length === 1 && found[0].productId === cheaper.productID,
      'availability and price filter',
    );
    const related = await tools.execute('getRelatedProducts', {
      productId: current.productID,
    });
    check(
      related.every((item) => item.productId !== current.productID) &&
        related.length <= 5 &&
        !related.some((item) => item.name.startsWith('Inactive')),
      'bounded related public products',
    );
    const comparison = await tools.execute('compareProducts', {
      productId: current.productID,
      otherProductId: cheaper.productID,
    });
    check(
      comparison.length === 2 &&
        comparison[0].specifications.Capacity === '8 kg',
      'trusted comparison data',
    );
    await call('post', '/ai/chat', alice.cookie)
      .send({ ...body, conversationId, message: 'UNSUPPORTED' })
      .expect(503);
    checks++;
    await call('post', '/ai/chat', alice.cookie)
      .send({ ...body, conversationId, message: 'FAIL' })
      .expect(503);
    checks++;
    check(
      (
        await db.query('SELECT * FROM ai_messages WHERE "conversationId"=$1', [
          conversationId,
        ])
      ).length === 4,
      'failed turns not persisted',
    );
    check(
      (
        await db.query('SELECT "stockQty" FROM products WHERE "productID"=$1', [
          current.productID,
        ])
      )[0].stockQty === 3,
      'AI never modifies stock',
    );
    check(
      (await db.query('SELECT * FROM carts WHERE "userId"=$1', [alice.id]))
        .length === 0,
      'AI never creates a cart',
    );
    await db.query(
      'UPDATE categories SET "isActive"=false WHERE "categoryID"=$1',
      [categoryId],
    );
    await call('post', '/ai/chat', bob.cookie).send(body).expect(404);
    checks++;
    console.log(
      `AI integration: ${checks} checks passed (Gemini mocked; real HTTP/auth/PostgreSQL/tools).`,
    );
  } finally {
    if (products.length)
      await db.query('DELETE FROM products WHERE "productID"=ANY($1::uuid[])', [
        products,
      ]);
    if (categoryId)
      await db.query('DELETE FROM categories WHERE "categoryID"=$1', [
        categoryId,
      ]);
    if (users.length)
      await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
    await app.close();
  }
})().catch((error) => {
  console.error('AI integration failed:', error.message);
  process.exitCode = 1;
});
