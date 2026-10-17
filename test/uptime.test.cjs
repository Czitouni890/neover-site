const test = require('node:test');
const assert = require('node:assert/strict');
const { checkSite, syncIncident, testNotification } = require('../scripts/check-uptime.cjs');
const html = '<html><div id="root"></div><script src="/assets/multipage.js?v=11"></script></html>';
const healthy = url => url.endsWith('/health') ? Response.json({ status: 'ok' }) : new Response(html, { headers: { 'content-type': 'text/html' } });

test('monitor checks the health payload and both public pages without sending forms', async () => {
  const paths = [];
  const result = await checkSite({ fetcher: async (url, options) => {
    paths.push(new URL(url).pathname);
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, undefined);
    return healthy(url);
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(paths, ['/health', '/', '/contact.html']);
});

test('transient failure is retried and does not open an outage', async () => {
  let calls = 0;
  const result = await checkSite({ delay: async () => {}, fetcher: async url => {
    calls++;
    return calls === 1 ? new Response('', { status: 503 }) : healthy(url);
  } });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
});

test('persistent wrong content and network failures trigger an outage after three attempts', async () => {
  const result = await checkSite({ delay: async () => {}, fetcher: async url => {
    if (url.endsWith('/contact.html')) throw new TypeError('Network details must never be published');
    return Response.json({ status: 'wrong' });
  } });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 3);
  assert.equal(JSON.stringify(result).includes('Network details'), false);
});

test('monitor rejects credentials and insecure nonlocal destinations', async () => {
  for (const base of ['https://user:secret@example.com', 'http://example.com']) {
    await assert.rejects(checkSite({ base }));
  }
});

test('an incident is created once and assigned to the owner', async () => {
  const calls = [];
  const options = { repository: 'Czitouni890/neover-site', runUrl: 'https://github.com/test',
    api: async (...args) => { calls.push(args); return args[0] === 'GET' ? [] : {}; } };
  const report = { ok: false, attempts: 3, results: [{ route: '/health', ok: false, reason: 'timeout' }] };
  assert.equal(await syncIncident(report, options), 'opened');
  assert.deepEqual(calls[1][2].assignees, ['Czitouni890']);
  const incident = { number: 42, title: calls[1][2].title };
  calls.length = 0;
  options.api = async (...args) => { calls.push(args); return [incident]; };
  assert.equal(await syncIncident(report, options), 'already_open');
  assert.equal(calls.length, 1);
});

test('recovery comments and closes the existing incident, without touching unrelated issues', async () => {
  const calls = [];
  const api = async (...args) => {
    calls.push(args);
    return args[0] === 'GET' ? [{ number: 3, title: 'NEOVER indisponible - controle automatique' }, { number: 4, title: 'Other' }] : {};
  };
  assert.equal(await syncIncident({ ok: true }, { api, repository: 'Czitouni890/neover-site', runUrl: 'https://github.com/test' }), 'closed');
  assert.match(calls[1][1], /\/3\/comments$/);
  assert.equal(calls[2][2].state, 'closed');
});

test('notification errors are not silently accepted', async () => {
  await assert.rejects(syncIncident({ ok: false }, { api: async () => { throw new Error('API unavailable'); }, repository: 'test/test' }));
});

test('manual notification exercise is explicitly marked and closes only its own issue', async () => {
  const calls = [];
  const number = await testNotification({ repository: 'Czitouni890/neover-site', runUrl: 'https://github.com/test',
    api: async (...args) => { calls.push(args); return { number: 99 }; } });
  assert.equal(number, 99);
  assert.match(calls[0][2].title, /^EXERCICE/);
  assert.match(calls[0][2].body, /aucune panne reelle/);
  assert.match(calls[1][1], /\/issues\/99$/);
  assert.equal(calls[1][2].state, 'closed');
});
