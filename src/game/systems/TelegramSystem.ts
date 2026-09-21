/**
 * 스테이지 4 「폭주 열차」 긴급 전보 — 장문 + 시간 압박.
 *  - 위험 지점까지 360m, 열차는 초당 2m 씩 다가간다(기초 난이도는 느리게).
 *  - 전보 5문장. 전송률 = 완료 어절 / 전체 어절. 어절 완료마다 TELE_WORD.
 *  - 문장 완료 → 브레이크 1단(속도 25% 감소). 5문장 완료 → 비상 브레이크 → 열차 정지(클리어).
 *  - 오타 확정 → 1.5초 통신 끊김(제출은 복구 후 처리). 2문장 연속 성공 → 친구 도움. FEVER → 급감속(속도 절반).
 *  - 거리 0 전에 미완 → 급정지 실패.
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcWordScore } from './TypingStats';
import { TypingRun, RULES, type Emit } from './TypingRun';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, TypingMode, CheckpointState } from './BattleState';
import { obj, readBool, readInt, readNum, readStrings, readUnits } from './Checkpoint';

export const TELE = {
  sentences: 5,
  dist: 360,
  speed: 2, // m/s
  brakeMul: 0.75,
  outageSec: 1.5,
  feverMul: 0.5,
  sentenceBonus: 300,
  batCount: 4,
  batTimeSec: 3.2,
  batHitBonus: 120,
  batMissHp: 10,
};

const BAT_WORDS = ['번개', '기적', '용기', '질주', '바람', '불꽃', '철교', '기관차', '신호', '탈출', '방어', '출발'];

export interface TelegramBatInfo {
  active: boolean;
  index: number;
  total: number;
  word: string | null;
  timeLeft: number;
  timeLimit: number;
  hits: number;
}

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
  bat: TelegramBatInfo;
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
  private batWords: string[];
  private batIndex = 0;
  private batLeft = 0;
  private batHits = 0;
  private batActive = false;
  private ambushTriggered = false;

  constructor(stage: StageDef, difficulty: Difficulty, pet: PetDef, sentences: ContentUnit[], emit: Emit) {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.sentences = [...sentences];
    this.wordsTotal = sentences.reduce((a, s) => a + this.words(s.text).length, 0);
    const rule = DIFFICULTY_RULES[difficulty];
    this.playerMaxHp = rule.playerHp;
    this.playerHp = rule.playerHp;
    this.baseSpeed = (TELE.speed / rule.timeMul) * (stage.speedMul ?? 1); // 어둠 모드는 열차가 stage.speedMul 만큼 빠르다(제한 시간도 그만큼 준다)
    this.batWords = this.pickBatWords();
    this.run = new TypingRun({ stage, difficulty, pet, next: () => this.sentences[this.idx] ?? null, emit });
  }

  private words(text: string): string[] {
    return text.split(' ').filter(Boolean);
  }

  /** 한 판 안에서는 같은 낱말이 다시 나오지 않게 시작 위치와 진행 간격을 섞는다. */
  private pickBatWords(): string[] {
    const start = Math.floor(Math.random() * BAT_WORDS.length);
    const step = 5; // 12와 서로소라 중복 없이 전체 풀을 돈다.
    return Array.from({ length: TELE.batCount }, (_, i) => BAT_WORDS[(start + i * step) % BAT_WORDS.length]);
  }

  private batTarget(): ContentUnit | null {
    if (!this.batActive) return null;
    const text = this.batWords[this.batIndex];
    if (!text) return null;
    return { id: `tele-bat-${this.batIndex}-${text}`, stage: this.stage.id, type: 'word', text, difficulty: 2, tags: ['박쥐 기습'], weight: 1 };
  }

  start() {
    this.running = true;
    this.run.start();
    if (this.batActive) this.announceAmbush();
    // 예전 체크포인트가 첫 문장 직후 저장됐어도 기습을 빠뜨리지 않는다.
    else if (this.idx === 1 && !this.ambushTriggered) this.startAmbush();
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
    // 학습 진행률은 실제로 완성한 어절만 표시한다. 친구 능력은 물리적 여유에 반영한다.
    return this.wordsTotal > 0 ? Math.min(1, (this.wordsDoneBefore + this.wordsCur) / this.wordsTotal) : 0;
  }

  tick(dt: number) {
    if (!this.running || this.finished) return;
    this.elapsed += dt;
    // 통신 복구 연출 때문에 제출을 받지 못하는 시간은 입력 속도에서 제외한다.
    const blockedSec = Math.min(dt, this.outageLeft);
    const activeSec = dt - blockedSec;
    this.run.stats.tick(blockedSec, false);
    // 박쥐 낱말은 전보 학습 기록과 CPM에 섞지 않는다.
    if (this.batActive) this.run.stats.tick(activeSec, false);
    else if (activeSec > 0) this.run.tick(activeSec);
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
    const drain = this.batActive ? 0 : this.run.idleDrain(activeSec);
    if (drain > 0) {
      this.playerHp = Math.max(0, this.playerHp - drain);
      this.emit('IDLE_DRAIN', { hpLoss: drain, hp: this.playerHp, idle: this.run.idleSeconds });
      this.playerHp = this.run.rescueIfDown(this.playerHp, this.playerMaxHp);
      if (this.playerHp <= 0) {
        this.fail('hp');
        return;
      }
    }
    this.dist = Math.max(0, this.dist - this.speed() * dt);
    if (this.batActive) {
      this.batLeft = Math.max(0, this.batLeft - dt);
      this.emit('TELE_BAT_TICK', this.snapshot().telegram?.bat);
      if (this.batLeft <= 0) {
        const missed = this.batWords[this.batIndex] ?? '';
        this.applyHp(-TELE.batMissHp);
        this.emit('TELE_BAT_MISSED', { index: this.batIndex, total: TELE.batCount, word: missed, hpLoss: TELE.batMissHp });
        this.playerHp = this.run.rescueIfDown(this.playerHp, this.playerMaxHp);
        if (this.playerHp <= 0) { this.fail('hp'); return; }
        this.advanceBat();
      }
    }
    this.emit('HUD_TICK', this.snapshot());
    this.emit('TELE_TICK', this.snapshot().telegram);
    if (this.dist <= 0) this.fail('time');
  }

  commit(value: string) {
    if (!this.running || this.finished || this.outageLeft > 0) return;
    if (this.batActive) return;
    const cur = this.run.current;
    if (!cur) return;
    const { wrongIndex } = this.run.onCommit(value);
    if (wrongIndex >= 0) {
      this.wordsCur = 0;
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
    if (done !== this.wordsCur) {
      this.wordsCur = done;
      this.emit('TELE_WORD', { done: this.wordsDoneBefore + done, total: this.wordsTotal, transfer: this.transfer() });
    }
  }

  /** 방향키: 이 모드는 연출만 */
  move(dir: 'left' | 'right' | 'up' | 'down', pressed: boolean) {
    if (!this.running || this.finished) return;
    this.emit('PLAYER_MOVE', { dir, pressed });
  }

  skip(): boolean {
    if (!this.running || this.finished) return false;
    if (this.batActive) return false;
    const t = this.run.current;
    if (!t) return false;
    const r = this.run.skip();
    if (!r) return false;
    this.queued = null;
    this.sentences.push(this.sentences.splice(this.idx, 1)[0]);
    this.wordsCur = 0;
    this.run.advance();
    this.emit('TARGET_CHANGED', this.snapshot());
    return true;
  }

  submit(value: string, usedBackspace: boolean) {
    if (!this.running || this.finished) return;
    if (this.batActive) {
      const target = this.batWords[this.batIndex];
      const typed = value.normalize('NFC').trim();
      if (typed !== target) {
        this.batLeft = Math.max(0.4, this.batLeft - 0.35);
        this.emit('TELE_BAT_WRONG', { index: this.batIndex, total: TELE.batCount, word: target, typed });
        this.emit('TARGET_CHANGED', this.snapshot());
        return;
      }
      this.batHits++;
      this.score += TELE.batHitBonus;
      this.emit('TELE_BAT_HIT', { index: this.batIndex, total: TELE.batCount, word: target, bonus: TELE.batHitBonus });
      this.advanceBat();
      return;
    }
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
      this.applyHp(r.hpDelta);
      this.emit('INPUT_WRONG', { typed: value, target: cur, hpLoss: r.hpDelta < 0 ? -r.hpDelta : 0, timeLoss: 0, forgiven: r.forgiven, shielded: this.run.isShielded(), snapshot: this.snapshot() });
      // 잘못 전송한 문장은 고쳐 다시 보내야 한다. 오답으로 브레이크를 걸 수 없다.
      this.wordsCur = 0;
      this.playerHp = this.run.rescueIfDown(this.playerHp, this.playerMaxHp);
      if (this.playerHp <= 0) { this.fail('hp'); return; }
      this.emit('TARGET_CHANGED', this.snapshot());
      return;
    }
    const combo = this.run.combo;
    this.score += calcWordScore(combo, r.perfect, countStrokes(cur.text)) + TELE.sentenceBonus + r.bonusScore;
    this.applyHp(r.hpDelta);
    this.lines.push(cur.text);
    this.wordsDoneBefore += this.words(cur.text).length;
    this.wordsCur = 0;
    this.idx++;
    this.brake++;
    if (r.petActive === 'time_plus') this.dist += 20; // 토끼: 거리 +20m 여유
    this.emit('INPUT_CORRECT', { target: cur, perfect: r.perfect, corrected: r.corrected, damage: 0, gained: 0, combo, mult: r.mult, variant: r.variant, snapshot: this.snapshot() });
    this.emit('TELE_BRAKE', { stage: this.brake, total: this.sentences.length, speed: this.speed() });
    if (this.lines.length >= this.sentences.length) {
      this.clear();
      return;
    }
    this.run.advance();
    if (this.idx === 1 && !this.ambushTriggered) this.startAmbush();
    else this.emit('TARGET_CHANGED', this.snapshot());
  }

  private startAmbush() {
    this.ambushTriggered = true;
    this.batActive = true;
    this.batIndex = 0;
    this.batLeft = TELE.batTimeSec;
    this.announceAmbush();
    this.emit('TARGET_CHANGED', this.snapshot());
  }

  private announceAmbush() {
    this.emit('TELE_AMBUSH_START', { words: [...this.batWords], total: TELE.batCount, timeLimit: TELE.batTimeSec });
    this.emit('TELE_BAT_TARGET', { index: this.batIndex, total: TELE.batCount, word: this.batWords[this.batIndex], timeLeft: this.batLeft });
  }

  private advanceBat() {
    this.batIndex++;
    if (this.batIndex >= TELE.batCount) {
      this.batActive = false;
      this.batLeft = 0;
      this.emit('TELE_AMBUSH_END', { hits: this.batHits, total: TELE.batCount });
      this.emit('TARGET_CHANGED', this.snapshot());
      return;
    }
    this.batLeft = TELE.batTimeSec;
    this.emit('TELE_BAT_TARGET', { index: this.batIndex, total: TELE.batCount, word: this.batWords[this.batIndex], timeLeft: this.batLeft });
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
    this.stopped = true;
    this.run.stats.stop();
    this.score += Math.round(this.dist) * 10 + Math.round(this.playerHp * RULES.hpClearBonusPerHp); // 남은 거리 = 여유 보너스
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

  /** 중간 저장. 전보 문장 자체를 남겨 변형 도전에서도 같은 전보가 이어진다. */
  serialize(): CheckpointState {
    return {
      idx: this.idx, lines: [...this.lines], brake: this.brake, dist: this.dist, elapsed: this.elapsed, score: this.score, playerHp: this.playerHp,
      wordsDoneBefore: this.wordsDoneBefore, sentences: this.sentences.map((u) => ({ ...u })), run: this.run.serializeCounters(),
      ambushTriggered: this.ambushTriggered, batActive: this.batActive, batWords: [...this.batWords], batIndex: this.batIndex, batLeft: this.batLeft, batHits: this.batHits,
    };
  }

  /** 복원 — start() 전에. 완료 문장 수에서 브레이크 단수와 전송 어절 수를 다시 계산한다. */
  restore(state: CheckpointState) {
    const s = obj(state);
    const sentences = readUnits(s.sentences, this.stage.id, 20).map((u) => ({ ...u, type: 'sentence' as const }));
    if (sentences.length) {
      this.sentences = sentences;
      this.wordsTotal = sentences.reduce((a, u) => a + this.words(u.text).length, 0);
    }
    this.lines = readStrings(s.lines, this.sentences.length - 1);
    this.idx = this.lines.length;
    this.brake = this.lines.length;
    this.wordsDoneBefore = Math.min(this.wordsTotal, this.lines.reduce((a, text) => a + this.words(text).length, 0));
    this.wordsCur = 0;
    this.dist = readNum(s.dist, TELE.dist, 1, TELE.dist);
    this.elapsed = readNum(s.elapsed, 0, 0, 86400);
    this.score = readInt(s.score, 0, 0, 1e7);
    this.playerHp = readNum(s.playerHp, this.playerMaxHp, 1, this.playerMaxHp);
    this.ambushTriggered = readBool(s.ambushTriggered, this.idx > 1);
    const restoredBatWords = readStrings(s.batWords, TELE.batCount, 20).filter((word, i, all) => word.length > 0 && all.indexOf(word) === i);
    if (restoredBatWords.length === TELE.batCount) this.batWords = restoredBatWords;
    this.batActive = readBool(s.batActive, false) && this.idx === 1;
    this.batIndex = readInt(s.batIndex, 0, 0, TELE.batCount - 1);
    this.batLeft = readNum(s.batLeft, TELE.batTimeSec, 0.1, TELE.batTimeSec);
    this.batHits = readInt(s.batHits, 0, 0, TELE.batCount);
    if (this.batActive) this.ambushTriggered = true;
    this.run.restoreCounters(s.run);
  }

  snapshot(): BattleSnapshot {
    const r = this.run;
    return {
      targetIndex: this.lines.length,
      targetTotal: this.sentences.length,
      target: this.batTarget() ?? r.current,
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
        bat: {
          active: this.batActive,
          index: this.batIndex,
          total: TELE.batCount,
          word: this.batActive ? (this.batWords[this.batIndex] ?? null) : null,
          timeLeft: this.batLeft,
          timeLimit: TELE.batTimeSec,
          hits: this.batHits,
        },
      },
    };
  }
}

void RULES;
