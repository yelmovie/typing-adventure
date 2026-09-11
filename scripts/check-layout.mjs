import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// npm run check:layout [-- 1|2|3]. 개발 서버와 격리된 예시 저장소만 사용한다.
// 1: 전투·선택 패널, 2: 실제 완료 결과·스크롤, 3: 판정 팝업·OS 동작 줄이기
const BASE = process.env.LAYOUT_TEST_URL || 'http://127.0.0.1:5180';
const CHANNEL = process.env.LAYOUT_BROWSER_CHANNEL || 'chrome';
const OUT = 'tmp/layout-shots';
const ONLY = process.argv[2];
assert.ok(!ONLY || ['1', '2', '3'].includes(ONLY), '분류는 1, 2, 3 중 하나');
fs.mkdirSync(OUT, { recursive: true });
const SAVE = {
  version: '1', profile: { name: '하늘', characterId: 'brown_boy', petId: 'rabbit', difficulty: 'normal' },
  progress: { unlockedStage: 5, stageStars: { stage_1: 3, stage_2: 3, stage_3: 2, stage_4: 2 }, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4'], coins: 620 },
  records: { bestCpm: 180, bestAccuracy: 0.97, bestCombo: 24, bestScoreByStage: {}, ghosts: {}, daily: {} },
  collection: { badges: [], wordsSeen: [], petsUnlocked: ['cat', 'rabbit', 'dragon', 'squirrel'], charactersUnlocked: ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'], enemiesSeen: [] },
  settings: { language: 'ko', bgm: false, sfx: false, screenShake: true, showKeyboardGuide: false, prologueSeen: true },
  stats: { totalClears: 4, totalWords: 200, totalPlaySec: 900 },
};
// 실패한 해상도만 다시 검사할 때 LAYOUT_VIEWPORT=915x412 처럼 지정한다(분류 1/2).
const VIEWPORT = process.env.LAYOUT_VIEWPORT;
const SIZES = [[1920, 1080], [1280, 800], [1024, 768], [915, 412]].filter(size => !VIEWPORT || size.join('x') === VIEWPORT);
assert.ok(SIZES.length > 0, 'LAYOUT_VIEWPORT는 지원하는 해상도 중 하나');
const results = [];
const browser = await chromium.launch({ channel: CHANNEL, headless: true });

async function run(label, size, action, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
  await context.addInitScript(data => {
    if (!localStorage.getItem('typing_adventure_save_v1')) localStorage.setItem('typing_adventure_save_v1', JSON.stringify(data));
  }, SAVE);
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    const details = await action(page);
    assert.deepEqual(errors, [], '브라우저 런타임 오류가 없어야 한다');
    results.push({ label, pass: true, details });
    console.log('PASS ' + label + ' ' + JSON.stringify(details ?? {}));
  } catch (error) {
    const screenshot = OUT + '/failure-' + label.replace(/[^a-zA-Z0-9-]/g, '_') + '.png';
    await page.screenshot({ path: screenshot, animations: 'disabled' }).catch(() => {});
    results.push({ label, pass: false, error: error.message, screenshot });
    console.error('FAIL ' + label + ': ' + error.message);
  } finally { await context.close(); }
}
async function settled(page) {
  await page.locator('#ui-stage[aria-busy="true"]').waitFor({ state: 'detached' });
  await page.evaluate(() => document.fonts.ready);
  // 첫 진입은 화면 fade가 없으므로 패널 자체의 진입 애니메이션을 따로 기다린다.
  // 무한 반복 장식은 기다리지 않고, 자연스럽게 도착한 레이아웃을 측정한다.
  await page.evaluate(async () => {
    const animations = [...document.querySelectorAll('.setup-panel,.result-wrap,.result-panel,.result-banner,.home-menu,.intro-panel')].flatMap(e => e.getAnimations());
    await Promise.all(animations.filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
async function goStage(page, stage) {
  await page.goto(BASE + '/?go=battle&stage=' + stage + '&st=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.bb-input') && !document.querySelector('.bb-input').disabled && window.__battle, undefined, { timeout: 60000 });
  await settled(page);
}
// DOM의 실제 px로 검사한다. 스크롤 가능한 본문의 세로 넘침은 허용한다.
async function inspect(page, panels, controls) {
  const data = await page.evaluate(({ panels, controls }) => {
    const stage = document.querySelector('#ui-stage').getBoundingClientRect();
    const visible = e => !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return {
      stage: rect(document.querySelector('#ui-stage')),
      panels: [...document.querySelectorAll(panels)].filter(visible).map(e => ({ name: e.className, ...rect(e), overflowX: e.scrollWidth - e.clientWidth, scrollY: Math.max(0, e.scrollHeight - e.clientHeight), overflowY: getComputedStyle(e).overflowY })),
      controls: [...document.querySelectorAll(controls)].filter(visible).map(e => {
        const r = e.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { name: e.textContent.trim() || e.getAttribute('aria-label') || e.className, ...rect(e), accessible: !!top && (e === top || e.contains(top)), disabled: !!e.disabled };
      }),
      withinViewport: stage.left >= -1 && stage.top >= -1 && stage.right <= innerWidth + 1 && stage.bottom <= innerHeight + 1,
    };
  }, { panels, controls });
  assert.ok(data.withinViewport, 'UI 스테이지가 실제 화면 안에 있어야 한다');
  assert.ok(data.panels.length > 0, '검사할 패널이 있어야 한다: ' + panels);
  for (const p of data.panels) {
    assert.ok(p.overflowX <= 1, p.name + ': 가로 넘침 ' + p.overflowX + 'px');
    assert.ok(p.x >= data.stage.x - 1 && p.right <= data.stage.right + 1, p.name + ': 좌우 화면 밖');
    assert.ok(p.y >= data.stage.y - 1 && p.bottom <= data.stage.bottom + 1, p.name + ': 상하 화면 밖');
    assert.ok(p.scrollY <= 1 || !['hidden', 'clip'].includes(p.overflowY), p.name + ': 세로 내용이 잘리고 스크롤할 수 없음');
  }
  assert.ok(data.controls.length > 0, '검사할 조작 요소가 있어야 한다');
  for (const c of data.controls) {
    assert.ok(c.height >= 47, c.name + ': 실제 높이 ' + c.height + 'px, 목표 48px');
    assert.ok(c.width >= 43, c.name + ': 실제 너비 ' + c.width + 'px, 최소 44px');
    assert.ok(c.accessible || c.disabled, c.name + ': 다른 요소에 가려져 누를 수 없음');
  }
  return { panels: data.panels.length, controls: data.controls.length, minControlHeight: Math.min(...data.controls.map(c => c.height)), verticalScrollAllowed: data.panels.some(p => p.scrollY > 1 && ['auto', 'scroll'].includes(p.overflowY)) };
}
async function finishTelegram(page) {
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => document.querySelector('.bb-input') && !document.querySelector('.bb-input').disabled && !window.__battle.snapshot().telegram.outage);
    const completed = await page.evaluate(() => window.__battle.snapshot().wordsDone);
    await page.locator('.bb-input').fill(await page.locator('.bb-target').innerText());
    await page.waitForFunction(previous => window.__battle.finished || window.__battle.snapshot().wordsDone > previous, completed);
  }
  await page.locator('.result-panel').waitFor({ state: 'visible', timeout: 60000 });
  await settled(page);
}
try {
  if (!ONLY || ONLY === '1') {
    for (const size of SIZES) await run('1-panels-' + size.join('x'), size, async page => {
      const checked = [];
      for (const stage of ['stage_2', 'stage_4', 'stage_5']) {
        await goStage(page, stage);
        checked.push({ stage, ...await inspect(page, '.battle-top,.battle-bottom,.battle-left,.tele-panel,.race-track', '.battle-top button,.bb-kbd-toggle,.bb-skip,.bb-input') });
        await page.screenshot({ path: OUT + '/1-' + stage + '-' + size.join('x') + '.png', animations: 'disabled' });
      }
      await page.goto(BASE + '/?go=setup&st=1', { waitUntil: 'domcontentloaded' });
      await page.locator('.setup-panel').waitFor({ state: 'visible' });
      await settled(page);
      const setup = await inspect(page, '.setup-panel,.setup-content', '.setup-footer button,.setup-steps button');
      assert.equal(setup.controls, 5, '설정 단계 탭 3개와 이전/다음 버튼 2개 검사');
      checked.push({ stage: 'setup', ...setup });
      const lastCard = page.locator('#setup-step-0 .card').last();
      await lastCard.scrollIntoViewIfNeeded();
      assert.ok(await lastCard.isVisible(), '스크롤 후 마지막 선택 카드에 접근 가능');
      await lastCard.click({ trial: true });
      await page.screenshot({ path: OUT + '/1-setup-' + size.join('x') + '.png', animations: 'disabled' });
      return checked;
    });
  }
  if (!ONLY || ONLY === '2') {
    for (const size of SIZES) await run('2-result-' + size.join('x'), size, async page => {
      await goStage(page, 'stage_4');
      await finishTelegram(page);
      const measured = await inspect(page, '.result-panel,.result-body,.result-actions', '.result-actions button');
      assert.equal(await page.locator('.result-tabs [role="tab"]').count(), 3, '결과·성장·보상 탭이 있어야 한다');
      await page.locator('.result-tabs [role="tab"]').nth(1).click();
      const scrolling = await page.locator('.result-body').evaluate(e => {
        const maximum = Math.max(0, e.scrollHeight - e.clientHeight);
        e.scrollTop = maximum;
        return { maximum, reached: e.scrollTop };
      });
      assert.ok(scrolling.maximum <= 1 && scrolling.reached === 0, '성장 기록도 세로 스크롤 없이 화면에 맞는다');
      await inspect(page, '.result-actions', '.result-actions button');
      await page.screenshot({ path: OUT + '/2-result-' + size.join('x') + '.png', animations: 'disabled' });
      return { ...measured, resultScroll: scrolling };
    });
  }
  if (!ONLY || ONLY === '3') {
    await run('3-judge-popups', [1280, 800], async page => {
      await goStage(page, 'stage_4');
      await page.evaluate(() => {
        window.__layoutJudge = { max: 0, seen: 0 };
        window.__layoutJudgeTimer = setInterval(() => {
          const count = document.querySelectorAll('.judge-pop').length;
          window.__layoutJudge.max = Math.max(window.__layoutJudge.max, count);
          if (count) window.__layoutJudge.seen++;
        }, 16);
      });
      await page.locator('.bb-input').fill('※');
      await page.locator('.bb-input').press('Enter');
      await finishTelegram(page);
      const observed = await page.evaluate(() => { clearInterval(window.__layoutJudgeTimer); return window.__layoutJudge; });
      assert.ok(observed.seen > 0, '실제 입력에 반응한 판정 팝업을 관찰해야 한다');
      assert.ok(observed.max <= 1, '판정 팝업 동시 ' + observed.max + '개');
      return observed;
    });
    for (const [stage, key] of [['stage_1', 'Wave'], ['stage_2', 'Race'], ['stage_5', 'Boss']]) {
      await run('3-reduced-' + key, [1280, 800], async page => {
        await goStage(page, stage);
        if (key === 'Boss') await page.waitForFunction(() => window.__game.scene.getScene('Boss').crystals.length > 0);
        const before = await page.evaluate(key => {
          const sc = window.__game.scene.getScene(key);
          return { tiles: sc.children.list.filter(o => o.type === 'TileSprite').map(o => o.tilePositionX), wordY: sc.wordText?.y ?? null, crystals: sc.crystals?.map(x => ({ y: x.c.y, scale: x.gem.scale })) ?? [] };
        }, key);
        if (key === 'Boss') assert.ok(before.crystals.length > 0, '보스 보석이 실제 생성되어야 한다');
        await page.evaluate(async key => {
          const sc = window.__game.scene.getScene(key);
          const { SaveSystem } = await import('/src/game/systems/SaveSystem.ts');
          SaveSystem.setSettings({ screenShake: true });
          // 실제 씬의 시각 효과만 호출한다. 게임 이벤트·점수·진행 상태는 변경하지 않는다.
          if (key === 'Wave') { sc.onFever(2); sc.onPetActive({ level: 1 }); sc.onSweep({ combo: 5, count: 1 }); }
          if (key === 'Race' || key === 'Boss') sc.flash(0xffffff, 0.5);
          if (key === 'Boss') sc.hitCrystal(0);
        }, key);
        // 기존 섬광/진동이 끝나기 전 시점을 관찰해 누락을 검출한다.
        await page.waitForTimeout(80);
        const after = await page.evaluate(key => {
          const sc = window.__game.scene.getScene(key), camera = sc.cameras.main;
          return {
            reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, shakeOn: sc.shakeOn,
            tiles: sc.children.list.filter(o => o.type === 'TileSprite').map(o => o.tilePositionX),
            wordY: sc.wordText?.y ?? null, crystals: sc.crystals?.map(x => ({ y: x.c.y, scale: x.gem.scale })) ?? [],
            zoom: camera.zoom, cameraFlash: camera.flashEffect.isRunning, cameraShake: camera.shakeEffect.isRunning,
            largeEffects: sc.children.list.filter(o => o.visible && o.type === 'Rectangle' && o.depth >= 29 && o.width >= 1800 && o.height >= 900 && o.fillAlpha > 0.1 && o.alpha > 0.1).length,
          };
        }, key);
        assert.equal(after.reduced, true, 'OS reduce 에뮬레이션 적용');
        assert.equal(after.shakeOn, false, '설정 변경 뒤에도 OS reduce가 카메라 흔들림을 막아야 한다');
        assert.deepEqual(after.tiles, before.tiles, '자동 배경 이동 중단');
        assert.equal(after.wordY, before.wordY, '떠 있는 목표 문장 이동 중단');
        assert.deepEqual(after.crystals, before.crystals, '보스 보석 반복 이동/진동 중단');
        assert.equal(after.zoom, 1, '큰 카메라 줌 없음');
        assert.equal(after.cameraFlash, false, '카메라 섬광 없음');
        assert.equal(after.cameraShake, false, '카메라 흔들림 없음');
        assert.equal(after.largeEffects, 0, '큰 피버 오버레이 없음');
        await page.screenshot({ path: OUT + '/3-reduced-' + key + '.png', animations: 'disabled' });
        return after;
      }, 'reduce');
    }
  }
} finally {
  await browser.close();
  const suffix = (ONLY ? '-' + ONLY : '') + (VIEWPORT ? '-' + VIEWPORT : '');
  fs.writeFileSync(OUT + '/report' + suffix + '.json', JSON.stringify({ base: BASE, channel: CHANNEL, categories: ONLY || '1,2,3', viewport: VIEWPORT || 'all', results }, null, 2));
  fs.writeFileSync(OUT + '/report' + suffix + '.txt', results.map(r => (r.pass ? 'PASS' : 'FAIL') + ' ' + r.label + (r.error ? ': ' + r.error : '')).join('\n'));
}
const failed = results.filter(r => !r.pass);
console.log('검수 ' + (results.length - failed.length) + '/' + results.length + ' PASS · ' + OUT);
if (failed.length) process.exitCode = 1;
