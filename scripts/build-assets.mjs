// 에셋 전처리 스크립트
//  - assets/background/*.png  → public/assets/backgrounds/*.webp
//  - assets/character/*.png   → public/assets/sprites/<id>.png + <id>.json (Phaser atlas, trimmed)
//                             → public/assets/portraits/<id>.png (idle_front 프레임)
// 원본은 읽기만 하고 절대 수정하지 않는다.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKGROUNDS, SHEETS, ROW_NAMES, UI_LOGO, UI_ICON_SHEET, GRIDS, DOM_SHEETS } from './asset-map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_BG = path.join(ROOT, 'assets', 'background');
const SRC_CH = path.join(ROOT, 'assets', 'character');
const OUT_BG = path.join(ROOT, 'public', 'assets', 'backgrounds');
const OUT_SP = path.join(ROOT, 'public', 'assets', 'sprites');
const OUT_PT = path.join(ROOT, 'public', 'assets', 'portraits');
const SRC_UI = path.join(ROOT, 'assets', 'ui');
const OUT_UI = path.join(ROOT, 'public', 'assets', 'ui');

const ALPHA_T = 24; // 셀 분리용 알파 임계값
const TRIM_T = 8; // 프레임 트림용 알파 임계값
const PAD = 2;

async function buildBackgrounds() {
  await mkdir(OUT_BG, { recursive: true });
  for (const bg of BACKGROUNDS) {
    const src = path.join(SRC_BG, bg.file);
    const out = path.join(OUT_BG, `${bg.id}.webp`);
    await sharp(src).webp({ quality: 82 }).toFile(out);
    // 결과 화면/모달 뒤에 깔 흐림 버전(작게)
    await sharp(src).resize(640).blur(6).webp({ quality: 70 }).toFile(path.join(OUT_BG, `${bg.id}_blur.webp`));
    console.log('bg', bg.id);
  }
}

// 알파 투영으로 비어있지 않은 구간(밴드) 찾기
function findBands(isFilled, length, minGap, minSize) {
  const bands = [];
  let start = -1;
  for (let i = 0; i <= length; i++) {
    const filled = i < length && isFilled(i);
    if (filled && start < 0) start = i;
    if (!filled && start >= 0) {
      bands.push([start, i - 1]);
      start = -1;
    }
  }
  // 작은 틈은 병합
  const merged = [];
  for (const b of bands) {
    const last = merged[merged.length - 1];
    if (last && b[0] - last[1] <= minGap) last[1] = b[1];
    else merged.push([...b]);
  }
  return merged.filter((b) => b[1] - b[0] + 1 >= minSize);
}

// 균등 피치(size/n) 근처(±search)에서 채워진 픽셀 수가 가장 적은 위치를 경계로 선택.
// 반환: n+1개의 경계 (0 ... size)
function bestBoundaries(sums, size, n, search) {
  const pitch = size / n;
  const bounds = [0];
  for (let k = 1; k < n; k++) {
    const center = Math.round(k * pitch);
    let best = center, bestV = Infinity;
    for (let d = -search; d <= search; d++) {
      const p = center + d;
      if (p <= bounds[k - 1] + 20 || p >= size - 20) continue;
      // 경계 자체뿐 아니라 주변 3px도 함께 고려
      const v = sums[p] * 2 + (sums[p - 1] || 0) + (sums[p + 1] || 0) + Math.abs(d) * 0.5;
      if (v < bestV) {
        bestV = v;
        best = p;
      }
    }
    bounds.push(best);
  }
  bounds.push(size);
  return bounds;
}

function alphaAt(data, width, x, y) {
  return data[(y * width + x) * 4 + 3];
}

