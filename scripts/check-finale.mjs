import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// 먼저 npm run dev 실행. 격리된 브라우저 저장소로 인증서 앞 영상 흐름을 검증한다.
const BASE = process.env.FINALE_TEST_URL || 'http://127.0.0.1:5180';
const OUT = process.env.FINALE_TEST_OUT || 'tmp/finale-check';
fs.mkdirSync(OUT, { recursive: true });
let browser;
const results = [];
const FILTER = process.env.FINALE_TEST_FILTER;
const save = (completed) => ({
  version: '1',
  profile: { name: '하늘', characterId: 'brown_boy', petId: 'cat', difficulty: 'normal' },
  progress: {
    unlockedStage: 5,
    clearedStages: Array.from({ length: completed ? 5 : 4 }, (_, i) => `stage_${i + 1}`),
    stageStars: { stage_1: 3, stage_2: 3, stage_3: 3, stage_4: 3, ...(completed ? { stage_5: 3 } : {}) },
    coins: 620,
  },
  settings: { bgm: false, sfx: false, prologueSeen: true },
});
const run = async (label, fn, options = {}) => {
  if (FILTER && !new RegExp(FILTER).test(label)) return;
  browser = await chromium.launch({ channel: process.env.FINALE_BROWSER_CHANNEL || 'chrome' });
  const { completed = true, ...contextOptions } = options;
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers:'block', ...contextOptions });
  // 병렬 개발의 HMR 새로고침이 진행 중인 미디어 검사를 초기화하지 않게 격리한다.
  await context.routeWebSocket('**', socket => {
    socket.onMessage(() => {});
    socket.send(JSON.stringify({ type: 'connected' }));
  });
  await context.addInitScript((data) => localStorage.setItem('typing_adventure_save_v1', JSON.stringify(data)), save(completed));
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().endsWith('/finale-v1.mp4')) requests.push(request.url()); });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // A fresh document offers the opening film, independently of the finale.
    // Reduced motion starts the runtime only after the player skips or plays it.
    await page.locator('.opening-skip').click({ timeout: 60000 });
    await page.locator('.opening-player').waitFor({ state: 'detached' });
    await page.waitForSelector('.home-menu', { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('#fade.on') && !document.getElementById('ui-stage').inert);
    assert.equal(requests.length, 0, '홈에서는 완주 영상을 내려받지 않는다');
    await fn(page, requests);
    await homeRestored(page);
    assert.deepEqual(errors, [], '브라우저 실행 오류');
    console.log(`PASS ${label}`);
    results.push({ label, pass: true, modalControls: true, homeFocusAndClick: true,
      appModules: await page.evaluate(() => window.__finaleImportedModules ?? []) });
  } catch (error) {
    results.push({ label, pass: false, error: error.message, pageErrors: errors });
    await page.screenshot({ path: `${OUT}/failure-${results.length}.png` }).catch(() => {});
    throw error;
  } finally {
    await context.close(); await browser.close();
  }
};
const open = async (page) => {
  const button = page.locator('.home-menu button, .home-menu-dialog button').filter({ hasText: '인증서' });
  if (!await button.isVisible()) await page.locator('.home-more > summary').click();
  await button.evaluate(button => { window.__finaleOpener = button.closest('.home-menu-dialog') ? document.querySelector('.home-more > summary') : button; });
  await button.click();
};
const playing = (page) => page.waitForFunction(() => {
  const video = document.querySelector('.finale-video');
  return video && !video.paused && video.currentTime > 0;
});
const rememberVideo = (page) => page.evaluate(() => { window.__finaleVideo = document.querySelector('.finale-video'); });
// Vite의 ?t= 버전과 별도로 무쿼리 URL을 import하면 모달 정리 상태가 다른 인스턴스가 된다.
const appCall = (page, path, method, ...args) => page.evaluate(async ({ path, method, args }) => {
  const resource = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === path);
  if (!resource) throw new Error(`앱이 아직 불러오지 않은 모듈: ${path}`);
  (window.__finaleImportedModules ??= []).push(resource.name);
  const module = await import(resource.name);
  await module[method](...args);
}, { path, method, args });
const released = async (page, modalOpen = true) => {
  assert.deepEqual(await page.evaluate(() => ({
    connected: window.__finaleVideo.isConnected,
    paused: window.__finaleVideo.paused,
    src: window.__finaleVideo.getAttribute('src'),
    inert: document.getElementById('ui-root').inert,
  })), { connected: false, paused: true, src: null, inert: modalOpen }, '영상 자원 해제와 현재 모달의 배경 잠금을 구분한다');
};
const certificate = async (page) => {
  await page.waitForSelector('.cert', { timeout: 20000 });
  assert.equal(await page.locator('.cert').count(), 1);
  assert.equal(await page.locator('.finale-player').count(), 0);
  assert.equal(await page.locator('#ui-root').evaluate(root => root.inert), true, '인증서가 열린 동안 배경은 잠긴다');
  const chip = page.locator('.c-cando-chips button').first();
  for (let index = 0; !await chip.isVisible(); index++) {
    assert.ok(index < 10, 'certificate writing choices are reachable through its pages');
    await page.locator('.certificate-pages .popup-page-next').click();
  }
  const text = await chip.textContent();
  await chip.click();
  assert.equal(await page.locator('.c-cando-input').inputValue(), text, '인증서 안의 성장 문장 선택은 실제로 작동한다');
};

