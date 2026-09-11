import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Source-only, disposable-context presentation and interaction coverage.
// No user browser, external service, offline download or real save is touched.
const BASE = process.env.POPUP_FIT_URL || 'http://127.0.0.1:5180';
const OUT = process.env.POPUP_FIT_OUT || 'tmp/popup-fit';
const FILTER = process.env.POPUP_FIT_FILTER || '';
const VIEWPORT = process.env.POPUP_FIT_VIEWPORT || '';
const LANG = process.env.POPUP_FIT_LANGUAGE || '';
const BOUNDARY = process.env.POPUP_FIT_BOUNDARY === '1';
const BOUNDARY_CANDO_LENGTH = Number(process.env.POPUP_FIT_BOUNDARY_CANDO_LENGTH || 24);
assert.ok([24, 80].includes(BOUNDARY_CANDO_LENGTH), 'boundary self assessment must cover the current 24-character input or legacy 80-character save');
const KEY = 'typing_adventure_save_v1';
const sizes = BOUNDARY ? [[1920, 1080]] : [[1280, 800], [1024, 768], [915, 412], [1920, 1080]].filter(s => !VIEWPORT || s.join('x') === VIEWPORT);
assert.ok(sizes.length, 'POPUP_FIT_VIEWPORT must match a supported size');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: process.env.POPUP_FIT_BROWSER_CHANNEL || 'chrome' });

function fixture(language) {
  const en = language === 'en', at = new Date().toISOString(), now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const target = en ? 'Read the whole sentence, check the spaces, and help your companion find the way home before the final gate closes.' : '문장 전체를 읽고 낱말 사이의 빈칸을 확인해서 마지막 문이 닫히기 전에 길을 잃은 친구가 집으로 돌아갈 수 있게 도와주자.';
  return {
    version: '2', profile: { name: BOUNDARY ? '가나다라마바사아자차카타파하'.repeat(2).slice(0, 24) : en ? 'Adventure Tester' : '성장하는 모험가', characterId: 'glasses_boy', petId: 'dragon', difficulty: 'normal', canDo: BOUNDARY ? '글자를천천히살피고틀린부분을정확하게고쳐칠수있다'.repeat(4).slice(0, BOUNDARY_CANDO_LENGTH) : '' },
    progress: { unlockedStage: 5, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4'], stageStars: { stage_1: 3, stage_2: 3, stage_3: 3, stage_4: 3 }, coins: 620, tutorialCompleted: true },
    records: { bestCpm: 245, bestAccuracy: 99.2, bestCombo: 120, bestScoreByStage: {}, ghosts: {},
      daily: Object.fromEntries(['', ':sentence', ':long'].map(s => [today + s, { cpm: 180, accuracy: 98, score: 12345 }])),
      learning: { patterns: { spacing: { mistakes: 3, corrections: 1, newSuccesses: 0, delayedSuccesses: 0, lastTarget: target, lastTyped: target.replace(' ', ''), lastErrorAt: at, pendingTargets: [target], transferTargets: [] } }, recent: [{ at, stageId: 'stage_3', source: 'game', accuracy: 78.4, cpm: 95, correct: 6, corrected: 1, skipped: 2, newSuccesses: 1 }, { at, stageId: 'stage_4', source: 'game', accuracy: 99.2, cpm: 245, correct: 3, corrected: 3, skipped: 0, newSuccesses: 2 }], seen: [] } },
    collection: { badges: ['first_clear', 'fever_master', 'letter_perfect'], wordsSeen: [], petsUnlocked: ['cat', 'rabbit', 'dragon', 'squirrel'], charactersUnlocked: ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'], enemiesSeen: ['green_slime'] },
    settings: { language, bgm: false, sfx: false, screenShake: false, showKeyboardGuide: false, prologueSeen: true }, stats: { totalWords: 3456, totalClears: 20, totalPlaySec: 12345 }, updatedAt: at,
  };
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('#modal-root img')].filter(img => img.getClientRects().length).map(img => img.decode().catch(() => {})));
    const elements = [...document.querySelectorAll('#modal-root .modal, #modal-root .modal *, .sound-popover.open')];
    await Promise.all(elements.flatMap(el => el.getAnimations()).filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function measure(page, selector = '#modal-root [role="dialog"]') {
  return page.locator(selector).evaluate(panel => {
    const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const contains = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
    const stage = rect(document.getElementById('ui-stage')), box = rect(panel);
    const controls = [...panel.querySelectorAll('button, input, a[href], summary')].filter(visible).map(el => {
      const r = rect(el), hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return { name: el.textContent.trim() || el.getAttribute('aria-label') || el.className, tag: el.tagName, type: el.getAttribute('type'), ...r, disabled: el.disabled, hit: hit === el || el.contains(hit) };
    });
    const nodes = [panel, ...panel.querySelectorAll('*')].filter(visible);
    // Font ink may extend beyond a short heading's line box without causing a
    // scrollbar or clipping. Check structural containers here; text ranges below
    // independently prove that all visible copy stays inside clipping ancestors.
    // The natural-height content wrapper also has font ink outside its last
    // line box. Its enclosing page/stack/body must still fit without overflow.
    const structural = '.modal, .sound-popover, [class$="-body"], .popup-pages, .popup-page-stack, .popup-page, .popup-card-grid, .coll-item, .settings-page, .setting-links, .replay-route, .replay-goal, .learning-summary, .c-cando, .cert, .modal-actions, .popup-pagination';
    const overflow = nodes.filter(el => el.matches(structural) && el.clientHeight > 0 && el.clientWidth > 0)
      .filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .map(el => ({ name: `${el.tagName}.${el.className}`, x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight, ...rect(el) }));
    const clipped = [], text = [], walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || !visible(node.parentElement)) continue;
      text.push(node.textContent.trim());
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (!r.width || !r.height) continue;
        if (!contains(stage, r)) clipped.push({ text: node.textContent.trim(), by: 'viewport' });
        if (!contains(box, r)) clipped.push({ text: node.textContent.trim(), by: 'dialog' });
        for (let ancestor = node.parentElement; ancestor && panel.contains(ancestor); ancestor = ancestor.parentElement) {
          const css = getComputedStyle(ancestor), a = rect(ancestor);
          if ((['hidden', 'clip', 'auto', 'scroll'].includes(css.overflowX) && (r.left < a.left - 1 || r.right > a.right + 1)) || (['hidden', 'clip', 'auto', 'scroll'].includes(css.overflowY) && (r.top < a.top - 1 || r.bottom > a.bottom + 1))) {
            clipped.push({ text: node.textContent.trim(), by: ancestor.className }); break;
          }
        }
        const control = node.parentElement.closest('button,summary');
        if (control && !contains(rect(control), r)) clipped.push({ text: node.textContent.trim(), by: 'own control' });
      }
    }
    const images = [...panel.querySelectorAll('img')].filter(visible).map(el => ({ src: el.getAttribute('src'), complete: el.complete, naturalWidth: el.naturalWidth, ...rect(el) }));
    return { panel: box, stage, controls, images, overflow, clipped, text, name: panel.className, inert: document.getElementById('ui-root').inert, focusedInside: panel.contains(document.activeElement),
      documentOverflow: Math.max(document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight),
      appearance: { background: getComputedStyle(panel).background, backdrop: panel.parentElement ? getComputedStyle(panel.parentElement).background : '' },
      pages: [...panel.querySelectorAll('.popup-page')].filter(visible).map(el => el.dataset.page),
    };
  });
}

