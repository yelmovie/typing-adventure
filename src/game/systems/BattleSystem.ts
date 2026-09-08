/**
 * 전투(웨이브) 규칙 — TypingRun 공통 코어 위에 HP·몬스터·시간을 얹는다. (렌더링 없음)
 *  음절 확정 → 약공격(피해 1×배율), 단어 완성 → 강공격
 *  오답 → 콤보 0(용서 없을 때), 난이도별 패널티(방어막 중엔 HP 손실 없음)
 *  몬스터 HP 0 → 다음 몬스터 / 전부 처치 → STAGE_CLEAR
 *  시간 0 또는 플레이어 HP 0 → STAGE_FAILED
 */
import type { ContentUnit, Difficulty, StageDef, WordVariant } from '../types';
import { buildTargetList, pickAdjusted, applyVariant } from '../data/content';
import { getEnemy } from '../data/enemies';
import { getPet } from '../data/characters';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcDamage, calcWordScore, DAMAGE } from './ScoreSystem';
import { TypingRun, RULES, type FeverLevel } from './TypingRun';
import { countStrokes } from '../util/hangul';
import { EventBus, Events } from '../EventBus';

export interface EnemyState {
  id: string;
  name: string;
  sheet: string;
  hp: number;
  maxHp: number;
  scale: number;
}

export interface BattleSnapshot {
  targetIndex: number;
  targetTotal: number;
  target: ContentUnit | null;
  combo: number;
  maxCombo: number;
  score: number;
  playerHp: number;
  playerMaxHp: number;
  timeLeft: number;
  timeLimit: number;
  accuracy: number;
  cpm: number;
  enemy: EnemyState | null;
  enemyIndex: number;
  enemyTotal: number;
  totalEnemyHp: number;
  dealtDamage: number;
  perfectCount: number;
  wordsDone: number;
  elapsedSec: number;
  feverLevel: FeverLevel;
  feverLeft: number;
  bombLeft: number | null;
  shielded: boolean;
  coins: number;
  nextHint: string | null;
  /** 모드별 부가 정보 (HUD가 있으면 쓰고 없으면 무시) */
  enemyLabel?: string;
  race?: import('./RaceSystem').RaceInfo;
  letter?: import('./LetterSystem').LetterInfo;
  telegram?: import('./TelegramSystem').TelegramInfo;
  boss?: import('./BossSystem').BossInfo;
}

/** BattleScreen 이 모드별 규칙 클래스를 같은 방식으로 다루기 위한 최소 인터페이스 */
export interface TypingMode {
  readonly stage: StageDef;
  readonly run: TypingRun;
  finished: boolean;
  start(): void;
  tick(dt: number): void;
  pause(): void;
  resume(): void;
  commit(value: string): void;
  submit(value: string, usedBackspace: boolean): void;
  /** 점프: 현재 목표 건너뛰기 (남은 횟수 없으면 false) */
  skip(): boolean;
  /** 방향키 이동 (모드가 지원할 때만) */
  move?(dir: 'left' | 'right' | 'up' | 'down', pressed: boolean): void;
  snapshot(): BattleSnapshot;
  wordsSeen(): string[];
}

export class BattleSystem implements TypingMode {
  readonly stage: StageDef;
  readonly difficulty: Difficulty;
  readonly enemies: EnemyState[];
  readonly run: TypingRun;

  private queue: ContentUnit[];
  private qi = 0;
  private enemyIndex = 0;
  score = 0;
  playerHp: number;
  playerMaxHp: number;
  timeLeft: number;
  timeLimit: number;
  totalEnemyHp: number;
  damageScale = 1;
  dealtDamage = 0;
  finished = false;
  running = false;

