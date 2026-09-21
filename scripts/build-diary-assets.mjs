import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'src/game/data/practiceSentences.ts'), 'utf8');
const outDir = path.join(ROOT, 'public/assets/ui/diaries');
fs.mkdirSync(outDir, { recursive: true });

const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const extract = (name) => {
  const block = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  if (!block) throw new Error(`${name} not found`);
  return [...block[1].matchAll(/`([\s\S]*?)`/g)].map((match) => match[1]);
};
const wrap = (text, maxUnits) => {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = '';
  const units = (value) => [...value].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 1.7 : 1), 0);
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && units(candidate) > maxUnits) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
};

const stories = { ko: extract('KO_CHARACTER_PRACTICE_STORIES'), en: extract('EN_CHARACTER_PRACTICE_STORIES') };
const configs = [
  { id: 'haneul', portrait: 'char_brown_boy.webp', koName: '하늘', enName: 'Haneul', koFont: '휴먼매직체', enFont: 'Comic Sans MS', ink: '#24537a', accent: '#e14b48', paper: '#fff3cf', doodle: '★  ☁  →' },
  { id: 'bora', portrait: 'char_pink_girl.webp', koName: '보라', enName: 'Bora', koFont: 'HY엽서M', enFont: 'Ink Free', ink: '#7d3d79', accent: '#ee74a5', paper: '#fff0de', doodle: '♡  ✦  ♫' },
  { id: 'jiho', portrait: 'char_glasses_boy.webp', koName: '지호', enName: 'Jiho', koFont: 'HY견명조', enFont: 'Lucida Handwriting', ink: '#31596d', accent: '#4e93a5', paper: '#f2efd5', doodle: '△  ?  ✎' },
  { id: 'luca', portrait: 'char_blond_explorer.webp', koName: '루카', enName: 'Luca', koFont: 'HY그래픽M', enFont: 'Poor Richard', ink: '#6d4a25', accent: '#d79a35', paper: '#f8e4b9', doodle: '↗  ✦  ⌖' },
];

