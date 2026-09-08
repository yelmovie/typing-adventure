/**
 * 한글 유틸 — 분해(decomposition) 전용.
 * 조합(composition)은 절대 하지 않는다. 브라우저 IME가 담당.
 *  - 타수(키 입력 수) 계산: '타/분' 지표용
 *  - 다음에 눌러야 할 키 계산: 키보드 가이드용
 */

export interface KeyStroke {
  key: string; // 두벌식 자판에 표시되는 자모 (예: 'ㅗ')
  shift: boolean;
}

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

// 자모 → 두벌식 키 입력 시퀀스
const JAMO_KEYS: Record<string, KeyStroke[]> = {
  ㄱ: [{ key: 'ㄱ', shift: false }],
  ㄲ: [{ key: 'ㄱ', shift: true }],
  ㄴ: [{ key: 'ㄴ', shift: false }],
  ㄷ: [{ key: 'ㄷ', shift: false }],
  ㄸ: [{ key: 'ㄷ', shift: true }],
  ㄹ: [{ key: 'ㄹ', shift: false }],
  ㅁ: [{ key: 'ㅁ', shift: false }],
  ㅂ: [{ key: 'ㅂ', shift: false }],
  ㅃ: [{ key: 'ㅂ', shift: true }],
  ㅅ: [{ key: 'ㅅ', shift: false }],
  ㅆ: [{ key: 'ㅅ', shift: true }],
  ㅇ: [{ key: 'ㅇ', shift: false }],
  ㅈ: [{ key: 'ㅈ', shift: false }],
  ㅉ: [{ key: 'ㅈ', shift: true }],
  ㅊ: [{ key: 'ㅊ', shift: false }],
  ㅋ: [{ key: 'ㅋ', shift: false }],
  ㅌ: [{ key: 'ㅌ', shift: false }],
  ㅍ: [{ key: 'ㅍ', shift: false }],
  ㅎ: [{ key: 'ㅎ', shift: false }],
  ㅏ: [{ key: 'ㅏ', shift: false }],
  ㅐ: [{ key: 'ㅐ', shift: false }],
  ㅑ: [{ key: 'ㅑ', shift: false }],
  ㅒ: [{ key: 'ㅐ', shift: true }],
  ㅓ: [{ key: 'ㅓ', shift: false }],
  ㅔ: [{ key: 'ㅔ', shift: false }],
  ㅕ: [{ key: 'ㅕ', shift: false }],
  ㅖ: [{ key: 'ㅔ', shift: true }],
  ㅗ: [{ key: 'ㅗ', shift: false }],
  ㅛ: [{ key: 'ㅛ', shift: false }],
  ㅜ: [{ key: 'ㅜ', shift: false }],
  ㅠ: [{ key: 'ㅠ', shift: false }],
  ㅡ: [{ key: 'ㅡ', shift: false }],
  ㅣ: [{ key: 'ㅣ', shift: false }],
  ㅘ: [{ key: 'ㅗ', shift: false }, { key: 'ㅏ', shift: false }],
  ㅙ: [{ key: 'ㅗ', shift: false }, { key: 'ㅐ', shift: false }],
  ㅚ: [{ key: 'ㅗ', shift: false }, { key: 'ㅣ', shift: false }],
  ㅝ: [{ key: 'ㅜ', shift: false }, { key: 'ㅓ', shift: false }],
  ㅞ: [{ key: 'ㅜ', shift: false }, { key: 'ㅔ', shift: false }],
  ㅟ: [{ key: 'ㅜ', shift: false }, { key: 'ㅣ', shift: false }],
  ㅢ: [{ key: 'ㅡ', shift: false }, { key: 'ㅣ', shift: false }],
  ㄳ: [{ key: 'ㄱ', shift: false }, { key: 'ㅅ', shift: false }],
  ㄵ: [{ key: 'ㄴ', shift: false }, { key: 'ㅈ', shift: false }],
  ㄶ: [{ key: 'ㄴ', shift: false }, { key: 'ㅎ', shift: false }],
  ㄺ: [{ key: 'ㄹ', shift: false }, { key: 'ㄱ', shift: false }],
  ㄻ: [{ key: 'ㄹ', shift: false }, { key: 'ㅁ', shift: false }],
  ㄼ: [{ key: 'ㄹ', shift: false }, { key: 'ㅂ', shift: false }],
  ㄽ: [{ key: 'ㄹ', shift: false }, { key: 'ㅅ', shift: false }],
  ㄾ: [{ key: 'ㄹ', shift: false }, { key: 'ㅌ', shift: false }],
  ㄿ: [{ key: 'ㄹ', shift: false }, { key: 'ㅍ', shift: false }],
  ㅀ: [{ key: 'ㄹ', shift: false }, { key: 'ㅎ', shift: false }],
  ㅄ: [{ key: 'ㅂ', shift: false }, { key: 'ㅅ', shift: false }],
};

