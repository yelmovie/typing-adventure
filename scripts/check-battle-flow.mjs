import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// 개발 서버와 격리 저장소로 실제 입력창·버튼·결과 저장 연결을 검증한다.
const BASE = process.env.BATTLE_TEST_URL || 'http://127.0.0.1:5180';
const OUT = 'tmp/battle-flow-check';
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
    await page.waitForFunction(() => document.querySelector('.bb-input') && !document.querySelector('.bb-input').disabled, undefined, { timeout: 60000 });
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
const correct = async (page) => { await page.locator('.bb-input').fill(await target(page)); };

try {
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
    for (let i = 0; i < 3; i++) await correct(page);
    await page.waitForSelector('.result-body');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('typing_adventure_save_v1')));
    assert.equal(saved.records.learning.recent.at(-1).correct, 3);
    assert.equal(saved.records.learning.recent.at(-1).skipped, 3);
    assert.ok(saved.records.learning.recent.at(-1).corrected >= 1);
  });

  await run('Escape·설정·탭숨김 일시정지와 명시 재개', 'stage_3', async (page) => {
    const input = page.locator('.bb-input');
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
    const text = await target(page);
    assert.match(text, /^[\x20-\x7e]+$/);
    assert.equal(await page.locator('.bb-input').getAttribute('lang'), 'en');
    await page.locator('.bb-kbd-toggle').click();
    assert.equal(await page.locator('.kbd-guide .key.next').innerText(), text[0].toLowerCase());
    assert.equal(await page.locator('.kbd-guide .next-shift').count(), 1);
    await page.keyboard.press('Escape');
    await page.locator('.kbd-overlay').waitFor({ state: 'hidden' });
    await page.locator('.bb-input').fill(text.toLowerCase());
    await page.locator('.bb-input').press('Enter');
    assert.equal((await snapshot(page)).wordsDone, 0);
    for (let i = 0; i < 6; i++) await correct(page);
    await page.waitForSelector('.result-body');
    await page.screenshot({ path: `${OUT}/english-corrected-result.png` });
  }, 'en');
} finally {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