const homeRestored = async (page) => {
  if (await page.locator('#modal-root > *').count()) {
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    assert.equal(await page.locator('#ui-root').evaluate(root => root.inert), false, '인증서를 닫으면 배경 잠금을 해제한다');
    assert.equal(await page.evaluate(() => document.activeElement === window.__finaleOpener), true, '인증서를 연 버튼으로 포커스가 돌아온다');
  }
  if (!await page.locator('.home-menu').isVisible()) {
    await page.getByRole('button', { name: '홈으로', exact: true }).click();
    await page.locator('.home-menu').waitFor();
  }
  await page.waitForFunction(() => !document.querySelector('#fade.on') && !document.getElementById('ui-stage').inert);
  assert.equal(await page.locator('#ui-root').evaluate(root => root.inert), false);
  const book = page.locator('.home-menu button, .home-menu-dialog button').filter({ hasText: '도감' });
  if (!await book.isVisible()) await page.locator('.home-more > summary').click();
  await book.evaluate(button => { window.__bookReturn = button.closest('.home-menu-dialog') ? document.querySelector('.home-more > summary') : button; });
  await book.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.locator('#ui-root').evaluate(root => root.inert), true);
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement === window.__bookReturn), true, '닫기 버튼 뒤 홈 키보드 포커스 복원');
  if (!await book.isVisible()) await page.locator('.home-more > summary').click();
  await book.click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#modal-root > *').count(), 0);
  assert.equal(await page.locator('#ui-root').evaluate(root => root.inert), false);
  assert.equal(await page.evaluate(() => document.activeElement === window.__bookReturn), true, '홈 클릭과 Escape 뒤에도 포커스 복원');
};

