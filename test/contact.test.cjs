const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { solveChallenge } = require('altcha-lib');
const { deriveKey } = require('altcha-lib/algorithms/sha');
const { createReplayStore } = require('../antispam');

const serverPath = path.resolve(__dirname, '../server.js');
const source = fs.readFileSync(serverPath, 'utf8');
const lead = {
  name: 'Test Confidential', phone: '0612345678', email: 'private@example.com',
  project: 'Projet confidentiel', message: 'Message strictement confidentiel', consent: true
};

async function setup(t, send, render = false, webhook = 'https://formsubmit.co/ajax/contact.neover@gmail.com', resendKey = '') {
  const logs = [];
  let calls = 0;
  const sandbox = {
    require: createRequire(serverPath), module: { exports: {} },
    __dirname: path.dirname(serverPath), URL, AbortSignal,
    process: { env: { RENDER: render ? 'true' : undefined, CONTACT_WEBHOOK_URL: webhook, RESEND_API_KEY: resendKey } },
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
    assert.equal(response.headers.get('cache-control'), 'no-store');
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
        method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload)
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

test('Resend confirmation follows Formspree acceptance and contains no reflected message', async t => {
  const urls = [];
  const ctx = await setup(t, (url, options) => {
    urls.push(url);
    if (urls.length === 1) return Response.json({ ok: true });
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.authorization, 'Bearer test-resend-secret');
    assert.match(options.headers['Idempotency-Key'], /^contact-confirmation\//);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    const payload = JSON.parse(options.body);
    assert.equal(payload.from, 'NEOVER <contact@notifications.neover.fr>');
    assert.deepEqual(payload.to, [lead.email]);
    assert.equal(payload.reply_to, 'contact.neover@gmail.com');
    for (const value of [lead.message, lead.name, lead.phone, lead.project]) {
      assert.equal(options.body.includes(value), false);
    }
    return Response.json({ id: 'test-receipt' });
  }, false, '', 'test-resend-secret');
  assert.equal((await ctx.post()).status, 200);
  assert.deepEqual(urls, ['https://formspree.io/f/xbgdwbvw', 'https://api.resend.com/emails']);
  assert.match(ctx.logs.join(' '), /NEOVER_CONFIRMATION_ACCEPTED/);
  assert.equal(ctx.logs.join(' ').includes('test-resend-secret'), false);
  assertPrivate(ctx.logs);
});

test('confirmation failures preserve the accepted lead and never expose provider details', async t => {
  for (const failure of [
    () => Response.json({ message: lead.email }, { status: 403 }),
    () => Response.json({}),
    () => new Response('invalid-json'),
    () => { throw new Error('test-resend-secret ' + lead.email); },
    () => { throw new DOMException(lead.message, 'TimeoutError'); }
  ]) {
    await t.test('accepted lead stays successful', async t => {
      let count = 0;
      const ctx = await setup(t, () => ++count === 1 ? Response.json({ ok: true }) : failure(), false, '', 'test-resend-secret');
      const response = await ctx.post();
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
      assert.equal(count, 2);
      assert.match(ctx.logs.join(' '), /NEOVER_CONFIRMATION_FAILED/);
      assert.equal(ctx.logs.join(' ').includes('test-resend-secret'), false);
      assertPrivate(ctx.logs);
    });
  }
});

test('rejected leads, spam and invalid input never trigger a confirmation', async t => {
  const ctx = await setup(t, url => {
    assert.equal(url, 'https://formspree.io/f/xbgdwbvw');
    return Response.json({ ok: false }, { status: 403 });
  }, false, '', 'test-resend-secret');
  assert.equal((await ctx.post()).status, 502);
  assert.equal((await ctx.post({ ...lead, website: 'spam' })).status, 200);
  assert.equal((await ctx.post({})).status, 400);
  assert.equal((await ctx.post({ ...lead, altcha: 'forged' })).status, 403);
  assert.equal(ctx.calls(), 1);
  assertPrivate(ctx.logs);
});

test('without a Resend key only the lead is transmitted', async t => {
  const ctx = await setup(t, () => Response.json({ ok: true }), false, '');
  assert.equal((await ctx.post()).status, 200);
  assert.equal(ctx.calls(), 1);
  assert.match(ctx.logs.join(' '), /NEOVER_CONFIRMATION_SKIPPED/);
});

test('Formspree is the default and receives contact fields but no legacy provider options or antispam proof', async t => {
  const ctx = await setup(t, (url, options) => {
    assert.equal(url, 'https://formspree.io/f/xbgdwbvw');
    const payload = JSON.parse(options.body);
    assert.equal(payload.email, lead.email);
    assert.equal(payload.message, lead.message);
    assert.equal(payload.subject, `Nouvelle demande NEOVER - ${lead.project}`);
    assert.equal(options.headers.origin, 'https://neover.fr');
    for (const key of ['altcha', '_captcha', '_url', '_template', '_replyto']) {
      assert.equal(Object.hasOwn(payload, key), false);
    }
    return Response.json({ ok: true });
  }, false, '');
  assert.equal((await ctx.post()).status, 200);
  assertPrivate(ctx.logs);
});

test('Formspree must explicitly accept a submission before reporting success', async t => {
  for (const send of [
    () => Response.json({}),
    () => Response.json({ ok: false, errors: [{ message: lead.email }] }),
    () => new Response('not-json', { status: 200 }),
    () => Response.json({ ok: true }, { status: 403 })
  ]) {
    await t.test('ambiguous or rejected response', async t => {
      const ctx = await setup(t, send, false, '');
      const response = await ctx.post();
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { ok: false, code: 'DELIVERY_FAILED' });
      assertPrivate(ctx.logs);
    });
  }
});

