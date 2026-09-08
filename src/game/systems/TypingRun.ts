/**
 * TypingRun — 모든 스테이지 모드가 공유하는 타이핑 코어 (순수 로직, DOM/Phaser 없음).
 *  - 음절 타격 판정: 확정 음절이 목표 접두어와 맞으면 약공격, 틀린 음절은 표시만(판정은 Enter 제출 시)
 *  - 콤보 → 5(+20%) / 10 POWER(×1.5) / 20 FEVER 8초(×2, 오타 1회 용서, 펫 액티브) / 30 FINAL FEVER(보스, ×3)
 *  - 3초 무입력 시 콤보가 1초마다 1씩 감소
 *  - 변화구 단어: 보물(코인·점수) / 하트(HP·시간, 적용은 모드가) / 폭탄(5초 제한, 실패 시 콤보만 초기화)
 *  - 펫 패시브/액티브 (액티브는 FEVER 진입 시 자동)
 *  - 몰래 적응형 난이도: 최근 10단어 정확도 <80% → -1, ≥97%+빠름 → +1 (UI 비노출)
 * 시간은 전부 tick(dt) 누적으로 잰다 → 일시정지에 안전하고 테스트가 쉽다.
 */
import type { ContentUnit, Difficulty, PetActive, PetDef, StageDef, WordVariant } from '../types';
import { TypingStats } from './TypingStats';
import { countStrokes, isPrefixInput } from '../util/hangul';

export type FeverLevel = 0 | 1 | 2 | 3;

export const RULES = {
  combo5Mult: 1.2,
  powerCombo: 10,
  feverCombo: 20,
  finalCombo: 30,
  feverSec: 8,
  finalSec: 10,
  feverMult: [1, 1.5, 2, 3] as const,
  idleSec: 3,
  drainAfterSec: 4, // 무입력 4초부터
  drainHpPerSec: 2, // 초당 HP -2
  bombSec: 5,
  bombPetBonusSec: 2,
  shieldSec: 5,
  treasureCoins: 5,
  treasureScore: 200,
  heartHp: 15,
  heartTime: 5,
  petTimePlus: 5,
  fireAoeRatio: 0.25,
  strongBonus: 1.1,
  adaptiveWindow: 10,
  skipsPerStage: 3, // 점프(어려운 낱말 건너뛰기) 횟수
  fastStrokesPerSec: 2.5, // ≈150 타/분
  // 위험·보상 루프 (HP 있는 모드 공통)
  wrongHp: 3, // 오답 제출(용서 안 됨) -3 HP
  comboHealEvery: 10, // 10콤보마다
  comboHealHp: 5, // +5 HP
  perfectHealHp: 2, // PERFECT +2 HP
  itemHeartHp: 20, // 하트 아이템 회복량
  hpClearBonusPerHp: 2, // 클리어 시 남은 HP 1당 점수
};

export type Emit = (ev: string, data?: unknown) => void;

export interface RunOptions {
  stage: StageDef;
  difficulty: Difficulty;
  pet: PetDef;
  /** 다음 출제 단위 (offset = 적응형 난이도 보정 -1/0/+1). null = 지금 목표 없음(웨이브 사이 등) */
  next: (offset: number) => ContentUnit | null;
  emit: Emit;
  now?: () => number;
}

export interface SubmitResult {
  correct: boolean;
  perfect: boolean;
  forgiven: boolean; // 오답이지만 용서됨: 콤보 유지, 패널티 없음
  skipped?: boolean; // 점프로 건너뜀: 정확도 영향 없음, 콤보만 0
  mult: number; // 강공격 배율 (콤보/FEVER/펫)
  bonusScore: number;
  /** 오답 -3 / 10콤보 +5 / PERFECT +2 (모드가 상한 지켜 적용) */
  hpDelta: number;
  variant?: WordVariant;
  petActive?: PetActive; // 이번 제출로 FEVER에 진입해 펫 액티브가 발동됨
  feverEntered: boolean;
  target: ContentUnit;
}

