import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Isolated profiles only. Viewport/IME events are simulations, not device QA.
const BASE = process.env.TABLET_TEST_URL || 'http://127.0.0.1:5180';
const server = process.env.TABLET_TEST_URL ? undefined : await (await import('vite')).createServer({ server: { host: '127.0.0.1', port: 5180, strictPort: true } });
await server?.listen();
const OUT = process.env.TABLET_TEST_OUT || 'tmp/tablet-practice';
const sizes = [[1024, 768], [1180, 820], [1280, 800], [1024, 600]]
  .filter(size => !process.env.TABLET_TEST_SIZE || size.join('x') === process.env.TABLET_TEST_SIZE);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.TABLET_BROWSER_PATH ? { executablePath: process.env.TABLET_BROWSER_PATH } : {}),
  ...(process.env.TABLET_TEST_PROXY ? { proxy: { server: process.env.TABLET_TEST_PROXY } } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const results = [];
const inspect = page => page.evaluate(() => {
  const panel = document.querySelector('.tutorial-practice');
  const viewport = document.querySelector('#viewport').getBoundingClientRect();
  const pr = panel.getBoundingClientRect();
  const clip = { left: Math.max(pr.left, viewport.left), top: Math.max(pr.top, viewport.top),
    right: Math.min(pr.right, viewport.right), bottom: Math.min(pr.bottom, viewport.bottom) };
  const measure = selector => {
    const el = document.querySelector(selector);
    if (!el || !el.getClientRects().length) return { displayed: false };
    const r = el.getBoundingClientRect();
    return { displayed: true, x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1),
      fullyVisible: r.left >= clip.left - 1 && r.top >= clip.top - 1 && r.right <= clip.right + 1 && r.bottom <= clip.bottom + 1,
      textFits: el.scrollHeight <= el.clientHeight + 1 };
  };
  const input = document.querySelector('#tutorial-input');
  return { stage: document.querySelector('#ui-stage').className,
    panelScroll: Math.round(panel.scrollHeight - panel.clientHeight),
    target: measure('.tutorial-target'), input: measure('#tutorial-input'), send: measure('.tutorial-form button'),
    guide: measure('.tutorial-keyboard'), bottomRow: measure('.tutorial-keyboard .kbd-row-3'),
    space: measure('.tutorial-keyboard [data-key="Space"]'),
    focused: document.activeElement === input, value: input.value,
    progress: document.querySelector('.tutorial-item-progress').textContent };
});
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
try {
  for (const language of ['ko', 'en']) for (const [width, height] of sizes) {
    const label = `${language}-${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await context.addInitScript(language => {
      const vv = window.visualViewport;
      const nativeHeight = Object.getOwnPropertyDescriptor(VisualViewport.prototype, 'height').get;
      Object.defineProperty(vv, 'height', { get: () => window.__testVisualHeight ?? nativeHeight.call(vv) });
      localStorage.setItem('typing_adventure_save_v1', JSON.stringify({
        profile: { name: 'QA', characterId: 'brown_boy', petId: 'cat' },
        settings: { language, bgm: false, sfx: false, prologueSeen: true },
      }));
    }, language);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const record = { label, base: BASE, states: [], errors, failures: [] };
    const capture = async (name, keyboard = false) => {
      // Mobile emulation may deliver visualViewport.resize after setViewportSize.
      // Capture flushes the compositor; measure only its settled final layout.
      await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
      await settle(page);
      const state = await inspect(page);
      record.states.push({ name, ...state });
      const required = keyboard ? ['target', 'input', 'send'] : ['target', 'input', 'send', 'bottomRow', 'space'];
      for (const key of required) if (!state[key].fullyVisible) record.failures.push(`${name}: ${key} clipped`);
      if (keyboard && state.guide.displayed) record.failures.push(`${name}: guide did not hide`);
      if (keyboard && !state.focused) record.failures.push(`${name}: input lost focus`);
      return state;
    };
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('.opening-skip').click();
      await page.locator('.home-tutorial').click();
      await page.locator('[data-part="story"]').click();
      await page.locator('.tutorial-story-start').first().click();
      const input = page.locator('#tutorial-input');
      await input.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await input.focus();
      await capture('initial');
      const target = await page.locator('.tutorial-target').getAttribute('data-target');
      await input.fill(target);
      await input.press('Enter');
      await page.waitForFunction(() => document.querySelector('.tutorial-item-progress')?.textContent.startsWith('2 /'));
      assert.equal(await page.locator('.tutorial-target').textContent(),
        await page.locator('.tutorial-target').getAttribute('data-target'),
        'Displayed text must advance with the accepted target');
      await capture('after-submit');
      await input.fill('x');
      await input.press('Enter');
      await capture('after-error');
      await input.fill('partial');
      await page.setViewportSize({ width, height: Math.min(360, height - 200) });
      const open = await capture('keyboard-open', true);
      assert.equal(open.value, 'partial', 'resize preserves input');
      await page.setViewportSize({ width, height });
      const closed = await capture('keyboard-close');
      assert.ok(closed.guide.displayed, 'guide returns after keyboard closes');
      assert.equal(closed.value, 'partial');
      // iPad-style keyboard: only visualViewport shrinks, layout stays full size.
      await page.evaluate(() => { window.__testVisualHeight = 360; visualViewport.dispatchEvent(new Event('resize')); });
      const visualOpen = await capture('visual-keyboard-open', true);
      assert.equal(visualOpen.value, 'partial');
      await page.evaluate(() => { window.__testVisualHeight = undefined; visualViewport.dispatchEvent(new Event('resize')); });
      await capture('visual-keyboard-close');
      if (width === 1280) {
        for (let story = 0; story < 4; story++) {
          if (story) await page.locator('.tutorial-story-start').nth(story).click();
          let sections = 0;
          while (await input.isVisible() && sections++ < 50) {
            const text = await page.locator('.tutorial-target').getAttribute('data-target');
            assert.equal(await page.locator('.tutorial-target').textContent(), text, 'Every section displays its current target');
            if (language === 'ko' && sections === 1) {
              await input.evaluate((el, text) => {
                el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
                el.value = text;
                el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: text }));
                el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', isComposing: true }));
                el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
              }, text);
              // Deliver any deferred IME Enter callback before the next section.
              await page.waitForTimeout(80);
            } else { await input.fill(text); await input.press('Enter'); }
          }
          await page.locator('.tutorial-diary-image').waitFor();
          await page.locator('.tutorial-diary-actions .btn').first().click();
        }
        assert.equal(await page.locator('.tutorial-story-open').count(), 4, 'All four completed diaries are saved');
        record.completedDiaries = 4;
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      record.failures.push(error.message);
      await page.screenshot({ path: `${OUT}/${label}-error.png` }).catch(() => {});
    } finally { await context.close(); }
    results.push(record);
    fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ label, failures: record.failures, states: record.states.map(s => ({name:s.name,scroll:s.panelScroll,target:s.target.fullyVisible,input:s.input.fullyVisible,space:s.space.fullyVisible,stage:s.stage})) }));
  }
} finally { await browser.close(); await server?.close(); }
if (results.some(r => r.failures.length)) process.exitCode = 1;
