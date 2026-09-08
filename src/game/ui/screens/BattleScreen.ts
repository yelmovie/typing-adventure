import { Screen } from '../Screen';
import { h, fmt } from '../../util/dom';
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
import { DailySystem, pickDailyWords } from '../../systems/DailySystem';
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
import type { PetActive, WordVariant } from '../../types';
import type { FeverLevel } from '../../systems/TypingRun';

/** 전투 화면 DOM: HUD + 실제 한글 입력창 + 키보드 가이드. 로직(BattleSystem)의 소유자. */
export class BattleScreen extends Screen<{ stageId: StageId }> {
  private battle?: TypingMode;
  private typing?: TypingSystem;
  private hud?: HudController;
  private kbd?: KeyboardGuide;
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

  protected render(data: { stageId: StageId }) {
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
      const letter = all.filter((u) => u.tags.includes('편지'));
      this.battle = new LetterSystem(st, difficulty, pet, letter.length >= 6 ? letter : all, (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'telegram') {
      const all = getContentForStage(st.id).filter((u) => u.type === 'sentence');
      const tele = all.filter((u) => u.tags.includes('전보'));
      this.battle = new TelegramSystem(st, difficulty, pet, tele.length >= 3 ? tele : all.slice(0, 3), (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'boss') {
      const all = getContentForStage(st.id);
      const tag = (t: string) => all.filter((u) => u.tags.includes(t));
      const words = all.filter((u) => u.type === 'word');
      const crystals = tag('결정').length >= 5 ? tag('결정') : words.slice(0, 5);
      const rush = tag('러시').length >= 5 ? tag('러시') : words;
      const fin = tag('최종').length >= 2 ? tag('최종') : all.filter((u) => u.type === 'sentence');
      this.battle = new BossSystem(st, difficulty, pet, { crystals, rush, final: fin }, getEnemy(st.enemies[0]).sheet, (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'daily') {
      this.battle = new DailySystem(st, difficulty, pet, pickDailyWords(allContent().filter((u) => u.type === 'word')), (ev, d) => EventBus.emit(ev, d));
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
    });
    this.kbd = new KeyboardGuide();
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

    const kbdToggle = h('button', { class: 'btn btn-sm btn-gray', onclick: () => {
      const v = !SaveSystem.get().settings.showKeyboardGuide;
      SaveSystem.setSettings({ showKeyboardGuide: v });
      this.kbd?.setVisible(v);
      kbdToggle.textContent = v ? '가이드 끄기' : '가이드 켜기';
      this.typing?.focus();
    } }, save.settings.showKeyboardGuide ? '가이드 끄기' : '가이드 켜기');

    this.bottom = h(
      'div',
      { class: 'panel panel-glass battle-bottom' },
      h(
        'div',
        {},
        h('div', { class: 'bb-target-lbl' }, '🎯 목표', h('span', { class: 'muted', style: { fontFamily: 'var(--font-body)', letterSpacing: '0', fontSize: '16px' } }, st.mode === 'wave' ? '몬스터 머리 위 낱말을 입력하면 공격! 다 치면 처치' : st.mode === 'race' ? '낱말을 빨리 칠수록 빨리 달려! 오타는 감속' : st.mode === 'letter' ? '편지의 문장을 띄어쓰기까지 똑같이 입력하고 Enter' : st.mode === 'telegram' ? '전보 문장을 그대로 입력하고 Enter! 문장마다 브레이크가 걸려' : st.mode === 'boss' ? '결정 → 러시 → 마지막 문장! 배운 걸 전부 써' : st.mode === 'daily' ? '오늘의 낱말 20개, 내 기록에 도전!' : st.index <= 2 ? '낱말을 똑같이 입력하고 Enter 또는 Space' : '문장을 똑같이 입력하고 Enter')),
        h('div', { class: 'bb-target-row' }, this.hud.targetEl, this.hud.variantEl),
        this.hud.hintEl,
        h('div', { class: 'bb-input-wrap' }, this.inputEl, h('span', { class: 'bb-input-hint' }, '⏎')),
      ),
      h('div', { class: 'bb-side' }, h('div', { class: 'side-head' }, h('span', {}, '⌨ 키보드 가이드'), kbdToggle), this.kbd.el),
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
      h('div', { class: 'battle-pause' }, h('button', { class: 'icon-btn', title: '일시정지', onclick: () => this.pauseMenu() }, '⏸')),
    );

    this.typing = new TypingSystem(this.inputEl, {
      onChange: (value, composing) => this.onInputChange(value, composing),
      onSubmit: (value, meta) => this.battle?.submit(value, meta.usedBackspace),
    });
    this.typing.setEnabled(false);

    this.bind(Events.TARGET_CHANGED, (s: BattleSnapshot) => this.onTarget(s));
    this.bind(Events.HUD_TICK, (s: BattleSnapshot) => this.hud?.update(s));
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number; snapshot: BattleSnapshot }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { snapshot: BattleSnapshot; forgiven: boolean; shielded: boolean }) => this.onWrong(d));
    this.bind(Events.STAGE_CLEAR, (s: BattleSnapshot) => this.finish(true, s));
    this.bind(Events.STAGE_FAILED, (d: { reason: 'time' | 'hp'; snapshot: BattleSnapshot }) => this.finish(false, d.snapshot, d.reason));
    this.bind(Events.SETTINGS_CHANGED, (s: { showKeyboardGuide: boolean; bgm: boolean; sfx: boolean }) => {
      this.kbd?.setVisible(s.showKeyboardGuide);
      const img = this.hud?.muteBtn.querySelector('img');
      if (img) img.src = `./assets/ui/icon_${!s.bgm && !s.sfx ? 'sound_off' : 'sound_on'}.webp`;
    });
    this.bind(Events.SYLLABLE_MISS, (d: { index: number }) => this.hud?.shakeChar(d.index));
    this.bind(Events.WAVE_GATE, () => this.judge('🌲 숲의 문이 열렸다!', 'fever'));
    this.bind(Events.RACE_TURBO, () => this.judge('🚀 TURBO!', 'fever'));
    this.bind(Events.BOSS_PHASE, (d: { phase: number }) => { if (d.phase === 2) this.judge('⚡ 보호막 해제! 러시!', 'fever'); if (d.phase === 3) this.judge('🌟 별빛의 문장을 완성하라', 'fever'); });
    this.bind(Events.BOSS_ARMOR, () => this.judge('💥 갑옷 파괴!', 'fever'));
    this.bind(Events.BOSS_DARK, () => { this.flash('wrong'); this.judge('🌑 어둠이 밀려온다!', 'miss'); });
    this.bind(Events.TELE_BRAKE, (d: { stage: number; total: number }) => this.judge(`🛑 브레이크 ${d.stage}/${d.total}단`, 'good'));
    this.bind(Events.TELE_STOP, () => this.judge('🚂 열차 정지 완료!', 'fever'));
    this.bind(Events.TELE_OUTAGE, (d: { on: boolean }) => { if (d.on) this.flash('wrong'); this.el.classList.toggle('outage', d.on); });
    this.bind(Events.LETTER_LOCK, (d: { lock: number; total: number }) => this.judge(`🔓 자물쇠 ${d.lock}/${d.total} 해제!`, 'fever'));
    this.bind(Events.LETTER_GLOW, () => this.judge('✨ 룬 발광!', 'good'));
    this.bind(Events.LETTER_SECRET, (d: { coins: number }) => this.judge(`🗝 비밀방 발견! +${d.coins} 코인`, 'bonus'));
    this.bind(Events.LETTER_GATE, (d: { accuracyReward: boolean }) => { this.judge('🌟 황금문이 열렸다!', 'fever'); if (d.accuracyReward) window.setTimeout(() => this.judge('🎁 정확도 98%! 비밀 보상', 'bonus'), 900); });
    this.bind(Events.RACE_CAUGHT, (d: { catches: number; max: number }) => { this.flash('wrong'); this.judge(`잡혔다! (${d.catches}/${d.max})`, 'miss'); });
    this.bind(Events.RACE_FINISH, (d: { beatGhost: boolean }) => this.judge(d.beatGhost ? '🏁 도착! 어제의 나 추월!' : '🏁 게이트 도착!', 'fever'));
    this.bind(Events.WAVE_TOUCH, (d: { hpLoss: number }) => { if (d.hpLoss > 0) this.flash('wrong'); });
    this.bind(Events.FEVER_CHANGED, (d: { level: FeverLevel }) => this.onFever(d.level));
    this.bind(Events.PET_ACTIVE, (d: { active: PetActive; pet: { name: string; activeDesc: string } }) => this.judge(`${d.pet.name}: ${d.pet.activeDesc.replace('FEVER 때 ', '')}!`, 'pet'));
    this.bind(Events.BOMB_EXPLODE, () => { this.flash('wrong'); this.judge('💣 펑! 콤보 초기화', 'miss'); AudioManager.sfx('bomb'); });
    this.bind(Events.VARIANT_BONUS, (d: { variant: WordVariant; coins?: number; hp?: number }) => {
      AudioManager.sfx('coin');
      this.judge(d.variant === 'treasure' ? `💰 보물! +${d.coins} 코인` : `💗 HP +${d.hp}`, 'bonus');
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
    this.judge(d.forgiven ? '오타 용서!' : d.shielded ? '🛡 방어막!' : 'MISS...', d.forgiven || d.shielded ? 'good' : 'miss');
    this.hud?.update(d.snapshot);
    this.inputEl?.classList.remove('bad');
  }

  /** FEVER 단계 변화: 배경 밝아짐 + BGM 템포업 + 판정 문구 */
  private onFever(level: FeverLevel) {
    this.el.classList.toggle('fever', level >= 2);
    this.el.classList.toggle('power', level === 1);
    AudioManager.setRate(level >= 2 ? 1.15 : 1);
    if (level === 1) this.judge('⚡ POWER! ⚡', 'perfect');
    if (level === 2) { this.judge('🔥 FEVER TIME! 🔥', 'fever'); AudioManager.sfx('fever'); }
    if (level === 3) { this.judge('👑 FINAL FEVER! 👑', 'fever'); AudioManager.sfx('fever'); }
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
    const j = h('div', { class: `judge-pop ${cls}` }, text);
    this.el.append(j);
    window.setTimeout(() => j.remove(), 950);
  }

  private async pauseMenu() {
    if (!this.battle || this.battle.finished || this.paused) return;
    this.paused = true;
    this.battle.pause();
    this.typing?.setEnabled(false);
    AudioManager.sfx('click');
    const quit = await confirmModal('⏸ 일시정지', '잠시 쉬어갈까요?\n지도로 돌아가면 이번 전투 기록은 저장되지 않아요.', '계속하기', '지도로 나가기');
    if (quit) {
      this.paused = false;
      this.battle.resume();
      this.lastTick = performance.now();
      this.typing?.setEnabled(true);
    } else {
      void navigate('worldmap', { focusIndex: this.battle.stage.index });
    }
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
      this.judge('STAGE CLEAR!', 'perfect');
    } else {
      this.judge(st.mode === 'telegram' ? '급정지 실패… 다시 도전!' : reason === 'time' ? `시간 종료... ${fmt.time(0)}` : 'HP가 0이 됐어요...', 'miss');
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
