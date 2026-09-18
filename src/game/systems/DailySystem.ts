/**
 * 오늘의 도전 — 날짜 시드로 매일 같은 낱말 20개. 적도 시간제한도 없고, 오늘의 타수·정확도 기록만 남긴다.
 *  같은 날 다시 하면 더 좋은 기록만 저장. 인증서에 반영.
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { calcWordScore } from './TypingStats';
import { TypingRun, type Emit } from './TypingRun';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, TypingMode, CheckpointState } from './BattleState';
import { obj, readInt, readNum, readUnits } from './Checkpoint';

export const DAILY = { words: 20, sentences: 10 };
export type DailyKind = 'word' | 'sentence' | 'long';

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

/** 오늘의 낱말/문장 N개 (풀에서 시드 셔플). count 기본값은 낱말 20개(기존 동작 유지) */
export function pickDailyWords(pool: ContentUnit[], count = DAILY.words, key = todayKey()): ContentUnit[] {
  const rnd = seededRandom(key);
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

/** 순서N 태그 기준 정렬 (없으면 원래 순서) */
function byOrder(a: ContentUnit, b: ContentUnit): number {
  const n = (u: ContentUnit) => Number((u.tags.find((t) => t.startsWith('순서')) ?? '순서0').slice(2));
  return n(a) - n(b);
}

/** 오늘의 긴 글 한 편 — 날짜 시드로 후보 중 하나를 골라 순서대로 이어 붙인다.
 *  pool 은 장문 조각(같은 피스 태그를 공유하는 여러 문장)들이 뒤섞여 들어온다. */
export function pickDailyLong(pool: ContentUnit[], key = todayKey()): ContentUnit[] {
  const pieceTags = [...new Set(pool.flatMap((u) => u.tags.filter((t) => /^장문\d+$/.test(t))))].sort();
  if (pieceTags.length === 0) return pool.sort(byOrder);
  const idx = Math.floor(seededRandom(key)() * pieceTags.length);
  const tag = pieceTags[idx];
  return pool.filter((u) => u.tags.includes(tag)).sort(byOrder);
}

/** finalizeAndSave(ScoreSystem)가 기록 키를 종류별로 나누려고 참조 — 오늘의 도전은 한 번에 하나만 진행되므로 모듈 전역으로 충분 */
let activeKind: DailyKind = 'word';
export function currentDailyKind(): DailyKind {
  return activeKind;
}

export class DailySystem implements TypingMode {
  readonly stage: StageDef;
  readonly difficulty: Difficulty;
  readonly run: TypingRun;
  readonly kind: DailyKind;
  score = 0;
  finished = false;
  running = false;
  elapsed = 0;
  private emit: Emit;
  private words: ContentUnit[];
  private idx = 0;

  constructor(stage: StageDef, difficulty: Difficulty, pet: PetDef, words: ContentUnit[], emit: Emit, kind: DailyKind = 'word') {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.words = [...words];
    this.kind = kind;
    activeKind = kind;
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
  /** 방향키: 이 모드는 연출만 */
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
    this.words.push(this.words.splice(this.idx, 1)[0]);
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
      this.emit('INPUT_WRONG', { typed: value, target: t, hpLoss: 0, timeLoss: 0, forgiven: r.forgiven, shielded: this.run.isShielded(), snapshot: this.snapshot() });
      // 오늘의 기록도 정확히 완료한 입력으로만 채운다. 같은 목표를 다시 고칠 수 있다.
      this.emit('TARGET_CHANGED', this.snapshot());
      return;
    }
    this.score += calcWordScore(this.run.combo, r.perfect, countStrokes(t.text));
    this.idx++;
    this.emit('INPUT_CORRECT', { target: t, perfect: r.perfect, corrected: r.corrected, damage: 0, gained: 0, combo: this.run.combo, mult: r.mult, snapshot: this.snapshot() });
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
  /** 중간 저장. 오늘의 낱말은 날짜 시드로 같지만, 건너뛰기 순서까지 그대로 잇도록 목록을 남긴다. */
  serialize(): CheckpointState {
    return { idx: this.idx, score: this.score, elapsed: this.elapsed, words: this.words.map((u) => ({ ...u })), run: this.run.serializeCounters() };
  }
  /** 복원 — start() 전에. */
  restore(state: CheckpointState) {
    const s = obj(state);
    const words = readUnits(s.words, this.stage.id, 60);
    if (words.length) this.words = words;
    this.idx = readInt(s.idx, 0, 0, Math.max(0, this.words.length - 1));
    this.score = readInt(s.score, 0, 0, 1e7);
    this.elapsed = readNum(s.elapsed, 0, 0, 86400);
    this.run.restoreCounters(s.run);
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
