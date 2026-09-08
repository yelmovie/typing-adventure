import { Screen } from '../Screen';
import { h, fmt, icon } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate } from '../../Game';
import { getStage } from '../../data/stages';
import { getCharacter, getPet, portraitUrl } from '../../data/characters';
import type { StageId, ContentUnit } from '../../types';
import { BattleSystem, type BattleSnapshot, type TypingMode } from '../../systems/BattleSystem';
import { WaveSystem } from '../../systems/WaveSystem';
import { RaceSystem } from '../../systems/RaceSystem';
import { LetterSystem } from '../../systems/LetterSystem';
import { TelegramSystem } from '../../systems/TelegramSystem';
import { BossSystem } from '../../systems/BossSystem';
import { DailySystem, pickDailyWords, pickDailyLong, DAILY, type DailyKind } from '../../systems/DailySystem';
import { allContent } from '../../data/content';
import { currentTitle } from '../../data/titles';
import { getEnemy } from '../../data/enemies';
import { getContentForStage } from '../../data/content';
import { TypingSystem } from '../../systems/TypingSystem';
import { HudController } from '../HudController';
import { KeyboardGuide } from '../KeyboardGuide';
import { EventBus, Events } from '../../EventBus';
import { AudioManager } from '../../systems/AudioManager';
import { finalizeAndSave } from '../../systems/ScoreSystem';
import { confirmModal, closeModal } from '../ModalController';
import { refreshSoundIcon } from '../TopBar';
import type { PetActive, WordVariant } from '../../types';
import type { FeverLevel } from '../../systems/TypingRun';

/** 순서N 태그 기준 정렬 (없으면 원래 순서) */
const byOrder = (a: { tags: string[] }, b: { tags: string[] }) => {
  const n = (u: { tags: string[] }) => Number((u.tags.find((t) => t.startsWith('순서')) ?? '순서0').slice(2));
  return n(a) - n(b);
};

/** 전투 화면 DOM: HUD + 실제 한글 입력창 + 키보드 가이드. 로직(BattleSystem)의 소유자. */
export class BattleScreen extends Screen<{ stageId: StageId; dailyKind?: DailyKind }> {
  private battle?: TypingMode;
  private typing?: TypingSystem;
  private hud?: HudController;
  private kbd?: KeyboardGuide;
  private kbdToggle?: HTMLElement;
  private bottom?: HTMLElement;
  private inputEl?: HTMLInputElement;
  private tickTimer = 0;
  private lastTick = 0;
  private handlers: [string, (...a: never[]) => void][] = [];
  private paused = false;
  private currentTarget: ContentUnit | null = null;
  private feverOverlay?: HTMLElement;

  constructor() {
    super('battle');
  }

