import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// Run alone, after other browser checks have finished. This does not mutate app state
// beyond the same real Skip click a visitor can make; timings are captured in-page.
const BASE = process.env.DELIVERY_TEST_URL || 'http://127.0.0.1:4176';
const DIST = process.env.DELIVERY_DIST || 'dist';
const OUT = process.env.OPENING_TIMING_OUT || 'tmp/delivery-check/opening-cold-browser-timing.json';
const manifest = JSON.parse(fs.readFileSync(`${DIST}/classroom-manifest.json`, 'utf8'));

function networkLedger(cdp) {
  const requests = [], current = new Map();
  let navigation;
  cdp.on('Network.requestWillBeSent', event => {
    if (event.redirectResponse && current.has(event.requestId)) {
      const previous = current.get(event.requestId);
      previous.finished = event.timestamp;
      previous.total = event.redirectResponse.encodedDataLength;
    }
    const request = { id: event.requestId, url: event.request.url, type: event.type, started: event.timestamp, chunks: [] };
    current.set(event.requestId, request); requests.push(request);
    if (event.type === 'Document' && !navigation) navigation = { timestamp: event.timestamp, wallTime: event.wallTime };
  });
  cdp.on('Network.responseReceived', event => {
    const request = current.get(event.requestId); if (!request) return;
    request.responseAt = event.timestamp;
    request.initialResponseBytes = event.response.encodedDataLength;
    request.cached = !!(request.cached || event.response.fromDiskCache || event.response.fromServiceWorker || event.response.fromPrefetchCache);
    request.protocol = event.response.protocol;
  });
  cdp.on('Network.requestServedFromCache', event => { const request = current.get(event.requestId); if (request) request.cached = true; });
  cdp.on('Network.dataReceived', event => current.get(event.requestId)?.chunks.push({ at: event.timestamp, encoded: event.encodedDataLength, decoded: event.dataLength }));
  cdp.on('Network.loadingFinished', event => {
    const request = current.get(event.requestId); if (!request) return;
    request.finished = event.timestamp; request.total = event.encodedDataLength;
  });
  cdp.on('Network.loadingFailed', event => {
    const request = current.get(event.requestId); if (request) { request.failed = event.timestamp; request.canceled = !!event.canceled; }
  });
  return (timing, metrics, timeOrigin) => {
    assert.ok(navigation, 'CDP navigation timestamp exists');
    const pairedOrigin = navigation.timestamp + timeOrigin / 1000 - navigation.wallTime;
    const metricOrigin = metrics.find(metric => metric.name === 'NavigationStart')?.value;
    const origin = metricOrigin > 0 ? metricOrigin : pairedOrigin;
    const snapshot = milliseconds => {
      const cutoff = origin + milliseconds / 1000;
      const rows = requests.filter(request => /^https?:/.test(request.url) && request.responseAt <= cutoff && !request.cached).map(request => {
        const chunks = request.chunks.filter(chunk => chunk.at <= cutoff);
        const encodedBodyBytes = chunks.reduce((sum, chunk) => sum + chunk.encoded, 0);
        const initialResponseBytes = request.initialResponseBytes ?? 0;
        const finished = request.finished <= cutoff;
        const eventBytes = initialResponseBytes + encodedBodyBytes;
        // The terminal count is authoritative for completed requests. An open or
        // canceled media request contributes only chunks actually reported by then.
        const bytes = finished ? request.total : eventBytes;
        return { url: request.url, type: request.type, bytes, initialResponseBytes, encodedBodyBytes,
          decodedBodyBytes: chunks.reduce((sum, chunk) => sum + chunk.decoded, 0),
          completionReconciliationBytes: finished ? request.total - eventBytes : 0,
          state: finished ? 'finished' : request.failed <= cutoff ? 'failed' : 'in-flight' };
      });
      const sum = field => rows.reduce((total, row) => total + row[field], 0);
      return { atMs: Math.round(milliseconds), receivedEncodedBytes: sum('bytes'), receivedDecimalMB: +(sum('bytes') / 1e6).toFixed(3),
        initialResponseBytes: sum('initialResponseBytes'), encodedBodyChunkBytes: sum('encodedBodyBytes'),
        decodedBodyChunkBytes: sum('decodedBodyBytes'), completionReconciliationBytes: sum('completionReconciliationBytes'),
        inFlightReceivedBytes: rows.filter(row => row.state === 'in-flight').reduce((total, row) => total + row.bytes, 0),
        responses: rows.length, inFlightResponses: rows.filter(row => row.state === 'in-flight').length,
        videoBytes: rows.filter(row => /\.mp4(?:[?#]|$)/.test(row.url)).reduce((total, row) => total + row.bytes, 0),
        resources: rows.sort((a, b) => b.bytes - a.bytes) };
    };
    return {
      clock: { source: metricOrigin > 0 ? 'Performance.NavigationStart + performance.now' : 'requestWillBeSent timestamp/wallTime + performance.timeOrigin', pairedClockDifferenceMs: +((origin - pairedOrigin) * 1000).toFixed(3) },
      atFirstControl: snapshot(timing.introControlsReadyMs), atFirstFrame: snapshot(timing.introFirstFrameMs),
      atSkip: snapshot(timing.skipClickedMs), atHome: snapshot(timing.homeInteractiveMs),
      reconciliation: requests.filter(request => /^https?:/.test(request.url) && !request.cached && request.total !== undefined).map(request => ({
        url: request.url, totalEncodedBytes: request.total,
        differenceBytes: request.total - (request.initialResponseBytes ?? 0) - request.chunks.reduce((sum, chunk) => sum + chunk.encoded, 0),
      })),
      // Raw event timestamps permit auditing milestone attribution without storing headers or bodies.
      events: requests.map(request => ({ ...request, started: +(1000 * (request.started - origin)).toFixed(3),
        responseAt: request.responseAt === undefined ? undefined : +(1000 * (request.responseAt - origin)).toFixed(3),
        finished: request.finished === undefined ? undefined : +(1000 * (request.finished - origin)).toFixed(3),
        failed: request.failed === undefined ? undefined : +(1000 * (request.failed - origin)).toFixed(3),
        chunks: request.chunks.map(chunk => ({ ...chunk, at: +(1000 * (chunk.at - origin)).toFixed(3) })) })),
    };
  };
}
const browser = await chromium.launch({ channel: process.env.DELIVERY_BROWSER_CHANNEL || 'chrome' });
const result = {
  date: new Date().toISOString(), browser: browser.version(), manifestVersion: manifest.version,
  bundles: manifest.assets.filter(a => /^\.\/assets\/index-.*\.(js|css)$/.test(a.url)).map(a => a.url),
  viewport: { width: 1280, height: 800 }, downMbps: 10, upMbps: 2, latencyMs: 80,
  method: 'Each run uses a fresh browser context. An in-page RAF loop records the first real hit-testable intro Skip control and home control. requestVideoFrameCallback records the first presented frame with performance.now(). A capture-phase click listener timestamps the real Playwright click. Driver waiting between the frame and click is reported separately and is not user loading time.',
  byteMethod: 'CDP Network.dataReceived encodedDataLength chunks and initial response encodedDataLength are mapped to the same monotonic clock as page milestones. Requests finished by a milestone use authoritative loadingFinished encodedDataLength totals. Initial response bytes can include already-buffered encoded bodies, not just headers. An in-flight row means loadingFinished has not occurred and does not prove that its network body is incomplete. Encoded network counters can run ahead of the decoded chunks delivered under CDP throttling; these are separate recorded quantities. Counts include document and page-target HTTP responses, exclude blob/data URLs, decoded expansion, request headers, TLS/IP overhead, and worker-target network activity. Fresh-run SW registration is checked separately. Raw events and clock cross-check are retained.',
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
      const readNetwork = networkLedger(cdp);
      await cdp.send('Network.enable');
      await cdp.send('Performance.enable');
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
      assert.ok(result.bundles.filter(url => url.endsWith('.js')).every(url => resources.urls.some(resource => resource.endsWith(url.slice(2)))), 'The measured application matches the local delivery manifest');
      const metrics = await cdp.send('Performance.getMetrics');
      const timeOrigin = await page.evaluate(() => performance.timeOrigin);
      const network = readNetwork(timing, metrics.metrics, timeOrigin);
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
        network,
      };
      result.runs.push(measure);
      console.log('BROWSER TIMING', JSON.stringify({ ...measure, network: { clock: network.clock,
        firstControlBytes: network.atFirstControl.receivedEncodedBytes, firstFrameBytes: network.atFirstFrame.receivedEncodedBytes,
        skipBytes: network.atSkip.receivedEncodedBytes, homeBytes: network.atHome.receivedEncodedBytes,
        firstControlInFlightBytes: network.atFirstControl.inFlightReceivedBytes,
        firstFrameInFlightBytes: network.atFirstFrame.inFlightReceivedBytes,
        nonzeroReconciliations: network.reconciliation.filter(item => item.differenceBytes !== 0).length } }));
    } finally { await context.close(); }
  }
  console.log('PASS opening cold browser timing: 3 independent runs');
} catch (error) {
  result.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  await browser.close();
}
