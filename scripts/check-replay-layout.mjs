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
      await page.waitForFunction(() => document.querySelector('.home-menu') && !document.querySelector('.opening-player') && !document.getElementById('ui-stage').inert && !document.getElementById('ui-stage').hasAttribute('aria-busy'));
      await page.locator('.home-replay').click();
      await page.locator('.replay-route').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const body = page.locator('.replay-body');
      // The window is paged (two routes per page, then goal pages, then the note); every page must fit without scrolling.
      const next = page.locator('.replay-pages .popup-page-next');
      const pageFits = async () => {
        assert.ok(await body.evaluate(e => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1), `${label}: page fits without overflow`);
        if (language === 'en') assert.equal(/[가-힣]/.test(await body.innerText()), false, 'English pages contain no untranslated Korean');
      };
      const pageOf = locator => locator.evaluate(el => Number(el.closest('.popup-page')?.dataset.page ?? 0));
      const currentPage = () => page.locator('.replay-pages .popup-page:not([hidden])').first().evaluate(el => Number(el.dataset.page));
      const reveal = async locator => {
        for (let step = 0; step < 20 && !await locator.isVisible(); step++) {
          assert.ok(await pageOf(locator) > await currentPage() && !await next.isDisabled(), `${label}: page forward reaches the control`);
          await next.click(); await pageFits();
        }
        assert.ok(await locator.isVisible(), `${label}: control shown after paging`);
      };
      await pageFits();
      const labels = [];
      const routes = page.locator('.replay-route');
      assert.equal(await routes.count(), 5);
      for (let i = 0; i < 5; i++) {
        const route = routes.nth(i);
        await reveal(route);
        const box = await route.evaluate(e => {
          const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { width: r.width, height: r.height, accessible: e.contains(hit) || hit === e, markColor: getComputedStyle(e.querySelector('.route-mark')).backgroundColor, overflow: e.scrollWidth - e.clientWidth };
        });
        assert.ok(box.width >= 48 && box.height >= 48 && box.accessible && box.overflow <= 1, `${label} route ${i}: ${JSON.stringify(box)}`);
        assert.notEqual(box.markColor, 'rgba(0, 0, 0, 0)');
        labels.push((await route.innerText()).split('\n')[0]);
        if (i === 0) await page.screenshot({ path: `${out}/${label}.png` });
      }
      const goals = page.locator('.replay-goal');
      assert.ok(await goals.count() >= 1, 'stamp goals follow the routes');
      await reveal(goals.first());
      const goalBox = await goals.first().boundingBox();
      assert.ok(goalBox.height >= 47.5, 'goal card is a readable touch-sized block');
      // Keyboard paging: the next button keeps focus inside the window until the last page.
      await next.focus();
      let pages = await currentPage();
      for (let step = 0; step < 20 && !await next.isDisabled(); step++) { await page.keyboard.press('Enter'); await pageFits(); pages = await currentPage(); }
      assert.ok(await page.locator('.replay-panel').evaluate(el => el.contains(document.activeElement)), 'focus stays inside the window after the last page');
      assert.ok(await page.locator('.replay-notes-page').isVisible(), 'the note page closes the sequence');
      assert.deepEqual(errors, []);
      results.push({ language, width, height, pass: true, routes: labels, pages });
      console.log(`PASS ${label}: five routes over ${pages} pages, touch, keyboard paging, translations`);
    } catch (error) {
      await page.screenshot({ path: `${out}/${label}-failure.png` });
      results.push({ language, width, height, pass: false, error: error.message });
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); fs.writeFileSync(`${out}/results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)); }
