import type { StageDef, StageId, Difficulty } from '../types';

// v2: 스테이지 5개가 겉모습·플레이 방식이 전부 다르다 (docs/PLAN.md 2장).
// 배경은 새 이미지가 들어오기 전까지 기존 것으로 대체(bgIntro/bgBattle).
export const STAGES: StageDef[] = [
  {
    id: 'stage_1',
    index: 1,
    mode: 'wave',
    name: '푸른 숲',
    subtitle: 'BLUE FOREST',
    focus: '짧은 낱말 · 타격감',
    goal: '짧은 낱말을 정확하게 입력하며 기본 타자 감각 익히기',
    mission: '숲에서 몰려오는 몬스터 무리를 낱말로 물리치고 숲의 문을 열자!',
    enemies: ['green_slime', 'letter_bat'],
    targets: 30,
    // 2026-09-18: 20마리가 너무 빨리 끝나 30마리(6웨이브)로 늘렸다. 시간은 마리당 9초(tmp/balance.mjs 실측:
    // 8초/낱말 느린 아이가 225초에선 23마리에서 시간 초과, 270초가 통과선). 표준 4분 30초, 기초 6분 4초.
    timeLimitSec: 270,
    bgIntro: 'bg_practice_forest',
    bgBattle: 'bg_forest_roguelite',
    map: { x: 300, y: 730, icon: '숲' },
    goalTimeSec: 120,
    goalCombo: 15,
    playable: true,
  },
  {
    id: 'stage_2',
    index: 2,
    mode: 'race',
    name: '네온 시티',
    subtitle: 'NEON CITY',
    focus: '짧은 낱말 연속 · 속도감',
    goal: '받침과 이중모음이 들어간 낱말을 빠르고 정확하게 입력하기',
    mission: '검은 그림자가 쫓아온다! 낱말을 연달아 입력해 네온 시티를 달려 빠져나가자!',
    enemies: ['shadow_chaser'],
    targets: 24, // 800m 코스에서 보통 완주까지 치는 낱말 수(대략)
    timeLimitSec: 150, // 800m: 8초/낱말 느린 아이가 약 130초에 도착한다(check-race-pacing)
    bgIntro: 'bg_neon_city',
    bgBattle: 'bg_neon_city',
    map: { x: 530, y: 610, icon: '시티' },
    goalTimeSec: 90,
    goalCombo: 12,
    playable: true,
  },
  {
    id: 'stage_3',
    index: 3,
    mode: 'letter',
    name: '사막 유적',
    subtitle: 'DESERT RUINS',
    focus: '문장 · 탐험과 퍼즐',
    goal: '띄어쓰기와 문장부호를 포함한 문장을 정확하게 입력하기',
    mission: '찢어진 편지를 문장으로 복원해 황금문의 자물쇠 3개를 열자!',
    enemies: ['sentence_ghost', 'keycap_knight'],
    targets: 9, // 편지 9문장 = 자물쇠 3개 × 3문장
    timeLimitSec: 300,
    bgIntro: 'bg_desert_gate',
    bgBattle: 'bg_desert_gate',
    map: { x: 980, y: 620, icon: '사막' },
    goalTimeSec: 220,
    goalCombo: 8,
    playable: true,
  },
  {
    id: 'stage_4',
    index: 4,
    mode: 'telegram',
    name: '폭주 열차',
    subtitle: 'RUNAWAY TRAIN',
    focus: '문장 + 시간 압박 · 긴장감',
    goal: '제한 시간 안에 문장을 흔들림 없이 정확하게 입력하기',
    mission: '다리가 끊겼다! 열차가 멈추도록 긴급 전보를 끝까지 보내자!',
    enemies: ['keycap_knight', 'keycap_knight'],
    targets: 5, // 전보 5문장 (TELE.sentences)
    timeLimitSec: 180, // = TELE.dist 360m ÷ 2m/s
    bgIntro: 'bg_train',
    bgBattle: 'bg_train',
    map: { x: 1230, y: 250, icon: '열차' },
    goalTimeSec: 150,
    goalCombo: 4, // Five telegram sentences: the accuracy + combo route must be reachable.
    playable: true,
  },
  {
    id: 'stage_5',
    index: 5,
    mode: 'boss',
    name: '어둠의 성채',
    subtitle: 'DARK CITADEL',
    focus: '종합 · 클라이맥스',
    goal: '낱말과 문장을 번갈아 입력하며 배운 것을 모두 발휘하기',
    mission: '키보드 골렘의 3단계 공격을 이겨내고 마지막 장문으로 세상에 글자를 되찾자!',
    enemies: ['keyboard_golem'],
    targets: 20,
    timeLimitSec: 360, // 결정 5 + 러시(HP 70 ÷ 4) + 장문 6문장
    bgIntro: 'bg_final_boss',
    bgBattle: 'bg_final_boss',
    map: { x: 1560, y: 230, icon: '성' },
    goalTimeSec: 240,
    goalCombo: 15,
    playable: true,
  },
];

/** 오늘의 도전 (지도에는 없음, index 0) */
export const DAILY_STAGE: StageDef = {
  id: 'daily',
  index: 0,
  mode: 'daily',
  name: '오늘의 도전',
  subtitle: 'DAILY CHALLENGE',
  focus: '오늘의 낱말 20개',
  goal: '매일 같은 낱말로 내 기록 재기',
  mission: '오늘의 낱말 20개를 최대한 빠르고 정확하게!',
  enemies: [],
  targets: 20,
  timeLimitSec: 0,
  bgIntro: 'bg_library',
  bgBattle: 'bg_library',
  map: { x: 0, y: 0, icon: '오늘' },
  goalTimeSec: 0,
  goalCombo: 0,
  playable: true,
};

export function getStage(id: StageId): StageDef {
  if (id === 'daily') return DAILY_STAGE;
  return STAGES.find((s) => s.id === id)!;
}
export function getStageByIndex(index: number): StageDef | undefined {
  return STAGES.find((s) => s.index === index);
}

export const DIFFICULTY_LABEL: Record<Difficulty, { name: string; desc: string; cls: string }> = {
  beginner: { name: '기초', desc: '시간 35% 넉넉 · 몬스터·추격자·열차가 느려요', cls: 'easy' },
  normal: { name: '표준', desc: '기본 속도 · 틀려도 고쳐서 다시 도전', cls: 'normal' },
  challenge: { name: '도전', desc: '시간 20% 짧고 적이 빨라요', cls: 'hard' },
};

export interface DifficultyRule {
  timeMul: number;
  enemyHpMul: number;
  wrongHp: number;
  wrongTimeSec: number;
  playerHp: number;
}
export const DIFFICULTY_RULES: Record<Difficulty, DifficultyRule> = {
  beginner: { timeMul: 1.35, enemyHpMul: 1, wrongHp: 0, wrongTimeSec: 0, playerHp: 100 },
  normal: { timeMul: 1, enemyHpMul: 1, wrongHp: 6, wrongTimeSec: 0, playerHp: 100 },
  challenge: { timeMul: 0.8, enemyHpMul: 1.15, wrongHp: 10, wrongTimeSec: 5, playerHp: 100 },
};
