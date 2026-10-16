const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { solveChallenge } = require('altcha-lib');
const { deriveKey } = require('altcha-lib/algorithms/sha');

const serverPath = path.resolve(__dirname, '../server.js');
const source = fs.readFileSync(serverPath, 'utf8');
const lead = {
  name: 'Test Confidential', phone: '0612345678', email: 'private@example.com',
  project: 'Projet confidentiel', message: 'Message strictement confidentiel', consent: true
};

async function setup(t, send, render = false) {
  const logs = [];
  let calls = 0;
  const sandbox = {
    require: createRequire(serverPath), module: { exports: {} },
    __dirname: path.dirname(serverPath), URL, AbortSignal,
    process: { env: { RENDER: render ? 'true' : undefined } },
    console: {
      info: (...args) => logs.push(args.join(' ')),
      error: (...args) => logs.push(args.join(' '))
    },
    fetch: async (...args) => { calls++; return send(...args); }
  };
  vm.runInNewContext(source, sandbox, { filename: serverPath });
  const server = sandbox.module.exports.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function proof() {
    const response = await fetch(base + '/api/contact/challenge');
    assert.equal(response.status, 200);
    const challenge = await response.json();
    const solution = await solveChallenge({ challenge, deriveKey });
    assert.ok(solution);
    return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
  }
  return {
    logs, base, proof, calls: () => calls,
    post: async (body = lead, headers = {}) => {
      const payload = Object.hasOwn(body, 'altcha') || body.website ? body : { ...body, altcha: await proof() };
      return fetch(base + '/api/contact', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...headers }, body: JSON.stringify(payload)
      });
    }
  };
}

function assertPrivate(logs) {
  const text = logs.join('\n');
  for (const value of [lead.name, lead.email, lead.phone, lead.project, lead.message]) {
    assert.equal(text.includes(value), false);
  }
}

test('success requires provider acceptance and logs no personal data', async t => {
  const ctx = await setup(t, () => Response.json({ success: 'true' }));
  const response = await ctx.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(ctx.logs.join(' '), /NEOVER_CONTACT_SENT/);
  assertPrivate(ctx.logs);
});

test('provider failures never report success or log raw provider data', async t => {
  for (const send of [
    () => new Response(lead.email, { status: 500 }),
    () => Response.json({ success: 'false', message: lead.message }),
    () => Response.json({ success: false }),
    () => Response.json({}),
    () => { throw new Error(lead.email); },
    () => { throw new DOMException(lead.message, 'TimeoutError'); }
  ]) {
    await t.test('failed delivery', async t => {
      const ctx = await setup(t, send);
      const response = await ctx.post();
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { ok: false, code: 'DELIVERY_FAILED' });
      assertPrivate(ctx.logs);
      assert.equal(ctx.logs.some(line => line.includes('NEOVER_CONTACT_SENT')), false);
    });
  }
});

test('sixth attempt is blocked before forwarding, even with forged local proxy headers', async t => {
  const ctx = await setup(t, () => Response.json({ success: true }));
  for (let i = 0; i < 5; i++) {
    const headers = i === 0 ? {} : { 'x-forwarded-for': `203.0.113.${i + 1}` };
    assert.equal((await ctx.post(lead, headers)).status, 200);
  }
  const response = await ctx.post();
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
  assert.equal((await response.json()).code, 'RATE_LIMITED');
  assert.equal(ctx.calls(), 5);
});

test('Render uses nearest forwarded IP and ignores forged earlier addresses', async t => {
  const ctx = await setup(t, () => Response.json({ success: true }), true);
  for (let i = 0; i < 5; i++) {
    assert.equal((await ctx.post(lead, { 'x-forwarded-for': `192.0.2.${i + 1}, 203.0.113.1` })).status, 200);
  }
  assert.equal((await ctx.post(lead, { 'x-forwarded-for': '192.0.2.99, 203.0.113.1' })).status, 429);
  assert.equal((await ctx.post(lead, { 'x-forwarded-for': '203.0.113.2' })).status, 200);
});

