import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const base = process.env.BOSS_RELEASE_URL || 'http://127.0.0.1:4176';
const dist = process.env.DELIVERY_DIST || 'dist-release-v032';
const out = 'tmp/boss-release';
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(`${dist}/classroom-manifest.json`, 'utf8'));
for (const asset of manifest.assets) {
  const bytes = fs.readFileSync(`${dist}/${asset.url}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.revision, asset.url);
}
for (const key of ['char_attack_ko_v1', 'char_walk_v1', 'pet_walk_v1']) {
  for (const extension of ['webp', 'json']) assert.ok(manifest.assets.some(a => a.url.endsWith(`/${key}.${extension}`)), 'Generated animation included in offline delivery');
}
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
try {
  for (const language of ['ko', 'en']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(language => localStorage.setItem('typing_adventure_save_v1', JSON.stringify({ version: '1', profile: { name: 'Hero', characterId: 'glasses_boy', petId: 'squirrel', difficulty: 'normal' }, progress: { unlockedStage: 5, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4'], stageStars: {}, coins: 0, tutorialCompleted: true }, settings: { language, bgm: false, sfx: false, prologueSeen: true, showKeyboardGuide: false } })), language);
    const page = await context.newPage(), errors = [], loaded = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', response => { if (/\/(char_attack_ko_v1|char_walk_v1|pet_walk_v1)\.(json|webp)$/.test(response.url())) loaded.push({ url: response.url(), status: response.status() }); });
    try {
      await page.goto(base);
      await page.locator('.opening-skip').click();
      await page.locator('.home-menu .btn-primary').click();
      await page.locator('.map-node').nth(4).click();
      await page.locator('.intro-actions .btn-primary').click();
      await page.waitForFunction(() => { const input = document.querySelector('.bb-input'); return input && !input.disabled; });
      const input = page.locator('.bb-input');
      const target = (await page.locator('.bb-target').innerText()).trim();
      const before = await page.locator('.battle-enemy-hp .gauge-label').innerText();
      await input.fill(target.slice(0, 1));
      await page.screenshot({ path: `${out}/${language}-typing.png` });
      await input.fill(target);
      await page.waitForFunction(previous => document.querySelector('.bb-target')?.textContent !== previous, target);
      const after = await page.locator('.battle-enemy-hp .gauge-label').innerText();
      assert.notEqual(after, before, 'Actual production correct input breaks a protective crystal');
      assert.equal(loaded.length, language === 'ko' ? 6 : 4);
      assert.ok(loaded.every(a => a.status === 200));
      assert.deepEqual(errors, []);
      results.push({ language, pass: true, before, after, loaded, errors });
      console.log(`PASS ${language}: opening → map → boss, new atlases, real correct input`);
    } catch (error) { await page.screenshot({ path: `${out}/${language}-failure.png` }); throw error; }
    finally { await context.close(); }
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({ date: new Date().toISOString(), manifestVersion: manifest.version, assets: manifest.assets.length, bytes: manifest.assets.reduce((sum, a) => sum + a.bytes, 0), results }, null, 2));
}
