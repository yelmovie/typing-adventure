import { countStrokes } from '../util/hangul';

/** 피해량 (04_game_balance.json damage) */
export const DAMAGE = { base: 10, perfectBonus: 5, combo5Bonus: 2, combo10Bonus: 5 };

export function calcDamage(combo: number, perfect: boolean): number {
  let d = DAMAGE.base;
  if (perfect) d += DAMAGE.perfectBonus;
  if (combo >= 10) d += DAMAGE.combo10Bonus;
  else if (combo >= 5) d += DAMAGE.combo5Bonus;
  return d;
}

/** 점수 = 기본 100 + 콤보 보너스 + PERFECT 보너스 (+ 종료 시 시간 보너스) */
export function calcWordScore(combo: number, perfect: boolean, strokes: number): number {
  return 100 + Math.min(combo, 20) * 10 + (perfect ? 50 : 0) + strokes * 2;
}

/**
 * 타수 통계 누적기.
 *  - 정확도 = 정답 타수 / (정답 타수 + 오답 타수) × 100
 *  - 타/분(CPM) = 확정 입력한 정답 타수 / 경과 분
 *  프로젝트 전체에서 이 정의 하나만 사용한다.
 */
export class TypingStats {
  correctStrokes = 0;
  wrongStrokes = 0;
  submissions = 0;
  correctSubmissions = 0;
  startAt = 0;
  endAt = 0;
  /** 목표가 없어 칠 수 없던 시간(몬스터 등장 대기 등) — 타수 계산에서 뺀다 */
  idleSec = 0;

  start(now = performance.now()) {
    this.startAt = now;
    this.endAt = 0;
  }
  stop(now = performance.now()) {
    this.endAt = now;
  }
  elapsedSec(now = performance.now()): number {
    if (!this.startAt) return 0;
    return ((this.endAt || now) - this.startAt) / 1000;
  }
  /** 틀린 음절을 확정할 때마다 오타 1타 (Enter 오답과 별개로 정확도에 반영) */
  addTypo(n = 1) {
    this.wrongStrokes += n;
  }
  addCorrect(text: string) {
    this.correctStrokes += countStrokes(text);
    this.submissions++;
    this.correctSubmissions++;
  }
  addWrong(typed: string, target: string) {
    // 오답 타수 = 실제로 입력한 타수 (최소 1, 최대 목표 타수 × 1.5 로 완화)
    const s = Math.max(1, Math.min(countStrokes(typed), Math.ceil(countStrokes(target) * 1.5)));
    this.wrongStrokes += s;
    this.submissions++;
  }
  accuracy(): number {
    const total = this.correctStrokes + this.wrongStrokes;
    if (total === 0) return 100;
    return (this.correctStrokes / total) * 100;
  }
  cpm(now = performance.now()): number {
    const min = Math.max(0, this.elapsedSec(now) - this.idleSec) / 60;
    if (min <= 0) return 0;
    return this.correctStrokes / min;
  }
}
