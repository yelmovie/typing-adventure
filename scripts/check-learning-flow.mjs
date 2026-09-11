import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LEARNING_TEST_URL || 'http://127.0.0.1:5180';
const OUT = process.env.LEARNING_TEST_OUT || 'tmp/learning-flow-check';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const seed = (language = 'ko') => ({
  version: '2', profile: { name: language === 'en' ? 'Haneul' : '하늘', characterId: 'brown_boy', petId: 'cat', difficulty: 'normal' },
  progress: { tutorialCompleted: true, unlockedStage: 5, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5'], stageStars: { stage_1: 3 }, coins: 0 },
  settings: { language, bgm: false, sfx: false, prologueSeen: true },
  records: { learning: { patterns: { letters: { mistakes: 1, corrections: 0, newSuccesses: 0, delayedSuccesses: 0, lastTarget: language === 'en' ? 'cat' : '나무', lastTyped: language === 'en' ? 'car' : '나모', lastErrorAt: '2026-09-01T00:00:00Z' } }, recent: [], seen: [language === 'en' ? 'cat' : '나무'] } },
});
async function openPractice(page, language) {
  await page.locator('.screen.home .topbar-common button').last().click();
  const practice = page.locator('.setting-links button').filter({ hasText: language === 'en' ? /correction practice/i : '나의 교정 연습' });
  for (let i = 0; i < 8 && !await practice.isVisible(); i++) {
    const next = page.locator('.settings-panel .popup-page-next');
    assert.ok(await next.isEnabled(), 'correction practice remains accessible through settings pages');
    await next.click();
  }
  await practice.click();
  await page.waitForFunction(() => !!document.querySelector('.practice-input, .practice-reflection'));
  if (await page.locator('.practice-reflection').isVisible()) {
    const reason = language === 'en' ? 'letters' : 'vowel';
    await page.locator(`.practice-reason-choices button[data-pattern="${reason}"]`).click();
    await page.locator('.practice-reflection > .btn-primary').click();
  }
  await page.waitForSelector('.practice-input');
}
try {
for (const language of ['ko', 'en']) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
  await context.addInitScript((data) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('typing_adventure_save_v1', JSON.stringify(data)); sessionStorage.setItem('seeded', '1'); } }, seed(language));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.home-menu') && !document.querySelector('#fade.on'), null, { timeout: 60000 });
    await page.locator('.opening-skip').click({ timeout: 60000 });
    await page.locator('.opening-player').waitFor({ state: 'detached' });
    await openPractice(page, language);
    const text = await page.locator('.practice-target').innerText();
    await page.locator('.practice-input').fill(language === 'en' ? 'wrong' : '틀림');
    await page.locator('.practice-input').press('Enter');
    assert.equal(await page.locator('.practice-target').innerText(), text, 'wrong input stays on target');
    const targets = [];
    for (let i = 0; i < 3; i++) {
      const target = await page.locator('.practice-target').innerText();
      targets.push(target);
      await page.locator('.practice-input').fill(target);
      await page.locator('.practice-input').press('Enter');
    }
    await page.waitForSelector('.practice-success');
    assert.equal(new Set(targets).size, 3, 'repair followed by different examples');
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem('typing_adventure_save_v1')).records.learning);
    assert.equal(record.recent[record.recent.length - 1].correct, 3);
    assert.ok(record.recent[record.recent.length - 1].corrected >= 1);
    assert.ok(record.recent[record.recent.length - 1].newSuccesses >= 2);
    assert.ok(record.patterns.letters.resolvedAt, 'corrected pattern graduates after two other examples');
    assert.deepEqual(record.patterns.letters.pendingTargets, []);
    await page.screenshot({ path: `${OUT}/practice-${language}.png` });
    await page.locator('.practice-body button').click();
    await openPractice(page, language);
    assert.notEqual(await page.locator('.practice-target').innerText(), text, 'graduated original is no longer forced as the first task');
    for (let i = 0; i < 3; i++) {
      await page.locator('.practice-input').fill(await page.locator('.practice-target').innerText());
      await page.locator('.practice-input').press('Enter');
    }
    await page.waitForSelector('.practice-success');
    const nextRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('typing_adventure_save_v1')).records.learning);
    assert.equal(nextRecord.recent.at(-1).corrected, 0, 'error-free practice must not claim another correction');
    assert.equal(nextRecord.patterns.letters.corrections, record.patterns.letters.corrections);
    await page.locator('.practice-body button').click();
    await page.locator('.home-menu button').filter({ hasText: language === 'en' ? /Adventure Plus|Remix/i : '모험 플러스' }).click();
    await page.locator('.replay-pages').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.replay-goal').count(), 3);
    const visibleGoals = new Set();
    while (true) {
      for (const goal of await page.locator('.replay-goal:visible b').allTextContents()) visibleGoals.add(goal);
      const next = page.locator('.replay-pages .popup-page-next');
      if (!await next.isEnabled()) break;
      await next.click();
    }
    assert.equal(visibleGoals.size, 3, 'all stamp goals are readable by paging');
    while (await page.locator('.replay-pages .popup-page-prev').isEnabled()) await page.locator('.replay-pages .popup-page-prev').click();
    const overflow = await page.locator('.replay-body').evaluate((node) => node.scrollWidth > node.clientWidth + 1);
    assert.equal(overflow, false, 'replay panel stays inside tablet width');
    await page.screenshot({ path: `${OUT}/replay-${language}.png` });
    await page.locator('.replay-route:visible').first().click();
    await page.locator('.intro-battle').click();
    await page.waitForFunction(() => document.querySelector('.bb-input') && !document.querySelector('.bb-input').disabled, null, { timeout: 60000 });
    const target = await page.locator('.bb-target').innerText();
    if (language === 'en') assert.equal(/[가-힣]/.test(target), false);
    assert.ok(target.trim());
    assert.deepEqual(errors, []);
    results.push({ language, pass: true, targets, session: record.recent[record.recent.length - 1], nextSession: nextRecord.recent.at(-1), resolvedAt: nextRecord.patterns.letters.resolvedAt });
    console.log(`PASS ${language}: real correction → two other examples → graduation → no inflated repeat correction → replay`);
  } catch (error) {
    console.error(error);
    results.push({ language, pass: false, failure: String(error) });
    await page.screenshot({ path: `${OUT}/failure-${language}.png`, timeout: 10000 }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
} finally {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