async function analyzeSheet(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const rowFilled = new Uint8Array(H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (alphaAt(data, W, x, y) > ALPHA_T) {
        rowFilled[y] = 1;
        break;
      }
    }
  }
  let rows = findBands((i) => rowFilled[i] === 1, H, 1, 40);
  if (rows.length !== 6) {
    // 행 사이 틈이 거의 없는 시트: 균등 피치를 기준으로 알파가 가장 적은 줄을 경계로 삼는다.
    const rowSum = new Uint32Array(H);
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = 0; x < W; x++) if (alphaAt(data, W, x, y) > ALPHA_T) s++;
      rowSum[y] = s;
    }
    const bounds = bestBoundaries(rowSum, H, 6, 22);
    rows = bounds.map((b, i) => [b, bounds[i + 1] - 1]).slice(0, 6);
    console.warn(`  rows via boundary search: ${bounds.join(',')}`);
  }
  const cellW = W / 5;
  const cells = [];
  for (let r = 0; r < 6; r++) {
    const [y0, y1] = rows[r];
    const colFilled = new Uint8Array(W);
    const colSum = new Uint32Array(W);
    for (let x = 0; x < W; x++) {
      for (let y = y0; y <= y1; y++) {
        if (alphaAt(data, W, x, y) > ALPHA_T) {
          colFilled[x] = 1;
          colSum[x]++;
        }
      }
    }
    let cols = findBands((i) => colFilled[i] === 1, W, 2, 30);
    if (cols.length !== 5) {
      const bounds = bestBoundaries(colSum, W, 5, 18);
      cols = bounds.map((b, i) => [b, bounds[i + 1] - 1]).slice(0, 5);
    }
    for (let c = 0; c < 5; c++) {
      const [x0, x1] = cols[c];
      // 셀 내부 트림 bbox
      let bx0 = x1, bx1 = x0, by0 = y1, by1 = y0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (alphaAt(data, W, x, y) > TRIM_T) {
            if (x < bx0) bx0 = x;
            if (x > bx1) bx1 = x;
            if (y < by0) by0 = y;
            if (y > by1) by1 = y;
          }
        }
      }
      if (bx1 < bx0) {
        bx0 = x0; bx1 = x1; by0 = y0; by1 = y1;
      }
      bx0 = Math.max(0, bx0 - PAD); by0 = Math.max(0, by0 - PAD);
      bx1 = Math.min(W - 1, bx1 + PAD); by1 = Math.min(H - 1, by1 + PAD);
      cells.push({
        name: ROW_NAMES[r][c],
        row: r,
        col: c,
        cell: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
        box: { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 },
      });
    }
  }
  return { W, H, cells, rowH: Math.max(...rows.map(([a, b]) => b - a + 1)), cellW: Math.round(cellW) };
}

// 단순 shelf packing
function pack(frames, maxW = 2048) {
  const sorted = [...frames].sort((a, b) => b.box.h - a.box.h);
  let x = 0, y = 0, shelfH = 0, usedW = 0;
  for (const f of sorted) {
    if (x + f.box.w > maxW) {
      x = 0;
      y += shelfH;
      shelfH = 0;
    }
    f.pack = { x, y };
    x += f.box.w;
    shelfH = Math.max(shelfH, f.box.h);
    usedW = Math.max(usedW, x);
  }
  return { width: usedW, height: y + shelfH };
}

async function buildSheet(sheet) {
  const src = path.join(SRC_CH, sheet.file);
  const meta = await analyzeSheet(src);
  const { width, height } = pack(meta.cells);
  const composites = [];
  for (const f of meta.cells) {
    const buf = await sharp(src)
      .extract({ left: f.box.x, top: f.box.y, width: f.box.w, height: f.box.h })
      .png()
      .toBuffer();
    composites.push({ input: buf, left: f.pack.x, top: f.pack.y });
  }
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(path.join(OUT_SP, `${sheet.id}.webp`));

  // Phaser JSON Hash atlas. sourceSize는 셀 공통 크기(가로 = 시트/5, 세로 = 가장 큰 행 높이),
  // 프레임은 셀 안에서 바닥 정렬 → origin(0.5, 1)이 발 위치가 되도록.
  const sourceW = meta.cellW;
  const sourceH = meta.rowH;
  const frames = {};
  for (const f of meta.cells) {
    const offX = f.box.x - f.cell.x + Math.round((sourceW - f.cell.w) / 2);
    const offY = f.box.y - f.cell.y + (sourceH - f.cell.h);
    frames[f.name] = {
      frame: { x: f.pack.x, y: f.pack.y, w: f.box.w, h: f.box.h },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: offX, y: offY, w: f.box.w, h: f.box.h },
      sourceSize: { w: sourceW, h: sourceH },
    };
  }
  const atlas = {
    frames,
    meta: {
      app: 'typing-adventure build-assets',
      version: '1.0',
      image: `${sheet.id}.webp`,
      size: { w: width, h: height },
      scale: '1',
      source: sheet.file,
    },
  };
  await writeFile(path.join(OUT_SP, `${sheet.id}.json`), JSON.stringify(atlas));

  // 초상화(idle_front) + 정면 응원(cheer)
  const idle = meta.cells.find((c) => c.name === 'idle_front');
  await sharp(src)
    .extract({ left: idle.box.x, top: idle.box.y, width: idle.box.w, height: idle.box.h })
    .webp({ quality: 90 })
    .toFile(path.join(OUT_PT, `${sheet.id}.webp`));
  console.log('sheet', sheet.id, `${width}x${height}`);
}

