import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const out = 'tmp/collection-layout';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [width, height] of [[1280,720], [1024,768], [981,542], [915,412], [768,1024]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('typing_adventure_save_v1', JSON.stringify({ profile: { name: 'Player', characterId: 'brown_boy', petId: 'cat' }, settings: { language: 'ko', bgm: false, sfx: false, prologueSeen: true } })));
    await page.goto('http://127.0.0.1:5180');
    if (height > width && width < 900) {
      // Recent layouts support portrait directly. Older builds show a rotation hint;
      // accept that fallback, otherwise inspect the real portrait collection panel.
      const hint = page.locator('#rotate-hint');
      if (await hint.isVisible()) {
        console.log(`${width}x${height}: portrait rotation guidance visible`);
        await page.close(); continue;
      }
    }
    await page.locator('.opening-skip').click();
    await page.locator('.home-tutorial').waitFor();
    await page.locator('#ui-stage[aria-busy="true"]').waitFor({ state: 'detached' });
    await page.locator('.home-more summary').click();
    await page.locator('.home-extra-grid button').filter({ hasText: '도감' }).click();
    for (const tab of ['monsters', 'badges', 'pets', 'items', 'titles']) {
      await page.locator(`[data-tab="${tab}"]`).click();
      const gridLayout = await page.locator('.popup-card-grid:visible').evaluate(grid => ({
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
        cards: grid.children.length,
        cardColumns: getComputedStyle(grid).getPropertyValue('--popup-card-columns').trim(),
        inlineStyle: grid.getAttribute('style'),
        stageClass: document.getElementById('ui-stage')?.className,
      }));
      const roomyLandscape = width >= 900 && height >= 500;
      assert.equal(gridLayout.columns, roomyLandscape ? 3 : 2, `${tab}: expected card columns ${JSON.stringify(gridLayout)}`);
      assert.ok(gridLayout.cards <= (roomyLandscape ? 6 : 2), `${tab}: page only holds one complete card grid`);
      const metrics = await page.locator('.modal').evaluate(panel => {
        const body = panel.querySelector('.collection-body') ?? panel.lastElementChild;
        const r = panel.getBoundingClientRect();
        const last = body.lastElementChild.getBoundingClientRect();
        const close = panel.querySelector('.modal-close').getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, overflow: body.scrollWidth - body.clientWidth, scroll: body.scrollHeight > body.clientHeight, lastBottom: last.bottom, closeVisible: document.elementFromPoint(close.x + close.width / 2, close.y + close.height / 2)?.closest('.modal-close') !== null };
      });
      if (tab === 'monsters' || tab === 'pets') await page.screenshot({ path: `${out}/${width}-${tab}${process.env.COLLECTION_BEFORE ? '-before' : ''}.png` });
      if (!process.env.COLLECTION_BEFORE) {
        assert.ok(metrics.x >= 0 && metrics.y >= 0 && metrics.right <= width + 1 && metrics.bottom <= height + 1, `Dialog inside viewport: ${JSON.stringify(metrics)}`);
        assert.ok(metrics.overflow <= 1, 'No horizontal content overflow');
        assert.ok(metrics.scroll || metrics.lastBottom <= metrics.bottom, 'Cards stay inside body or scroll');
        assert.ok(metrics.closeVisible, 'Close button is reachable');
        await page.locator('.collection-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
        const lastCard = page.locator('.popup-page:not([hidden]) .coll-item').last();
        assert.ok(await lastCard.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === hit || el.contains(hit); }), 'Last card reachable by internal scrolling');
      }
      console.log(`${width} ${tab}: ${JSON.stringify(metrics)}`);
    }
    await page.locator('.modal-close').click();
    assert.equal(await page.locator('#ui-root').evaluate(el => el.inert), false);
    assert.deepEqual(errors, []);
    await page.close();
    if (process.env.COLLECTION_BEFORE) break;
  }
} finally { await browser.close(); }