export class TypingRun {
  readonly stats = new TypingStats();
  readonly stage: StageDef;
  readonly pet: PetDef;
  combo = 0;
  maxCombo = 0;
  perfectCount = 0;
  wordsDone = 0;
  coins = 0;
  treasures = 0;
  feverLevel: FeverLevel = 0;
  feverLeft = 0;
  shieldLeft = 0;
  wordHint = false; // 다람쥐 액티브: FEVER 동안 다음 낱말 힌트
  adaptiveOffset = 0;
  current: ContentUnit | null = null;
  /** 오답 노트: 틀린 음절을 확정했거나 오답 제출한 목표(중복 없음, 순서 유지) */
  mistakes: string[] = [];
  skipsLeft = RULES.skipsPerStage;

  private o: RunOptions;
  private now: () => number;
  private hitChars = 0;
  private wrongAt = -1;
  private fixed = false;
  private idle = 0;
  private drainAcc = 0;
  private decayAcc = 0;
  private bombElapsed = 0;
  private forgivePet: number;
  private forgiveFever = 0;
  private recent: { ok: boolean; sec: number; strokes: number }[] = [];
  private targetSec = 0;
  private seen = new Set<string>();

  constructor(o: RunOptions) {
    this.o = o;
    this.stage = o.stage;
    this.pet = o.pet;
    this.now = o.now ?? (() => performance.now());
    this.forgivePet = o.pet.passive === 'block_wrong' ? 1 : 0;
  }

  start() {
    this.stats.start(this.now());
    this.advance();
  }

  /** 다음 목표로 이동 */
  advance(): ContentUnit | null {
    const u = this.o.next(this.adaptiveOffset);
    this.current = u;
    if (u) this.seen.add(u.id);
    this.hitChars = 0;
    this.wrongAt = -1;
    this.fixed = false;
    this.bombElapsed = 0;
    this.targetSec = 0;
    return u;
  }

  /** 폭탄 단어 남은 시간(초), 폭탄이 아니면 null */
  bombLeft(): number | null {
    if (this.current?.variant !== 'bomb') return null;
    const limit = RULES.bombSec + (this.pet.passive === 'bomb_time' ? RULES.bombPetBonusSec : 0);
    return Math.max(0, limit - this.bombElapsed);
  }

  isShielded() {
    return this.shieldLeft > 0;
  }

  /** 강공격 배율 */
  damageMult(): number {
    let m = this.feverLevel > 0 ? RULES.feverMult[this.feverLevel] : this.combo >= 5 ? RULES.combo5Mult : 1;
    if (this.pet.passive === 'strong_bonus') m *= RULES.strongBonus;
    return m;
  }

  /**
   * 확정 문자열 변화(조합 중 아님)마다 호출. 판정은 하지 않는다.
   *  - 새로 확정된 음절이 목표와 맞으면 SYLLABLE_HIT (약공격)
   *  - 틀린 음절이면 SYLLABLE_MISS (표시용). 백스페이스로 고치면 PERFECT 불가
   */
  onCommit(value: string): { newHits: number; wrongIndex: number } {
    const cur = this.current;
    if (!cur) return { newHits: 0, wrongIndex: -1 };
    this.idle = 0;
    const v = value.normalize('NFC');
    const t = [...cur.text];
    const c = [...v];
    let m = 0;
    while (m < c.length && m < t.length && c[m] === t[m]) m++;
    if (!isPrefixInput(cur.text, v)) {
      if (this.wrongAt !== m) {
        this.wrongAt = m;
        this.stats.addTypo(); // 정확도에 오타 반영 (고쳐도 남는다)
        this.noteMistake(cur.text);
        this.o.emit('SYLLABLE_MISS', { index: m, target: cur });
      }
      return { newHits: 0, wrongIndex: m };
    }
    if (this.wrongAt >= 0) {
      this.wrongAt = -1;
      this.fixed = true;
    }
    if (v === cur.text) return { newHits: 0, wrongIndex: -1 }; // 완성 → submit에서 강공격
    let newHits = 0;
    for (let i = this.hitChars; i < m; i++) if (t[i].trim()) newHits++;
    if (m > this.hitChars) this.hitChars = m;
    if (newHits > 0) this.o.emit('SYLLABLE_HIT', { count: newHits, index: m - 1, mult: this.damageMult(), target: cur });
    return { newHits, wrongIndex: -1 };
  }

