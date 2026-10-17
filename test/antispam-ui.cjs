const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

(async () => {
  const filename = path.resolve(__dirname, '../server.js');
  let deliveries = 0;
  let failDelivery = false;
  const sandbox = {
    require: createRequire(filename), module: { exports: {} }, __dirname: path.dirname(filename),
    process: { env: {} }, URL, AbortSignal,
    console: { info() {}, error() {} },
    fetch: async () => {
      deliveries++;
      return Response.json({ success: !failDelivery }, { status: failDelivery ? 503 : 200 });
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  const server = sandbox.module.exports.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const violations = [];
      await page.exposeFunction('recordViolation', value => violations.push(value));
      await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => {
        window.recordViolation(`${e.effectiveDirective}: ${e.blockedURI}`);
      }));
      await page.goto(`http://127.0.0.1:${server.address().port}/contact.html`);
      await page.waitForFunction(() => window.neoverAntispamReady === true);
      const fill = async () => {
        await page.getByLabel('Nom complet', { exact: true }).fill('Test antispam');
        await page.getByLabel('Email', { exact: true }).fill('test@example.com');
        await page.getByLabel('T\u00e9l\u00e9phone', { exact: true }).fill('0612345678');
        await page.getByLabel('Message', { exact: true }).fill('Test local sans email reel.');
      };
      const submit = async () => {
        await page.locator('button[type="submit"]').click();
        await page.waitForFunction(() => document.querySelector('form').getAttribute('aria-busy') === 'false');
      };
      await fill();
      if (width === 390) {
        // A failed challenge must neither forward data nor erase the draft.
        await page.route('**/api/contact/challenge', route => route.fulfill({ status: 503, json: {} }));
        await submit();
        assert.equal(deliveries, 0);
        assert.equal(await page.getByLabel('Nom complet').inputValue(), 'Test antispam');
        assert.equal(await page.locator('button[type="submit"]').isEnabled(), true);
        await page.unroute('**/api/contact/challenge');
        failDelivery = true;
        await submit();
        assert.equal(deliveries, 1);
        assert.match(await page.locator('.neover-form-status').innerText(), /n'a pas abouti/);
        assert.equal(await page.getByLabel('Nom complet').inputValue(), 'Test antispam');
        failDelivery = false;
      }
      const before = deliveries;
      await submit();
      assert.equal(deliveries, before + 1, 'One verified submission reaches the mocked email service');
      assert.match(await page.locator('.neover-form-status').innerText(), /bien.*envoy/);
      assert.equal(await page.getByLabel('Nom complet').inputValue(), '');
      assert.deepEqual(violations, []);
      await page.screenshot({ path: `preview-ui/antispam-${width}.png`, fullPage: true });
      await page.close();
    }
    console.log('PASS: real browser proofs verified by server; challenge/delivery failure retains draft; retry succeeds. No real email sent.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
