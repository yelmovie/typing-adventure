import { Screen } from '../Screen';
import { h, fmt, icon } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate } from '../../Game';
import { getStage } from '../../data/stages';
import { getCharacter, getPet, portraitUrl, profileDisplayName } from '../../data/characters';
import type { StageId, ContentUnit, GemInventory, GemKind, WaveItemInventory, WaveItemKind } from '../../types';
import type { BattleSnapshot, TypingMode } from '../../systems/BattleState';
import { RaceSystem } from '../../systems/RaceSystem';
import { GEM_FREEZE_SECONDS, WAVE_ITEM_ORDER, WaveSystem, type WaveInventoryKind } from '../../systems/WaveSystem';
import { DailySystem, todayKey, type DailyKind } from '../../systems/DailySystem';
import { allContent } from '../../data/content';
import { currentTitle } from '../../data/titles';
import { getEnemy } from '../../data/enemies';
import { getContentForStage, getRemixPick } from '../../data/content';
import { remixStoryIndexOf } from '../../data/remixStories';
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
import { applyDarkModifier, darkDifficulty, recordDarkClear } from '../../data/darkMode';
import { type SpeedrunRun, startSpeedrun, nextStage as speedrunStep, stageNumber, totalSec, isComplete, finishSpeedrun, formatSpeedrunTime, readSpeedrunRun, SPEEDRUN_STAGES } from '../../systems/SpeedrunSystem';
import { journeyFor } from '../../data/worldJourney';

const copyText = (ko: string, en: string) => getLanguage() === 'en' ? en : ko;

/** 전투 진입 옵션. speedrun 은 5지역 연속 타임어택(진행은 speedrunRun 으로 다음 지역에 넘긴다), dark 는 어둠 모드(뉴게임+). */
export interface BattleData { stageId: StageId; dailyKind?: DailyKind; remix?: boolean; resume?: boolean; speedrun?: boolean; dark?: boolean; speedrunRun?: SpeedrunRun }


