import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Run against a freshly built production preview, never a user's browser profile.
const BASE = process.env.DELIVERY_TEST_URL || 'http://127.0.0.1:4176';
const DIST = process.env.DELIVERY_DIST || 'dist';
const OUT = process.env.DELIVERY_OUT || 'tmp/delivery-check';
const MOTION_KEYS = ['char_attack_ko_v1', 'char_walk_v2', 'pet_walk_v1'];
const MOTION_URLS = MOTION_KEYS.flatMap(key => ['webp', 'json'].map(ext => `./assets/sprites/${key}.${ext}`));
fs.mkdirSync(OUT, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(`${DIST}/classroom-manifest.json`, 'utf8'));
for (const asset of manifest.assets) {
  const bytes = fs.readFileSync(`${DIST}/${asset.url}`);
  assert.equal(bytes.length, asset.bytes, asset.url);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.revision, asset.url);
}
assert.ok(!manifest.assets.some((a) => a.url.includes('/og/')));
assert.ok(!fs.existsSync(`${DIST}/assets/og`));
assert.ok(fs.existsSync(`${DIST}/licenses/Jua-OFL.txt`));
assert.ok(fs.existsSync(`${DIST}/licenses/NotoSansKR-OFL.txt`));
const mp4 = fs.readFileSync(`${DIST}/assets/video/finale-v1.mp4`);
assert.ok(mp4.indexOf('moov') < mp4.indexOf('mdat'), 'faststart: moov before mdat');
assert.ok(mp4.length < 8 * 1024 * 1024, 'finale media budget');
const openingMp4 = fs.readFileSync(`${DIST}/assets/video/intro-v1.mp4`);
assert.ok(openingMp4.indexOf('moov') < openingMp4.indexOf('mdat'), 'opening faststart: moov before mdat');
assert.ok(manifest.assets.some(a => a.url === './assets/video/intro-v1.mp4'), 'opening included in classroom preparation');
assert.ok(manifest.assets.some(a => a.url === './assets/video/intro-poster-v1.webp'), 'opening poster included in classroom preparation');
for (const url of MOTION_URLS) assert.ok(manifest.assets.some(a => a.url === url), `motion asset included: ${url}`);
const harness = await build({
  entryPoints: ['src/game/systems/ClassroomReady.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'ClassroomHarness',
  write: false,
  // Match Vite's production substitutions inside the standalone browser harness.
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.BASE_URL': '"./"',
  },
});
const browser = await chromium.launch({ channel: process.env.DELIVERY_BROWSER_CHANNEL || 'chrome' });
const results = { date: new Date().toISOString(), base: BASE, dist: DIST, manifestVersion: manifest.version, cacheName: manifest.cacheName, browser: browser.version(), assets: manifest.assets.length, bytes: manifest.assets.reduce((s, a) => s + a.bytes, 0), openingBytes: openingMp4.length, checks: [], performance: [], performanceSkipped: !!process.env.DELIVERY_SKIP_PERF,
  performanceNotes: 'Opening controls and first presented video frame are measured from navigation. The test then clicks Skip. homeAfterSkipMs starts at that click; navigationToHomeMs includes this short first-frame observation, never a forced 8-second viewing. ResourceTiming transfer bytes include completed page requests and can exclude in-flight/aborted media.' };
