import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// 격리 컨텍스트·실제 홈/설정 버튼으로 저장 복구와 한영 진행 분리를 검증한다.
const BASE = process.env.SAVE_TEST_URL || 'http://127.0.0.1:5180';
const OUT = process.env.SAVE_TEST_OUT || 'tmp/save-flow-check';
const KEY = 'typing_adventure_save_v1';
const FILTER = process.env.SAVE_TEST_FILTER || '';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.SAVE_BROWSER_CHANNEL || 'chrome' });
const results = [];
const measurements = [];
function seed(language = 'ko') {
  const english = language === 'en';
  return {
    version: '2',
    profile: { name: english ? 'English Tester' : '한글 검증', characterId: english ? 'pink_girl' : 'brown_boy', petId: english ? 'rabbit' : 'cat', difficulty: 'normal', canDo: english ? 'type a sentence' : '고쳐서 완성' },
    progress: { unlockedStage: english ? 4 : 2, clearedStages: english ? ['stage_1', 'stage_2', 'stage_3'] : ['stage_1'], stageStars: english ? { stage_1: 3, stage_2: 2, stage_3: 1 } : { stage_1: 2 }, coins: english ? 93 : 47, fails: {}, assist: {}, tutorialCompleted: false, practicedParts: [], skippedPracticeStages: [] },
    records: { bestCpm: english ? 145 : 97, bestAccuracy: 94, bestCombo: 20, bestScoreByStage: { stage_1: english ? 2600 : 1700 }, ghosts: {}, daily: {}, learning: { patterns: { letters: { mistakes: 2, corrections: 1, newSuccesses: 1, delayedSuccesses: 0, lastTarget: english ? 'letter' : '낱말', lastTyped: english ? 'leter' : '낱맣', lastErrorAt: '2026-09-01T00:00:00.000Z' } }, recent: [{ at: '2026-09-01T00:00:00.000Z', stageId: 'stage_1', source: 'game', accuracy: 94, cpm: english ? 145 : 97, correct: english ? 15 : 12, corrected: 1, skipped: 0, newSuccesses: 1 }], seen: [english ? 'letter' : '낱말'] } },
    collection: { badges: ['first_clear', 'fever_master'], wordsSeen: ['seed-one'], petsUnlocked: ['cat', 'rabbit', 'dragon'], charactersUnlocked: ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'], enemiesSeen: ['green_slime'] },
    settings: { language, bgm: false, sfx: false, screenShake: false, showKeyboardGuide: false, bgmVolume: 0.7, sfxVolume: 0.9, prologueSeen: true },
    stats: { totalClears: english ? 3 : 1, totalWords: english ? 45 : 12, totalPlaySec: english ? 240 : 120 },
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}
function bilingual(language = 'ko') {
  const data = seed(language);
  const other = language === 'ko' ? 'en' : 'ko';
  const archive = seed(other);
  data.languageArchives = { [other]: { profile: archive.profile, progress: archive.progress, records: archive.records, collection: archive.collection, stats: archive.stats } };
  return data;
}
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const rawStored = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
async function revealPopupControl(page, control) {
  for (let pageIndex = 0; pageIndex < 40; pageIndex++) {
    if (await control.isVisible()) return;
    const next = page.locator('#modal-root .popup-page-next').filter({ visible: true }).first();
    assert.ok(await next.count() && !await next.isDisabled(), 'popup control remains reachable through its page buttons');
    await next.click();
  }
  throw new Error('popup pagination did not reach the requested control');
}
const home = async (page, freshDocument = false) => {
  // Reload/goto offers the intro again; language changes and home returns do not.
  if (freshDocument) {
    await page.locator('.opening-skip').click({ timeout: 60000 });
    await page.locator('.opening-player').waitFor({ state: 'detached' });
  }
  await page.waitForSelector('.home-menu', { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('#fade.on') && !document.getElementById('ui-stage').inert);
};
const language = async (page, value) => {
  await page.locator(`.home-language button[lang="${value}"]`).click();
  await page.waitForFunction((lang) => document.documentElement.lang === lang && document.querySelector(`.home-language button[lang="${lang}"][aria-pressed="true"]`), value);
  await home(page);
};
const checkProgress = (data, expected) => {
  assert.deepEqual(data.profile, expected.profile, '언어별 이름·모험가·친구·자기평가 복원');
  assert.deepEqual(data.progress, expected.progress, '언어별 별·해금·코인 복원');
  assert.deepEqual(data.records.learning, expected.records.learning, '언어별 학습 기록 복원');
};
async function run(label, raw, fn, { quota = false, viewport = { width: 1280, height: 800 } } = {}) {
  if (FILTER && !label.includes(FILTER)) return;
  const context = await browser.newContext({ viewport, acceptDownloads: true, reducedMotion: 'reduce' });
  // 앱 기능을 바꾸지 않고, 병렬 개발의 Vite HMR만 격리한다.
  await context.routeWebSocket('**', (socket) => {
    socket.onMessage(() => {});
    socket.send(JSON.stringify({ type: 'connected' }));
  });
  await context.addInitScript(({ raw, key, quota }) => {
    if (!sessionStorage.getItem('save-flow-seeded')) {
      if (raw != null) localStorage.setItem(key, typeof raw === 'string' ? raw : JSON.stringify(raw));
      sessionStorage.setItem('save-flow-seeded', 'true');
    }
    const setItem = Storage.prototype.setItem;
    window.__quotaBlocked = quota;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key && window.__quotaBlocked) throw new DOMException('Test quota failure', 'QuotaExceededError');
      return setItem.call(this, name, value);
    };
  }, { raw, key: KEY, quota });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await home(page, true);
    await fn(page);
    assert.deepEqual(errors, [], '브라우저 예외 없음');
    results.push({ label, pass: true });
    console.log(`PASS ${label}`);
  } catch (error) {
    const screenshot = `${OUT}/failure-${results.length}.png`;
    await page.screenshot({ path: screenshot });
    results.push({ label, pass: false, error: String(error), errors, screenshot });
    console.error(`FAIL ${label}: ${error}`);
  } finally { await context.close(); }
}

