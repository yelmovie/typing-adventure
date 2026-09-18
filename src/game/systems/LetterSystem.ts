/**
 * 스테이지 3 「사막 유적」 편지 복원 — 문장·장문 타이핑을 "문을 여는 퍼즐"로.
 *  - 편지 9문장이 한 줄씩 나타난다. 3문장 = 자물쇠 1개 (총 3개). 9문장 → 황금문 개방.
 *  - 어절(띄어쓰기 단위)마다 룬이 하나. 어절을 다 치면 룬 점등, 틀린 음절 확정 시 룬 균열, 고치면 복구.
 *  - 10글자 연속 무오타 → 룬 발광(LETTER_GLOW). 한 문장 무오타 → PERFECT.
 *  - 시간제한·읽기 대기 감점 없음. 5초 무입력 → 천천히 읽기 안내만.
 *  - PERFECT 문장 2개 → 비밀방(코인 +30), 정확도 98% 이상 → 비밀 보상(코인 +20).
 *  - 「다음 조각 고르기」(읽기 단계): 시작할 때와 문장을 완성할 때마다 다음 문장을 후보 3개 중에서 먼저 고른다.
 *    고르는 동안 run.current 는 null(입력창 닫힘). 잘못 고르면 힌트(첫 낱말)만 주고 읽기 실수로 세며 타자 정확도에는 넣지 않는다.
 *    점프는 고르기도 건너뛴다(점프 1회 소모, 그 문장은 뒤로).
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcWordScore } from './TypingStats';
import { TypingRun, RULES, type Emit } from './TypingRun';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, TypingMode, CheckpointState } from './BattleState';
import { obj, readBool, readInt, readNum, readStrings, readUnits } from './Checkpoint';

export const LETTER = {
  sentences: 9,
  perLock: 3,
  locks: 3,
  idleSec: 5,
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
  /** 「다음 조각 고르기」 후보 3개. 고르는 중이 아니면 null */
  choices: string[] | null;
  /** 잘못 고른 뒤의 힌트(정답 문장의 첫 낱말) */
  choiceHint: string | null;
  /** 읽기(순서) 실수 수. 타자 정확도·오답 근거에는 들어가지 않는다 */
  readingMistakes: number;
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
  /** 읽기 단계 기록. 타자 통계(TypingStats·learningAttempts)와 섞지 않는다. */
  readingMistakes = 0;
  choicesMade = 0;
  private choiceUnits: ContentUnit[] | null = null;
  private choosing = false;
  private choiceHint: string | null = null;
  private extras: ContentUnit[];
  private rnd: () => number;
  private syncTargetOnTick = false;

  constructor(
    stage: StageDef,
    difficulty: Difficulty,
    pet: PetDef,
    sentences: ContentUnit[],
    emit: Emit,
    options: { /** 오답 후보로 쓸 다른 문장(같은 지역·다른 이야기). 없으면 편지 안에서만 고른다 */ distractors?: ContentUnit[]; random?: () => number } = {},
  ) {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.sentences = sentences.slice(0, LETTER.sentences);
    this.extras = options.distractors ?? [];
    this.rnd = options.random ?? Math.random;
    const rule = DIFFICULTY_RULES[difficulty];
    this.playerMaxHp = rule.playerHp;
    this.playerHp = rule.playerHp;
    // 고르는 동안에는 목표가 없다(입력창 닫힘, 타수 시간 제외).
    this.run = new TypingRun({ stage, difficulty, pet, next: () => (this.choosing ? null : this.sentences[this.idx] ?? null), emit });
  }

  private words(text: string): string[] {
    return text.split(' ').filter(Boolean);
  }

  start() {
    this.running = true;
    // 첫 문장(복원 뒤에는 다음 문장)부터 「다음 조각 고르기」로 시작한다. 고르는 동안 목표는 없다.
    this.choosing = true;
    this.run.start();
    this.resetRunes();
    this.emit('BATTLE_START', this.snapshot());
    this.emitRestoredProgress();
    this.openChoice();
    this.emit('TARGET_CHANGED', this.snapshot());
    // 화면이 start() 직후 입력창을 무조건 열 수 있어(BattleScreen.start), 첫 tick 에 '목표 없음'을 한 번 더 알린다(멱등).
    this.syncTargetOnTick = true;
  }
  pause() {
    this.running = false;
  }

  /** 복원한 판: 이미 되찾은 문장과 열린 자물쇠를 씬이 다시 그리도록 알린다(연출·판정 문구 없이, restored 표시). */
  private emitRestoredProgress() {
    if (!this.lines.length) return;
    this.emit('LETTER_LINE', { index: this.lines.length - 1, text: this.lines[this.lines.length - 1], perfect: false, restored: true });
    for (let lock = 1; lock <= this.locksOpen; lock++) this.emit('LETTER_LOCK', { lock, total: LETTER.locks, restored: true });
  }

  /** 중간 저장. 편지 문장 자체를 남겨 변형 도전에서도 같은 편지가 이어진다. */
  serialize(): CheckpointState {
    return {
      idx: this.idx, lines: [...this.lines], locksOpen: this.locksOpen, perfectLines: this.perfectLines, secretRoom: this.secretRoom,
      elapsed: this.elapsed, score: this.score, playerHp: this.playerHp, sentences: this.sentences.map((u) => ({ ...u })), run: this.run.serializeCounters(),
    };
  }

  /** 복원 — start() 전에. 자물쇠 수는 되찾은 문장 수에서 다시 계산한다. 문장 사이 선택이 걸려 있었다면 다시 고른다. */
  restore(state: CheckpointState) {
    const s = obj(state);
    const sentences = readUnits(s.sentences, this.stage.id, LETTER.sentences).map((u) => ({ ...u, type: 'sentence' as const }));
    if (sentences.length) this.sentences = sentences;
    this.lines = readStrings(s.lines, Math.max(0, this.sentences.length - 1));
    this.idx = this.lines.length;
    this.locksOpen = Math.min(LETTER.locks, Math.floor(this.lines.length / LETTER.perLock));
    this.perfectLines = readInt(s.perfectLines, 0, 0, this.lines.length);
    this.secretRoom = readBool(s.secretRoom, false);
    this.elapsed = readNum(s.elapsed, 0, 0, 86400);
    this.score = readInt(s.score, 0, 0, 1e7);
    this.playerHp = readNum(s.playerHp, this.playerMaxHp, 1, this.playerMaxHp);
    this.streak = 0;
    this.run.restoreCounters(s.run);
  }
  resume() {
    if (!this.finished) this.running = true;
  }

  /** 후보 3개 = 정답 + 오답 2개. 오답은 아직 안 쓴 뒤 문장 → 다른 후보 문장(사막·리믹스) → 이미 되찾은 문장 순으로 채운다. */
  private openChoice() {
    const correct = this.sentences[this.idx];
    if (!correct) return;
    const inLetter = new Set(this.sentences.map((u) => u.text));
    const pool = [
      ...this.shuffle(this.sentences.slice(this.idx + 1)),
      ...this.shuffle(this.extras.filter((u) => !inLetter.has(u.text))),
      ...this.shuffle(this.sentences.slice(0, this.idx)),
    ];
    const distractors: ContentUnit[] = [];
    for (const u of pool) {
      if (distractors.length >= 2) break;
      if (u.text !== correct.text && !distractors.some((d) => d.text === u.text)) distractors.push(u);
    }
    this.choiceUnits = this.shuffle([correct, ...distractors]);
    this.choosing = true;
    this.choiceHint = null;
    this.emit('LETTER_CHOICE', { choices: this.choiceUnits.map((u) => u.text), index: this.lines.length, total: LETTER.sentences, choose: (i: number) => this.choose(i) });
  }

  /** 후보를 고른다. 정답이면 그 문장이 입력 목표가 된다. 오답이면 힌트만 주고 계속 고른다(타자 정확도와 무관). */
  choose(index: number): boolean {
    if (!this.running || this.finished || !this.choiceUnits) return false;
    const picked = this.choiceUnits[index];
    const correct = this.sentences[this.idx];
    if (!picked || !correct) return false;
    this.idleSec = 0;
    this.choicesMade++;
    if (picked.text !== correct.text) {
      this.readingMistakes++;
      const words = this.words(correct.text);
      this.choiceHint = words.length > 1 ? words[0] : correct.text.slice(0, 2);
      this.emit('LETTER_CHOICE_WRONG', { index, text: picked.text, hint: this.choiceHint, mistakes: this.readingMistakes });
      return false;
    }
    this.closeChoice();
    this.run.advance();
    this.resetRunes();
    this.emit('LETTER_CHOICE_OK', { index, text: correct.text });
    this.emit('TARGET_CHANGED', this.snapshot());
    return true;
  }

  private closeChoice() {
    this.choiceUnits = null;
    this.choosing = false;
    this.choiceHint = null;
  }

  private shuffle<T>(list: T[]): T[] {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private resetRunes() {
    const cur = this.run.current;
    this.runes = cur ? this.words(cur.text).map(() => 'off' as const) : [];
    this.lastMatched = 0;
  }

  tick(dt: number) {
    if (!this.running || this.finished) return;
    if (this.syncTargetOnTick) {
      this.syncTargetOnTick = false;
      if (this.choosing) this.emit('TARGET_CHANGED', this.snapshot());
    }
    this.elapsed += dt;
    this.run.tick(dt);
    this.idleSec += dt;
    const idle = this.idleSec >= LETTER.idleSec;
    if (idle !== this.idleOn) {
      this.idleOn = idle;
      this.emit('LETTER_IDLE', { idle });
    }
    // 읽고 생각하는 동안 점수·콤보·HP를 깎지 않는다.
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
    if (this.choiceUnits) {
      // 고르는 중의 점프: 고르기를 건너뛰고 그 문장도 뒤로 보낸다(점프 1회 소모, 읽기 실수 아님). 다음 문장은 바로 목표가 된다.
      if (this.run.skipsLeft <= 0) return false;
      this.closeChoice();
      this.run.advance();
    }
    const t = this.run.current;
    if (!t) return false;
    const r = this.run.skip();
    if (!r) return false;
    this.streak = 0;
    // 미완료 문장을 뒤로 보낸다. 열린 자물쇠와 복원된 문장 수는 그대로다.
    this.sentences.push(this.sentences.splice(this.idx, 1)[0]);
    this.run.advance();
    this.resetRunes();
    this.emit('TARGET_CHANGED', this.snapshot());
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
      this.emit('INPUT_WRONG', { typed: value, target: cur, hpLoss: r.hpDelta < 0 ? -r.hpDelta : 0, timeLoss: 0, forgiven: r.forgiven, shielded: this.run.isShielded(), snapshot: this.snapshot() });
      // 동일 문장을 고쳐서 제출해야 룬과 자물쇠가 완성된다.
      if (this.playerHp <= 0) this.fail('hp');
      else this.emit('TARGET_CHANGED', this.snapshot());
      return;
    }
    const combo = this.run.combo;
    this.score += calcWordScore(combo, r.perfect, countStrokes(cur.text)) + LETTER.sentenceBonus + r.bonusScore;
    this.applyHp(r.hpDelta);
    if (r.perfect) this.perfectLines++;
    this.lines.push(cur.text);
    this.idx++;
    this.emit('INPUT_CORRECT', { target: cur, perfect: r.perfect, corrected: r.corrected, damage: 0, gained: 0, combo, mult: r.mult, variant: r.variant, snapshot: this.snapshot() });
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
    if (this.lines.length >= this.sentences.length && this.sentences.length > 0) {
      this.clear();
      return;
    }
    // 다음 문장은 바로 주지 않고 후보 3개 중에서 고르게 한다(읽기 단계).
    this.choosing = true;
    this.run.advance();
    this.resetRunes();
    this.openChoice();
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
      nextHint: r.wordHint && !this.choosing ? (this.sentences[this.idx + 1]?.text ?? null) : null,
      letter: {
        lines: this.lines,
        current: r.current?.text ?? null,
        runes: [...this.runes],
        locks: this.locksOpen,
        idle: this.idleOn,
        streak: this.streak,
        perfectLines: this.perfectLines,
        secretRoom: this.secretRoom,
        choices: this.choiceUnits ? this.choiceUnits.map((u) => u.text) : null,
        choiceHint: this.choiceHint,
        readingMistakes: this.readingMistakes,
      },
    };
  }
}

// RULES 참조 유지 (하트 낱말 등은 편지 모드에 없음)
void RULES;