try {
  await run('미완주 인증서는 바로 표시', async (page, requests) => {
    await open(page);
    await certificate(page);
    assert.equal(requests.length, 0);
  }, { completed: false });

  await run('720p 실제 영상이 끝난 뒤 인증서 자동 표시', async (page) => {
    await open(page);
    await playing(page);
    await rememberVideo(page);
    const media = await page.locator('.finale-video').evaluate(video => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, muted: video.muted }));
    assert.ok(media.duration >= 7.5 && media.duration <= 8.5);
    // finale-v1.mp4 was re-encoded to 1280x720 (4.4MB) to stay under the 5MB media budget.
    assert.deepEqual([media.width, media.height, media.muted], [1280, 720, true]);
    await certificate(page);
    await released(page);
    await page.screenshot({ path: `${OUT}/certificate-desktop.png` });
  });

  await run('일시정지·재생·포커스 이동·영상 클릭 후 Escape', async (page) => {
    await open(page);
    await playing(page);
    await rememberVideo(page);
    assert.equal(await page.locator('#ui-root').evaluate(root => root.inert), true);
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    const time = await page.locator('.finale-video').evaluate(video => video.currentTime);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.finale-video').evaluate(video => video.currentTime), time);
    await page.screenshot({ path: `${OUT}/finale-desktop.png` });
    await page.getByRole('button', { name: '인증서 바로 보기', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), '이어서 재생');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), '인증서 바로 보기');
    await page.getByRole('button', { name: '이어서 재생', exact: true }).click();
    await playing(page);
    await page.locator('.finale-video').click();
    await page.keyboard.press('Escape');
    await certificate(page);
    await released(page);
  });

  await run('태블릿 동작 줄이기: 정지 이미지·직접 재생·건너뛰기', async (page, requests) => {
    await open(page);
    await rememberVideo(page);
    assert.equal(await page.locator('.finale-video').getAttribute('src'), null);
    assert.equal(requests.length, 0);
    const boxes = await page.locator('.finale-actions button').evaluateAll(buttons => buttons.map(button => {
      const box = button.getBoundingClientRect();
      return { x: box.x, right: box.right, bottom: box.bottom, height: box.height };
    }));
    assert.ok(boxes.every(box => box.x >= 0 && box.right <= 1024 && box.bottom <= 768 && box.height >= 44));
    assert.ok(boxes[0].right < boxes[1].x);
    await page.screenshot({ path: `${OUT}/finale-tablet.png` });
    await page.getByRole('button', { name: '영상 재생', exact: true }).click();
    await playing(page);
    await page.getByRole('button', { name: '인증서 바로 보기', exact: true }).click();
    await certificate(page);
    await released(page);
  }, { viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });

  await run('자동 재생 차단 후 수동 재생 가능', async (page) => {
    await page.evaluate(() => {
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this.classList.contains('finale-video')) {
          HTMLMediaElement.prototype.play = original;
          return Promise.reject(new DOMException('Test autoplay policy', 'NotAllowedError'));
        }
        return original.call(this);
      };
    });
    await open(page);
    await page.getByText('영상 재생을 누르거나 인증서를 바로 볼 수 있어요.').waitFor();
    await page.getByRole('button', { name: '영상 재생', exact: true }).click();
    await playing(page);
    await page.getByRole('button', { name: '인증서 바로 보기', exact: true }).click();
    await certificate(page);
  });

  await run('영상 요청 실패 시 인증서 표시', async (page) => {
    await page.route('**/assets/video/finale-v1.mp4', route => route.abort('failed'));
    await open(page);
    await certificate(page);
    assert.equal(await page.locator('#ui-root').evaluate(root => root.inert), true);
  });

  await run('재생이 시작되지 않아도 15초 뒤 인증서 표시', async (page) => {
    await page.evaluate(() => {
      HTMLMediaElement.prototype.play = () => new Promise(() => {});
    });
    await open(page);
    await rememberVideo(page);
    const start = Date.now();
    await certificate(page);
    assert.ok(Date.now() - start >= 14000);
    await released(page);
  });

  await run('다른 모달·화면 이동 시 영상 해제 및 지연 이벤트 무시', async (page) => {
    await open(page);
    await playing(page);
    await rememberVideo(page);
    await appCall(page, '/src/game/ui/ModalController.ts', 'settingsModal');
    await released(page);
    await page.evaluate(() => window.__finaleVideo.dispatchEvent(new Event('ended')));
    assert.equal(await page.locator('.cert').count(), 0);
    assert.ok(await page.locator('.setting-row').count() > 0);
    const shake = page.getByRole('switch', { name: '화면 흔들림', exact: true });
    const before = await shake.getAttribute('aria-checked');
    await shake.click();
    assert.equal(await shake.getAttribute('aria-checked'), String(before !== 'true'), '설정 모달 안의 버튼은 작동한다');
    await page.getByRole('button', { name: '확인', exact: true }).click();
    await released(page, false);
    assert.equal(await page.evaluate(() => document.activeElement === window.__finaleOpener), true, '설정을 닫으면 홈 인증서 버튼으로 포커스 복원');
    await open(page);
    await playing(page);
    await rememberVideo(page);
    await appCall(page, '/src/game/Game.ts', 'navigate', 'home');
    await released(page, false);
    await page.evaluate(() => window.__finaleVideo.dispatchEvent(new Event('ended')));
    assert.equal(await page.locator('#modal-root > *').count(), 0);
  });

  await run('마지막 스테이지 완주 결과에서 영상·인증서 연결', async (page) => {
    await appCall(page, '/src/game/Game.ts', 'navigate', 'result', { result: {
        stageId: 'stage_5', cleared: true, score: 1000, accuracy: 98, cpm: 180, maxCombo: 20,
        elapsedSec: 90, wordsDone: 30, wordsTotal: 30, perfectCount: 28, coins: 50, stars: 3,
        newBadges: [], isNewCpm: true, isNewAccuracy: true, isNewCombo: true, isNewScore: true, wordsSeen: [],
    } });
    await page.getByRole('button', { name: '완주 영상 · 인증서', exact: true }).evaluate(button => { window.__finaleOpener = button; });
    await page.getByRole('button', { name: '완주 영상 · 인증서', exact: true }).click();
    await playing(page);
    await page.getByRole('button', { name: '인증서 바로 보기', exact: true }).click();
    await certificate(page);
  });
  await run('선택 아틀라스 요청 실패 시 같은 모험가·펫 초상화 유지', async page => {
    let count = 0, resolveRequests;
    const requestsFailed = new Promise(resolve => { resolveRequests = resolve; });
    await page.route('**/assets/sprites/*_home.json', async route => {
      await route.abort('failed');
      if (++count === 2) resolveRequests();
    });
    await open(page);
    let requestTimeout; try { await Promise.race([requestsFailed, new Promise((_, reject) => { requestTimeout = setTimeout(() => reject(new Error('Atlas failure routes were not reached')), 10000); })]); } finally { clearTimeout(requestTimeout); }
    await page.waitForFunction(() => [...document.querySelectorAll('.finale-portrait')].every(image => image.complete && image.naturalWidth > 0));
    assert.equal(await page.locator('.finale-cast-hero').getAttribute('data-sheet'), 'char_brown_boy');
    assert.equal(await page.locator('.finale-cast-pet').getAttribute('data-sheet'), 'pet_cat');
    assert.equal(await page.locator('.finale-cast-sprite[data-frame="portrait"]').count(), 2);
    assert.equal(await page.locator('.finale-portrait').first().isVisible(), true);
    assert.equal(await page.locator('.finale-portrait').last().isVisible(), true);
    await page.getByRole('button', {name:'인증서 바로 보기',exact:true}).click();
    await certificate(page);
  }, {reducedMotion:'reduce'});
} finally {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  await browser?.close();
}



