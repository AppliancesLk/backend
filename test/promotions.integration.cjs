const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes, randomUUID } = require('node:crypto');
const { registerVerified } = require('./helpers/register-verified.cjs');
const { mockEmail, getMessages } = require('./helpers/mock-email.cjs');
process.env.PROMOTION_QUEUE_KEY = `integration-${randomUUID()}`;
(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const {
    PromotionWorker,
  } = require('../dist/promotions/services/promotion-worker.service');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  let failTo = '',
    failReason = 'recipient_rejected';
  mockEmail(app, async (message) => ({
    sent: message.to !== failTo,
    reason: message.to === failTo ? failReason : undefined,
  }));
  await app.init();
  const db = app.get(DataSource),
    worker = app.get(PromotionWorker),
    server = app.getHttpServer();
  const users = [],
    campaigns = [],
    runs = [];
  let categoryId,
    productId,
    checks = 0,
    operation = 'setup';
  const suffix = randomBytes(5).toString('hex');
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const call = (method, path, cookie) => {
    operation = `${method} ${path}`;
    const req = request(server)[method](path).set(headers).timeout(30000);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const check = (value, label) => {
    assert.ok(value, label);
    checks++;
  };
  async function account(label) {
    const email = `promotion_${label}_${suffix}@example.com`;
    const response = await registerVerified(app, {
      username: `promotion_${label}_${suffix}`,
      email,
      password: randomBytes(12).toString('hex'),
    });
    users.push(response.body.user.id);
    return {
      id: response.body.user.id,
      email,
      cookie: response.headers['set-cookie'][0].split(';')[0],
    };
  }
  async function drain(id) {
    for (let i = 0; i < 1000; i++) {
      await worker.processBatch();
      const [run] = await db.query(
        'SELECT status FROM promotion_runs WHERE id=$1',
        [id],
      );
      if (!['QUEUED', 'SENDING'].includes(run.status)) return;
    }
    const counts = await db.query(
      'SELECT status, count(*) FROM promotion_recipients WHERE "runId"=$1 GROUP BY status',
      [id],
    );
    throw new Error(`Queue did not finish: ${JSON.stringify(counts)}`);
  }
  try {
    const admin = await account('admin'),
      first = await account('first'),
      second = await account('second'),
      disabled = await account('disabled'),
      pending = await account('pending');
    await db.query('UPDATE users SET role=$1 WHERE id=$2', ['ADMIN', admin.id]);
    await db.query(
      'UPDATE users SET "isActive"=false, "deactivatedAt"=now() WHERE id=$1',
      [disabled.id],
    );
    await db.query(
      'UPDATE users SET "isActive"=false, "emailVerifiedAt"=null WHERE id=$1',
      [pending.id],
    );
    categoryId = (
      await call('post', '/categories', admin.cookie)
        .send({ name: `Promotion ${suffix}` })
        .expect(201)
    ).body.categoryID;
    productId = (
      await call('post', '/products', admin.cookie)
        .send({
          name: `Promotion washer ${suffix}`,
          SKU: `PROMO-${suffix}`,
          price: 12345,
          stockQty: 5,
          categoryID: categoryId,
          images: ['https://assets.example.com/washer.jpg'],
        })
        .expect(201)
    ).body.productID;
    const input = {
      subject: `A special offer ${suffix}`,
      headline: 'A little more for your home',
      preheader: 'Selected appliances for you',
      body: 'Hello & welcome.\n\n<script>unsafe()</script>\nDiscover something useful.',
      buttonText: 'Explore the offers',
      buttonUrl: '',
      footerNote: 'While stocks last.',
      audience: 'SELECTED',
      userIds: [first.id, second.id],
      productIds: [productId],
    };
    await call('get', '/admin/promotions').expect(401);
    checks++;
    await call('get', '/admin/promotions', first.cookie).expect(403);
    checks++;
    await call('post', '/admin/promotions/preview', first.cookie)
      .send(input)
      .expect(403);
    checks++;
    for (const bad of [
      { ...input, subject: 'bad\r\nBcc: someone@example.com' },
      { ...input, productIds: Array(13).fill(productId) },
      { ...input, buttonUrl: 'javascript:alert(1)' },
      { ...input, userIds: ['not-a-uuid'] },
      { ...input, to: 'injected@example.com' },
    ]) {
      await call('post', '/admin/promotions/preview', admin.cookie)
        .send(bad)
        .expect(400);
      checks++;
    }
    const mailCount = getMessages(app).length;
    const preview = (
      await call('post', '/admin/promotions/preview', admin.cookie)
        .send(input)
        .expect(200)
    ).body;
    check(
      preview.recipientCount === 2 && preview.excludedCount === 0,
      'selected recipient count is authoritative',
    );
    const uppercase = (
      await call('post', '/admin/promotions/preview', admin.cookie)
        .send({
          ...input,
          userIds: input.userIds.map((id) => id.toUpperCase()),
          productIds: input.productIds.map((id) => id.toUpperCase()),
        })
        .expect(200)
    ).body;
    check(
      uppercase.recipientCount === 2 && uppercase.products[0].id === productId,
      'valid UUIDs are normalized before product resolution',
    );
    check(
      preview.html.includes('&lt;script&gt;') &&
        !preview.html.includes('<script>unsafe'),
      'custom text is escaped',
    );
    check(
      preview.html.includes('washer.jpg') &&
        preview.text.includes('LKR 12,345.00') &&
        preview.html.includes(`/products/${productId}`),
      'preview includes product images, prices and links',
    );
    check(
      preview.html.includes('data:image/png;base64,') &&
        getMessages(app).length === mailCount,
      'preview embeds the brand and sends no email',
    );
    const exclusions = (
      await call('post', '/admin/promotions/preview', admin.cookie)
        .send({ ...input, userIds: [first.id, disabled.id, pending.id] })
        .expect(200)
    ).body;
    check(
      exclusions.recipientCount === 1 && exclusions.excludedCount === 2,
      'inactive and unverified accounts are excluded',
    );
    let campaign = (
      await call('post', '/admin/promotions', admin.cookie)
        .send(input)
        .expect(201)
    ).body;
    campaigns.push(campaign.id);
    check(
      campaign.runs.length === 0 &&
        !JSON.stringify(campaign).includes('passwordHash'),
      'new draft is private and unsent',
    );
    const listed = (
      await call(
        'get',
        `/admin/promotions?search=${suffix}`,
        admin.cookie,
      ).expect(200)
    ).body;
    check(
      listed.items.some((item) => item.id === campaign.id),
      'draft appears in paginated history',
    );
    campaign = (
      await call('patch', `/admin/promotions/${campaign.id}`, admin.cookie)
        .send({ ...input, version: campaign.version })
        .expect(200)
    ).body;
    await call('patch', `/admin/promotions/${campaign.id}`, admin.cookie)
      .send({ ...input, version: campaign.version - 1 })
      .expect(409);
    checks++;
    const send = {
      version: campaign.version,
      requestId: randomUUID(),
      expectedRecipients: 2,
    };
    await call('post', `/admin/promotions/${campaign.id}/send`, first.cookie)
      .send(send)
      .expect(403);
    checks++;
    await call('post', `/admin/promotions/${campaign.id}/send`, admin.cookie)
      .send({ ...send, expectedRecipients: 1 })
      .expect(409);
    checks++;
    const [queued, duplicate] = await Promise.all([
      call('post', `/admin/promotions/${campaign.id}/send`, admin.cookie)
        .send(send)
        .expect(202),
      call('post', `/admin/promotions/${campaign.id}/send`, admin.cookie)
        .send(send)
        .expect(202),
    ]);
    runs.push(queued.body.id);
    check(
      queued.body.id === duplicate.body.id,
      'concurrent duplicate submissions create one send',
    );
    await call('post', `/admin/promotions/${campaign.id}/send`, admin.cookie)
      .send({ ...send, requestId: randomUUID() })
      .expect(409);
    checks++;
    campaign = (
      await call('patch', `/admin/promotions/${campaign.id}`, admin.cookie)
        .send({
          ...input,
          subject: 'A revised promotion',
          version: campaign.version,
        })
        .expect(200)
    ).body;
    await call('patch', `/products/${productId}`, admin.cookie)
      .send({ price: 15000 })
      .expect(200);
    await db.query(
      'UPDATE users SET "isActive"=false, "deactivatedAt"=now() WHERE id=$1',
      [second.id],
    );
    await drain(queued.body.id);
    const report = (
      await call(
        'get',
        `/admin/promotions/${campaign.id}/runs/${queued.body.id}`,
        admin.cookie,
      ).expect(200)
    ).body;
    check(
      report.counts.SENT === 1 && report.counts.SKIPPED === 1,
      'eligibility is checked again before sending',
    );
    check(
      report.preview.subject === input.subject &&
        report.preview.text.includes('12,345.00'),
      'sent content and prices remain immutable after edits',
    );
    const messages = getMessages(app).filter(
      (mail) => mail.subject === input.subject,
    );
    check(
      messages.length === 1 &&
        messages[0].to === first.email &&
        !('bcc' in messages[0]),
      'delivery is individual and excludes disabled recipients',
    );
    await worker.processBatch();
    check(
      getMessages(app).filter((mail) => mail.subject === input.subject)
        .length === 1,
      'completed jobs are not resent',
    );
    await db.query(
      'UPDATE users SET "isActive"=true, "deactivatedAt"=null WHERE id=$1',
      [second.id],
    );
    failTo = second.email;
    const resend = (
      await call('post', `/admin/promotions/${campaign.id}/send`, admin.cookie)
        .send({
          version: campaign.version,
          requestId: randomUUID(),
          expectedRecipients: 2,
        })
        .expect(202)
    ).body;
    runs.push(resend.id);
    await drain(resend.id);
    const failed = (
      await call(
        'get',
        `/admin/promotions/${campaign.id}/runs/${resend.id}`,
        admin.cookie,
      ).expect(200)
    ).body;
    check(
      failed.status === 'PARTIAL' &&
        failed.counts.SENT === 1 &&
        failed.counts.FAILED === 1,
      'resends have their own accurate failure report',
    );
    check(
      failed.preview.subject === 'A revised promotion' &&
        failed.preview.text.includes('15,000.00'),
      'resends use current edited content and current product prices',
    );
    failReason = 'ETIMEDOUT';
    const uncertain = (
      await call('post', `/admin/promotions/${campaign.id}/send`, admin.cookie)
        .send({
          version: campaign.version,
          requestId: randomUUID(),
          expectedRecipients: 2,
        })
        .expect(202)
    ).body;
    runs.push(uncertain.id);
    await db.query('UPDATE promotion_runs SET "queueKey"=$1 WHERE id=$2', [
      `other-test-${randomUUID()}`,
      uncertain.id,
    ]);
    const beforeForeign = getMessages(app).length;
    await worker.processBatch();
    check(
      getMessages(app).length === beforeForeign,
      'workers never consume a different queue namespace',
    );
    await db.query('UPDATE promotion_runs SET "queueKey"=$1 WHERE id=$2', [
      process.env.PROMOTION_QUEUE_KEY,
      uncertain.id,
    ]);
    await drain(uncertain.id);
    const uncertainReport = (
      await call(
        'get',
        `/admin/promotions/${campaign.id}/runs/${uncertain.id}`,
        admin.cookie,
      ).expect(200)
    ).body;
    check(
      uncertainReport.counts.UNKNOWN === 1 && uncertainReport.counts.SENT === 1,
      'SMTP timeouts are reported as uncertain rather than definite failures',
    );
    failTo = '';
    const stale = (
      await call('post', `/admin/promotions/${campaign.id}/send`, admin.cookie)
        .send({
          version: campaign.version,
          requestId: randomUUID(),
          expectedRecipients: 2,
        })
        .expect(202)
    ).body;
    runs.push(stale.id);
    await db.query(
      `UPDATE promotion_recipients SET status='PROCESSING', "claimedAt"=now()-interval '16 minutes' WHERE "runId"=$1`,
      [stale.id],
    );
    const beforeRecovery = getMessages(app).length;
    await drain(stale.id);
    const recovered = (
      await call(
        'get',
        `/admin/promotions/${campaign.id}/runs/${stale.id}`,
        admin.cookie,
      ).expect(200)
    ).body;
    check(
      recovered.counts.UNKNOWN === 2 &&
        getMessages(app).length === beforeRecovery,
      'interrupted SMTP attempts become unknown without automatic duplicates',
    );
    const all = { ...input, audience: 'ALL', userIds: [] };
    const allPreview = (
      await call('post', '/admin/promotions/preview', admin.cookie)
        .send(all)
        .expect(200)
    ).body;
    check(
      allPreview.recipientCount >= 3,
      'all-users audience includes active verified accounts',
    );
    campaign = (
      await call('patch', `/admin/promotions/${campaign.id}`, admin.cookie)
        .send({ ...all, version: campaign.version })
        .expect(200)
    ).body;
    const allRun = (
      await call('post', `/admin/promotions/${campaign.id}/send`, admin.cookie)
        .send({
          version: campaign.version,
          requestId: randomUUID(),
          expectedRecipients: allPreview.recipientCount,
        })
        .expect(202)
    ).body;
    runs.push(allRun.id);
    await drain(allRun.id);
    const allReport = (
      await call(
        'get',
        `/admin/promotions/${campaign.id}/runs/${allRun.id}`,
        admin.cookie,
      ).expect(200)
    ).body;
    check(
      allReport.counts.SENT === allPreview.recipientCount &&
        allReport.recipients.every(
          (user) => ![disabled.email, pending.email].includes(user.email),
        ),
      'all-users delivery uses eligible recipients only',
    );
    check(
      (
        await call(
          'get',
          `/admin/promotions/${campaign.id}`,
          admin.cookie,
        ).expect(200)
      ).body.runs.length === 5,
      'all resend attempts remain in history',
    );
    console.log(
      `Promotions integration: ${checks} checks passed (real HTTP/auth/PostgreSQL, isolated queue and mocked SMTP).`,
    );
  } catch (error) {
    console.error(
      `Promotions integration failed after ${checks} checks at ${operation}: ${error.message}`,
    );
    process.exitCode = 1;
  } finally {
    if (runs.length)
      await db.query(
        `DELETE FROM notifications WHERE type='PROMOTION' AND split_part("eventKey", ':', 3)=ANY($1::text[])`,
        [runs],
      );
    if (campaigns.length)
      await db.query('DELETE FROM promotions WHERE id=ANY($1::uuid[])', [
        campaigns,
      ]);
    if (users.length)
      await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
    if (productId)
      await db.query('DELETE FROM products WHERE "productID"=$1', [productId]);
    if (categoryId)
      await db.query('DELETE FROM categories WHERE "categoryID"=$1', [
        categoryId,
      ]);
    await app.close();
  }
})().catch((error) => {
  console.error(
    `Unable to initialize or clean up promotion fixtures (${error.code ?? error.name}).`,
  );
  process.exitCode = 1;
});
