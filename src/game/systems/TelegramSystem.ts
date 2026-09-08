/**
 * 스테이지 4 「폭주 열차」 긴급 전보 — 장문 + 시간 압박.
 *  - 위험 지점까지 280m, 열차는 초당 2m 씩 다가간다(기초 난이도는 느리게).
 *  - 전보 3문장. 전송률 = 완료 어절 / 전체 어절. 어절 완료마다 TELE_WORD.
 *  - 문장 완료 → 브레이크 1단(속도 25% 감소). 3문장 완료 → 비상 브레이크 → 열차 정지(클리어).
 *  - 오타 확정 → 1.5초 통신 끊김(그동안 입력 판정 정지). 10콤보 POWER → 전송률 +5% 보너스. FEVER(20) → 급감속(속도 절반).
 *  - 거리 0 전에 미완 → 급정지 실패.
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcWordScore } from './TypingStats';
import { TypingRun, RULES, type Emit } from './TypingRun';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, TypingMode } from './BattleSystem';

export const TELE = {
  dist: 280,
  speed: 2, // m/s
  brakeMul: 0.75,
  outageSec: 1.5,
  feverMul: 0.5,
  powerBonus: 0.05,
  sentenceBonus: 300,
};

export interface TelegramInfo {
  dist: number;
  speed: number;
  transfer: number; // 0..1
  brake: number; // 걸린 브레이크 단 수
  brakeTotal: number;
  outage: boolean;
  lines: string[];
  wordsDone: number;
  wordsTotal: number;
  stopped: boolean;
}

export class TelegramSystem implements TypingMode {
  readonly stage: StageDef;
  readonly difficulty: Difficulty;
  readonly run: TypingRun;
  score = 0;
  playerHp: number;
  playerMaxHp: number;
  finished = false;
  running = false;
  dist = TELE.dist;
  elapsed = 0;
  lines: string[] = [];
  brake = 0;
  stopped = false;

  private emit: Emit;
  private sentences: ContentUnit[];
  private idx = 0;
  private wordsTotal: number;
  private wordsDoneBefore = 0; // 완료된 문장들의 어절 수
  private wordsCur = 0; // 현재 문장에서 완료된 어절 수
  private outageLeft = 0;
  /** 통신 끊김 중에 들어온 제출은 버리지 않고 끊김이 끝나면 처리한다 (문장 소실 방지) */
  private queued: { value: string; usedBackspace: boolean } | null = null;
  private baseSpeed: number;

  constructor(stage: StageDef, difficulty: Difficulty, pet: PetDef, sentences: ContentUnit[], emit: Emit) {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.sentences = sentences;
    this.wordsTotal = sentences.reduce((a, s) => a + this.words(s.text).length, 0);
    const rule = DIFFICULTY_RULES[difficulty];
    this.playerMaxHp = rule.playerHp;
    this.playerHp = rule.playerHp;
    this.baseSpeed = TELE.speed / rule.timeMul;
    this.run = new TypingRun({ stage, difficulty, pet, next: () => this.sentences[this.idx] ?? null, emit });
  }

  private words(text: string): string[] {
    return text.split(' ').filter(Boolean);
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

  speed(): number {
    if (this.stopped) return 0;
    let v = this.baseSpeed * Math.pow(TELE.brakeMul, this.brake);
    if (this.run.feverLevel >= 2) v *= TELE.feverMul;
    return v;
  }

  transfer(): number {
    const bonus = this.run.feverLevel >= 1 ? TELE.powerBonus : 0;
    return Math.min(1, (this.wordsDoneBefore + this.wordsCur) / this.wordsTotal + bonus);
  }

  tick(dt: number) {
    if (!this.running || this.finished) return;
    this.elapsed += dt;
    this.run.tick(dt);
    if (this.outageLeft > 0) {
      this.outageLeft = Math.max(0, this.outageLeft - dt);
      if (this.outageLeft === 0) {
        this.emit('TELE_OUTAGE', { on: false });
        if (this.queued) {
          const q = this.queued;
          this.queued = null;
          this.submit(q.value, q.usedBackspace);
        }
      }
    }
    this.dist = Math.max(0, this.dist - this.speed() * dt);
    this.emit('HUD_TICK', this.snapshot());
    this.emit('TELE_TICK', this.snapshot().telegram);
    if (this.dist <= 0) this.fail('time');
  }

  commit(value: string) {
    if (!this.running || this.finished || this.outageLeft > 0) return;
    const cur = this.run.current;
    if (!cur) return;
    const { wrongIndex } = this.run.onCommit(value);
    if (wrongIndex >= 0) {
      this.outageLeft = TELE.outageSec;
      this.emit('TELE_OUTAGE', { on: true });
      return;
    }
    const v = value.normalize('NFC');
    const t = cur.text;
    const ws = this.words(t);
    let acc = 0;
    let done = 0;
    for (const w of ws) {
      acc += w.length;
      if (v.length >= acc && v.slice(0, acc) === t.slice(0, acc)) done++;
      else break;
      acc += 1;
    }
    if (done > this.wordsCur) {
      this.wordsCur = done;
      this.emit('TELE_WORD', { done: this.wordsDoneBefore + done, total: this.wordsTotal, transfer: this.transfer() });
    }
  }

  submit(value: string, usedBackspace: boolean) {
    if (!this.running || this.finished) return;
    if (this.outageLeft > 0) {
      this.queued = { value, usedBackspace }; // 입력창은 이미 비워졌으니 끊김이 끝나면 대신 제출
      return;
    }
    const cur = this.run.current;
    if (!cur) return;
    const r = this.run.submit(value, usedBackspace);
    if (!r) return;
    if (!r.correct) {
      if (!r.forgiven) {
        this.outageLeft = TELE.outageSec;
        this.emit('TELE_OUTAGE', { on: true });
      }
      this.emit('INPUT_WRONG', { typed: value, target: cur, hpLoss: 0, timeLoss: 0, forgiven: r.forgiven, shielded: false, snapshot: this.snapshot() });
      this.emit('TARGET_CHANGED', this.snapshot());
      return;
    }
    const combo = this.run.combo;
    this.score += calcWordScore(combo, r.perfect, countStrokes(cur.text)) + TELE.sentenceBonus + r.bonusScore;
    this.lines.push(cur.text);
    this.wordsDoneBefore += this.words(cur.text).length;
    this.wordsCur = 0;
    this.idx++;
    this.brake++;
    if (r.petActive === 'time_plus') this.dist += 20; // 토끼: 거리 +20m 여유
    this.emit('INPUT_CORRECT', { target: cur, perfect: r.perfect, damage: 0, gained: 0, combo, mult: r.mult, variant: r.variant, snapshot: this.snapshot() });
    this.emit('TELE_BRAKE', { stage: this.brake, total: this.sentences.length, speed: this.speed() });
    if (this.lines.length >= this.sentences.length) {
      this.clear();
      return;
    }
    this.run.advance();
    this.emit('TARGET_CHANGED', this.snapshot());
  }

  private clear() {
    this.finished = true;
    this.running = false;
    this.stopped = true;
    this.run.stats.stop();
    this.score += Math.round(this.dist) * 10; // 남은 거리 = 여유 보너스
    this.emit('TELE_STOP', { dist: this.dist, elapsed: this.elapsed });
    this.emit('STAGE_CLEAR', this.snapshot());
  }
  private fail(reason: 'time' | 'hp') {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.run.stats.stop();
    this.emit('TELE_CRASH', { transfer: this.transfer() });
    this.emit('STAGE_FAILED', { reason, snapshot: this.snapshot() });
  }

  wordsSeen(): string[] {
    return this.run.wordsSeen();
  }

  snapshot(): BattleSnapshot {
    const r = this.run;
    return {
      targetIndex: this.lines.length,
      targetTotal: this.sentences.length,
      target: r.current,
      combo: r.combo,
      maxCombo: r.maxCombo,
      score: Math.round(this.score),
      playerHp: this.playerHp,
      playerMaxHp: this.playerMaxHp,
      timeLeft: this.dist / Math.max(0.01, this.speed() || this.baseSpeed),
      timeLimit: TELE.dist / this.baseSpeed,
      accuracy: r.stats.accuracy(),
      cpm: r.stats.cpm(),
      enemy: null,
      enemyIndex: 0,
      enemyTotal: 0,
      totalEnemyHp: 1,
      dealtDamage: this.transfer(),
      perfectCount: r.perfectCount,
      wordsDone: r.wordsDone,
      elapsedSec: r.stats.elapsedSec(),
      feverLevel: r.feverLevel,
      feverLeft: r.feverLeft,
      bombLeft: r.bombLeft(),
      shielded: r.isShielded(),
      coins: r.coins,
      nextHint: r.wordHint ? (this.sentences[this.idx + 1]?.text ?? null) : null,
      telegram: {
        dist: this.dist,
        speed: this.speed(),
        transfer: this.transfer(),
        brake: this.brake,
        brakeTotal: this.sentences.length,
        outage: this.outageLeft > 0,
        lines: this.lines,
        wordsDone: this.wordsDoneBefore + this.wordsCur,
        wordsTotal: this.wordsTotal,
        stopped: this.stopped,
      },
    };
  }
}

void RULES;
