// 효과음 자체 합성 → public/assets/audio/sfx_*.wav (16-bit mono 44.1kHz)
// 외부 음원 없이 칩튠 스타일로 만든다. 실행: npm run sfx
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio');

// ---- 기본 빌딩블록 ----
const TAU = Math.PI * 2;
const osc = {
  sine: (p) => Math.sin(TAU * p),
  square: (p) => (p % 1 < 0.5 ? 1 : -1),
  saw: (p) => 2 * (p % 1) - 1,
  tri: (p) => 1 - 4 * Math.abs(Math.round(p - 0.25) - (p - 0.25)),
  pulse: (p) => (p % 1 < 0.25 ? 1 : -1),
};
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

/** 톤 하나: f0→f1 주파수 스윕, attack/decay 엔벨로프 */
function tone(buf, { t = 0, dur, f0, f1 = f0, wave = 'square', gain = 0.3, attack = 0.005, curve = 2, vib = 0 }) {
  const n = Math.floor(dur * SR);
  const s0 = Math.floor(t * SR);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const f = f0 * Math.pow(f1 / f0, x) * (1 + vib * Math.sin(TAU * 6 * i / SR));
    phase += f / SR;
    const env = Math.min(1, i / (attack * SR)) * Math.pow(1 - x, curve);
    if (s0 + i < buf.length) buf[s0 + i] += osc[wave](phase) * env * gain;
  }
}
/** 노이즈: 저역 통과 정도(lp 0~1), 감쇠 */
function noise(buf, { t = 0, dur, gain = 0.3, lp = 0.2, curve = 3 }) {
  const n = Math.floor(dur * SR);
  const s0 = Math.floor(t * SR);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += (rnd() - y) * lp;
    const env = Math.pow(1 - i / n, curve);
    if (s0 + i < buf.length) buf[s0 + i] += y * env * gain;
  }
}
const note = (semi) => 440 * Math.pow(2, (semi - 9) / 12); // 0 = C4

