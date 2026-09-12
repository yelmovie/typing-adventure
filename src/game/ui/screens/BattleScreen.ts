import { Screen } from '../Screen';
import { h, fmt, icon } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate } from '../../Game';
import { getStage } from '../../data/stages';
import { getCharacter, getPet, portraitUrl, profileDisplayName } from '../../data/characters';
import type { StageId, ContentUnit } from '../../types';
import type { BattleSnapshot, TypingMode } from '../../systems/BattleState';
import { RaceSystem } from '../../systems/RaceSystem';
import { DailySystem, todayKey, type DailyKind } from '../../systems/DailySystem';
import { allContent } from '../../data/content';
import { currentTitle } from '../../data/titles';
import { getEnemy } from '../../data/enemies';
import { getContentForStage, getRemixContent } from '../../data/content';
import { TypingSystem } from '../../systems/TypingSystem';
import { HudController } from '../HudController';
import { KeyboardGuide } from '../KeyboardGuide';
import { EventBus, Events } from '../../EventBus';
import { AudioManager } from '../../systems/AudioManager';
import { finalizeAndSave } from '../../systems/ScoreSystem';
import { alertModal, confirmModal, closeModal } from '../ModalController';
import { refreshSoundIcon } from '../TopBar';
import type { PetActive, WordVariant } from '../../types';
import type { FeverLevel } from '../../systems/TypingRun';
import { getLanguage, t } from '../../i18n/Locale';
import { createBattleMode } from '../battle/createBattleMode';
import { getBattleCopy } from '../battle/BattleCopy';
import { BattleFeedback } from '../battle/BattleFeedback';


