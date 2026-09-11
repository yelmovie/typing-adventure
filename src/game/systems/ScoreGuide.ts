import type { GameLanguage, StageDef } from '../types';

/** Explain the actual formula without inventing a per-run score breakdown. */
export function scoreGuide(stage: StageDef, language: GameLanguage): string[] {
  const en = language === 'en';
  const common = en
    ? ['Each correct target: 100 points + 2 per correct keystroke.', 'Streak bonus: 10 × combo, up to 200. A target without an error or Backspace adds 50.', 'Accuracy = correct keystrokes ÷ (correct keystrokes + wrong, extra or missing characters). Errors counted while typing are not counted again on Enter.']
    : ['정확하게 완성한 목표마다 100점 + 정답 타수당 2점.', '연속 정답은 콤보 × 10점, 최대 200점. 오타·삭제 없이 완성하면 50점 추가.', '정확도 = 정답 타수 ÷ (정답 타수 + 틀리거나 더 넣거나 빠뜨린 글자 수). 입력 중 센 오타를 Enter를 누를 때 다시 감점하지 않아.'];
  const extra: Partial<Record<StageDef['mode'], [string, string]>> = {
    wave: ['회피·아이템·특수 낱말과 완료 시 남은 시간·체력도 점수에 반영돼.', 'Dodges, items, special words, and remaining time and health on completion also add points.'],
    race: ['특수 낱말과 완료 시 남은 시간·체력도 점수에 반영돼.', 'Special words and remaining time and health on completion also add points.'],
    letter: ['문장마다 300점 추가. 완료하면 PERFECT 문장당 200점과 체력 보너스를 받아. PERFECT는 오타·삭제 없이 완성이야. 읽는 시간은 감점하지 않아.', 'Each sentence adds 300. Completion adds 200 per PERFECT sentence (no error or Backspace) and a health bonus. Reading time is not penalised.'],
    telegram: ['문장마다 300점 추가. 정차하면 남은 거리와 체력 보너스를 받아.', 'Each sentence adds 300. Stopping the train adds distance and health bonuses.'],
    boss: ['보스를 이기면 1,000점과 남은 시간·체력 보너스를 받아.', 'Defeating the boss adds 1,000 plus remaining time and health bonuses.'],
  };
  if (extra[stage.mode]) common.push(extra[stage.mode]![en ? 1 : 0]);
  common.push(en ? 'Compare scores within the same region and difficulty. Each region has different bonuses.' : '지역마다 보너스가 달라. 같은 지역·난이도에서 내 기록을 비교해 보자.');
  return common;
}
