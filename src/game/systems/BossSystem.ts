/**
 * 스테이지 5 「어둠의 성채」 최종 보스 3페이즈 — 지금까지 익숙해진 방식을 한 번에.
 *  P1 결정 파괴: 보스 주변 결정 5개(낱말). 음절마다 균열, 낱말 완성 → 결정 폭발. 5개 → 보호막 해제.
 *  P2 속도 러시: 2.4초마다 짧은 낱말이 큐에 쌓임(최대 4). 낱말마다 보스 피해. 큐가 가득 차면 어둠이 밀려와 HP-10.
 *               30초마다 암흑 폭탄 낱말(반격). 30콤보 FINAL FEVER → 큐 전부 소멸 + 큰 피해. 보스 HP 30% → P3.
 *  P3 마지막 장문: 갑옷·코어·마무리 역할마다 같은 이야기 세트의 문장(기본 2개씩, 총 6문장)을 순서대로 정확하게 완료한다. 역할 없는 풀은 최대 3개 선택.
 * 순수 로직. emit 주입.
 */
import type { ContentUnit, Difficulty, StageDef, PetDef } from '../types';
import { DIFFICULTY_RULES } from '../data/stages';
import { calcWordScore } from './TypingStats';
import { TypingRun, RULES, type Emit } from './TypingRun';
import { countStrokes } from '../util/hangul';
import type { BattleSnapshot, EnemyState, TypingMode, CheckpointState } from './BattleState';
import { obj, readBool, readInt, readNum, readStrings, readUnits, restoreOrder } from './Checkpoint';