  constructor(stage: StageDef, difficulty: Difficulty, petId = 'cat') {
    this.stage = stage;
    this.difficulty = difficulty;
    const rule = DIFFICULTY_RULES[difficulty];
    this.queue = buildTargetList(stage.id, stage.targets);
    this.run = new TypingRun({ stage, difficulty, pet: getPet(petId), next: (o) => this.nextUnit(o), emit: (ev, d) => EventBus.emit(ev, d) });
    this.enemies = stage.enemies.map((id) => {
      const def = getEnemy(id);
      const hp = Math.round(def.baseHp * rule.enemyHpMul);
      return { id: def.id, name: def.name, sheet: def.sheet, hp, maxHp: hp, scale: def.scale };
    });
    this.totalEnemyHp = this.enemies.reduce((a, e) => a + e.maxHp, 0);
    // 피해 배율: PERFECT·콤보·음절 약공격을 합친 실제 낱말당 피해(≈기본 피해의 2배)로
    // 목표 낱말 수 근처에서 몬스터 전체 HP가 바닥나게 맞춘다. (푸른 숲 0.7배, 보스 4배 안팎)
    this.damageScale = Math.max(0.5, this.totalEnemyHp / (stage.targets * DAMAGE.base * 2));
    this.playerMaxHp = rule.playerHp;
    this.playerHp = rule.playerHp;
    this.timeLimit = Math.round(stage.timeLimitSec * rule.timeMul);
    this.timeLeft = this.timeLimit;
  }

  get currentTarget(): ContentUnit | null {
    return this.run.current;
  }
  get currentEnemy(): EnemyState | null {
    return this.enemies[this.enemyIndex] ?? null;
  }
  get combo() {
    return this.run.combo;
  }
  get maxCombo() {
    return this.run.maxCombo;
  }

  /** 출제: 적응형 보정 → 변화구 부여(첫 단어 제외) */
  private nextUnit(offset: number): ContentUnit {
    if (this.qi >= this.queue.length) this.queue.push(...buildTargetList(this.stage.id, this.stage.targets));
    const base = this.queue[this.qi++];
    const u = pickAdjusted(this.stage.id, base, offset, new Set([base.id]));
    return this.qi === 1 ? u : applyVariant(u);
  }

  start() {
    this.running = true;
    this.run.start();
    EventBus.emit(Events.BATTLE_START, this.snapshot());
    EventBus.emit(Events.TARGET_CHANGED, this.snapshot());
  }

  /** 100ms마다 호출 */
  tick(dtSec: number) {
    if (!this.running || this.finished) return;
    this.timeLeft = Math.max(0, this.timeLeft - dtSec);
    if (this.run.tick(dtSec).bomb) {
      this.run.advance();
      EventBus.emit(Events.TARGET_CHANGED, this.snapshot());
    }
    EventBus.emit(Events.HUD_TICK, this.snapshot());
    if (this.timeLeft <= 0) this.fail('time');
  }

  pause() {
    this.running = false;
  }
  resume() {
    if (!this.finished) this.running = true;
  }

  /** 확정 문자열 변화(조합 중 아님) → 음절 약공격 */
  commit(value: string) {
    if (!this.running || this.finished) return;
    const { newHits } = this.run.onCommit(value);
    if (newHits <= 0) return;
    const enemy = this.currentEnemy;
    if (!enemy) return;
    // 약공격 총량은 낱말 하나당 기본 강공격의 40% 안팎 (긴 문장이 글자 수로 폭주하지 않게)
    const chars = Math.max(1, [...this.currentTarget!.text].filter((c) => c.trim()).length);
    const perChar = Math.max(1, Math.round((this.damageScale * DAMAGE.base * 0.4) / chars));
    const dmg = Math.round(newHits * perChar * this.run.damageMult());
    this.damageEnemy(enemy, dmg, { weak: true });
  }

  skip(): boolean {
    if (!this.running || this.finished) return false;
    const r = this.run.skip();
    if (!r) return false;
    this.run.advance();
    EventBus.emit(Events.TARGET_CHANGED, this.snapshot());
    return true;
  }

  /** 확정 문자열 제출 (TypingSystem에서 호출) */
  submit(value: string, usedBackspace: boolean) {
    if (!this.running || this.finished) return;
    const target = this.currentTarget;
    if (!target) return;
    const r = this.run.submit(value, usedBackspace);
    if (!r) return;
    if (r.correct) this.onCorrect(r.target, r.perfect, r.mult, r.bonusScore, r.variant, r.petActive);
    else this.onWrong(value.normalize('NFC'), target, r.forgiven);
  }

  private onCorrect(target: ContentUnit, perfect: boolean, mult: number, bonusScore: number, variant: WordVariant | undefined, petActive?: string) {
    const combo = this.run.combo;
    const dmg = Math.round(calcDamage(combo, perfect) * this.damageScale * mult);
    const gained = calcWordScore(combo, perfect, countStrokes(target.text)) + bonusScore;
    this.score += gained;
    if (variant === 'heart') {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + RULES.heartHp);
      this.timeLeft += RULES.heartTime;
    }
    if (petActive === 'time_plus') this.timeLeft += RULES.petTimePlus;