  protected render(data: { stageId: StageId; dailyKind?: DailyKind }) {
    const st = getStage(data.stageId);
    const save = SaveSystem.get();
    const ch = getCharacter(save.profile.characterId);
    const pet = getPet(save.profile.petId);
    this.paused = false;
    // 도움 모드: 그 스테이지만 기초 난이도 규칙(시간 +35%, 적 느리게)
    const difficulty = save.progress.assist?.[st.id] ? 'beginner' : save.profile.difficulty;

    if (st.mode === 'wave') {
      const pool = getContentForStage(st.id).filter((u) => u.type === 'word');
      const len = (u: { text: string }) => [...u.text].filter((c) => c.trim()).length;
      this.battle = new WaveSystem(st, difficulty, pet, { slime: pool.filter((u) => len(u) <= 2), bat: pool.filter((u) => len(u) >= 3) }, (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'race') {
      const pool = getContentForStage(st.id).filter((u) => u.type === 'word');
      const ghost = save.records.ghosts?.[st.id] ?? null;
      this.battle = new RaceSystem(st, difficulty, pet, pool, ghost, getEnemy(st.enemies[0]).sheet, (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'letter') {
      const all = getContentForStage(st.id).filter((u) => u.type === 'sentence');
      const letter = all.filter((u) => u.tags.includes('편지')).sort(byOrder);
      this.battle = new LetterSystem(st, difficulty, pet, letter.length >= 6 ? letter : all, (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'telegram') {
      const all = getContentForStage(st.id).filter((u) => u.type === 'sentence');
      const tele = all.filter((u) => u.tags.includes('전보')).sort(byOrder);
      this.battle = new TelegramSystem(st, difficulty, pet, tele.length >= 3 ? tele : all.slice(0, 3), (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'boss') {
      const all = getContentForStage(st.id);
      const tag = (t: string) => all.filter((u) => u.tags.includes(t));
      const words = all.filter((u) => u.type === 'word');
      const crystals = tag('결정').length >= 5 ? tag('결정') : words.slice(0, 5);
      const rush = tag('러시').length >= 5 ? tag('러시') : words;
      const fin = (tag('최종').length >= 2 ? tag('최종') : all.filter((u) => u.type === 'sentence')).sort(byOrder);
      this.battle = new BossSystem(st, difficulty, pet, { crystals, rush, final: fin }, getEnemy(st.enemies[0]).sheet, (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'daily') {
      const kind: DailyKind = data.dailyKind ?? 'word';
      const all = allContent();
      const dailyWords = kind === 'word' ? pickDailyWords(all.filter((u) => u.type === 'word')) : kind === 'sentence' ? pickDailyWords(all.filter((u) => u.type === 'sentence' && u.tags.includes('오늘문장')), DAILY.sentences) : pickDailyLong(all.filter((u) => u.type === 'sentence' && u.tags.some((t) => /^장문\d+$/.test(t))));
      this.battle = new DailySystem(st, difficulty, pet, dailyWords, (ev, d) => EventBus.emit(ev, d), kind);
    } else this.battle = new BattleSystem(st, difficulty, pet.id);
    if (import.meta.env.DEV) (window as unknown as { __battle: TypingMode }).__battle = this.battle; // 개발용 콘솔 접근
    this.hud = new HudController({
      stageIndex: st.index,
      stageName: st.name,
      playerName: save.profile.name,
      level: SaveSystem.level(),
      portrait: portraitUrl(ch.sheet),
      petName: pet.name,
      petPortrait: portraitUrl(pet.sheet),
      petSkill: `${pet.passiveDesc} · ${pet.activeDesc}`,
      petActive: pet.active,
      countLabel: st.mode === 'wave' ? '몬스터' : st.mode === 'letter' || st.mode === 'telegram' ? '문장' : st.mode === 'boss' ? '페이즈' : '낱말',
      telegram: st.mode === 'telegram',
      timeLabel: st.mode === 'letter' || st.mode === 'daily' ? '걸린 시간' : st.mode === 'telegram' ? '충돌까지' : undefined,
      hideEnemy: st.mode === 'letter' || st.mode === 'telegram' || st.mode === 'daily',
      race: st.mode === 'race',
      bestCpm: save.records.bestCpm,
      title: currentTitle(save.progress.coins ?? 0).name,
      onHome: () => this.homeMenu(),
    });
    this.kbd = new KeyboardGuide({ onBackdropClick: () => this.setKbdVisible(false) });
    this.kbd.setVisible(save.settings.showKeyboardGuide);
    this.kbd.setBig(pet.passive === 'key_hint');

    this.inputEl = h('input', {
      class: 'input bb-input',
      type: 'text',
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: '여기에 입력하세요',
      'aria-label': '타자 입력창',
      lang: 'ko',
    }) as HTMLInputElement;

    this.kbdToggle = h('button', { class: 'btn btn-sm btn-gray bb-kbd-toggle', onclick: () => this.setKbdVisible(!SaveSystem.get().settings.showKeyboardGuide) }, save.settings.showKeyboardGuide ? '가이드 끄기' : '가이드 켜기');

    this.bottom = h(
      'div',
      { class: 'panel panel-glass battle-bottom' },
      h(
        'div',
        { class: 'bb-main' },
        h(
          'div',
          { class: 'bb-target-lbl' },
          icon('target'),
          '목표',
          h('span', { class: 'bb-target-desc' }, st.mode === 'wave' ? '몬스터 머리 위 낱말을 입력하면 공격! 다 치면 처치' : st.mode === 'race' ? '낱말을 빨리 칠수록 빨리 달려! 오타는 감속' : st.mode === 'letter' ? '편지의 문장을 띄어쓰기까지 똑같이 입력하고 Enter' : st.mode === 'telegram' ? '전보 문장을 그대로 입력하고 Enter! 문장마다 브레이크가 걸려' : st.mode === 'boss' ? '결정 → 러시 → 마지막 문장! 배운 걸 전부 써' : st.mode === 'daily' ? '오늘의 낱말 20개, 내 기록에 도전!' : st.index <= 2 ? '낱말을 똑같이 입력하고 Enter 또는 Space' : '문장을 똑같이 입력하고 Enter'),
          this.kbdToggle,
        ),
        h('div', { class: 'bb-target-row' }, this.hud.targetEl, this.hud.variantEl),
        this.hud.hintEl,
        h('div', { class: 'bb-input-wrap' }, this.inputEl, h('span', { class: 'bb-input-hint' }, icon('key_enter')), this.hud.skipBtn),
      ),
    );

    this.feverOverlay = h('div', { class: 'fever-overlay' });
    this.el.append(
      this.feverOverlay,
      this.hud.top,
      this.hud.left,
      this.hud.enemyPanel,
      this.hud.combo,
      this.hud.track,
      this.hud.tele,
      this.bottom,
      this.kbd.el,
    );
    this.el.classList.add(`mode-${st.mode}`);

    this.typing = new TypingSystem(this.inputEl, {
      onChange: (value, composing) => this.onInputChange(value, composing),
      onSubmit: (value, meta) => this.battle?.submit(value, meta.usedBackspace),
      onSkip: () => this.doSkip(),
      onMove: (dir, pressed) => this.battle?.move?.(dir, pressed),
    });
    this.typing.setEnabled(false);
    this.hud.skipBtn.addEventListener('click', () => { this.doSkip(); this.typing?.focus(); });

    this.bind(Events.TARGET_CHANGED, (s: BattleSnapshot) => this.onTarget(s));
    this.bind(Events.HUD_TICK, (s: BattleSnapshot) => this.hud?.update(s));
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number; snapshot: BattleSnapshot }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { snapshot: BattleSnapshot; forgiven: boolean; shielded: boolean }) => this.onWrong(d));
    this.bind(Events.STAGE_CLEAR, (s: BattleSnapshot) => this.finish(true, s));
    this.bind(Events.STAGE_FAILED, (d: { reason: 'time' | 'hp'; snapshot: BattleSnapshot }) => this.finish(false, d.snapshot, d.reason));
    this.bind(Events.SETTINGS_CHANGED, (s: { showKeyboardGuide: boolean; bgm: boolean; sfx: boolean }) => {
      this.kbd?.setVisible(s.showKeyboardGuide);
      if (this.kbdToggle) this.kbdToggle.textContent = s.showKeyboardGuide ? '가이드 끄기' : '가이드 켜기';
      if (this.hud) refreshSoundIcon(this.hud.soundEl);
    });
    this.bind(Events.SYLLABLE_MISS, (d: { index: number }) => this.hud?.shakeChar(d.index));
    this.bind(Events.IDLE_DRAIN, (d: { hpLoss: number; idle: number }) => { this.flash('wrong'); if (Math.floor(d.idle) % 2 === 0) this.judge(`멈추면 안 돼! HP -${d.hpLoss}`, 'miss'); });
    this.bind(Events.WAVE_GATE, () => this.judge('숲의 문이 열렸다!', 'fever'));
    this.bind(Events.RACE_TURBO, () => this.judge('TURBO!', 'fever'));
    this.bind(Events.BOSS_PHASE, (d: { phase: number }) => { if (d.phase === 2) this.judge('보호막 해제! 러시!', 'fever'); if (d.phase === 3) this.judge('별빛의 문장을 완성하라', 'fever'); });
    this.bind(Events.BOSS_ARMOR, () => this.judge('갑옷 파괴!', 'fever'));
    this.bind(Events.BOSS_DARK, () => { this.flash('wrong'); this.judge('어둠이 밀려온다!', 'miss'); });
    this.bind(Events.TELE_BRAKE, (d: { stage: number; total: number }) => this.judge(`브레이크 ${d.stage}/${d.total}단`, 'good'));
    this.bind(Events.TELE_STOP, () => this.judge('열차 정지 완료!', 'fever'));
    this.bind(Events.TELE_OUTAGE, (d: { on: boolean }) => { if (d.on) this.flash('wrong'); this.el.classList.toggle('outage', d.on); });
    this.bind(Events.LETTER_LOCK, (d: { lock: number; total: number }) => this.judge(`자물쇠 ${d.lock}/${d.total} 해제!`, 'fever'));
    this.bind(Events.LETTER_GLOW, () => this.judge('룬 발광!', 'good'));
    this.bind(Events.LETTER_SECRET, (d: { coins: number }) => this.judge(`비밀방 발견! +${d.coins} 코인`, 'bonus'));
    this.bind(Events.LETTER_GATE, (d: { accuracyReward: boolean }) => { this.judge('황금문이 열렸다!', 'fever'); if (d.accuracyReward) window.setTimeout(() => this.judge('정확도 98%! 비밀 보상', 'bonus'), 900); });
    this.bind(Events.RACE_CAUGHT, (d: { catches: number; max: number }) => { this.flash('wrong'); this.judge(`잡혔다! (${d.catches}/${d.max})`, 'miss'); });
    this.bind(Events.RACE_FINISH, (d: { beatGhost: boolean }) => this.judge(d.beatGhost ? '도착! 어제의 나 추월!' : '게이트 도착!', 'fever'));
    this.bind(Events.WAVE_TOUCH, (d: { hpLoss: number }) => { if (d.hpLoss > 0) this.flash('wrong'); });
    this.bind(Events.FEVER_CHANGED, (d: { level: FeverLevel }) => this.onFever(d.level));
    this.bind(Events.PET_ACTIVE, (d: { active: PetActive; pet: { name: string; activeDesc: string } }) => this.judge(`${d.pet.name}: ${d.pet.activeDesc.replace('10콤보 때 ', '')}!`, 'pet'));
    this.bind(Events.PET_PASSIVE, (d: { pet: { name: string; passiveDesc: string } }) => this.judge(`${d.pet.name}이(가) ${d.pet.passiveDesc}!`, 'pet'));
    this.bind(Events.BOMB_EXPLODE, () => { this.flash('wrong'); this.judge('펑! 콤보 초기화', 'miss'); AudioManager.sfx('bomb'); });
    this.bind(Events.VARIANT_BONUS, (d: { variant: WordVariant; coins?: number; hp?: number }) => {
      AudioManager.sfx('coin');
      this.judge(d.variant === 'treasure' ? `보물! +${d.coins} 코인` : `HP +${d.hp}`, 'bonus');
    });

    this.hud.update(this.battle.snapshot());
    this.countdown();
  }

  private bind<T>(ev: string, fn: (d: T) => void) {
    EventBus.on(ev, fn);
    this.handlers.push([ev, fn as (...a: never[]) => void]);
  }

  /** 3, 2, 1, GO! 카운트다운 후 전투 시작 */
  private countdown() {
    const wrap = h('div', { class: 'countdown' });
    this.el.append(wrap);
    const steps = ['3', '2', '1', 'GO!'];
    let i = 0;
    const next = () => {
      if (!this.battle) return;
      wrap.replaceChildren(h('div', { class: `cd ${steps[i] === 'GO!' ? 'go' : ''}` }, steps[i]));
      AudioManager.sfx(steps[i] === 'GO!' ? 'go' : 'countdown');
      i++;
      if (i < steps.length) window.setTimeout(next, 650);
      else
        window.setTimeout(() => {
          wrap.remove();
          this.start();
        }, 500);
    };
    window.setTimeout(next, 350);
  }

  private start() {
    if (!this.battle) return;
    this.battle.start();
    this.typing?.setEnabled(true);
    this.lastTick = performance.now();
    this.tickTimer = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - this.lastTick) / 1000;
      this.lastTick = now;
      if (!this.paused) this.battle?.tick(dt);
    }, 100);
  }

  private onTarget(s: BattleSnapshot) {
    this.currentTarget = s.target;
    this.hud?.update(s);
    if (s.target) {
      this.inputEl?.classList.toggle('long', [...s.target.text].length > 8);
      this.typing?.setTarget(s.target.text, s.target.type);
      this.hud?.renderTarget(s.target.text, '');
      this.kbd?.update(s.target.text, '');
      this.typing?.focus();
    }
  }

  /** 점프: 어려운 낱말 건너뛰기 (판마다 3번) */
  private doSkip() {
    if (!this.battle || this.paused) return;
    const left = this.battle.run.skipsLeft;
    if (left <= 0) {
      this.judge('점프 다 썼어!', 'miss');
      AudioManager.sfx('miss');
      return;
    }
    if (this.battle.skip()) {
      AudioManager.sfx('go', { rate: 1.4 });
      this.judge(`점프! 남은 ${left - 1}번`, 'good');
      this.typing?.setTarget(this.currentTarget?.text ?? '', this.currentTarget?.type ?? 'word');
      this.hud?.setSkips(left - 1);
    }
  }

  private onInputChange(value: string, composing: boolean) {
    if (!this.currentTarget) return;
    this.hud?.renderTarget(this.currentTarget.text, value);
    this.kbd?.update(this.currentTarget.text, value);
    // 조합 중이어도 '틀림' 판정은 하지 않는다. 색상 힌트만 접두어 기준으로 표시.
    const bad = this.hud?.targetEl.querySelector('.bad') != null;
    this.inputEl?.classList.toggle('bad', bad);
    // 확정 음절 → 약공격 판정 (compositionend 이후 또는 조합 없는 입력)
    if (!composing) this.battle?.commit(value);
  }

  private onCorrect(d: { perfect: boolean; combo: number; snapshot: BattleSnapshot }) {
    this.flash('right');
    this.judge(d.perfect ? 'PERFECT!' : d.combo >= 5 ? 'GREAT!' : 'GOOD!', d.perfect ? 'perfect' : 'good');
    this.hud?.update(d.snapshot);
  }

  private onWrong(d: { snapshot: BattleSnapshot; forgiven: boolean; shielded: boolean }) {
    this.flash('wrong');
    this.judge(d.forgiven ? '오타 용서!' : d.shielded ? '방어막!' : 'MISS', d.forgiven || d.shielded ? 'good' : 'miss');
    this.hud?.update(d.snapshot);
    this.inputEl?.classList.remove('bad');
  }

  /** FEVER 단계 변화: 배경 밝아짐 + BGM 템포업 + 판정 문구 */
  private onFever(level: FeverLevel) {
    this.el.classList.toggle('fever', level >= 2);
    this.el.classList.toggle('power', level === 1);
    AudioManager.setRate(level >= 2 ? 1.15 : 1);
    if (level === 1) this.judge('POWER!', 'perfect');
    if (level === 2) { this.judge('FEVER TIME!', 'fever big'); AudioManager.sfx('fever'); }
    if (level === 3) { this.judge('FINAL FEVER!', 'fever big'); AudioManager.sfx('fever'); }
  }

  private flash(cls: 'right' | 'wrong') {
    const b = this.bottom;
    if (!b) return;
    b.classList.remove('right', 'wrong');
    void b.offsetWidth;
    b.classList.add(cls);
    window.setTimeout(() => b.classList.remove(cls), 420);
  }

  private judge(text: string, cls: string) {
    // 같은 종류(PERFECT/GOOD/MISS)는 이전 것을 바로 교체, 다른 종류는 위로 쌓아서 겹치지 않게. 위치는 입력 패널 바로 위 띠(CSS .judge-pop)
    const kind = cls.split(' ')[0];
    const live = [...this.el.querySelectorAll<HTMLElement>('.judge-pop')];
    for (const old of live) if (old.dataset.cls === kind || (['perfect', 'good', 'miss'].includes(kind) && ['perfect', 'good', 'miss'].includes(old.dataset.cls ?? ''))) old.remove();
    const rest = [...this.el.querySelectorAll<HTMLElement>('.judge-pop')];
    const j = h('div', { class: `judge-pop ${cls}`, dataset: { cls: kind } }, h('span', { class: 'jp-text' }, h('span', { class: 'jp-inner' }, text)));
    j.style.setProperty('--stack', String(rest.length));
    this.el.append(j);
    window.setTimeout(() => j.remove(), kind === 'perfect' || kind === 'good' || kind === 'miss' ? 900 : 1150);
  }

  /** 전투 중 홈 버튼: 잠시 멈추고 "정말 나갈까요?" 확인 후에만 홈으로 이동, 취소하면 이어서 진행 */
  private async homeMenu() {
    if (!this.battle || this.battle.finished || this.paused) return;
    this.paused = true;
    this.battle.pause();
    this.typing?.setEnabled(false);
    const leave = await confirmModal('나가기', '정말 나갈까요?\n지금 전투 기록은 저장되지 않아요.', '나가기', '계속하기');
    if (leave) {
      void navigate('home');
    } else {
      this.paused = false;
      this.battle.resume();
      this.lastTick = performance.now();
      this.typing?.setEnabled(true);
    }
  }

  /** 키보드 가이드 켜기/끄기: 화면 중앙 오버레이 토글 + 설정 저장 */
  private setKbdVisible(v: boolean) {
    SaveSystem.setSettings({ showKeyboardGuide: v });
    this.kbd?.setVisible(v);
    if (this.kbdToggle) this.kbdToggle.textContent = v ? '가이드 끄기' : '가이드 켜기';
    if (v) this.inputEl?.blur();
    else this.typing?.focus();
  }

  private finish(cleared: boolean, s: BattleSnapshot, reason?: 'time' | 'hp') {
    if (!this.battle) return;
    window.clearInterval(this.tickTimer);
    this.typing?.setEnabled(false);
    this.hud?.update(s);
    const st = this.battle.stage;
    const result = finalizeAndSave(
      {
        stageId: st.id,
        cleared,
        failReason: reason,
        score: s.score,
        accuracy: Math.round(s.accuracy * 10) / 10,
        cpm: Math.round(s.cpm),
        maxCombo: s.maxCombo,
        elapsedSec: Math.round(s.elapsedSec),
        wordsDone: s.wordsDone,
        wordsTotal: s.targetTotal,
        perfectCount: s.perfectCount,
        coins: s.coins,
        mistakes: this.battle.run.mistakes,
        ghost: this.battle instanceof RaceSystem && cleared ? this.battle.ghostRecord() : undefined,
        beatGhost: this.battle instanceof RaceSystem ? this.battle.beatGhost : undefined,
        wordsSeen: this.battle.wordsSeen(),
      },
      st,
    );
    if (cleared) {
      this.judge('STAGE CLEAR!', 'fever big');
    } else {
      this.judge(st.mode === 'telegram' ? '급정지 실패… 다시 도전!' : reason === 'time' ? `시간 종료 ${fmt.time(0)}` : 'HP가 0이 됐어요', 'miss');
    }
    window.setTimeout(() => void navigate('result', { result }), cleared ? (st.mode === 'boss' ? 4200 : 2200) : 1600);
  }

  protected onHide() {
    window.clearInterval(this.tickTimer);
    AudioManager.setRate(1);
    closeModal();
    for (const [ev, fn] of this.handlers) EventBus.off(ev, fn);
    this.handlers = [];
    this.typing?.setEnabled(false);
    this.typing?.destroy();
    this.typing = undefined;
    this.battle = undefined;
    this.hud = undefined;
    this.kbd = undefined;
    this.currentTarget = null;
  }
}
