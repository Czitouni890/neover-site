const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

async function setup(t) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('Express 5 starts and preserves public pages, extensionless URLs and nested fallback routes', async t => {
  const base = await setup(t);
  for (const route of ['/', '/qui-sommes-nous.html', '/services.html', '/contact.html',
    '/mentions-legales.html', '/confidentialite.html', '/services',
    '/ancienne-page', '/ancienne-page/niveau/deux']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.match(await response.text(), /<!doctype html>/i);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('Express 5 serves modules, styles and photos with browser-compatible content types', async t => {
  const base = await setup(t);
  for (const [route, type] of [
    ['/assets/multipage.js', /^text\/javascript/],
    ['/assets/contact-antispam.js', /^text\/javascript/],
    ['/assets/antispam/widget.js', /^text\/javascript/],
    ['/assets/antispam/sha.js', /^text\/javascript/],
    ['/assets/multipage.css', /^text\/css/],
    ['/images/neover-photo-09.jpg', /^image\/jpeg/]
  ]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), type);
    await response.arrayBuffer();
  }
});

test('Express 5 preserves health, HEAD handling and rejection of unparsed form bodies', async t => {
  const base = await setup(t);
  assert.deepEqual(await (await fetch(base + '/health')).json(), { status: 'ok' });
  const head = await fetch(base + '/ancienne-page/niveau/deux', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const response = await fetch(base + '/api/contact', {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'not-json'
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, code: 'ANTISPAM_FAILED' });
});