function wav(buf) {
  // 소프트 리미터 + 16bit
  const pcm = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const v = Math.tanh(buf[i] * 1.2);
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  const data = Buffer.from(pcm.buffer);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const make = (dur, fn) => { const b = new Float32Array(Math.ceil(dur * SR)); fn(b); return b; };

// ---- 소리 설계 ----
const SFX = {
  // 음절 약공격: 아주 짧은 톡 (콤보에 따라 코드에서 pitch 올림)
  tap: make(0.09, (b) => { tone(b, { dur: 0.06, f0: 1100, f1: 1500, wave: 'pulse', gain: 0.22, curve: 3 }); noise(b, { dur: 0.03, gain: 0.12, lp: 0.6, curve: 4 }); }),
  // 낱말 완성 강공격: 펀치 + 링
  hit: make(0.28, (b) => { noise(b, { dur: 0.06, gain: 0.5, lp: 0.5, curve: 3 }); tone(b, { dur: 0.16, f0: 220, f1: 60, wave: 'sine', gain: 0.6, curve: 2 }); tone(b, { t: 0.01, dur: 0.14, f0: 660, f1: 880, wave: 'square', gain: 0.16, curve: 3 }); tone(b, { t: 0.05, dur: 0.2, f0: 1320, wave: 'tri', gain: 0.12, curve: 4 }); }),
  // PERFECT: 반짝 아르페지오
  perfect: make(0.55, (b) => { [0, 4, 7, 12].forEach((s, i) => tone(b, { t: i * 0.07, dur: 0.32, f0: note(24 + s), wave: 'tri', gain: 0.22, curve: 3 })); noise(b, { t: 0.2, dur: 0.3, gain: 0.05, lp: 0.9, curve: 2 }); tone(b, { t: 0.28, dur: 0.27, f0: note(36), wave: 'sine', gain: 0.15, curve: 3 }); }),
  // 오답: 낮은 붕 + 살짝 흔들림
  miss: make(0.3, (b) => { tone(b, { dur: 0.28, f0: 240, f1: 120, wave: 'saw', gain: 0.22, curve: 2, vib: 0.03 }); tone(b, { dur: 0.2, f0: 160, f1: 90, wave: 'square', gain: 0.1, curve: 2 }); }),
  // 플레이어 피격: 크런치
  hurt: make(0.32, (b) => { noise(b, { dur: 0.12, gain: 0.5, lp: 0.25, curve: 2 }); tone(b, { dur: 0.3, f0: 180, f1: 50, wave: 'square', gain: 0.3, curve: 2 }); }),
  // 5콤보마다
  combo: make(0.4, (b) => { [0, 4, 7].forEach((s, i) => tone(b, { t: i * 0.08, dur: 0.22, f0: note(19 + s), wave: 'square', gain: 0.16, curve: 3 })); }),
  // FEVER 진입: 상승 스윕 + 팡파르
  fever: make(1.1, (b) => { tone(b, { dur: 0.35, f0: 200, f1: 1600, wave: 'saw', gain: 0.18, curve: 1 }); noise(b, { dur: 0.35, gain: 0.15, lp: 0.7, curve: 1 }); [0, 4, 7, 12, 16, 19].forEach((s, i) => { tone(b, { t: 0.3 + i * 0.09, dur: 0.5, f0: note(24 + s), wave: 'square', gain: 0.14, curve: 3 }); tone(b, { t: 0.3 + i * 0.09, dur: 0.5, f0: note(12 + s), wave: 'tri', gain: 0.12, curve: 3 }); }); noise(b, { t: 0.75, dur: 0.35, gain: 0.08, lp: 0.9, curve: 2 }); }),
  // 코인
  coin: make(0.45, (b) => { tone(b, { dur: 0.08, f0: 1319, wave: 'square', gain: 0.2, curve: 1 }); tone(b, { t: 0.08, dur: 0.35, f0: 1760, wave: 'square', gain: 0.2, curve: 3 }); tone(b, { t: 0.08, dur: 0.35, f0: 3520, wave: 'sine', gain: 0.06, curve: 3 }); }),
  // 폭탄: 붐
  bomb: make(0.7, (b) => { noise(b, { dur: 0.5, gain: 0.7, lp: 0.12, curve: 2 }); tone(b, { dur: 0.6, f0: 140, f1: 35, wave: 'sine', gain: 0.8, curve: 1.5 }); noise(b, { dur: 0.08, gain: 0.5, lp: 0.8, curve: 3 }); }),
  // 몬스터 처치: 하강 + 푸슉
  defeat: make(0.6, (b) => { [12, 9, 5, 0].forEach((s, i) => tone(b, { t: i * 0.08, dur: 0.2, f0: note(12 + s), wave: 'square', gain: 0.16, curve: 2 })); noise(b, { t: 0.25, dur: 0.35, gain: 0.25, lp: 0.15, curve: 2 }); }),
  // 스테이지 클리어 팡파르
  clear: make(1.6, (b) => { const mel = [[0, 0.12], [0, 0.12], [0, 0.12], [4, 0.3], [2, 0.12], [4, 0.12], [7, 0.6]]; let t = 0; for (const [s, d] of mel) { tone(b, { t, dur: d + 0.1, f0: note(24 + s), wave: 'square', gain: 0.16, curve: 2 }); tone(b, { t, dur: d + 0.1, f0: note(12 + s), wave: 'tri', gain: 0.14, curve: 2 }); tone(b, { t, dur: d + 0.1, f0: note(s), wave: 'saw', gain: 0.06, curve: 2 }); t += d; } noise(b, { t: 1.0, dur: 0.6, gain: 0.08, lp: 0.9, curve: 2 }); }),
  // 별 점등: 종
  star: make(0.7, (b) => { tone(b, { dur: 0.6, f0: note(31), wave: 'sine', gain: 0.25, curve: 2.5 }); tone(b, { dur: 0.5, f0: note(31) * 2.76, wave: 'sine', gain: 0.08, curve: 4 }); tone(b, { t: 0.1, dur: 0.6, f0: note(38), wave: 'sine', gain: 0.18, curve: 2.5 }); }),
  countdown: make(0.2, (b) => tone(b, { dur: 0.18, f0: 440, wave: 'square', gain: 0.18, curve: 2 })),
  go: make(0.5, (b) => { tone(b, { dur: 0.15, f0: 660, wave: 'square', gain: 0.18, curve: 1.5 }); tone(b, { t: 0.12, dur: 0.38, f0: 880, wave: 'square', gain: 0.2, curve: 2 }); tone(b, { t: 0.12, dur: 0.38, f0: 1760, wave: 'tri', gain: 0.08, curve: 2 }); }),
  click: make(0.08, (b) => { tone(b, { dur: 0.06, f0: 900, f1: 700, wave: 'tri', gain: 0.2, curve: 3 }); noise(b, { dur: 0.02, gain: 0.1, lp: 0.7, curve: 4 }); }),
};

await mkdir(OUT, { recursive: true });
for (const [name, buf] of Object.entries(SFX)) {
  await writeFile(path.join(OUT, `sfx_${name}.wav`), wav(buf));
  console.log('sfx', name, `${(buf.length / SR).toFixed(2)}s`);
}
console.log('done');
