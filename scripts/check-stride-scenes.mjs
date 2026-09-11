import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Actual source scenes and DOM input, each in its own disposable browser context.
// Complete required practice using the real controls before checking motion.
const BASE = process.env.STRIDE_TEST_URL || 'http://127.0.0.1:5180';
const OUT = process.env.STRIDE_TEST_OUT || 'tmp/stride-scenes-20260911';
const chars = ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'];
const characterFilter = process.env.STRIDE_TEST_CHARACTER;
const results = [];
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.STRIDE_BROWSER_CHANNEL || 'chrome' });
try {
  for (const [row, characterId] of chars.entries()) for (const stage of ['stage_1', 'stage_2']) {
    if (characterFilter && characterId !== characterFilter) continue;
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
    await context.addInitScript(characterId => localStorage.setItem('typing_adventure_save_v1', JSON.stringify({
      version: '2',
      profile: { name: '보행 점검', characterId, petId: 'rabbit', difficulty: 'normal' },
      progress: { unlockedStage: 5, clearedStages: ['stage_1'], stageStars: { stage_1: 3 }, coins: 123 },
      collection: { charactersUnlocked: ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'], petsUnlocked: ['cat', 'rabbit'] },
      settings: { language: 'ko', bgm: false, sfx: false, prologueSeen: true, showKeyboardGuide: false },
    })), characterId);
    const page = await context.newPage();
    const errors = [], motionResponses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (/char_walk_v2\.(json|webp)$/.test(response.url())) motionResponses.push({ url: response.url(), status: response.status() }); });
    try {
      await page.goto(`${BASE}/?go=intro&stage=${stage}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(row => {
        const scene = window.__game?.scene.getScene('StageIntro');
        return scene?.scene.isActive() && scene.player?.sprite.frame.name === `c8_r${row}` && !document.querySelector('#ui-stage[aria-busy]');
      }, row, { timeout: 60000 });
      const intro = await page.evaluate(() => {
        const actor = window.__game.scene.getScene('StageIntro').player;
        return { texture: actor.sprite.texture.key, frame: actor.sprite.frame.name, animating: actor.sprite.anims.isPlaying };
      });
      assert.equal(intro.texture, 'char_walk_v2');
      assert.equal(intro.animating, false);
      assert.equal(motionResponses.length, 2, 'both v2 atlas files are really loaded by navigation');
      assert.ok(motionResponses.every(response => response.status === 200));
      await page.locator('.intro-practice').click();
      await page.locator('#tutorial-input').waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('#ui-stage[aria-busy]'));
      const practiceCount = stage === 'stage_1' ? 19 : 21;
      for (let index = 0; index < practiceCount; index++) {
        const target = await page.locator('.tutorial-target').getAttribute('data-target');
        await page.locator('#tutorial-input').fill(target);
        await page.locator('#tutorial-input').press('Enter');
      }
      await page.locator('.tutorial-next').click();
      await page.waitForFunction(() => !document.querySelector('#ui-stage[aria-busy]') && document.querySelector('.intro-battle') && !document.querySelector('.intro-battle').disabled);
      await page.locator('.intro-battle').click();
      await page.waitForFunction(() => window.__battle?.snapshot().target && document.querySelector('.bb-input') && !document.querySelector('.bb-input').disabled, undefined, { timeout: 60000 });
      const sceneName = stage === 'stage_1' ? 'Wave' : 'Race';
      await page.evaluate(sceneName => {
        const scene = window.__game.scene.getScene(sceneName), frames = new Set(), petFrames = new Set(), gaps = [];
        const observation = { frames, petFrames, gaps, animationStarts: 0, wrongTextures: new Set(), groundFirst: undefined, groundLast: undefined };
        let simulationTime = 0;
        const sample = (_time, delta) => {
          simulationTime += delta;
          const sprite = scene.player.sprite, frame = sprite.frame, metadata = frame.customData?.customData ?? frame.customData;
          frames.add(String(frame.name)); petFrames.add(String(scene.pet.sprite.frame.name));
          if (sprite.texture.key !== 'char_walk_v2') observation.wrongTextures.add(sprite.texture.key);
          gaps.push(((metadata?.foot?.y ?? frame.y + frame.height) - sprite.displayOriginY) * sprite.scaleY);
          // Background and animation both advance with Phaser's smoothed delta.
          // Wall-clock gaps from a busy test host must not look like foot sliding.
          const ground = { position: scene.bgFar.tilePositionX * scene.bgFar.scaleX, time: simulationTime };
          observation.groundFirst ??= ground; observation.groundLast = ground;
        };
        scene.events.on('postupdate', sample);
        const start = () => observation.animationStarts++;
        scene.player.sprite.on('animationstart', start);
        window.__strideObservation = () => {
          scene.events.off('postupdate', sample); scene.player.sprite.off('animationstart', start);
          const groundSpeed = (observation.groundLast.position - observation.groundFirst.position) / (observation.groundLast.time - observation.groundFirst.time) * 1000;
          return { frames: [...frames], petFrames: [...petFrames], minGap: Math.min(...gaps), maxGap: Math.max(...gaps), animationStarts: observation.animationStarts, groundSpeed,
            wrongTextures: [...observation.wrongTextures], playerPlaying: scene.player.sprite.anims.isPlaying, petPlaying: scene.pet.sprite.anims.isPlaying,
            playerX: scene.player.x, playerY: scene.player.y, shadowX: scene.player.shadow.x, shadowY: scene.player.shadow.y,
            ghostTexture: scene.ghost?.texture.key };
        };
      }, sceneName);
      for (let index = 0; index < 3; index++) {
        await page.waitForFunction(expected => window.__battle.snapshot().wordsDone === expected && !document.querySelector('.bb-input').disabled, index, { timeout: 20000 });
        const target = await page.locator('.bb-target').innerText();
        let partial = '';
        for (const letter of [...target]) {
          partial += letter;
          await page.locator('.bb-input').fill(partial);
        }
        await page.waitForFunction(expected => window.__battle.snapshot().wordsDone === expected, index + 1, { timeout: 20000 });
      }
      await page.evaluate(sceneName => new Promise(resolve => window.__game.scene.getScene(sceneName).time.delayedCall(850, resolve)), sceneName);
      const observation = await page.evaluate(() => window.__strideObservation());
      assert.deepEqual(new Set(observation.frames), new Set(Array.from({ length: 8 }, (_, col) => `c${col}_r${row}`)), 'all eight ordered pose frames appear during real input');
      assert.equal(observation.animationStarts, 0, 'typing and successful hits never restart the stride');
      assert.deepEqual(observation.wrongTextures, []);
      assert.ok(observation.minGap >= -2.01 && observation.maxGap <= .01, 'ground stays aligned with bounded typing feedback');
      assert.ok(observation.playerPlaying && observation.petPlaying && observation.petFrames.length >= 4);
      assert.equal(observation.playerX, observation.shadowX);
      assert.equal(observation.playerY + 6, observation.shadowY);
      assert.ok(stage === 'stage_1' ? observation.groundSpeed >= 119 && observation.groundSpeed <= 121 : observation.groundSpeed >= 89 && observation.groundSpeed <= 163, 'visible road moves at the bounded stride pace');
      if (stage === 'stage_2') assert.equal(observation.ghostTexture, 'char_walk_v2', 'the previous-run ghost also uses the corrected model sheet');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${OUT}/${characterId}-${stage}.png` });
      results.push({ characterId, stage, pass: true, intro, practiceCount, motionResponses, observation });
      console.log(`PASS ${characterId} ${stage}: lazy-loaded v2, matching idle, all 8 frames, 3 typed targets, no stride restarts`);
    } catch (error) {
      results.push({ characterId, stage, pass: false, error: String(error), browserErrors: errors });
      await page.screenshot({ path: `${OUT}/failure-${characterId}-${stage}.png` });
      throw error;
    } finally {
      fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), results }, null, 2));
      await context.close();
    }
  }
} finally { await browser.close(); }
console.log(`${results.length}/${characterFilter ? 2 : 8} real-scene stride checks passed.`);
