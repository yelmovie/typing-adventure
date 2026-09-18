/**
 * 어둠 모드(뉴게임+): 다섯 지역을 모두 완료한 뒤 여는 지역별 어려운 판.
 * 규칙 수정은 여기 한 곳에서만 한다. 각 모드 시스템은 stage.speedMul 을 곱하기만 한다.
 *  - 제한 시간·3성 목표 시간 ×0.7 (레이스·숲·보스는 stage.timeLimitSec, 열차는 속도로 제한 시간이 정해진다)
 *  - 몬스터·추격자·열차·러시 속도 ×1.3
 *  - 도움 모드·기초 난이도는 적용하지 않는다(표준 이상). 도전 난이도는 그대로 도전 규칙.
 * 별은 progress.darkStars, 완료는 progress.darkCleared 에 따로 기록한다(코인·배지는 보통 판과 같이 받는다).
 */
import type { Difficulty, SaveData, StageDef, StageId } from '../types';
import { endgameUnlocked } from '../systems/SpeedrunSystem';

export const DARK = { timeMul: 0.7, speedMul: 1.3 } as const;

export function applyDarkModifier(stage: StageDef): StageDef {
  if (stage.mode === 'daily') return stage;
  return {
    ...stage,
    timeLimitSec: Math.round(stage.timeLimitSec * DARK.timeMul),
    goalTimeSec: Math.round(stage.goalTimeSec * DARK.timeMul),
    speedMul: DARK.speedMul,
  };
}

/** 어둠 모드는 기초·도움 규칙을 쓰지 않는다. */
export function darkDifficulty(profile: Difficulty): Difficulty {
  return profile === 'beginner' ? 'normal' : profile;
}

export function darkUnlocked(save: Pick<SaveData, 'progress'>): boolean {
  return endgameUnlocked(save.progress);
}

export function darkStars(save: Pick<SaveData, 'progress'>, stageId: StageId): number {
  return save.progress.darkStars?.[stageId] ?? 0;
}

/** 어둠 모드 완료 기록. 호출한 쪽이 저장한다. 별은 최고치만 남긴다. */
export function recordDarkClear(save: Pick<SaveData, 'progress'>, stageId: StageId, stars: number): void {
  if (stageId === 'daily') return;
  const p = save.progress;
  p.darkStars ??= {};
  p.darkStars[stageId] = Math.max(p.darkStars[stageId] ?? 0, Math.max(0, Math.min(3, Math.floor(stars))));
  p.darkCleared ??= [];
  if (!p.darkCleared.includes(stageId)) p.darkCleared.push(stageId);
}
