import type { GameLanguage, SaveData, StageDef, StageId } from '../types';
import { STAGES } from './stages';

export interface JourneyChapter {
  stageId: StageId;
  region: string;
  relic: string;
  mission: string;
  restored: string;
  next: string;
  replay: string;
  mechanic: string;
  color: string;
  mark: string;
}

// Narrative rewards are derived from actual clears, never a second currency or save.
const chapters: Record<GameLanguage, JourneyChapter[]> = {
  ko: [
    { stageId: 'stage_1', region: '푸른 숲', relic: '숲길의 불씨', mark: '✿', color: '#77cf91', mission: '글자를 삼킨 몬스터가 숲길을 막았어. 짧은 낱말로 길을 다시 밝히자!', restored: '몬스터를 물리치고 숲길의 불씨를 되찾았어.', next: '불씨가 가리키는 곳은 꺼진 네온 시티야.', replay: '새 낱말로 숲길을 지키며 연속 정답에 도전해.', mechanic: '낱말 완성 → 몬스터 격퇴' },
    { stageId: 'stage_2', region: '네온 시티', relic: '네온 신호', mark: '↗', color: '#67cfe5', mission: '그림자가 신호를 빼앗았어! 낱말을 이어 쳐서 500m를 달려 빠져나가자.', restored: '추격자를 따돌리고 네온 신호를 되찾았어.', next: '도시의 신호가 사막에 묻힌 편지를 비추고 있어.', replay: '새 낱말로 달리며 지난번 나의 기록에 도전해.', mechanic: '연속 정답 → 가속 · 500m 탈출' },
    { stageId: 'stage_3', region: '사막 유적', relic: '황금문의 열쇠', mark: '◇', color: '#ebc16c', mission: '찢어진 편지 안에 길이 숨겨져 있어. 여섯 문장을 복원해 자물쇠 세 개를 열자.', restored: '편지를 복원하고 황금문의 열쇠를 되찾았어.', next: '문 너머 폭주 열차에 긴급 전보를 보내야 해.', replay: '다른 편지를 읽고 띄어쓰기까지 정확하게 복원해.', mechanic: '문장 2개 → 자물쇠 1개 · 시간제한 없음' },
    { stageId: 'stage_4', region: '폭주 열차', relic: '정차 신호', mark: 'Ⅱ', color: '#e59a79', mission: '앞쪽 다리가 끊겼어! 긴급 전보 세 문장을 보내 열차를 멈추자.', restored: '전보를 끝까지 보내고 열차의 정차 신호를 되찾았어.', next: '이제 어둠의 성채에서 빼앗긴 글자를 되찾을 차례야.', replay: '새 긴급 전보로 한 어절씩 정확하게 전달해.', mechanic: '문장 완성 → 브레이크 · 3문장 정차' },
    { stageId: 'stage_5', region: '어둠의 성채', relic: '글자별', mark: '✦', color: '#baabef', mission: '키보드 골렘이 마지막 글자를 가뒀어. 결정과 갑옷을 깨고 글자별을 되찾자!', restored: '마지막 문장까지 완성해 세상에 글자를 되찾았어.', next: '다섯 지역의 빛이 모였어. 새 낱말로 다시 길을 밝혀 보자.', replay: '새 결정과 마지막 문장 조합으로 골렘에 다시 도전해.', mechanic: '결정 → 반격 → 갑옷·코어·마무리' },
  ],
  en: [
    { stageId: 'stage_1', region: 'Blue Forest', relic: 'Forest Ember', mark: '✿', color: '#77cf91', mission: 'Word-eating monsters block the forest. Type short words to light the path again!', restored: 'You defeated the monsters and recovered the Forest Ember.', next: 'The ember points toward the dark streets of Neon City.', replay: 'Guard the path with new words and build a correct streak.', mechanic: 'Complete words → defeat monsters' },
    { stageId: 'stage_2', region: 'Neon City', relic: 'Neon Signal', mark: '↗', color: '#67cfe5', mission: 'A shadow stole the signal! Chain correct words and escape over 500 metres.', restored: 'You escaped the chaser and recovered the Neon Signal.', next: 'The signal reveals a letter buried in the desert.', replay: 'Run with new words and challenge your previous ghost.', mechanic: 'Correct streak → boost · escape 500 m' },
    { stageId: 'stage_3', region: 'Desert Ruins', relic: 'Golden Key', mark: '◇', color: '#ebc16c', mission: 'A torn letter hides the way. Restore six sentences to open three locks.', restored: 'You restored the letter and recovered the Golden Key.', next: 'Beyond the gate, a runaway train needs your urgent message.', replay: 'Read a different letter and restore every space and mark.', mechanic: '2 sentences → 1 lock · no time limit' },
    { stageId: 'stage_4', region: 'Runaway Train', relic: 'Stop Signal', mark: 'Ⅱ', color: '#e59a79', mission: 'The bridge ahead is broken! Send three urgent sentences to stop the train.', restored: 'You sent the full message and recovered the Stop Signal.', next: 'The stolen letters are waiting in the Dark Citadel.', replay: 'Send a new urgent message, one accurate phrase at a time.', mechanic: 'Finish sentences → brake · 3 to stop' },
    { stageId: 'stage_5', region: 'Dark Citadel', relic: 'Letter Star', mark: '✦', color: '#baabef', mission: 'The Keyboard Golem holds the last letters. Break its crystals and armour to recover the Letter Star!', restored: 'You completed the final sentence and brought the letters home.', next: 'All five lights are back. Explore again with new words.', replay: 'Challenge the golem with new crystals and final sentences.', mechanic: 'Crystals → counterattack → armour, core, finale' },
  ],
};

