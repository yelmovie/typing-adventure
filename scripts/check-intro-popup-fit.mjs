import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.INTRO_FIT_URL || 'http://127.0.0.1:5180';
const OUT = process.env.INTRO_FIT_OUT || 'tmp/intro-popup-fit';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const settle = async page => { await page.evaluate(async () => {
  await document.fonts.ready;
  const animations = [...document.querySelectorAll('.intro-panel, .intro-panel *, .modal, .modal *')].flatMap(el => el.getAnimations())
    .filter(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity);
  await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}); };
async function measure(page, selector) {
  return page.evaluate(selector => {
    const panel = document.querySelector(selector), stage = document.getElementById('ui-stage').getBoundingClientRect();
    const visible = el => !!el.getClientRects().length && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden';
    const contains = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
    const issues = [];
    if (!contains(stage, panel.getBoundingClientRect())) issues.push('panel outside stage');
    for (const el of [panel, ...panel.querySelectorAll('*')].filter(visible)) {
      if (['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1) issues.push(`scroll ${el.className}`);
      if (el.tagName === 'BUTTON') {
        const r = el.getBoundingClientRect();
        if (r.width < 47 || r.height < 47) issues.push(`small button ${el.textContent}`);
        if (!contains(panel.getBoundingClientRect(), r)) issues.push(`button outside panel ${el.textContent}`);
      }
    }
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || !visible(node.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (!contains(stage, r)) issues.push(`text outside stage ${node.textContent}`);
        if (!contains(panel.getBoundingClientRect(), r)) issues.push(`text outside panel ${node.textContent}`);
        for (let parent = node.parentElement; parent && parent !== panel; parent = parent.parentElement) {
          const css = getComputedStyle(parent), p = parent.getBoundingClientRect();
          if (['auto', 'scroll', 'hidden', 'clip'].includes(css.overflowY) && (r.top < p.top - 1 || r.bottom > p.bottom + 1)) issues.push(`clipped ${node.textContent}`);
        }
      }
    }
    return { issues, height: panel.getBoundingClientRect().height, width: panel.getBoundingClientRect().width };
  }, selector);
}
try {
  for (const language of ['ko', 'en']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
    // The game loads hundreds of assets; the default 250-entry resource buffer would drop the module URLs we look up below.
    await context.addInitScript(() => performance.setResourceTimingBufferSize(5000));
    const page = await context.newPage();
    await page.goto(BASE);
    await page.locator('.opening-skip').click({ timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('.home-menu') && !document.querySelector('.opening-player') && !document.querySelector('#fade.on') && !document.getElementById('ui-stage').inert && !document.getElementById('ui-stage').hasAttribute('aria-busy'));
    await page.evaluate(async language => {
      if (!document.querySelector('script[src="/@vite/client"]')) throw new Error('Intro fixture requires the source dev server');
      // Import the module instances the running game uses. After an HMR update the dev server serves
      // them as /src/…?t=<stamp>; a plain path would create a second, disconnected instance.
      const live = path => import(performance.getEntriesByType('resource').map(r => r.name).find(url => new URL(url).pathname === path) ?? path);
      const { SaveSystem } = await live('/src/game/systems/SaveSystem.ts');
      const { setLanguage } = await live('/src/game/i18n/Locale.ts');
      SaveSystem.setSettings({ language, bgm: false, sfx: false }); setLanguage(language);
      const save = SaveSystem.get();
      save.profile.name = 'Test'; save.progress.unlockedStage = 5;
      for (let i = 1; i <= 5; i++) { (save.progress.fails ??= {})[`stage_${i}`] = 3; (save.progress.assist ??= {})[`stage_${i}`] = true; }
      SaveSystem.save();
      window.fitNavigate = (await live('/src/game/Game.ts')).navigate;
    }, language);
    for (const [width, height] of [[1280, 800], [1024, 768], [915, 412], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      for (const stageId of ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5', 'daily']) {
        const label = `${language}-${stageId}-${width}x${height}`;
        try {
          await page.evaluate(stageId => window.fitNavigate('intro', { stageId }), stageId);
          await page.locator('.intro-help').waitFor(); await settle(page);
          const m = await measure(page, '.intro-panel'); assert.deepEqual(m.issues, [], label);
          await page.locator('.intro-help').click(); await settle(page);
          let count = 0;
          while (true) {
            const m = await measure(page, '.modal'); assert.deepEqual(m.issues, [], `${label} help${count}`);
            const next = page.locator('.popup-page-next:visible');
            if (!await next.count() || await next.isDisabled()) break;
            await next.click(); await settle(page); assert.ok(++count < 16);
          }
          await page.keyboard.press('Escape'); await settle(page);
          if (stageId === 'stage_1' && [915, 1280].includes(width)) await page.screenshot({ path: `${OUT}/${label}.png` });
          results.push({ label, pass: true, ...m, helpPages: count + 1 }); console.log(`PASS ${label}`);
        } catch (error) {
          await page.screenshot({ path: `${OUT}/failure-${label}.png` });
          results.push({ label, pass: false, error: String(error) }); console.error(`FAIL ${label}: ${error}`);
          await page.keyboard.press('Escape');
        }
      }
    }
    await context.close();
  }
} finally { await browser.close(); fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2)); }
if (results.some(r => !r.pass)) process.exitCode = 1;
console.log(`${results.filter(r => r.pass).length}/${results.length} intro cases passed`);
