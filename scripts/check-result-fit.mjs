import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Source-only layout fixtures: use real navigation/ResultScreen/ResultScene in an
// isolated browser profile. These are presentation stress cases, not award tests.
const BASE = process.env.RESULT_FIT_URL || 'http://127.0.0.1:5180';
const OUT = process.env.RESULT_FIT_OUT || 'tmp/result-fit';
const FILTER = process.env.RESULT_FIT_FILTER || '';
const VIEWPORT = process.env.RESULT_FIT_VIEWPORT || '';
const KEY = 'typing_adventure_save_v1';
const sizes = [[1280, 800], [1024, 768], [915, 412], [1920, 1080], [375, 812], [768, 1024]].filter(s => !VIEWPORT || VIEWPORT.split(',').includes(s.join('x')));
assert.ok(sizes.length, 'RESULT_FIT_VIEWPORT must be a supported WIDTHxHEIGHT');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: process.env.RESULT_FIT_BROWSER_CHANNEL || 'chrome' });

function fixture(language, kind) {
  const en = language === 'en', empty = kind === 'empty-fail';
  const target = en
    ? 'Read the whole sentence, check the spaces, and help your companion find the way home before the final gate closes.'
    : '문장 전체를 읽고 낱말 사이의 빈칸을 확인해서 마지막 문이 닫히기 전에 길을 잃은 친구가 집으로 돌아갈 수 있게 도와주자.';
  const at = '2026-09-11T10:00:00.000Z';
  const save = {
    version: '2',
    profile: { name: en ? 'Adventure Tester' : '성장하는 모험가', characterId: 'glasses_boy', petId: 'dragon', difficulty: 'normal', canDo: '' },
    progress: { unlockedStage: 5, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5'], stageStars: { stage_1: 3, stage_2: 3, stage_3: 3, stage_4: 3, stage_5: 3 }, coins: 12345, tutorialCompleted: true },
    records: { bestCpm: 245, bestAccuracy: 100, bestCombo: 120, bestScoreByStage: {}, ghosts: {}, daily: {}, learning: {
      patterns: empty ? {} : { spacing: { mistakes: 3, corrections: 1, newSuccesses: 0, delayedSuccesses: 0, lastTarget: target, lastTyped: target.replace(' ', ''), lastErrorAt: at, pendingTargets: [target], transferTargets: [] } },
      recent: empty ? [] : [{ at, stageId: 'stage_3', source: 'game', accuracy: 78.4, cpm: 95, correct: 6, corrected: 1, skipped: 2, newSuccesses: 1 }, { at, stageId: 'stage_4', source: 'game', accuracy: 99.2, cpm: 245, correct: 3, corrected: 3, skipped: 0, newSuccesses: 2 }], seen: [],
    } },
    collection: { badges: ['first_clear', 'fever_master'], wordsSeen: [], petsUnlocked: ['cat', 'rabbit', 'dragon', 'squirrel'], charactersUnlocked: ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'], enemiesSeen: [] },
    settings: { language, bgm: false, sfx: false, screenShake: false, showKeyboardGuide: false, prologueSeen: true },
    stats: { totalWords: 3456, totalClears: 20, totalPlaySec: 12345 }, updatedAt: at,
  };
  const result = {
    stageId: kind === 'final-clear' ? 'stage_5' : kind === 'rich-clear' ? 'stage_2' : 'stage_1',
    cleared: !empty, failReason: empty ? 'time' : undefined,
    score: empty ? 0 : 123456, accuracy: empty ? 0 : 99.2, cpm: empty ? 0 : 245,
    maxCombo: empty ? 0 : 120, elapsedSec: empty ? 180 : 48, wordsDone: empty ? 0 : 35, wordsTotal: 35,
    perfectCount: empty ? 0 : 25, coins: empty ? 0 : 128, attemptedCount: empty ? 0 : 36,
    correctedCount: empty ? 0 : 8, skippedCount: empty ? 0 : 3, stars: empty ? 0 : 3,
    newBadges: empty ? [] : ['first_clear', 'accuracy_100', 'combo_10', 'fever_master', 'speed_150', 'three_stars', 'perfect_5', 'forest_hero', 'lake_hero', 'ghost_beat', 'desert_hero', 'letter_perfect', 'train_hero', 'train_calm', 'ending', 'coin_collector'],
    isNewCpm: !empty, isNewAccuracy: !empty, isNewCombo: !empty, isNewScore: !empty,
    newUnlocks: empty ? [] : ['루카', '아기 드래곤', '숲 마법사 다람쥐'],
    newTitles: empty ? [] : ['낱말 수집가', '문장 탐험가', '글자 수호자'],
    replayRewards: empty ? [] : ['steady', 'accurate', 'brave'],
    mistakes: empty ? [] : [target], wordsSeen: [],
  };
  if (kind === 'rich-clear') Object.assign(result, { remix: true, beatGhost: true, ghost: { at, timeSec: 48, difficulty: 'normal', samples: [{ time: 0, progress: 0 }, { time: 48, progress: 1 }] } });
  return { save, result };
}

async function settled(page) {
  await page.waitForFunction(() => !document.querySelector('#fade.on') && !document.getElementById('ui-stage').inert);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const nodes = [...document.querySelectorAll('.result-wrap, .result-wrap *')];
    const animations = nodes.flatMap(el => el.getAnimations()).filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(animations.map(a => a.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const contains = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
    const stageEl = document.getElementById('ui-stage'), stage = rect(stageEl);
    const wrap = document.querySelector('.result-wrap'), panel = document.querySelector('.result-panel');
    const body = document.querySelector('.result-body'), actions = document.querySelector('.result-actions');
    const panes = [...document.querySelectorAll('[role="tabpanel"], .result-pane')].filter(visible);
    const pageParts = [...wrap.querySelectorAll('.result-pages, .result-page-content, .result-detail-card')].filter(visible);
    const frames = [...new Set([wrap, panel, body, actions, ...panes, ...pageParts])].filter(Boolean).map(el => ({ name: el.className, ...rect(el), parent: el.classList.contains('result-detail-card') ? rect(el.parentElement) : null, scrolls: ['auto', 'scroll'].includes(getComputedStyle(el).overflowY), inBody: el !== body && body.contains(el), overflowX: el.scrollWidth - el.clientWidth, overflowY: el.scrollHeight - el.clientHeight, scrollTop: el.scrollTop }));
    const controls = [...wrap.querySelectorAll('button')].filter(visible).map(el => {
      const r = rect(el), hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return { name: el.textContent.trim() || el.getAttribute('aria-label'), ...r, disabled: el.disabled, hit: hit === el || el.contains(hit), main: !!el.closest('.result-actions'), tab: !!el.closest('.result-tabs'), inBody: body.contains(el), inBodyView: contains(rect(body), r) };
    });
    const textProblems = [];
    const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || !visible(node.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (!r.width || !r.height) continue;
        if (!contains(stage, r) && !body.contains(node)) textProblems.push({ text: node.textContent.trim(), reason: 'outside game frame' });
        // Text inside an overflowing/ellipsized box is still present in the DOM.
        // Follow clipping ancestors so hiding overflow cannot disguise cut text.
        for (let parent = node.parentElement; parent && wrap.contains(parent); parent = parent.parentElement) {
          const css = getComputedStyle(parent), p = rect(parent);
          const clipsX = ['hidden', 'clip', 'auto', 'scroll'].includes(css.overflowX);
          const clipsY = ['hidden', 'clip'].includes(css.overflowY);
          // Vertical result-body scrolling is intentional; horizontal clipping never is.
          if ((clipsX && (r.left < p.left - 1 || r.right > p.right + 1)) || (clipsY && (r.top < p.top - 1 || r.bottom > p.bottom + 1))) {
            textProblems.push({ text: node.textContent.trim(), reason: `clipped by ${parent.className}`, textRect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, parentRect: p });
            break;
          }
        }
        const control = node.parentElement.closest('button');
        if (control && !contains(rect(control), r)) textProblems.push({ text: node.textContent.trim(), reason: 'outside own button' });
      }
    }
    const sc = window.__game?.scene.getScene('Result');
    const canvas = window.__game?.canvas.getBoundingClientRect();
    const actors = (sc?.children.list || []).filter(o => o.visible && o.alpha > 0 && o.type === 'Sprite' && /^(char_|pet_)/.test(o.texture?.key)).map(o => {
      const f = o.frame, matrix = o.getWorldTransformMatrix();
      const x = f.x - o.displayOriginX, y = f.y - o.displayOriginY;
      const points = [[x, y], [x + f.width, y], [x, y + f.height], [x + f.width, y + f.height]].map(([px, py]) => matrix.transformPoint(px, py));
      const xs = points.map(p => canvas.left + p.x * canvas.width / 1920), ys = points.map(p => canvas.top + p.y * canvas.height / 1080);
      return { texture: o.texture.key, frame: String(f.name), left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    });
    const stats = document.querySelector('.result-grid'), lastStat = stats?.lastElementChild;
    return { stage, panel: rect(panel), portrait: stageEl.classList.contains('portrait-display'), castCaptionVisible: visible(document.querySelector('.result-cast-label')), statGrid: stats && visible(stats) ? rect(stats) : null, lastStat: lastStat && visible(lastStat) ? rect(lastStat) : null, viewport: { width: innerWidth, height: innerHeight }, frames, controls, textProblems, actors,
      panes: panes.length, documentOverflow: Math.max(document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth),
      selectedTabs: [...document.querySelectorAll('.result-tabs button')].filter(el => el.getAttribute('aria-selected') === 'true').length,
    };
  });
}

async function assertPinnedControls(page, label) {
  // Hit testing follows the painted scroll position, not an intermediate compositor frame.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const blocked = await page.evaluate(() => [...document.querySelectorAll('.result-tabs button, .result-actions button')].filter(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1 || (!el.disabled && hit !== el && !el.contains(hit));
  }).map(el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { name: el.textContent.trim(), rect: r.toJSON(), hit: hit?.className }; }));
  assert.deepEqual(blocked, [], `${label}: tabs and primary actions stay visible while details scroll`);
}

