/**
 * 스테이지 2 「네온 시티」 추격 레이스 — 타이핑 속도가 곧 달리는 속도.
 *  - 800m 트랙. 정확한 낱말이 BOOST를 만들고, 입력 완성이 끊기면 관성 주행도 멈춘다.
 *  - 오타 → 2초 감속. 10낱말 연속 무오타 → TURBO. FEVER·펫은 속도로 거리를 벌린다.
 *  - 추격자는 현재 거리·최근 주행 속도를 보고 완만하게 가감속한다. 피격 후에는 잠깐 비틀거리며 회복 기회를 준다.
 *  - 고스트: 개인 최고 기록의 1초 간격 거리 샘플. 화면에 '어제의 나'로 같이 달린다.
 *  - 800m + 정확한 낱말 14개 이상 → 클리어. 시간 0 / 3회 피격 → 실패.
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcWordScore } from './TypingStats';
import { TypingRun, RULES, type Emit } from './TypingRun';
import { applyVariant } from '../data/content';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, EnemyState, TypingMode, CheckpointState } from './BattleState';
import { obj, readInt, readNum, readNums, restoreOrder } from './Checkpoint';

export const RACE = {
  goal: 800,
  rulesVersion: 3, // 500m → 800m 코스 변경. 이전 고스트는 비교하지 않는다
  minWords: 14,
  baseSpeed: 4.5,
  boostSpeed: 5.5,
  boostSec: 1.6,
  sustainMax: 3, // 최근 3낱말 타수(≈200타/분)에서 최대
  sustainCpm: 200,
  typoMul: 0.7,
  typoSec: 2,
  turboWords: 10,
  turboSec: 5,
  turboMul: 1.5,
  feverMul: 1.3,
  maxSpeed: 18,
  acceleration: 16,
  deceleration: 10,
  coastSec: 8,
  coastFadeSec: 6,
  chaserStart: -40,
  chaserSpeed: 4.5,
  chaserMaxSpeed: 22,
  chaserAcceleration: 3.5,
  chaserDeceleration: 8,
  chaseGap: 34,
  chaseResponse: 0.18,
  chasePaceSec: 5,
  catchRecoverySec: 4,
  chaserStaggerSec: 3,
  petSlowSec: 3,
  catchHp: 20,
  maxCatches: 3,
  ghostSampleSec: 1,
};

export interface GhostRecord {
  samples: number[]; // 1초마다 거리(m)
  finishSec: number;
  goalDistance?: number;
  rulesVersion?: number;
}

export interface RaceInfo {
  goal: number;
  player: number;
  chaser: number;
  ghost: number | null;
  speed: number;
  turboLeft: number;
  boostLeft: number;
  slowLeft: number;
  catches: number;
  noTypoStreak: number;
  ghostAhead: boolean;
  gap: number; // 미터, 접촉 시 0
  threat: number; // 0 여유 ~ 1 접촉
  chaserSpeed: number;
  catchRecoveryLeft: number;
}

export class RaceSystem implements TypingMode {
  readonly stage: StageDef;
  readonly difficulty: Difficulty;
  readonly run: TypingRun;
  score = 0;
  playerHp: number;
  playerMaxHp: number;
  timeLeft: number;
  timeLimit: number;
  finished = false;
  running = false;
  dist = 0;
  chaser = RACE.chaserStart;
  elapsed = 0;
  catches = 0;
  samples: number[] = [0];
  beatGhost: boolean | undefined = undefined; // 고스트가 없던 첫 판은 undefined

  private emit: Emit;
  private pool: ContentUnit[];
  private cursor = 0;
  private boostLeft = 0;
  private slowLeft = 0;
  private turboLeft = 0;
  private noTypoStreak = 0;
  private recentCpm: number[] = [];
  private wordSec = 0;
  private sinceCorrect = 0;
  private velocity = RACE.baseSpeed;
  private chaserVelocity = RACE.chaserSpeed;
  private chasePace = RACE.baseSpeed;
  private catchRecoveryLeft = 0;
  private chaserSlowLeft = 0;
  private ghost: GhostRecord | null;
  private chaserSheet: string;

  constructor(stage: StageDef, difficulty: Difficulty, pet: PetDef, words: ContentUnit[], ghost: GhostRecord | null, chaserSheet: string, emit: Emit) {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.pool = shuffle(words);
    this.ghost = ghost?.goalDistance === RACE.goal && ghost.rulesVersion === RACE.rulesVersion ? ghost : null;
    this.chaserSheet = chaserSheet;
    const rule = DIFFICULTY_RULES[difficulty];
    this.playerMaxHp = rule.playerHp;
    this.playerHp = rule.playerHp;
    this.timeLimit = Math.round(stage.timeLimitSec * rule.timeMul);
    this.timeLeft = this.timeLimit;
    this.run = new TypingRun({ stage, difficulty, pet, next: (offset) => this.nextWord(offset), emit });
  }

  private nextWord(offset: number): ContentUnit {
    // 적응형: +1이면 긴 낱말, -1이면 짧은 낱말을 우선
    let u = this.pool[this.cursor++ % this.pool.length];
    if (offset !== 0) {
      const len = (x: ContentUnit) => [...x.text].length;
      const cand = this.pool.filter((x) => (offset > 0 ? len(x) >= 3 : len(x) <= 2) && x.id !== u.id);
      if (cand.length) u = cand[Math.floor(Math.random() * cand.length)];
    }
    return this.cursor <= 1 ? u : applyVariant(u);
  }

  start() {
    this.running = true;
    this.run.start();
    this.emit('BATTLE_START', this.snapshot());
    this.emit('TARGET_CHANGED', this.snapshot());
  }
  pause() {
    this.running = false;
  }
  resume() {
    if (!this.finished) this.running = true;
  }

  /** 현재 속도(m/s) */
  speed(): number { return this.velocity; }

  private desiredSpeed(): number {
    const sustain = this.recentCpm.length ? Math.min(RACE.sustainMax, (avg(this.recentCpm) / RACE.sustainCpm) * RACE.sustainMax) : 0;
    let v = RACE.baseSpeed + sustain + (this.boostLeft > 0 ? RACE.boostSpeed : 0);
    if (this.slowLeft > 0) v *= RACE.typoMul;
    if (this.turboLeft > 0) v *= RACE.turboMul;
    if (this.run.feverLevel >= 2) v *= RACE.feverMul;
    const momentum = clamp(1 - (this.sinceCorrect - RACE.coastSec) / RACE.coastFadeSec, 0, 1);
    return Math.min(RACE.maxSpeed, v) * momentum;
  }

  chaserSpeed(): number {
    return this.chaserVelocity;
  }

  private desiredChaserSpeed(): number {
    if (this.catchRecoveryLeft > RACE.catchRecoverySec - RACE.chaserStaggerSec) return 0;
    const gap = this.dist - this.chaser;
    const targetGap = RACE.chaseGap + (this.difficulty === 'beginner' ? 8 : this.difficulty === 'challenge' ? -6 : 0);
    const idlePressure = clamp((this.run.idleSeconds - 3) / 4, 0, 1) * 3;
    const errorPressure = this.slowLeft > 0 ? 1.5 : 0;
    // 어둠 모드(stage.speedMul): 추격자가 내 평균 속도보다 그만큼 빠르게 달려 간격이 스스로 좁혀진다.
    let speed = this.chasePace * (this.stage.speedMul ?? 1) + (gap - targetGap) * RACE.chaseResponse + idlePressure + errorPressure;
    if (this.chaserSlowLeft > 0) speed *= 0.55;
    return clamp(speed, 1.5, RACE.chaserMaxSpeed);
  }

  ghostDist(): number | null {
    if (!this.ghost) return null;
    const s = this.ghost.samples;
    const i = Math.floor(this.elapsed / RACE.ghostSampleSec);
    if (i >= s.length - 1) return s[s.length - 1] ?? 0;
    const f = this.elapsed / RACE.ghostSampleSec - i;
    return s[i] + (s[i + 1] - s[i]) * f;
  }

  tick(dt: number) {
    if (!this.running || this.finished) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.elapsed += dt;
    this.wordSec += dt;
    this.sinceCorrect += dt;
    this.boostLeft = Math.max(0, this.boostLeft - dt);
    this.slowLeft = Math.max(0, this.slowLeft - dt);
    this.turboLeft = Math.max(0, this.turboLeft - dt);
    this.catchRecoveryLeft = Math.max(0, this.catchRecoveryLeft - dt);
    this.chaserSlowLeft = Math.max(0, this.chaserSlowLeft - dt);
    const desired = this.desiredSpeed();
    this.velocity = approach(this.velocity, desired, (desired > this.velocity ? RACE.acceleration : RACE.deceleration) * dt);
    this.chasePace += (this.velocity - this.chasePace) * (1 - Math.exp(-dt / RACE.chasePaceSec));
    const chaseDesired = this.desiredChaserSpeed();
    this.chaserVelocity = approach(this.chaserVelocity, chaseDesired, (chaseDesired > this.chaserVelocity ? RACE.chaserAcceleration : RACE.chaserDeceleration) * dt);
    this.dist = Math.min(RACE.goal, this.dist + this.velocity * dt);
    this.chaser += this.chaserVelocity * dt;
    while (this.samples.length <= Math.floor(this.elapsed / RACE.ghostSampleSec)) this.samples.push(this.dist);
    if (this.run.tick(dt).bomb) {
      this.slowLeft = RACE.typoSec;
      this.run.advance();
      this.emit('TARGET_CHANGED', this.snapshot());
    }
    const drain = this.run.idleDrain(dt);
    if (drain > 0) {
      this.playerHp = Math.max(0, this.playerHp - drain);
      this.emit('IDLE_DRAIN', { hpLoss: drain, hp: this.playerHp, idle: this.run.idleSeconds });
      if (this.playerHp <= 0) {
        this.fail('hp');
        return;
      }
    }
    if (this.catchRecoveryLeft <= 0 && this.chaser >= this.dist) this.caught();
    if (this.finished) return;
    this.emit('HUD_TICK', this.snapshot());
    this.emit('RACE_TICK', this.snapshot().race);
    if (this.dist >= RACE.goal && this.run.wordsDone >= RACE.minWords) this.clear();
    else if (this.timeLeft <= 0) this.fail('time');
  }

  private caught() {
    this.catches++;
    this.catchRecoveryLeft = RACE.catchRecoverySec;
    let hpLoss = 0;
    if (!this.run.isShielded()) {
      hpLoss = RACE.catchHp;
      this.playerHp = Math.max(0, this.playerHp - hpLoss);
    }
    this.slowLeft = RACE.typoSec;
    this.noTypoStreak = 0;
    this.emit('RACE_CAUGHT', { hpLoss, catches: this.catches, max: RACE.maxCatches });
    if (hpLoss > 0) this.emit('PLAYER_HIT', { hpLoss, hp: this.playerHp });
    if (this.catches >= RACE.maxCatches || this.playerHp <= 0) this.fail('hp');
  }

  commit(value: string) {
    if (!this.running || this.finished) return;
    this.run.onCommit(value);
  }

  /** 방향키: 이 모드는 연출만(이동·점프·앉기가 판정에 영향 없음) */
  move(dir: 'left' | 'right' | 'up' | 'down', pressed: boolean) {
    if (!this.running || this.finished) return;
    this.emit('PLAYER_MOVE', { dir, pressed });
  }

  skip(): boolean {
    if (!this.running || this.finished) return false;
    const t = this.run.current;
    if (!t) return false;
    const r = this.run.skip();
    if (!r) return false;
    this.wordSec = 0;
    this.run.advance();
    this.emit('TARGET_CHANGED', this.snapshot());
    return true;
  }

  submit(value: string, usedBackspace: boolean) {
    if (!this.running || this.finished) return;
    const t = this.run.current;
    if (!t) return;
    const r = this.run.submit(value, usedBackspace);
    if (!r) return;
    if (!r.correct) {
      if (!r.forgiven) {
        this.slowLeft = RACE.typoSec;
        this.noTypoStreak = 0;
      }
      this.applyHp(r.hpDelta);
      this.emit('INPUT_WRONG', { typed: value, target: t, hpLoss: r.hpDelta < 0 ? -r.hpDelta : 0, timeLoss: 0, forgiven: r.forgiven, shielded: this.run.isShielded(), snapshot: this.snapshot() });
      if (this.playerHp <= 0) { this.fail('hp'); return; }
      // 고쳐 완성한 낱말만 가속한다. 오답 뒤의 수정 시간도 이번 낱말 기록에 포함한다.
      this.emit('TARGET_CHANGED', this.snapshot());
      return;
    }
    const combo = this.run.combo;
    const strokes = countStrokes(t.text);
    this.score += calcWordScore(combo, r.perfect, strokes) + r.bonusScore;
    this.applyHp(r.hpDelta);
    this.boostLeft = RACE.boostSec;
    this.sinceCorrect = 0;
    this.recentCpm.push(this.wordSec > 0 ? (strokes / this.wordSec) * 60 : 0);
    if (this.recentCpm.length > 3) this.recentCpm.shift();
    this.wordSec = 0;
    if (r.perfect) this.noTypoStreak++;
    else this.noTypoStreak = 0;
    let turbo = false;
    if (this.noTypoStreak > 0 && this.noTypoStreak % RACE.turboWords === 0) {
      this.turboLeft = RACE.turboSec;
      turbo = true;
    }
    if (r.variant === 'heart') {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + RULES.heartHp);
      this.timeLeft += RULES.heartTime;
    }
    if (r.petActive === 'time_plus') this.boostLeft += 1; // 토끼: 이동 순간이동 대신 가속 지속
    if (r.petActive === 'fire_aoe' || r.feverEntered) this.chaserSlowLeft = RACE.petSlowSec;
    this.emit('INPUT_CORRECT', { target: t, perfect: r.perfect, corrected: r.corrected, damage: 0, gained: 0, combo, mult: r.mult, variant: r.variant, snapshot: this.snapshot() });
    if (turbo) this.emit('RACE_TURBO', { streak: this.noTypoStreak });
    this.run.advance();
    this.emit('TARGET_CHANGED', this.snapshot());
  }

  private applyHp(delta: number) {
    if (!delta) return;
    this.playerHp = Math.max(0, Math.min(this.playerMaxHp, this.playerHp + delta));
    if (delta < 0) this.emit('PLAYER_HIT', { hpLoss: -delta, hp: this.playerHp });
    else this.emit('HP_HEAL', { amount: delta, hp: this.playerHp });
  }

  private clear() {
    this.finished = true;
    this.running = false;
    this.run.stats.stop();
    this.score += Math.round(this.timeLeft) * 5 + Math.round(this.playerHp * RULES.hpClearBonusPerHp);
    this.beatGhost = this.ghost ? this.elapsed < this.ghost.finishSec : undefined;
    this.emit('RACE_FINISH', { elapsed: this.elapsed, beatGhost: this.beatGhost, catches: this.catches });
    this.emit('STAGE_CLEAR', this.snapshot());
  }
  private fail(reason: 'time' | 'hp') {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.run.stats.stop();
    this.emit('STAGE_FAILED', { reason, snapshot: this.snapshot() });
  }

  /** 중간 저장. 셔플된 낱말 순서(id)도 남겨 같은 낱말이 이어진다. */
  serialize(): CheckpointState {
    return {
      dist: this.dist, chaser: this.chaser, elapsed: this.elapsed, catches: this.catches, playerHp: this.playerHp, timeLeft: this.timeLeft,
      // 보고 있던 낱말이 복원 뒤 다시 나오도록 커서를 한 칸 되돌린다(뽑을 때 이미 지나갔다).
      score: this.score, samples: [...this.samples], noTypoStreak: this.noTypoStreak, cursor: this.run.current ? Math.max(0, this.cursor - 1) : this.cursor, pool: this.pool.map((u) => u.id),
      recentCpm: [...this.recentCpm], run: this.run.serializeCounters(),
    };
  }

  /** 복원 — start() 전에. 추격자는 조금 뒤에서 잠시 비틀거리며 시작해 아이가 다시 손을 올릴 시간을 준다. */
  restore(state: CheckpointState) {
    const s = obj(state);
    this.pool = restoreOrder(this.pool, s.pool, (u) => u.id);
    this.cursor = readInt(s.cursor, 0, 0, 1e6);
    this.dist = readNum(s.dist, 0, 0, RACE.goal - 1);
    this.chaser = Math.min(readNum(s.chaser, RACE.chaserStart, -1e5, RACE.goal), this.dist - 10);
    this.catchRecoveryLeft = RACE.catchRecoverySec;
    this.elapsed = readNum(s.elapsed, 0, 0, 86400);
    this.catches = readInt(s.catches, 0, 0, RACE.maxCatches - 1);
    this.playerHp = readNum(s.playerHp, this.playerMaxHp, 1, this.playerMaxHp);
    this.timeLeft = readNum(s.timeLeft, this.timeLimit, 0, this.timeLimit);
    this.score = readInt(s.score, 0, 0, 1e7);
    const samples = readNums(s.samples).map((n) => Math.min(RACE.goal, Math.max(0, n)));
    this.samples = samples.length ? samples : [0];
    this.noTypoStreak = readInt(s.noTypoStreak, 0, 0, 1e5);
    this.recentCpm = readNums(s.recentCpm, 3).map((n) => Math.min(3000, Math.max(0, n)));
    this.run.restoreCounters(s.run);
  }

  /** 클리어 시 저장할 고스트 (더 빠를 때만 호출자가 저장) */
  ghostRecord(): GhostRecord {
    return { samples: [...this.samples, RACE.goal], finishSec: Math.round(this.elapsed * 10) / 10, goalDistance: RACE.goal, rulesVersion: RACE.rulesVersion };
  }

  wordsSeen(): string[] {
    return this.run.wordsSeen();
  }

  snapshot(): BattleSnapshot {
    const r = this.run;
    const gap = Math.max(0, this.dist - this.chaser);
    const enemy: EnemyState = { id: 'chaser', name: '검은 그림자', sheet: this.chaserSheet, hp: Math.min(100, Math.round(gap)), maxHp: 100, scale: 1 };
    const ghost = this.ghostDist();
    return {
      targetIndex: r.wordsDone,
      targetTotal: 0,
      target: r.current,
      combo: r.combo,
      maxCombo: r.maxCombo,
      score: this.score,
      playerHp: this.playerHp,
      playerMaxHp: this.playerMaxHp,
      timeLeft: this.timeLeft,
      timeLimit: this.timeLimit,
      accuracy: r.stats.accuracy(),
      cpm: r.stats.cpm(),
      enemy,
      enemyIndex: 0,
      enemyTotal: 1,
      enemyLabel: `${Math.round(gap)}m 뒤`,
      totalEnemyHp: RACE.goal,
      dealtDamage: Math.min(RACE.goal, this.dist),
      perfectCount: r.perfectCount,
      wordsDone: r.wordsDone,
      elapsedSec: r.stats.elapsedSec(),
      feverLevel: r.feverLevel,
      feverLeft: r.feverLeft,
      bombLeft: r.bombLeft(),
      shielded: r.isShielded(),
      coins: r.coins,
      nextHint: r.wordHint ? (this.pool[this.cursor % this.pool.length]?.text ?? null) : null,
      race: {
        goal: RACE.goal,
        player: Math.min(RACE.goal, this.dist),
        chaser: this.chaser,
        ghost,
        speed: this.speed(),
        turboLeft: this.turboLeft,
        boostLeft: this.boostLeft,
        slowLeft: this.slowLeft,
        catches: this.catches,
        noTypoStreak: this.noTypoStreak,
        ghostAhead: ghost != null && ghost > this.dist,
        gap,
        threat: clamp(1 - gap / 40, 0, 1),
        chaserSpeed: this.chaserVelocity,
        catchRecoveryLeft: this.catchRecoveryLeft,
      },
    };
  }
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const approach = (value: number, target: number, step: number) => value < target ? Math.min(target, value + step) : Math.max(target, value - step);
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
