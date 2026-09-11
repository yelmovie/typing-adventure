/**
 * 스테이지 5 「어둠의 성채」 최종 보스 3페이즈 — 지금까지 익숙해진 방식을 한 번에.
 *  P1 결정 파괴: 보스 주변 결정 5개(낱말). 음절마다 균열, 낱말 완성 → 결정 폭발. 5개 → 보호막 해제.
 *  P2 속도 러시: 2.4초마다 짧은 낱말이 큐에 쌓임(최대 4). 낱말마다 보스 피해. 큐가 가득 차면 어둠이 밀려와 HP-10.
 *               30초마다 암흑 폭탄 낱말(반격). 30콤보 FINAL FEVER → 큐 전부 소멸 + 큰 피해. 보스 HP 30% → P3.
 *  P3 마지막 문장: 갑옷·코어·마무리 후보 중 각 1개를 정확하게 완료한다. 역할 없는 기존 풀은 최대 3개 선택.
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcWordScore } from './TypingStats';
import { TypingRun, RULES, type Emit } from './TypingRun';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, EnemyState, TypingMode } from './BattleState';

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
  currentCrystalIndex: number;
  queue: string[];
  darkness: number; // 0..1
  armorBroken: boolean;
  coreExposed: boolean;
  finalDone: boolean;
  rushLeft: number;
  finalStep: number; // 다음에 완성할 문장, 1..finalTotal (완료 시 마지막 번호 유지)
  finalTotal: number;
  finalRole: 'armor' | 'core' | 'finale' | null;
}

export interface BossWords { crystals: ContentUnit[]; rush: ContentUnit[]; final: ContentUnit[] }
export interface BossOptions { random?: () => number }
const FINAL_ROLES = ['갑옷', '코어', '마무리'] as const;
const FINAL_ROLE_KEYS = ['armor', 'core', 'finale'] as const;
// 같은 후보 풀의 직전 전투만 기억한다. 한국어/영어 풀은 서로 다른 키이며 영구 저장은 하지 않는다.
const previousFinalChoices = new Map<string, string[]>();

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
  private rushSeen = new Set<string>();
  private rushRecent: string[] = [];
  private finalPool: ContentUnit[];
  private finalSentences: ContentUnit[];
  private finalUsed = new Set<string>();
  private roleFinals: boolean;
  private finalIdx = 0;
  private rushTimer = 0;
  private bombTimer = BOSS.bombEverySec;
  private crystalIdx = 0;
  private rushSec: number;
  private bossSheet: string;

  constructor(stage: StageDef, difficulty: Difficulty, pet: PetDef, words: BossWords, bossSheet: string, emit: Emit, options: BossOptions = {}) {
    this.stage = stage;
    this.difficulty = difficulty;
    this.emit = emit;
    this.bossSheet = bossSheet;
    const random = options.random ?? Math.random;
    this.rushPool = shuffle(uniqueWords(words.rush), random);
    this.finalPool = shuffle(uniqueWords(words.final), random);
    this.roleFinals = pickRoleFinals(this.finalPool).length === FINAL_ROLES.length;
    this.finalSentences = chooseFinals(this.finalPool, this.roleFinals);
    this.finalUsed = new Set(this.finalSentences.map((u) => u.text));
    this.crystals = shuffle(uniqueWords(words.crystals), random).slice(0, BOSS.crystals).map((w, i) => {
      const syl = [...w.text].filter((c) => c.trim()).length;
      return { index: i, word: w, hp: syl, maxHp: syl, broken: false };
    });
    // 같은 낱말이 결정과 러시 양쪽 풀에 있어도 새 낱말부터 보여 준다.
    this.rushSeen = new Set(this.crystals.map((c) => c.word.text));
    const rule = DIFFICULTY_RULES[difficulty];
    this.playerMaxHp = rule.playerHp;
    this.playerHp = rule.playerHp;
    this.timeLimit = Math.round(stage.timeLimitSec * rule.timeMul);
    this.timeLeft = this.timeLimit;
    this.rushSec = BOSS.rushSec * rule.timeMul;
    this.run = new TypingRun({ stage, difficulty, pet, next: () => this.nextTarget(), emit });
  }

  /** 큐 중복은 금지하고, 이번 전투 미출제 → 최근 4개 외 → 가장 오래된 후보 순서로 고른다. */
  private drawRush(): ContentUnit | null {
    const available = this.rushPool.map((_, offset) => (this.rushCursor + offset) % this.rushPool.length)
      .filter((index) => !this.queue.some((q) => q.text === this.rushPool[index].text));
    const index = available.find((i) => !this.rushSeen.has(this.rushPool[i].text))
      ?? available.find((i) => !this.rushRecent.includes(this.rushPool[i].text))
      ?? available.find((i) => this.rushPool[i].text !== this.rushRecent[this.rushRecent.length - 1])
      ?? available[0];
    if (index === undefined) return null;
    const unit = this.rushPool[index];
    this.rushCursor = (index + 1) % this.rushPool.length;
    this.rushSeen.add(unit.text);
    this.rushRecent.push(unit.text);
    if (this.rushRecent.length > BOSS.queueMax) this.rushRecent.shift();
    return unit;
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
    let u = this.drawRush();
    if (!u) return; // 작은 호환 풀을 억지로 복제해서 큐를 채우지 않는다.
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
      this.emit('BOSS_CRYSTAL_HIT', { index: c.index, hp: c.hp, maxHp: c.maxHp, hits: newHits });
    } else if (this.phase === 2 || this.phase === 3) {
      this.emit('BOSS_HIT', { damage: 0, hp: this.bossHp, weak: true, hits: newHits, phase: this.phase });
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
    if (!t || this.run.skipsLeft <= 0) return false;
    let finalReplacement: ContentUnit | undefined;
    if (this.phase === 1 && this.crystals.filter((c) => !c.broken).length <= 1) return false;
    if (this.phase === 2 && this.queue.length === 1) {
      const replacement = this.drawRush();
      if (!replacement) return false;
      this.queue.push(replacement);
    }
    if (this.phase === 3) {
      if (this.roleFinals) {
        // 역할 순서와 정답 필요 횟수는 유지하고 같은 역할의 새 연습 문장으로 바꾼다.
        finalReplacement = this.finalPool.find((u) => u.tags.includes(FINAL_ROLES[this.finalIdx]) && !this.finalUsed.has(u.text));
        if (!finalReplacement) return false;
      } else if (this.finalSentences.length - this.finalIdx <= 1) return false;
    }
    const r = this.run.skip();
    if (!r) return false;
    if (this.phase === 1) {
      // 깨지지 않은 다음 결정으로 이동할 뿐, 보호막을 제거하지 않는다.
      const next = this.crystals.findIndex((c, i) => i > this.crystalIdx && !c.broken);
      this.crystalIdx = next >= 0 ? next : this.crystals.findIndex((c) => !c.broken);
    } else if (this.phase === 2) {
      this.queue.push(this.queue.shift()!);
      this.emit('BOSS_QUEUE', { queue: this.queue.map((q) => q.text) });
    } else if (finalReplacement) {
      this.finalSentences[this.finalIdx] = finalReplacement;
      this.finalUsed.add(finalReplacement.text);
    } else this.finalSentences.push(this.finalSentences.splice(this.finalIdx, 1)[0]);
    if (this.phase === 3) rememberFinalChoices(this.finalPool, this.finalSentences);
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
      this.applyHp(r.hpDelta);
      this.emit('INPUT_WRONG', { typed: value, target: t, hpLoss: r.hpDelta < 0 ? -r.hpDelta : 0, timeLoss: 0, forgiven: r.forgiven, shielded: this.run.isShielded(), snapshot: this.snapshot() });
      if (this.playerHp <= 0) { this.fail('hp'); return; }
      // 결정·러시·최종 문장 모두 정답만 진행한다. 현재 목표를 보고 고칠 수 있다.
      this.emit('TARGET_CHANGED', this.snapshot());
      return;
    }
    const combo = this.run.combo;
    this.score += calcWordScore(combo, r.perfect, countStrokes(t.text)) + r.bonusScore;
    this.applyHp(r.hpDelta);
    if (r.variant === 'heart') this.playerHp = Math.min(this.playerMaxHp, this.playerHp + RULES.heartHp);
    if (r.petActive === 'time_plus') this.timeLeft += RULES.petTimePlus;
    this.emit('INPUT_CORRECT', { target: t, perfect: r.perfect, corrected: r.corrected, damage: 0, gained: 0, combo, mult: r.mult, variant: r.variant, snapshot: this.snapshot() });
    this.advancePhaseTarget(true, r.mult, r.perfect, r.feverEntered, r.petActive);
  }

  /** 정확히 완성한 목표만 페이즈를 진행한다. */
  private advancePhaseTarget(hit: boolean, mult: number, perfect = false, feverEntered = false, petActive?: string) {
    if (!hit) return;
    if (this.phase === 1) {
      const c = this.currentCrystal!;
      c.broken = true;
      c.hp = 0;
      this.emit('BOSS_CRYSTAL_BREAK', { index: c.index, left: this.crystals.filter((x) => !x.broken).length });
      this.crystalIdx = this.crystals.findIndex((x) => !x.broken);
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
        this.emit('BOSS_HIT', { damage: before - this.bossHp, hp: this.bossHp, perfect, weak: false, phase: 3 });
        if (this.finalIdx === n - 1) {
          this.coreExposed = true;
          this.emit('BOSS_CORE', {});
        }
      } else {
        const before = this.bossHp;
        const wasExposed = this.coreExposed;
        this.coreExposed = true;
        this.bossHp = 0;
        this.finalDone = true;
        this.emit('BOSS_HIT', { damage: before, hp: 0, perfect, weak: false, phase: 3 });
        if (!wasExposed) this.emit('BOSS_CORE', {});
        this.emit('BOSS_FINAL', { perfect, perfectCount: this.run.perfectCount });
        this.clear();
        return;
      }
    }
    this.run.advance();
    this.emit('TARGET_CHANGED', this.snapshot());
  }

  private damageBoss(dmg: number, perfect: boolean) {
    const before = this.bossHp;
    this.bossHp = Math.max(this.phase === 2 ? BOSS.phase3At : 0, this.bossHp - dmg);
    this.emit('BOSS_HIT', { damage: before - this.bossHp, hp: this.bossHp, perfect, weak: false, phase: this.phase });
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
        currentCrystalIndex: this.crystalIdx,
        queue: this.queue.map((q) => q.text),
        darkness: this.darkness,
        armorBroken: this.armorBroken,
        coreExposed: this.coreExposed,
        finalDone: this.finalDone,
        rushLeft: this.rushTimer,
        finalStep: Math.min(this.finalIdx + 1, this.finalSentences.length),
        finalTotal: this.finalSentences.length,
        finalRole: this.roleFinals ? FINAL_ROLE_KEYS[Math.min(this.finalIdx, FINAL_ROLE_KEYS.length - 1)] : null,
      },
    };
  }
}

