import type { GameLanguage } from '../types';

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

export function tutorialSteps(language: GameLanguage): TutorialStep[] {
  return language === 'en' ? [
    { part: 'consonants', title: 'Consonant practice', instruction: 'Type all 21 consonants, one at a time.', hint: 'Type the letter, then press Enter. Use Backspace to fix mistakes.', targets: [...'bcdfghjklmnpqrstvwxyz'], success: 'All consonants complete!' },
    { part: 'vowels', title: 'Vowel practice', instruction: 'Meet all five vowels.', hint: 'Type each vowel and press Enter.', targets: [...'aeiou'], success: 'All vowels complete!' },
    { part: 'sentences', title: 'Five funny sentences', instruction: 'Send each sentence with its spaces and punctuation.', hint: 'Use Space between words. Hold Shift for capital letters and !.', targets: ['My cat wants a flying fish.', 'A dragon toasted my sandwich.', 'The sleepy robot wore my socks.', 'A rabbit raced the school bus.', 'My pencil shouted, Go team!'], success: 'Five sentences complete!' },
    { part: 'story', title: 'The dragon bakery', instruction: 'Finish one short story, one sentence at a time.', hint: 'Press Enter at the end of each sentence.', targets: ['A little dragon opened a bakery.', 'He sneezed beside the bread.', 'Every loaf turned into toast.', 'Now he is the breakfast chef!'], success: 'One whole story complete. Breakfast is ready!' },
  ] : [
    { part: 'consonants', title: '자음 전체 연습', instruction: '기본 자음 14개와 쌍자음 5개를 익혀요.', hint: '한/영 키로 한글을 켜요. 쌍자음은 Shift와 함께! 다 쓰면 Enter.', targets: [...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄲㄸㅃㅆㅉ'], success: '자음 19개 완료! 쌍자음까지 모두 익혔어요.' },
    { part: 'vowels', title: '모음 전체 연습', instruction: '기본 모음부터 이중모음까지 21개를 익혀요.', hint: 'ㅘ는 ㅗ→ㅏ, ㅙ는 ㅗ→ㅐ! 노란 키를 따라 누르고 Enter.', targets: [...'ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣㅐㅔㅒㅖㅘㅙㅚㅝㅞㅟㅢ'], success: '모음 21개 완료! 이중모음도 문제없어요.' },
    { part: 'sentences', title: '재미있는 문장 5개', instruction: '엉뚱한 문장을 하나씩 완성해 봐요.', hint: '띄어쓰기는 Space, 느낌표는 Shift + 1. 다 쓰면 Enter!', targets: ['고양이가 생선 비를 기다려요.', '꼬마 용이 식빵을 구웠어요.', '로봇이 양말을 귀에 걸었어요.', '토끼가 당근 로켓을 탔어요.', '내 연필이 숙제는 내일 하래요!'], success: '다섯 문장 완료! 띄어쓰기와 문장부호까지 성공했어요.' },
    { part: 'story', title: '짧은 글: 용의 빵집', instruction: '한 편의 이야기를 네 문장으로 이어 써요.', hint: '한 문장씩 문장부호까지 쓰고 Enter를 눌러요.', targets: ['꼬마 용이 빵집을 열었어요.', '밀가루가 날려서 재채기를 했어요.', '식빵이 모두 토스트가 되었어요.', '손님들이 내일도 재채기를 부탁했어요!'], success: '짧은 글 한 편 완성! 용의 빵집은 오늘도 매진이에요.' },
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

