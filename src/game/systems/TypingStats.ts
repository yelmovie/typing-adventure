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

/** 잘못된 글자·삽입·빠진 글자의 최소 수. 입력 중에는 아직 치지 않은 뒷부분을 오류로 세지 않는다. */
export function inputErrorCount(target: string, typed: string, submitted = true): number {
  const a = [...target.normalize('NFC')], b = [...typed.normalize('NFC')];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  const expected = a.slice(start), actual = b.slice(start);
  if (!actual.length) return submitted ? expected.length : 0;
  if (!expected.length) return actual.length;
  let row = Array.from({ length: expected.length + 1 }, (_, i) => i);
  for (let i = 1; i <= actual.length; i++) {
    const next = [i];
    for (let j = 1; j <= expected.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (actual[i - 1] === expected[j - 1] ? 0 : 1));
    row = next;
  }
  return submitted ? row[expected.length] : Math.min(...row);
}

/**
 * 타수 통계 누적기.
 *  - 정확도 = 정답 타수 / (정답 타수 + 오답 글자 수·삽입·누락 수) × 100
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
  private activeSec = 0;
  private running = false;

  start(now = performance.now()) {
    this.startAt = now;
    this.endAt = 0;
    this.activeSec = 0;
    this.idleSec = 0;
    this.running = true;
  }
  stop(now = performance.now()) {
    this.endAt = now;
    this.running = false;
  }
  /** 모드가 실제 진행한 시간만 전달한다. 일시정지·탭 이탈·목표 등장 대기는 기록에서 제외한다. */
  tick(dt: number, hasTarget = true) {
    if (!this.running || !Number.isFinite(dt) || dt <= 0) return;
    if (hasTarget) this.activeSec += dt;
    else this.idleSec += dt;
  }
  elapsedSec(_now?: number): number {
    return this.activeSec;
  }
  /** 입력 중 확인한 오류를 기록한다. 같은 오류의 Enter 제출과 중복 집계하지 않는다. */
  addTypo(n = 1) {
    this.wrongStrokes += n;
  }
  addCorrect(text: string) {
    this.correctStrokes += countStrokes(text);
    this.submissions++;
    this.correctSubmissions++;
  }
  addWrong(typed: string, target: string, alreadyCounted = 0) {
    const errors = Math.max(1, inputErrorCount(target, typed));
    this.wrongStrokes += Math.max(0, errors - alreadyCounted);
    this.submissions++;
  }
  accuracy(): number {
    const total = this.correctStrokes + this.wrongStrokes;
    if (total === 0) return 0;
    return (this.correctStrokes / total) * 100;
  }
  cpm(_now?: number): number {
    const min = this.activeSec / 60;
    if (min <= 0) return 0;
    return this.correctStrokes / min;
  }
}
