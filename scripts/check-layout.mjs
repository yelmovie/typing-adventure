import { chromium } from 'playwright';
import fs from 'node:fs';

// 레이아웃 회귀 점검: 실제 브라우저(Playwright)로 띄워 디자인 좌표(1920x1080)로 환산해 잰다.
//   node scripts/check-layout.mjs      전부
//   node scripts/check-layout.mjs 2    결과 화면·판정 팝업만
// 먼저 `npm run dev` 로 5180 포트가 떠 있어야 한다.

const BASE = 'http://localhost:5180';
const OUT = 'tmp/layout-shots';
fs.mkdirSync(OUT, { recursive: true });

const SAVE = {
  version: '1',
  profile: { name: '테스트', characterId: 'brown_boy', petId: 'cat', difficulty: 'normal' },
  progress: { unlockedStage: 5, stageStars: { stage_1: 3, stage_2: 3, stage_3: 2, stage_4: 2 }, clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4'], coins: 620, fails: {}, assist: {} },
  records: { bestCpm: 180, bestAccuracy: 0.97, bestCombo: 24, bestScoreByStage: {}, ghosts: {}, daily: {} },
  collection: { badges: [], wordsSeen: [], petsUnlocked: ['cat', 'rabbit', 'dragon', 'squirrel'], charactersUnlocked: ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'], enemiesSeen: [] },
  settings: { bgm: false, sfx: false, screenShake: true, showKeyboardGuide: false, bgmVolume: 0, sfxVolume: 0, prologueSeen: true },
  stats: { totalClears: 4, totalWords: 200, totalPlaySec: 900 },
  updatedAt: new Date().toISOString(),
};

/** 디자인 좌표(1920x1080)로 환산한 박스 */
const boxOf = `(sel) => {
  const st = document.getElementById('ui-stage');
  const sr = st.getBoundingClientRect();
  const s = sr.width / 1920;
  const e = document.querySelector(sel);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: Math.round((r.left - sr.left) / s), y: Math.round((r.top - sr.top) / s),
           r: Math.round((r.right - sr.left) / s), b: Math.round((r.bottom - sr.top) / s) };
}`;

const spritesOf = `() => {
  const g = window.__game;
  const out = [];
  for (const sc of g.scene.scenes.filter(x => x.scene.isActive() && x.scene.key !== 'Boot')) {
    for (const o of sc.children.list) {
      if (!o.visible || o.type !== 'Sprite') continue;
      const b = o.getBounds();
      out.push({ k: o.texture.key, x: Math.round(b.left), r: Math.round(b.right), y: Math.round(b.top), b: Math.round(b.bottom) });
    }
  }
  return out;
}`;

const overlap = (a, b) => {
  if (!a || !b) return null;
  const ox = Math.min(a.r, b.r) - Math.max(a.x, b.x);
  const oy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? `${Math.round(ox)}x${Math.round(oy)}` : null;
};

const results = [];
const log = (s) => { console.log(s); results.push(s); };

const run = async (label, w, h, fn) => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => log(`  !! pageerror: ${e.message}`));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((d) => localStorage.setItem('typing_adventure_save_v1', JSON.stringify(d)), SAVE);
  try {
    await fn(page, label);
  } finally {
    await browser.close();
  }
};

