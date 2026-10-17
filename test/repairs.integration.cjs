const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes, randomUUID } = require('node:crypto');

(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const db = app.get(DataSource);
  const suffix = randomBytes(6).toString('hex');
  const users = [];
  let checks = 0;
  const check = (value, message) => {
    assert.ok(value, message);
    checks++;
  };
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const call = (cookie) => {
    const result = request(server).post('/repairs').set(headers).timeout(30000);
    return cookie ? result.set('Cookie', cookie) : result;
  };
  const createUser = async (name) => {
    const username = `repair_${name}_${suffix}`;
    const response = await request(server)
      .post('/auth/register')
      .set(headers)
      .send({
        username,
        email: `${username}@example.com`,
        password: randomBytes(20).toString('hex'),
      })
      .expect(201);
    users.push(response.body.user.id);
    return {
      id: response.body.user.id,
      cookie: response.headers['set-cookie'][0].split(';')[0],
    };
  };
  const valid = {
    device: {
      deviceType: 'Washing Machine',
      brand: 'LG',
      model: 'F4V5VYP2T',
      serialNumber: ' SN-12345 ',
      purchaseDate: '2025-05-20',
    },
    problemDescription:
      'The drum stops during the spin cycle and displays an error code.',
  };

  try {
    const customer = await createUser('customer');
    const another = await createUser('another');
    const admin = await createUser('admin');
    const repairer = await createUser('repairer');
    await db.query('UPDATE users SET role=$1 WHERE id=$2', ['ADMIN', admin.id]);
    await db.query('UPDATE users SET role=$1 WHERE id=$2', [
      'REPAIRER',
      repairer.id,
    ]);

    await call().send(valid).expect(401);
    await call('appliances_session=invalid').send(valid).expect(401);
    await call(admin.cookie).send(valid).expect(403);
    await call(repairer.cookie).send(valid).expect(403);
    checks += 4;

    for (const invalid of [
      {},
      { problemDescription: valid.problemDescription },
      { ...valid, device: null },
      { ...valid, device: {} },
      { ...valid, problemDescription: 'short' },
      { ...valid, device: { ...valid.device, deviceType: 'x' } },
      { ...valid, device: { ...valid.device, brand: '' } },
      { ...valid, device: { ...valid.device, model: null } },
      { ...valid, device: { ...valid.device, purchaseDate: 'not-a-date' } },
      { ...valid, device: { ...valid.device, purchaseDate: '2999-01-01' } },
    ]) {
      await call(customer.cookie).send(invalid).expect(400);
      checks++;
    }

    for (const injected of [
      { customerId: another.id },
      { userId: another.id },
      { status: 'APPROVED' },
      { assignedRepairerId: repairer.id },
      { reference: 'RPR-CLIENT' },
    ]) {
      await call(customer.cookie).send({ ...valid, ...injected }).expect(400);
      checks++;
    }

    const created = (await call(customer.cookie).send(valid).expect(201)).body;
    checks++;
    check(created.customerId === customer.id, 'JWT customer owns the ticket');
    check(created.status === 'PENDING', 'New ticket starts PENDING');
    check(
      /^RPR-\d{8}-[A-F0-9]{8}$/.test(created.reference),
      'Server returns a human-readable unique reference',
    );
    check(
      created.device.serialNumber === 'SN-12345' &&
        created.device.deviceType === 'Washing Machine',
      'Validated device information is normalized and returned',
    );
    check(
      created.assignedRepairerId === null && created.reviewedAt === null,
      'Ticket is ready for future review and assignment',
    );
    check(
      !('customer' in created) && !('passwordHash' in created),
      'Response does not expose user internals',
    );

    const [stored] = await db.query(
      'SELECT * FROM repair_tickets WHERE id=$1',
      [created.id],
    );
    check(
      stored &&
        stored.customerId === customer.id &&
        stored.status === 'PENDING' &&
        stored.device.model === valid.device.model,
      'Ticket and device snapshot persist in PostgreSQL',
    );
    const second = (
      await call(customer.cookie)
        .send({
          device: {
            deviceType: 'Refrigerator',
            brand: 'Samsung',
            model: 'RT28',
          },
          problemDescription: 'The refrigerator is no longer cooling properly.',
        })
        .expect(201)
    ).body;
    checks++;
    check(second.reference !== created.reference, 'Ticket references are unique');
    check(
      second.customerId === customer.id && second.device.serialNumber === undefined,
      'Optional device fields may be omitted',
    );
    const [count] = await db.query(
      'SELECT count(*)::int AS count FROM repair_tickets WHERE "customerId"=$1',
      [customer.id],
    );
    check(count.count === 2, 'Both customer tickets persist independently');
    const [otherCount] = await db.query(
      'SELECT count(*)::int AS count FROM repair_tickets WHERE "customerId"=$1',
      [another.id],
    );
    check(otherCount.count === 0, 'Client-supplied ownership cannot create tickets');

    await call(customer.cookie)
      .send({ ...valid, unknown: randomUUID() })
      .expect(400);
    checks++;
    console.log(`PASS: ${checks} repair integration checks`);
  } finally {
    for (const id of users)
      await db.query('DELETE FROM repair_tickets WHERE "customerId"=$1', [id]);
    for (const id of users)
      await db.query('DELETE FROM users WHERE id=$1', [id]);
    await app.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
