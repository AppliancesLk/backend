const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
(async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'appliances-media-'),
  );
  process.env.MEDIA_UPLOAD_DIR = directory;
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
  const users = [],
    categories = [],
    products = [],
    orders = [],
    uploaded = [];
  const suffix = randomBytes(6).toString('hex');
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  let checks = 0;
  const call = (method, url, cookie) => {
    const req = request(server)[method](url).set(headers);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const check = (value, message) => {
    assert.ok(value, message);
    checks++;
  };
  async function account(role) {
    const result = await call('post', '/auth/register')
      .send({
        username: `experience_${role}_${suffix}`,
        email: `${role}_${suffix}@example.com`,
        password: randomBytes(20).toString('hex'),
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
  try {
    const admin = await account('admin'),
      alice = await account('alice'),
      bob = await account('bob');
    const image = await sharp({
      create: { width: 320, height: 320, channels: 3, background: '#2563eb' },
    })
      .png()
      .toBuffer();
    await call('post', '/media/images')
      .attach('image', image, 'photo.png')
      .expect(401);
    checks++;
    await call('post', '/media/images', alice.cookie)
      .attach('image', image, 'photo.png')
      .expect(403);
    checks++;
    await call('post', '/media/images', admin.cookie)
      .attach('image', Buffer.from('<svg></svg>'), 'photo.png')
      .expect(400);
    checks++;
    await call('post', '/media/images', admin.cookie)
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'photo.png')
      .expect(413);
    checks++;
    const upload = await call('post', '/media/images', admin.cookie)
      .attach('image', image, 'photo.png')
      .expect(201);
    uploaded.push(upload.body.imageUrl.split('/').pop());
    const read = await call('get', upload.body.imageUrl).expect(200);
    check(
      read.headers['content-type'].includes('image/png'),
      'images are publicly served with image content type',
    );
    const category = await call('post', '/categories', admin.cookie)
      .send({
        name: `Photo category ${suffix}`,
        imageUrl: upload.body.imageUrl,
      })
      .expect(201);
    categories.push(category.body.categoryID);
    const child = await call('post', '/categories', admin.cookie)
      .send({ name: `Child ${suffix}`, parentID: categories[0] })
      .expect(201);
    categories.push(child.body.categoryID);
    await call('patch', `/categories/${categories[0]}`, admin.cookie)
      .send({ parentID: categories[1] })
      .expect(400);
    checks++;
    check(
      category.body.imageUrl === upload.body.imageUrl,
      'category image persisted',
    );
    const product = await call('post', '/products', admin.cookie)
      .send({
        name: `Experience ${suffix}`,
        SKU: `EXP-${suffix}`,
        price: 1000,
        categoryID: categories[0],
        stockQty: 5,
        images: [upload.body.imageUrl],
        description: 'A complete product description for integration testing.',
        features: ['USB-C charging', 'Portable design'],
        boxContents: ['Device', 'Cable'],
        warranty: 'Test warranty information',
        specifications: { Storage: '128 GB', Connectivity: { WiFi: true } },
      })
      .expect(201);
    const id = product.body.productID;
    products.push(id);
    check(
      product.body.features.length === 2 &&
        product.body.boxContents.length === 2 &&
        product.body.ratingCount === 0,
      'product content persisted without fabricated ratings',
    );
    await call('patch', `/products/${id}`, admin.cookie)
      .send({ ratingAverage: 5 })
      .expect(400);
    checks++;
    await call('patch', `/products/${id}`, admin.cookie)
      .send({ images: ['javascript:alert(1)'] })
      .expect(400);
    checks++;
    await call('patch', `/products/${id}`, admin.cookie)
      .send({ features: Array(21).fill('Feature') })
      .expect(400);
    checks++;
    const route = `/products/${id}/reviews`;
    const input = {
      rating: 5,
      title: 'Great product',
      body: 'I enjoyed using this test product every day.',
    };
    await call('post', route).send(input).expect(401);
    checks++;
    await call('post', route, admin.cookie).send(input).expect(403);
    checks++;
    await call('post', route, alice.cookie)
      .send({ ...input, verifiedPurchase: true })
      .expect(400);
    checks++;
    await call('post', route, alice.cookie)
      .send({ ...input, rating: 6 })
      .expect(400);
    checks++;
    const first = await call('post', route, alice.cookie)
      .send(input)
      .expect(201);
    check(
      first.body.rating === 5 && !first.body.verifiedPurchase,
      'customer review is saved with server-calculated purchase status',
    );
    await call('post', route, alice.cookie).send(input).expect(409);
    checks++;
    const concurrent = await Promise.all([
      call('post', route, bob.cookie).send({ ...input, rating: 1 }),
      call('put', route + '/mine', alice.cookie).send({ ...input, rating: 3 }),
    ]);
    check(
      concurrent[0].status === 201 && concurrent[1].status === 200,
      'concurrent review writes succeed',
    );
    const orderId = randomUUID();
    await db.query(
      `INSERT INTO orders (id,"customerId","idempotencyKey","requestHash","sourceCartId",status,currency,subtotal,total,delivery,"preparedAt") VALUES ($1,$2,$3,$4,$5,'DELIVERED','LKR',1000,1000,'{}'::jsonb,now())`,
      [orderId, alice.id, randomUUID(), '0'.repeat(64), randomUUID()],
    );
    orders.push(orderId);
    await db.query(
      'INSERT INTO order_items ("orderId","productId",name,"SKU",images,quantity,"unitPrice","lineTotal") VALUES ($1,$2,$3,$4,$5,1,1000,1000)',
      [orderId, id, product.body.name, product.body.SKU, []],
    );
    const verified = await call('put', route + '/mine', alice.cookie)
      .send({ ...input, rating: 3 })
      .expect(200);
    check(
      verified.body.verifiedPurchase === true,
      'delivered purchases produce verified reviews without trusting the client',
    );
    const listing = await call('get', route).expect(200);
    check(
      listing.body.summary.average === 2 && listing.body.summary.count === 2,
      'concurrent review aggregates remain correct',
    );
    check(
      listing.body.items.every(
        (item) =>
          item.title &&
          item.body &&
          item.author &&
          !('customerId' in item) &&
          !('email' in item) &&
          !('passwordHash' in item),
      ),
      'public reviews contain no sensitive account fields',
    );
    const detail = await call('get', `/products/${id}`).expect(200);
    check(
      Number(detail.body.ratingAverage) === 2 && detail.body.ratingCount === 2,
      'product summary matches reviews',
    );
    const mine = await call('get', route + '/mine', alice.cookie).expect(200);
    check(
      mine.body.id === first.body.id,
      'own review endpoint is scoped to the session',
    );
    await call('delete', route + '/' + first.body.id, bob.cookie).expect(403);
    checks++;
    await call('delete', route + '/' + first.body.id, admin.cookie).expect(200);
    checks++;
    const after = await call('get', route).expect(200);
    check(
      after.body.summary.average === 1 && after.body.summary.count === 1,
      'moderation updates rating totals',
    );
    await call('patch', `/products/${id}`, admin.cookie)
      .send({ isActive: false })
      .expect(200);
    await call('get', route).expect(404);
    checks++;
    await call('get', route + '/admin/all', admin.cookie).expect(200);
    checks++;
    await call('post', route, alice.cookie).send(input).expect(404);
    checks++;
    await call('patch', `/products/${id}`, admin.cookie)
      .send({ isActive: true })
      .expect(200);
    await call(
      'delete',
      route + '/' + after.body.items[0].id,
      bob.cookie,
    ).expect(200);
    checks++;
    const zero = await call('get', route).expect(200);
    check(
      zero.body.summary.count === 0 && zero.body.summary.average === 0,
      'deleting all reviews resets rating totals',
    );
    await call('patch', `/categories/${categories[0]}`, admin.cookie)
      .send({ imageUrl: null })
      .expect(200);
    checks++;
    console.log(`Product experience integration: ${checks} checks passed.`);
  } finally {
    try {
      for (const id of orders)
        await db.query('DELETE FROM orders WHERE id=$1', [id]);
      for (const id of products) {
        await db.query('DELETE FROM product_reviews WHERE "productId"=$1', [
          id,
        ]);
        await db.query('DELETE FROM products WHERE "productID"=$1', [id]);
      }
      for (const id of [...categories].reverse())
        await db.query('DELETE FROM categories WHERE "categoryID"=$1', [id]);
      for (const id of users)
        await db.query('DELETE FROM users WHERE id=$1', [id]);
      for (const filename of uploaded)
        await fs.unlink(path.join(directory, filename));
      await fs.rmdir(directory);
    } finally {
      await app.close();
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