for (const language of ['ko', 'en']) {
  for (let index = 0; index < configs.length; index++) {
    const cfg = configs[index];
    const story = stories[language][index];
    const firstPeriod = story.indexOf('.');
    const title = firstPeriod >= 0 ? story.slice(0, firstPeriod) : `${language === 'ko' ? cfg.koName : cfg.enName}'s Diary`;
    const body = firstPeriod >= 0 ? story.slice(firstPeriod + 1).trim() : story;
    const font = language === 'ko' ? cfg.koFont : cfg.enFont;
    const lines = wrap(body, language === 'ko' ? 58 : 56);
    const fontSize = language === 'en' ? (lines.length > 27 ? 20 : 22) : lines.length > 32 ? 22 : lines.length > 29 ? 24 : 27;
    const lineHeight = lines.length > 30 ? 33 : 39;
    if (lines.length > 36) throw new Error(`${language}-${cfg.id} has ${lines.length} lines`);
    const ruled = Array.from({ length: 36 }, (_, i) => `<line x1="112" y1="${382 + i * lineHeight}" x2="1088" y2="${382 + i * lineHeight}" stroke="#8fb4c0" stroke-opacity=".32" stroke-width="2"/>`).join('');
    const handwritten = lines.map((line, i) => {
      const jitter = ((i * 7 + index * 5) % 9) - 4;
      const angle = (((i + index) % 5) - 2) * .08;
      return `<text x="${128 + jitter}" y="${370 + i * lineHeight}" fill="${cfg.ink}" font-family="${escapeXml(font)}" font-size="${fontSize}" transform="rotate(${angle} 600 ${370 + i * lineHeight})">${escapeXml(line)}</text>`;
    }).join('');
    const svg = `
      <svg width="1200" height="1600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#271a12" flood-opacity=".28"/></filter>
          <filter id="paper"><feTurbulence baseFrequency=".7" numOctaves="2" seed="${index + (language === 'en' ? 11 : 2)}" type="fractalNoise" result="noise"/><feColorMatrix in="noise" type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .045"/></feComponentTransfer></filter>
        </defs>
        <rect width="1200" height="1600" fill="#21313b" fill-opacity="0"/>
        <path d="M66 68 Q80 42 112 52 L1102 62 Q1142 66 1132 108 L1141 1510 Q1136 1548 1098 1540 L94 1548 Q55 1545 64 1504 Z" fill="${cfg.paper}" stroke="#c8a96c" stroke-width="9" filter="url(#shadow)"/>
        <path d="M88 95 Q340 72 594 91 T1110 92" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="5"/>
        <rect x="76" y="74" width="1055" height="1468" rx="24" fill="#fff" filter="url(#paper)"/>
        <line x1="104" y1="322" x2="1095" y2="322" stroke="${cfg.accent}" stroke-opacity=".6" stroke-width="5"/>
        <line x1="188" y1="110" x2="188" y2="1508" stroke="#dc7474" stroke-opacity=".34" stroke-width="3"/>
        ${ruled}
        <g transform="rotate(-2 430 190)">
          <rect x="102" y="110" width="650" height="150" rx="16" fill="#fffaf0" fill-opacity=".78" stroke="${cfg.accent}" stroke-opacity=".32" stroke-width="3"/>
          <text x="132" y="177" fill="${cfg.ink}" font-family="${escapeXml(font)}" font-size="${language === 'en' ? 36 : 48}">${escapeXml(title)}</text>
          <text x="135" y="229" fill="${cfg.accent}" font-family="${escapeXml(font)}" font-size="25">${language === 'ko' ? `${cfg.koName}가 쓰고 간직한 모험 기록` : `${cfg.enName}'s own adventure memory`}</text>
        </g>
        <text x="900" y="296" fill="${cfg.accent}" font-family="${escapeXml(font)}" font-size="28">${escapeXml(cfg.doodle)}</text>
        ${handwritten}
        <text x="845" y="1498" fill="${cfg.accent}" font-family="${escapeXml(font)}" font-size="30">${language === 'ko' ? `- ${cfg.koName} 씀 -` : `- written by ${cfg.enName} -`}</text>
        <g fill="#d8b679"><circle cx="95" cy="180" r="13"/><circle cx="95" cy="440" r="13"/><circle cx="95" cy="700" r="13"/><circle cx="95" cy="960" r="13"/><circle cx="95" cy="1220" r="13"/><circle cx="95" cy="1450" r="13"/></g>
      </svg>`;
    const portrait = await sharp(path.join(ROOT, 'public/assets/portraits', cfg.portrait)).trim().resize({ height: 172 }).png().toBuffer();
    await sharp(Buffer.from(svg)).composite([{ input: portrait, left: 900, top: 100 }]).webp({ quality: 90, alphaQuality: 95 }).toFile(path.join(outDir, `${language}-${cfg.id}.webp`));
  }
}

const letterSvg = `
  <svg width="1400" height="820" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#3e2711" flood-opacity=".35"/></filter><filter id="n"><feTurbulence baseFrequency=".45" numOctaves="3" seed="17" result="noise"/><feComponentTransfer><feFuncA type="table" tableValues="0 .07"/></feComponentTransfer></filter></defs>
    <path d="M88 89 Q105 48 156 65 Q340 34 532 63 Q742 38 932 62 Q1150 39 1316 83 L1289 724 Q1279 778 1218 760 Q1015 790 801 764 Q576 792 382 763 Q208 788 103 748 Q76 520 88 89Z" fill="#f4dd9b" fill-opacity=".9" stroke="#b7873d" stroke-width="10" filter="url(#s)"/>
    <path d="M120 119 Q350 91 594 111 T1270 108" fill="none" stroke="#fff5ce" stroke-opacity=".7" stroke-width="8"/>
    <rect x="100" y="78" width="1200" height="690" rx="34" fill="#fff" filter="url(#n)"/>
    <path d="M157 198 H1192 M157 292 H1192 M157 386 H1192 M157 480 H1192 M157 574 H1192" stroke="#9c7950" stroke-opacity=".23" stroke-width="3"/>
    <path d="M198 122 C178 184 180 632 208 708" fill="none" stroke="#bd5f55" stroke-opacity=".35" stroke-width="4"/>
    <g transform="translate(1190 650) rotate(-8)"><circle r="72" fill="#9e2f32" stroke="#6b1d25" stroke-width="9"/><path d="M-28 4 L-4 28 L38 -25" fill="none" stroke="#e5b967" stroke-width="11" stroke-linecap="round"/></g>
  </svg>`;
await sharp(Buffer.from(letterSvg)).webp({ quality: 92, alphaQuality: 96 }).toFile(path.join(ROOT, 'public/assets/ui/adventurer-letter.webp'));

console.log('Built 8 diary pages and adventurer-letter.webp');
