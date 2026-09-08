/**
 * 오늘의 도전 — 날짜 시드로 매일 같은 낱말 20개. 적도 시간제한도 없고, 오늘의 타수·정확도 기록만 남긴다.
 *  같은 날 다시 하면 더 좋은 기록만 저장. 인증서에 반영.
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { calcWordScore } from './TypingStats';
import { TypingRun, type Emit } from './TypingRun';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, TypingMode } from './BattleSystem';

export const DAILY = { words: 20 };

/** YYYY-MM-DD (로컬) */
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 문자열 시드 → 0..1 난수 (mulberry32) */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 오늘의 낱말 20개 (풀에서 시드 셔플) */
export function pickDailyWords(pool: ContentUnit[], key = todayKey()): ContentUnit[] {
  const rnd = seededRandom(key);
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, DAILY.words);
}

export class DailySystem implements TypingMode {
  readonly stage: StageDef;
  readonly difficulty: Difficulty;
  readonly run: TypingRun;
  score = 0;
  finished = false;
  running = false;
  elapsed = 0;
  private emit: Emit;
  private words: ContentUnit[];
  private idx = 0;

  constructor(stage: StageDef, difficulty: Difficulty, pet: PetDef, words: ContentUnit[], emit: Emit) {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.words = words;
    this.run = new TypingRun({ stage, difficulty, pet, next: () => this.words[this.idx] ?? null, emit });
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
  tick(dt: number) {
    if (!this.running || this.finished) return;
    this.elapsed += dt;
    this.run.tick(dt);
    this.emit('HUD_TICK', this.snapshot());
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
      this.emit('INPUT_WRONG', { typed: value, target: t, hpLoss: 0, timeLoss: 0, forgiven: r.forgiven, shielded: false, snapshot: this.snapshot() });
      this.emit('TARGET_CHANGED', this.snapshot());
      return;
    }
    this.score += calcWordScore(this.run.combo, r.perfect, countStrokes(t.text));
    this.idx++;
    this.emit('INPUT_CORRECT', { target: t, perfect: r.perfect, damage: 0, gained: 0, combo: this.run.combo, mult: r.mult, snapshot: this.snapshot() });
    if (this.idx >= this.words.length) {
      this.finished = true;
      this.running = false;
      this.run.stats.stop();
      this.emit('STAGE_CLEAR', this.snapshot());
      return;
    }
    this.run.advance();
    this.emit('TARGET_CHANGED', this.snapshot());
  }
  wordsSeen(): string[] {
    return this.run.wordsSeen();
  }
  snapshot(): BattleSnapshot {
    const r = this.run;
    return {
      targetIndex: this.idx,
      targetTotal: this.words.length,
      target: r.current,
      combo: r.combo,
      maxCombo: r.maxCombo,
      score: this.score,
      playerHp: 100,
      playerMaxHp: 100,
      timeLeft: this.elapsed,
      timeLimit: 0,
      accuracy: r.stats.accuracy(),
      cpm: r.stats.cpm(),
      enemy: null,
      enemyIndex: 0,
      enemyTotal: 0,
      totalEnemyHp: this.words.length,
      dealtDamage: this.idx,
      perfectCount: r.perfectCount,
      wordsDone: r.wordsDone,
      elapsedSec: r.stats.elapsedSec(),
      feverLevel: r.feverLevel,
      feverLeft: r.feverLeft,
      bombLeft: r.bombLeft(),
      shielded: r.isShielded(),
      coins: r.coins,
      nextHint: r.wordHint ? (this.words[this.idx + 1]?.text ?? null) : null,
    };
  }
}