/** 전투 화면 DOM: HUD + 실제 한글 입력창 + 키보드 가이드. 여섯 모드의 타이핑 로직을 연결한다. */
export class BattleScreen extends Screen<{ stageId: StageId; dailyKind?: DailyKind; remix?: boolean }> {
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
  private feedback?: BattleFeedback;
  private get copy() { return getBattleCopy(getLanguage()); }
  private started = false;
  private pauseDialogOpen = false;
  private pausedByOverlay = false;
  private modalObserver?: MutationObserver;
  private lifetime = 0;
  private remix = false;
  private visibilityHandler = () => {
    if (document.hidden) void this.pauseMenu(this.copy.pauseHidden);
  };
  private shortcutHandler = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
    event.preventDefault();
    if (this.kbd?.el.classList.contains('show')) this.setKbdVisible(false);
    else void this.pauseMenu();
  };

  constructor() {
    super('battle');
  }

  protected render(data: { stageId: StageId; dailyKind?: DailyKind; remix?: boolean }) {
    this.lifetime++;
    const st = getStage(data.stageId);
    const save = SaveSystem.get();
    const ch = getCharacter(save.profile.characterId);
    const pet = getPet(save.profile.petId);
    this.paused = false;
    this.started = false;
    this.pauseDialogOpen = false;
    this.pausedByOverlay = false;
    this.remix = data.remix === true;
    const stagePool = data.remix ? getRemixContent(st.id) : getContentForStage(st.id);
    // 도움 모드: 그 스테이지만 기초 난이도 규칙(시간 +35%, 적 느리게)
    const difficulty = save.progress.assist?.[st.id] ? 'beginner' : save.profile.difficulty;

    this.battle = createBattleMode({
      stage: st, difficulty, pet, stagePool,
      allPool: st.mode === 'daily' ? allContent() : [],
      language: getLanguage(),
      ghost: save.records.ghosts?.[st.id] ?? null,
      enemySheet: st.mode === 'race' || st.mode === 'boss' ? getEnemy(st.enemies[0]).sheet : '',
      dailyKind: data.dailyKind, dailyKey: todayKey(),
      emit: (event, payload) => EventBus.emit(event, payload),
    });
    if (import.meta.env.DEV) (window as unknown as { __battle: TypingMode }).__battle = this.battle; // 개발용 콘솔 접근
    this.hud = new HudController({
      stageIndex: st.index,
      stageName: st.name,
      playerName: profileDisplayName(save.profile, getLanguage()),
      level: SaveSystem.level(),
      portrait: portraitUrl(ch.sheet),
      petName: pet.name,
      petPortrait: portraitUrl(pet.sheet),
      petSkill: `${this.isSentenceMode() ? this.copy.sentenceStreak : this.copy.wordStreak} · ${this.petHelp(pet.active)}`,
      petActive: pet.active,
      countLabel: st.mode === 'wave' ? this.copy.monsters : st.mode === 'race' ? this.copy.distance : this.isSentenceMode() ? this.copy.sentences : st.mode === 'boss' ? this.copy.phase : this.copy.words,
      progressKind: st.mode === 'race' ? 'distance' : st.mode === 'boss' ? 'phase' : 'targets',
      telegram: st.mode === 'telegram',
      timeLabel: st.mode === 'letter' || st.mode === 'daily' ? this.copy.elapsed : st.mode === 'telegram' ? this.copy.collision : undefined,
      hideEnemy: st.mode === 'letter' || st.mode === 'telegram' || st.mode === 'daily' || st.mode === 'race',
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
      placeholder: this.copy.inputPlaceholder,
      'aria-label': this.copy.inputLabel,
      'aria-description': this.copy.inputDescription,
      lang: getLanguage(),
    }) as HTMLInputElement;

    this.kbdToggle = h('button', { class: 'btn btn-sm btn-gray bb-kbd-toggle', onclick: () => this.setKbdVisible(!SaveSystem.get().settings.showKeyboardGuide) }, save.settings.showKeyboardGuide ? this.copy.hideGuide : this.copy.showGuide);

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
          this.copy.goal,
          h('span', { class: 'bb-target-desc' }, st.mode === 'wave' ? this.copy.waveHelp : st.mode === 'race' ? this.copy.raceHelp : st.mode === 'letter' ? this.copy.letterHelp : st.mode === 'telegram' ? this.copy.telegramHelp : st.mode === 'boss' ? this.copy.bossHelp : st.mode === 'daily' ? data.dailyKind === 'sentence' ? this.copy.dailySentenceHelp : data.dailyKind === 'long' ? this.copy.dailyLongHelp : this.copy.dailyWordHelp : st.index <= 2 ? this.copy.wordHelp : this.copy.sentenceHelp),
          this.kbdToggle,
        ),
        h('div', { class: 'bb-target-row' }, this.hud.targetEl, this.hud.variantEl),
        this.hud.hintEl,
        h('div', { class: 'bb-input-wrap' }, this.inputEl, h('span', { class: 'bb-input-hint' }, icon('key_enter')), this.hud.skipBtn),
      ),
    );

    const feverOverlay = h('div', { class: 'fever-overlay' });
    this.feedback = new BattleFeedback(this.el, this.bottom);
    // 좌측은 한 열로 쌓는다(플레이어 → 모드 패널). 보스전만 적 HP도 이 열에 들어간다.
    const isBoss = st.mode === 'boss';
    const leftCol = h('div', { class: 'battle-left-col' }, this.hud.left, isBoss ? this.hud.enemyPanel : null, this.hud.track, this.hud.tele);
    this.el.append(feverOverlay, this.hud.top, leftCol);
    if (!isBoss) this.el.append(this.hud.enemyPanel);
    this.el.append(this.hud.combo, this.bottom, this.kbd.el);
    this.el.classList.add(`mode-${st.mode}`);

    this.typing = new TypingSystem(this.inputEl, {
      onChange: (value, composing) => this.onInputChange(value, composing),
      onSubmit: (value, meta) => this.battle?.submit(value, meta.usedBackspace),
      onSkip: () => this.doSkip(),
      onPause: () => { void this.pauseMenu(); },
      onMove: (dir, pressed) => this.battle?.move?.(dir, pressed),
    });
    this.typing.setEnabled(false);
    this.hud.skipBtn.addEventListener('click', () => { this.doSkip(); this.typing?.focus(); });

    this.bind(Events.TARGET_CHANGED, (s: BattleSnapshot) => this.onTarget(s));
    this.bind(Events.HUD_TICK, (s: BattleSnapshot) => this.hud?.update(s));
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; corrected?: boolean; combo: number; snapshot: BattleSnapshot }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { snapshot: BattleSnapshot; forgiven: boolean; shielded: boolean }) => this.onWrong(d));
    this.bind(Events.STAGE_CLEAR, (s: BattleSnapshot) => this.finish(true, s));
    this.bind(Events.STAGE_FAILED, (d: { reason: 'time' | 'hp'; snapshot: BattleSnapshot }) => this.finish(false, d.snapshot, d.reason));
    this.bind(Events.SETTINGS_CHANGED, (s: { showKeyboardGuide: boolean; bgm: boolean; sfx: boolean }) => {
      this.kbd?.setVisible(s.showKeyboardGuide);
      if (this.kbdToggle) this.kbdToggle.textContent = s.showKeyboardGuide ? this.copy.hideGuide : this.copy.showGuide;
      if (this.hud) refreshSoundIcon(this.hud.soundEl);
    });
    this.bind(Events.SYLLABLE_MISS, (d: { index: number }) => this.hud?.shakeChar(d.index));
    this.bind(Events.IDLE_DRAIN, (d: { hpLoss: number; idle: number }) => { this.feedback?.flash('wrong'); if (Math.floor(d.idle) % 2 === 0) this.feedback?.judge(this.copy.idleDrain(d.hpLoss), 'miss'); });
    this.bind(Events.WAVE_GATE, () => this.feedback?.judge(this.copy.forestGate, 'fever'));
    this.bind(Events.RACE_TURBO, () => this.feedback?.judge(this.copy.turbo, 'fever'));
    this.bind(Events.BOSS_PHASE, (d: { phase: number }) => { if (d.phase === 2) this.feedback?.judge(this.copy.bossRush, 'fever'); if (d.phase === 3) this.feedback?.judge(this.copy.bossFinal, 'fever'); });
    this.bind(Events.BOSS_ARMOR, () => this.feedback?.judge(this.copy.armorBroken, 'fever'));
    this.bind(Events.BOSS_DARK, () => { this.feedback?.flash('wrong'); this.feedback?.judge(this.copy.darkness, 'miss'); });
    this.bind(Events.TELE_BRAKE, (d: { stage: number; total: number }) => this.feedback?.judge(this.copy.brake(d.stage, d.total), 'good'));
    this.bind(Events.TELE_STOP, () => this.feedback?.judge(this.copy.trainStopped, 'fever'));
    this.bind(Events.TELE_OUTAGE, (d: { on: boolean }) => { if (d.on) this.feedback?.flash('wrong'); this.el.classList.toggle('outage', d.on); });
    this.bind(Events.LETTER_LOCK, (d: { lock: number; total: number }) => this.feedback?.judge(this.copy.lockOpened(d.lock, d.total), 'fever'));
    this.bind(Events.LETTER_GLOW, () => this.feedback?.judge(this.copy.runeGlow, 'good'));
    this.bind(Events.LETTER_SECRET, (d: { coins: number }) => this.feedback?.judge(this.copy.secretRoom(d.coins), 'bonus'));
    this.bind(Events.LETTER_GATE, (d: { accuracyReward: boolean }) => { this.feedback?.judge(this.copy.goldenGate, 'fever'); if (d.accuracyReward) this.feedback?.later(() => this.feedback?.judge(this.copy.accuracyReward, 'bonus'), 900); });
    this.bind(Events.RACE_CAUGHT, (d: { catches: number; max: number }) => { this.feedback?.flash('wrong'); this.feedback?.judge(this.copy.caught(d.catches, d.max), 'miss'); });
    this.bind(Events.RACE_FINISH, (d: { beatGhost: boolean }) => this.feedback?.judge(d.beatGhost ? this.copy.beatGhost : this.copy.raceFinished, 'fever'));
    this.bind(Events.WAVE_TOUCH, (d: { hpLoss: number }) => { if (d.hpLoss > 0) this.feedback?.flash('wrong'); });
    this.bind(Events.FEVER_CHANGED, (d: { level: FeverLevel }) => this.onFever(d.level));
    this.bind(Events.PET_ACTIVE, (d: { active: PetActive; pet: { name: string } }) => this.feedback?.judge(this.copy.petActive(t(d.pet.name), this.petHelp(d.active)), 'pet'));
    this.bind(Events.PET_PASSIVE, (d: { pet: { name: string; passiveDesc: string } }) => this.feedback?.judge(this.copy.petPassive(t(d.pet.name), t(d.pet.passiveDesc)), 'pet'));
    this.bind(Events.BOMB_EXPLODE, () => { this.feedback?.flash('wrong'); this.feedback?.judge(this.copy.bomb, 'miss'); AudioManager.sfx('bomb'); });
    this.bind(Events.VARIANT_BONUS, (d: { variant: WordVariant; coins?: number; hp?: number }) => {
      AudioManager.sfx('coin');
      this.feedback?.judge(d.variant === 'treasure' ? this.copy.treasure(d.coins) : this.copy.hpBonus(d.hp), 'bonus');
    });

    this.hud.update(this.battle.snapshot());
    document.addEventListener('visibilitychange', this.visibilityHandler);
    document.addEventListener('keydown', this.shortcutHandler);
    const modalRoot = document.getElementById('modal-root');
    if (modalRoot) {
      this.modalObserver = new MutationObserver(() => {
        if (!this.battle || this.battle.finished || this.pauseDialogOpen) return;
        if (modalRoot.childElementCount > 0 && !this.paused) {
          this.suspendBattle();
          this.pausedByOverlay = true;
        } else if (modalRoot.childElementCount === 0 && this.pausedByOverlay) {
          this.pausedByOverlay = false;
          void this.pauseMenu();
        }
      });
      this.modalObserver.observe(modalRoot, { childList: true });
    }
    this.countdown();
  }

  private isSentenceMode() {
    return this.battle?.stage.mode === 'letter' || this.battle?.stage.mode === 'telegram' || (this.battle instanceof DailySystem && this.battle.kind !== 'word');
  }

  private petHelp(active: PetActive): string {
    const mode = this.battle?.stage.mode;
    const untimed = mode === 'letter' || mode === 'daily';
    if (active === 'shield') return this.copy.shieldHelp;
    if (active === 'time_plus') return untimed ? this.copy.recoveryHelp : this.copy.timeHelp;
    if (active === 'fire_aoe') return untimed || mode === 'telegram' ? this.copy.previewHelp : this.copy.fireHelp;
    return this.copy.previewHelp;
  }

  private bind<T>(ev: string, fn: (d: T) => void) {
    EventBus.on(ev, fn);
    this.handlers.push([ev, fn as (...a: never[]) => void]);
  }

  /** 3, 2, 1, GO! 카운트다운 후 전투 시작 */
  private countdown() {
    const lifetime = this.lifetime;
    const wrap = h('div', { class: 'countdown' });
    this.el.append(wrap);
    const steps = ['3', '2', '1', 'GO!'];
    let i = 0;
    const next = () => {
      if (!this.battle || this.started || lifetime !== this.lifetime) return;
      wrap.replaceChildren(h('div', { class: `cd ${steps[i] === 'GO!' ? 'go' : ''}` }, steps[i]));
      if (!document.hidden) AudioManager.sfx(steps[i] === 'GO!' ? 'go' : 'countdown');
      i++;
      if (i < steps.length) window.setTimeout(next, 650);
      else
        window.setTimeout(() => {
          if (lifetime !== this.lifetime) return;
          wrap.remove();
          this.start();
        }, 500);
    };
    window.setTimeout(next, 350);
  }

  private start() {
    if (!this.battle || this.started) return;
    if (document.hidden || this.paused) { void this.pauseMenu(); return; }
    this.started = true;
    this.el.querySelector('.countdown')?.remove();
    this.battle.start();
    this.typing?.setEnabled(true);
    this.lastTick = performance.now();
    this.tickTimer = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - this.lastTick) / 1000;
      this.lastTick = now;
      if (!this.paused && !document.hidden) this.battle?.tick(dt);
    }, 100);
  }

  private onTarget(s: BattleSnapshot) {
    this.currentTarget = s.target;
    this.hud?.update(s);
    if (s.boss) {
      const help = this.el.querySelector<HTMLElement>('.bb-target-desc');
      if (help) {
        help.dataset.noTranslate = 'true';
        const b = s.boss;
        const roles = { armor: this.copy.armorRole, core: this.copy.coreRole, finale: this.copy.finaleRole };
        help.textContent = b.phase === 1
          ? this.copy.crystalHelp
          : b.phase === 2
            ? this.copy.rushHelp
            : `${b.finalStep}/${b.finalTotal} · ${roles[b.finalRole ?? 'armor']} · ${this.copy.finalHelp}`;
      }
    }
    if (s.target) {
      if (this.inputEl) this.inputEl.placeholder = this.copy.inputPlaceholder;
      this.inputEl?.classList.toggle('long', [...s.target.text].length > 8);
      this.typing?.setTarget(s.target.text, s.target.type);
      this.hud?.renderTarget(s.target.text, '');
      this.kbd?.update(s.target.text, '');
      this.typing?.setEnabled(this.started && !this.paused);
      this.typing?.focus();
    } else {
      this.typing?.setEnabled(false);
      this.hud?.renderTarget('', '');
      this.kbd?.update('', '');
      if (this.inputEl) this.inputEl.placeholder = this.copy.waitingTarget;
    }
  }

  /** 점프: 어려운 낱말 건너뛰기 (판마다 3번) */
  private doSkip() {
    if (!this.battle || this.paused) return;
    const left = this.battle.run.skipsLeft;
    if (left <= 0) {
      this.feedback?.judge(this.copy.noSkips, 'miss');
      AudioManager.sfx('miss');
      return;
    }
    if (this.battle.skip()) {
      AudioManager.sfx('go', { rate: 1.4 });
      this.feedback?.judge(this.copy.skipsLeft(left - 1), 'good');
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

  private onCorrect(d: { perfect: boolean; corrected?: boolean; combo: number; snapshot: BattleSnapshot }) {
    this.feedback?.flash('right');
    this.feedback?.judge(d.corrected ? this.copy.corrected : d.perfect ? this.copy.perfect : this.copy.completed, d.perfect || d.corrected ? 'perfect' : 'good');
    this.hud?.update(d.snapshot);
  }

  private onWrong(d: { snapshot: BattleSnapshot; forgiven: boolean; shielded: boolean }) {
    this.feedback?.flash('wrong');
    this.feedback?.judge(d.forgiven || d.shielded ? this.copy.protected : this.copy.retry, d.forgiven || d.shielded ? 'good' : 'miss');
    this.hud?.update(d.snapshot);
    this.inputEl?.classList.remove('bad');
  }

  /** FEVER 단계 변화: 배경 밝아짐 + BGM 템포업 + 판정 문구 */
  private onFever(level: FeverLevel) {
    this.el.classList.toggle('fever', level >= 2);
    this.el.classList.toggle('power', level === 1);
    AudioManager.setRate(level >= 2 ? 1.15 : 1);
    // FEVER 진입은 화면 전체가 같이 바뀌는 순간이라 대기시키지 않고 바로 띄운다
    if (level === 1) this.feedback?.judge(this.copy.power, 'perfect');
    if (level === 2) { this.feedback?.judgeNow(this.copy.fever, 'fever big'); AudioManager.sfx('fever'); }
    if (level === 3) { this.feedback?.judgeNow(this.copy.finalFever, 'fever big'); AudioManager.sfx('fever'); }
  }

  private suspendBattle() {
    this.paused = true;
    this.battle?.pause();
    this.typing?.setEnabled(false);
    AudioManager.setRate(1);
  }

  private resumeBattle() {
    if (!this.battle || this.battle.finished) return;
    if (document.hidden) { void this.pauseMenu(); return; }
    this.paused = false;
    this.lastTick = performance.now();
    if (!this.started) this.start();
    else {
      this.battle.resume();
      this.typing?.setEnabled(this.battle.run.current != null);
      AudioManager.setRate(this.battle.run.feverLevel >= 2 ? 1.15 : 1);
    }
  }

  /** 화면 복귀만으로 시작하지 않는다. 계속하기·Escape 등 명시적인 사용자 동작으로 재개한다. */
  private async pauseMenu(message = this.copy.pauseBody) {
    if (!this.battle || this.battle.finished || this.pauseDialogOpen || this.pausedByOverlay) return;
    const lifetime = this.lifetime;
    this.suspendBattle();
    this.pauseDialogOpen = true;
    await alertModal(this.copy.pauseTitle, message, this.copy.continue);
    if (lifetime !== this.lifetime) return;
    this.pauseDialogOpen = false;
    this.resumeBattle();
  }

  /** 전투 중 홈 버튼: 진행을 멈춘 후 이동을 확인한다. */
  private async homeMenu() {
    if (!this.battle || this.battle.finished || this.paused) return;
    const lifetime = this.lifetime;
    this.suspendBattle();
    this.pauseDialogOpen = true;
    const leave = await confirmModal(this.copy.leaveTitle, this.copy.leaveBody, this.copy.leave, this.copy.continue);
    if (lifetime !== this.lifetime) return;
    this.pauseDialogOpen = false;
    if (leave) {
      void navigate('home');
    } else {
      this.resumeBattle();
    }
  }

  /** 키보드 가이드 켜기/끄기: 화면 중앙 오버레이 토글 + 설정 저장 */
  private setKbdVisible(v: boolean) {
    SaveSystem.setSettings({ showKeyboardGuide: v });
    this.kbd?.setVisible(v);
    if (this.kbdToggle) this.kbdToggle.textContent = v ? this.copy.hideGuide : this.copy.showGuide;
    if (v) this.inputEl?.blur();
    else this.typing?.focus();
  }

  private finish(cleared: boolean, s: BattleSnapshot, reason?: 'time' | 'hp') {
    if (!this.battle) return;
    // 클리어 연출(씬의 STAGE CLEAR)이 대기 중인 팝업에 가리지 않게 큐를 비운다
    this.feedback?.clearJudgments();
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
        learningAttempts: this.battle.run.learningAttempts.map((attempt) => ({ ...attempt })),
        attemptedCount: this.battle.run.stats.submissions,
        skippedCount: this.battle.run.skippedCount,
        correctedCount: this.battle.run.correctedCount,
        remix: this.remix,
        ghost: this.battle instanceof RaceSystem && cleared ? this.battle.ghostRecord() : undefined,
        beatGhost: this.battle instanceof RaceSystem ? this.battle.beatGhost : undefined,
        wordsSeen: this.battle.wordsSeen(),
      },
      st,
    );
    if (cleared) {
      this.feedback?.judge(this.copy.stageClear, 'fever big');
    } else {
      this.feedback?.judge(st.mode === 'telegram' ? this.copy.trainFailed : reason === 'time' ? this.copy.timeUp(fmt.time(0)) : this.copy.hpEmpty, 'miss');
    }
    const lifetime = this.lifetime;
    window.setTimeout(() => { if (lifetime === this.lifetime) void navigate('result', { result }); }, cleared ? (st.mode === 'boss' ? 4200 : 2200) : 1600);
  }

  protected onHide() {
    this.lifetime++;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    document.removeEventListener('keydown', this.shortcutHandler);
    this.modalObserver?.disconnect();
    this.modalObserver = undefined;
    window.clearInterval(this.tickTimer);
    this.feedback?.dispose();
    this.feedback = undefined;
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