export function journeyFor(stageId: StageId, language: GameLanguage = 'ko'): JourneyChapter | undefined {
  return chapters[language].find(chapter => chapter.stageId === stageId);
}

/** Ignore duplicates, unknown ids, and daily practice when showing the five lights. */
export function journeyProgress(save: Pick<SaveData, 'progress'>, language: GameLanguage = 'ko') {
  const restored = chapters[language].filter(chapter => save.progress.clearedStages.includes(chapter.stageId));
  const available = STAGES.filter(stage => stage.index <= save.progress.unlockedStage);
  const next = available.find(stage => !save.progress.clearedStages.includes(stage.id))
    ?? [...available].sort((a, b) => (save.progress.stageStars[a.id] ?? 0) - (save.progress.stageStars[b.id] ?? 0) || a.index - b.index)[0];
  return { chapters: chapters[language], restored, next, complete: restored.length === chapters[language].length };
}

/** Mirrors the actual star rules. Time and combo are alternatives, not both required. */
export function journeyGoal(stage: StageDef, bestStars: number, language: GameLanguage = 'ko'): string {
  const en = language === 'en';
  if (bestStars < 1) return en ? 'Finish the region to recover its light.' : '지역을 끝까지 완료해 빛을 되찾자.';
  if (bestStars < 2) return en ? 'Next star: finish with at least 90% accuracy.' : '다음 별: 정확도 90% 이상으로 완료하기.';
  if (bestStars < 3) {
    if (stage.mode === 'letter' || stage.mode === 'daily') return en ? 'Next star: finish with at least 95% accuracy. No speed requirement.' : '다음 별: 정확도 95% 이상으로 완료하기. 속도 조건은 없어.';
    return en ? `Next star: finish at 95% accuracy + (within ${stage.goalTimeSec}s OR a ${stage.goalCombo} combo).` : `다음 별: 정확도 95%로 완료 + (${stage.goalTimeSec}초 이내 또는 ${stage.goalCombo}콤보).`;
  }
  return en ? 'All three stars earned. Try new words with Adventure Plus.' : '별 세 개를 모두 모았어. 모험 플러스에서 새 낱말에 도전해.';
}
