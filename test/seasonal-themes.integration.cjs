const assert = require('node:assert/strict');
const request = require('supertest');
const { randomBytes } = require('node:crypto');
const { registerVerified } = require('./helpers/register-verified.cjs');
(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  require('./helpers/mock-email.cjs').mockEmail(app);
  await app.init();
  const db = app.get(DataSource),
    server = app.getHttpServer();
  const backup = (
    await db.query('SELECT * FROM storefront_theme WHERE id=1')
  )[0];
  const users = [];
  let adminId,
    checks = 0,
    operation = '';
  const headers = {
    Origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const call = (method, path, cookie) => {
    operation = `${method.toUpperCase()} ${path}`;
    const req = request(server)[method](path).set(headers);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const check = (value, label) => {
    assert.ok(value, label);
    checks++;
  };
  let settings;
  const input = (theme, extra = {}) => ({
    theme,
    headline: '',
    message: '',
    decorations: true,
    animations: true,
    showGreeting: true,
    startsAt: null,
    endsAt: null,
    version: settings.version,
    ...extra,
  });
  try {
    const suffix = randomBytes(5).toString('hex');
    const create = async (role) => {
      const response = await registerVerified(app, {
        username: `theme_${role}_${suffix}`,
        email: `theme_${role}_${suffix}@example.com`,
        password: randomBytes(12).toString('hex'),
      });
      users.push(response.body.user.id);
      if (role === 'admin') {
        adminId = response.body.user.id;
        await db.query('UPDATE users SET role=$1 WHERE id=$2', [
          'ADMIN',
          adminId,
        ]);
      }
      return response.headers['set-cookie'][0].split(';')[0];
    };
    const admin = await create('admin'),
      customer = await create('customer');
    settings = (await call('get', '/storefront-theme/admin', admin).expect(200))
      .body;
    await call('get', '/storefront-theme/admin').expect(401);
    checks++;
    await call('get', '/storefront-theme/admin', customer).expect(403);
    checks++;
    await call('put', '/storefront-theme/admin')
      .send(input('CHRISTMAS'))
      .expect(401);
    checks++;
    await call('put', '/storefront-theme/admin', customer)
      .send(input('CHRISTMAS'))
      .expect(403);
    checks++;
    for (const invalid of [
      input('UNSUPPORTED'),
      input('CHRISTMAS', { headline: 'a'.repeat(81) }),
      input('CHRISTMAS', { startsAt: '2026-12-24T12:00' }),
      input('CHRISTMAS', { decorations: 'yes' }),
      input('CHRISTMAS', { animations: 'yes' }),
      input('CHRISTMAS', { version: -1 }),
    ]) {
      await call('put', '/storefront-theme/admin', admin)
        .send(invalid)
        .expect(400);
      checks++;
    }
    for (const theme of [
      'DEFAULT',
      'AVURUDU',
      'CHRISTMAS',
      'HALLOWEEN',
      'EASTER',
    ]) {
      const previousVersion = settings.version;
      settings = (
        await call('put', '/storefront-theme/admin', admin)
          .send(input(theme))
          .expect(200)
      ).body;
      const live = (await call('get', '/storefront-theme').expect(200)).body;
      check(
        live.theme === theme && settings.version === previousVersion + 1,
        `${theme} is persisted and publicly resolved`,
      );
      check(
        !('updatedBy' in live) &&
          !('version' in live) &&
          !('editor' in settings),
        'public settings omit internal metadata',
      );
      if (theme === 'DEFAULT')
        check(
          !live.decorations &&
            !live.showGreeting &&
            !live.headline &&
            !live.animations,
          'default adds no seasonal content',
        );
      else
        check(
          live.headline &&
            live.message &&
            live.decorations &&
            live.showGreeting &&
            live.animations,
          'seasonal defaults are complete',
        );
    }
    await call('put', '/storefront-theme/admin', admin)
      .send(input('CHRISTMAS', { version: settings.version - 1 }))
      .expect(409);
    checks++;
    settings = (
      await call('put', '/storefront-theme/admin', admin)
        .send(
          input('CHRISTMAS', {
            headline: '<script>Sample</script>',
            message: 'Peace & joy',
            showGreeting: false,
            decorations: false,
            animations: false,
          }),
        )
        .expect(200)
    ).body;
    check(
      settings.active.headline === '<script>Sample</script>' &&
        !settings.active.decorations &&
        !settings.active.showGreeting &&
        !settings.active.animations,
      'custom text remains plain data and visibility controls are independent',
    );
    const startsAt = new Date(Date.now() + 60_000).toISOString(),
      endsAt = new Date(Date.now() + 120_000).toISOString();
    await call('put', '/storefront-theme/admin', admin)
      .send(input('CHRISTMAS', { startsAt: endsAt, endsAt: startsAt }))
      .expect(400);
    checks++;
    await call('put', '/storefront-theme/admin', admin)
      .send(input('CHRISTMAS', { endsAt: new Date(0).toISOString() }))
      .expect(400);
    checks++;
    settings = (
      await call('put', '/storefront-theme/admin', admin)
        .send(input('CHRISTMAS', { startsAt, endsAt }))
        .expect(200)
    ).body;
    let live = (await call('get', '/storefront-theme').expect(200)).body;
    check(
      live.theme === 'DEFAULT' &&
        live.nextChangeAt === startsAt &&
        !live.decorations,
      'a future theme waits until its scheduled start',
    );
    await db.query(
      `UPDATE storefront_theme SET "startsAt"=now()-interval '1 minute' WHERE id=1`,
    );
    live = (await call('get', '/storefront-theme').expect(200)).body;
    check(
      live.theme === 'CHRISTMAS' && live.nextChangeAt === endsAt,
      'a scheduled theme activates without a worker',
    );
    await db.query(
      `UPDATE storefront_theme SET "endsAt"=now()-interval '1 second' WHERE id=1`,
    );
    live = (await call('get', '/storefront-theme').expect(200)).body;
    check(
      live.theme === 'DEFAULT' && live.nextChangeAt === null,
      'an ended theme automatically returns to default',
    );
    settings = (await call('get', '/storefront-theme/admin', admin).expect(200))
      .body;
    settings = (
      await call('put', '/storefront-theme/admin', admin)
        .send(
          input('DEFAULT', {
            headline: 'ignored',
            message: 'ignored',
            startsAt,
            endsAt,
          }),
        )
        .expect(200)
    ).body;
    check(
      !settings.headline &&
        !settings.message &&
        settings.startsAt === null &&
        settings.endsAt === null,
      'restoring default clears seasonal text and scheduling',
    );
    console.log(
      `Seasonal theme integration: ${checks} checks passed (real HTTP, auth and PostgreSQL; SMTP mocked).`,
    );
  } catch (error) {
    console.error(
      `Seasonal theme integration failed after ${checks} checks at ${operation}: ${error.message}`,
    );
    process.exitCode = 1;
  } finally {
    if (backup && adminId)
      await db.query(
        `UPDATE storefront_theme SET theme=$1, headline=$2, message=$3, "showGreeting"=$4, decorations=$5, "startsAt"=$6, "endsAt"=$7, version=$8, "updatedBy"=$9, "updatedAt"=$10, animations=$11 WHERE id=1 AND "updatedBy"=$12`,
        [
          backup.theme,
          backup.headline,
          backup.message,
          backup.showGreeting,
          backup.decorations,
          backup.startsAt,
          backup.endsAt,
          backup.version,
          backup.updatedBy,
          backup.updatedAt,
          backup.animations,
          adminId,
        ],
      );
    if (users.length)
      await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
    await app.close();
  }
})().catch((error) => {
  console.error(
    `Unable to initialize or clean up seasonal theme fixtures (${error.code ?? error.name}).`,
  );
  process.exitCode = 1;
});
