import type { BattleResult, StageDef } from '../types';

export function calcStars(stage: StageDef, cleared: boolean, accuracy: number, elapsedSec: number, maxCombo: number): number {
  if (!cleared || accuracy <= 0 || !Number.isFinite(accuracy)) return 0;
  if (accuracy < 90) return 1;
  if (accuracy < 95) return 2;
  if (stage.mode === 'daily' || stage.mode === 'letter') return 3;
  return elapsedSec <= stage.goalTimeSec || maxCombo >= stage.goalCombo ? 3 : 2;
}
/** Final guard: no record with zero successful inputs can unlock a stage or a perfect badge. */
export function hasAchievement(result: Pick<BattleResult, 'cleared' | 'wordsDone' | 'accuracy'>): boolean {
  return result.cleared && result.wordsDone > 0 && result.accuracy > 0 && Number.isFinite(result.accuracy);
}
