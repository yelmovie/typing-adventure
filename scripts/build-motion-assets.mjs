import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = [
  ['char_attack_ko_v1', 'character-attack-ko-v1.png'],
  ['char_walk_v1', 'character-walk-v1.png'],
  ['pet_walk_v1', 'pet-walk-v1.png'],
];
const size = 320;
const report = [];
await fs.mkdir(path.join(root, 'public/assets/sprites'), { recursive: true });
for (const [id, source] of entries) {
  const input = path.join(root, 'assets/character', source);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Generated originals are preserved. Remove only their specified chroma matte
  // during sprite packing; do not repaint faces, letters, clothes or limbs.
  let removed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = data.subarray(i, i + 3);
    if (r > 160 && b > 160 && g < 130 && r - g > 90 && b - g > 90) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0; removed++;
    }
  }
  if (removed / (info.width * info.height) < 0.2) throw new Error(`${id}: expected magenta matte missing`);
  const keyed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const cells = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const left = Math.round(col * info.width / 4), top = Math.round(row * info.height / 4);
    const width = Math.round((col + 1) * info.width / 4) - left;
    const height = Math.round((row + 1) * info.height / 4) - top;
    const pixels = await sharp(keyed).extract({ left, top, width, height }).resize(size, size, { kernel: 'nearest' }).raw().toBuffer();
    let x0 = size, y0 = size, x1 = 0, y1 = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (pixels[(y * size + x) * 4 + 3] > 32) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x1 - x0 < 20 || y1 - y0 < 20) throw new Error(`${id} ${col},${row}: empty frame`);
    if (Math.min(x0, y0, size - 1 - x1, size - 1 - y1) < 8) throw new Error(`${id} ${col},${row}: illustration crosses the sprite safety gutter`);
    let footMin = size, footMax = 0;
    for (let y = Math.max(y0, y1 - 14); y <= y1; y++) for (let x = x0; x <= x1; x++) if (pixels[(y * size + x) * 4 + 3] > 96) {
      footMin = Math.min(footMin, x); footMax = Math.max(footMax, x);
    }
    const png = await sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
    cells.push({ row, col, png, x0, y0, x1, y1, footX: (footMin + footMax) / 2 });
  }
  const frames = {}, composites = [];
  for (const c of cells) {
    const row = cells.filter(frame => frame.row === c.row);
    const first = row[0];
    const anchors = row.map(frame => frame.footX).sort((a, b) => a - b);
    // Fixed row x-anchor prevents planted feet drifting as the limbs alternate.
    const footX = (anchors[1] + anchors[2]) / 2;
    const name = `c${c.col}_r${c.row}`;
    frames[name] = {
      frame: { x: c.col * size, y: c.row * size, w: size, h: size },
      rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: size, h: size }, sourceSize: { w: size, h: size },
      customData: { bodyHeight: first.y1 - first.y0 + 1, foot: { x: footX, y: c.y1 + 1 } },
    };
    composites.push({ input: c.png, left: c.col * size, top: c.row * size });
  }
  const output = path.join(root, 'public/assets/sprites', id);
  await sharp({ create: { width: size * 4, height: size * 4, channels: 4, background: '#00000000' } })
    .composite(composites).webp({ quality: 92, alphaQuality: 100 }).toFile(`${output}.webp`);
  await fs.writeFile(`${output}.json`, JSON.stringify({ frames, meta: { app: 'typing-adventure motion packing', image: `${id}.webp`, size: { w: size * 4, h: size * 4 }, scale: '1', source } }));
  report.push({ id, source, frames: 16, bytes: (await fs.stat(`${output}.webp`)).size, matteRemoved: removed, bounds: cells.map(({ row, col, x0, y0, x1, y1 }) => ({ row, col, x0, y0, x1, y1 })) });
}
await fs.mkdir(path.join(root, 'tmp/motion-v2'), { recursive: true });
await fs.writeFile(path.join(root, 'tmp/motion-v2/asset-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.map(({ bounds, ...entry }) => entry), null, 2));
