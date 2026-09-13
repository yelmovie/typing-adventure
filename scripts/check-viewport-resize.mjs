import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Model keyboard height changes and device rotation while a real sentence input
// is focused. This verifies resize handling, not a physical device's IME.
const BASE = process.env.LAYOUT_TEST_URL || 'http://127.0.0.1:5180';
const OUT = 'tmp/viewport-resize-20260914';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
try {
  for (const size of [[375, 812], [768, 1024]]) {
    const context = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
    await context.addInitScript(() => localStorage.setItem('typing_adventure_save_v1', JSON.stringify({
      version: '1', profile: { name: '하늘', characterId: 'brown_boy', petId: 'rabbit', difficulty: 'normal' },
      progress: { unlockedStage: 5, stageStars: {}, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4'], practicedParts: [], skippedPracticeStages: [], coins: 0 },
      records: { bestCpm: 0, bestAccuracy: 0, bestCombo: 0, bestScoreByStage: {}, ghosts: {}, daily: {} },
      collection: { badges: [], wordsSeen: [], petsUnlocked: ['cat', 'rabbit'], charactersUnlocked: ['brown_boy'], enemiesSeen: [] },
      settings: { language: 'ko', bgm: false, sfx: false, prologueSeen: true, showKeyboardGuide: false },
      stats: { totalClears: 4, totalWords: 100, totalPlaySec: 100 },
    })));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      await page.goto(`${BASE}/?go=battle&stage=stage_3&st=1`);
      const input = page.locator('.bb-input');
      await input.waitFor();
      await page.waitForFunction(() => !document.querySelector('.bb-input').disabled && window.__battle);
      const partial = (await page.locator('.bb-target').innerText()).slice(0, 2);
      await input.fill(partial);
      const done = await page.evaluate(() => window.__battle.snapshot().wordsDone);
      const steps = [];
      for (const [label, width, height, portrait, keyboard] of [
        ['keyboard-open', size[0], size[0] === 375 ? 450 : 500, true, true],
        ['keyboard-close', ...size, true, false],
        ['rotate-landscape', size[1], size[0], false, false],
        ['rotate-portrait', ...size, true, false],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(({ portrait, keyboard }) => {
          const stage = document.querySelector('#ui-stage');
          return stage.classList.contains('portrait-display') === portrait && stage.classList.contains('keyboard-display') === keyboard;
        }, { portrait, keyboard });
        // Wait for layout and compositor to agree before center-point hit testing.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const state = await input.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { value: element.value, focused: document.activeElement === element,
            visible: rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1,
            hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element };
        });
        assert.equal(state.value, partial, `${label}: partial input survives`);
        assert.ok(state.focused && state.visible && state.hit, `${label}: input remains focused, visible and usable: ${JSON.stringify(state)}`);
        assert.equal(await page.evaluate(() => window.__battle.snapshot().wordsDone), done, `${label}: rotation must not reset or submit the sentence`);
        steps.push({ label, width, height, ...state });
        await page.screenshot({ path: `${OUT}/${size.join('x')}-${label}.png` });
      }
      assert.deepEqual(errors, []);
      results.push({ size, pass: true, steps, errors });
      console.log(`PASS ${size.join('x')} keyboard open/close and both rotations`);
    } catch (error) {
      results.push({ size, pass: false, error: error.message, errors });
      await page.screenshot({ path: `${OUT}/${size.join('x')}-failure.png` });
      console.error(`FAIL ${size.join('x')}: ${error.message}`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
if (results.some(result => !result.pass)) process.exitCode = 1;
