const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sharp = require('sharp');
const app = require('../server');

(async () => {
  for (const name of await fs.readdir('neover-export/images')) {
    if (!/^neover-photo-\d+\.jpg$/.test(name)) continue;
    const file = `neover-export/images/${name}`;
    assert.equal((await sharp(file).metadata()).format, 'jpeg', name);
    assert.ok((await fs.stat(file)).size < 500000, `${name} exceeds image budget`);
  }
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    await fs.mkdir('preview-ui', { recursive: true });
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const requests = [];
      page.on('request', request => {
        if (/\/images\/neover-photo-/.test(request.url())) requests.push(request.url());
      });
      const base = `http://127.0.0.1:${server.address().port}`;
      await page.goto(base + '/contact.html');
      await page.locator('nav[data-mobile-ready]').waitFor();
      await page.waitForTimeout(300);
      assert.deepEqual(requests, [], `Hidden photos downloaded on contact at ${width}`);
      await page.goto(base + '/');
      const hero = page.locator('img[src="/images/neover-photo-09.jpg"]');
      await hero.waitFor();
      await hero.evaluate(img => img.decode());
      assert.equal(await hero.getAttribute('loading'), 'eager');
      assert.equal(await hero.getAttribute('fetchpriority'), 'high');
      assert.equal(await page.locator('img[src*="neover-photo-"]:not([src$="09.jpg"])').evaluateAll(
        images => images.every(img => img.loading === 'lazy' && img.decoding === 'async')
      ), true);
      await page.screenshot({ path: `preview-ui/images-${width}.png` });
      console.log(`PASS ${width}px: hero loaded; contact downloaded no hidden photos.`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