const save = { version: '2', profile: { name: '하늘', characterId: 'brown_boy', petId: 'cat', difficulty: 'normal' }, progress: { unlockedStage: 5, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4'], stageStars: {}, coins: 0, tutorialCompleted: true }, settings: { language: 'ko', bgm: false, sfx: false, prologueSeen: true } };
const revealHomeOption = async (page, option) => {
  if (!await option.isVisible()) await page.locator('.home-more > summary').click();
  await option.waitFor({ state: 'visible' });
};
const waitForHome = async (page) => {
  await page.waitForFunction(() => {
    const stage = document.getElementById('ui-stage');
    if (document.querySelector('#fade.on') || stage?.inert || document.getElementById('ui-root')?.inert) return false;
    // Opening a disclosed option can scroll Home. Verify an actually visible
    // action, not necessarily the primary button now above the scroll viewport.
    return [...document.querySelectorAll('.home-menu button')].some(button => {
      if (button.disabled) return false;
      const r = button.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === button || button.contains(hit);
    });
  });
};
const home = async (page, measureOpening = false) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home-menu', { timeout: 60000 });
  await page.waitForFunction(() => !document.getElementById('ui-stage')?.hasAttribute('aria-busy') && !document.querySelector('#fade.on'));
  // Home offers the opening on the first RAF after its transition. Let that
  // callback run before deciding whether the home is already interactive.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
  const timing = {};
  if (await page.locator('.opening-player').count()) {
    await page.waitForFunction(() => {
      const button = document.querySelector('.opening-skip');
      if (!button || button.disabled) return false;
      const r = button.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.width > 0 && (hit === button || button.contains(hit));
    });
    timing.introControlsReadyMs = Math.round(await page.evaluate(() => performance.now()));
    if (measureOpening) {
      await page.waitForFunction(() => Number.isFinite(window.__deliveryOpening?.firstFrameMs), null, { timeout: 20000 });
      const playback = await page.evaluate(() => {
        const video = document.querySelector('.opening-video');
        return { firstFrameMs: window.__deliveryOpening.firstFrameMs, muted: video?.muted, playing: video && !video.paused && video.currentTime > 0 };
      });
      assert.ok(playback.muted && playback.playing, 'opening starts automatically and muted');
      timing.introFirstFrameMs = Math.round(playback.firstFrameMs);
    }
    await page.locator('.opening-skip').evaluate(button => {
      button.addEventListener('click', () => { window.__deliverySkipClickedAt = performance.now(); }, { once: true, capture: true });
    });
    await page.locator('.opening-skip').click();
    timing.skipClickedMs = Math.round(await page.evaluate(() => window.__deliverySkipClickedAt));
    await page.waitForSelector('.opening-player', { state: 'detached' });
  }
  await waitForHome(page);
  timing.navigationToHomeMs = Math.round(await page.evaluate(() => performance.now()));
  if (timing.skipClickedMs !== undefined) timing.homeAfterSkipMs = timing.navigationToHomeMs - timing.skipClickedMs;
  if (timing.introFirstFrameMs !== undefined) timing.introWatchBeforeSkipMs = timing.skipClickedMs - timing.introFirstFrameMs;
  return timing;
};
try {
  // Repeat cold measurements; report the environment instead of treating loopback as deployment evidence.
  for (let i = 0; i < (process.env.DELIVERY_SKIP_PERF ? 0 : 3); i++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__deliveryOpening = {};
      let watched = false;
      const observer = new MutationObserver(() => {
        const video = document.querySelector('.opening-video');
        if (!video || watched) return;
        watched = true;
        video.requestVideoFrameCallback(now => { window.__deliveryOpening.firstFrameMs = now; });
        observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: 10e6 / 8, uploadThroughput: 2e6 / 8, latency: 80 });
    const timing = await home(page, true);
    assert.ok(Number.isFinite(timing.introControlsReadyMs) && Number.isFinite(timing.introFirstFrameMs), 'first visit offers the opening');
    const metrics = await page.evaluate(() => ({ bytes: performance.getEntriesByType('resource').reduce((s, r) => s + r.transferSize, 0), requests: performance.getEntriesByType('resource').map((r) => r.name), controlled: !!navigator.serviceWorker.controller }));
    assert.ok(!metrics.requests.some((url) => url.endsWith('finale-v1.mp4')), 'home must not download finale');
    assert.ok(!metrics.requests.some((url) => url.includes('char_pink_girl.webp') || url.includes('bg_world_map.webp')), 'home excludes later-screen atlas/background');
    assert.ok(!metrics.requests.some((url) => url.includes('/char_brown_boy.webp') || url.includes('/pet_cat.webp')), 'home uses trimmed atlases, not full combat sheets');
    const measure = { run: i + 1, ...timing, transferBytes: metrics.bytes, downMbps: 10, latencyMs: 80 };
    results.performance.push(measure);
    console.log('MEASURE', JSON.stringify(measure));
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
  await context.addInitScript((data) => {
    if (!localStorage.getItem('typing_adventure_save_v1')) localStorage.setItem('typing_adventure_save_v1', JSON.stringify(data));
  }, save);
  const page = await context.newPage();
  const errors = [];
  let offline = false;
  const motionResponses = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', response => {
    if (!offline) return;
    const path = `.${new URL(response.url()).pathname}`;
    if (MOTION_URLS.includes(path)) motionResponses.push({ url: path, status: response.status(), fromServiceWorker: response.fromServiceWorker() });
  });
  await home(page);
  console.log('CHECK home ready');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  console.log('CHECK service worker controls the page');
  await home(page);
  await page.addScriptTag({ content: harness.outputFiles[0].text });
  const prepared = await page.evaluate(() => window.ClassroomHarness.ClassroomReady.prepare());
  fs.writeFileSync(`${OUT}/prepared.json`, JSON.stringify(prepared, null, 2));
  assert.equal(prepared.state, 'ready', prepared.message);
  assert.equal(prepared.completed, prepared.total);
  console.log('CHECK resources prepared', prepared.completed);
  results.checks.push({ label: 'All assets prepared with SHA-256 validation', pass: true, prepared });
  // Evict one unvisited-stage asset and verify detection + resume.
  await page.evaluate(async (name) => { const cache = await caches.open(name); await cache.delete(new URL('./assets/backgrounds/bg_train.webp', document.baseURI).href); }, manifest.cacheName);
  const missing = await page.evaluate(() => window.ClassroomHarness.ClassroomReady.verify());
  assert.equal(missing.state, 'incomplete');
  assert.ok(missing.missing.includes('./assets/backgrounds/bg_train.webp'));
  const resumed = await page.evaluate(() => window.ClassroomHarness.ClassroomReady.prepare());
  assert.equal(resumed.state, 'ready');
  results.checks.push({ label: 'Eviction detected and only missing asset resumed', pass: true });
  await page.locator('.screen.home button[title="설정"]').click();
  await page.locator('.settings-panel .popup-page-next').click();
  await page.getByRole('button', { name: '수업 준비 · 오프라인', exact: true }).click();
  try {
    await page.waitForFunction(() => document.querySelector('.classroom-status [role="status"]')?.textContent?.startsWith('수업 준비 완료!'));
  } catch (error) {
    await page.screenshot({ path: `${OUT}/classroom-ui-failure.png` });
    const diagnostic = await page.evaluate(async () => ({ modal: document.getElementById('modal-root')?.innerHTML, verified: await window.ClassroomHarness.ClassroomReady.verify(), keys: await caches.keys() }));
    fs.writeFileSync(`${OUT}/classroom-ui-failure.json`, JSON.stringify(diagnostic, null, 2));
    console.log('CLASSROOM UI DIAGNOSTIC', JSON.stringify(diagnostic));
    throw error;
  }
  assert.ok(await page.getByRole('button', { name: '자료 다시 확인', exact: true }).isEnabled());
  assert.equal(await page.locator('.classroom-progress').evaluate((el) => el.value), 100);
  await page.evaluate(() => document.fonts.ready);
  assert.equal((await page.evaluate(() => window.ClassroomHarness.ClassroomReady.verify())).state, 'ready', 'CSS font requests preserve verified cache entries');
  await page.screenshot({ path: `${OUT}/classroom-ready-ui.png` });
  results.checks.push({ label: 'Settings classroom UI shows complete state, progress and action', pass: true });
  await page.locator('#modal-root .modal-close').click();
  // Disable the browser HTTP cache, so subsequent motion responses must come from
  // the prepared service worker cache instead of an incidental memory-cache hit.
  const offlineCdp = await context.newCDPSession(page);
  await offlineCdp.send('Network.enable');
  await offlineCdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  offline = true;
  await context.setOffline(true);
  await home(page);
  await revealHomeOption(page, page.locator('.home-intro'));
  await page.locator('.home-intro').click();
  await page.waitForFunction(() => { const video = document.querySelector('.opening-video'); return video && video.currentTime > 0 && !video.paused && video.muted; });
  await page.screenshot({ path: `${OUT}/offline-opening-replay.png` });
  await page.locator('.opening-skip').click();
  await waitForHome(page);
  results.checks.push({ label: 'Offline opening replay: muted MP4 range playback → real Skip → interactive home', pass: true });
  // Existing adventure fixtures do not enter the new setup-only automatic tutorial.
  // Verify the added rehearsal scene is also available after classroom preparation.
  await home(page);
  await page.getByRole('button', { name: '연습 튜토리얼', exact: true }).click();
  await page.waitForSelector('.screen.tutorial:not(.hidden)');
  await page.waitForFunction(() => !document.querySelector('#fade.on') && !document.getElementById('ui-stage')?.inert);
  await page.locator('.tutorial-part-card[data-part="consonants"]').click();
  assert.equal(await page.locator('.tutorial-target').getAttribute('data-target'), 'ㄱ');
  assert.ok(await page.locator('#tutorial-input').isEnabled());
  await page.screenshot({ path: `${OUT}/offline-tutorial.png` });
  results.checks.push({ label: 'New practice tutorial opens offline with its target and input', pass: true });
  for (const [i, name] of ['푸른 숲', '네온 시티', '사막 유적', '폭주 열차', '어둠의 성채'].entries()) {
    await home(page);
    await page.getByRole('button', { name: '모험 이어하기', exact: true }).click();
    await page.waitForSelector('.screen.worldmap:not(.hidden)');
    await page.waitForFunction(() => !document.querySelector('#fade.on') && !document.getElementById('ui-stage')?.inert);
    await page.getByRole('button', { name: new RegExp(`^${i + 1}\\. ${name}`) }).click();
    await page.waitForSelector('.screen.intro:not(.hidden)');
    await page.waitForFunction(() => !document.querySelector('#fade.on') && !document.getElementById('ui-stage')?.inert);
    await page.getByRole('button', { name: '전투 시작!', exact: true }).click();
    await page.waitForSelector('.screen.battle:not(.hidden)');
    await page.waitForFunction(() => !document.querySelector('.screen.battle .countdown') && !document.querySelector('#fade.on') && !document.getElementById('ui-stage')?.inert);
    assert.ok(await page.locator('.screen.battle:not(.hidden)').count(), name);
    await page.screenshot({ path: `${OUT}/offline-stage-${i + 1}.png` });
    results.checks.push({ label: `Previously unvisited ${name}: offline intro and battle`, pass: true });
    console.log(`CHECK offline region ${i + 1}: ${name}`);
    if (i === 2) {
      for (let line = 0; line < 6; line++) {
        const target = await page.locator('.bb-target').textContent();
        assert.ok(target?.trim(), 'Visible letter target');
        await page.locator('.bb-input').fill(target);
        // Matching text auto-submits. A second Enter could target the next line.
        if (line < 5) await page.waitForFunction((previous) => document.querySelector('.bb-target')?.textContent !== previous, target);
      }
      await page.waitForSelector('.screen.result:not(.hidden)', { timeout: 20000 });
      const recorded = await page.evaluate(() => JSON.parse(localStorage.getItem('typing_adventure_save_v1')));
      const record = recorded.records.learning.recent.filter((session) => session.stageId === 'stage_3' && session.source === 'game').pop();
      assert.equal(record?.correct, 6, 'Six correct sentences recorded');
      assert.ok(recorded.records.bestScoreByStage.stage_3 > 0);
      await page.waitForFunction(() => !document.querySelector('#fade.on') && !document.getElementById('ui-stage')?.inert);
      await page.screenshot({ path: `${OUT}/offline-stage-3-completed.png` });
      await home(page);
      const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('typing_adventure_save_v1')));
      assert.equal(persisted.records.bestScoreByStage.stage_3, recorded.records.bestScoreByStage.stage_3);
      assert.equal(persisted.progress.stageStars.stage_3, recorded.progress.stageStars.stage_3);
      results.checks.push({ label: 'Offline Stage 3: six real correct inputs → result → record survives reload', pass: true, record });
      console.log('CHECK offline Stage 3 complete and saved through reload');
    }
    if (i === 4) {
      const served = motionResponses;
      for (const url of MOTION_URLS) assert.ok(served.some(r => r.url === url && r.status === 200 && r.fromServiceWorker), `offline S5 service worker response: ${url}`);
      const cached = await page.evaluate(async ({ cacheName, assets }) => {
        const cache = await caches.open(cacheName);
        return Promise.all(assets.map(async asset => {
          const response = await cache.match(new URL(asset.url, document.baseURI).href);
          return { url: asset.url, status: response?.status, revision: response?.headers.get('x-classroom-revision'), bytes: response ? (await response.arrayBuffer()).byteLength : 0 };
        }));
      }, { cacheName: manifest.cacheName, assets: manifest.assets.filter(a => MOTION_URLS.includes(a.url)) });
      for (const entry of cached) {
        const expected = manifest.assets.find(a => a.url === entry.url);
        assert.equal(entry.status, 200); assert.equal(entry.revision, expected.revision); assert.equal(entry.bytes, expected.bytes);
      }
      results.checks.push({ label: 'Offline S5 loads all three new motion atlases from the verified service worker cache', pass: true, responses: served, cached });
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem('typing_adventure_save_v1')));
      assert.equal(before.progress.clearedStages.includes('stage_5'), false, 'S5 must be newly completed by this real input run');
      const targets = [];
      const deadline = Date.now() + 180000;
      while (!await page.locator('.result-panel').count()) {
        assert.ok(targets.length < 80 && Date.now() < deadline, 'boss should finish through real target input');
        await page.waitForFunction(() => {
          if (document.querySelector('.result-panel')) return true;
          const input = document.querySelector('.bb-input');
          return input && !input.disabled && document.querySelector('.bb-target')?.textContent?.trim();
        }, null, { timeout: 20000 });
        if (await page.locator('.result-panel').count()) break;
        const shown = await page.evaluate(() => ({ text: document.querySelector('.bb-target').textContent, phase: Number(document.querySelector('.bt-progress .cur').textContent), instruction: document.querySelector('.bb-target-desc').textContent }));
        assert.ok(shown.text.trim()); assert.ok([1, 2, 3].includes(shown.phase));
        targets.push(shown);
        await page.locator('.bb-input').fill(shown.text);
        await page.waitForFunction(previous => {
          if (document.querySelector('.result-panel')) return true;
          const input = document.querySelector('.bb-input'), target = document.querySelector('.bb-target')?.textContent;
          return input && !input.disabled && target?.trim() && target !== previous;
        }, shown.text, { timeout: 20000 });
      }
      assert.equal(targets.filter(t => t.phase === 1).length, 5, 'five real crystal completions');
      assert.ok(targets.some(t => t.phase === 2), 'actual rush phase inputs');
      assert.equal(targets.filter(t => t.phase === 3).length, 3, 'three real final-role sentence completions');
      assert.deepEqual(targets.filter(t => t.phase === 3).map(t => t.instruction.match(/^([123])\/3/)?.[1]), ['1', '2', '3']);
      const recorded = await page.evaluate(() => JSON.parse(localStorage.getItem('typing_adventure_save_v1')));
      const record = recorded.records.learning.recent.filter(s => s.stageId === 'stage_5' && s.source === 'game').pop();
      assert.equal(record.correct, targets.length); assert.equal(record.skipped, 0); assert.equal(record.corrected, 0); assert.equal(record.accuracy, 100);
      assert.ok(recorded.progress.clearedStages.includes('stage_5'));
      assert.ok(recorded.progress.stageStars.stage_5 > 0 && recorded.records.bestScoreByStage.stage_5 > 0);
      await page.waitForFunction(() => !document.querySelector('#fade.on') && !document.getElementById('ui-stage')?.inert);
      await page.screenshot({ path: `${OUT}/offline-stage-5-completed.png` });
      await home(page);
      const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('typing_adventure_save_v1')));
      assert.equal(persisted.records.bestScoreByStage.stage_5, recorded.records.bestScoreByStage.stage_5);
      assert.equal(persisted.progress.stageStars.stage_5, recorded.progress.stageStars.stage_5);
      assert.ok(persisted.progress.clearedStages.includes('stage_5'));
      results.checks.push({ label: 'Offline Stage 5: all three phases typed accurately → new clear → saved result survives reload', pass: true, targets, record });
      console.log('CHECK offline Stage 5 complete, new motion cache responses and saved reload');
    }
  }
  await home(page);
  const certificate = page.getByRole('button', { name: '인증서', exact: true });
  await revealHomeOption(page, certificate);
  await certificate.click();
  await page.waitForFunction(() => { const video = document.querySelector('.finale-video'); return video && video.currentTime > 0 && !video.paused; });
  await page.waitForSelector('.cert', { timeout: 20000 });
  results.checks.push({ label: 'Offline MP4 range playback → certificate', pass: true });
  assert.deepEqual(errors, [], 'No runtime errors through all offline scenes');
  await context.close();
  console.log(`PASS delivery: ${results.checks.length} browser checks, ${manifest.assets.length} asset hashes`);
} finally {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
