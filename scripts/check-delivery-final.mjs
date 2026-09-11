import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const DIST = process.env.DELIVERY_DIST || 'dist';
const BASE = process.env.DELIVERY_TEST_URL || 'http://127.0.0.1:4176';
const manifest = JSON.parse(fs.readFileSync(`${DIST}/classroom-manifest.json`, 'utf8'));
for (const asset of manifest.assets) {
  const bytes = fs.readFileSync(`${DIST}/${asset.url}`);
  assert.equal(bytes.length, asset.bytes, asset.url);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.revision, asset.url);
}
assert.ok(manifest.assets.length >= 426);
for (const name of ['char_attack_ko_v1', 'char_walk_v1', 'pet_walk_v1']) assert.ok(manifest.assets.some(asset => asset.url.endsWith(`/${name}.webp`)), `Motion asset included: ${name}`);
const result = { date: new Date().toISOString(), directory: DIST, manifestVersion: manifest.version, assets: manifest.assets.length, bytes: manifest.assets.reduce((sum, a) => sum + a.bytes, 0), bundles: manifest.assets.filter(a => /^\.\/assets\/index-.*\.(js|css)$/.test(a.url)).map(a => a.url), layouts: [] };
const browser = await chromium.launch({ channel: process.env.DELIVERY_BROWSER_CHANNEL || 'chrome' });
try {
  for (const language of ['ko', 'en']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      await context.addInitScript(language => {
        localStorage.setItem('typing_adventure_save_v1', JSON.stringify({ version: '1', profile: { name: language === 'en' ? 'Hero' : '하늘', characterId: 'brown_boy', petId: 'cat', difficulty: 'easy' }, progress: { unlockedStage: 5, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5'], stageStars: { stage_1: 3 }, coins: 0, tutorialCompleted: true }, settings: { language, bgm: false, sfx: false, prologueSeen: true } }));
      }, language);
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('.opening-skip').click();
      await page.waitForSelector('.opening-player', { state: 'detached' });
      await page.waitForSelector('.screen.home.has-save');
      assert.ok(await page.locator('.home-replay').count(), 'Saved home includes the additional replay action');
      for (const [width, height] of [[1280, 800], [1024, 768], [915, 412]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
        const buttons = page.locator('.home-menu button');
        for (let i = 0; i < await buttons.count(); i++) {
          const button = buttons.nth(i);
          await button.scrollIntoViewIfNeeded();
          const hit = await button.evaluate(el => {
            const r = el.getBoundingClientRect(), menu = el.closest('.home-menu').getBoundingClientRect();
            const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return r.width >= 47.5 && r.height >= 47.5 && r.y >= menu.y - 1 && r.bottom <= menu.bottom + 1 && (target === el || el.contains(target));
          });
          assert.ok(hit, `${language} ${width}: reachable ${await button.textContent()}`);
        }
        const layout = await page.evaluate(() => {
          const menu = document.querySelector('.home-menu'), r = menu.getBoundingClientRect();
          const tip = document.querySelector('.home-tip').getBoundingClientRect();
          const footer = document.querySelector('.home-version').getBoundingClientRect();
          const box = rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
          return { menuBottom: r.bottom, tipTop: tip.top, footerTop: footer.top, menu: box(r), tip: box(tip), footer: box(footer), buttons: [...menu.querySelectorAll('button')].map(button => ({ text: button.textContent, ...box(button.getBoundingClientRect()) })), scrollHeight: menu.scrollHeight, clientHeight: menu.clientHeight, overflowY: getComputedStyle(menu).overflowY, language: document.documentElement.lang };
        });
        await page.screenshot({ path: `tmp/delivery-check/saved-home-final-${language}-${width}.png` });
        assert.equal(layout.language, language);
        const intersects = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        for (const button of layout.buttons) {
          const visible = { left: Math.max(button.left, layout.menu.left), right: Math.min(button.right, layout.menu.right), top: Math.max(button.top, layout.menu.top), bottom: Math.min(button.bottom, layout.menu.bottom) };
          if (visible.right <= visible.left || visible.bottom <= visible.top) continue;
          assert.ok(!intersects(visible, layout.tip) && !intersects(visible, layout.footer), `${language} ${width}: visible ${button.text} does not cover tip/footer`);
        }
        assert.equal(layout.overflowY, 'auto');
        await page.screenshot({ path: `tmp/delivery-check/saved-home-final-${language}-${width}.png` });
        result.layouts.push({ language, width, height, pass: true, ...layout });
      }
    } finally { await context.close(); }
  }
  console.log(`PASS final delivery: ${manifest.assets.length} asset hashes and ${result.layouts.length} saved-home layouts`);
  console.log(JSON.stringify({ directory: result.directory, manifestVersion: result.manifestVersion, assets: result.assets, bytes: result.bytes, bundles: result.bundles, layouts: result.layouts.map(({ language, width, height, pass }) => ({ language, width, height, pass })) }, null, 2));
} finally {
  fs.mkdirSync('tmp/delivery-check', { recursive: true });
  fs.writeFileSync('tmp/delivery-check/final-delivery.json', JSON.stringify(result, null, 2));
  await browser.close();
}