  /** Enter/Space/자동 제출. 정답·오답 판정과 콤보·FEVER·변화구·적응형 갱신. 목표 이동은 호출자가 advance(). */
  /** 점프: 현재 목표를 건너뛴다. 남은 횟수가 없으면 null */
  skip(): SubmitResult | null {
    const cur = this.current;
    if (!cur || this.skipsLeft <= 0) return null;
    this.skipsLeft--;
    this.idle = 0;
    this.setCombo(0);
    this.o.emit('SKIP', { left: this.skipsLeft, target: cur });
    return { correct: false, perfect: false, forgiven: false, skipped: true, mult: 1, bonusScore: 0, hpDelta: 0, feverEntered: false, target: cur };
  }

  submit(value: string, usedBackspace: boolean): SubmitResult | null {
    const cur = this.current;
    if (!cur) return null;
    this.idle = 0;
    const v = value.normalize('NFC');
    const correct = v === cur.text;
    const strokes = countStrokes(cur.text);
    this.recent.push({ ok: correct, sec: this.targetSec, strokes });
    if (this.recent.length > RULES.adaptiveWindow) this.recent.shift();

    if (!correct) {
      this.stats.addWrong(v, cur.text);
      this.noteMistake(cur.text);
      let forgiven = false;
      let forgivenBy: 'fever' | 'pet' | null = null;
      if (this.forgiveFever > 0) {
        this.forgiveFever--;
        forgiven = true;
        forgivenBy = 'fever';
      } else if (this.forgivePet > 0) {
        this.forgivePet--;
        forgiven = true;
        forgivenBy = 'pet';
      }
      if (forgivenBy === 'pet') this.o.emit('PET_PASSIVE', { passive: this.pet.passive, pet: this.pet });
      if (!forgiven) this.setCombo(0);
      this.updateAdaptive();
      return { correct: false, perfect: false, forgiven, mult: 1, bonusScore: 0, hpDelta: forgiven ? 0 : -RULES.wrongHp, feverEntered: false, target: cur };
    }

    const perfect = !usedBackspace && !this.fixed;
    if (perfect) this.perfectCount++;
    this.stats.addCorrect(cur.text);
    this.wordsDone++;
    this.setCombo(this.combo + 1);
    const mult = this.damageMult();
    let bonusScore = 0;
    if (cur.variant === 'treasure') {
      this.coins += RULES.treasureCoins;
      this.treasures++;
      bonusScore = RULES.treasureScore;
      this.o.emit('VARIANT_BONUS', { variant: 'treasure', coins: RULES.treasureCoins, score: bonusScore });
    } else if (cur.variant === 'heart') {
      this.o.emit('VARIANT_BONUS', { variant: 'heart', hp: RULES.heartHp, time: RULES.heartTime });
    }
    const prevLevel = this.feverLevel;
    const petActive = this.updateFever();
    this.updateAdaptive();
    const hpDelta = (perfect ? RULES.perfectHealHp : 0) + (this.combo % RULES.comboHealEvery === 0 ? RULES.comboHealHp : 0);
    return { correct: true, perfect, forgiven: false, mult, bonusScore, hpDelta, variant: cur.variant, petActive, feverEntered: this.feverLevel > prevLevel, target: cur };
  }

