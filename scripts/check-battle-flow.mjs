import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// 개발 서버와 격리 저장소로 실제 입력창·버튼·결과 저장 연결을 검증한다.
const BASE = process.env.BATTLE_TEST_URL || 'http://127.0.0.1:5180';
const FILTER = process.env.BATTLE_TEST_FILTER || '';
const OUT = process.env.BATTLE_TEST_OUT || 'tmp/battle-flow-check';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BATTLE_BROWSER_CHANNEL || 'chrome' });
const results = [];
const seed = (language = 'ko') => ({
  version: '1',
  profile: { name: '하늘', characterId: 'brown_boy', petId: 'cat', difficulty: 'normal' },
  progress: { unlockedStage: 5, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4'], stageStars: { stage_1: 1, stage_2: 1, stage_3: 1, stage_4: 1 }, coins: 0 },
  settings: { bgm: false, sfx: false, prologueSeen: true, showKeyboardGuide: false, language },
});
async function run(label, stage, action, language = 'ko') {
  if (FILTER && !label.includes(FILTER)) return;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((data) => {
    localStorage.setItem('typing_adventure_save_v1', JSON.stringify(data));
    // document.visibilitychange를 합성해 앱의 수명주기 연결을 검증한다. 실제 기기 숨김 검사는 별도다.
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    window.__setTestHidden = (value) => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  }, seed(language));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${BASE}/?go=battle&stage=${stage}`, { waitUntil: 'domcontentloaded' });
    // 편지(stage_3)는 「다음 조각 고르기」로 시작하므로 입력창이 닫힌 채 후보가 열려 있어도 준비된 것이다.
    await page.waitForFunction(() => document.querySelector('.bb-input') && (!document.querySelector('.bb-input').disabled || window.__battle?.snapshot().letter?.choices), undefined, { timeout: 60000 });
    await action(page);
    assert.deepEqual(errors, [], '브라우저 런타임 오류 없음');
    results.push({ label, pass: true });
    console.log(`PASS ${label}`);
  } catch (error) {
    await page.screenshot({ path: `${OUT}/failure-${results.length}.png` });
    throw error;
  } finally { await context.close(); }
}
const snapshot = (page) => page.evaluate(() => window.__battle.snapshot());
const target = (page) => page.locator('.bb-target').innerText();
// 편지: 문장을 치기 전에 다음 조각을 고른다. 정답 조각은 순서상 다음 문장(테스트만 내부 순서를 본다).
const nextChoice = (page) => page.evaluate(() => {
  const battle = window.__battle;
  const choices = battle.snapshot().letter?.choices;
  return choices ? choices.indexOf(battle.sentences[battle.idx].text) : -1;
});
const tapPiece = async (page, index) => {
  // 조각이 다 나타난(페이드인 끝) 뒤에 탭한다. 입력창은 시작 순간부터 닫혀 있으므로 그것만으로는 조각 준비를 보장하지 않는다.
  await page.waitForFunction((index) => { const piece = window.__game?.scene.getScene('Letter')?.choicePieces?.[index]; return !!piece && piece.alpha >= 1; }, index);
  // Phaser 조각의 디자인 좌표(1920×1080)를 캔버스 CSS 좌표로 바꿔 실제로 탭한다.
  const point = await page.evaluate((index) => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const scene = window.__game.scene.getScene('Letter');
    const bounds = scene.choicePieces[index].getBounds();
    return { x: rect.left + bounds.centerX * rect.width / 1920, y: rect.top + bounds.centerY * rect.height / 1080 };
  }, index);
  await page.mouse.click(point.x, point.y);
};
const pickNext = async (page, how = 'key') => {
  const index = await nextChoice(page);
  if (index < 0) return false;
  // 고르는 동안 입력창은 닫혀 있어야 숫자 키가 입력창 대신 조각에 간다(시작 직후 첫 tick 에 닫힌다).
  await page.waitForFunction(() => document.querySelector('.bb-input').disabled);
  if (how === 'tap') await tapPiece(page, index);
  else await page.keyboard.press(String(index + 1));
  await page.waitForFunction(() => !document.querySelector('.bb-input').disabled);
  return true;
};
const correct = async (page) => { await pickNext(page); await page.locator('.bb-input').fill(await target(page)); };
const observeMoves = (page) => page.evaluate(async () => {
  // 개발 서버가 HMR 로 무효화한 모듈은 ?t= 주소로 실린다. 앱과 같은 EventBus 인스턴스를 쓰도록 실제로 불린 주소를 찾는다.
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((name) => new URL(name).pathname === '/src/game/EventBus.ts') ?? '/src/game/EventBus.ts';
  const { EventBus, Events } = await import(url);
  window.__testMoves = [];
  EventBus.on(Events.PLAYER_MOVE, ({ dir, pressed }) => window.__testMoves.push({ dir, pressed }));
});
const selection = (input) => input.evaluate(el => ({ start: el.selectionStart, end: el.selectionEnd }));
const assertImeArrows = async (page) => {
  // Synthetic IME events verify event ownership; physical keyboard IME is a separate device check.
  const checks = await page.locator('.bb-input').evaluate(input => {
    const checks = [];
    for (const mode of ['composition', 'isComposing', 'legacy229']) {
      window.__testMoves = [];
      if (mode === 'composition') input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        for (const type of ['keydown', 'keyup']) {
          const event = new KeyboardEvent(type, {
            key, bubbles: true, cancelable: true,
            isComposing: mode === 'isComposing', keyCode: mode === 'legacy229' ? 229 : 0,
          });
          input.dispatchEvent(event);
          checks.push({ mode, key, type, prevented: event.defaultPrevented });
        }
      }
      checks.push({ mode, moves: [...window.__testMoves] });
      if (mode === 'composition') input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    }
    return checks;
  });
  for (const check of checks) {
    if ('moves' in check) assert.deepEqual(check.moves, [], `${check.mode}: IME arrows must not move the character`);
    else assert.equal(check.prevented, false, `${check.mode}: ${check.type} ${check.key} belongs to the IME`);
  }
};
const assertHandGuide = async (page, language) => {
  const key = value => page.locator(`.kbd-guide .key[data-key="${value}"]`);
  assert.equal(await key(language === 'ko' ? 'ㅂ' : 'q').getAttribute('data-hand'), 'left');
  assert.equal(await key(language === 'ko' ? 'ㅛ' : 'y').getAttribute('data-hand'), 'right');
  assert.equal(await key('Space').getAttribute('data-hand'), 'both');
  assert.equal(await key('Backspace').getAttribute('data-hand'), 'right');
  assert.equal(await key('ShiftLeft').getAttribute('data-hand'), 'left');
  assert.equal(await key('ShiftRight').getAttribute('data-hand'), 'right');
  assert.equal(await key(language === 'ko' ? 'ㅛ' : 'y').evaluate(el => el.classList.contains('hand-split')), true);
  const copy = await page.locator('.kbd-hand-legend').innerText();
  assert.ok(copy.includes(language === 'ko' ? '왼손' : 'Left hand'));
  assert.ok(copy.includes(language === 'ko' ? '오른손' : 'Right hand'));
  const colors = await page.evaluate(() => ({
    left: getComputedStyle(document.querySelector('.kbd-guide .key.hand-left')).backgroundImage,
    right: getComputedStyle(document.querySelector('.kbd-guide .key.hand-right')).backgroundImage,
  }));
  assert.notEqual(colors.left, colors.right);
};

try {
  for (const language of ['ko', 'en']) {
    await run(`방향키 회귀 · ${language} 문장 커서·선택 교정·IME`, 'stage_3', async (page) => {
      const input = page.locator('.bb-input');
      await page.waitForFunction(() => document.querySelector('.bb-input').disabled && window.__battle.snapshot().letter?.choices?.length === 3);
      assert.equal((await snapshot(page)).target, null, 'The letter starts with a choice, not a typing target');
      assert.ok(await pickNext(page, language === 'ko' ? 'tap' : 'key'), 'Choose the next piece by tap (ko) or number key (en)');
      const text = await target(page);
      const index = Math.floor(text.length / 2);
      const wrong = `${text.slice(0, index)}※${text.slice(index + 1)}`;
      await observeMoves(page);
      await input.fill(wrong);
      assert.equal((await snapshot(page)).wordsDone, 0, 'A typo must not complete the sentence');
      for (let i = text.length; i > index; i--) await input.press('ArrowLeft');
      assert.deepEqual(await selection(input), { start: index, end: index }, 'Left arrow moves the native caret');
      await input.press('ArrowRight');
      assert.deepEqual(await selection(input), { start: index + 1, end: index + 1 }, 'Right arrow moves the native caret');
      await input.press('Shift+ArrowLeft');
      assert.deepEqual(await selection(input), { start: index, end: index + 1 }, 'Shift+Left selects the wrong character');
      await page.keyboard.insertText(text[index]);
      assert.equal((await snapshot(page)).wordsDone, 1, 'Replacing the selected typo completes the sentence');
      assert.equal(await page.evaluate(() => window.__battle.run.correctedCount), 1, 'Caret correction preserves learning evidence');
      assert.deepEqual(await page.evaluate(() => window.__testMoves), [], 'Sentence editing must not emit character movement');
      assert.equal((await snapshot(page)).target, null, 'A completed sentence opens the next choice');
      await pickNext(page);
      await input.fill((await target(page)).slice(0, 3));
      await assertImeArrows(page);
    }, language);
  }

  await run('방향키 회귀 · 낱말 회피 조작 유지', 'stage_1', async (page) => {
    const input = page.locator('.bb-input');
    await observeMoves(page);
    await input.fill('※※');
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) await input.press(key);
    assert.deepEqual(await selection(input), { start: 2, end: 2 }, 'Word mode keeps arrows assigned to game controls');
    assert.deepEqual(await page.evaluate(() => window.__testMoves), ['left', 'right', 'up', 'down'].flatMap(dir => [{ dir, pressed: true }, { dir, pressed: false }]), 'Word mode still receives both press and release');
    assert.equal((await snapshot(page)).wordsDone, 0, 'Movement does not complete a target');
    await assertImeArrows(page);
  });

  await run('한글 자판 왼손·오른손·양손 엄지 구분', 'stage_1', async (page) => {
    await page.locator('.bb-kbd-toggle').click();
    await assertHandGuide(page, 'ko');
    await page.screenshot({ path: `${OUT}/keyboard-hands-ko.png` });
    await page.keyboard.press('Escape');
    await page.locator('.kbd-overlay').waitFor({ state: 'hidden' });
  });

  await run('목표 등장 대기에는 입력을 멈추고 새 목표에서 재개', 'stage_1', async (page) => {
    await correct(page);
    assert.equal((await snapshot(page)).wordsDone, 1);
    assert.equal(await page.locator('.bb-input').isDisabled(), true);
    const waiting = (await snapshot(page)).elapsedSec;
    await page.waitForTimeout(350);
    assert.equal((await snapshot(page)).elapsedSec, waiting);
    await page.waitForFunction(() => !document.querySelector('.bb-input').disabled);
    await correct(page);
    assert.equal((await snapshot(page)).wordsDone, 2);
  });

  await run('전보 오답·점프 우회 차단 뒤 실제 정답으로 결과 저장', 'stage_4', async (page) => {
    const input = page.locator('.bb-input');
    for (let i = 0; i < 3; i++) {
      await input.fill('※');
      await input.press('Enter');
      await page.waitForFunction(() => !window.__battle.snapshot().telegram.outage);
    }
    for (let i = 0; i < 3; i++) await input.press('Tab');
    const before = await snapshot(page);
    assert.equal(before.wordsDone, 0);
    assert.equal(before.accuracy, 0);
    assert.equal(before.telegram.brake, 0);
    assert.equal(await page.locator('.result-screen').count(), 0);
    await page.screenshot({ path: `${OUT}/telegram-no-false-clear.png` });
    for (let i = 0; i < 5; i++) await correct(page); // 전보 5문장
    await page.waitForSelector('.result-body');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('typing_adventure_save_v1')));
    assert.equal(saved.records.learning.recent.at(-1).correct, 5);
    assert.equal(saved.records.learning.recent.at(-1).skipped, 3);
    assert.ok(saved.records.learning.recent.at(-1).corrected >= 1);
  });

  await run('Escape·설정·탭숨김 일시정지와 명시 재개', 'stage_3', async (page) => {
    const input = page.locator('.bb-input');
    await pickNext(page);
    await input.press('Escape');
    await page.getByRole('dialog', { name: '잠시 멈춤' }).waitFor();
    const paused = (await snapshot(page)).elapsedSec;
    await page.waitForTimeout(350);
    assert.equal((await snapshot(page)).elapsedSec, paused);
    await page.getByRole('button', { name: '계속하기', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.bb-input').disabled);
    await input.press('Shift+Tab');
    assert.notEqual(await page.evaluate(() => document.activeElement?.className), 'input bb-input long');
    await page.locator('.battle-top button[title="설정"]').click();
    await page.waitForFunction(() => document.querySelector('.bb-input').disabled);
    const reading = (await snapshot(page)).elapsedSec;
    await page.waitForTimeout(350);
    assert.equal((await snapshot(page)).elapsedSec, reading);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('dialog', { name: '잠시 멈춤' }).waitFor();
    await page.getByRole('button', { name: '계속하기', exact: true }).click();
    await page.evaluate(() => window.__setTestHidden(true));
    await page.getByRole('dialog', { name: '잠시 멈춤' }).waitFor();
    const hidden = (await snapshot(page)).elapsedSec;
    await page.evaluate(() => window.__setTestHidden(false));
    await page.waitForTimeout(350);
    assert.equal((await snapshot(page)).elapsedSec, hidden, '화면 복귀만으로 재개하지 않는다');
    await page.getByRole('button', { name: '계속하기', exact: true }).click();
    await correct(page);
    assert.equal((await snapshot(page)).wordsDone, 1);
    await page.screenshot({ path: `${OUT}/resume-preserves-input.png` });
  });

  await run('오늘의 도전 수정 입력이 성장 기록으로 전달', 'daily', async (page) => {
    await page.locator('.bb-input').fill('※');
    await page.locator('.bb-input').press('Enter');
    assert.equal((await snapshot(page)).wordsDone, 0);
    for (let i = 0; i < 20; i++) await correct(page);
    await page.waitForSelector('.result-body');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('typing_adventure_save_v1')));
    const last = saved.records.learning.recent.at(-1);
    assert.equal(last.correct, 20);
    assert.equal(last.corrected, 1);
    assert.ok(last.accuracy < 100);
  });

  await run('영문 문장 대소문자 교정·자판 가이드·완료', 'stage_3', async (page) => {
    // 오답 조각: 입력은 계속 닫혀 있고 읽기 실수 1, 타자 제출 0. 정답 조각을 고르면 입력이 열린다.
    await page.waitForFunction(() => document.querySelector('.bb-input').disabled && window.__battle.snapshot().letter?.choices);
    const wrongPiece = await page.evaluate(() => { const b = window.__battle; return b.snapshot().letter.choices.findIndex((t) => t !== b.sentences[b.idx].text); });
    await page.keyboard.press(String(wrongPiece + 1));
    await page.waitForFunction(() => window.__battle.snapshot().letter.readingMistakes === 1);
    assert.equal(await page.locator('.bb-input').isDisabled(), true, 'A wrong piece keeps the choice open');
    assert.equal(await page.evaluate(() => window.__battle.run.stats.submissions), 0, 'Reading mistakes are not typing submissions');
    assert.ok(await page.evaluate(() => window.__battle.snapshot().letter.choiceHint), 'A hint appears after a wrong piece');
    await pickNext(page);
    const text = await target(page);
    assert.match(text, /^[\x20-\x7e]+$/);
    assert.equal(await page.locator('.bb-input').getAttribute('lang'), 'en');
    await page.locator('.bb-kbd-toggle').click();
    await assertHandGuide(page, 'en');
    assert.equal(await page.locator('.kbd-guide .key.next').innerText(), text[0].toLowerCase());
    assert.equal(await page.locator('.kbd-guide .next-shift').count(), 1);
    const nextHand = await page.locator('.kbd-guide .key.next').getAttribute('data-hand');
    const shiftHand = await page.locator('.kbd-guide .next-shift').getAttribute('data-hand');
    assert.equal(shiftHand, nextHand === 'left' ? 'right' : 'left');
    await page.screenshot({ path: `${OUT}/keyboard-hands-en.png` });
    await page.keyboard.press('Escape');
    await page.locator('.kbd-overlay').waitFor({ state: 'hidden' });
    await page.locator('.bb-input').fill(text.toLowerCase());
    await page.locator('.bb-input').press('Enter');
    assert.equal((await snapshot(page)).wordsDone, 0);
    for (let i = 0; i < 9; i++) await correct(page); // 편지 9문장
    await page.waitForSelector('.result-body');
    await page.screenshot({ path: `${OUT}/english-corrected-result.png` });
  }, 'en');
} finally {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