async function assertScrollableControls(page, label) {
  const body = page.locator('.result-body');
  const controls = body.locator('button').filter({ visible: true });
  for (const control of await controls.all()) {
    if (await control.isDisabled()) continue;
    await control.scrollIntoViewIfNeeded();
    assert.equal(await control.evaluate(el => {
      const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.top >= 0 && r.bottom <= innerHeight && (hit === el || el.contains(hit));
    }), true, `${label}: ${await control.innerText()} must be reachable by normal scrolling`);
    await assertPinnedControls(page, label);
  }
  await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await assertPinnedControls(page, label);
  await body.evaluate(el => { el.scrollTop = 0; });
}

async function checkPractice(page, language, learning, label) {
  // Restore the same long, real-pattern presentation fixture at every size.
  await page.evaluate(async learning => {
    const loaded = performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname === '/src/game/systems/SaveSystem.ts');
    const { SaveSystem } = await import(loaded);
    SaveSystem.get().records.learning = learning;
  }, learning);
  await page.getByRole('button', { name: /^(고쳐서 다시 해보기|새 낱말 도전|Correct and retry|New words) ·/ }).click();
  const dialog = page.locator('.practice-panel');
  await dialog.waitFor();
  const reason = dialog.locator('[data-pattern="spacing"]');
  if (await reason.count()) {
    await reason.click();
    await dialog.getByRole('button', { name: language === 'ko' ? '이제 고쳐 써 보기 →' : 'Now fix it →', exact: true }).click();
  }
  for (let index = 0; index < 3; index++) {
    const input = dialog.locator('.practice-input');
    await input.scrollIntoViewIfNeeded();
    await input.fill(await dialog.locator('.practice-target').innerText());
    await dialog.getByRole('button', { name: language === 'ko' ? '확인 · Enter' : 'Check · Enter', exact: true }).click();
    const bounds = await dialog.evaluate(el => ({ rect: el.getBoundingClientRect().toJSON(), overflowX: el.scrollWidth - el.clientWidth, viewport: { width: innerWidth, height: innerHeight } }));
    assert.ok(bounds.rect.left >= -1 && bounds.rect.right <= bounds.viewport.width + 1 && bounds.rect.top >= -1 && bounds.rect.bottom <= bounds.viewport.height + 1 && bounds.overflowX <= 1, `${label}: practice dialog fits the viewport ${JSON.stringify(bounds)}`);
  }
  assert.ok(await dialog.locator('.practice-success').isVisible(), 'All three practice targets completed');
  await page.screenshot({ path: `${OUT}/${label}-practice.png` });
  await dialog.getByRole('button', { name: language === 'ko' ? '모험으로 돌아가기' : 'Return to adventure', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await settled(page);
  assert.equal(await page.locator('#result-tab-1').getAttribute('aria-selected'), 'true', 'Closing practice restores the Growth tab');
  await assertPinnedControls(page, label);
}

function assertFit(m, label) {
  const contains = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
  const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  assert.equal(m.panes, 1, `${label}: one visible result pane`);
  assert.equal(m.selectedTabs, 1, `${label}: one selected result tab`);
  assert.ok(m.documentOverflow <= 1, `${label}: document must not scroll`);
  for (const frame of m.frames) {
    assert.ok(frame.inBody || contains(m.stage, frame), `${label}: ${frame.name} outside screen ${JSON.stringify(frame)}`);
    if (frame.parent) assert.ok(contains(frame.parent, frame), `${label}: reward/detail card overlaps its page controls ${JSON.stringify(frame)}`);
    assert.ok(frame.overflowX <= 1 && (frame.scrolls || frame.overflowY <= 1), `${label}: ${frame.name} clips content outside its scrolling body ${JSON.stringify(frame)}`);
  }
  assert.deepEqual(m.textProblems, [], `${label}: all text must be readable without clipping`);
  assert.ok(m.controls.filter(c => c.main).length >= 2, `${label}: main navigation buttons present`);
  for (const button of m.controls) {
    assert.ok(button.inBody || (contains(m.stage, button) && contains(m.panel, button)), `${label}: ${button.name} button outside panel`);
    assert.ok(button.disabled || (button.inBody && !button.inBodyView) || button.hit, `${label}: ${button.name} button blocked`);
    if (button.main || button.tab) assert.ok(button.height >= 47 && button.width >= 43, `${label}: ${button.name} primary/tab button too small`);
  }
  assert.ok(m.actors.some(a => a.texture.startsWith('char_')) && m.actors.some(a => a.texture.startsWith('pet_')), `${label}: actual adventurer and pet visible`);
  if (m.portrait) {
    assert.equal(m.castCaptionVisible, false, `${label}: the wide-scene caption must not show behind the portrait panel`);
    if (m.statGrid) assert.ok(Math.abs(m.statGrid.width - m.lastStat.width) <= 1, `${label}: the final score fills the portrait statistics row`);
  }
  for (const actor of m.portrait ? [] : m.actors) {
    assert.ok(contains(m.stage, actor), `${label}: ${actor.texture} outside game frame ${JSON.stringify(actor)}`);
    assert.ok(!overlaps(m.panel, actor), `${label}: panel covers ${actor.texture} ${JSON.stringify({ panel: m.panel, actor })}`);
  }
}

try {
  for (const language of ['ko', 'en']) for (const kind of ['empty-fail', 'rich-clear', 'final-clear']) {
    if (FILTER && !`${language}-${kind}`.includes(FILTER)) continue;
    const { save, result } = fixture(language, kind);
    const context = await browser.newContext({ viewport: { width: sizes[0][0], height: sizes[0][1] }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
    await context.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: KEY, data: save });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('.opening-skip').click({ timeout: 60000 });
      await page.locator('.home-menu').waitFor({ timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector('.opening-player') && !document.querySelector('#fade.on') && !document.getElementById('ui-stage').inert);
      await page.evaluate(async result => {
        // Vite HMR may have loaded the live singleton with a ?t= revision. Import
        // that exact resource, rather than constructing a second Game module.
        const loaded = performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname === '/src/game/Game.ts');
        if (!loaded) throw new Error('The source Game module was not loaded; this fixture requires the dev server.');
        const { navigate } = await import(loaded);
        // Results normally follow a loaded battle. Visiting the real intro first
        // loads that stage's background/actors without simulating score awards.
        await navigate('intro', { stageId: result.stageId });
        await navigate('result', { result });
      }, result);
      await page.locator('.result-tabs button').first().waitFor({ timeout: 60000 });
      await page.waitForFunction(stars => document.querySelectorAll('.result-stars .star.on').length === stars, result.stars);
      if (!result.cleared) await page.waitForTimeout(750); // Let the authored hit → sad pose finish.
      for (const [width, height] of sizes) {
        const label = `${language}-${kind}-${width}x${height}`, measurements = [];
        try {
          await page.setViewportSize({ width, height }); await settled(page);
          const tabs = page.locator('.result-tabs button');
          assert.equal(await tabs.count(), 3, 'result has three information tabs');
          if (language === 'ko') assert.deepEqual(await tabs.allTextContents(), ['이번 결과', '성장 기록', '받은 선물']);
          for (let i = 0; i < 3; i++) {
            await tabs.nth(i).click(); await settled(page);
            // The UI preserves the selected detail page across tab/viewport
            // changes. Rewind through its real controls to cover every page.
            for (let back = 0; back < 31; back++) {
              const previous = page.locator('[data-result-page-prev]').filter({ visible: true });
              if (!await previous.count() || await previous.first().isDisabled()) break;
              assert.ok(back < 30, 'previous-page navigation must reach the start');
              await previous.first().click(); await settled(page);
            }
            let pageIndex = 0;
            while (true) {
              const m = await inspect(page); measurements.push({ tab: i, page: pageIndex, ...m });
              assertFit(m, `${label} tab${i} page${pageIndex}`);
              await assertScrollableControls(page, `${label} tab${i} page${pageIndex}`);
              if (pageIndex === 0) await page.screenshot({ path: `${OUT}/${label}-tab${i}-page${pageIndex}.png` });
              const next = page.locator('[data-result-page-next]').filter({ visible: true });
              if (!await next.count() || await next.first().isDisabled()) break;
              assert.ok(pageIndex < 30, 'pagination must end within the bounded fixture');
              await next.first().click(); await settled(page); pageIndex++;
            }
          }
          if (kind === 'rich-clear') {
            await tabs.nth(1).click(); await settled(page);
            for (let back = 0; back < 31; back++) {
              const previous = page.locator('[data-result-page-prev]').filter({ visible: true });
              if (!await previous.count() || await previous.first().isDisabled()) break;
              assert.ok(back < 30, 'practice search can rewind to the first page');
              await previous.first().click();
            }
            for (let forward = 0; forward < 31; forward++) {
              if (await page.getByRole('button', { name: /^(고쳐서 다시 해보기|새 낱말 도전|Correct and retry|New words) ·/ }).count()) break;
              assert.ok(forward < 30, 'practice action must exist in Growth');
              const next = page.locator('[data-result-page-next]').filter({ visible: true }).first();
              assert.ok(await next.isEnabled(), 'practice action is reachable before the last page');
              await next.click();
            }
            await checkPractice(page, language, structuredClone(save.records.learning), label);
          }
          assert.deepEqual(errors, [], 'no browser runtime exceptions');
          results.push({ label, pass: true, measurements }); console.log(`PASS ${label}`);
        } catch (error) {
          const screenshot = `${OUT}/failure-${label}.png`;
          await page.screenshot({ path: screenshot }).catch(() => {});
          results.push({ label, pass: false, error: String(error), errors: [...errors], screenshot, measurements });
          console.error(`FAIL ${label}: ${error}`);
        }
      }
    } catch (error) {
      results.push({ label: `${language}-${kind}-setup`, pass: false, error: String(error), errors });
      console.error(`FAIL ${language}-${kind} setup: ${error}`);
    } finally { await context.close(); }
  }
} finally {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), filter: FILTER, viewport: VIEWPORT || 'all', results }, null, 2));
  await browser.close();
}
assert.ok(results.length, 'at least one result fixture matched');
if (results.some(r => !r.pass)) process.exitCode = 1;
console.log(`${results.filter(r => r.pass).length}/${results.length} result cases passed`);