test('missing, forged and reused proofs never reach the email service', async t => {
  const ctx = await setup(t, () => Response.json({ success: true }));
  for (const altcha of ['', 'forged', 'x'.repeat(8001)]) {
    const response = await ctx.post({ ...lead, altcha });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'ANTISPAM_FAILED');
  }
  const altcha = await ctx.proof();
  assert.equal((await ctx.post({ ...lead, altcha })).status, 200);
  assert.equal((await ctx.post({ ...lead, altcha })).status, 403);
  assert.equal(ctx.calls(), 1);
  assertPrivate(ctx.logs);
});

test('concurrent reuse permits only one delivery', async t => {
  const ctx = await setup(t, () => Response.json({ success: true }));
  const altcha = await ctx.proof();
  const responses = await Promise.all([ctx.post({ ...lead, altcha }), ctx.post({ ...lead, altcha })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 403]);
  assert.equal(ctx.calls(), 1);
});

test('signed challenges expire in five minutes and cannot be modified', async t => {
  const ctx = await setup(t, () => { throw new Error('Unexpected delivery'); });
  const payload = JSON.parse(Buffer.from(await ctx.proof(), 'base64').toString());
  const remaining = payload.challenge.parameters.expiresAt - Date.now() / 1000;
  assert.ok(remaining > 0 && remaining <= 300);
  payload.challenge.parameters.expiresAt = Math.floor(Date.now() / 1000) - 10;
  const altcha = Buffer.from(JSON.stringify(payload)).toString('base64');
  assert.equal((await ctx.post({ ...lead, altcha })).status, 403);
  assert.equal(ctx.calls(), 0);
});

test('replay storage is atomic, bounded and never evicts live proofs', () => {
  let now = 0;
  const store = createReplayStore({ now: () => now, maxSize: 2 });
  assert.equal(store.setIfAbsent('one'), true);
  assert.equal(store.setIfAbsent('one'), false);
  assert.equal(store.setIfAbsent('two'), true);
  assert.equal(store.setIfAbsent('three'), false);
  assert.equal(store.setIfAbsent('one'), false);
  now += 300001;
  assert.equal(store.setIfAbsent('three'), true);
});