try {
  const corrupt = seed();
  corrupt.progress.stageStars = null;
  corrupt.progress.clearedStages = null;
  await run('잘못된 중첩 저장 구조 복구·홈 동작·복구 알림', corrupt, async (page) => {
    await page.locator('.save-notice:not([hidden])').waitFor();
    assert.match(await page.locator('.save-notice').innerText(), /복구/);
    assert.ok(await page.getByRole('button', { name: '모험 이어하기', exact: true }).isVisible());
    assert.ok(await page.locator('.home-more summary').isVisible());
    await page.getByRole('button', { name: '복구한 기록 사용', exact: true }).click();
    const data = await stored(page);
    assert.deepEqual(data.progress.stageStars, {});
    assert.deepEqual(data.progress.clearedStages, []);
    assert.equal(data.profile.name, corrupt.profile.name);
    await page.getByRole('button', { name: '모험 이어하기', exact: true }).click();
    await page.waitForSelector('.worldmap');
  });

  const malformed = '{"profile": {"name": "broken seed"';
  await run('구문 오류 원본 보관과 안전한 새 시작', malformed, async (page) => {
    await page.locator('.save-notice:not([hidden])').waitFor();
    assert.equal(await rawStored(page), malformed, '자동으로 원본을 덮어쓰지 않는다');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '기록 파일 보관', exact: true }).click();
    const download = await downloadPromise;
    const backupPath = path.resolve(OUT, 'malformed-original.json');
    await download.saveAs(backupPath);
    assert.equal(fs.readFileSync(backupPath, 'utf8'), malformed);
    // 맥박 효과가 있는 첫 시작 버튼은 실제 키보드 활성화로 확인한다.
    await page.getByRole('button', { name: '모험 시작', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.setup-panel');
  });

  await run('Quota 오류 알림·메모리 플레이·실제 재저장', seed(), async (page) => {
    const before = await rawStored(page);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('switch', { name: '배경 음악', exact: true }).click();
    await page.locator('.save-notice:not([hidden])').waitFor();
    assert.match(await page.locator('.save-notice').innerText(), /이 창에만/);
    assert.equal(await rawStored(page), before);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.locator('.home-more > summary').click();
    await page.getByRole('button', { name: '오늘의 도전', exact: true }).click();
    await page.locator('.daily-pick-card').first().click();
    await page.waitForFunction(() => document.querySelector('.bb-input') && !document.querySelector('.bb-input').disabled, undefined, { timeout: 60000 });
    for (let i = 0; i < 20; i++) await page.locator('.bb-input').fill(await page.locator('.bb-target').innerText());
    await page.waitForSelector('.result-body');
    assert.equal(await rawStored(page), before, '기록 실패 중 기존 저장은 유지한다');
    await page.evaluate(() => { window.__quotaBlocked = false; });
    await page.getByRole('button', { name: '다시 저장', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.save-notice')?.hidden === true);
    const saved = await stored(page);
    assert.equal(saved.settings.bgm, true);
    assert.equal(saved.records.learning.recent.at(-1).correct, 20);
  }, { quota: true });

  await run('한국어·English 실제 전환과 새로고침에서 이름·진행·학습 복원', bilingual(), async (page) => {
    await language(page, 'en');
    checkProgress(await stored(page), seed('en'));
    assert.match(await page.locator('.pc-name').innerText(), /English Tester/);
    await page.reload({ waitUntil: 'domcontentloaded' }); await home(page, true);
    checkProgress(await stored(page), seed('en'));
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await language(page, 'ko');
    checkProgress(await stored(page), seed());
    assert.match(await page.locator('.pc-name').innerText(), /한글 검증/);
    await page.reload({ waitUntil: 'domcontentloaded' }); await home(page, true);
    checkProgress(await stored(page), seed());
  });

  for (const lang of ['ko', 'en']) await run(`현재 언어 새 모험 취소·삭제·다른 언어 보존 (${lang})`, bilingual(lang), async (page) => {
    const en = lang === 'en', other = en ? 'ko' : 'en';
    const before = await rawStored(page);
    await page.locator('.home-more > summary').click();
    const opener = page.getByRole('button', { name: en ? 'Erase & start over' : '기록 지우고 시작', exact: true });
    await opener.click();
    const keep = page.getByRole('button', { name: en ? 'Keep my progress' : '기록 남기기', exact: true });
    const erase = page.getByRole('button', { name: en ? 'Erase & restart' : '지우고 시작', exact: true });
    assert.ok(await keep.evaluate(el => el === document.activeElement), '처음 Enter를 누르면 기록을 남긴다');
    assert.ok(await erase.evaluate(el => el.classList.contains('btn-red')), '지우는 선택을 빨간색으로 표시한다');
    for (const [width, height] of [[1280, 720], [915, 412]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.querySelector('.modal').getAnimations().map(a => a.finished)); });
      const layout = await page.locator('.modal').evaluate(el => {
        const frame = document.getElementById('ui-stage').getBoundingClientRect(), r = el.getBoundingClientRect();
        const body = el.querySelector('.modal-body');
        return { fits: r.left >= frame.left && r.right <= frame.right && r.top >= frame.top && r.bottom <= frame.bottom, bodyFits: body.scrollWidth <= body.clientWidth + 1 && body.scrollHeight <= body.clientHeight + 1,
          buttonsVisible: [...el.querySelectorAll('button')].every(b => { const q = b.getBoundingClientRect(), hit = document.elementFromPoint(q.x + q.width/2, q.y + q.height/2); return hit === b || b.contains(hit); }) };
      });
      assert.ok(layout.fits && layout.bodyFits && layout.buttonsVisible, `설명과 선택을 한 화면에서 읽는다: ${JSON.stringify(layout)}`);
      await page.screenshot({ path: `${OUT}/${lang}-${width}-restart.png` });
    }
    await page.keyboard.press('Enter');
    assert.equal(await rawStored(page), before, '기본 선택으로 기록 보존');
    assert.ok(await page.locator('.home-more summary').evaluate(el => el === document.activeElement), '취소 후 메뉴를 여는 버튼으로 돌아온다');
    await page.locator('.home-more summary').click(); await opener.click(); await page.keyboard.press('Escape');
    assert.equal(await rawStored(page), before, 'Escape로 기록 보존');
    await page.locator('.home-more summary').click(); await opener.click(); await keep.click();
    assert.equal(await rawStored(page), before, '기록 남기기로 양쪽 언어 보존');
    await page.locator('.home-more summary').click(); await opener.click(); await erase.click();
    await page.waitForSelector('.setup-panel');
    const data = await stored(page);
    assert.equal(data.profile.name, '');
    assert.deepEqual(data.progress.clearedStages, []);
    assert.deepEqual(data.progress.stageStars, {});
    assert.equal(data.progress.coins, 0);
    assert.equal(data.records.bestCpm, 0);
    assert.deepEqual(data.collection.badges, []);
    assert.deepEqual(data.records.learning.recent, []);
    assert.deepEqual(data.settings, JSON.parse(before).settings, '언어별 새 시작은 설정 보존');
    checkProgress(data.languageArchives[other], seed(other));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await home(page, true);
    await language(page, other);
    checkProgress(await stored(page), seed(other));
  });

  await run('전체 초기화 취소 보존·승인 후 양쪽 언어 초기화', bilingual(), async (page) => {
    const before = await rawStored(page);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const reset = page.getByRole('button', { name: '기록 초기화', exact: true });
    await revealPopupControl(page, reset); await reset.click();
    await page.getByRole('button', { name: '돌아가기', exact: true }).click();
    assert.equal(await rawStored(page), before);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await revealPopupControl(page, reset); await reset.click();
    await page.getByRole('button', { name: '모두 지우기', exact: true }).click(); await home(page);
    assert.equal(await rawStored(page), null);
    await language(page, 'en');
    assert.equal((await stored(page)).profile.name, '');
    assert.deepEqual((await stored(page)).progress.clearedStages, []);
    await language(page, 'ko');
    assert.equal((await stored(page)).profile.name, '');
    assert.deepEqual((await stored(page)).records.learning.recent, []);
  });

  await run('도감 새 친구 장착은 진행 보존·즉시 표시·재접속 유지', bilingual(), async (page) => {
    const before = seed();
    await page.locator('.home-more > summary').click();
    await page.getByRole('button', { name: '도감', exact: true }).click();
    await page.getByRole('button', { name: '친구들', exact: true }).click();
    const dragon = page.locator('.coll-item').filter({ hasText: '아기 드래곤' });
    await revealPopupControl(page, dragon);
    await dragon.getByRole('button', { name: '함께하기', exact: true }).click();
    assert.equal((await stored(page)).profile.petId, 'dragon');
    assert.deepEqual((await stored(page)).progress, before.progress);
    assert.deepEqual((await stored(page)).records.learning, before.records.learning);
    assert.deepEqual((await stored(page)).languageArchives.en.profile, seed('en').profile);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.player-card')?.textContent.includes('아기 드래곤'), undefined, { timeout: 10000 });
    assert.match(await page.locator('.player-card').innerText(), /아기 드래곤/, '선택한 새 친구를 홈에서도 바로 확인한다');
    await page.reload({ waitUntil: 'domcontentloaded' }); await home(page, true);
    assert.equal((await stored(page)).profile.petId, 'dragon');
  });

  await run('영어 태블릿 홈 문구와 버튼 경계 확인', bilingual(), async (page) => {
    await language(page, 'en');
    const boxes = await page.locator('.home-menu button, .home-menu summary, .home-language button, .player-card').evaluateAll((elements) => elements.filter(el => el.getClientRects().length > 0 && el.getBoundingClientRect().height > 0).map((el) => {
      const b = el.getBoundingClientRect();
      return { label: el.textContent.trim(), x: b.x, right: b.right, y: b.y, bottom: b.bottom, width: b.width, height: b.height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    }));
    measurements.push({ viewport: { width: 1024, height: 768 }, language: 'en', boxes });
    assert.ok(boxes.every((b) => b.x >= 0 && b.y >= 0 && b.right <= 1024 && b.bottom <= 768), '주요 버튼·프로필이 화면 밖으로 나가지 않는다');
    assert.ok(boxes.filter((b) => b.label !== '').every((b) => b.scrollWidth <= b.clientWidth + 1), '영문 홈 항목 내부 가로 넘침 없음');
    await page.screenshot({ path: `${OUT}/english-home-tablet.png` });
  }, { viewport: { width: 1024, height: 768 } });
} finally {
  fs.writeFileSync(`${OUT}/${FILTER ? 'results-recheck' : 'results'}.json`, JSON.stringify({ base: BASE, filter: FILTER, results, measurements }, null, 2));
  await browser.close();
}
if (results.some((result) => !result.pass)) process.exitCode = 1;
