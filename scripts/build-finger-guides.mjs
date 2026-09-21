import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = path.resolve('scripts/assets/finger-shadow-sheet.webp');
const outputDir = path.resolve('public/assets/ui/fingers');
const names = [
  'left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-thumb',
  'right-thumb', 'right-index', 'right-middle', 'right-ring', 'right-pinky',
];

const meta = await sharp(source).metadata();
if (!meta.width || !meta.height) throw new Error('손가락 원본 시트 크기를 읽지 못했습니다.');
await fs.mkdir(outputDir, { recursive: true });

for (let row = 0; row < 2; row++) {
  for (let column = 0; column < 5; column++) {
    const left = Math.floor((meta.width * column) / 5);
    const top = Math.floor((meta.height * row) / 2);
    // A one-pixel safety inset avoids libvips rejecting a crop that lands on
    // the generated PNG's fractional final grid boundary.
    const right = Math.min(meta.width - 1, Math.floor((meta.width * (column + 1)) / 5));
    const bottom = Math.min(meta.height - 1, Math.floor((meta.height * (row + 1)) / 2));
    const name = names[row * 5 + column];
    const tile = await sharp(source)
      .extract({ left, top, width: right - left, height: bottom - top })
      .png()
      .toBuffer();
    await sharp(tile)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
      .resize(360, 190, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ lossless: true, quality: 92 })
      .toFile(path.join(outputDir, `${name}.webp`));
  }
}

console.log(`PASS finger guides: ${names.length} transparent assets`);
