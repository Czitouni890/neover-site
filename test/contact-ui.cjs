const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const app = require('../server');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync('preview-ui', { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const dialogs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/', '/qui-sommes-nous.html', '/services.html', '/contact.html', '/mentions-legales.html']) {
        await page.goto(base + route);
        await page.locator('nav[data-mobile-ready]').waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow: ${route} at ${width}`);
        if (route === '/contact.html') {
          assert.equal(await page.locator('form').count(), 1);
          assert.equal(await page.locator('label[for]').count(), 4);
          await page.screenshot({ path: `preview-ui/contact-${width}.png`, fullPage: true });
        }
        const broken = await page.locator('img:visible').evaluateAll(images => images.filter(img => img.complete && img.naturalWidth === 0).map(img => img.src));
        assert.deepEqual(broken, [], `Broken assets: ${route}`);
        if (width === 390 && (route === '/' || route === '/services.html')) {
          await page.screenshot({ path: `preview-ui/${route === '/' ? 'home' : 'services'}-mobile.png`, fullPage: true });
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/contact.html');
    const toggle = page.locator('.neover-menu-toggle');
    await toggle.click();
    assert.equal(await page.locator('#neover-mobile-menu a').count(), 5);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await page.screenshot({ path: 'preview-ui/menu-mobile.png' });
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('.neover-mobile-call').getAttribute('href'), 'tel:+33972730395');
    await toggle.click();
    await page.locator('.neover-form-title').click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    await page.locator('#neover-mobile-menu a[href="/services.html"]').click();
    await page.waitForURL('**/services.html');
    await page.goto(base + '/contact.html');
    const form = page.locator('#contact form');
    const submit = form.locator('button[type="submit"]');
    const fill = async () => {
      await page.getByLabel('Nom complet', { exact: true }).fill('Test UI');
      await page.getByLabel('Email', { exact: true }).fill('ui@example.com');
      await page.getByLabel('T\u00e9l\u00e9phone', { exact: true }).fill('0612345678');
      await page.getByLabel('Message', { exact: true }).fill('Un projet de test sans envoi de mail.');
    };
    await fill();
    let release;
    let arrived;
    const waiting = new Promise(resolve => { arrived = resolve; });
    await page.route('**/api/contact', async route => {
      const gate = new Promise(resolve => { release = resolve; });
      arrived();
      await gate;
      await route.fulfill({ status: 502, json: { ok: false } });
    });
    await submit.click();
    await waiting;
    assert.equal(await submit.isDisabled(), true);
    assert.equal(await form.getAttribute('aria-busy'), 'true');
    assert.match(await form.locator('.neover-form-status').innerText(), /en cours/);
    release();
    await page.waitForFunction(() => document.querySelector('form').getAttribute('aria-busy') === 'false');
    assert.match(await form.locator('.neover-form-status').innerText(), /n'a pas abouti/);
    assert.equal(await page.getByLabel('Nom complet').inputValue(), 'Test UI');
    await page.screenshot({ path: 'preview-ui/contact-error.png', fullPage: true });
    for (const status of [429, 400, 200]) {
      await page.unroute('**/api/contact');
      await page.route('**/api/contact', route => route.fulfill({ status, json: { ok: status === 200 } }));
      await submit.click();
      await page.waitForFunction(() => document.querySelector('form').getAttribute('aria-busy') === 'false');
      const text = await form.locator('.neover-form-status').innerText();
      assert.match(text, status === 429 ? /15 minutes/ : status === 400 ? /informations/ : /envoy/);
    }
    await page.getByLabel('Nom complet').fill('Nouveau projet');
    assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), '');
    assert.deepEqual(dialogs, [], 'Obsolete success alert must not fire');
    assert.deepEqual(errors, [], 'No browser errors');
    console.log('PASS: five pages at five widths; menu, assets, one form, pending/error/rate-limit/success states and React reset. No email sent.');
  } finally {
    await browser.close();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