export const BOSS = {
  hp: 100,
  crystals: 5,
  rushSec: 2.4,
  queueMax: 4,
  darkHp: 10,
  rushDamage: 4,
  finalFeverDamage: 20,
  phase3At: 30,
  bombEverySec: 30,
  armorHp: 15, // 역할 없는 2문장 풀: 문장 1 → 30→15, 문장 2 → 0 (역할 풀은 30×(1-완료/전체))
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
type FinalRole = (typeof FINAL_ROLES)[number];
function roleOf(u: ContentUnit): FinalRole | undefined {
  return FINAL_ROLES.find((role) => u.tags.includes(role));
}
/** 같은 장문(이야기N) 세트 태그. 없으면 문장 하나가 곧 세트다. */
function setOf(u: ContentUnit): string {
  return u.tags.find((t) => /^이야기[0-9]+$/.test(t)) ?? `single:${u.id}`;
}
function orderOf(u: ContentUnit): number {
  return Number(u.tags.find((t) => /^순서[0-9]+$/.test(t))?.slice(2) ?? 0);
}
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
    this.roleFinals = pickRoleFinals(this.finalPool).length > 0;
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
    this.rushSec = (BOSS.rushSec * rule.timeMul) / (stage.speedMul ?? 1); // 어둠 모드는 러시 낱말이 stage.speedMul 만큼 빨리 쌓인다
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
    this.emit('BOSS_PHASE', { phase: this.phase }); // 복원한 판은 저장된 페이즈에서 이어진다
    this.emit('TARGET_CHANGED', this.snapshot());
  }

  /** 중간 저장. 결정·러시 풀 순서와 고른 최종 문장을 남긴다. 러시 큐는 저장하지 않는다(복원 시 빈 큐, 타이머 재개). */
  serialize(): CheckpointState {
    return {
      phase: this.phase, bossHp: this.bossHp, crystals: this.crystals.map((c) => ({ ...c.word, broken: c.broken })), crystalIdx: this.crystalIdx,
      finalIdx: this.finalIdx, armorBroken: this.armorBroken, coreExposed: this.coreExposed, playerHp: this.playerHp, timeLeft: this.timeLeft,
      score: this.score, darkness: this.darkness, finalSentences: this.finalSentences.map((u) => ({ ...u })), rushPool: this.rushPool.map((u) => u.id),
      rushCursor: this.rushCursor, rushSeen: [...this.rushSeen], bombTimer: this.bombTimer, run: this.run.serializeCounters(),
    };
  }

  /** 복원 — start() 전에. 보스 HP 는 페이즈·진행에서 다시 계산해 저장값 변조로 건너뛸 수 없게 한다. */
  restore(state: CheckpointState) {
    const s = obj(state);
    const phase: 1 | 2 | 3 = s.phase === 2 || s.phase === 3 ? s.phase : 1; // 범위 밖 페이즈는 손상으로 보고 처음부터
    const brokenById = new Map<string, boolean>();
    for (const raw of Array.isArray(s.crystals) ? s.crystals : []) {
      const c = obj(raw);
      if (typeof c.id === 'string') brokenById.set(c.id, c.broken === true);
    }
    this.crystals = restoreOrder(this.crystals, [...brokenById.keys()], (c) => c.word.id).map((c, index) => {
      const broken = phase > 1 || brokenById.get(c.word.id) === true;
      return { ...c, index, broken, hp: broken ? 0 : c.maxHp };
    });
    if (phase === 1 && this.crystals.every((c) => c.broken)) this.crystals.forEach((c) => { c.broken = false; c.hp = c.maxHp; });
    this.phase = phase;
    this.crystalIdx = Math.max(0, this.crystals.findIndex((c) => !c.broken));
    this.rushPool = restoreOrder(this.rushPool, s.rushPool, (u) => u.id);
    this.rushCursor = readInt(s.rushCursor, 0, 0, Math.max(0, this.rushPool.length - 1));
    this.rushSeen = new Set([...this.crystals.map((c) => c.word.text), ...readStrings(s.rushSeen, 200, 120)]);
    this.rushRecent = [];
    this.queue = [];
    const finals = readUnits(s.finalSentences, this.stage.id, 12).map((u) => ({ ...u, type: 'sentence' as const }));
    if (finals.length) {
      this.finalSentences = finals;
      this.finalUsed = new Set(finals.map((u) => u.text));
      this.roleFinals = finals.every((u) => roleOf(u) !== undefined);
      rememberFinalChoices(this.finalPool, finals);
    }
    this.finalIdx = phase === 3 ? readInt(s.finalIdx, 0, 0, Math.max(0, this.finalSentences.length - 1)) : 0;
    const n = this.finalSentences.length;
    this.bossHp = phase === 1 ? BOSS.hp
      : phase === 2 ? readInt(s.bossHp, BOSS.hp, BOSS.phase3At + 1, BOSS.hp)
        : Math.round(BOSS.phase3At * (1 - this.finalIdx / Math.max(1, n)));
    this.armorBroken = phase === 3 && readBool(s.armorBroken, false);
    this.coreExposed = phase === 3 && readBool(s.coreExposed, false);
    this.finalDone = false;
    this.playerHp = readNum(s.playerHp, this.playerMaxHp, 1, this.playerMaxHp);
    this.timeLeft = readNum(s.timeLeft, this.timeLimit, 0, this.timeLimit);
    this.score = readInt(s.score, 0, 0, 1e7);
    this.darkness = readNum(s.darkness, 0, 0, 1);
    this.bombTimer = readNum(s.bombTimer, BOSS.bombEverySec, 0, BOSS.bombEverySec);
    this.rushTimer = phase === 2 ? 0.5 : 0;
    this.run.restoreCounters(s.run);
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
  /** 방향키: P1 에서는 ←→ 로 깰 결정을 고른다(조작 다양성). 나머지는 연출만 */
  move(dir: 'left' | 'right' | 'up' | 'down', pressed: boolean) {
    if (!this.running || this.finished) return;
    if (pressed && this.phase === 1 && (dir === 'left' || dir === 'right')) {
      const alive = this.crystals.filter((c) => !c.broken);
      const cur = alive.findIndex((c) => c.index === this.crystalIdx);
      if (alive.length > 1 && cur >= 0) {
        const next = alive[(cur + (dir === 'right' ? 1 : alive.length - 1)) % alive.length];
        this.crystalIdx = next.index;
        this.run.advance();
        this.emit('BOSS_CRYSTAL_SELECT', { index: next.index });
        this.emit('TARGET_CHANGED', this.snapshot());
      }
    }
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
        // 역할·장문 위치와 정답 필요 횟수는 유지하고, 다른 이야기 세트의 같은 자리 문장으로 바꾼다.
        const cur = this.finalSentences[this.finalIdx];
        finalReplacement = this.finalPool.find((u) => roleOf(u) === roleOf(cur) && orderOf(u) === orderOf(cur) && !this.finalUsed.has(u.text));
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
        // 문장마다 갑옷 한 겹: HP 30 → 30×(1 - idx/n). 역할 풀은 갑옷 문장을 다 치면 갑옷이, 마무리 직전에 코어가 드러난다.
        const before = this.bossHp;
        this.bossHp = Math.round(BOSS.phase3At * (1 - this.finalIdx / n));
        const nextRole = this.roleFinals ? roleOf(this.finalSentences[this.finalIdx]) : undefined;
        const armorDone = this.roleFinals ? nextRole !== '갑옷' : true;
        const coreDone = this.roleFinals ? nextRole === '마무리' : this.finalIdx === n - 1;
        if (armorDone && !this.armorBroken) {
          this.armorBroken = true;
          this.emit('BOSS_ARMOR', {});
        }
        this.emit('BOSS_HIT', { damage: before - this.bossHp, hp: this.bossHp, perfect, weak: false, phase: 3 });
        if (coreDone && !this.coreExposed) {
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

  /** 지금 치고 있는(끝났으면 마지막) 장문 문장의 역할. 역할 없는 풀은 null */
  private currentFinalRole(): BossInfo['finalRole'] {
    if (!this.roleFinals) return null;
    const unit = this.finalSentences[Math.min(this.finalIdx, this.finalSentences.length - 1)];
    const role = unit ? roleOf(unit) : undefined;
    return role ? FINAL_ROLE_KEYS[FINAL_ROLES.indexOf(role)] : null;
  }

  snapshot(): BattleSnapshot {
    const r = this.run;
    const enemy: EnemyState = { id: 'keyboard_golem', name: '키보드 골렘', sheet: this.bossSheet, hp: this.bossHp, maxHp: BOSS.hp, scale: 2 };
    const phaseName = this.phase === 1 ? 'P1 결정 파괴' : this.phase === 2 ? 'P2 속도 러시' : 'P3 마지막 장문';
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
        finalRole: this.currentFinalRole(),
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
  let selected = byRole
    ? pickRoleFinals(pool)
    : pool.slice(0, 3);
  if (selected.length === previous.length && selected.every((u) => previous.includes(u.text))) {
    if (byRole) {
      // 역할 하나를 직전과 다른 이야기 세트로 통째로 바꾼다.
      for (const role of FINAL_ROLES) {
        const current = setOf(selected.find((u) => roleOf(u) === role)!);
        const alt = pool.find((u) => roleOf(u) === role && setOf(u) !== current && !previous.includes(u.text));
        if (!alt) continue;
        const group = roleGroup(pool, role, setOf(alt));
        selected = FINAL_ROLES.flatMap((r) => (r === role ? group : selected.filter((u) => roleOf(u) === r)));
        break;
      }
    } else {
      const replacement = pool.find((u) => !previous.includes(u.text));
      if (replacement) selected[0] = replacement;
      // 후보가 정확히 세 개뿐인 기존 풀은 선택 세트 변경이 불가능하다. 순서만 반복되지 않게 한다.
      else if (selected.length > 1 && selected.every((u, i) => u.text === previous[i])) selected.push(selected.shift()!);
    }
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

/** 같은 역할·같은 이야기 세트의 문장들을 순서대로. (풀은 이미 중복 제거됨) */
function roleGroup(pool: ContentUnit[], role: FinalRole, set: string): ContentUnit[] {
  return pool.filter((u) => roleOf(u) === role && setOf(u) === set).sort((a, b) => orderOf(a) - orderOf(b));
}

/** 역할마다 첫 후보의 이야기 세트를 통째로 고른다(세트 태그가 없으면 문장 하나). 역할이 하나라도 비면 []. */
function pickRoleFinals(pool: ContentUnit[]): ContentUnit[] {
  const selected: ContentUnit[] = [];
  for (const role of FINAL_ROLES) {
    const lead = pool.find((u) => roleOf(u) === role && !selected.some((s) => s.text === u.text));
    if (!lead) return [];
    selected.push(...roleGroup(pool, role, setOf(lead)).filter((u) => !selected.some((s) => s.text === u.text)));
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