// 균등 격자 시트 → 셀별 트림 → 아틀라스 (프레임 c{col}_r{row}, 셀 중앙 정렬)
async function buildGrid(grid) {
  const src = path.join(SRC_CH, grid.file);
  const { width, height } = await sharp(src).metadata();
  const cw = Math.floor(width / grid.cols);
  const ch = Math.floor(height / grid.rows);
  const cells = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const buf = await sharp(src).extract({ left: c * cw, top: r * ch, width: cw, height: ch }).png().toBuffer();
      const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > TRIM_T) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = cw - 1; y1 = ch - 1; }
      x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD); x1 = Math.min(cw - 1, x1 + PAD); y1 = Math.min(ch - 1, y1 + PAD);
      cells.push({ name: `c${c}_r${r}`, cell: { x: 0, y: 0, w: cw, h: ch }, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, buf });
    }
  }
  const { width: W, height: H } = pack(cells);
  const composites = [];
  for (const f of cells) composites.push({ input: await sharp(f.buf).extract({ left: f.box.x, top: f.box.y, width: f.box.w, height: f.box.h }).png().toBuffer(), left: f.pack.x, top: f.pack.y });
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).webp({ quality: 88, alphaQuality: 90 }).toFile(path.join(OUT_SP, `${grid.id}.webp`));
  const frames = {};
  for (const f of cells) frames[f.name] = { frame: { x: f.pack.x, y: f.pack.y, w: f.box.w, h: f.box.h }, rotated: false, trimmed: true, spriteSourceSize: { x: f.box.x, y: f.box.y, w: f.box.w, h: f.box.h }, sourceSize: { w: cw, h: ch } };
  await writeFile(path.join(OUT_SP, `${grid.id}.json`), JSON.stringify({ frames, meta: { app: 'typing-adventure build-assets', version: '1.0', image: `${grid.id}.webp`, size: { w: W, h: H }, scale: '1', source: grid.file } }));
  console.log('grid', grid.id, `${W}x${H}`);
}

