import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root = 'public/assets/sprites';
const sheets = ['char_brown_boy', 'char_pink_girl', 'char_glasses_boy', 'char_blond_explorer', 'pet_cat', 'pet_rabbit', 'pet_dragon', 'pet_squirrel'];
for (const sheet of sheets) {
  const kept = sheet.startsWith('char_') ? ['idle_front', 'cheer'] : ['idle_front', 'idle_right', 'cheer'];
  const original = JSON.parse(fs.readFileSync(path.join(root, `${sheet}.json`), 'utf8'));
  let width = 2;
  const height = Math.max(...kept.map((key) => original.frames[key].frame.h)) + 4;
  const placements = [];
  const frames = {};
  for (const key of kept) {
    const frame = structuredClone(original.frames[key]);
    const rect = frame.frame;
    const input = await sharp(path.join(root, `${sheet}.webp`)).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).ensureAlpha().raw().toBuffer();
    placements.push({ input, left: width, top: 2, width: rect.w, height: rect.h });
    frame.frame = { ...rect, x: width, y: 2 };
    frames[key] = frame;
    width += rect.w + 2;
  }
  // Player/Pet register all shared animation names, but Home never walks or attacks.
  // Aliases keep that interface complete without downloading unused combat pixels.
  for (const key of Object.keys(original.frames)) if (!frames[key]) frames[key] = structuredClone(frames.idle_front);
  // Copy raw pixels rather than alpha compositing, which can introduce rounding at soft edges.
  const packed = Buffer.alloc(width * height * 4);
  for (const placement of placements) for (let y = 0; y < placement.height; y++) {
    placement.input.copy(packed, ((placement.top + y) * width + placement.left) * 4, y * placement.width * 4, (y + 1) * placement.width * 4);
  }
  await sharp(packed, { raw: { width, height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toFile(path.join(root, `${sheet}_home.webp`));
  fs.writeFileSync(path.join(root, `${sheet}_home.json`), JSON.stringify({ frames, meta: { app: 'typing-adventure home atlas', image: `${sheet}_home.webp`, size: { w: width, h: height }, scale: '1', source: `${sheet}.webp`, keptFrames: kept } }));
  // Visible RGBA pixels retain the same dimensions and positions after packing.
  for (const key of kept) {
    const a = original.frames[key].frame, b = frames[key].frame;
    const before = await sharp(path.join(root, `${sheet}.webp`)).extract({ left: a.x, top: a.y, width: a.w, height: a.h }).ensureAlpha().raw().toBuffer();
    const after = await sharp(path.join(root, `${sheet}_home.webp`)).extract({ left: b.x, top: b.y, width: b.w, height: b.h }).ensureAlpha().raw().toBuffer();
    for (let i = 0; i < before.length; i += 4) {
      assert.equal(after[i + 3], before[i + 3], `${sheet}/${key}: alpha`);
      if (before[i + 3]) assert.deepEqual(after.subarray(i, i + 3), before.subarray(i, i + 3), `${sheet}/${key}: visible RGB`);
    }
  }
  console.log(`${sheet}: ${fs.statSync(path.join(root, `${sheet}.webp`)).size} → ${fs.statSync(path.join(root, `${sheet}_home.webp`)).size} bytes, ${kept.length} used poses pixel-verified`);
}
