import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.JOURNEY_TEST_URL || 'http://127.0.0.1:5180';
const out = 'tmp/replay-layout-v033';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
try {
  for (const language of ['ko', 'en']) for (const [width, height] of [[1920, 1080], [1280, 800], [1024, 768], [915, 412]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
    await context.addInitScript(language => {
      localStorage.setItem('typing_adventure_save_v1', JSON.stringify({ version: '1', profile: { name: 'Hero', characterId: 'brown_boy', petId: 'cat', difficulty: 'normal' }, progress: { unlockedStage: 5, clearedStages: ['stage_1'], stageStars: { stage_1: 3 }, coins: 0 }, settings: { language, bgm: false, sfx: false, prologueSeen: true } }));
    }, language);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const label = `${language}-${width}`;
    try {
      await page.goto(base);
      await page.locator('.opening-skip').click();
      await page.locator('.home-replay').click();
      await page.locator('.replay-route').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const body = page.locator('.replay-body');
      assert.ok(await body.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'No horizontal overflow');
      if (language === 'en') assert.equal(/[가-힣]/.test(await body.innerText()), false, 'English route cards contain no untranslated Korean');
      const labels = [];
      const routes = page.locator('.replay-route');
      assert.equal(await routes.count(), 5);
      for (let i = 0; i < 5; i++) {
        const route = routes.nth(i);
        await route.scrollIntoViewIfNeeded();
        const box = await route.evaluate(e => {
          const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { width: r.width, height: r.height, accessible: e.contains(hit) || hit === e, markColor: getComputedStyle(e.querySelector('.route-mark')).backgroundColor, overflow: e.scrollWidth - e.clientWidth };
        });
        assert.ok(box.width >= 48 && box.height >= 48 && box.accessible && box.overflow <= 1, `${label} route ${i}: ${JSON.stringify(box)}`);
        assert.notEqual(box.markColor, 'rgba(0, 0, 0, 0)');
        labels.push((await route.innerText()).split('\n')[0]);
      }
      const summary = page.locator('.replay-goals-details summary');
      await summary.scrollIntoViewIfNeeded();
      const summaryBox = await summary.boundingBox();
      assert.ok(summaryBox.height >= 47.5);
      await summary.focus(); await page.keyboard.press('Enter');
      await page.locator('.replay-goal').first().waitFor();
      if (language === 'en') assert.equal(/[가-힣]/.test(await body.innerText()), false);
      await summary.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('.replay-goals-details').getAttribute('open'), null);
      await routes.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/${label}.png` });
      assert.deepEqual(errors, []);
      results.push({ language, width, height, pass: true, routes: labels });
      console.log(`PASS ${label}: five routes, touch, keyboard disclosure, translations`);
    } catch (error) {
      await page.screenshot({ path: `${out}/${label}-failure.png` });
      results.push({ language, width, height, pass: false, error: error.message });
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); fs.writeFileSync(`${out}/results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)); }