    const enemy = this.currentEnemy!;
    EventBus.emit(Events.INPUT_CORRECT, { target, perfect, damage: dmg, gained, combo, mult, variant, snapshot: this.snapshot() });
    const alive = this.damageEnemy(enemy, dmg, { perfect });
    if (alive && petActive === 'fire_aoe') {
      const e = this.currentEnemy;
      if (e) this.damageEnemy(e, Math.round(e.maxHp * RULES.fireAoeRatio), { fire: true });
    }
    if (this.finished) return;
    this.run.advance();
    EventBus.emit(Events.TARGET_CHANGED, this.snapshot());
  }

  /** 피해 적용 + 처치 처리. 몬스터가 아직 살아있으면 true */
  private damageEnemy(enemy: EnemyState, dmg: number, meta: { weak?: boolean; perfect?: boolean; fire?: boolean }): boolean {
    if (enemy.hp <= 0) return false;
    enemy.hp = Math.max(0, enemy.hp - dmg);
    this.dealtDamage += dmg;
    EventBus.emit(Events.ENEMY_HIT, { enemy, damage: dmg, combo: this.run.combo, ...meta });
    if (enemy.hp > 0) return true;
    EventBus.emit(Events.ENEMY_DEFEATED, { enemy, index: this.enemyIndex });
    this.enemyIndex++;
    if (this.enemyIndex >= this.enemies.length) {
      this.clear();
      return false;
    }
    EventBus.emit(Events.ENEMY_SPAWN, { enemy: this.currentEnemy, index: this.enemyIndex });
    return false;
  }

  private onWrong(typed: string, target: ContentUnit, forgiven: boolean) {
    const rule = DIFFICULTY_RULES[this.difficulty];
    let hpLoss = 0;
    let timeLoss = 0;
    if (!forgiven) {
      if (rule.wrongHp > 0 && !this.run.isShielded()) {
        hpLoss = rule.wrongHp;
        this.playerHp = Math.max(0, this.playerHp - hpLoss);
      }
      if (rule.wrongTimeSec > 0) {
        timeLoss = rule.wrongTimeSec;
        this.timeLeft = Math.max(0, this.timeLeft - timeLoss);
      }
    }
    EventBus.emit(Events.INPUT_WRONG, { typed, target, hpLoss, timeLoss, forgiven, shielded: this.run.isShielded(), snapshot: this.snapshot() });
    if (hpLoss > 0) EventBus.emit(Events.PLAYER_HIT, { hpLoss, hp: this.playerHp });
    if (this.playerHp <= 0) this.fail('hp');
    else if (this.timeLeft <= 0) this.fail('time');
    else EventBus.emit(Events.TARGET_CHANGED, this.snapshot());
  }

  private clear() {
    this.finished = true;
    this.running = false;
    this.run.stats.stop();
    this.score += Math.round(this.timeLeft) * 5; // 시간 보너스
    EventBus.emit(Events.STAGE_CLEAR, this.snapshot());
  }

  private fail(reason: 'time' | 'hp') {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.run.stats.stop();
    EventBus.emit(Events.STAGE_FAILED, { reason, snapshot: this.snapshot() });
  }

  wordsSeen(): string[] {
    return this.run.wordsSeen();
  }

  snapshot(): BattleSnapshot {
    const r = this.run;
    return {
      targetIndex: r.wordsDone,
      targetTotal: this.stage.targets,
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
      enemy: this.currentEnemy,
      enemyIndex: this.enemyIndex,
      enemyTotal: this.enemies.length,
      totalEnemyHp: this.totalEnemyHp,
      dealtDamage: this.dealtDamage,
      perfectCount: r.perfectCount,
      wordsDone: r.wordsDone,
      elapsedSec: r.stats.elapsedSec(),
      feverLevel: r.feverLevel,
      feverLeft: r.feverLeft,
      bombLeft: r.bombLeft(),
      shielded: r.isShielded(),
      coins: r.coins,
      nextHint: r.wordHint ? (this.queue[this.qi]?.text ?? null) : null,
    };
  }
}