/** 문자 하나를 자모(호환 자모) 배열로 분해. 한글이 아니면 그대로 반환. */
export function decomposeChar(ch: string): string[] {
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const idx = code - 0xac00;
    const cho = Math.floor(idx / 588);
    const jung = Math.floor((idx % 588) / 28);
    const jong = idx % 28;
    const out = [CHO[cho], JUNG[jung]];
    if (jong > 0) out.push(JONG[jong]);
    return out;
  }
  if (code >= 0x3131 && code <= 0x318e) return [ch]; // 호환 자모 (조합 중 상태)
  return [ch];
}

/** 문자열 → 두벌식 키 입력 시퀀스 (공백/문장부호는 그대로 하나의 키) */
export function toKeySequence(text: string): KeyStroke[] {
  const out: KeyStroke[] = [];
  for (const ch of text.normalize('NFC')) {
    for (const j of decomposeChar(ch)) {
      const seq = JAMO_KEYS[j];
      if (seq) out.push(...seq);
      else {
        const upper = /[A-Z~!@#$%^&*()_+{}|:"<>?]/.test(j) && j !== ' ';
        out.push({ key: j, shift: upper });
      }
    }
  }
  return out;
}

/** 타수: 키 입력 수 (한글 '학교' = ㅎㅏㄱㄱㅛ = 5타) */
export function countStrokes(text: string): number {
  return toKeySequence(text).length;
}

/**
 * 다음에 눌러야 할 키 계산.
 *  - 현재 입력(조합 중 포함)을 키 시퀀스로 분해해 목표 시퀀스와 공통 접두어를 비교
 *  - 어긋났으면 backspace 안내
 */
export function nextKeyHint(target: string, current: string): { type: 'key'; stroke: KeyStroke } | { type: 'backspace' } | { type: 'enter' } | null {
  const t = toKeySequence(target);
  const c = toKeySequence(current);
  let i = 0;
  while (i < t.length && i < c.length && t[i].key === c[i].key && t[i].shift === c[i].shift) i++;
  if (i < c.length) return { type: 'backspace' };
  if (i >= t.length) return { type: 'enter' };
  return { type: 'key', stroke: t[i] };
}

/** 목표 대비 입력 상태를 문자 단위로 분류 (표시용) */
export function diffChars(target: string, current: string): { ch: string; state: 'done' | 'now' | 'todo' | 'bad' }[] {
  const t = [...target];
  const c = [...current];
  const out: { ch: string; state: 'done' | 'now' | 'todo' | 'bad' }[] = [];
  // 키 입력 순서 기준으로 아직 목표의 앞부분이면(예: '도전'을 치는 중 '돚') 틀린 것이 아니다
  if (c.length > 0 && isPrefixInput(target, current)) {
    const strokesTyped = toKeySequence(current).length;
    let acc = 0;
    for (let i = 0; i < t.length; i++) {
      const n = toKeySequence(t[i]).length;
      if (acc + n <= strokesTyped) out.push({ ch: t[i], state: 'done' });
      else if (acc < strokesTyped || acc === strokesTyped) out.push({ ch: t[i], state: acc === strokesTyped && out.every((o) => o.state === 'done') && i === out.length ? 'now' : acc < strokesTyped ? 'now' : 'todo' });
      else out.push({ ch: t[i], state: 'todo' });
      acc += n;
    }
    // 첫 'todo'를 'now'로 승격 (진행 중인 글자가 없을 때 다음 글자를 강조)
    if (!out.some((o) => o.state === 'now')) {
      const first = out.find((o) => o.state === 'todo');
      if (first) first.state = 'now';
    }
    return out;
  }
  let bad = false;
  for (let i = 0; i < t.length; i++) {
    if (i < c.length) {
      if (bad) out.push({ ch: t[i], state: 'bad' });
      else if (c[i] === t[i]) out.push({ ch: t[i], state: 'done' });
      else if (i === c.length - 1 && isPrefixJamo(t[i], c[i])) out.push({ ch: t[i], state: 'now' });
      else {
        bad = true;
        out.push({ ch: t[i], state: 'bad' });
      }
    } else out.push({ ch: t[i], state: i === c.length ? 'now' : 'todo' });
  }
  return out;
}

/** 조합 중 글자(cur)가 목표 글자(tgt)의 앞부분인지 (예: '하' ⊂ '학') */
export function isPrefixJamo(tgt: string, cur: string): boolean {
  const a = toKeySequence(tgt);
  const b = toKeySequence(cur);
  if (b.length > a.length) return false;
  for (let i = 0; i < b.length; i++) if (a[i].key !== b[i].key || a[i].shift !== b[i].shift) return false;
  return true;
}

export function isPrefixInput(target: string, current: string): boolean {
  const t = toKeySequence(target);
  const c = toKeySequence(current);
  if (c.length > t.length) return false;
  for (let i = 0; i < c.length; i++) if (t[i].key !== c[i].key || t[i].shift !== c[i].shift) return false;
  return true;
}
