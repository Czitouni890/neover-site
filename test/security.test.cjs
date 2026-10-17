const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { securityHeaders, contactOriginGuard } = require('../security');

async function setup(t, proxy = false) {
  const app = express();
  app.set('trust proxy', proxy ? 1 : false);
  app.use(securityHeaders);
  app.post('/api/contact', contactOriginGuard, (_req, res) => res.json({ ok: true }));
  app.get('/', (_req, res) => res.send('ok'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('browser headers restrict scripts, framing and privileged browser features', async t => {
  const base = await setup(t);
  const response = await fetch(base);
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self';/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /https:\/\/fonts.googleapis.com/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('strict-transport-security'), null);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
});

test('HTTPS headers work behind Render, but not through untrusted local proxy headers', async t => {
  const local = await setup(t);
  const localResponse = await fetch(local, { headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(localResponse.headers.get('strict-transport-security'), null);
  const production = await setup(t, true);
  const response = await fetch(production, { headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  assert.match(response.headers.get('content-security-policy'), /upgrade-insecure-requests/);
});

test('same-origin browser submissions work locally and through the HTTPS proxy', async t => {
  const base = await setup(t);
  assert.equal((await fetch(base + '/api/contact', {
    method: 'POST', headers: { origin: base, 'sec-fetch-site': 'same-origin' }
  })).status, 200);
  assert.equal((await fetch(base + '/api/contact', {
    method: 'POST', headers: { origin: base + '.attacker.example' }
  })).status, 403);
  const production = await setup(t, true);
  const origin = production.replace('http:', 'https:');
  assert.equal((await fetch(production + '/api/contact', {
    method: 'POST', headers: { origin, 'x-forwarded-proto': 'https' }
  })).status, 200);
});