// DOM용 아이콘 시트 → 셀별 개별 webp. autoRows 면 알파 띠로 행·열을 찾는다(리본·잘린 띠 같은 작은 조각은 버림)
async function buildDomSheet(sheet) {
  await mkdir(OUT_UI, { recursive: true });
  const src = path.join(SRC_CH, sheet.file);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let rows;
  if (sheet.autoRows) {
    const rowFilled = new Uint8Array(H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alphaAt(data, W, x, y) > ALPHA_T) { rowFilled[y] = 1; break; }
    rows = findBands((i) => rowFilled[i] === 1, H, 2, sheet.minRow ?? 100);
    if (rows.length !== sheet.rows) { console.warn(`  ${sheet.file}: rows ${rows.length} != ${sheet.rows}, uniform fallback`); rows = null; }
  }
  if (!rows) { const ph = H / sheet.rows; rows = Array.from({ length: sheet.rows }, (_, r) => [Math.round(r * ph), Math.round((r + 1) * ph) - 1]); }
  let n = 0;
  for (let r = 0; r < rows.length; r++) {
    const [y0, y1] = rows[r];
    let cols;
    if (sheet.autoRows) {
      const colFilled = new Uint8Array(W);
      for (let x = 0; x < W; x++) for (let y = y0; y <= y1; y++) if (alphaAt(data, W, x, y) > ALPHA_T) { colFilled[x] = 1; break; }
      cols = findBands((i) => colFilled[i] === 1, W, 6, 60);
      // 행에 아이템이 적으면(예: 3개) 찾은 띠 그대로 쓴다. 더 많을 때만 균등 분할로 후퇴
      if (cols.length > sheet.cols) { console.warn(`  ${sheet.file} row${r}: cols ${cols.length} > ${sheet.cols}, uniform fallback`); cols = null; }
    }
    if (!cols) { const pw = W / sheet.cols; cols = Array.from({ length: sheet.cols }, (_, c) => [Math.round(c * pw), Math.round((c + 1) * pw) - 1]); }
    for (let c = 0; c < cols.length; c++) {
      const name = sheet.names[r * sheet.cols + c];
      if (!name) continue;
      const [x0, x1] = cols[c];
      const buf = await sharp(src).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).png().toBuffer();
      await sharp(buf).trim({ threshold: 8 }).resize({ width: 96, height: 96, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90, alphaQuality: 92 }).toFile(path.join(OUT_UI, `${sheet.prefix}_${name}.webp`));
      n++;
    }
  }
  console.log('dom sheet', sheet.prefix, n);
}

// 로고(트림) + 아이콘 시트(균등 셀 → 트림 → 96px) → public/assets/ui
async function buildUi() {
  await mkdir(OUT_UI, { recursive: true });
  await sharp(path.join(SRC_UI, UI_LOGO.file)).trim({ threshold: 8 }).webp({ quality: 90, alphaQuality: 92 }).toFile(path.join(OUT_UI, `${UI_LOGO.id}.webp`));
  console.log('ui', UI_LOGO.id);
  const src = path.join(SRC_UI, UI_ICON_SHEET.file);
  const { width } = await sharp(src).metadata();
  const cell = Math.floor(width / UI_ICON_SHEET.cols); // 정사각 셀
  for (let i = 0; i < UI_ICON_SHEET.names.length; i++) {
    const c = i % UI_ICON_SHEET.cols;
    const r = Math.floor(i / UI_ICON_SHEET.cols);
    // sharp는 trim을 extract보다 먼저 적용하므로 셀을 먼저 잘라 버퍼로 뺀다
    const cellBuf = await sharp(src).extract({ left: c * cell, top: r * cell, width: cell, height: cell }).png().toBuffer();
    await sharp(cellBuf)
      .trim({ threshold: 8 })
      .resize({ width: 96, height: 96, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, alphaQuality: 92 })
      .toFile(path.join(OUT_UI, `icon_${UI_ICON_SHEET.names[i]}.webp`));
  }
  console.log('ui icons', UI_ICON_SHEET.names.length);
}

async function main() {
  await mkdir(OUT_SP, { recursive: true });
  await mkdir(OUT_PT, { recursive: true });
  const only = process.argv[2]; // ui → UI만, v2 → 새 배경·시트만
  if (only === 'ui') {
    await buildUi();
    console.log('done');
    return;
  }
  if (only === 'dom') {
    for (const d of DOM_SHEETS) await buildDomSheet(d);
    console.log('done');
    return;
  }
  if (only === 'v2') { // 새로 추가된 것만
    for (const d of DOM_SHEETS) await buildDomSheet(d);
    for (const bg of BACKGROUNDS.slice(-6)) { const src = path.join(SRC_BG, bg.file); await sharp(src).webp({ quality: 82 }).toFile(path.join(OUT_BG, `${bg.id}.webp`)); await sharp(src).resize(640).blur(6).webp({ quality: 70 }).toFile(path.join(OUT_BG, `${bg.id}_blur.webp`)); console.log('bg', bg.id); }
    await buildSheet(SHEETS[SHEETS.length - 1]);
    for (const g of GRIDS) await buildGrid(g);
    console.log('done');
    return;
  }
  await buildBackgrounds();
  for (const s of SHEETS) await buildSheet(s);
  for (const g of GRIDS) await buildGrid(g);
  for (const d of DOM_SHEETS) await buildDomSheet(d);
  await buildUi();
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
