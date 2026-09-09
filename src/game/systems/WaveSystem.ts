/**
 * 스테이지 1 「푸른 숲」 웨이브 규칙 — TypingRun 위에 "몬스터 20마리가 오른쪽에서 걸어온다"를 얹는다.
 *  - 몬스터 머리 위에 낱말. 가장 가까운 몬스터가 목표(죽을 때까지 고정).
 *  - 음절 확정 → 그 몬스터 타격(hp = 남은 음절), 낱말 완성 → 처치.
 *  - 몬스터가 닿으면 HP-10 후 밀려남(단, 슬라임은 점프중·박쥐는 앉기중이면 회피: 피해 0·밀림·+30점).
 *  - 오답 제출은 콤보 초기화 + HP-3(용서되면 0). 10콤보마다 +5, PERFECT +2 회복(상한 지킴).
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
  big?: boolean; // 마지막 웨이브 대장 슬라임
}

export const WAVE = {
  total: 20,
  perWave: 5,
  // 등장 간격 4초 → 2.2초 (20마리에 걸쳐 선형). 화면에 2~3마리가 늘 있어야 콤보가 이어진다
  intervalStart: 2.2,
  intervalEnd: 1.1,
  maxOnField: 6,
  travelSec: { slime: 9, bat: 6.5 } as Record<MobKind, number>,
  touchHp: 10,
  pushBackTo: 0.25,
  sweepEvery: 5, // N콤보마다 화면의 적 전부 소탕
  dropChance: 0.35, // 처치 시 아이템 드롭 확률
  // 아이템 6종: coin·gem·star(점수) / heart(HP) / shield(다음 접촉 무효) / bolt(3초 적 이동 절반)
  drops: [
    { item: 'coin', score: 30, w: 6 },
    { item: 'gem', score: 80, w: 3 },
    { item: 'star', score: 150, w: 1 },
    { item: 'heart', score: 0, w: 2 },
    { item: 'shield', score: 0, w: 1 },
    { item: 'bolt', score: 0, w: 1 },
  ] as { item: string; score: number; w: number }[],
  boltSec: 3,
  dodgeScore: 30, // 점프/앉기 회피 성공 보너스
  jumpSec: 0.42, // Player.jump 의 착지 시간과 같게 — 키를 눌러도 이 시간이 지나면 회피 판정이 끝난다
  pushStunSec: 0.8,
  // 웨이브별 구성 [슬라임, 박쥐]. 마지막 웨이브의 마지막 한 마리는 대장 슬라임으로 교체된다
  mix: [[5, 0], [3, 2], [2, 3], [1, 4]] as [number, number][], // 웨이브가 갈수록 빠른 박쥐 비중 ↑
  bossHpMul: 2,
  bossScaleMul: 1.8,
  bossSpeedMul: 0.55,
};
const MOB: Record<MobKind, { sheet: string; name: string }> = {
  slime: { sheet: 'mon_green_slime', name: '초록 슬라임' },
  bat: { sheet: 'mon_letter_bat', name: '글자 박쥐' },
};
/** 대장 슬라임 전용 시트(왕관 쓴 큰 슬라임). 없으면 씬이 초록 슬라임으로 폴백한다 */
export const BOSS_SHEET = 'mon_boss_slime';

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
  /** 방향키 상태: 점프중이면 슬라임을, 앉기중이면 박쥐를 접촉 순간 회피 */
  jumping = false;
  crouching = false;
  /** 점프 회피 판정 남은 시간(초) · ↑ 키를 실제로 뗐는지(꾹 눌러 연타되는 keydown 무시) */
  private jumpLeft = 0;
  private upHeld = false;
  /** 아이템: 방패(다음 접촉 무효) 남은 횟수, 번개(적 이동 절반) 남은 시간(초) */
  itemShieldCharges = 0;
  itemSlowLeft = 0;

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

  /** 마지막 웨이브 대장 슬라임용 4음절 낱말(태그 대장), 없으면 가장 어려운 박쥐 낱말로 대체 */
  private bossWord(): ContentUnit {
    const pool = [...this.words.slime, ...this.words.bat].filter((u) => u.tags.includes('대장'));
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    return this.nextWord('bat');
  }

  private spawn() {
    if (this.spawnQueue.length === 0) return;
    const kind = this.spawnQueue.shift()!;
    this.spawned++;
    const isBoss = this.spawned === WAVE.total; // 20번째(마지막 웨이브 끝) = 대장 슬라임
    const effKind: MobKind = isBoss ? 'slime' : kind;
    const word = isBoss ? this.bossWord() : this.nextWord(effKind);
    const syl = [...word.text].filter((c) => c.trim()).length;
    const hp = syl * (isBoss ? WAVE.bossHpMul : 1);
    const m: WaveMonster = {
      uid: ++this.uidSeq,
      kind: effKind,
      sheet: isBoss ? BOSS_SHEET : MOB[effKind].sheet,
      name: isBoss ? '대장 슬라임' : MOB[effKind].name,
      word,
      x: 0,
      speed: (1 / WAVE.travelSec[effKind]) * this.speedMul * (isBoss ? WAVE.bossSpeedMul : 1),
      hp,
      maxHp: hp,
      pushed: 0,
      dead: false,
      big: isBoss,
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
    if (this.jumping) {
      this.jumpLeft -= dt;
      if (this.jumpLeft <= 0) this.jumping = false;
    }
    // 등장
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      const onField = this.monsters.filter((m) => !m.dead).length;
      if (this.spawnTimer <= 0 && onField < WAVE.maxOnField) this.spawn();
    }
    // 이동·접촉
    if (this.itemSlowLeft > 0) this.itemSlowLeft = Math.max(0, this.itemSlowLeft - dt);
    const slowMul = this.itemSlowLeft > 0 ? 0.5 : 1;
    for (const m of this.monsters) {
      if (m.dead) continue;
      if (m.pushed > 0) {
        m.pushed = Math.max(0, m.pushed - dt);
        continue;
      }
      m.x += m.speed * slowMul * dt;
      if (m.x >= 1) this.touch(m);
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

  /**
   * 방향키 이동/점프/앉기 — 슬라임은 점프로, 박쥐는 앉기로 접촉 순간 회피 가능.
   * 점프는 한 번 누를 때 jumpSec 만큼만 유효하다. 키를 누르고 있어도 캐릭터는 420ms 뒤 착지하므로
   * 판정만 계속 살아 있으면 화면과 어긋나고 ↑ 를 꾹 누른 채 슬라임 무적이 된다.
   */
  move(dir: 'left' | 'right' | 'up' | 'down', pressed: boolean) {
    if (!this.running || this.finished) return;
    if (dir === 'up') {
      if (!pressed) this.upHeld = false;
      else if (!this.upHeld) {
        this.upHeld = true;
        if (!this.jumping) {
          this.jumping = true;
          this.jumpLeft = WAVE.jumpSec;
        }
      }
    } else if (dir === 'down') this.crouching = pressed;
    this.emit('PLAYER_MOVE', { dir, pressed, jumping: this.jumping, crouching: this.crouching });
  }

  private applyHp(delta: number) {
    if (!delta) return;
    this.playerHp = Math.max(0, Math.min(this.playerMaxHp, this.playerHp + delta));
    if (delta < 0) this.emit('PLAYER_HIT', { hpLoss: -delta, hp: this.playerHp });
    else this.emit('HP_HEAL', { amount: delta, hp: this.playerHp });
  }

  private touch(m: WaveMonster) {
    const dodge = !m.big && ((m.kind === 'slime' && this.jumping) || (m.kind === 'bat' && this.crouching));
    if (dodge) {
      m.x = Math.max(0, WAVE.pushBackTo - 0.15);
      m.pushed = WAVE.pushStunSec * 1.5;
      this.score += WAVE.dodgeScore;
      this.emit('DODGE', { uid: m.uid, kind: m.kind });
      return;
    }
    m.x = WAVE.pushBackTo;
    m.pushed = WAVE.pushStunSec;
    let hpLoss = 0;
    if (this.itemShieldCharges > 0) {
      this.itemShieldCharges--;
      this.emit('ITEM_APPLIED', { item: 'shield_used' });
    } else if (!this.run.isShielded()) {
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

  skip(): boolean {
    if (!this.running || this.finished) return false;
    const t = this.run.current;
    if (!t) return false;
    const r = this.run.skip();
    if (!r) return false;
    const m = this.target;
    if (!m) return false;
    this.kill(m, false, true);
    if (this.finished) return true;
    this.targetUid = -1;
    this.retarget();
    return true;
  }

  submit(value: string, usedBackspace: boolean) {
    if (!this.running || this.finished) return;
    const t = this.target;
    if (!t) return;
    const r = this.run.submit(value, usedBackspace);
    if (!r) return;
    if (!r.correct) {
      this.applyHp(r.hpDelta);
      this.emit('INPUT_WRONG', { typed: value, target: t.word, hpLoss: r.hpDelta < 0 ? -r.hpDelta : 0, timeLoss: 0, forgiven: r.forgiven, shielded: false, snapshot: this.snapshot() });
      // 틀린 채 Enter → 같은 낱말을 다시 시키지 않는다. 몬스터는 도망가고(점수 없음) 다음 목표로.
      this.kill(t, false, true);
      if (this.finished) return;
      if (this.playerHp <= 0) { this.fail('hp'); return; }
      this.targetUid = -1;
      this.retarget();
      return;
    }
    const combo = this.run.combo;
    this.score += calcWordScore(combo, r.perfect, countStrokes(t.word.text)) + r.bonusScore;
    this.applyHp(r.hpDelta);
    if (r.variant === 'heart') {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + RULES.heartHp);
      this.timeLeft += RULES.heartTime;
    }
    if (r.petActive === 'time_plus') this.timeLeft += RULES.petTimePlus;
    this.emit('INPUT_CORRECT', { target: t.word, perfect: r.perfect, damage: t.maxHp, gained: 0, combo, mult: r.mult, variant: r.variant, snapshot: this.snapshot() });
    this.kill(t, false);
    const sweep = combo > 0 && combo % WAVE.sweepEvery === 0;
    if (r.feverEntered || r.petActive === 'fire_aoe' || sweep) {
      let count = 0;
      for (const m of this.monsters) if (!m.dead) { this.kill(m, true); count++; }
      if (sweep) this.emit('WAVE_SWEEP', { combo, count });
    }
    if (this.finished) return;
    this.targetUid = -1;
    this.retarget();
  }

  private kill(m: WaveMonster, aoe: boolean, fled = false) {
    if (m.dead) return;
    m.dead = true;
    m.hp = 0;
    this.defeated++;
    if (aoe) this.score += 50;
    this.emit('WAVE_DEFEAT', { uid: m.uid, aoe, fled, defeated: this.defeated, total: WAVE.total });
    if (!fled && Math.random() < WAVE.dropChance) {
      const total = WAVE.drops.reduce((a, d) => a + d.w, 0);
      let r = Math.random() * total;
      const d = WAVE.drops.find((x) => (r -= x.w) < 0) ?? WAVE.drops[0];
      this.score += d.score;
      if (d.item === 'heart') this.playerHp = Math.min(this.playerMaxHp, this.playerHp + RULES.itemHeartHp);
      else if (d.item === 'shield') this.itemShieldCharges++;
      else if (d.item === 'bolt') this.itemSlowLeft = WAVE.boltSec;
      this.emit('ITEM_DROP', { uid: m.uid, item: d.item, score: d.score });
      if (d.item === 'heart' || d.item === 'shield' || d.item === 'bolt') this.emit('ITEM_APPLIED', { item: d.item });
    }
    if (this.defeated >= WAVE.total) this.clear();
  }

  private clear() {
    this.finished = true;
    this.running = false;
    this.run.stats.stop();
    this.score += Math.round(this.timeLeft) * 5 + Math.round(this.playerHp * RULES.hpClearBonusPerHp);
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
