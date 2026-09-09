/**
 * 스테이지 3 「사막 유적」 편지 복원 — 문장·장문 타이핑을 "문을 여는 퍼즐"로.
 *  - 편지 6문장이 한 줄씩 나타난다. 2문장 = 자물쇠 1개 (총 3개). 6문장 → 황금문 개방.
 *  - 어절(띄어쓰기 단위)마다 룬이 하나. 어절을 다 치면 룬 점등, 틀린 음절 확정 시 룬 균열, 고치면 복구.
 *  - 10글자 연속 무오타 → 룬 발광(LETTER_GLOW). 한 문장 무오타 → PERFECT.
 *  - 시간제한 없음. 5초 무입력 → 모래시계(점수만 초당 -5).
 *  - PERFECT 문장 2개 → 비밀방(코인 +30), 정확도 98% 이상 → 비밀 보상(코인 +20).
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcWordScore } from './TypingStats';
import { TypingRun, RULES, type Emit } from './TypingRun';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, TypingMode } from './BattleSystem';

export const LETTER = {
  sentences: 6,
  perLock: 2,
  locks: 3,
  idleSec: 5,
  idleScorePerSec: 5,
  glowStreak: 10,
  secretPerfect: 2,
  secretCoins: 30,
  accuracyReward: 98,
  accuracyCoins: 20,
  sentenceBonus: 300,
};

export interface LetterInfo {
  lines: string[]; // 완성된 문장들
  current: string | null;
  runes: ('off' | 'on' | 'crack')[]; // 현재 문장의 어절 룬
  locks: number; // 열린 자물쇠 수
  idle: boolean;
  streak: number; // 연속 무오타 글자 수
  perfectLines: number;
  secretRoom: boolean;
}

export class LetterSystem implements TypingMode {
  readonly stage: StageDef;
  readonly difficulty: Difficulty;
  readonly run: TypingRun;
  score = 0;
  playerHp: number;
  playerMaxHp: number;
  finished = false;
  running = false;
  elapsed = 0;
  lines: string[] = [];
  locksOpen = 0;
  perfectLines = 0;
  secretRoom = false;
  accuracyReward = false;

  private emit: Emit;
  private sentences: ContentUnit[];
  private idx = 0;
  private runes: ('off' | 'on' | 'crack')[] = [];
  private idleSec = 0;
  private idleOn = false;
  private streak = 0;
  private lastMatched = 0;

  constructor(stage: StageDef, difficulty: Difficulty, pet: PetDef, sentences: ContentUnit[], emit: Emit) {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.sentences = sentences.slice(0, LETTER.sentences);
    const rule = DIFFICULTY_RULES[difficulty];
    this.playerMaxHp = rule.playerHp;
    this.playerHp = rule.playerHp;
    this.run = new TypingRun({ stage, difficulty, pet, next: () => this.sentences[this.idx] ?? null, emit });
  }

  private words(text: string): string[] {
    return text.split(' ').filter(Boolean);
  }

  start() {
    this.running = true;
    this.run.start();
    this.resetRunes();
    this.emit('BATTLE_START', this.snapshot());
    this.emit('TARGET_CHANGED', this.snapshot());
  }
  pause() {
    this.running = false;
  }
  resume() {
    if (!this.finished) this.running = true;
  }

  private resetRunes() {
    const cur = this.run.current;
    this.runes = cur ? this.words(cur.text).map(() => 'off' as const) : [];
    this.lastMatched = 0;
  }

  tick(dt: number) {
    if (!this.running || this.finished) return;
    this.elapsed += dt;
    this.run.tick(dt);
    this.idleSec += dt;
    const idle = this.idleSec >= LETTER.idleSec;
    if (idle) this.score = Math.max(0, this.score - LETTER.idleScorePerSec * dt);
    if (idle !== this.idleOn) {
      this.idleOn = idle;
      this.emit('LETTER_IDLE', { idle });
    }
    // S3 는 시간제한 없이 편지를 읽고 옮겨 적는 스테이지라 멈춤 벌칙은 점수(모래시계)만. HP 는 깎지 않는다.
    this.emit('HUD_TICK', this.snapshot());
  }

  /** 확정 문자열 변화 → 어절 룬 점등/균열 */
  commit(value: string) {
    if (!this.running || this.finished) return;
    const cur = this.run.current;
    if (!cur) return;
    this.idleSec = 0;
    const { newHits, wrongIndex } = this.run.onCommit(value);
    const v = value.normalize('NFC');
    const t = cur.text;
    if (wrongIndex >= 0) {
      // 틀린 글자가 속한 어절의 룬 균열
      const wi = Math.max(0, t.slice(0, wrongIndex).split(' ').length - 1);
      if (this.runes[wi] !== 'crack') {
        this.runes[wi] = 'crack';
        this.streak = 0;
        this.emit('LETTER_CRACK', { index: wi });
      }
      return;
    }
    // 접두어가 맞음: 균열 복구
    const cracked = this.runes.indexOf('crack');
    if (cracked >= 0) {
      this.runes[cracked] = 'off';
      this.emit('LETTER_RESTORE', { index: cracked });
    }
    // 완성된 어절 수 = 입력이 목표의 어절 경계까지 정확히 덮은 개수
    const ws = this.words(t);
    let acc = 0;
    let done = 0;
    for (const w of ws) {
      acc += w.length;
      if (v.length >= acc && v.slice(0, acc) === t.slice(0, acc)) done++;
      else break;
      acc += 1; // 공백
    }
    for (let i = 0; i < done; i++) {
      if (this.runes[i] !== 'on') {
        this.runes[i] = 'on';
        this.emit('LETTER_RUNE', { index: i, total: ws.length });
      }
    }
    if (newHits > 0) {
      this.streak += newHits;
      if (this.streak >= LETTER.glowStreak && this.streak - newHits < LETTER.glowStreak) this.emit('LETTER_GLOW', { streak: this.streak });
    }
    this.lastMatched = Math.max(this.lastMatched, done);
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
    this.streak = 0;
    this.lines.push(t.text);
    this.idx++;
    this.emit('LETTER_LINE', { index: this.lines.length - 1, text: t.text, perfect: false, wrong: true });
    this.afterLine();
    return true;
  }

  submit(value: string, usedBackspace: boolean) {
    if (!this.running || this.finished) return;
    const cur = this.run.current;
    if (!cur) return;
    this.idleSec = 0;
    const r = this.run.submit(value, usedBackspace);
    if (!r) return;
    if (!r.correct) {
      this.streak = 0;
      this.applyHp(r.hpDelta);
      this.emit('INPUT_WRONG', { typed: value, target: cur, hpLoss: r.hpDelta < 0 ? -r.hpDelta : 0, timeLoss: 0, forgiven: r.forgiven, shielded: false, snapshot: this.snapshot() });
      // 틀린 채 Enter → 그 문장은 흐릿하게 기록되고 다음 문장으로 (점수 없음, PERFECT 아님)
      this.lines.push(cur.text);
      this.idx++;
      this.emit('LETTER_LINE', { index: this.lines.length - 1, text: cur.text, perfect: false, wrong: true });
      this.afterLine();
      if (!this.finished && this.playerHp <= 0) this.fail('hp');
      return;
    }
    const combo = this.run.combo;
    this.score += calcWordScore(combo, r.perfect, countStrokes(cur.text)) + LETTER.sentenceBonus + r.bonusScore;
    this.applyHp(r.hpDelta);
    if (r.perfect) this.perfectLines++;
    this.lines.push(cur.text);
    this.idx++;
    this.emit('INPUT_CORRECT', { target: cur, perfect: r.perfect, damage: 0, gained: 0, combo, mult: r.mult, variant: r.variant, snapshot: this.snapshot() });
    this.emit('LETTER_LINE', { index: this.lines.length - 1, text: cur.text, perfect: r.perfect });
    this.afterLine();
  }

  /** 문장 하나가 끝난 뒤 공통: 자물쇠·비밀방·클리어·다음 문장 */
  private afterLine() {
    if (this.lines.length % LETTER.perLock === 0 && this.locksOpen < LETTER.locks) {
      this.locksOpen++;
      this.emit('LETTER_LOCK', { lock: this.locksOpen, total: LETTER.locks });
    }
    if (!this.secretRoom && this.perfectLines >= LETTER.secretPerfect) {
      this.secretRoom = true;
      this.run.coins += LETTER.secretCoins;
      this.emit('LETTER_SECRET', { coins: LETTER.secretCoins });
    }
    if (this.lines.length >= LETTER.sentences) {
      this.clear();
      return;
    }
    this.run.advance();
    this.resetRunes();
    this.emit('TARGET_CHANGED', this.snapshot());
  }

  private fail(reason: 'time' | 'hp') {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.run.stats.stop();
    this.emit('STAGE_FAILED', { reason, snapshot: this.snapshot() });
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
    if (this.run.stats.accuracy() >= LETTER.accuracyReward) {
      this.accuracyReward = true;
      this.run.coins += LETTER.accuracyCoins;
    }
    this.score += this.perfectLines * 200 + Math.round(this.playerHp * RULES.hpClearBonusPerHp);
    this.emit('LETTER_GATE', { perfectLines: this.perfectLines, secretRoom: this.secretRoom, accuracyReward: this.accuracyReward });
    this.emit('STAGE_CLEAR', this.snapshot());
  }

  wordsSeen(): string[] {
    return this.run.wordsSeen();
  }

  snapshot(): BattleSnapshot {
    const r = this.run;
    return {
      targetIndex: this.lines.length,
      targetTotal: LETTER.sentences,
      target: r.current,
      combo: r.combo,
      maxCombo: r.maxCombo,
      score: Math.round(this.score),
      playerHp: this.playerHp,
      playerMaxHp: this.playerMaxHp,
      timeLeft: this.elapsed,
      timeLimit: 0,
      accuracy: r.stats.accuracy(),
      cpm: r.stats.cpm(),
      enemy: null,
      enemyIndex: 0,
      enemyTotal: 0,
      totalEnemyHp: LETTER.sentences,
      dealtDamage: this.lines.length,
      perfectCount: r.perfectCount,
      wordsDone: r.wordsDone,
      elapsedSec: r.stats.elapsedSec(),
      feverLevel: r.feverLevel,
      feverLeft: r.feverLeft,
      bombLeft: r.bombLeft(),
      shielded: r.isShielded(),
      coins: r.coins,
      nextHint: r.wordHint ? (this.sentences[this.idx + 1]?.text ?? null) : null,
      letter: {
        lines: this.lines,
        current: r.current?.text ?? null,
        runes: [...this.runes],
        locks: this.locksOpen,
        idle: this.idleOn,
        streak: this.streak,
        perfectLines: this.perfectLines,
        secretRoom: this.secretRoom,
      },
    };
  }
}

// RULES 참조 유지 (하트 낱말 등은 편지 모드에 없음)
void RULES;
