import type { BattleResult, ContentUnit, LearningAttempt, LearningFocus, LearningPattern, LearningProgress, LearningSession, SaveData } from '../types';

export const PATTERN_INFO: Record<LearningPattern, { name: string; hint: string }> = {
  letters: { name: '글자 순서', hint: '한 글자씩 소리 내어 읽고, 같은 순서로 입력해 보세요.' },
  batchim: { name: '받침', hint: '글자 아래의 받침까지 살펴보세요. 다음 글자로 가기 전에 확인해요.' },
  vowel: { name: '모음', hint: '비슷한 모양의 모음을 천천히 비교해 보세요.' },
  spacing: { name: '띄어쓰기', hint: '낱말 사이 빈칸도 글의 일부예요. Space를 한 번 눌러요.' },
  punctuation: { name: '문장부호', hint: '문장 끝의 마침표, 물음표, 느낌표까지 확인해요.' },
};
const punctuation = /[.,!?;:'"“”‘’…]/g;
const compact = (text: string) => text.replace(/\s/g, '');
const syllable = (char: string) => {
  const n = char.charCodeAt(0) - 0xac00;
  return n >= 0 && n <= 11171 ? { first: Math.floor(n / 588), vowel: Math.floor(n / 28) % 21, last: n % 28 } : null;
};
export function errorPattern(target: string, typed: string): LearningPattern {
  if (target !== typed && compact(target) === compact(typed)) return 'spacing';
  if (target !== typed && target.replace(punctuation, '') === typed.replace(punctuation, '')) return 'punctuation';
  for (let i = 0; i < Math.min(target.length, typed.length); i++) {
    const a = syllable(target[i]), b = syllable(typed[i]);
    if (!a || !b || a.first !== b.first) continue;
    if (a.vowel === b.vowel && a.last !== b.last) return 'batchim';
    if (a.vowel !== b.vowel) return 'vowel';
  }
  return 'letters';
}
export function patternsIn(text: string): LearningPattern[] {
  const out: LearningPattern[] = ['letters'];
  if (/\s/.test(text)) out.push('spacing');
  if (/[.,!?;:'"“”‘’…]/.test(text)) out.push('punctuation');
  if ([...text].some((c) => (syllable(c)?.last ?? 0) > 0)) out.push('batchim');
  if ([...text].some((c) => [9, 10, 11, 14, 15, 16, 19].includes(syllable(c)?.vowel ?? -1))) out.push('vowel');
  return out;
}
export function learningOf(save: SaveData): LearningProgress {
  const learning = save.records.learning ??= { patterns: {}, recent: [], seen: [] };
  for (const focus of Object.values(learning.patterns)) {
    if (!focus || focus.pendingTargets !== undefined) continue;
    // 이전 저장은 누적 근거를 유지한다. 이미 교정하고 다른 글 2개에 적용했다면 다시 원문을 강요하지 않는다.
    const corrected = focus.corrections >= focus.mistakes && focus.corrections > 0;
    focus.pendingTargets = corrected || !focus.lastTarget ? [] : [focus.lastTarget];
    focus.transferTargets ??= [];
    if (corrected && focus.newSuccesses >= 2) focus.resolvedAt ??= new Date().toISOString();
  }
  return learning;
}
export function needsCorrection(save: SaveData, target: string): boolean {
  return Object.values(learningOf(save).patterns).some((focus) => focus?.pendingTargets?.includes(target.normalize('NFC')));
}
/** Local, bounded evidence. A repeated corrected word is not counted as a new-text success. */
export function recordLearning(save: SaveData, attempts: LearningAttempt[], session: Omit<LearningSession, 'newSuccesses'>): LearningSession {
  const learning = learningOf(save), seen = new Set(learning.seen);
  const mistakesThisRun = new Set<string>();
  const correctedTargets = new Set<string>();
  let newSuccesses = 0;
  for (const attempt of attempts) {
    const target = attempt.target.normalize('NFC');
    if (attempt.outcome === 'wrong') {
      const pattern = errorPattern(target, attempt.typed);
      const f: LearningFocus = learning.patterns[pattern] ?? { mistakes: 0, corrections: 0, newSuccesses: 0, delayedSuccesses: 0, lastTarget: '', lastTyped: '', lastErrorAt: session.at, pendingTargets: [], transferTargets: [] };
      if (!f.pendingTargets?.includes(target)) f.mistakes++;
      f.pendingTargets = [...new Set([...(f.pendingTargets ?? []), target])].slice(-10);
      f.transferTargets = [];
      delete f.resolvedAt;
      f.lastTarget = target;
      f.lastTyped = attempt.typed.slice(0, 600);
      f.lastErrorAt = session.at;
      learning.patterns[pattern] = f;
      mistakesThisRun.add(target);
    }
    if (attempt.outcome === 'correct') {
      let newCounted = false;
      for (const [pattern, focus] of Object.entries(learning.patterns) as [LearningPattern, LearningFocus][]) {
        if (focus.pendingTargets?.includes(target)) {
          focus.corrections++;
          focus.pendingTargets = focus.pendingTargets.filter((text) => text !== target);
          correctedTargets.add(target);
        }
        if (!seen.has(target) && !mistakesThisRun.has(target) && !attempt.corrected && focus.lastTarget !== target && patternsIn(target).includes(pattern)) {
          focus.newSuccesses++;
          if (Date.parse(session.at) - Date.parse(focus.lastErrorAt) >= 3 * 86400000) focus.delayedSuccesses++;
          newCounted = true;
        }
        // 원문 교정 뒤 서로 다른 예시 2개에서 정확하게 적용하면 추천을 졸업한다.
        // 익숙한 글도 원문과 다른 예시가 될 수 있지만, '새 글' 누적 수에는 처음 본 글만 포함한다.
        if (!focus.resolvedAt && !focus.pendingTargets?.length && !mistakesThisRun.has(target) && !attempt.corrected && focus.lastTarget !== target && patternsIn(target).includes(pattern)) {
          focus.transferTargets = [...new Set([...(focus.transferTargets ?? []), target])].slice(-2);
          if (focus.transferTargets.length >= 2) focus.resolvedAt = session.at;
        }
      }
      if (newCounted) newSuccesses++;
    }
    seen.add(target);
  }
  learning.seen = [...seen].slice(-500);
  const result: LearningSession = { ...session, corrected: session.source === 'practice' ? correctedTargets.size : session.corrected, newSuccesses };
  learning.recent = [...learning.recent, result].slice(-60);
  return result;
}
export function recordBattleLearning(save: SaveData, result: BattleResult | Omit<BattleResult, 'stars' | 'newBadges' | 'isNewCpm' | 'isNewAccuracy' | 'isNewCombo' | 'isNewScore'>) {
  return recordLearning(save, result.learningAttempts ?? [], { at: new Date().toISOString(), stageId: result.stageId, source: 'game', accuracy: result.accuracy, cpm: result.cpm, correct: result.wordsDone, corrected: result.correctedCount ?? 0, skipped: result.skippedCount ?? 0 });
}
export function strongestFocus(save: SaveData): [LearningPattern, LearningFocus] | undefined {
  return (Object.entries(learningOf(save).patterns) as [LearningPattern, LearningFocus][]).filter(([, focus]) => !focus.resolvedAt).sort((a, b) => (b[1].pendingTargets?.length ?? 0) - (a[1].pendingTargets?.length ?? 0) || Date.parse(b[1].lastErrorAt) - Date.parse(a[1].lastErrorAt))[0];
}
export function practicePlan(save: SaveData, pool: ContentUnit[]): { pattern: LearningPattern; items: { text: string; novel: boolean }[] } {
  const focus = strongestFocus(save), pattern = focus?.[0] ?? 'letters', learning = learningOf(save);
  const seen = new Set(learning.seen);
  const original = focus?.[1].pendingTargets?.[0];
  const candidates = [...new Set(pool.map((u) => u.text))].filter((text) => text !== original && text !== focus?.[1].lastTarget && !focus?.[1].pendingTargets?.includes(text) && text.length <= (pattern === 'spacing' || pattern === 'punctuation' ? 60 : 12) && patternsIn(text).includes(pattern));
  candidates.sort((a, b) => Number(seen.has(a)) - Number(seen.has(b)) || a.length - b.length || a.localeCompare(b));
  return { pattern, items: [...(original ? [{ text: original, novel: false }] : []), ...candidates.slice(0, original ? 2 : 3).map((text) => ({ text, novel: !seen.has(text) }))] };
}
