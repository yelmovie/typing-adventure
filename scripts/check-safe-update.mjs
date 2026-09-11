import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

// Two releases of the actual production application, isolated on a temporary
// origin. Only the shell marker and its Workbox revision differ between them.
const DIST = path.resolve(process.env.UPDATE_TEST_DIST || 'tmp/upgrade-infra-build-20260912');
const OUT = process.env.UPDATE_TEST_OUT || 'tmp/safe-update-check';
const KEY = 'typing_adventure_save_v1';
fs.mkdirSync(OUT, { recursive: true });
let release = 'A';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const originalWorker = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
assert.match(originalWorker, /url:"index\.html",revision:"[^"]+"/, 'generated SW has a versioned HTML shell');
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(DIST, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  let bytes = fs.readFileSync(file);
  if (file.endsWith(path.sep + 'index.html')) bytes = Buffer.from(bytes.toString().replace('<html lang=', `<html data-update-release="${release}" lang=`));
  if (file.endsWith(path.sep + 'sw.js')) bytes = Buffer.from(originalWorker.replace(/(url:"index\.html",revision:")[^"]+"/, `$1update-fixture-${release}"`));
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'content-length': bytes.length, 'cache-control': 'no-cache' });
  res.end(bytes);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'allow' });
const result = { at: new Date().toISOString(), dist: DIST, checks: [], errors: [] };
const pass = (name, evidence) => { result.checks.push({ name, evidence, pass: true }); console.log('PASS ' + name); };
const seed = { version: '2', profile: { name: '하늘', characterId: 'brown_boy', petId: 'cat', difficulty: 'normal' }, progress: { tutorialCompleted: true, unlockedStage: 5, clearedStages: ['stage_1','stage_2','stage_3','stage_4','stage_5'], coins: 123, stageStars: { stage_1: 3 } }, settings: { language: 'ko', bgm: false, sfx: false, prologueSeen: true }, records: { bestWpm: 73 } };
await context.addInitScript(({ key, seed }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); }, { key: KEY, seed });
let home, battle;
const readyHome = async page => {
  await page.bringToFront();
  await page.locator('.opening-skip').click();
  await page.locator('.opening-player').waitFor({ state: 'detached' });
  await page.waitForFunction(() => !!document.querySelector('.home-menu') && !document.querySelector('#fade.on, #ui-stage[aria-busy]'));
};
const marker = page => page.locator('html').getAttribute('data-update-release');
try {
  home = await context.newPage(); home.on('pageerror', e => result.errors.push(e.message));
  await home.goto(BASE, { waitUntil: 'commit' }); await readyHome(home);
  await home.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.equal(await marker(home), 'A');
  assert.equal(await home.locator('.update-notice').isVisible(), false);
  // Save the legacy-shaped fixture through a real reversible setting change so
  // normal migration defaults are present before comparing the two releases.
  await home.locator('.screen.home button[title="설정"]').click();
  await home.locator('.settings-body .setting-row button').last().click();
  await home.locator('.settings-body .setting-row button').last().click();
  await home.locator('#modal-root .modal-close').click();
  battle = await context.newPage(); battle.on('pageerror', e => result.errors.push(e.message));
  await battle.goto(BASE, { waitUntil: 'commit' }); await readyHome(battle);
  await battle.locator('.home-menu button').filter({ hasText: '모험 플러스' }).click();
  await battle.locator('.replay-route:visible').first().click();
  await battle.locator('.intro-battle').click();
  await battle.waitForFunction(() => !!document.querySelector('.bb-input') && !document.querySelector('.bb-input').disabled && !document.querySelector('#ui-stage[aria-busy]'));
  await battle.locator('.bb-input').press('Escape');
  const before = await home.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  let homeNavigations = 0, battleNavigations = 0;
  home.on('framenavigated', frame => { if (frame === home.mainFrame()) homeNavigations++; });
  battle.on('framenavigated', frame => { if (frame === battle.mainFrame()) battleNavigations++; });
  release = 'B';
  await battle.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await home.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
  await home.locator('.update-notice').waitFor({ state: 'visible' });
  await home.bringToFront();
  assert.equal(await battle.locator('.update-notice').isVisible(), false);
  assert.equal(await marker(home), 'A'); assert.equal(await marker(battle), 'A');
  assert.equal(homeNavigations + battleNavigations, 0);
  pass('new worker waits; home gets notice and active game keeps its document');
  await home.locator('.update-later').click();
  assert.equal(await home.locator('.update-notice').isVisible(), false);
  await home.locator('.screen.home button[title="설정"]').click();
  await home.locator('#modal-root .modal-close').click();
  await home.locator('.update-notice').waitFor({ state: 'visible' });
  assert.equal(homeNavigations, 0);
  pass('Later dismisses without reload; notice returns on a safe screen');
  await home.screenshot({ path: OUT + '/notice-ko.png' });
  await home.locator('.update-apply').click();
  await home.waitForFunction(() => document.documentElement.dataset.updateRelease === 'B');
  await readyHome(home);
  const after = await home.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  for (const field of ['profile', 'progress', 'settings', 'records']) assert.deepEqual(after[field], before[field], field + ' survives the update');
  assert.equal(battleNavigations, 0); assert.equal(await marker(battle), 'A');
  assert.ok(await battle.locator('.bb-input').count());
  pass('explicit apply loads release B and preserves records; other game tab does not reload', { homeNavigations, battleNavigations });
  release = 'C';
  await home.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await home.locator('.update-notice').waitFor({ state: 'visible' });
  await home.evaluate(key => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, value) { if (k === key) throw new DOMException('quota fixture', 'QuotaExceededError'); return window.__originalSetItem.call(this, k, value); };
  }, KEY);
  const beforeFailedApply = homeNavigations;
  await home.locator('.update-apply').click();
  await home.getByText('기록을 먼저 저장해야 해. 저장 안내에서 다시 저장해 줘.', { exact: true }).waitFor();
  assert.equal(homeNavigations, beforeFailedApply); assert.equal(await marker(home), 'B');
  assert.ok(await home.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting));
  await home.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
  pass('storage failure blocks activation and reload, leaving in-memory records intact');
  assert.deepEqual(result.errors, []);
} catch (error) {
  result.failure = String(error);
  await home?.screenshot({ path: OUT + '/failure.png' }).catch(() => {});
  throw error;
} finally {
  fs.writeFileSync(OUT + '/results.json', JSON.stringify(result, null, 2));
  await context.close(); await browser.close();
  await new Promise(resolve => server.close(resolve));
}
