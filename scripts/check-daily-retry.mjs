import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.DAILY_RETRY_URL || 'http://127.0.0.1:5181';
const OUT = process.env.DAILY_RETRY_OUT || 'tmp/daily-retry-20260912';
const KEY = 'typing_adventure_save_v1';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: 'chrome', args: [
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
] });

try {
  for (const language of ['ko', 'en']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
    await context.addInitScript(({ key, language }) => localStorage.setItem(key, JSON.stringify({
      profile: { name: 'Retry tester', characterId: 'pink_girl', petId: 'rabbit', difficulty: 'normal' },
      progress: { tutorialCompleted: true, unlockedStage: 5 },
      settings: { language, bgm: false, sfx: false, prologueSeen: true },
    })), { key: KEY, language });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(60000);
    page.on('pageerror', error => errors.push(error.message));
    const settled = () => page.waitForFunction(() => !document.querySelector('#ui-stage[aria-busy]') && !document.querySelector('#fade.on'));
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('.opening-skip').click(); await settled();
      await page.evaluate(async () => {
        const exact = path => performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname === path);
        window.__dailyRetryGame = await import(exact('/src/game/Game.ts'));
        window.__dailyRetryModal = await import(exact('/src/game/ui/ModalController.ts'));
      });
      for (const [index, kind] of ['word', 'sentence', 'long'].entries()) {
        await page.evaluate(() => window.__dailyRetryModal.dailyPickModal());
        await page.locator('.daily-pick-card').nth(index).click(); await settled();
        await page.waitForFunction(() => window.__battle?.running && !document.querySelector('.bb-input')?.disabled);
        const before = await page.evaluate(() => ({ kind: window.__battle.kind, total: window.__battle.snapshot().targetTotal, target: window.__battle.snapshot().target.text }));
        assert.equal(before.kind, kind);
        if (kind === 'word') assert.equal(before.total, 20);
        if (kind === 'sentence') assert.equal(before.total, 10);
        assert.ok(before.total > 0);
        for (let done = 0; done < before.total; done++) {
          const target = await page.locator('.bb-target').innerText();
          assert.ok(target.trim(), 'a real typing target is visible');
          await page.locator('.bb-input').fill(target);
          await page.waitForFunction(count => window.__battle.snapshot().wordsDone === count, done + 1);
        }
        await page.locator('.result-banner').waitFor(); await settled();
        assert.ok(!(await page.locator('.result-banner').getAttribute('class')).includes('fail'), 'actual daily completion reaches success');
        const record = await page.evaluate(({ key, kind }) => {
          const now = new Date(), day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const save = JSON.parse(localStorage.getItem(key));
          const recordKey = kind === 'word' ? day : `${day}:${kind}`;
          return { key: recordKey, value: save.records.daily[recordKey] };
        }, { key: KEY, kind });
        assert.ok(record.value?.score > 0, 'completion saves under the correct daily kind');
        await page.getByRole('button', { name: language === 'en' ? 'Play again' : '바로 다시 도전', exact: true }).click();
        await settled(); await page.waitForFunction(() => window.__battle?.running && !document.querySelector('.bb-input')?.disabled);
        const after = await page.evaluate(() => ({ kind: window.__battle.kind, total: window.__battle.snapshot().targetTotal, target: window.__battle.snapshot().target.text, wordsDone: window.__battle.snapshot().wordsDone }));
        assert.equal(after.kind, kind, 'retry preserves daily mode');
        assert.equal(after.total, before.total, 'retry preserves the full target count');
        assert.equal(after.target, before.target, 'same-day retry begins the same daily set');
        assert.equal(after.wordsDone, 0, 'retry starts a new run');
        await page.locator('.bb-input').fill(await page.locator('.bb-target').innerText());
        await page.waitForFunction(() => window.__battle.snapshot().wordsDone === 1);
        await page.screenshot({ path: `${OUT}/${language}-${kind}-retry.png` });
        results.push({ language, kind, pass: true, before, after, record });
        fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
        console.log(`PASS ${language} ${kind}: ${before.total} targets completed, retry kind and first input preserved`);
        await page.evaluate(() => window.__dailyRetryGame.navigate('home')); await settled();
      }
      assert.deepEqual(errors, [], 'no runtime errors');
    } catch (error) {
      results.push({ language, pass: false, error: String(error), errors });
      await page.screenshot({ path: `${OUT}/${language}-failure.png` }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
}