function uniqueWords(words: ContentUnit[]): ContentUnit[] {
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = word.text.normalize('NFC');
    if (!key.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chooseFinals(pool: ContentUnit[], byRole: boolean): ContentUnit[] {
  const key = JSON.stringify(pool.map((u) => u.text).sort());
  const previous = previousFinalChoices.get(key) ?? [];
  const selected = byRole
    ? pickRoleFinals(pool)
    : pool.slice(0, 3);
  if (selected.length === previous.length && selected.every((u) => previous.includes(u.text))) {
    for (let index = 0; index < selected.length; index++) {
      const replacement = pool.find((u) => !previous.includes(u.text) && (!byRole || u.tags.includes(FINAL_ROLES[index])));
      if (replacement) { selected[index] = replacement; break; }
    }
    // 후보가 정확히 세 개뿐인 기존 풀은 선택 세트 변경이 불가능하다. 순서만 반복되지 않게 한다.
    if (!byRole && selected.length > 1 && selected.every((u, i) => u.text === previous[i])) selected.push(selected.shift()!);
  }
  rememberFinalChoices(pool, selected);
  return selected;
}

/** 점프로 바뀐 문장까지 포함한 현재 전투 세트를 다음 판의 비교 기준으로 남긴다. */
function rememberFinalChoices(pool: ContentUnit[], selected: ContentUnit[]) {
  const key = JSON.stringify(pool.map((u) => u.text).sort());
  previousFinalChoices.set(key, selected.map((u) => u.text));
  if (previousFinalChoices.size > 8) previousFinalChoices.delete(previousFinalChoices.keys().next().value!);
}

function pickRoleFinals(pool: ContentUnit[]): ContentUnit[] {
  const selected: ContentUnit[] = [];
  for (const role of FINAL_ROLES) {
    const unit = pool.find((u) => u.tags.includes(role) && !selected.some((s) => s.text === u.text));
    if (!unit) return [];
    selected.push(unit);
  }
  return selected;
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
