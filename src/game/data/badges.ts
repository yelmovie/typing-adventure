import type { BadgeDef, BattleResult, SaveData } from '../types';

export const BADGES: BadgeDef[] = [
  { id: 'first_clear', name: '첫 모험', icon: '첫', desc: '첫 스테이지를 클리어했어요' },
  { id: 'accuracy_100', name: '완벽한 손가락', icon: '100', desc: '정확도 100%로 클리어' },
  { id: 'combo_10', name: '콤보 마스터', icon: '콤', desc: '10콤보 달성' },
  { id: 'fever_master', name: 'FEVER 타임', icon: 'FV', desc: '20콤보로 FEVER 진입' },
  { id: 'speed_150', name: '번개 타자', icon: '150', desc: '150타/분 이상 기록' },
  { id: 'three_stars', name: '별 수집가', icon: '★', desc: '별 3개로 클리어' },
  { id: 'perfect_5', name: '퍼펙트 사냥꾼', icon: 'PF', desc: '한 판에 PERFECT 5회' },
  { id: 'forest_hero', name: '숲의 영웅', icon: '숲', desc: '푸른 숲의 문을 열었어요' },
  { id: 'lake_hero', name: '네온 러너', icon: '네', desc: '네온 시티 게이트 도착' },
  { id: 'ghost_beat', name: '어제의 나 추월', icon: '추', desc: '레이스에서 내 최고 기록을 넘었어요' },
  { id: 'desert_hero', name: '황금문 개방', icon: '문', desc: '잊힌 편지를 완성했어요' },
  { id: 'letter_perfect', name: '별빛 필사가', icon: '필', desc: '편지 문장 4개 이상 PERFECT' },
  { id: 'train_hero', name: '비상 브레이크', icon: '차', desc: '폭주 열차를 세웠어요' },
  { id: 'train_calm', name: '침착한 통신사', icon: '통', desc: '열차를 별 3개로 세웠어요' },
  { id: 'ending', name: '글자를 되찾은 영웅', icon: '왕', desc: '어둠의 성채를 밝혔어요' },
  { id: 'coin_collector', name: '보물 사냥꾼', icon: '보', desc: '코인 200개를 모았어요' },
  { id: 'streak_3', name: '사흘 연속 모험가', icon: '3일', desc: '3일 연속으로 모험을 완료했어요' },
  { id: 'streak_7', name: '일주일의 약속', icon: '7일', desc: '7일 연속으로 모험을 완료했어요' },
  { id: 'streak_14', name: '보름달 타자', icon: '14', desc: '14일 연속으로 모험을 완료했어요' },
];

/** 출석 스트릭 배지(오늘의 도전만 완료한 날도 포함). 이미 가진 것은 제외. */
export function evaluateStreakBadges(save: Pick<SaveData, 'records' | 'collection'>): string[] {
  const count = save.records.streak?.count ?? 0;
  return ([[3, 'streak_3'], [7, 'streak_7'], [14, 'streak_14']] as const)
    .filter(([days, id]) => count >= days && !save.collection.badges.includes(id))
    .map(([, id]) => id);
}

export function getBadge(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id);
}

/** 이번 결과로 새로 얻는 배지 계산 (이미 가진 것은 제외) */
export function evaluateBadges(
  result: Pick<BattleResult, 'cleared' | 'accuracy' | 'maxCombo' | 'cpm' | 'stars' | 'perfectCount' | 'stageId' | 'beatGhost'>,
  save: SaveData,
): string[] {
  if (!result.cleared) return [];
  const has = new Set(save.collection.badges);
  const earned: string[] = [];
  const add = (id: string) => {
    if (!has.has(id)) earned.push(id);
  };
  add('first_clear');
  if (result.accuracy >= 100) add('accuracy_100');
  if (result.maxCombo >= 10) add('combo_10');
  if (result.maxCombo >= 20) add('fever_master');
  if (result.cpm >= 150) add('speed_150');
  if (result.stars >= 3) add('three_stars');
  if (result.perfectCount >= 5) add('perfect_5');
  if (result.stageId === 'stage_1') add('forest_hero');
  if (result.stageId === 'stage_2') add('lake_hero');
  if (result.stageId === 'stage_2' && result.beatGhost) add('ghost_beat');
  if (result.stageId === 'stage_3') add('desert_hero');
  if (result.stageId === 'stage_3' && result.perfectCount >= 4) add('letter_perfect');
  if (result.stageId === 'stage_4') add('train_hero');
  if (result.stageId === 'stage_4' && result.stars >= 3) add('train_calm');
  if (result.stageId === 'stage_5') add('ending');
  if ((save.progress.coins ?? 0) >= 200) add('coin_collector');
  for (const id of evaluateStreakBadges(save)) add(id);
  return earned;
}
