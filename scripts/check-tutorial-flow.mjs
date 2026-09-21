import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const OUT = 'tmp/tutorial-parts';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const results = [];

try {
  for (const [language, width, height] of [['ko', 1280, 720], ['ko', 915, 412], ['en', 1280, 720]]) {
    if (process.env.TUTORIAL_LANGUAGE && process.env.TUTORIAL_LANGUAGE !== language) continue;
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(60000);
    await page.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(language => {
      if (sessionStorage.getItem('seeded')) return;
      localStorage.setItem('typing_adventure_save_v1', JSON.stringify({
        profile: { name: 'Player', characterId: 'brown_boy', petId: 'cat' },
        progress: { unlockedStage: 5, practicedParts: [], clearedStages: [], stageStars: {} },
        settings: { language, bgm: false, sfx: false, prologueSeen: true },
      }));
      sessionStorage.setItem('seeded', '1');
    }, language);
    const settled = () => page.waitForFunction(() => !document.querySelector('#ui-stage[aria-busy="true"]'));
    const gameCall = async (method, ...args) => page.evaluate(async ({ method, args }) => {
      const entry = performance.getEntriesByType('resource').find(e => /\/src\/game\/Game\.ts(?:\?|$)/.test(e.name));
      return (await import(entry.name))[method](...args);
    }, { method, args });
    const navigate = async (to, data = {}) => { await gameCall('navigate', to, data); await settled(); };

    try {
      await page.goto(process.env.TUTORIAL_TEST_URL || 'http://127.0.0.1:5180', { waitUntil: 'domcontentloaded' });
      await page.locator('.opening-skip').click();
      await page.locator('.home-tutorial').waitFor();
      await settled();
      assert.ok((await page.locator('.home-tutorial').innerText()).includes(language === 'ko' ? '타이핑 연습 선택' : 'Choose typing practice'));

      await page.locator('.home-tutorial').click();
      await page.locator('.tutorial-part-card').first().waitFor();
      await settled();
      assert.equal(await page.locator('.tutorial-part-card').count(), 4, 'Home practice opens a four-part chooser');
      assert.ok((await page.locator('.tutorial-menu h1').innerText()).includes(language === 'ko' ? '타이핑 연습 선택' : 'Choose typing practice'));
      const menuFit = await page.locator('.tutorial-menu').evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, viewportHeight: innerHeight };
      });
      assert.ok(menuFit.bottom <= menuFit.viewportHeight, `Practice chooser stays inside the viewport: ${JSON.stringify(menuFit)}`);
      if (width === 1280) {
        assert.ok(menuFit.bottom < menuFit.viewportHeight - 40, `Landscape chooser leaves its scenic background visible: ${JSON.stringify(menuFit)}`);
        assert.ok(menuFit.scrollHeight <= menuFit.clientHeight + 1, `Landscape chooser has no reserved blank scroll area: ${JSON.stringify(menuFit)}`);
      }
      await page.screenshot({ path: `${OUT}/${language}-${width}-practice-menu.png` });
      await page.locator('[data-part="vowels"]').click();
      assert.equal(await page.locator('.tutorial-item-progress').textContent(), language === 'ko' ? '1 / 21' : '1 / 5');
      assert.ok(await page.locator('.tutorial-keyboard .key.hand-left').count() >= 5);
      assert.ok(await page.locator('.tutorial-keyboard .key.hand-right').count() >= 5);
      assert.equal(await page.locator('.tutorial-keyboard .key[data-key="Space"]').getAttribute('data-hand'), 'both');
      assert.equal(await page.locator('.tutorial-keyboard .kbd-hands-shadow').count(), 0, 'Practice does not render a hand shadow image');
      assert.equal(await page.locator('.tutorial-keyboard .kbd-fingertip-marker').count(), 1, 'Next-key marker sits on the practice keyboard');
      assert.equal(await page.locator('.tutorial-skip').count(), 0, 'Standalone practice has no stage skip control');
      const keyboardFit = await page.locator('.tutorial-keyboard').evaluate(el => ({ x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight }));
      assert.ok(keyboardFit.x <= 1 && keyboardFit.y <= 1, `Keyboard guide overflows: ${JSON.stringify(keyboardFit)}`);
      await page.screenshot({ path: `${OUT}/${language}-${width}-practice-hands.png` });
      await page.locator('.tutorial-leave').click();
      await settled();
      assert.equal(await gameCall('currentScreen'), 'home');

      if (width === 1280) {
        await page.locator('.home-tutorial').click();
        const stories = await page.evaluate(async language => (await import('/src/game/systems/TutorialSystem.ts')).tutorialSteps(language).find(step => step.part === 'story'), language);
        assert.equal(stories.targets.length, 4, 'Character long-form practice has four stories');
        assert.ok(stories.targets[3].startsWith(language === 'ko' ? '루카의 탐험대장 기록.' : "Luca's Explorer Captain Log."), 'The fourth long-form story belongs to Luca');
        assert.ok((await page.locator('[data-part="story"]').innerText()).includes(language === 'ko' ? '긴 글 4편' : '4 character stories'));
        await page.locator('[data-part="story"]').click();
        assert.equal(await page.locator('.tutorial-story-card').count(), 4, 'Long-form practice offers four character diaries');
        assert.equal(await page.locator('.tutorial-story-open').count(), 0, 'Diary art stays locked until its story is typed');
        await page.screenshot({ path: `${OUT}/${language}-${width}-story-chooser.png` });
        await page.locator('.tutorial-story-start').first().click();
        const storyInput = page.locator('#tutorial-input');
        await storyInput.waitFor();
        const storyTarget = await page.locator('.tutorial-target').getAttribute('data-target');
        assert.ok(storyTarget?.length > 20 && storyTarget.length <= (language === 'ko' ? 72 : 112), 'Long-form practice shows about two lines at a time');
        await page.locator('.tutorial-target span').first().evaluate(node => { node.dataset.stabilityProbe = 'kept'; });
        await storyInput.evaluate((input, text) => {
          input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
          input.value = text.slice(0, 20);
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: text.slice(0, 20) }));
          input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text.slice(0, 20) }));
        }, storyTarget);
        await page.waitForTimeout(100);
        assert.equal(await page.locator('.tutorial-target span').first().getAttribute('data-stability-probe'), 'kept', 'Long-form input reuses target nodes');
        assert.equal(await page.locator('.tutorial-target span').count(), [...storyTarget].length, 'Long-form input keeps every target character');
        await page.screenshot({ path: `${OUT}/${language}-${width}-story-follow.png` });
        for (let guard = 0; guard < 40 && await storyInput.isVisible(); guard++) {
          const target = await page.locator('.tutorial-target').getAttribute('data-target');
          await storyInput.fill(target);
          await page.locator('.tutorial-form button[type="submit"]').click();
        }
        await page.locator('.tutorial-diary-image').waitFor();
        assert.ok((await page.locator('.tutorial-diary-image').getAttribute('src')).includes(`${language}-haneul.webp`), 'Finished story reveals its diary image');
        const finishedStories = await page.evaluate(async () => (await import('/src/game/systems/SaveSystem.ts')).SaveSystem.get().progress.completedPracticeStories ?? []);
        assert.deepEqual(finishedStories, [0], 'Completing one diary saves only that character story');
        await page.screenshot({ path: `${OUT}/${language}-${width}-story-diary.png`, fullPage: true });
        await page.locator('.tutorial-diary-actions .btn').first().click();
        assert.equal(await page.locator('.tutorial-story-open').count(), 1, 'Completed diary can be reopened from the chooser');
        await page.locator('.tutorial-leave').click(); await settled();
      }

      const stages = width === 1280 ? ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5'] : ['stage_2'];
      for (const stageId of stages) {
        await navigate('intro', { stageId });
        assert.equal(await page.locator('.intro-practice').count(), 0, `${stageId} has no practice gate`);
        assert.equal(await page.locator('.intro-practice-status').count(), 0, `${stageId} has no practice status`);
        assert.ok(await page.locator('.intro-battle').isEnabled(), `${stageId} can start immediately`);
      }

      await navigate('battle', { stageId: 'stage_2' });
      await page.locator('.bb-input').waitFor();
      assert.equal(await gameCall('currentScreen'), 'battle', 'Direct battle entry never redirects to practice');
      assert.equal(await page.locator('.battle .kbd-hands-shadow').count(), 0, 'Battle keyboard never renders practice hand guidance');
      const practicedParts = await page.evaluate(async () => (await import('/src/game/systems/SaveSystem.ts')).SaveSystem.get().progress.practicedParts ?? []);
      assert.deepEqual(practicedParts, [], 'Entering a stage does not forge practice completion');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${OUT}/${language}-${width}-optional-practice.png` });
      results.push({ language, width, stages, pass: true });
      console.log('PASS optional practice', language, width, 'home chooser and direct stage entry');
    } catch (error) {
      await page.screenshot({ path: `${OUT}/${language}-${width}-failure.png` });
      throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ results }, null, 2));
}