function assertFit(m, label, isModal = true) {
  const contains = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
  assert.ok(contains(m.stage, m.panel), `${label}: dialog outside game frame ${JSON.stringify(m.panel)}`);
  assert.ok(m.documentOverflow <= 1, `${label}: document scrolls`);
  assert.deepEqual(m.overflow, [], `${label}: content must fit without scrolling`);
  assert.deepEqual(m.clipped, [], `${label}: visible text clipped`);
  assert.ok(m.images.every(img => img.complete && img.naturalWidth > 0 && img.width > 0 && img.height > 0), `${label}: visible pictures are loaded`);
  if (isModal) assert.ok(m.inert && m.focusedInside, `${label}: modal contains focus and makes background inert`);
  for (const control of m.controls) {
    assert.ok(contains(m.panel, control), `${label}: ${control.name} outside dialog`);
    assert.ok(control.disabled || control.hit, `${label}: ${control.name} blocked`);
    if (control.tag === 'BUTTON' || control.tag === 'SUMMARY') assert.ok(control.height >= 47 && control.width >= 47, `${label}: ${control.name} must be a 48px target (${control.width}x${control.height})`);
  }
}

const visibleText = scope => scope.evaluate(el => {
  const out = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) { const node = walker.currentNode; if (node.textContent.trim() && node.parentElement.getClientRects().length && getComputedStyle(node.parentElement).visibility !== 'hidden' && !node.parentElement.closest('[hidden]')) out.push(node.textContent.trim()); }
  return out;
});

