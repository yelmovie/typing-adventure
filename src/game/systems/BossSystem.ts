/**
 * 스테이지 5 「어둠의 성채」 최종 보스 3페이즈 — 지금까지 익숙해진 방식을 한 번에.
 *  P1 결정 파괴: 보스 주변 결정 5개(낱말). 음절마다 균열, 낱말 완성 → 결정 폭발. 5개 → 보호막 해제.
 *  P2 속도 러시: 3초마다 짧은 낱말이 큐에 쌓임(최대 4). 낱말마다 보스 피해. 큐가 가득 차면 어둠이 밀려와 HP-10.
 *               30초마다 암흑 폭탄 낱말(반격). 30콤보 FINAL FEVER → 큐 전부 소멸 + 큰 피해. 보스 HP 30% → P3.
 *  P3 마지막 문장: 문장 1 완료 → 갑옷 파괴, 문장 2 완료 → 코어 노출 → 마지막 Enter → PERFECT TYPE → 빛 폭발(클리어).
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcWordScore } from './TypingStats';
import { TypingRun, RULES, type Emit } from './TypingRun';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, EnemyState, TypingMode } from './BattleSystem';

export const BOSS = {
  hp: 100,
  crystals: 5,
  rushSec: 2.4,
  queueMax: 4,
  darkHp: 10,
  rushDamage: 5,
  finalFeverDamage: 20,
  phase3At: 30,
  bombEverySec: 30,
  armorHp: 15, // P3 문장 1 → 30→15, 문장 2 → 0
  fireDamage: 10,
};

export interface BossCrystal {
  index: number;
  word: ContentUnit;
  hp: number;
  maxHp: number;
  broken: boolean;
}

export interface BossInfo {
  phase: 1 | 2 | 3;
  hp: number;
  maxHp: number;
  crystals: BossCrystal[];
  queue: string[];
  darkness: number; // 0..1
  armorBroken: boolean;
  coreExposed: boolean;
  finalDone: boolean;
  rushLeft: number;
}

export class BossSystem implements TypingMode {
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
  phase: 1 | 2 | 3 = 1;
  bossHp = BOSS.hp;
  crystals: BossCrystal[] = [];
  queue: ContentUnit[] = [];
  darkness = 0;
  armorBroken = false;
  coreExposed = false;
  finalDone = false;

  private emit: Emit;
  private rushPool: ContentUnit[];
  private rushCursor = 0;
  private finalSentences: ContentUnit[];
  private finalIdx = 0;
  private rushTimer = 0;
  private bombTimer = BOSS.bombEverySec;
  private crystalIdx = 0;
  private rushSec: number;
  private bossSheet: string;

  constructor(stage: StageDef, difficulty: Difficulty, pet: PetDef, words: { crystals: ContentUnit[]; rush: ContentUnit[]; final: ContentUnit[] }, bossSheet: string, emit: Emit) {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.bossSheet = bossSheet;
    this.rushPool = shuffle(words.rush);
    this.finalSentences = words.final.slice(0, 3); // 문장 → 문장 → 장문
    this.crystals = words.crystals.slice(0, BOSS.crystals).map((w, i) => {
      const syl = [...w.text].filter((c) => c.trim()).length;
      return { index: i, word: w, hp: syl, maxHp: syl, broken: false };
    });
    const rule = DIFFICULTY_RULES[difficulty];
    this.playerMaxHp = rule.playerHp;
    this.playerHp = rule.playerHp;
    this.timeLimit = Math.round(stage.timeLimitSec * rule.timeMul);
    this.timeLeft = this.timeLimit;
    this.rushSec = BOSS.rushSec * rule.timeMul;
    this.run = new TypingRun({ stage, difficulty, pet, next: () => this.nextTarget(), emit });
  }

  private nextTarget(): ContentUnit | null {
    if (this.phase === 1) return this.crystals[this.crystalIdx]?.word ?? null;
    if (this.phase === 2) return this.queue[0] ?? null;
    return this.finalSentences[this.finalIdx] ?? null;
  }

  get currentCrystal(): BossCrystal | undefined {
    return this.phase === 1 ? this.crystals[this.crystalIdx] : undefined;
  }

  start() {
    this.running = true;
    this.run.start();
    this.emit('BATTLE_START', this.snapshot());
    this.emit('BOSS_PHASE', { phase: 1 });
    this.emit('TARGET_CHANGED', this.snapshot());
  }
  pause() {
    this.running = false;
  }
  resume() {
    if (!this.finished) this.running = true;
  }

  private pushRush(bomb = false) {
    if (this.queue.length >= BOSS.queueMax) {
      // 큐 가득: 어둠이 밀려온다
      this.darkness = Math.min(1, this.darkness + 0.34);
      let hpLoss = 0;
      if (!this.run.isShielded()) {
        hpLoss = BOSS.darkHp;
        this.playerHp = Math.max(0, this.playerHp - hpLoss);
      }
      this.emit('BOSS_DARK', { darkness: this.darkness, hpLoss });
      if (hpLoss > 0) this.emit('PLAYER_HIT', { hpLoss, hp: this.playerHp });
      if (this.playerHp <= 0) this.fail('hp');
      return;
    }
    let u = this.rushPool[this.rushCursor++ % this.rushPool.length];
    if (this.queue.some((q) => q.text === u.text) && this.rushPool.length > 1) u = this.rushPool[this.rushCursor++ % this.rushPool.length];
    if (bomb) u = { ...u, variant: 'bomb' };
    this.queue.push(u);
    this.emit('BOSS_QUEUE', { queue: this.queue.map((q) => q.text), added: u.text, bomb });
    if (this.queue.length === 1) {
      this.run.advance();
      this.emit('TARGET_CHANGED', this.snapshot());
    }
  }

  tick(dt: number) {
    if (!this.running || this.finished) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    const r = this.run.tick(dt);
    if (this.phase === 2) {
      this.rushTimer -= dt;
      if (this.rushTimer <= 0) {
        this.rushTimer = this.rushSec;
        this.bombTimer -= this.rushSec;
        const bomb = this.bombTimer <= 0;
        if (bomb) this.bombTimer = BOSS.bombEverySec;
        this.pushRush(bomb);
      }
      if (r.bomb) {
        // 암흑 폭탄 시간 초과: 그 낱말은 사라지고 어둠 +
        this.queue.shift();
        this.darkness = Math.min(1, this.darkness + 0.2);
        this.emit('BOSS_QUEUE', { queue: this.queue.map((q) => q.text), removed: true });
        this.run.advance();
        this.emit('TARGET_CHANGED', this.snapshot());
      }
      this.darkness = Math.max(0, this.darkness - dt * 0.03);
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
    this.emit('HUD_TICK', this.snapshot());
    this.emit('BOSS_TICK', this.snapshot().boss);
    if (this.timeLeft <= 0) this.fail('time');
  }

  commit(value: string) {
    if (!this.running || this.finished) return;
    const { newHits } = this.run.onCommit(value);
    if (newHits <= 0) return;
    const c = this.currentCrystal;
    if (c && !c.broken) {
      c.hp = Math.max(1, c.hp - newHits);
      this.emit('BOSS_CRYSTAL_HIT', { index: c.index, hp: c.hp, maxHp: c.maxHp });
    } else if (this.phase === 3) {
      this.emit('BOSS_HIT', { damage: 0, hp: this.bossHp, weak: true });
    }
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
    this.advancePhaseTarget(false, 0);
    return true;
  }

  submit(value: string, usedBackspace: boolean) {
    if (!this.running || this.finished) return;
    const t = this.run.current;
    if (!t) return;
    const r = this.run.submit(value, usedBackspace);
    if (!r) return;
    if (!r.correct) {
      this.applyHp(r.hpDelta);
      this.emit('INPUT_WRONG', { typed: value, target: t, hpLoss: r.hpDelta < 0 ? -r.hpDelta : 0, timeLoss: 0, forgiven: r.forgiven, shielded: false, snapshot: this.snapshot() });
      if (this.playerHp <= 0) { this.fail('hp'); return; }
      // 틀린 채 Enter → 반복시키지 않고 넘긴다 (보상 없음)
      this.advancePhaseTarget(false, 0);
      return;
    }
    const combo = this.run.combo;
    this.score += calcWordScore(combo, r.perfect, countStrokes(t.text)) + r.bonusScore;
    this.applyHp(r.hpDelta);
    if (r.variant === 'heart') this.playerHp = Math.min(this.playerMaxHp, this.playerHp + RULES.heartHp);
    if (r.petActive === 'time_plus') this.timeLeft += RULES.petTimePlus;
    this.emit('INPUT_CORRECT', { target: t, perfect: r.perfect, damage: 0, gained: 0, combo, mult: r.mult, variant: r.variant, snapshot: this.snapshot() });
    this.advancePhaseTarget(true, r.mult, r.perfect, r.feverEntered, r.petActive);
  }

  /** 목표 하나가 끝났을 때(정답이든 오답이든) 페이즈 진행. hit=false 면 보상·피해 없음 */
  private advancePhaseTarget(hit: boolean, mult: number, perfect = false, feverEntered = false, petActive?: string) {
    if (this.phase === 1) {
      const c = this.currentCrystal!;
      c.broken = true;
      c.hp = 0;
      this.emit('BOSS_CRYSTAL_BREAK', { index: c.index, left: this.crystals.filter((x) => !x.broken).length });
      this.crystalIdx++;
      if (this.crystals.every((x) => x.broken)) {
        this.phase = 2;
        this.rushTimer = 0.5;
        this.emit('BOSS_PHASE', { phase: 2 });
      }
    } else if (this.phase === 2) {
      this.queue.shift();
      let dmg = hit ? Math.round(BOSS.rushDamage * mult) : 0;
      if (hit && feverEntered && this.run.feverLevel === 3) {
        dmg += BOSS.finalFeverDamage;
        this.queue = [];
        this.darkness = 0;
        this.emit('BOSS_QUEUE', { queue: [], cleared: true });
      }
      if (hit && petActive === 'fire_aoe') dmg += BOSS.fireDamage;
      if (dmg > 0) this.damageBoss(dmg, perfect);
      if (this.bossHp <= BOSS.phase3At) {
        this.phase = 3;
        this.queue = [];
        this.bossHp = BOSS.phase3At;
        this.emit('BOSS_PHASE', { phase: 3 });
      } else this.emit('BOSS_QUEUE', { queue: this.queue.map((q) => q.text) });
    } else {
      this.finalIdx++;
      const n = this.finalSentences.length;
      if (this.finalIdx < n) {
        // 문장마다 갑옷 한 겹: HP 30 → 30×(1 - idx/n)
        const before = this.bossHp;
        this.bossHp = Math.round(BOSS.phase3At * (1 - this.finalIdx / n));
        if (!this.armorBroken) {
          this.armorBroken = true;
          this.emit('BOSS_ARMOR', {});
        }
        this.emit('BOSS_HIT', { damage: before - this.bossHp, hp: this.bossHp, perfect });
      } else {
        this.coreExposed = true;
        this.bossHp = 0;
        this.finalDone = true;
        this.emit('BOSS_CORE', {});
        this.emit('BOSS_FINAL', { perfect, perfectCount: this.run.perfectCount });
        this.clear();
        return;
      }
    }
    this.run.advance();
    this.emit('TARGET_CHANGED', this.snapshot());
  }

  private damageBoss(dmg: number, perfect: boolean) {
    this.bossHp = Math.max(0, this.bossHp - dmg);
    this.emit('BOSS_HIT', { damage: dmg, hp: this.bossHp, perfect });
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
    this.score += Math.round(this.timeLeft) * 5 + 1000 + Math.round(this.playerHp * RULES.hpClearBonusPerHp);
    this.emit('STAGE_CLEAR', this.snapshot());
  }
  private fail(reason: 'time' | 'hp') {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.run.stats.stop();
    this.emit('STAGE_FAILED', { reason, snapshot: this.snapshot() });
  }

  wordsSeen(): string[] {
    return this.run.wordsSeen();
  }

  snapshot(): BattleSnapshot {
    const r = this.run;
    const enemy: EnemyState = { id: 'keyboard_golem', name: '키보드 골렘', sheet: this.bossSheet, hp: this.bossHp, maxHp: BOSS.hp, scale: 2 };
    const phaseName = this.phase === 1 ? 'P1 결정 파괴' : this.phase === 2 ? 'P2 속도 러시' : 'P3 마지막 문장';
    return {
      targetIndex: this.phase,
      targetTotal: 3,
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
      enemyLabel: phaseName,
      totalEnemyHp: BOSS.hp,
      dealtDamage: BOSS.hp - this.bossHp,
      perfectCount: r.perfectCount,
      wordsDone: r.wordsDone,
      elapsedSec: r.stats.elapsedSec(),
      feverLevel: r.feverLevel,
      feverLeft: r.feverLeft,
      bombLeft: r.bombLeft(),
      shielded: r.isShielded(),
      coins: r.coins,
      nextHint: r.wordHint && this.phase === 2 ? (this.queue[1]?.text ?? null) : null,
      boss: {
        phase: this.phase,
        hp: this.bossHp,
        maxHp: BOSS.hp,
        crystals: this.crystals,
        queue: this.queue.map((q) => q.text),
        darkness: this.darkness,
        armorBroken: this.armorBroken,
        coreExposed: this.coreExposed,
        finalDone: this.finalDone,
        rushLeft: this.rushTimer,
      },
    };
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
