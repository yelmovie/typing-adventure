import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.GAME_FEEL_TEST_URL || 'http://127.0.0.1:5180';
const browser = await chromium.launch({ channel: process.env.GAME_FEEL_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => localStorage.setItem('typing_adventure_save_v1', JSON.stringify({
  version: '1',
  profile: { name: '하늘', characterId: 'brown_boy', petId: 'rabbit', difficulty: 'normal' },
  progress: { unlockedStage: 5, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4'], stageStars: { stage_1: 1, stage_2: 1, stage_3: 1, stage_4: 1 }, coins: 0, tutorialCompleted: true },
  settings: { language: 'ko', bgm: false, sfx: false, prologueSeen: true, showKeyboardGuide: false },
})));
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(`${base}/?go=battle&stage=stage_2`, { waitUntil: 'domcontentloaded' });
  const input = page.locator('.bb-input');
  await input.waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('.bb-input')?.disabled, undefined, { timeout: 60000 });
  assert.equal(await page.locator('.battle-left .gauge-layered .hp-trail').count(), 1, 'player HP has one trailing layer');
  assert.equal(await page.locator('.battle-enemy-hp .gauge-layered .enemy-trail').count(), 1, 'enemy HP has one trailing layer');

  await input.fill('※');
  await input.press('Enter');
  await page.waitForFunction(() => parseFloat(document.querySelector('.battle-left .gauge-value').style.width) < 100);
  const immediate = await page.evaluate(() => ({
    value: parseFloat(document.querySelector('.battle-left .gauge-value').style.width),
    trail: parseFloat(document.querySelector('.battle-left .hp-trail').style.width),
    hit: document.querySelector('.battle-left').classList.contains('took-damage'),
  }));
  assert.ok(immediate.trail > immediate.value, 'lost HP remains visible as a damage segment');
  assert.equal(immediate.hit, true, 'damage retriggers local HUD response');
  await page.waitForTimeout(900);
  const settled = await page.evaluate(() => ({
    value: parseFloat(document.querySelector('.battle-left .gauge-value').style.width),
    trail: parseFloat(document.querySelector('.battle-left .hp-trail').style.width),
  }));
  assert.ok(Math.abs(settled.trail - settled.value) < 0.01, 'trailing HP settles on the real value');

  await page.evaluate(async () => {
    const { EventBus, Events } = await import('/src/game/EventBus.ts');
    EventBus.emit(Events.VARIANT_BONUS, { variant: 'treasure', coins: 7 });
  });
  const reward = page.locator('.reward-flight.coin');
  await reward.waitFor({ state: 'visible' });
  assert.match(await reward.getAttribute('aria-label'), /\+7/, 'reward token names its value');
  await reward.waitFor({ state: 'detached', timeout: 2000 });

  const correct = (await page.locator('.bb-target').innerText()).trim();
  await input.fill(correct);
  await input.press('Enter');
  const scoreValue = page.locator('.bt-stats .stat-box').nth(1).locator('.val');
  await page.waitForFunction(() => Number(document.querySelectorAll('.bt-stats .stat-box')[1]?.querySelector('.val')?.textContent?.replace(/\D/g, '')) === window.__battle.snapshot().score);
  const settledScore = await scoreValue.innerText();
  await page.waitForTimeout(500);
  assert.equal(await scoreValue.innerText(), settledScore, 'score count-up settles despite repeated HUD ticks');

  const pursuit = await page.evaluate(async () => {
    const battle = window.__battle;
    battle.pause();
    const scene = window.__game.scene.getScene('Race');
    const base = battle.snapshot().race;
    const sample = async (gap, threat) => {
      scene.onTick({ ...base, gap, threat, catchRecoveryLeft: 0 });
      await new Promise(resolve => setTimeout(resolve, 520));
      return { x: scene.chaser.x, scale: scene.chaser.scaleX, target: scene.targets.chaserX };
    };
    const far = await sample(65, 0.08);
    const middle = await sample(25, 0.5);
    const near = await sample(6, 0.9);
    return { player: scene.player.sprite.x, far, middle, near };
  });
  assert.ok(pursuit.player > 960, 'player stays in the forward half of the stage');
  assert.ok(pursuit.far.target < 0, 'pursuer begins beyond the left edge at a wide gap');
  assert.ok(pursuit.far.x < pursuit.middle.x && pursuit.middle.x < pursuit.near.x && pursuit.near.x < pursuit.player, 'pursuer closes the visible gap continuously');
  assert.ok(pursuit.near.scale > pursuit.far.scale, 'pursuer gains visual pressure as it approaches');

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const openingSkip = page.locator('.opening-skip');
  if (await openingSkip.count()) await openingSkip.click();
  await page.locator('.home-menu .btn-primary').click();
  await page.locator('.map-node').nth(4).click();
  await page.waitForFunction(() => document.querySelector('#fade')?.dataset.transition === 'boss');
  const transitionState = await page.evaluate(() => {
    const fade = document.querySelector('#fade');
    return { kind: fade?.dataset.transition, label: fade?.dataset.label, on: fade?.classList.contains('on') };
  });
  assert.deepEqual(transitionState, { kind: 'boss', label: '최종 관문', on: true }, 'boss entry has a distinct blocking transition');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('PASS game feel: trailing damage, reward flight, progressive pursuit, and boss transition');
} finally {
  await context.close();
  await browser.close();
}
