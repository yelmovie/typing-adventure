import type { GameLanguage } from '../types';
import { KO_CHARACTER_PRACTICE_STORIES, KO_WORLD_PRACTICE_SENTENCES } from '../data/practiceSentences';
import { toKeySequence } from '../util/hangul';

export interface TutorialStep {
  title: string;
  instruction: string;
  hint: string;
  targets: string[];
  prefill?: string;
  resetOnMistake?: boolean;
  success: string;
  part: 'consonants' | 'vowels' | 'sentences' | 'story';
}

/** 입력 중인 문자열에서 목표와 정확히 일치하는 앞부분만 실시간 타수에 반영한다. */
export function correctPrefix(target: string, typed: string): string {
  const expected = [...target.normalize('NFC')];
  const actual = [...typed.normalize('NFC')];
  let index = 0;
  while (index < expected.length && index < actual.length && expected[index] === actual[index]) index++;
  return expected.slice(0, index).join('');
}

/** IME 조합 중인 한글까지 포함해, 목표와 순서가 맞는 실제 키 입력 수를 센다. */
export function correctStrokeCount(target: string, typed: string): number {
  return practiceInputStats(target, typed).correctStrokes;
}

/** 아직 안 친 글자는 오류가 아니다. 실제로 입력한 키 중 목표와 다른 키만 센다. */
export function practiceStrokeErrors(target: string, typed: string): number {
  return practiceInputStats(target, typed).errorStrokes;
}

/** 긴 글에서도 목표/입력을 각각 한 번만 분해해 정확 타수와 오타를 함께 계산한다. */
export function practiceInputStats(target: string, typed: string): { correctStrokes: number; errorStrokes: number } {
  const expected = toKeySequence(target);
  const actual = toKeySequence(typed);
  let correctStrokes = 0;
  while (correctStrokes < expected.length && correctStrokes < actual.length
    && expected[correctStrokes].key === actual[correctStrokes].key
    && expected[correctStrokes].shift === actual[correctStrokes].shift) correctStrokes++;
  let errors = 0;
  for (let index = 0; index < actual.length; index++) {
    if (!expected[index] || expected[index].key !== actual[index].key || expected[index].shift !== actual[index].shift) errors++;
  }
  return { correctStrokes, errorStrokes: errors };
}

export function practiceAccuracy(correctStrokes: number, wrongStrokes: number): number {
  const correct = Math.max(0, correctStrokes);
  const wrong = Math.max(0, wrongStrokes);
  return correct + wrong === 0 ? 100 : Math.round((correct / (correct + wrong)) * 1000) / 10;
}

/** 프로젝트 공통 정의와 같이 올바른 두벌식 키 입력 수를 분당 타수로 환산한다. */
export function practiceCpm(completedStrokes: number, target: string, typed: string, elapsedMs: number): number {
  const strokes = Math.max(0, completedStrokes) + correctStrokeCount(target, typed);
  return practiceCpmFromStrokes(strokes, elapsedMs);
}

export function practiceCpmFromStrokes(strokes: number, elapsedMs: number): number {
  const activeSec = Math.max(1, Number.isFinite(elapsedMs) ? elapsedMs / 1000 : 1);
  return Math.round((Math.max(0, strokes) * 60) / activeSec);
}

