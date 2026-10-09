const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createAnalytics, sqliteStore, supabaseStore, parisDay } = require('../analytics');
const password = 'a-test-password-not-for-production';
const env = { ANALYTICS_ADMIN_PASSWORD: password, ANALYTICS_HASH_SECRET: 'test-hashing-secret-not-for-production-123456' };
const authorization = 'Basic ' + Buffer.from(`admin:${password}`).toString('base64');

async function setup(t, options = {}) {
  const filename = path.join(os.tmpdir(), `neover-audience-${randomUUID()}.sqlite`);
  const store = sqliteStore(filename);
  const analytics = createAnalytics({ env, store, clock: () => new Date('2026-10-09T12:00:00Z'), ...options });
  const app = express();
  app.use(express.json()); app.use(analytics.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    analytics.close();
    if (options.store === null) store.close();
    for (const file of [filename, filename + '-wal', filename + '-shm']) if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  return { base, store, filename,
    event: (body, origin = base) => fetch(base + '/api/audience/event', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) }),
    report: (auth = authorization, query = 'from=2026-10-09&to=2026-10-09') => fetch(base + '/api/audience/report?' + query, { headers: { authorization: auth } })
  };
}
const event = (extra = {}) => ({ consent: true, visitorId: randomUUID(), sessionId: randomUUID(), eventId: randomUUID(), page: '/', ...extra });

test('one visitor opening three pages counts once; new sessions and visitors are distinct', async t => {
  const ctx = await setup(t);
  const first = event();
  for (const page of ['/', '/services.html', '/contact.html']) assert.equal((await ctx.event({ ...first, eventId: randomUUID(), page })).status, 204);
  assert.equal((await ctx.event({ ...first, eventId: randomUUID(), sessionId: randomUUID() })).status, 204);
  const next = event();
  await ctx.event(next); await ctx.event(next);
  const data = await (await ctx.report()).json();
  assert.deepEqual(data.daily, [{ day: '2026-10-09', visitors: 2, visits: 3, views: 5 }]);
  assert.equal(data.pages.length, 3);
  assert.equal(JSON.stringify(data).includes(first.visitorId), false);
});

test('rejects missing consent, invalid pages, invalid IDs and cross-site events', async t => {
  const ctx = await setup(t);
  for (const body of [event({ consent: false }), event({ page: '/contact.html?email=private@example.com' }), event({ visitorId: 'invalid' })]) assert.equal((await ctx.event(body)).status, 400);
  assert.equal((await ctx.event(event(), 'https://attacker.example')).status, 403);
  assert.equal((await ctx.report()).status, 200);
  assert.equal((await (await ctx.report()).json()).daily[0].views, null);
});

test('report, dashboard and CSV require credentials, and dates are validated', async t => {
  const ctx = await setup(t);
  for (const route of ['/statistiques', '/api/audience/export', '/admin-assets/admin.js']) assert.equal((await fetch(ctx.base + route)).status, 401);
  assert.equal((await ctx.report('Basic ' + Buffer.from('admin:wrong').toString('base64'))).status, 401);
  for (const query of ['from=2026-02-30&to=2026-10-09', 'from=2026-10-09&to=2026-10-08', 'from=2020-01-01&to=2026-10-09']) assert.equal((await ctx.report(authorization, query)).status, 400);
  await ctx.event(event());
  const response = await fetch(ctx.base + '/api/audience/export?from=2026-10-09&to=2026-10-09', { headers: { authorization } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /\.csv/);
  assert.match(await response.text(), /"2026-10-09";"1";"1";"1"/);
});

test('Paris dates handle daylight savings and local storage survives reopening', async t => {
  assert.equal(parisDay(new Date('2026-10-08T22:30:00Z')), '2026-10-09');
  assert.equal(parisDay(new Date('2026-12-08T23:30:00Z')), '2026-12-09');
  const ctx = await setup(t);
  await ctx.event(event());
  const reopened = sqliteStore(ctx.filename);
  try { assert.equal((await reopened.report('2026-10-09', '2026-10-09')).daily[0].views, 1); }
  finally { reopened.close(); }
});

test('production never silently uses an ephemeral disk or opens admin without a password', async t => {
  for (const config of [{ RENDER: 'true', ...env }, { ...env, ANALYTICS_ADMIN_PASSWORD: '' }]) {
    const module = createAnalytics({ env: config });
    assert.equal(module.enabled, false);
    module.close();
  }
});

test('Supabase adapter sends only pseudonymous events through server credentials', async () => {
  const requests = [];
  const store = supabaseStore('https://example.supabase.co', 'sb_secret_test', async (url, options) => {
    requests.push({ url, ...options });
    return Response.json({ daily: [], pages: [] });
  });
  await store.record({ event_id: 'hash', day: '2026-10-09', visitor_hash: 'hash', session_hash: 'hash', page: '/' });
  await store.report('2026-10-09', '2026-10-09');
  assert.match(requests[0].url, /rpc\/neover_record$/);
  assert.equal(requests[0].headers.apikey, 'sb_secret_test');
  assert.equal(JSON.parse(requests[0].body).p_page, '/');
  assert.match(requests[1].url, /rpc\/neover_report$/);
});