const goStage = async (page, stage) => {
  await page.goto(`${BASE}/?go=battle&stage=${stage}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`!!document.querySelector('.battle-bottom') && !!window.__battle`, null, { timeout: 60000 });
  await page.waitForTimeout(1800);
};

// ───────── 1. 좌측 열 vs 캐릭터 (S2·S4·S5, 데스크톱 + compact)
const ONLY = process.argv[2];
for (const [label, w, h] of (ONLY && ONLY !== '1' ? [] : [['desktop 1600x900', 1600, 900], ['tablet 1280x800', 1280, 800]])) {
  await run(label, w, h, async (page) => {
    log(`\n=== [1] 좌측 열 겹침 — ${label} ===`);
    for (const st of ['stage_2', 'stage_4', 'stage_5']) {
      await goStage(page, st);
      const compact = await page.evaluate(`document.getElementById('ui-stage').classList.contains('compact')`);
      const col = await page.evaluate(`(${boxOf})('.battle-left-col')`);
      const combo = await page.evaluate(`(${boxOf})('.combo-box')`);
      const sprites = await page.evaluate(`(${spritesOf})()`);
      const chars = sprites.filter((s) => s.k.startsWith('char_') || s.k.startsWith('pet_'));
      const hits = chars.map((c) => [c.k, overlap(col, c)]).filter(([, o]) => o);
      log(`${st} (compact=${compact}) 좌측열 x${col.x}~${col.r} y${col.y}~${col.b}`);
      log(`  캐릭터/펫: ${chars.map((c) => `${c.k} x${c.x}~${c.r} y${c.y}~${c.b}`).join(' | ')}`);
      log(`  → 좌측열 × 캐릭터 겹침: ${hits.length ? hits.map(([k, o]) => `${k} ${o}`).join(', ') : '없음 ✅'}`);
      log(`  → 좌측열 × 콤보박스: ${overlap(col, combo) ?? '없음 ✅'} (콤보 x${combo?.x}~${combo?.r})`);
      await page.screenshot({ path: `${OUT}/1-${st}-${w}x${h}.png` });
    }
  });
}

// ───────── 2. 결과 화면 배너 (배지 최대 케이스)
await run('result', 1600, 900, async (page) => {
  log(`\n=== [2] 결과 화면 배너 ===`);
  await goStage(page, 'stage_1');
  // 배지·해금이 최대로 붙는 상황을 만든다: 배지 0개 상태에서 한 판 클리어
  await page.evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const inp = document.querySelector('.bb-input-wrap input');
    inp.focus();
    for (let i = 0; i < 300; i++) {
      if (window.__battle.finished) break;
      const t = document.querySelector('.bb-target');
      const w = t && t.textContent.trim();
      if (w) { inp.value = w; inp.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: w, bubbles: true })); }
      await wait(150);
    }
    await wait(4000);
  })()`);
  await page.waitForSelector('.result-panel', { timeout: 60000 });
  await page.waitForTimeout(2500);
  const banner = await page.evaluate(`(${boxOf})('.result-banner')`);
  const panel = await page.evaluate(`(${boxOf})('.result-panel')`);
  const badges = await page.evaluate(`(${boxOf})('.result-badges')`);
  const nBadges = await page.evaluate(`document.querySelectorAll('.result-badges .badge').length`);
  log(`배너 y${banner?.y}~${banner?.b} x${banner?.x}~${banner?.r}`);
  log(`패널 y${panel?.y}~${panel?.b} (높이 ${panel ? panel.b - panel.y : '?'}), 배지 ${nBadges}개`);
  log(`  → 배너 화면 안: ${banner && banner.y >= 0 ? '예 ✅' : '아니오 ❌'}`);
  log(`  → 패널 화면 안: ${panel && panel.b <= 1080 ? '예 ✅' : `아니오 ❌ (아래끝 ${panel?.b})`}`);
  log(`  → 배너 × 패널 겹침: ${overlap(banner, panel) ?? '없음'} (배너가 패널 위에 얹히는 건 정상)`);
  const actions = await page.evaluate(`(${boxOf})('.result-actions')`);
  const body = await page.evaluate(`(${boxOf})('.result-body')`);
  const scrolled = await page.evaluate(`(() => { const e=document.querySelector('.result-body'); return e ? { scrollH: e.scrollHeight, clientH: e.clientHeight } : null; })()`);
  log(`  → 버튼 줄 y${actions?.y}~${actions?.b} · 화면 안: ${actions && actions.b <= 1080 ? '예 ✅' : '아니오 ❌'}`);
  log(`  → 본문 스크롤: ${scrolled ? (scrolled.scrollH > scrolled.clientH ? `있음(${scrolled.scrollH}>${scrolled.clientH})` : '없음') : '?'}`);
  await page.screenshot({ path: `${OUT}/2-result-1600x900.png` });

  // 토스트까지 같이 (해금 알림 자리)
  await page.evaluate(`(() => { const d=document.createElement('div'); d.className='toast toast-side'; d.textContent='\\ud3ed\\uc8fc \\uc5f4\\ucc28 \\ud574\\uae08!'; document.getElementById('toast-root').append(d); })()`);
  await page.waitForTimeout(400);
  const toast = await page.evaluate(`(${boxOf})('.toast')`);
  log(`  → 토스트 x${toast?.x}~${toast?.r} y${toast?.y}~${toast?.b} · 배너와 겹침: ${overlap(toast, banner) ?? '없음 ✅'}`);
  await page.screenshot({ path: `${OUT}/2-result-toast.png` });
});

// ───────── 3. 판정 팝업이 동시에 몇 개 뜨는지
await run('judge', 1600, 900, async (page) => {
  log(`\n=== [3] 판정 팝업 동시 표시 ===`);
  await goStage(page, 'stage_1');
  const peak = await page.evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const inp = document.querySelector('.bb-input-wrap input');
    inp.focus();
    let max = 0; const samples = [];
    const tick = setInterval(() => {
      const n = document.querySelectorAll('.judge-pop').length;
      if (n > max) max = n;
      if (n >= 2) samples.push(n + ': ' + [...document.querySelectorAll('.judge-pop')].map(p => p.textContent.trim()).join(' / '));
    }, 60);
    for (let i = 0; i < 300; i++) {
      if (window.__battle.finished) break;
      const t = document.querySelector('.bb-target');
      const w = t && t.textContent.trim();
      if (w) { inp.value = w; inp.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: w, bubbles: true })); }
      await wait(140);
    }
    await wait(2500);
    clearInterval(tick);
    return { max, samples: samples.slice(0, 5) };
  })()`);
  log(`동시에 뜬 팝업 최대 ${peak.max}개 → ${peak.max <= 1 ? '겹침 없음 ✅' : '❌ 여전히 겹침'}`);
  if (peak.samples.length) log(`  겹친 사례: ${peak.samples.join(' || ')}`);
});

fs.writeFileSync(`${OUT}/report.txt`, results.join('\n'), 'utf8');
console.log('\n스크린샷: ' + OUT);