async function record(page, label, states, screenshot = false, selector) {
  await settle(page);
  const m = await measure(page, selector); states.push({ label, ...m });
  assertFit(m, label, !selector);
  if (screenshot || process.env.POPUP_FIT_SHOTS === 'all') await page.screenshot({ path: `${OUT}/${label}.png` });
  return m;
}

async function pages(page, label, states, screenshots) {
  await settle(page);
  const scope = page.locator('#modal-root [role="dialog"]');
  // Snapshot every mounted page's text; all of it must become reachable.
  const expected = await scope.locator('.popup-page-content').evaluateAll(elements => elements.flatMap(el => {
    const out = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      // Pagination temporarily hides whole pages. Deliberately hidden children
      // (for example the duplicate small-screen certificate heading) stay hidden.
      let intentionallyHidden = false;
      for (let parent = node.parentElement; parent && !parent.classList.contains('popup-page'); parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        if (css.display === 'none' || css.visibility === 'hidden') { intentionallyHidden = true; break; }
      }
      if (!intentionallyHidden) out.push(node.textContent.trim());
    }
    return out;
  }));
  const seen = new Set(); let index = 0;
  while (true) {
    const m = await record(page, `${label}-p${index}`, states, screenshots && index === 0);
    m.text.forEach(t => seen.add(t));
    const next = scope.locator('.popup-page-next').filter({ visible: true });
    if (!await next.count() || await next.first().isDisabled()) break;
    assert.ok(index < 80, 'popup pagination must end');
    await next.first().click(); index++;
  }
  assert.deepEqual([...new Set(expected)].filter(t => !seen.has(t)), [], `${label}: some mounted page content was never reachable`);
  if (screenshots && index) await page.screenshot({ path: `${OUT}/${label}-last.png` });
  return index + 1;
}

async function revealPagedControl(page, locator) {
  for (let step = 0; step < 80; step++) {
    if (await locator.isVisible()) return;
    const destination = await locator.evaluate(el => Number(el.closest('.popup-page')?.dataset.page ?? 0));
    const current = await page.locator('#modal-root .popup-page').filter({ visible: true }).first().getAttribute('data-page');
    assert.ok(destination && current, 'hidden control belongs to an available content page');
    const selector = destination < Number(current) ? '.popup-page-prev' : '.popup-page-next';
    const button = page.locator(`#modal-root ${selector}`).filter({ visible: true }).first();
    assert.equal(await button.isDisabled(), false, 'required content page remains reachable');
    await button.click(); await settle(page);
  }
  throw new Error('Control page did not become visible');
}

async function focusTrap(page) {
  const dialog = page.locator('#modal-root [role="dialog"]');
  const buttons = dialog.locator('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]').filter({ visible: true });
  const first = buttons.first(), last = buttons.last();
  await last.focus(); await page.keyboard.press('Tab');
  assert.ok(await first.evaluate(el => document.activeElement === el), 'Tab wraps to first visible control');
  await first.focus(); await page.keyboard.press('Shift+Tab');
  assert.ok(await last.evaluate(el => document.activeElement === el), 'Shift+Tab wraps to last visible control');
}

