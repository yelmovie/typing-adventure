import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Run alone, after other browser checks have finished. This does not mutate app state
// beyond the same real Skip click a visitor can make; timings are captured in-page.
const BASE = process.env.DELIVERY_TEST_URL || 'http://127.0.0.1:4176';
const DIST = process.env.DELIVERY_DIST || 'dist';
const OUT = process.env.OPENING_TIMING_OUT || 'tmp/delivery-check/opening-cold-browser-timing.json';
const manifest = JSON.parse(fs.readFileSync(`${DIST}/classroom-manifest.json`, 'utf8'));
const browser = await chromium.launch({ channel: process.env.DELIVERY_BROWSER_CHANNEL || 'chrome' });
const result = {
  date: new Date().toISOString(), browser: browser.version(), manifestVersion: manifest.version,
  bundles: manifest.assets.filter(a => /^\.\/assets\/index-.*\.(js|css)$/.test(a.url)).map(a => a.url),
  viewport: { width: 1280, height: 800 }, downMbps: 10, upMbps: 2, latencyMs: 80,
  method: 'Each run uses a fresh browser context. An in-page RAF loop records the first real hit-testable intro Skip control and home control. requestVideoFrameCallback records the first presented frame with performance.now(). A capture-phase click listener timestamps the real Playwright click. Driver waiting between the frame and click is reported separately and is not user loading time.',
  runs: [],
};
try {
  for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({ viewport: result.viewport, serviceWorkers: 'allow', reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        const timing = window.__openingTiming = {};
        let watchedVideo = false;
        const usable = selector => {
          const button = document.querySelector(selector);
          if (!button || button.disabled || button.closest('[inert]')) return false;
          const rect = button.getBoundingClientRect();
          if (!rect.width || !rect.height) return false;
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return hit === button || button.contains(hit);
        };
        const watchVideo = () => {
          const video = document.querySelector('.opening-video');
          if (!video || watchedVideo) return;
          watchedVideo = true;
          video.requestVideoFrameCallback((_now, metadata) => {
            timing.introFirstFrameMs = performance.now();
            timing.firstMediaTime = metadata.mediaTime;
            timing.presentedFrames = metadata.presentedFrames;
            timing.mutedAtFirstFrame = video.muted;
            navigator.serviceWorker.getRegistration().then(registration => {
              timing.workerRegisteredAtFirstFrame = !!registration;
            });
          });
        };
        const observer = new MutationObserver(watchVideo);
        observer.observe(document, { childList: true, subtree: true });
        document.addEventListener('click', event => {
          if (event.target instanceof Element && event.target.closest('.opening-skip') && timing.skipClickedMs === undefined) timing.skipClickedMs = performance.now();
        }, true);
        const probe = () => {
          watchVideo();
          if (timing.introControlsReadyMs === undefined && usable('.opening-skip')) timing.introControlsReadyMs = performance.now();
          if (timing.skipClickedMs !== undefined && !document.querySelector('.opening-player') && !document.querySelector('#fade.on') && usable('.home-menu button')) {
            timing.homeInteractiveMs = performance.now();
            observer.disconnect();
            return;
          }
          requestAnimationFrame(probe);
        };
        requestAnimationFrame(probe);
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: 10e6 / 8, uploadThroughput: 2e6 / 8, latency: 80 });
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Number.isFinite(window.__openingTiming?.introControlsReadyMs) && Number.isFinite(window.__openingTiming?.introFirstFrameMs) && typeof window.__openingTiming?.workerRegisteredAtFirstFrame === 'boolean', null, { timeout: 30000 });
      await page.locator('.opening-skip').click();
      await page.waitForFunction(() => Number.isFinite(window.__openingTiming?.homeInteractiveMs));
      const timing = await page.evaluate(() => window.__openingTiming);
      assert.ok(timing.mutedAtFirstFrame, 'Opening autoplay is muted');
      assert.ok(timing.presentedFrames >= 1 && Number.isFinite(timing.skipClickedMs));
      const resources = await page.evaluate(() => {
        const entries = performance.getEntriesByType('resource');
        return { transferBytes: entries.reduce((total, entry) => total + entry.transferSize, 0), urls: entries.map(entry => entry.name) };
      });
      assert.ok(!resources.urls.some(url => url.endsWith('finale-v1.mp4')), 'Finale is deferred beyond the opening');
      assert.ok(!resources.urls.some(url => url.includes('bg_world_map.webp') || url.includes('/char_brown_boy.webp') || url.includes('/pet_cat.webp')), 'Later scenes and full combat sheets are deferred');
      const measure = {
        run,
        introControlsReadyMs: Math.round(timing.introControlsReadyMs),
        introFirstFrameMs: Math.round(timing.introFirstFrameMs),
        homeAfterSkipMs: Math.round(timing.homeInteractiveMs - timing.skipClickedMs),
        driverDelayAfterFirstFrameMs: Math.round(timing.skipClickedMs - timing.introFirstFrameMs),
        skipClickedMs: Math.round(timing.skipClickedMs),
        navigationToHomeIncludingDriverDelayMs: Math.round(timing.homeInteractiveMs),
        firstMediaTime: timing.firstMediaTime, presentedFrames: timing.presentedFrames,
        completedResourceTransferBytes: resources.transferBytes,
        resourceRequestCount: resources.urls.length,
        laterSceneAssetsDeferred: true,
        workerRegisteredAtFirstFrame: timing.workerRegisteredAtFirstFrame,
      };
      result.runs.push(measure);
      console.log('BROWSER TIMING', JSON.stringify(measure));
    } finally { await context.close(); }
  }
  console.log('PASS opening cold browser timing: 3 independent runs');
} catch (error) {
  result.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  fs.mkdirSync('tmp/delivery-check', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  await browser.close();
}