export function tutorialSteps(language: GameLanguage): TutorialStep[] {
  return language === 'en' ? [
    { part: 'consonants', title: 'Consonant practice', instruction: 'Type all 21 consonants, one at a time.', hint: 'Type the letter, then press Enter. Use Backspace to fix mistakes.', targets: [...'bcdfghjklmnpqrstvwxyz'], success: 'All consonants complete!' },
    { part: 'vowels', title: 'Vowel practice', instruction: 'Meet all five vowels.', hint: 'Type each vowel and press Enter.', targets: [...'aeiou'], success: 'All vowels complete!' },
    { part: 'sentences', title: 'Five funny sentences', instruction: 'Send each sentence with its spaces and punctuation.', hint: 'Use Space between words. Hold Shift for capital letters and !.', targets: ['My cat wants a flying fish.', 'A dragon toasted my sandwich.', 'The sleepy robot wore my socks.', 'A rabbit raced the school bus.', 'My pencil shouted, Go team!'], success: 'Five sentences complete!' },
    { part: 'story', title: 'The dragon bakery', instruction: 'Finish one short story, one sentence at a time.', hint: 'Press Enter at the end of each sentence.', targets: ['A little dragon opened a bakery.', 'He sneezed beside the bread.', 'Every loaf turned into toast.', 'Now he is the breakfast chef!'], success: 'One whole story complete. Breakfast is ready!' },
  ] : [
    { part: 'consonants', title: '자음 전체 연습', instruction: '기본 자음 14개와 쌍자음 5개를 익혀요.', hint: '한/영 키로 한글을 켜요. 쌍자음은 Shift와 함께! 다 쓰면 Enter.', targets: [...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄲㄸㅃㅆㅉ'], success: '자음 19개 완료! 쌍자음까지 모두 익혔어요.' },
    { part: 'vowels', title: '모음 전체 연습', instruction: '기본 모음부터 이중모음까지 21개를 익혀요.', hint: 'ㅘ는 ㅗ→ㅏ, ㅙ는 ㅗ→ㅐ! 노란 키를 따라 누르고 Enter.', targets: [...'ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣㅐㅔㅒㅖㅘㅙㅚㅝㅞㅟㅢ'], success: '모음 21개 완료! 이중모음도 문제없어요.' },
    { part: 'sentences', title: '세계관 모험 문장 50개', instruction: '다섯 지역을 여행하며 이어지는 문장을 하나씩 완성해 봐요.', hint: '띄어쓰기는 Space, 쉼표와 느낌표까지 똑같이 쓰고 Enter!', targets: [...KO_WORLD_PRACTICE_SENTENCES], success: '쉰 문장 완료! 다섯 지역의 이야기를 모두 되찾았어요.' },
    { part: 'story', title: '캐릭터 모험 장문 3편', instruction: '하늘, 보라, 지호가 직접 쓴 모험 기록을 한 편씩 완성해 봐요.', hint: '띄어쓰기와 문장부호까지 똑같이 쓰고, 완성하면 Enter!', targets: [...KO_CHARACTER_PRACTICE_STORIES], success: '장문 세 편 완료! 세 모험가의 이야기를 모두 읽었어요.' },
  ];
}

/** A rehearsal only: no clock, damage, coins, stage unlocks, or learning-record side effects. */
export class TutorialSystem {
  readonly steps: TutorialStep[];
  stepIndex = 0;
  targetIndex = 0;
  stepComplete = false;
  constructor(language: GameLanguage, parts?: TutorialStep['part'][], quick = false) {
    this.steps = tutorialSteps(language).filter(step => !parts || parts.includes(step.part)).map(step => {
      if (!quick) return step;
      const count = step.part === 'sentences' ? 1 : step.part === 'story' ? 2 : 3;
      const targets = step.part === 'story' || step.part === 'sentences' ? step.targets.slice(0, count)
        : [step.targets[0], step.targets[Math.floor(step.targets.length / 2)], step.targets[step.targets.length - 1]];
      return { ...step, targets, title: language === 'en' ? 'A short warm-up' : '짧게 몸풀기',
        instruction: language === 'en' ? `Try ${targets.length} ${targets.length === 1 ? 'example' : 'examples'}. You only need to do this once.` : `${targets.length}개만 써 봐요. 한 번 마치면 다음에는 바로 도전해요.`,
        success: language === 'en' ? 'Ready! Your warm-up is saved.' : '준비 끝! 다음에는 바로 도전할 수 있어요.' };
    });
    if (!this.steps.length) throw new Error('At least one tutorial part is required');
  }
  get step() { return this.steps[this.stepIndex]; }
  get target() { return this.step.targets[this.targetIndex]; }
  get complete() { return this.stepIndex === this.steps.length - 1 && this.stepComplete; }
  submit(value: string): 'wrong' | 'correct' | 'step' | 'complete' | 'ignored' {
    if (this.stepComplete) return 'ignored';
    if (value.normalize('NFC') !== this.target) {
      // Only explicit combo lessons reset; ordinary practice keeps completed items.
      if (this.step.resetOnMistake) this.targetIndex = 0;
      return 'wrong';
    }
    if (this.targetIndex < this.step.targets.length - 1) { this.targetIndex++; return 'correct'; }
    this.stepComplete = true;
    return this.complete ? 'complete' : 'step';
  }
  next() {
    if (!this.stepComplete || this.complete) return false;
    this.stepIndex++; this.targetIndex = 0; this.stepComplete = false;
    return true;
  }
}