  /** 100ms마다. 폭탄 시간 초과면 { bomb: true } (호출자가 advance) */
  tick(dt: number): { bomb: boolean } {
    this.targetSec += dt;
    if (this.shieldLeft > 0) this.shieldLeft = Math.max(0, this.shieldLeft - dt);
    if (this.feverLevel >= 2) {
      this.feverLeft -= dt;
      if (this.feverLeft <= 0) {
        this.feverLeft = 0;
        this.wordHint = false;
        this.forgiveFever = 0;
        this.setLevel(this.combo >= RULES.powerCombo ? 1 : 0);
      }
    }
    // 무입력 감소 (목표가 없을 땐 — 웨이브 사이 등 — 세지 않는다). 그 시간은 타수 계산에서도 뺀다
    if (this.current) this.idle += dt;
    else this.stats.idleSec += dt;
    if (this.combo > 0 && this.idle >= RULES.idleSec) {
      this.decayAcc += dt;
      while (this.decayAcc >= 1 && this.combo > 0) {
        this.decayAcc -= 1;
        this.setCombo(this.combo - 1);
      }
    } else this.decayAcc = 0;
    // 폭탄
    if (this.current?.variant === 'bomb') {
      this.bombElapsed += dt;
      if (this.bombLeft() === 0) {
        this.setCombo(0);
        this.o.emit('BOMB_EXPLODE', { target: this.current });
        return { bomb: true };
      }
    }
    return { bomb: false };
  }

  /** 무입력이 길어지면 깎일 HP (정수). 목표가 있을 때만. 모드가 tick 마다 호출해 적용한다 */
  idleDrain(dt: number): number {
    if (!this.current || this.idle < RULES.drainAfterSec) {
      this.drainAcc = 0;
      return 0;
    }
    this.drainAcc += dt * RULES.drainHpPerSec;
    const n = Math.floor(this.drainAcc);
    this.drainAcc -= n;
    return n;
  }
  get idleSeconds() {
    return this.idle;
  }

  wordsSeen(): string[] {
    return [...this.seen];
  }

  private noteMistake(text: string) {
    if (!this.mistakes.includes(text)) this.mistakes.push(text);
  }

  private setCombo(c: number) {
    if (c === this.combo) return;
    this.combo = c;
    this.maxCombo = Math.max(this.maxCombo, c);
    this.o.emit('COMBO_CHANGED', c);
    if (this.feverLevel === 1 && c < RULES.powerCombo) this.setLevel(0);
  }

  private setLevel(l: FeverLevel) {
    if (l === this.feverLevel) return;
    this.feverLevel = l;
    this.o.emit('FEVER_CHANGED', { level: l, left: this.feverLeft });
  }

  /** 콤보 문턱에 따라 FEVER 단계 상승. FEVER(2+) 진입 시 펫 액티브 발동 → 그 종류를 돌려준다 */
  private updateFever(): PetActive | undefined {
    const c = this.combo;
    let target: FeverLevel = this.feverLevel;
    if (this.stage.mode === 'boss' && c >= RULES.finalCombo) target = 3;
    else if (c >= RULES.feverCombo) target = 2;
    else if (c >= RULES.powerCombo) target = 1;
    if (target <= this.feverLevel) return undefined;
    if (target >= 2) {
      this.feverLeft = target === 3 ? RULES.finalSec : RULES.feverSec;
      this.forgiveFever = 1;
    }
    this.setLevel(target);
    // 펫 액티브는 POWER(10콤보) 진입부터 발동 — FEVER 까지 기다리면 아이가 거의 못 본다
    const a = this.pet.active;
    if (a === 'shield') this.shieldLeft = RULES.shieldSec;
    if (a === 'word_hint') this.wordHint = true;
    this.o.emit('PET_ACTIVE', { active: a, pet: this.pet, level: target });
    return a;
  }

  private updateAdaptive() {
    if (this.recent.length < RULES.adaptiveWindow) return;
    const ok = this.recent.filter((r) => r.ok).length / this.recent.length;
    const sec = this.recent.reduce((a, r) => a + r.sec, 0);
    const strokes = this.recent.reduce((a, r) => a + (r.ok ? r.strokes : 0), 0);
    const fast = sec > 0 && strokes / sec >= RULES.fastStrokesPerSec;
    if (ok < 0.8) this.adaptiveOffset = Math.max(-1, this.adaptiveOffset - 1);
    else if (ok >= 0.97 && fast) this.adaptiveOffset = Math.min(1, this.adaptiveOffset + 1);
  }
}