/** 전투 화면 DOM: HUD + 실제 한글 입력창 + 키보드 가이드. 여섯 모드의 타이핑 로직을 연결한다. */
export class BattleScreen extends Screen<BattleData> {
  private battle?: TypingMode;
  private dailyKind: DailyKind = 'word';
  private checkpointTimer = 0;
  private typing?: TypingSystem;
  private hud?: HudController;
  private kbd?: KeyboardGuide;
  private kbdToggle?: HTMLElement;
  private bottom?: HTMLElement;
  private inputEl?: HTMLInputElement;
  private gemBar?: HTMLElement;
  private waveCoinValue?: HTMLElement;
  private waveScoreValue?: HTMLElement;
  private selectedItem: WaveInventoryKind = 'heart';
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
  /** 어둠 모드 판(시간 ×0.7·속도 ×1.3, 별은 progress.darkStars) */
  private dark = false;
  /** 스피드런 진행: 이 판이 스피드런의 한 지역이면 채워진다 */
  private speedrun?: SpeedrunRun;
  private interstitialTimer = 0;
  private finishTimer = 0;
  private finishSkipTimer = 0;
  private remixStory?: number;
  private visibilityHandler = () => {
    if (document.hidden) void this.pauseMenu(this.copy.pauseHidden);
  };
  private shortcutHandler = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key === 'F1' && this.battle instanceof WaveSystem) {
      event.preventDefault();
      if (!event.isComposing && !event.repeat && !this.paused && this.started) this.useSelectedItem();
      return;
    }
    const guideOpen = !!this.kbd?.el.classList.contains('show');
    if (event.key === 'Escape') {
      if (event.isComposing) return;
      event.preventDefault();
      if (guideOpen) this.setKbdVisible(false);
      else void this.pauseMenu();
      return;
    }
    // 자판 가이드는 "보고 나서 치기" 용이다. 첫 글자를 치면 바로 걷혀 전투가 이어진다(설정은 그대로 두어 다음 판에도 먼저 보여 준다).
    if (guideOpen && (event.key.length === 1 || ['Process', 'Backspace', 'Enter', 'Unidentified'].includes(event.key))) this.hideKbdForNow();
  };

  constructor() {
    super('battle');
  }

  protected render(data: BattleData) {
    this.lifetime++;
    const base = getStage(data.stageId);
    const save = SaveSystem.get();
    const ch = getCharacter(save.profile.characterId);
    const pet = getPet(save.profile.petId);
    this.paused = false;
    this.started = false;
    this.pauseDialogOpen = false;
    this.pausedByOverlay = false;
    this.remix = data.remix === true;
    this.dailyKind = data.dailyKind ?? 'word';
    // 중간 저장은 같은 스테이지·같은 언어·같은 종류일 때만 이어간다. 새로 시작하는 판은 이전 저장을 지운다(?go=battle 개발 경로도 기본은 새 시작).
    const checkpoint = data.resume ? SaveSystem.checkpoint() : undefined;
    const resuming = !!checkpoint && checkpoint.stageId === base.id && checkpoint.language === getLanguage() && (checkpoint.remix === true) === this.remix
      && (base.id !== 'daily' || checkpoint.dailyKind === this.dailyKind);
    if (!resuming) SaveSystem.clearCheckpoint();
    // 어둠 모드·스피드런: 이어가는 판은 중간 저장의 표시를 따르고(홈 「이어서 하기」는 이 플래그를 모른다), 새 판은 호출한 쪽의 옵션을 따른다.
    this.dark = base.id !== 'daily' && (resuming && checkpoint ? checkpoint.dark === true : data.dark === true);
    this.speedrun = base.id === 'daily' ? undefined
      : resuming && checkpoint ? (checkpoint.speedrun ? { ...checkpoint.speedrun, stageSec: [...checkpoint.speedrun.stageSec] } : undefined)
        : data.speedrun === true ? readSpeedrunRun(data.speedrunRun) ?? startSpeedrun() : undefined;
    // 어둠 모드는 StageDef 를 한 곳(darkMode.ts)에서 바꾼 사본으로 전투·별 계산을 한다.
    const st = this.dark ? applyDarkModifier(base) : base;
    const remixPick = data.remix ? getRemixPick(st.id, save.progress.storiesDone?.[st.id] ?? []) : undefined;
    const stagePool = remixPick?.units ?? getContentForStage(st.id);
    this.remixStory = remixPick?.storyIndex;
    // 도움 모드: 그 스테이지만 기초 난이도 규칙(시간 +35%, 적 느리게)
    const difficulty = this.dark ? darkDifficulty(save.profile.difficulty) : save.progress.assist?.[st.id] ? 'beginner' : save.profile.difficulty;

    const build = () => createBattleMode({
      stage: st, difficulty, pet, stagePool,
      allPool: st.mode === 'daily' ? allContent() : [],
      language: getLanguage(),
      ghost: save.records.ghosts?.[st.id] ?? null,
      enemySheet: st.mode === 'race' || st.mode === 'boss' ? getEnemy(st.enemies[0]).sheet : '',
      dailyKind: data.dailyKind, dailyKey: todayKey(),
      emit: (event, payload) => EventBus.emit(event, payload),
    });
    this.battle = build();
    if (this.battle instanceof WaveSystem) {
      this.battle.loadGemInventory(save.progress.gems);
      this.battle.loadItemInventory(save.progress.items);
    }
    if (resuming && checkpoint) {
      try { this.battle.restore?.(checkpoint.state); }
      catch {
        this.battle = build();
        if (this.battle instanceof WaveSystem) {
          this.battle.loadGemInventory(save.progress.gems);
          this.battle.loadItemInventory(save.progress.items);
        }
        SaveSystem.clearCheckpoint();
      } // 손상된 저장은 버리고 새로 시작한다
    }
    if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __battle: this.battle, __speedrun: this.speedrun ?? null, __dark: this.dark }); // 개발용 콘솔 접근
    this.hud = new HudController({
      stageIndex: st.index,
      stageName: `${st.name}${this.modeSuffix()}`,
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
      hideEnemy: st.mode === 'wave' || st.mode === 'letter' || st.mode === 'telegram' || st.mode === 'daily' || st.mode === 'race',
      race: st.mode === 'race',
      bestCpm: save.records.bestCpm,
      title: currentTitle(save.progress.coins ?? 0).name,
      comboInTop: st.mode === 'wave', // 12시 방향 몬스터의 낱말이 중앙 콤보에 가려지지 않게 HUD 바 안에 둔다
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

    this.kbdToggle = h('button', { class: 'btn btn-sm btn-gray bb-kbd-toggle', onclick: () => this.setKbdVisible(!this.kbd?.el.classList.contains('show')) }, save.settings.showKeyboardGuide ? this.copy.hideGuide : this.copy.showGuide);
    this.waveCoinValue = undefined;
    this.waveScoreValue = undefined;
    this.gemBar = this.battle instanceof WaveSystem ? this.createGemBar(this.battle) : undefined;

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
        this.gemBar,
        h('div', { class: 'bb-input-wrap' }, this.inputEl, h('span', { class: 'bb-input-hint' }, icon('key_enter')), this.hud.skipBtn),
      ),
    );

    const feverOverlay = h('div', { class: 'fever-overlay' });
    const dangerVignette = h('div', { class: 'battle-danger-vignette', 'aria-hidden': 'true' });
    this.feedback = new BattleFeedback(this.el, this.bottom);
    // 좌측은 한 열로 쌓는다(플레이어 → 모드 패널). 보스전만 적 HP도 이 열에 들어간다.
    const isBoss = st.mode === 'boss';
    const leftCol = h('div', { class: 'battle-left-col' }, this.hud.left, isBoss ? this.hud.enemyPanel : null, this.hud.track, this.hud.tele);
    this.el.append(feverOverlay, dangerVignette, this.hud.top, leftCol);
    if (!isBoss) this.el.append(this.hud.enemyPanel);
    if (!this.hud.combo.parentElement) this.el.append(this.hud.combo); // wave 는 HudController 가 상단 HUD 바 안에 넣었다
    this.el.append(this.bottom, this.kbd.el);
    this.el.classList.add(`mode-${st.mode}`);

    this.typing = new TypingSystem(this.inputEl, {
      onChange: (value, composing) => this.onInputChange(value, composing),
      onSubmit: (value, meta) => this.battle?.submit(value, meta.usedBackspace),
      onSkip: () => this.doSkip(),
      // 입력창이 포커스를 쥔 채 Esc: 자판 가이드가 떠 있으면 먼저 걷고, 아니면 일시정지 메뉴.
      onPause: () => { if (this.kbd?.el.classList.contains('show')) this.setKbdVisible(false); else void this.pauseMenu(); },
      onMove: (dir, pressed) => this.battle?.move?.(dir, pressed),
    });
    this.typing.setEnabled(false);
    this.hud.skipBtn.addEventListener('click', () => { this.doSkip(); this.typing?.focus(); });

    this.bind(Events.TARGET_CHANGED, (s: BattleSnapshot) => this.onTarget(s));
    this.bind(Events.HUD_TICK, (s: BattleSnapshot) => this.updateHud(s));
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; corrected?: boolean; combo: number; snapshot: BattleSnapshot }) => { this.onCorrect(d); this.scheduleCheckpoint(); });
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
    this.bind(Events.BOSS_PET_GUARD, () => this.feedback?.judge(copyText('토끼 방어! 어둠 공격을 막았어요', 'Rabbit guard! The dark attack was blocked'), 'fever'));
    this.bind(Events.PET_RESCUE, () => {
      this.feedback?.flash('right');
      this.feedback?.judgeNow(copyText('친구가 대신 막았어요! HP 50% 회복', 'Your friend protected you! HP restored to 50%'), 'perfect big');
    });
    this.bind(Events.TELE_BRAKE, (d: { stage: number; total: number }) => this.feedback?.judge(this.copy.brake(d.stage, d.total), 'good'));
    this.bind(Events.TELE_AMBUSH_START, () => {
      this.el.classList.add('tele-bat-ambush');
      this.hud!.skipBtn.hidden = true;
      const help = this.el.querySelector<HTMLElement>('.bb-target-desc');
      if (help) help.textContent = copyText('박쥐 기습! 낱말을 제한 시간 안에 입력해', 'Bat ambush! Type each word before time runs out');
      this.feedback?.judgeNow(copyText('⚠ 박쥐 4마리 접근!', '⚠ 4 bats incoming!'), 'miss big');
      AudioManager.sfx('bomb', { rate: 1.35, gain: 0.6 });
    });
    this.bind(Events.TELE_BAT_HIT, (d: { index: number; total: number; bonus: number }) => {
      this.feedback?.flash('right');
      this.feedback?.judge(copyText(`박쥐 격퇴 ${d.index + 1}/${d.total} · +${d.bonus}점`, `Bat blocked ${d.index + 1}/${d.total} · +${d.bonus}`), 'perfect');
    });
    this.bind(Events.TELE_BAT_WRONG, () => {
      this.feedback?.flash('wrong');
      if (this.inputEl) this.feedback?.reject(this.inputEl);
      this.feedback?.judge(copyText('낱말이 달라! 다시 빠르게!', 'Wrong word! Try again, quickly!'), 'miss');
      AudioManager.sfx('miss');
    });
    this.bind(Events.TELE_BAT_MISSED, (d: { index: number; total: number; hpLoss: number }) => {
      this.feedback?.flash('wrong');
      this.feedback?.judge(copyText(`방어 실패 ${d.index + 1}/${d.total} · HP -${d.hpLoss}`, `Missed ${d.index + 1}/${d.total} · HP -${d.hpLoss}`), 'miss');
    });
    this.bind(Events.TELE_AMBUSH_END, (d: { hits: number; total: number }) => {
      this.el.classList.remove('tele-bat-ambush');
      this.hud!.skipBtn.hidden = false;
      const help = this.el.querySelector<HTMLElement>('.bb-target-desc');
      if (help) help.textContent = this.copy.telegramHelp;
      this.feedback?.judge(copyText(`기습 종료 · ${d.hits}/${d.total}마리 방어! 전보 재개`, `Ambush over · ${d.hits}/${d.total} blocked! Resume the telegram`), d.hits === d.total ? 'fever' : 'good');
    });
    this.bind(Events.TELE_STOP, () => this.feedback?.judge(this.copy.trainStopped, 'fever'));
    this.bind(Events.TELE_OUTAGE, (d: { on: boolean }) => { if (d.on) this.feedback?.flash('wrong'); this.el.classList.toggle('outage', d.on); });
    this.bind(Events.LETTER_LOCK, (d: { lock: number; total: number; restored?: boolean }) => { if (!d.restored) this.feedback?.judge(this.copy.lockOpened(d.lock, d.total), 'fever'); });
    this.bind(Events.LETTER_GLOW, () => this.feedback?.judge(this.copy.runeGlow, 'good'));
    this.bind(Events.LETTER_SECRET, (d: { coins: number }) => {
      this.feedback?.judge(this.copy.secretRoom(d.coins), 'bonus');
      if (this.hud) this.feedback?.reward('coin', d.coins, this.hud.rewardTarget('coin'));
    });
    this.bind(Events.LETTER_GATE, (d: { accuracyReward: boolean }) => { this.feedback?.judge(this.copy.goldenGate, 'fever'); if (d.accuracyReward) this.feedback?.later(() => this.feedback?.judge(this.copy.accuracyReward, 'bonus'), 900); });
    this.bind(Events.RACE_CAUGHT, (d: { catches: number; max: number }) => { this.feedback?.flash('wrong'); this.feedback?.judge(this.copy.caught(d.catches, d.max), 'miss'); });
    this.bind(Events.RACE_FINISH, (d: { beatGhost: boolean }) => this.feedback?.judge(d.beatGhost ? this.copy.beatGhost : this.copy.raceFinished, 'fever'));
    this.bind(Events.WAVE_TOUCH, (d: { hpLoss: number }) => { if (d.hpLoss > 0) this.feedback?.flash('wrong'); });
    this.bind(Events.WAVE_BOSS_HIT, (d: { remaining: number; total: number }) => {
      this.feedback?.judge(copyText(`대왕 슬라임 · 남은 타격 ${d.remaining}/${d.total}`, `King Slime · ${d.remaining}/${d.total} hits left`), 'fever');
    });
    this.bind(Events.ITEM_DROP, (d: { coins?: number }) => {
      if ((d.coins ?? 0) > 0 && this.waveCoinValue) {
        this.feedback?.judge(copyText(`동전 +${d.coins} · 결과에 저장돼요`, `Coins +${d.coins} · saved in results`), 'bonus');
        this.feedback?.reward('coin', d.coins!, this.waveCoinValue);
      }
      this.refreshGemBar();
    });
    this.bind(Events.GEM_COLLECTED, (d: { kind: GemKind; seconds: number; inventory: GemInventory }) => {
      this.persistGems(d.inventory);
      this.feedback?.judge(copyText(`${this.gemName(d.kind)} 획득 · 적 ${d.seconds}초 정지`, `${this.gemName(d.kind)} gained · freezes for ${d.seconds}s`), 'bonus');
    });
    this.bind(Events.GEM_USED, (d: { kind: GemKind; seconds: number; inventory: GemInventory }) => {
      this.persistGems(d.inventory);
      this.scheduleCheckpoint();
      this.feedback?.judge(copyText(`${this.gemName(d.kind)} 사용 · ${d.seconds}초 정지!`, `${this.gemName(d.kind)} used · frozen for ${d.seconds}s!`), 'fever');
    });
    this.bind(Events.ITEM_COLLECTED, (d: { item: WaveItemKind; inventory: WaveItemInventory }) => {
      this.persistItems(d.inventory);
      this.feedback?.judge(copyText(`${this.itemName(d.item)} 획득 · 인벤토리에 보관`, `${this.itemName(d.item)} collected · stored in inventory`), 'bonus');
    });
    this.bind(Events.ITEM_USED, (d: { item: WaveItemKind; inventory: WaveItemInventory }) => {
      this.persistItems(d.inventory);
      this.scheduleCheckpoint();
      this.feedback?.judge(this.itemUsedCopy(d.item), d.item === 'star' ? 'bonus' : 'good');
    });
    this.bind(Events.HP_HEAL, (d: { amount: number }) => {
      if (d.amount > 0 && this.hud) this.feedback?.reward('heart', d.amount, this.hud.rewardTarget('heart'));
    });
    this.bind(Events.FEVER_CHANGED, (d: { level: FeverLevel }) => this.onFever(d.level));
    this.bind(Events.PET_ACTIVE, (d: { active: PetActive; pet: { name: string } }) => this.feedback?.judge(this.copy.petActive(t(d.pet.name), this.petHelp(d.active)), 'pet'));
    this.bind(Events.PET_PASSIVE, (d: { pet: { name: string; passiveDesc: string } }) => this.feedback?.judge(this.copy.petPassive(t(d.pet.name), t(d.pet.passiveDesc)), 'pet'));
    this.bind(Events.BOMB_EXPLODE, () => { this.feedback?.flash('wrong'); this.feedback?.judge(this.copy.bomb, 'miss'); AudioManager.sfx('bomb'); });
    this.bind(Events.VARIANT_BONUS, (d: { variant: WordVariant; coins?: number; hp?: number }) => {
      AudioManager.sfx('coin');
      this.feedback?.judge(d.variant === 'treasure' ? this.copy.treasure(d.coins) : this.copy.hpBonus(d.hp), 'bonus');
      const amount = d.variant === 'treasure' ? d.coins ?? 0 : d.hp ?? 0;
      const kind = d.variant === 'treasure' ? 'coin' : 'heart';
      if (amount > 0 && this.hud) this.feedback?.reward(kind, amount, this.hud.rewardTarget(kind));
    });

    this.updateHud(this.battle.snapshot());
    this.hud.setSkips(this.battle.run.skipsLeft);
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
    // 목표가 없이 시작하는 판(복원한 보스 러시 큐 대기)은 목표가 생길 때 TARGET_CHANGED 가 입력을 연다.
    this.typing?.setEnabled(this.battle.run.current != null);
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
    this.updateHud(s);
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
      if (this.hud) this.feedback?.reject(this.hud.skipBtn);
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
    if (this.battle instanceof WaveSystem && value.trim()) {
      const selected = this.battle.selectByInput(value);
      if (selected && selected !== this.currentTarget) {
        this.currentTarget = selected;
        this.typing?.retarget(selected.text, 'word');
      }
    }
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
    this.updateHud(d.snapshot);
  }

  private onWrong(d: { snapshot: BattleSnapshot; forgiven: boolean; shielded: boolean }) {
    this.feedback?.flash('wrong');
    this.feedback?.judge(d.forgiven || d.shielded ? this.copy.protected : this.copy.retry, d.forgiven || d.shielded ? 'good' : 'miss');
    this.updateHud(d.snapshot);
    this.inputEl?.classList.remove('bad');
  }

  private updateHud(snapshot: BattleSnapshot) {
    this.hud?.update(snapshot);
    this.refreshGemBar(snapshot);
    const hpPct = snapshot.playerHp / Math.max(1, snapshot.playerMaxHp);
    this.el.classList.toggle('low-health', hpPct <= 0.3 && !this.battle?.finished);
  }

  private createGemBar(wave: WaveSystem) {
    this.waveCoinValue = h('strong', { class: 'wave-coin-value' }, '0');
    this.waveScoreValue = h('strong', { class: 'wave-score-value' }, '0');
    const en = getLanguage() === 'en';
    const slots = h('div', { class: 'wave-item-bank', role: 'group', 'aria-label': en ? 'Collected items' : '모은 아이템' },
      h('b', { class: 'wave-inventory-title' }, en ? 'ITEMS' : '아이템'),
      WAVE_ITEM_ORDER.map(kind => h('button', {
        type: 'button', class: `wave-item-slot ${kind}`, 'data-item': kind, 'aria-pressed': 'false',
        title: this.itemEffect(kind),
        onclick: () => { this.selectedItem = kind; this.refreshGemBar(); this.typing?.focus(); },
      }, kind === 'green' || kind === 'blue' || kind === 'violet'
        ? h('span', { class: 'wave-gem-stone', 'aria-hidden': 'true' }, '◆')
        : h('img', { src: `./assets/ui/drop_${kind}.webp`, alt: '', draggable: 'false' }),
      h('strong', { 'data-item-count': kind }, `×${wave.inventoryCount(kind)}`))));
    return h('div', { class: 'wave-inventory', 'aria-label': en ? 'Item inventory' : '아이템 인벤토리' },
      slots,
      h('button', { type: 'button', class: 'wave-use-item btn btn-sm btn-gold', onclick: () => this.useSelectedItem() }, h('kbd', {}, 'F1'), en ? ' Use' : ' 사용'),
      h('span', { class: 'wave-freeze', 'aria-live': 'polite' }),
      h('div', { class: 'wave-economy' },
        h('span', { class: 'wave-score' }, icon('trophy'), en ? ' Score ' : ' 점수 ', this.waveScoreValue),
        h('span', { class: 'wave-coin' }, icon('coin'), en ? ' Coins ' : ' 동전 ', this.waveCoinValue)));
  }

  private gemName(kind: GemKind) {
    const names = getLanguage() === 'en'
      ? { green: 'Green', blue: 'Blue', violet: 'Violet' }
      : { green: '초록', blue: '파랑', violet: '보라' };
    return names[kind];
  }

  private persistGems(inventory: GemInventory) {
    SaveSystem.get().progress.gems = { ...inventory };
    SaveSystem.save();
    this.refreshGemBar();
  }

  private persistItems(inventory: WaveItemInventory) {
    SaveSystem.get().progress.items = { ...inventory };
    SaveSystem.save();
    this.refreshGemBar();
  }

  private useSelectedItem() {
    if (!(this.battle instanceof WaveSystem) || !this.gemBar) return;
    const button = this.gemBar.querySelector<HTMLElement>(`[data-item="${this.selectedItem}"]`);
    if (!this.battle.useItem(this.selectedItem)) {
      if (button) this.feedback?.reject(button);
      this.feedback?.judge(copyText('지금은 이 아이템을 쓸 수 없어', 'This item cannot be used right now'), 'miss');
    }
    this.refreshGemBar();
    this.typing?.focus();
  }

  private itemName(kind: WaveInventoryKind) {
    const ko: Record<WaveInventoryKind, string> = { heart: '하트', star: '별', shield: '방패', bolt: '번개', green: '초록 보석', blue: '파랑 보석', violet: '보라 보석' };
    const en: Record<WaveInventoryKind, string> = { heart: 'Heart', star: 'Star', shield: 'Shield', bolt: 'Lightning', green: 'Green gem', blue: 'Blue gem', violet: 'Violet gem' };
    return (getLanguage() === 'en' ? en : ko)[kind];
  }

  private itemEffect(kind: WaveInventoryKind) {
    if (kind === 'green' || kind === 'blue' || kind === 'violet') return copyText(`${this.itemName(kind)} · 적 ${GEM_FREEZE_SECONDS[kind]}초 정지`, `${this.itemName(kind)} · freeze ${GEM_FREEZE_SECONDS[kind]}s`);
    const ko: Record<WaveItemKind, string> = { heart: '하트 · 체력 20 회복', star: '별 · 점수 150점', shield: '방패 · 다음 접촉 1회 방어', bolt: '번개 · 적 3초 감속' };
    const en: Record<WaveItemKind, string> = { heart: 'Heart · restore 20 HP', star: 'Star · add 150 score', shield: 'Shield · block one hit', bolt: 'Lightning · slow enemies for 3s' };
    return (getLanguage() === 'en' ? en : ko)[kind];
  }

  private itemUsedCopy(kind: WaveItemKind) {
    const ko: Record<WaveItemKind, string> = { heart: '하트 사용 · 체력 +20', star: '별 사용 · 점수 +150', shield: '방패 사용 · 다음 공격 방어!', bolt: '번개 사용 · 적 3초 감속!' };
    const en: Record<WaveItemKind, string> = { heart: 'Heart used · HP +20', star: 'Star used · score +150', shield: 'Shield used · next hit blocked!', bolt: 'Lightning used · enemies slowed for 3s!' };
    return (getLanguage() === 'en' ? en : ko)[kind];
  }

  private refreshGemBar(snapshot?: BattleSnapshot) {
    if (!(this.battle instanceof WaveSystem) || !this.gemBar) return;
    const wave = this.battle;
    if (wave.inventoryCount(this.selectedItem) <= 0) {
      this.selectedItem = WAVE_ITEM_ORDER.find(kind => wave.inventoryCount(kind) > 0) ?? this.selectedItem;
    }
    for (const kind of WAVE_ITEM_ORDER) {
      const button = this.gemBar.querySelector<HTMLButtonElement>(`[data-item="${kind}"]`);
      const count = this.gemBar.querySelector<HTMLElement>(`[data-item-count="${kind}"]`);
      const amount = wave.inventoryCount(kind);
      if (count) count.textContent = `×${amount}`;
      if (button) {
        button.disabled = amount <= 0 || !this.started || this.paused;
        button.classList.toggle('selected', kind === this.selectedItem);
        button.setAttribute('aria-pressed', String(kind === this.selectedItem));
        button.setAttribute('aria-label', `${this.itemName(kind)} · ${this.itemEffect(kind)} · ${amount}${getLanguage() === 'en' ? ' owned' : '개 보유'}`);
      }
    }
    const use = this.gemBar.querySelector<HTMLButtonElement>('.wave-use-item');
    if (use) use.disabled = wave.inventoryCount(this.selectedItem) <= 0 || !this.started || this.paused;
    if (this.waveCoinValue) this.waveCoinValue.textContent = String(wave.run.coins);
    if (this.waveScoreValue) this.waveScoreValue.textContent = fmt.int(snapshot?.score ?? wave.score);
    const freeze = this.gemBar.querySelector<HTMLElement>('.wave-freeze');
    const left = snapshot?.freezeLeft ?? wave.freezeLeft;
    if (freeze) freeze.textContent = left > 0
      ? copyText(`❄ ${left.toFixed(1)}초`, `❄ ${left.toFixed(1)}s`)
      : copyText(`선택: ${this.itemName(this.selectedItem)}`, `Selected: ${this.itemName(this.selectedItem)}`);
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
    this.writeCheckpoint();
  }

  /**
   * 중간 저장: 정답 제출 뒤(모드가 다음 목표로 넘어간 다음 틱)와 일시정지에 기록한다.
   * 클리어·실패·홈으로 나가기에서 지운다. 새로고침하면 홈에서 이 자리부터 이어갈 수 있다.
   */
  private scheduleCheckpoint() {
    window.clearTimeout(this.checkpointTimer);
    const lifetime = this.lifetime;
    this.checkpointTimer = window.setTimeout(() => { if (lifetime === this.lifetime) this.writeCheckpoint(); }, 0);
  }

  private writeCheckpoint() {
    if (!this.battle || !this.started || this.battle.finished) return;
    const state = this.battle.serialize?.();
    if (!state) return;
    const st = this.battle.stage;
    const s = this.battle.snapshot();
    const race = st.mode === 'race';
    SaveSystem.setCheckpoint({
      stageId: st.id, savedAt: new Date().toISOString(), language: getLanguage(),
      ...(this.remix ? { remix: true } : {}), ...(st.id === 'daily' ? { dailyKind: this.dailyKind } : {}),
      ...(this.dark ? { dark: true } : {}), ...(this.speedrun ? { speedrun: { ...this.speedrun, stageSec: [...this.speedrun.stageSec] } } : {}),
      done: race ? Math.round(s.dealtDamage) : s.targetIndex, total: race ? s.totalEnemyHp : s.targetTotal, ...(race ? { unit: 'm' as const } : {}),
      state,
    });
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
      SaveSystem.clearCheckpoint(); // 스스로 나간 판은 이어가지 않는다
      void navigate('home');
    } else {
      this.resumeBattle();
    }
  }

  /** 키보드 가이드 켜기/끄기: 화면 중앙 오버레이 토글 + 설정 저장. 입력창 포커스는 유지해 가이드가 떠 있어도 바로 칠 수 있다 */
  private setKbdVisible(v: boolean) {
    SaveSystem.setSettings({ showKeyboardGuide: v });
    this.kbd?.setVisible(v);
    if (this.kbdToggle) this.kbdToggle.textContent = v ? this.copy.hideGuide : this.copy.showGuide;
    this.typing?.focus();
  }

  /** 이번 판에서만 가이드를 걷는다(설정 유지). 글자를 치기 시작했다는 뜻이므로 입력을 막지 않는다 */
  private hideKbdForNow() {
    this.kbd?.setVisible(false);
    if (this.kbdToggle) this.kbdToggle.textContent = this.copy.showGuide;
    this.typing?.focus();
  }

  private finish(cleared: boolean, s: BattleSnapshot, reason?: 'time' | 'hp') {
    if (!this.battle) return;
    // 클리어 연출(씬의 STAGE CLEAR)이 대기 중인 팝업에 가리지 않게 큐를 비운다
    this.feedback?.clearJudgments();
    window.clearInterval(this.tickTimer);
    window.clearTimeout(this.checkpointTimer);
    SaveSystem.clearCheckpoint(false); // finalizeAndSave 가 바로 저장한다
    this.typing?.setEnabled(false);
    this.updateHud(s);
    this.el.classList.remove('low-health');
    this.el.classList.add('finishing', cleared ? 'finish-clear' : 'finish-fail');
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
        dark: this.dark,
        // 이어하기로 복원한 판은 실제로 친 문장에서 이야기 번호를 되찾는다(복원 전 새로 뽑힌 번호와 다를 수 있다).
        remixStory: this.remix ? remixStoryIndexOf(st.id, getLanguage(), this.battle.wordsSeen()) ?? this.remixStory : undefined,
        ghost: this.battle instanceof RaceSystem && cleared ? this.battle.ghostRecord() : undefined,
        beatGhost: this.battle instanceof RaceSystem ? this.battle.beatGhost : undefined,
        wordsSeen: this.battle.wordsSeen(),
      },
      st,
    );
    // 어둠 모드 완료는 보통 별과 따로 기록한다(코인·배지·클리어는 finalizeAndSave 가 보통 판처럼 처리했다).
    if (this.dark && result.cleared) { recordDarkClear(SaveSystem.get(), st.id, result.stars); SaveSystem.save(); }
    // 스피드런: 클리어면 이 판의 전투 시간을 더하고 다음 지역으로, 실패면 시간을 더하지 않고 같은 지역을 다시. 5지역째 클리어만 결과 화면.
    let speedrunNextId: StageId | undefined;
    if (this.speedrun) {
      const step = speedrunStep(this.speedrun, result.cleared, result.elapsedSec);
      this.speedrun = step.run;
      if (result.cleared && isComplete(step.run)) { result.speedrun = finishSpeedrun(SaveSystem.get().records, step.run); SaveSystem.save(); }
      else speedrunNextId = step.stageId ?? st.id;
    }
    if (cleared) {
      this.feedback?.judge(this.copy.stageClear, 'fever big');
    } else {
      this.feedback?.judge(st.mode === 'telegram' ? this.copy.trainFailed : reason === 'time' ? this.copy.timeUp(fmt.time(0)) : this.copy.hpEmpty, 'miss');
    }
    if (speedrunNextId) { this.speedrunInterstitial(result.cleared, speedrunNextId); return; }
    const lifetime = this.lifetime;
    const showResult = () => {
      if (lifetime !== this.lifetime) return;
      window.clearTimeout(this.finishTimer);
      window.clearTimeout(this.finishSkipTimer);
      this.el.querySelector('.finish-skip')?.remove();
      void navigate('result', { result });
    };
    const delay = cleared ? (st.mode === 'boss' ? 3600 : 2200) : 1600;
    this.finishTimer = window.setTimeout(showResult, delay);
    // 보스 붕괴와 승리 포즈는 먼저 충분히 읽히게 하고, 반복 판에서는 남은 여운만 건너뛸 수 있다.
    if (cleared && st.mode === 'boss') {
      this.finishSkipTimer = window.setTimeout(() => {
        if (lifetime !== this.lifetime) return;
        const skip = h('button', { class: 'btn btn-cream finish-skip', type: 'button', onclick: () => {
          skip.setAttribute('disabled', '');
          showResult();
        } }, getLanguage() === 'en' ? 'View results' : '결과 보기');
        this.el.append(skip);
      }, 2100);
    }
  }

  /** HUD 지역 이름 뒤에 붙는 모드 표시: "· 스피드런 2/5" 또는 "· 어둠 모드" (관찰자가 영어로 바꿀 수 있게 낱말 단위로 둔다) */
  private modeSuffix(): string {
    const en = getLanguage() === 'en';
    if (this.speedrun) return en ? ` · Speedrun ${stageNumber(this.speedrun)}/${SPEEDRUN_STAGES.length}` : ` · 스피드런 ${stageNumber(this.speedrun)}/${SPEEDRUN_STAGES.length}`;
    if (this.dark) return en ? ' · Dark mode' : ' · 어둠 모드';
    return '';
  }

  /**
   * 스피드런 막간(1.5초, 모달 아님): "2 / 5 · 누적 1:52" 를 띄운 뒤 지도·소개를 건너뛰고 바로 다음 지역 전투로 간다.
   * 실패한 판은 "같은 지역 다시" 를 알리고 시간은 더하지 않는다. 동작 줄이기 설정이면 CSS 가 애니메이션을 끈다.
   */
  private speedrunInterstitial(cleared: boolean, nextId: StageId) {
    const run = this.speedrun;
    if (!run) return;
    const lifetime = this.lifetime;
    const en = getLanguage() === 'en';
    const done = run.stageSec.length;
    const region = journeyFor(nextId, getLanguage())?.region ?? getStage(nextId).name;
    const head = cleared
      ? (en ? `${done} / ${SPEEDRUN_STAGES.length} cleared` : `${done} / ${SPEEDRUN_STAGES.length} 완료`)
      : (en ? `Retry · ${region}` : `다시 도전 · ${region}`);
    const sub = cleared
      ? (en ? `Total ${formatSpeedrunTime(totalSec(run))} · next: ${region}` : `누적 ${formatSpeedrunTime(totalSec(run))} · 다음: ${region}`)
      : (en ? `Failed time is not counted · retries ${run.retries}` : `실패한 시간은 더하지 않아 · 재도전 ${run.retries}회`);
    const overlay = h('div', { class: `speedrun-interstitial ${cleared ? '' : 'retry'}`, role: 'status', 'aria-live': 'polite', 'data-no-translate': 'true' },
      h('div', { class: 'speedrun-interstitial-card' }, h('span', { class: 'speedrun-kicker' }, en ? 'SPEEDRUN' : '스피드런'), h('strong', {}, head), h('span', {}, sub)));
    window.clearTimeout(this.interstitialTimer);
    this.interstitialTimer = window.setTimeout(() => {
      if (lifetime !== this.lifetime) return;
      this.el.append(overlay);
      this.interstitialTimer = window.setTimeout(() => {
        if (lifetime !== this.lifetime) return;
        void navigate('battle', { stageId: nextId, speedrun: true, speedrunRun: { ...run, stageSec: [...run.stageSec] } });
      }, 1500);
    }, cleared ? 600 : 900);
  }

  protected onHide() {
    this.lifetime++;
    window.clearTimeout(this.interstitialTimer);
    window.clearTimeout(this.finishTimer);
    window.clearTimeout(this.finishSkipTimer);
    this.el.querySelector('.speedrun-interstitial')?.remove();
    this.el.querySelector('.finish-skip')?.remove();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    document.removeEventListener('keydown', this.shortcutHandler);
    this.modalObserver?.disconnect();
    this.modalObserver = undefined;
    window.clearInterval(this.tickTimer);
    window.clearTimeout(this.checkpointTimer);
    this.feedback?.dispose();
    this.feedback = undefined;
    this.hud?.dispose();
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
    this.el.classList.remove('low-health', 'finishing', 'finish-clear', 'finish-fail', 'tele-bat-ambush');
  }
}
