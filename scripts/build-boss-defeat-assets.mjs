import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'assets/character/keyboard-golem-defeat-v1.png');
const outBase = path.join(root, 'public/assets/sprites/mon_keyboard_golem_defeat');
const columns = 3;
const rows = 2;
const frameCount = columns * rows;

const metadata = await sharp(source).metadata();
if (!metadata.width || !metadata.height || metadata.width % columns || metadata.height % rows) {
  throw new Error(`Boss defeat sheet must divide evenly into ${columns}x${rows}: ${metadata.width}x${metadata.height}`);
}
if (!metadata.hasAlpha) throw new Error('Boss defeat sheet must preserve a transparent alpha channel.');

const frameWidth = metadata.width / columns;
const frameHeight = metadata.height / rows;
await sharp(source)
  .webp({ quality: 94, alphaQuality: 100, effort: 6 })
  .toFile(`${outBase}.webp`);

const frames = {};
for (let index = 0; index < frameCount; index++) {
  const col = index % columns;
  const row = Math.floor(index / columns);
  frames[`defeat_${index}`] = {
    frame: { x: col * frameWidth, y: row * frameHeight, w: frameWidth, h: frameHeight },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
    sourceSize: { w: frameWidth, h: frameHeight },
  };
}

const atlas = {
  frames,
  meta: {
    app: 'typing-adventure boss defeat atlas',
    image: 'mon_keyboard_golem_defeat.webp',
    format: 'RGBA8888',
    size: { w: metadata.width, h: metadata.height },
    scale: '1',
    source: 'assets/character/keyboard-golem-defeat-v1.png',
  },
};
await fs.writeFile(`${outBase}.json`, JSON.stringify(atlas));

const output = await sharp(`${outBase}.webp`).metadata();
console.log(JSON.stringify({
  atlas: path.relative(root, outBase),
  source: path.relative(root, source),
  frames: frameCount,
  frameSize: `${frameWidth}x${frameHeight}`,
  output: `${output.width}x${output.height}`,
  alpha: output.hasAlpha,
}, null, 2));