test('invalid fields and honeypot never reach provider', async t => {
  const ctx = await setup(t, () => { throw new Error('Unexpected call'); });
  assert.equal((await ctx.post({})).status, 400);
  assert.equal((await ctx.post({ ...lead, website: 'spam' })).status, 200);
  assert.equal(ctx.calls(), 0);
  assert.deepEqual(ctx.logs, []);
});

test('all public pages, assets and errors receive browser protections', async t => {
  const ctx = await setup(t, () => { throw new Error('Unexpected delivery'); });
  for (const route of ['/', '/contact.html', '/services.html', '/qui-sommes-nous.html', '/mentions-legales.html', '/confidentialite.html', '/assets/multipage.js', '/health']) {
    const response = await fetch(ctx.base + route);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-powered-by'), null);
    const policy = response.headers.get('content-security-policy');
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /script-src-attr 'none'/);
    assert.equal(policy.includes("'unsafe-eval'"), false);
    assert.equal(policy.includes('upgrade-insecure-requests'), false);
    assert.equal(response.headers.get('strict-transport-security'), null);
  }
});

test('HTTPS requests behind Render receive HSTS without affecting localhost', async t => {
  const ctx = await setup(t, () => { throw new Error('Unexpected delivery'); }, true);
  const response = await fetch(ctx.base + '/health', { headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  assert.match(response.headers.get('content-security-policy'), /upgrade-insecure-requests/);
});

test('missing, forged and reused antispam proofs never reach provider', async t => {
  const ctx = await setup(t, () => Response.json({ success: true }));
  assert.equal((await ctx.post({ ...lead, altcha: '' })).status, 403);
  assert.equal((await ctx.post({ ...lead, altcha: 'forged' })).status, 403);
  const token = await ctx.proof();
  const response = await ctx.post({ ...lead, altcha: token });
  assert.equal(response.status, 200);
  const reused = await ctx.post({ ...lead, altcha: token });
  assert.equal(reused.status, 403);
  assert.equal((await reused.json()).code, 'ANTISPAM_FAILED');
  assert.equal(ctx.calls(), 1);
});

test('proofs expire after five minutes and tampering is rejected', async t => {
  const ctx = await setup(t, () => { throw new Error('Unexpected delivery'); });
  const payload = JSON.parse(Buffer.from(await ctx.proof(), 'base64').toString());
  const remaining = payload.challenge.parameters.expiresAt - Date.now() / 1000;
  assert.ok(remaining > 0 && remaining <= 300);
  payload.challenge.parameters.expiresAt = Math.floor(Date.now() / 1000) - 10;
  const response = await ctx.post({ ...lead, altcha: Buffer.from(JSON.stringify(payload)).toString('base64') });
  assert.equal(response.status, 403);
  assert.equal(ctx.calls(), 0);
});

test('cross-site posts are rejected before delivery', async t => {
  const ctx = await setup(t, () => { throw new Error('Unexpected delivery'); });
  assert.equal((await ctx.post(lead, { origin: 'https://attacker.example' })).status, 403);
  assert.equal(ctx.calls(), 0);
});

test('concurrent reuse of one proof permits only one delivery', async t => {
  const ctx = await setup(t, () => Response.json({ success: true }));
  const altcha = await ctx.proof();
  const responses = await Promise.all([ctx.post({ ...lead, altcha }), ctx.post({ ...lead, altcha })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 403]);
  assert.equal(ctx.calls(), 1);
});

test('malformed and oversized requests return generic errors without echoing user data', async t => {
  const ctx = await setup(t, () => { throw new Error('Unexpected delivery'); });
  for (const [body, status] of [['{"private@example.com":', 400], [JSON.stringify({ message: 'x'.repeat(26000) }), 413]]) {
    const response = await fetch(ctx.base + '/api/contact', { method: 'POST', headers: { 'content-type': 'application/json', origin: ctx.base }, body });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { ok: false, code: 'INVALID_REQUEST' });
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
});
