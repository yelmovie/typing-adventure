import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.OPENING_TEST_URL || 'http://127.0.0.1:5180';
const OUT = process.env.OPENING_TEST_OUT || 'tmp/opening-check';
fs.mkdirSync(OUT, { recursive: true });
let browser;
const results = [];
async function run(name, action, options = {}, init) {
  browser = await chromium.launch({channel:'chrome'});
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers:'block', ...options });
  if (init) await context.addInitScript(init);
  const page = await context.newPage(), errors = [], requests = [];
  page.setDefaultTimeout(30000);
  // Disable dev HMR in these isolated checks so media playback isn't interrupted by source reloads.
  await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', request => requests.push(request.url()));
  try {
    await action(page, context, requests);
    assert.deepEqual(errors, []);
    results.push({ name, pass: true }); console.log(`PASS opening: ${name}`);
  } catch (error) {
    await page.screenshot({ path: `${OUT}/failure-${results.length}.png`, timeout:5000 }).catch(() => {});
    results.push({ name, pass: false, error: error.message }); throw error;
  } finally { await context.close(); await browser.close(); }
}
const playing = page => page.waitForFunction(() => { const video = document.querySelector('.opening-video'); return video && video.currentTime > 0.05 && !video.paused; });
const enter = async page => { await page.goto(BASE, {waitUntil:'domcontentloaded',timeout:60000}); await page.waitForSelector('.opening-player'); const boxes = await page.locator('.opening-video').evaluate(video => { const a=video.getBoundingClientRect(), b=video.parentElement.getBoundingClientRect(); return {width:a.width, height:a.height, parentWidth:b.width, parentHeight:b.height, fit:getComputedStyle(video).objectFit}; }); assert.ok(Math.abs(boxes.width-boxes.parentWidth)<1 && Math.abs(boxes.height-boxes.parentHeight)<1, 'Opening video keeps the full player area'); assert.equal(boxes.fit,'contain'); };
const closed = page => page.locator('.opening-player').waitFor({ state: 'detached' });
try {
  await run('opening first frame gates the heavy game runtime', async (page, _context, requests) => {
    await page.addInitScript(() => {
      const original = HTMLVideoElement.prototype.requestVideoFrameCallback;
      HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
        window.__releaseOpeningFrame = () => original.call(this, callback);
        return 1;
      };
    });
    await enter(page);
    await page.waitForFunction(() => typeof window.__releaseOpeningFrame === 'function');
    assert.equal(requests.some(url => /\/phaser-[^/]+\.js(?:\?|$)/.test(url)), false, 'Phaser is not requested before the first video frame');
    await page.evaluate(() => window.__releaseOpeningFrame());
    await page.waitForFunction(() => document.querySelector('#game-root canvas'));
    assert.equal(requests.some(url => /\/phaser-[^/]+\.js(?:\?|$)/.test(url)), true, 'The game runtime starts after the first video frame');
    await page.locator('.opening-skip').click(); await closed(page);
    await page.locator('.home-menu').waitFor();
  });
  await run('automatic muted playback, pause, resume, skip, tutorial return, replay', async page => {
    await enter(page); await playing(page);
    const video = await page.locator('.opening-video').evaluate(v => ({ muted: v.muted, duration: v.duration, width: v.videoWidth, height: v.videoHeight, src: v.currentSrc }));
    assert.equal(video.muted, true); assert.ok(Math.abs(video.duration - 8) < 0.1); assert.equal(video.width, 1920); assert.equal(video.height, 1080); assert.ok(video.src.endsWith('/intro-v1.mp4'));
    await page.locator('.opening-playback').click(); assert.equal(await page.locator('.opening-video').evaluate(v => v.paused), true);
    await page.locator('.opening-playback').click(); await playing(page);
    await page.screenshot({ path: `${OUT}/opening-playing.png` });
    await page.locator('.opening-skip').click(); await closed(page);
    assert.equal(await page.locator('#ui-root').evaluate(el => el.inert), false);
    await page.locator('.home-tutorial').click(); await page.locator('.tutorial-part-card').first().click(); await page.waitForSelector('#tutorial-input');
    await page.locator('#ui-stage[aria-busy="true"]').waitFor({ state: 'detached' });
    await page.locator('.tutorial-header button').click(); await page.waitForSelector('.home-menu');
    await page.locator('#ui-stage[aria-busy="true"]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.opening-player').count(), 0, 'Returning home does not force the intro again');
    if (!await page.locator('.home-intro').isVisible()) await page.locator('.home-more > summary').click(); await page.locator('.home-intro').click(); await playing(page);
    await page.keyboard.press('Escape'); await closed(page);
  });
  await run('actual eight-second ending returns to home', async page => {
    await enter(page); await playing(page); await closed(page);
    assert.equal(await page.locator('.home-tutorial').isEnabled(), true);
    assert.equal(await page.locator('#ui-root').evaluate(el => el.inert), false);
  });
  await run('small screen controls and reduced motion opt-in', async page => {
    await enter(page);
    const initial = await page.locator('.opening-video').evaluate(v => ({ paused: v.paused, src: v.getAttribute('src') }));
    assert.equal(initial.paused, true); assert.equal(initial.src, null);
    for (const selector of ['.opening-playback', '.opening-skip']) {
      const b = await page.locator(selector).boundingBox();
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 916 && b.y + b.height <= 413, 'Control fits');
      assert.ok(b.height >= 47.9, '48px touch target');
    }
    await page.screenshot({ path: `${OUT}/opening-small.png` });
    await page.locator('.opening-playback').click(); await playing(page);
    await page.keyboard.press('Escape'); await closed(page);
  }, { viewport: { width: 915, height: 412 }, reducedMotion: 'reduce' });
  await run('autoplay rejection keeps manual control and skip', async page => {
    await enter(page);
    await page.waitForFunction(() => document.querySelector('.opening-video')?.paused && !document.querySelector('.opening-skip')?.disabled);
    await page.locator('.opening-skip').click(); await closed(page);
    assert.equal(await page.locator('#ui-root').evaluate(el => el.inert), false);
  }, {}, () => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Test autoplay denial', 'NotAllowedError')); });
  await run('video missing offers retry and a working exit to home', async (page, context) => {
    await context.route('**/intro-v1.mp4', route => route.abort());
    await enter(page);
    await page.waitForFunction(() => document.querySelector('.opening-status')?.textContent.includes('불러오지 못했어요'));
    assert.equal(await page.locator('.opening-playback').isEnabled(), true);
    await page.locator('.opening-skip').click(); await closed(page);
    await page.locator('.home-tutorial').click(); await page.locator('.tutorial-part-card').first().click(); await page.waitForSelector('#tutorial-input');
  });
  await run('game runtime missing offers a working full-page retry', async (page, context) => {
    let blocked = false;
    await context.route(/\/runtime-[^/]+\.js(?:\?|$)/, route => {
      if (!blocked) { blocked = true; return route.abort(); }
      return route.continue();
    });
    await enter(page);
    await page.locator('.opening-skip').click(); await closed(page);
    await page.locator('.loading-retry').waitFor();
    assert.ok((await page.locator('#loading-text').innerText()).includes('모험을 시작하지 못했어'));
    await page.locator('.loading-retry').click();
    await enter(page);
    await page.locator('.opening-skip').click(); await closed(page);
    await page.locator('.home-menu').waitFor();
  });
  await run('English opening copy and keyboard focus loop', async page => {
    await enter(page);
    assert.equal(/[가-힣]/.test(await page.locator('.opening-player').innerText()), false);
    await page.locator('.opening-skip').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.locator('.opening-playback').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.locator('.opening-skip').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape'); await closed(page);
  }, {}, () => localStorage.setItem('typing_adventure_save_v1', JSON.stringify({ settings: { language: 'en', bgm: false, sfx: false } })));
} finally {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}




