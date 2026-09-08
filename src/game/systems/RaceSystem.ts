/**
 * 스테이지 2 「네온 시티」 추격 레이스 — 타이핑 속도가 곧 달리는 속도.
 *  - 1000m 트랙. 캐릭터는 자동으로 달리고(기본 4m/s), 낱말을 완성할 때마다 BOOST(1초), 최근 3낱말 타수로 지속 가속.
 *  - 오타 → 2초 동안 30% 감속. 10낱말 연속 무오타 → TURBO 5초(×1.5). FEVER 진입 → 추격자 100m 뒤로.
 *  - 추격자는 60m 뒤에서 4.5m/s 로 출발, 30초마다 +0.3m/s. 잡히면 HP-20 + 추격자 80m 뒤로. 3번 잡히면 실패.
 *  - 고스트: 개인 최고 기록의 1초 간격 거리 샘플. 화면에 '어제의 나'로 같이 달린다.
 *  - 1000m 도착 → 클리어. 시간 0 / 3회 피격 → 실패.
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcWordScore } from './TypingStats';
import { TypingRun, RULES, type Emit } from './TypingRun';
import { applyVariant } from '../data/content';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, EnemyState, TypingMode } from './BattleSystem';

export const RACE = {
  goal: 1000,
  baseSpeed: 4, // 추격자(4.2→가속)보다 느려서 가만히 있으면 잡힌다
  boostSpeed: 4, // 낱말 완성 직후 1초
  boostSec: 1,
  sustainMax: 3, // 최근 3낱말 타수(≈200타/분)에서 최대
  sustainCpm: 200,
  typoMul: 0.7,
  typoSec: 2,
  turboWords: 10,
  turboSec: 5,
  turboMul: 1.5,
  feverMul: 1.6,
  feverPush: 100,
  chaserStart: -60,
  chaserSpeed: 4.2, // 기본 4 보다 살짝 빠름 + 30초마다 가속 → 방치하면 약 110초에 잡힘
  chaserRamp: 0.3, // 30초마다
  chaserRampSec: 30,
  catchHp: 20,
  catchPush: 80,
  maxCatches: 3,
  ghostSampleSec: 1,
};

export interface GhostRecord {
  samples: number[]; // 1초마다 거리(m)
  finishSec: number;
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
  private ghost: GhostRecord | null;
  private chaserSheet: string;

  constructor(stage: StageDef, difficulty: Difficulty, pet: PetDef, words: ContentUnit[], ghost: GhostRecord | null, chaserSheet: string, emit: Emit) {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.pool = shuffle(words);
    this.ghost = ghost;
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
  speed(): number {
    const sustain = this.recentCpm.length ? Math.min(RACE.sustainMax, (avg(this.recentCpm) / RACE.sustainCpm) * RACE.sustainMax) : 0;
    let v = RACE.baseSpeed + sustain + (this.boostLeft > 0 ? RACE.boostSpeed : 0);
    if (this.slowLeft > 0) v *= RACE.typoMul;
    if (this.turboLeft > 0) v *= RACE.turboMul;
    if (this.run.feverLevel >= 2) v *= RACE.feverMul;
    return v;
  }

  chaserSpeed(): number {
    const rule = DIFFICULTY_RULES[this.difficulty];
    return (RACE.chaserSpeed + RACE.chaserRamp * Math.floor(this.elapsed / RACE.chaserRampSec)) / rule.timeMul;
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
    this.boostLeft = Math.max(0, this.boostLeft - dt);
    this.slowLeft = Math.max(0, this.slowLeft - dt);
    this.turboLeft = Math.max(0, this.turboLeft - dt);
    this.dist += this.speed() * dt;
    this.chaser += this.chaserSpeed() * dt;
    while (this.samples.length <= Math.floor(this.elapsed / RACE.ghostSampleSec)) this.samples.push(this.dist);
    if (this.run.tick(dt).bomb) {
      this.slowLeft = RACE.typoSec;
      this.run.advance();
      this.emit('TARGET_CHANGED', this.snapshot());
    }
    if (this.chaser >= this.dist) this.caught();
    if (this.finished) return;
    this.emit('HUD_TICK', this.snapshot());
    this.emit('RACE_TICK', this.snapshot().race);
    if (this.dist >= RACE.goal) this.clear();
    else if (this.timeLeft <= 0) this.fail('time');
  }

  private caught() {
    this.catches++;
    this.chaser = this.dist - RACE.catchPush;
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
      this.emit('INPUT_WRONG', { typed: value, target: t, hpLoss: 0, timeLoss: 0, forgiven: r.forgiven, shielded: false, snapshot: this.snapshot() });
      this.emit('TARGET_CHANGED', this.snapshot());
      return;
    }
    const combo = this.run.combo;
    const strokes = countStrokes(t.text);
    this.score += calcWordScore(combo, r.perfect, strokes) + r.bonusScore;
    this.boostLeft = RACE.boostSec;
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
    if (r.petActive === 'time_plus') this.dist += 5; // 토끼: 거리 +5m
    if (r.petActive === 'fire_aoe' || r.feverEntered) this.chaser -= RACE.feverPush;
    this.emit('INPUT_CORRECT', { target: t, perfect: r.perfect, damage: 0, gained: 0, combo, mult: r.mult, variant: r.variant, snapshot: this.snapshot() });
    if (turbo) this.emit('RACE_TURBO', { streak: this.noTypoStreak });
    this.run.advance();
    this.emit('TARGET_CHANGED', this.snapshot());
  }

  private clear() {
    this.finished = true;
    this.running = false;
    this.run.stats.stop();
    this.score += Math.round(this.timeLeft) * 5;
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

  /** 클리어 시 저장할 고스트 (더 빠를 때만 호출자가 저장) */
  ghostRecord(): GhostRecord {
    return { samples: [...this.samples, RACE.goal], finishSec: Math.round(this.elapsed * 10) / 10 };
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
      },
    };
  }
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
