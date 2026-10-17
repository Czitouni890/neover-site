const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminAccess } = require('../audience-auth');

const password = 'only-a-test-password-not-production';
async function setup(t, options = {}) {
  const app = express();
  if (options.production) app.set('trust proxy', 1);
  app.use(express.json());
  const access = createAdminAccess({ enabled: true, password, production: false, ...options });
  app.use(access.router);
  app.use(['/statistiques', '/api/audience/report', '/api/audience/export', '/admin-assets'], access.protect);
  app.get(['/statistiques', '/api/audience/report', '/api/audience/export', '/admin-assets/admin.js'], (_req, res) => res.json({ private: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    access.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  let csrf = '';
  async function request(route, init = {}) {
    const response = await fetch(base + route, {
      ...init, redirect: 'manual', headers: {
        cookie, ...(options.production ? { 'x-forwarded-proto': 'https' } : {}), ...init.headers
      }
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return response;
  }
  async function bootstrap() {
    const response = await request('/api/audience/session');
    const data = await response.json();
    csrf = data.csrf;
    return response;
  }
  function post(route, body = {}, headers = {}) {
    return request(route, {
      method: 'POST', headers: {
        origin: options.production ? base.replace('http:', 'https:') : base,
        'content-type': 'application/json', 'x-csrf-token': csrf, ...headers
      }, body: JSON.stringify(body)
    });
  }
  async function login() {
    await bootstrap();
    const response = await post('/api/audience/login', { username: 'admin', password });
    assert.equal(response.status, 200);
    csrf = (await response.json()).csrf;
    return response;
  }
  return { request, post, login, bootstrap, get cookie() { return cookie; }, get csrf() { return csrf; } };
}

test('dashboard redirects to login; exports, reports and scripts reject Basic auth and anonymous access', async t => {
  const ctx = await setup(t);
  const response = await ctx.request('/statistiques');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/statistiques/connexion');
  for (const route of ['/api/audience/report', '/api/audience/export', '/admin-assets/admin.js']) {
    assert.equal((await ctx.request(route)).status, 401);
    assert.equal((await ctx.request(route, { headers: { authorization: 'Basic ' + Buffer.from(`admin:${password}`).toString('base64') } })).status, 401);
  }
  assert.equal((await ctx.request('/statistiques/connexion')).status, 200);
});

test('successful login rotates the identifier and logout revokes a copied cookie', async t => {
  const ctx = await setup(t);
  await ctx.bootstrap();
  const anonymous = ctx.cookie;
  await ctx.login();
  assert.notEqual(ctx.cookie, anonymous);
  const authenticatedCookie = ctx.cookie;
  assert.equal((await ctx.request('/api/audience/report')).status, 200);
  const response = await ctx.post('/api/audience/logout');
  assert.equal(response.status, 200);
  assert.equal((await ctx.request('/api/audience/report', { headers: { cookie: authenticatedCookie } })).status, 401);
});

test('session cookies are HttpOnly, strict SameSite and Secure on production HTTPS', async t => {
  const ctx = await setup(t, { production: true });
  const response = await ctx.login();
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^__Host-neover_admin=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Domain=/);
  assert.equal((await ctx.request('/api/audience/report', { headers: { 'x-forwarded-proto': 'http' } })).status, 403);
});

test('CSRF and cross-site requests cannot log in or revoke an authenticated session', async t => {
  const ctx = await setup(t);
  await ctx.bootstrap();
  const credentials = { username: 'admin', password };
  assert.equal((await ctx.post('/api/audience/login', credentials, { 'x-csrf-token': '' })).status, 403);
  assert.equal((await ctx.post('/api/audience/login', credentials, { origin: 'https://attacker.example' })).status, 403);
  await ctx.login();
  assert.equal((await ctx.post('/api/audience/logout', {}, { 'x-csrf-token': '0'.repeat(64) })).status, 403);
  assert.equal((await ctx.request('/api/audience/report')).status, 200);
});

test('five failed logins block the sixth attempt across sessions and forged proxy headers', async t => {
  const ctx = await setup(t);
  await ctx.bootstrap();
  for (let i = 0; i < 5; i++) {
    const response = await ctx.post('/api/audience/login', { username: i % 2 ? 'unknown' : 'admin', password: 'wrong' }, i === 0 ? {} : { 'x-forwarded-for': `192.0.2.${i + 1}` });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, code: 'INVALID_CREDENTIALS' });
  }
  await ctx.bootstrap();
  const blocked = await ctx.post('/api/audience/login', { username: 'admin', password });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});

test('15-minute idle expiration and eight-hour absolute expiration are enforced server-side', async t => {
  let time = Date.now();
  const ctx = await setup(t, { now: () => time });
  await ctx.login();
  time += 15 * 60000 + 1;
  assert.equal((await ctx.request('/api/audience/export')).status, 401);
  await ctx.login();
  for (let i = 0; i < 47; i++) {
    time += 10 * 60000;
    assert.equal((await ctx.request('/api/audience/report')).status, 200);
  }
  time += 10 * 60000;
  assert.equal((await ctx.request('/api/audience/report')).status, 401);
});

test('private responses and login page are never cached or indexed', async t => {
  const ctx = await setup(t);
  for (const route of ['/statistiques/connexion', '/api/audience/session', '/api/audience/export']) {
    const response = await ctx.request(route);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  }
});

test('forged cookies and old CSRF tokens cannot impersonate an administrator', async t => {
  const ctx = await setup(t);
  await ctx.bootstrap();
  const oldCsrf = ctx.csrf;
  await ctx.login();
  assert.equal((await ctx.post('/api/audience/logout', {}, { 'x-csrf-token': oldCsrf })).status, 403);
  const forged = ctx.cookie.slice(0, -3) + 'abc';
  assert.equal((await ctx.request('/api/audience/export', { headers: { cookie: forged } })).status, 401);
});

test('disabled analytics remain closed and issue no session cookie', async t => {
  const ctx = await setup(t, { enabled: false });
  const response = await ctx.request('/api/audience/session');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('set-cookie'), null);
});
