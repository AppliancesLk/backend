const { registerVerified } = require('./helpers/register-verified.cjs');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const request = require('supertest');
const { io } = require('socket.io-client');

(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { configureApp } = require('../dist/app.setup');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app); require('./helpers/mock-email.cjs').mockEmail(app);
  await app.listen(0, '127.0.0.1');
  const db = app.get(DataSource), server = app.getHttpServer();
  const origin = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const url = `http://127.0.0.1:${server.address().port}/chat`;
  const headers = { Origin: origin, 'X-Requested-With': 'XMLHttpRequest' };
  const users = [], sockets = [];
  const suffix = randomBytes(6).toString('hex');
  let checks = 0;
  const check = (value, label) => { assert.ok(value, label); checks++; };
  const call = (method, path, cookie) => { const req = request(server)[method](path).set(headers); return cookie ? req.set('Cookie', cookie) : req; };
  async function account(role) {
    const result = await registerVerified(app, { username: `chat_${role}_${suffix}`, email: `chat_${role}_${suffix}@example.com`, password: randomBytes(15).toString('hex') });
    users.push(result.body.user.id);
    if (role === 'admin' || role === 'repairer') await db.query('UPDATE users SET role=$1 WHERE id=$2', [role.toUpperCase(), result.body.user.id]);
    return { ...result.body.user, cookie: result.headers['set-cookie'][0].split(';')[0] };
  }
  function connect(cookie, extra = {}) {
    const socket = io(url, { transports: ['websocket'], autoConnect: false, reconnection: false, extraHeaders: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, ...extra });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.disconnect(); reject(new Error('Socket connect timed out')); }, 8000);
      socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
      socket.once('connect_error', (error) => { clearTimeout(timer); socket.disconnect(); reject(error); });
      socket.connect();
    });
  }
  function event(socket, name, data) {
    return new Promise((resolve, reject) => socket.timeout(10000).emit(name, data, (error, result) => error ? reject(new Error('Socket acknowledgement timed out')) : resolve(result)));
  }
  async function waitUntil(condition) {
    const until = Date.now() + 4000;
    while (!condition()) { if (Date.now() >= until) throw new Error('Expected realtime event was not received'); await new Promise((resolve) => setTimeout(resolve, 10)); }
  }
  async function create(user) { return (await call('post', '/chats', user.cookie).send({}).expect(201)).body; }
  const payload = (sessionId, content) => ({ sessionId, content, clientMessageId: randomUUID() });
  try {
    const alice = await account('alice'), bob = await account('bob'), admin = await account('admin'), repairer = await account('repairer');
    await call('post', '/chats').send({}).expect(401);
    await call('post', '/chats', admin.cookie).send({}).expect(403);
    await call('get', '/chats', repairer.cookie).expect(403);
    await call('get', '/admin/chats', alice.cookie).expect(403);
    await call('post', '/chats', alice.cookie).send({ customerId: bob.id }).expect(400); checks += 5;
    for (const args of [[undefined, { auth: { userId: admin.id, role: 'ADMIN' } }], ['appliances_session=invalid', {}], [repairer.cookie, { auth: { role: 'ADMIN' } }], [alice.cookie, { extraHeaders: { Cookie: alice.cookie, Origin: 'https://untrusted.example' } }]]) {
      await assert.rejects(connect(...args)); checks++;
    }
    const a = await connect(alice.cookie), b = await connect(bob.cookie), staff = await connect(admin.cookie);
    const aReceived = [], bReceived = [], staffReceived = [], limits = [];
    a.on('chat:message:new', (data) => aReceived.push(data)); b.on('chat:message:new', (data) => bReceived.push(data)); staff.on('chat:message:new', (data) => staffReceived.push(data));
    a.on('chat:limit:reached', (session) => limits.push(['alice', session.id])); staff.on('chat:limit:reached', (session) => limits.push(['admin', session.id]));
    const first = await create(alice), other = await create(bob);
    check(first.session.customerId === alice.id && first.session.status === 'OPEN', 'customer creates own open session');
    const own = (await call('get', '/chats', alice.cookie).expect(200)).body;
    check(own.items.length === 1 && own.items[0].id === first.session.id, 'customer retrieves only own sessions');
    await call('get', `/chats/${first.session.id}`, bob.cookie).expect(403);
    await call('get', `/chats/${first.session.id}/messages`, bob.cookie).expect(403);
    await call('get', '/chats/not-a-uuid', alice.cookie).expect(400);
    await call('get', `/chats/${randomUUID()}`, alice.cookie).expect(404); checks += 4;
    const adminList = (await call('get', '/admin/chats', admin.cookie).expect(200)).body;
    check(adminList.items.some((session) => session.id === first.session.id && session.customer.email === alice.email), 'admin list contains safe customer support information');
    check(!JSON.stringify(adminList).includes('passwordHash'), 'admin response excludes private authentication fields');
    await call('get', `/admin/chats/${first.session.id}`, admin.cookie).expect(200); checks++;
    check(!(await event(b, 'chat:join', { sessionId: first.session.id })).ok, 'customer cannot join another customer room');
    await event(a, 'chat:join', { sessionId: first.session.id }); await event(staff, 'chat:join', { sessionId: first.session.id }); await event(b, 'chat:join', { sessionId: other.session.id });
    for (const invalid of [{ sessionId: first.session.id, content: ' ', clientMessageId: randomUUID() }, payload(first.session.id, 'x'.repeat(2001)), { ...payload(first.session.id, 'file'), attachment: 'image.png' }, payload('invalid', 'Hi')]) {
      check((await event(a, 'chat:message', invalid)).error.statusCode === 400, 'invalid/attachment messages rejected');
    }
    check((await event(b, 'chat:message', payload(first.session.id, 'unauthorized'))).error.statusCode === 403, 'cross-customer sending denied');
    const sent = payload(first.session.id, '  Hello support  ');
    const delivered = await event(a, 'chat:message', sent);
    check(delivered.ok && delivered.data.message.content === 'Hello support' && delivered.data.message.sequence === 1, 'customer message is normalized and saved before ack');
    await waitUntil(() => staffReceived.some((data) => data.message.id === delivered.data.message.id));
    check(bReceived.length === 0 && aReceived.length === 1, 'only the authorized chat room receives content');
    const read = await event(staff, 'chat:read', { sessionId: first.session.id });
    check(read.data.adminUnreadCount === 0, 'admin read resets team unread count');
    const reply = await event(staff, 'chat:message', payload(first.session.id, 'How can we help?'));
    await waitUntil(() => aReceived.some((data) => data.message.id === reply.data.message.id));
    check(reply.ok && reply.data.message.senderRole === 'ADMIN' && reply.data.session.customerUnreadCount === 1, 'admin response reaches customer with unread indication');
    const retry = await event(a, 'chat:message', { ...sent, content: 'Hello support' });
    check(retry.ok && retry.data.message.id === delivered.data.message.id, 'retry does not duplicate the persisted message');
    check((await event(a, 'chat:message', { ...sent, content: 'changed' })).error.statusCode === 409, 'request ID cannot be reused for other text');
    const messages = (await call('get', `/chats/${first.session.id}/messages`, alice.cookie).expect(200)).body;
    check(messages.length === 2 && messages[0].sequence === 1 && messages[1].sequence === 2, 'persisted history includes both senders in chronological order');
    check((await db.query('SELECT count(*)::int AS count FROM chat_messages WHERE "chatSessionId"=$1', [first.session.id]))[0].count === 2, 'messages persist in PostgreSQL');
    await call('patch', `/admin/chats/${first.session.id}/close`, alice.cookie).expect(403);
    await call('patch', `/admin/chats/${first.session.id}/close`, admin.cookie).expect(200);
    check((await event(a, 'chat:message', payload(first.session.id, 'After close'))).error.statusCode === 409, 'closed session rejects new messages');
    const retained = [first.session.id];
    for (let index = 0; index < 4; index++) retained.push((await create(alice)).session.id);
    check((await call('get', '/chats', alice.cookie)).body.total === 5, 'customer retains sessions one through five');
    const sixth = await create(alice);
    check(sixth.removedSessionIds.includes(first.session.id), 'sixth session deletes the oldest customer session');
    check((await db.query('SELECT count(*)::int AS count FROM chat_messages WHERE "chatSessionId"=$1', [first.session.id]))[0].count === 0, 'oldest session messages cascade-delete');
    const after = (await call('get', '/chats', alice.cookie)).body.items.map((session) => session.id);
    check(after.length === 5 && after.includes(sixth.session.id) && retained.slice(1).every((id) => after.includes(id)), 'sessions two through six remain');
    check((await call('get', '/chats', bob.cookie)).body.items.some((session) => session.id === other.session.id), 'another customer session is not deleted');
    await Promise.all(Array.from({ length: 4 }, () => create(alice)));
    check((await call('get', '/chats', alice.cookie)).body.total === 5, 'concurrent creation cannot exceed five retained sessions');
    const capped = (await create(alice)).session;
    await event(a, 'chat:join', { sessionId: capped.id }); await event(staff, 'chat:join', { sessionId: capped.id });
    for (let index = 1; index <= 98; index++) {
      const response = await event(index % 2 ? a : staff, 'chat:message', payload(capped.id, `Limit test message ${index}`));
      assert.ok(response.ok, 'messages below limit accepted');
    }
    const lastPayloads = [payload(capped.id, 'Concurrent 99'), payload(capped.id, 'Concurrent 100'), payload(capped.id, 'Concurrent 101')];
    const last = await Promise.all(lastPayloads.map((data, index) => event(index % 2 ? a : staff, 'chat:message', data)));
    check(last.filter((result) => result.ok).length === 2 && last.filter((result) => !result.ok).length === 1, 'concurrent customer/admin sends accept exactly messages 99 and 100');
    const limited = (await call('get', `/chats/${capped.id}`, alice.cookie)).body;
    check(limited.status === 'CLOSED' && limited.messageCount === 100, '100 combined messages close the session');
    check((await event(a, 'chat:message', payload(capped.id, 'Message 101'))).error.message.includes('100-message'), 'message 101 gets a clear limit error');
    const cappedMessages = (await call('get', `/chats/${capped.id}/messages`, alice.cookie)).body;
    check(cappedMessages.length === 100 && new Set(cappedMessages.map((message) => message.sequence)).size === 100, 'database contains exactly 100 ordered messages');
    await waitUntil(() => limits.filter(([, id]) => id === capped.id).length === 2);
    checks++;
    const open = (await create(alice)).session;
    await event(a, 'chat:join', { sessionId: open.id }); await event(staff, 'chat:join', { sessionId: open.id });
    const beforeLogout = aReceived.length;
    await call('post', '/auth/logout', alice.cookie).expect(201);
    await event(staff, 'chat:message', payload(open.id, 'Reply after customer logout'));
    await waitUntil(() => !a.connected);
    check(aReceived.length === beforeLogout, 'revoked cookie sessions receive no new room content');
    console.log(`Live chat integration: ${checks} checks passed (real HTTP, cookies, Socket.IO, PostgreSQL, concurrent limits).`);
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (users.length) { await db.query('DELETE FROM chat_sessions WHERE "customerId"=ANY($1::uuid[])', [users]); await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]); }
    await app.close();
  }
})().catch((error) => { console.error('Live chat integration failed:', error.message); process.exitCode = 1; });
