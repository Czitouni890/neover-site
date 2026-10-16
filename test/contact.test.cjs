const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

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
  return {
    logs, calls: () => calls,
    post: (body = lead, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/contact`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
    })
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
