/**
 * 스테이지 1 「푸른 숲」 웨이브 규칙 — TypingRun 위에 "몬스터 20마리가 오른쪽에서 걸어온다"를 얹는다.
 *  - 몬스터 머리 위에 낱말. 가장 가까운 몬스터가 목표(죽을 때까지 고정).
 *  - 음절 확정 → 그 몬스터 타격(hp = 남은 음절), 낱말 완성 → 처치.
 *  - 몬스터가 닿으면 HP-10 후 밀려남. 오타는 콤보만 초기화(HP 손실 없음, 튜토리얼 스테이지).
 *  - FEVER 진입·드래곤 화염 → 화면의 몬스터 전부 처치. 폭탄 낱말 시간 초과 → 그 몬스터 뒤로 밀림 + 콤보 0.
 *  - 20마리 처치 → 숲의 문(WAVE_GATE) → STAGE_CLEAR. 시간 0 / HP 0 → STAGE_FAILED.
 * 순수 로직(DOM/Phaser 없음). emit 은 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcWordScore } from './TypingStats';
import { TypingRun, RULES, type Emit } from './TypingRun';
import { applyVariant } from '../data/content';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, EnemyState } from './BattleSystem';

export type MobKind = 'slime' | 'bat';
export interface WaveMonster {
  uid: number;
  kind: MobKind;
  sheet: string;
  name: string;
  word: ContentUnit;
  x: number; // 0 = 등장 지점, 1 = 플레이어에 닿음
  speed: number; // x/초
  hp: number; // 남은 음절
  maxHp: number;
  pushed: number; // 밀려난 뒤 멈춰 있는 시간(초)
  dead: boolean;
}

export const WAVE = {
  total: 20,
  perWave: 5,
  // 등장 간격 4초 → 2.2초 (20마리에 걸쳐 선형). 화면에 2~3마리가 늘 있어야 콤보가 이어진다
  intervalStart: 4,
  intervalEnd: 2.2,
  maxOnField: 4,
  travelSec: { slime: 14, bat: 10 } as Record<MobKind, number>,
  touchHp: 10,
  pushBackTo: 0.25,
  pushStunSec: 0.8,
  // 웨이브별 구성 [슬라임, 박쥐]
  mix: [[5, 0], [3, 2], [2, 3], [1, 4]] as [number, number][],
};
const MOB: Record<MobKind, { sheet: string; name: string }> = {
  slime: { sheet: 'mon_green_slime', name: '초록 슬라임' },
  bat: { sheet: 'mon_letter_bat', name: '글자 박쥐' },
};

export interface WaveSnapshot extends BattleSnapshot {
  wave: number; // 1..4
  monsters: WaveMonster[];
  targetUid: number;
}

export class WaveSystem {
  readonly stage: StageDef;
  readonly difficulty: Difficulty;
  readonly run: TypingRun;
  monsters: WaveMonster[] = [];
  score = 0;
  playerHp: number;
  playerMaxHp: number;
  timeLeft: number;
  timeLimit: number;
  defeated = 0;
  finished = false;
  running = false;

  private emit: Emit;
  private words: Record<MobKind, ContentUnit[]>;
  private spawnQueue: MobKind[] = [];
  private spawnTimer = 0;
  private spawned = 0;
  private uidSeq = 0;
  private targetUid = -1;
  private speedMul: number;
  private wordCursor: Record<MobKind, number> = { slime: 0, bat: 0 };

  constructor(stage: StageDef, difficulty: Difficulty, pet: PetDef, words: Record<MobKind, ContentUnit[]>, emit: Emit) {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.words = { slime: shuffle(words.slime), bat: shuffle(words.bat.length ? words.bat : words.slime) };
    const rule = DIFFICULTY_RULES[difficulty];
    this.playerMaxHp = rule.playerHp;
    this.playerHp = rule.playerHp;
    this.timeLimit = Math.round(stage.timeLimitSec * rule.timeMul);
    this.timeLeft = this.timeLimit;
    this.speedMul = 1 / rule.timeMul; // 기초 난이도는 느리게, 도전은 빠르게
    for (const [s, b] of WAVE.mix) {
      for (let i = 0; i < s; i++) this.spawnQueue.push('slime');
      for (let i = 0; i < b; i++) this.spawnQueue.push('bat');
    }
    this.run = new TypingRun({ stage, difficulty, pet, next: () => this.target?.word ?? null, emit });
  }

  get target(): WaveMonster | undefined {
    return this.monsters.find((m) => m.uid === this.targetUid && !m.dead);
  }
  get wave(): number {
    return Math.min(WAVE.mix.length, Math.floor(Math.max(0, this.spawned - 1) / WAVE.perWave) + 1);
  }

  start() {
    this.running = true;
    this.run.start();
    this.spawn();
    this.emit('BATTLE_START', this.snapshot());
    this.retarget();
  }
  pause() {
    this.running = false;
  }
  resume() {
    if (!this.finished) this.running = true;
  }

  private nextWord(kind: MobKind): ContentUnit {
    const pool = this.words[kind];
    const u = pool[this.wordCursor[kind]++ % pool.length];
    // 화면에 같은 낱말이 둘 있으면 헷갈리니 피한다
    if (this.monsters.some((m) => !m.dead && m.word.text === u.text) && pool.length > 1) return this.nextWord(kind);
    return this.spawned <= 1 ? u : applyVariant(u);
  }

  private spawn() {
    if (this.spawnQueue.length === 0) return;
    const kind = this.spawnQueue.shift()!;
    this.spawned++;
    const word = this.nextWord(kind);
    const syl = [...word.text].filter((c) => c.trim()).length;
    const m: WaveMonster = {
      uid: ++this.uidSeq,
      kind,
      sheet: MOB[kind].sheet,
      name: MOB[kind].name,
      word,
      x: 0,
      speed: (1 / WAVE.travelSec[kind]) * this.speedMul,
      hp: syl,
      maxHp: syl,
      pushed: 0,
      dead: false,
    };
    this.monsters.push(m);
    const p = this.spawned / WAVE.total;
    this.spawnTimer = WAVE.intervalStart + (WAVE.intervalEnd - WAVE.intervalStart) * p;
    this.emit('WAVE_SPAWN', { monster: m, wave: this.wave });
  }

  /** 목표가 없으면 가장 가까운(x 큰) 살아있는 몬스터를 목표로 */
  private retarget() {
    if (this.target) return;
    const alive = this.monsters.filter((m) => !m.dead).sort((a, b) => b.x - a.x);
    this.targetUid = alive[0]?.uid ?? -1;
    this.run.advance();
    this.emit('TARGET_CHANGED', this.snapshot());
  }

  tick(dt: number) {
    if (!this.running || this.finished) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    // 등장
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      const onField = this.monsters.filter((m) => !m.dead).length;
      if (this.spawnTimer <= 0 && onField < WAVE.maxOnField) this.spawn();
    }
    // 이동·접촉
    for (const m of this.monsters) {
      if (m.dead) continue;
      if (m.pushed > 0) {
        m.pushed = Math.max(0, m.pushed - dt);
        continue;
      }
      m.x += m.speed * dt;
      if (m.x >= 1) this.touch(m);
    }
    // 폭탄
    if (this.run.tick(dt).bomb) {
      const t = this.target;
      if (t) {
        t.x = Math.min(t.x, 0.2);
        t.pushed = WAVE.pushStunSec;
        t.word = { ...t.word, variant: undefined };
        this.emit('WAVE_PUSH', { uid: t.uid, bomb: true });
      }
      this.targetUid = -1;
    }
    this.monsters = this.monsters.filter((m) => !m.dead || m.uid === this.targetUid);
    this.retarget();
    this.emit('HUD_TICK', this.snapshot());
    this.emit('WAVE_TICK', { monsters: this.monsters, targetUid: this.targetUid });
    if (this.timeLeft <= 0) this.fail('time');
  }

  private touch(m: WaveMonster) {
    m.x = WAVE.pushBackTo;
    m.pushed = WAVE.pushStunSec;
    let hpLoss = 0;
    if (!this.run.isShielded()) {
      hpLoss = WAVE.touchHp;
      this.playerHp = Math.max(0, this.playerHp - hpLoss);
    }
    this.emit('WAVE_TOUCH', { uid: m.uid, hpLoss, shielded: hpLoss === 0 });
    if (hpLoss > 0) this.emit('PLAYER_HIT', { hpLoss, hp: this.playerHp });
    if (this.playerHp <= 0) this.fail('hp');
  }

  /** 확정 문자열 변화 → 목표 몬스터 음절 타격 */
  commit(value: string) {
    if (!this.running || this.finished) return;
    const t = this.target;
    if (!t) return;
    const { newHits } = this.run.onCommit(value);
    if (newHits <= 0) return;
    t.hp = Math.max(1, t.hp - newHits); // 마지막 음절은 submit(처치)에서
    this.emit('WAVE_HIT', { uid: t.uid, hits: newHits, hp: t.hp, mult: this.run.damageMult() });
  }

  submit(value: string, usedBackspace: boolean) {
    if (!this.running || this.finished) return;
    const t = this.target;
    if (!t) return;
    const r = this.run.submit(value, usedBackspace);
    if (!r) return;
    if (!r.correct) {
      this.emit('INPUT_WRONG', { typed: value, target: t.word, hpLoss: 0, timeLoss: 0, forgiven: r.forgiven, shielded: false, snapshot: this.snapshot() });
      this.emit('TARGET_CHANGED', this.snapshot());
      return;
    }
    const combo = this.run.combo;
    this.score += calcWordScore(combo, r.perfect, countStrokes(t.word.text)) + r.bonusScore;
    if (r.variant === 'heart') {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + RULES.heartHp);
      this.timeLeft += RULES.heartTime;
    }
    if (r.petActive === 'time_plus') this.timeLeft += RULES.petTimePlus;
    this.emit('INPUT_CORRECT', { target: t.word, perfect: r.perfect, damage: t.maxHp, gained: 0, combo, mult: r.mult, variant: r.variant, snapshot: this.snapshot() });
    this.kill(t, false);
    if (r.feverEntered || r.petActive === 'fire_aoe') {
      for (const m of this.monsters) if (!m.dead) this.kill(m, true);
    }
    if (this.finished) return;
    this.targetUid = -1;
    this.retarget();
  }

  private kill(m: WaveMonster, aoe: boolean) {
    if (m.dead) return;
    m.dead = true;
    m.hp = 0;
    this.defeated++;
    if (aoe) this.score += 50;
    this.emit('WAVE_DEFEAT', { uid: m.uid, aoe, defeated: this.defeated, total: WAVE.total });
    if (this.defeated >= WAVE.total) this.clear();
  }

  private clear() {
    this.finished = true;
    this.running = false;
    this.run.stats.stop();
    this.score += Math.round(this.timeLeft) * 5;
    this.emit('WAVE_GATE', { defeated: this.defeated });
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
  spawnedCount() {
    return this.spawned;
  }

  snapshot(): WaveSnapshot {
    const r = this.run;
    const t = this.target;
    const enemy: EnemyState | null = t ? { id: t.kind, name: t.name, sheet: t.sheet, hp: t.hp, maxHp: t.maxHp, scale: 1 } : null;
    return {
      targetIndex: this.defeated,
      targetTotal: WAVE.total,
      target: t?.word ?? null,
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
      enemyIndex: this.defeated,
      enemyTotal: WAVE.total,
      totalEnemyHp: WAVE.total,
      dealtDamage: this.defeated,
      perfectCount: r.perfectCount,
      wordsDone: r.wordsDone,
      elapsedSec: r.stats.elapsedSec(),
      feverLevel: r.feverLevel,
      feverLeft: r.feverLeft,
      bombLeft: r.bombLeft(),
      shielded: r.isShielded(),
      coins: r.coins,
      nextHint: null,
      wave: this.wave,
      monsters: this.monsters,
      targetUid: this.targetUid,
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