const kinds = ['settings', 'guide-student', 'guide-teacher', 'story-prologue', 'story-ending', 'about', 'collection', 'certificate', 'practice', 'replay', 'classroom', 'daily', 'alert', 'confirm', 'sound'];
try {
  for (const language of (BOUNDARY ? ['ko'] : ['ko', 'en'].filter(l => !LANG || LANG === l))) for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
    await context.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: KEY, data: fixture(language) });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(60000); page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('.opening-skip').click({ timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector('.opening-player') && !document.querySelector('#fade.on') && !document.getElementById('ui-stage').inert);
      await page.evaluate(async () => {
        const exact = path => performance.getEntriesByType('resource').map(e => e.name).find(url => new URL(url).pathname === path);
        const path = exact('/src/game/ui/ModalController.ts');
        if (!path) throw new Error('Popup fixture requires the source dev server');
        window.__popupQA = await import(path);
        const { SaveSystem } = await import(exact('/src/game/systems/SaveSystem.ts'));
        const { ENEMIES } = await import(exact('/src/game/data/enemies.ts'));
        // Display complete descriptions instead of the shorter locked-card copy.
        SaveSystem.get().collection.enemiesSeen = ENEMIES.map(enemy => enemy.id);
        SaveSystem.save();
      });
      for (const kind of (BOUNDARY ? ['certificate'] : kinds.filter(k => !FILTER || `${language}-${k}`.includes(FILTER)))) {
        const label = `${language}-${kind}-${width}x${height}`, states = [], errorStart = errors.length;
        const shots = width === 915 || width === 1280;
        try {
          const opener = page.getByRole('button', { name: language === 'en' ? 'Settings' : '설정', exact: true }).first();
          await opener.focus();
          if (kind === 'classroom') await page.route('**/classroom-manifest.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 'popup-ui-fixture', cacheName: 'typing-classroom-popup-ui-fixture', assets: [{ url: './qa-popup-one.dat', bytes: 1, revision: 'popup-fixture-1' }, { url: './qa-popup-two.dat', bytes: 1, revision: 'popup-fixture-2' }] }) }));
          await page.evaluate(({ kind, en }) => {
            const api = window.__popupQA;
            if (kind === 'settings') api.settingsModal();
            else if (kind.startsWith('guide-')) api.guideModal(kind.slice(6));
            else if (kind.startsWith('story-')) api.storyModal(kind.slice(6));
            else if (kind === 'about') api.aboutModal();
            else if (kind === 'collection') api.collectionModal();
            else if (kind === 'certificate') api.certificateModal();
            else if (kind === 'practice') api.practiceModal();
            else if (kind === 'replay') api.replayModal();
            else if (kind === 'classroom') api.classroomModal();
            else if (kind === 'daily') api.dailyPickModal();
            else if (kind === 'alert') void api.alertModal(en ? 'Ready for another try?' : '다시 도전할 준비 됐어?', en ? 'Your progress is saved. Take your time and try one letter at a time.' : '지금까지 해낸 기록을 남겼어. 한 글자씩 천천히 다시 도전해 보자.');
            else if (kind === 'confirm') void api.confirmModal(en ? 'Erase English progress?' : '한국어 기록을 지울까?', en ? 'Your English adventure will start at Stage 1. Your stars, coins, friends and typing records will be erased. Korean progress will stay.' : '한국어 모험 기록을 모두 지우고 1단계부터 시작해. 모은 별·코인·친구와 타자 기록이 사라져. 영어 기록은 그대로 남아.', '지우고 시작', '기록 남기기', { destructive: true }).then(answer => { window.__popupAnswer = answer; });
          }, { kind, en: language === 'en' });
          if (kind === 'sound') {
            const sound = page.getByRole('button', { name: language === 'en' ? 'Sound settings' : '소리 설정', exact: true }).first();
            await sound.click();
            await record(page, label, states, shots, '.sound-popover.open');
            await page.keyboard.press('Escape');
            assert.ok(await sound.evaluate(el => document.activeElement === el), 'sound Escape restores trigger focus');
          } else {
            await page.locator('#modal-root [role="dialog"]').waitFor();
            if (kind === 'collection') {
              for (const tab of ['monsters', 'badges', 'pets', 'items', 'titles']) {
                await page.locator(`.coll-tabs [data-tab="${tab}"]`).click();
                await pages(page, `${label}-${tab}`, states, shots);
              }
            } else if (kind.startsWith('story-')) {
              for (let index = 0; index < 20; index++) {
                await record(page, `${label}-line${index}`, states, shots && index === 0);
                const counter = await page.locator('.story-page-count').innerText();
                const [current, total] = counter.split('/').map(Number);
                if (current === total) break;
                await page.locator('.story-actions .btn-gold').click();
              }
            } else if (kind === 'practice') {
              for (let item = 0; item < 3; item++) {
                await record(page, `${label}-item${item}`, states, shots && item === 0);
                const input = page.locator('.practice-input');
                if (!item) {
                  await input.fill('※'); await input.press('Enter');
                  await record(page, `${label}-wrong`, states, false);
                }
                await input.fill(await page.locator('.practice-target').innerText()); await input.press('Enter');
              }
              await record(page, `${label}-success`, states, shots);
            } else {
              if (kind === 'classroom') await page.waitForFunction(() => !document.querySelector('.classroom-status [role="status"]')?.textContent.includes('확인하고 있어요'));
              await pages(page, label, states, shots);
            }
            if (kind === 'classroom') {
              // Exercise the real verification/status view with two disposable
              // cache entries. This tests layout, not real offline readiness.
              await page.evaluate(async () => {
                const cache = await caches.open('typing-classroom-popup-ui-fixture');
                for (const [file, revision] of [['qa-popup-one.dat', 'popup-fixture-1'], ['qa-popup-two.dat', 'popup-fixture-2']]) await cache.put(new URL(`./${file}`, document.baseURI), new Response('x', { headers: { 'x-classroom-revision': revision } }));
              });
              await page.getByRole('button', { name: language === 'en' ? 'Check readiness' : '준비 상태 확인', exact: true }).click();
              await page.waitForFunction(() => document.querySelector('.classroom-status [role="status"]')?.textContent.match(/수업 준비 완료|Classroom ready!/));
              await record(page, `${label}-ready`, states, shots);
            }
            if (kind === 'certificate' && BOUNDARY) {
              const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile, KEY);
              assert.equal(before.name.length, 24); assert.equal(before.canDo.length, BOUNDARY_CANDO_LENGTH);
              await page.setViewportSize({ width: 915, height: 412 }); await settle(page);
              // Check the currently visible page before moving focus or pages.
              await record(page, `${label}-resized-current`, states, true);
              const previous = page.locator('#modal-root .popup-page-prev').filter({ visible: true }).first();
              for (let step = 0; step < 30 && !await previous.isDisabled(); step++) { await previous.click(); await settle(page); }
              await pages(page, `${label}-resized-all`, states, true);
              assert.equal(await page.locator('.c-cando-input').inputValue(), before.canDo, 'resize preserves the complete saved self assessment');
              assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile.name, KEY), before.name, 'resize preserves the complete 24-character name');
            } else if (kind === 'certificate') {
              const input = page.locator('.c-cando-input');
              const chip = page.locator('.c-cando-chips button').first();
              await revealPagedControl(page, chip); await chip.click();
              assert.ok(await input.inputValue(), 'certificate choice populates the field');
              await revealPagedControl(page, input);
              await input.fill(language === 'en' ? 'I can fix my mistakes' : '틀린 글자를 고칠'); await input.press('Tab');
              assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile.canDo, KEY), language === 'en' ? 'I can fix my mistakes' : '틀린 글자를 고칠');
              await record(page, `${label}-saved`, states, shots);
            }
            if (kind === 'settings') {
              const before = await page.evaluate(key => localStorage.getItem(key), KEY);
              await page.getByRole('button', { name: language === 'en' ? 'Reset progress' : '기록 초기화', exact: true }).click();
              await record(page, `${label}-reset-confirm`, states, shots);
              const buttons = page.locator('#modal-root .modal-actions button');
              assert.ok(await buttons.last().evaluate(el => document.activeElement === el), 'global reset defaults to preserving records');
              await page.keyboard.press('Enter');
              assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), before, 'default global reset choice preserves save');
            } else if (kind === 'confirm') {
              assert.ok(await page.getByRole('button', { name: language === 'en' ? 'Keep my progress' : '기록 남기기', exact: true }).evaluate(el => document.activeElement === el), 'destructive confirmation focuses cancellation');
              await page.keyboard.press('Enter');
              assert.equal(await page.evaluate(() => window.__popupAnswer), false, 'initial Enter cancels destructive action');
            } else {
              await focusTrap(page);
              await page.keyboard.press('Escape');
            }
            await page.locator('#modal-root [role="dialog"]').waitFor({ state: 'detached' });
            assert.ok(await opener.evaluate(el => document.activeElement === el), 'closing popup restores opener focus');
            assert.equal(await page.locator('#ui-root').evaluate(el => el.inert), false, 'closing popup restores background interaction');
          }
          assert.deepEqual(errors.slice(errorStart), [], 'no browser runtime errors');
          results.push({ label, pass: true, states }); console.log(`PASS ${label} (${states.length} states)`);
        } catch (error) {
          const screenshot = `${OUT}/failure-${label}.png`;
          await page.screenshot({ path: screenshot }).catch(() => {});
          results.push({ label, pass: false, error: String(error), errors: errors.slice(errorStart), screenshot, states }); console.error(`FAIL ${label}: ${error}`);
        } finally {
          await page.evaluate(() => { window.__popupQA.closeModal(); document.querySelectorAll('.sound-popover.open').forEach(el => el.classList.remove('open')); }).catch(() => {});
          if (kind === 'classroom') await page.unroute('**/classroom-manifest.json');
        }
      }
    } finally { await context.close(); }
  }
} finally {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), filter: FILTER, viewport: BOUNDARY ? '1920x1080 → 915x412' : VIEWPORT || 'all', boundary: BOUNDARY, boundaryCanDoLength: BOUNDARY ? BOUNDARY_CANDO_LENGTH : undefined, results }, null, 2));
  await browser.close();
}
assert.ok(results.length, 'at least one popup case matched');
if (results.some(r => !r.pass)) process.exitCode = 1;
console.log(`${results.filter(r => r.pass).length}/${results.length} popup cases passed`);