test('a genuinely expired proof is rejected even with a valid signature', async t => {
  const ctx = await setup(t, () => { throw new Error('Unexpected delivery'); });
  const altcha = await ctx.proof();
  const future = Date.now() + 6 * 60000;
  t.mock.method(Date, 'now', () => future);
  try {
    assert.equal((await ctx.post({ ...lead, altcha })).status, 403);
    assert.equal(ctx.calls(), 0);
  } finally {
    t.mock.restoreAll();
  }
});

test('a restart invalidates proofs along with the old replay registry', async t => {
  const first = await setup(t, () => { throw new Error('Unexpected delivery'); });
  const second = await setup(t, () => { throw new Error('Unexpected delivery'); });
  assert.equal((await second.post({ ...lead, altcha: await first.proof() })).status, 403);
  assert.equal(second.calls(), 0);
});

test('malformed requests never echo personal data or log parser errors', async t => {
  const ctx = await setup(t, () => { throw new Error('Unexpected delivery'); });
  for (const [body, status] of [
    ['{"private@example.com":', 400],
    [JSON.stringify({ message: 'x'.repeat(26000) }), 413]
  ]) {
    const response = await fetch(ctx.base + '/api/contact', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { ok: false, code: 'INVALID_REQUEST' });
  }
  assert.deepEqual(ctx.logs, []);
});

test('challenge requests have a separate rate limit and do not consume form attempts', async t => {
  const ctx = await setup(t, () => Response.json({ success: true }));
  const altcha = await ctx.proof();
  for (let i = 1; i < 30; i++) {
    assert.equal((await fetch(ctx.base + '/api/contact/challenge')).status, 200);
  }
  assert.equal((await fetch(ctx.base + '/api/contact/challenge')).status, 429);
  assert.equal((await ctx.post({ ...lead, altcha })).status, 200);
});

test('success requires provider acceptance and logs no personal data', async t => {
  const ctx = await setup(t, () => Response.json({ success: 'true' }));
  const response = await ctx.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(ctx.logs.join(' '), /NEOVER_CONTACT_SENT/);
  assertPrivate(ctx.logs);
});

test('server-to-server delivery supplies the canonical form URL required by FormSubmit', async t => {
  const ctx = await setup(t, (url, options) => {
    assert.equal(url, 'https://formsubmit.co/ajax/contact.neover@gmail.com');
    const payload = JSON.parse(options.body);
    assert.equal(payload._url, 'https://neover.fr/contact.html');
    assert.equal(options.headers.origin, 'https://neover.fr');
    assert.equal(options.headers.referer, 'https://neover.fr/contact.html');
    assert.equal(payload._replyto, lead.email);
    assert.equal(payload.message, lead.message);
    assert.equal(Object.hasOwn(payload, 'altcha'), false);
    return Response.json({ success: 'true' });
  });
  const response = await ctx.post({ ...lead, page: 'https://untrusted.example/' });
  assert.equal(response.status, 200);
  assert.equal(ctx.calls(), 1);
  assertPrivate(ctx.logs);
});

test('provider activation requests never report email delivery or erase a draft', async t => {
  const ctx = await setup(t, () => Response.json({
    success: 'false', message: "This form needs Activation. We've sent you an email."
  }));
  const response = await ctx.post();
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, code: 'DELIVERY_FAILED' });
  assert.match(ctx.logs.join(' '), /activation_required/);
  assertPrivate(ctx.logs);
});

test('cross-site browser submissions are rejected before forwarding', async t => {
  const ctx = await setup(t, () => Response.json({ success: true }));
  for (const headers of [
    { origin: 'https://untrusted.example' },
    { origin: 'null' },
    { 'sec-fetch-site': 'cross-site' }
  ]) {
    const response = await ctx.post(lead, headers);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, code: 'ORIGIN_REJECTED' });
  }
  assert.equal(ctx.calls(), 0);
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
