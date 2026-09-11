import { Screen } from '../Screen';
import { h, fmt, icon } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate } from '../../Game';
import { getStage } from '../../data/stages';
import { getCharacter, getPet, portraitUrl, profileDisplayName } from '../../data/characters';
import type { StageId, ContentUnit } from '../../types';
import type { BattleSnapshot, TypingMode } from '../../systems/BattleState';
import { WaveSystem } from '../../systems/WaveSystem';
import { RaceSystem } from '../../systems/RaceSystem';
import { LetterSystem } from '../../systems/LetterSystem';
import { TelegramSystem } from '../../systems/TelegramSystem';
import { BossSystem } from '../../systems/BossSystem';
import { DailySystem, pickDailyWords, pickDailyLong, DAILY, type DailyKind } from '../../systems/DailySystem';
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
import { getLanguage } from '../../i18n/Locale';

const ui = (ko: string, en: string) => getLanguage() === 'en' ? en : ko;

/** 순서N 태그 기준 정렬 (없으면 원래 순서) */
const byOrder = (a: { tags: string[] }, b: { tags: string[] }) => {
  const n = (u: { tags: string[] }) => Number((u.tags.find((t) => t.startsWith('순서')) ?? '순서0').slice(2));
  return n(a) - n(b);
};

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
  private feverOverlay?: HTMLElement;
  /** 편지 모드 전용 판정 팝 큐 (동시에 뜬 팝이 쌓여 본문을 덮지 않게 순서대로) */
  private judgeQueue: [string, string][] = [];
  private judgeTimer = 0;
  private started = false;
  private pauseDialogOpen = false;
  private pausedByOverlay = false;
  private modalObserver?: MutationObserver;
  private lifetime = 0;
  private remix = false;
  private visibilityHandler = () => {
    if (document.hidden) void this.pauseMenu(ui('다른 화면을 보는 동안 모험을 멈췄어요. 준비되면 계속해요.', 'Your adventure is paused while this tab is hidden. Continue when you are ready.'));
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

    if (st.mode === 'wave') {
      const pool = stagePool.filter((u) => u.type === 'word');
      const len = (u: { text: string }) => [...u.text].filter((c) => c.trim()).length;
      const short = pool.filter((u) => len(u) <= (getLanguage() === 'en' ? 4 : 2));
      const long = pool.filter((u) => len(u) >= (getLanguage() === 'en' ? 5 : 3));
      this.battle = new WaveSystem(st, difficulty, pet, { slime: short.length ? short : pool, bat: long.length ? long : pool }, (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'race') {
      const pool = stagePool.filter((u) => u.type === 'word');
      const ghost = save.records.ghosts?.[st.id] ?? null;
      this.battle = new RaceSystem(st, difficulty, pet, pool, ghost, getEnemy(st.enemies[0]).sheet, (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'letter') {
      const all = stagePool.filter((u) => u.type === 'sentence');
      const letter = all.filter((u) => u.tags.includes('편지')).sort(byOrder);
      this.battle = new LetterSystem(st, difficulty, pet, letter.length >= 6 ? letter : all, (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'telegram') {
      const all = stagePool.filter((u) => u.type === 'sentence');
      const tele = all.filter((u) => u.tags.includes('전보')).sort(byOrder);
      this.battle = new TelegramSystem(st, difficulty, pet, tele.length >= 3 ? tele : all.slice(0, 3), (ev, d) => EventBus.emit(ev, d));
    } else if (st.mode === 'boss') {
      const all = stagePool;
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
    } else throw new Error(`Unsupported stage mode: ${st.mode}`);
    if (import.meta.env.DEV) (window as unknown as { __battle: TypingMode }).__battle = this.battle; // 개발용 콘솔 접근
    this.hud = new HudController({
      stageIndex: st.index,
      stageName: st.name,
      playerName: profileDisplayName(save.profile, getLanguage()),
      level: SaveSystem.level(),
      portrait: portraitUrl(ch.sheet),
      petName: pet.name,
      petPortrait: portraitUrl(pet.sheet),
      petSkill: `${this.isSentenceMode() ? ui('2문장 연속 성공', '2 sentences in a row') : ui('10낱말 연속 성공', '10 words in a row')} · ${this.petHelp(pet.active)}`,
      petActive: pet.active,
      countLabel: st.mode === 'wave' ? '몬스터' : st.mode === 'race' ? '거리' : this.isSentenceMode() ? '문장' : st.mode === 'boss' ? '페이즈' : '낱말',
      progressKind: st.mode === 'race' ? 'distance' : st.mode === 'boss' ? 'phase' : 'targets',
      telegram: st.mode === 'telegram',
      timeLabel: st.mode === 'letter' || st.mode === 'daily' ? '걸린 시간' : st.mode === 'telegram' ? '충돌까지' : undefined,
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
      placeholder: ui('여기에 입력 · Esc로 잠시 멈춤', 'Type here · Esc to pause'),
      'aria-label': ui('타자 입력창', 'Typing input'),
      'aria-description': ui('Enter 제출, Tab 점프, Shift+Tab 버튼으로 이동, Escape 잠시 멈춤', 'Enter submits, Tab skips, Shift+Tab moves to controls, Escape pauses'),
      lang: getLanguage(),
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
          h('span', { class: 'bb-target-desc' }, st.mode === 'wave' ? '몬스터 머리 위 낱말을 입력하면 공격! 다 치면 처치' : st.mode === 'race' ? '낱말을 빨리 칠수록 빨리 달려! 오타는 감속' : st.mode === 'letter' ? '편지의 문장을 띄어쓰기까지 똑같이 입력하고 Enter' : st.mode === 'telegram' ? '전보 문장을 그대로 입력하고 Enter! 문장마다 브레이크가 걸려' : st.mode === 'boss' ? '결정 → 러시 → 마지막 문장! 배운 걸 전부 써' : st.mode === 'daily' ? data.dailyKind === 'sentence' ? '오늘의 문장 10개, 정확하게 완성해요' : data.dailyKind === 'long' ? '오늘의 긴 글을 한 문장씩 정확하게 완성해요' : '오늘의 낱말 20개, 내 기록에 도전!' : st.index <= 2 ? '낱말을 똑같이 입력하고 Enter 또는 Space' : '문장을 똑같이 입력하고 Enter'),
          this.kbdToggle,
        ),
        h('div', { class: 'bb-target-row' }, this.hud.targetEl, this.hud.variantEl),
        this.hud.hintEl,
        h('div', { class: 'bb-input-wrap' }, this.inputEl, h('span', { class: 'bb-input-hint' }, icon('key_enter')), this.hud.skipBtn),
      ),
    );

    this.feverOverlay = h('div', { class: 'fever-overlay' });
    // 좌측은 한 열로 쌓는다(플레이어 → 모드 패널). 보스전만 적 HP도 이 열에 들어간다.
    const isBoss = st.mode === 'boss';
    const leftCol = h('div', { class: 'battle-left-col' }, this.hud.left, isBoss ? this.hud.enemyPanel : null, this.hud.track, this.hud.tele);
    this.el.append(this.feverOverlay, this.hud.top, leftCol);
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
    this.bind(Events.PET_ACTIVE, (d: { active: PetActive; pet: { name: string } }) => this.judge(`${d.pet.name}: ${this.petHelp(d.active)}`, 'pet'));
    this.bind(Events.PET_PASSIVE, (d: { pet: { name: string; passiveDesc: string } }) => this.judge(`${d.pet.name}이(가) ${d.pet.passiveDesc}!`, 'pet'));
    this.bind(Events.BOMB_EXPLODE, () => { this.flash('wrong'); this.judge('펑! 콤보 초기화', 'miss'); AudioManager.sfx('bomb'); });
    this.bind(Events.VARIANT_BONUS, (d: { variant: WordVariant; coins?: number; hp?: number }) => {
      AudioManager.sfx('coin');
      this.judge(d.variant === 'treasure' ? `보물! +${d.coins} 코인` : `HP +${d.hp}`, 'bonus');
    });

    this.hud.update(this.battle.snapshot());
    if (getLanguage() === 'en') {
      const help = this.el.querySelector('.bb-target-desc');
      if (help) help.textContent = 'Match letters, capitals, spaces and punctuation. Correct mistakes and try again.';
    }
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
    if (active === 'shield') return ui('5초 동안 오답 콤보·HP 보호', '5 seconds of combo and HP protection');
    if (active === 'time_plus') return untimed ? ui('5초 복구 보호 + 다음 입력 힌트', '5-second recovery shield + next target hint') : ui('시간·거리 여유 추가', 'Extra time or distance');
    if (active === 'fire_aoe') return untimed || mode === 'telegram' ? ui('다음에 입력할 내용 미리 보기', 'Preview the next target') : ui('화염으로 적을 밀어내요', 'Fire helps push enemies back');
    return ui('다음에 입력할 내용 미리 보기', 'Preview the next target');
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
        const roles = { armor: ui('갑옷 깨기', 'Break the armor'), core: ui('코어 밝히기', 'Light the core'), finale: ui('마지막 일격', 'Final strike') };
        help.textContent = b.phase === 1
          ? ui('글자를 맞추면 결정에 균열! 낱말을 완성하면 깨져요.', 'Each correct letter cracks a crystal. Finish the word to break it!')
          : b.phase === 2
            ? ui('다가오는 낱말을 완성해서 반격! 글자를 칠 때마다 공격해요.', 'Finish the incoming words to counterattack! Each letter sends a hit.')
            : `${b.finalStep}/${b.finalTotal} · ${roles[b.finalRole ?? 'armor']} · ${ui('문장을 완성하면 강력한 일격!', 'Finish the sentence for a mighty strike!')}`;
      }
    }
    if (s.target) {
      if (this.inputEl) this.inputEl.placeholder = ui('여기에 입력 · Esc로 잠시 멈춤', 'Type here · Esc to pause');
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
      if (this.inputEl) this.inputEl.placeholder = ui('다음 목표가 곧 나타나요', 'The next target is on its way');
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
      this.judge(ui(`나중에 다시 도전! 남은 점프 ${left - 1}번`, `Try it later! ${left - 1} skips left`), 'good');
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
    this.flash('right');
    this.judge(d.corrected ? ui('스스로 고쳤어! ✨', 'You fixed it! ✨') : d.perfect ? ui('정확하게 완성! ✨', 'PERFECT! ✨') : ui('완성했어요!', 'Completed!'), d.perfect || d.corrected ? 'perfect' : 'good');
    this.hud?.update(d.snapshot);
  }

  private onWrong(d: { snapshot: BattleSnapshot; forgiven: boolean; shielded: boolean }) {
    this.flash('wrong');
    this.judge(d.forgiven || d.shielded ? ui('친구가 보호했어요 · 고쳐서 다시!', 'Your friend protected you · correct and retry!') : ui('목표를 보고 고쳐서 다시 해요', 'Check the target, correct it and retry'), d.forgiven || d.shielded ? 'good' : 'miss');
    this.hud?.update(d.snapshot);
    this.inputEl?.classList.remove('bad');
  }

  /** FEVER 단계 변화: 배경 밝아짐 + BGM 템포업 + 판정 문구 */
  private onFever(level: FeverLevel) {
    this.el.classList.toggle('fever', level >= 2);
    this.el.classList.toggle('power', level === 1);
    AudioManager.setRate(level >= 2 ? 1.15 : 1);
    // FEVER 진입은 화면 전체가 같이 바뀌는 순간이라 대기시키지 않고 바로 띄운다
    if (level === 1) this.judge('POWER!', 'perfect');
    if (level === 2) { this.judgeNow('FEVER TIME!', 'fever big'); AudioManager.sfx('fever'); }
    if (level === 3) { this.judgeNow('FINAL FEVER!', 'fever big'); AudioManager.sfx('fever'); }
  }

  private flash(cls: 'right' | 'wrong') {
    const b = this.bottom;
    if (!b) return;
    b.classList.remove('right', 'wrong');
    void b.offsetWidth;
    b.classList.add(cls);
    window.setTimeout(() => b.classList.remove(cls), 420);
  }

  /**
   * 판정·이벤트 팝업은 큐로 하나씩 보여준다.
   * 동시에 여러 개가 뜨면(S3 = PERFECT + 자물쇠 + 비밀방, S1 클리어 = FEVER + 펫 스킬 + 소탕 + 클리어)
   * 78px 씩 위로 쌓이다가 편지 본문·캐릭터 위까지 올라와 서로 겹쳐 읽을 수 없게 된다.
   */
  private judge(text: string, cls: string) {
    this.judgeQueue.push([text, cls]);
    this.pumpJudge();
  }

  /** 지금 당장 보여줘야 하는 팝업(FEVER 진입 등) — 대기 중인 것을 버리고 앞으로 나온다 */
  private judgeNow(text: string, cls: string) {
    this.judgeQueue.length = 0;
    window.clearTimeout(this.judgeTimer);
    this.judgeTimer = 0;
    this.judge(text, cls);
  }

  private pumpJudge() {
    if (this.judgeTimer) return;
    const next = this.judgeQueue.shift();
    if (!next) return;
    for (const old of this.el.querySelectorAll<HTMLElement>('.judge-pop')) old.remove();
    this.showJudge(next[0], next[1]);
    this.judgeTimer = window.setTimeout(() => {
      this.judgeTimer = 0;
      this.pumpJudge();
    }, 380);
  }

  private showJudge(text: string, cls: string) {
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
  private async pauseMenu(message = ui('잠시 쉬어도 괜찮아요. 멈춘 시간은 타수와 기록에 들어가지 않아요.', 'Take your time. Paused time is not included in your typing record.')) {
    if (!this.battle || this.battle.finished || this.pauseDialogOpen || this.pausedByOverlay) return;
    const lifetime = this.lifetime;
    this.suspendBattle();
    this.pauseDialogOpen = true;
    await alertModal(ui('잠시 멈춤', 'Paused'), message, ui('계속하기', 'Continue'));
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
    const leave = await confirmModal(ui('나가기', 'Leave adventure'), ui('정말 나갈까요?\n지금 전투 기록은 저장되지 않아요.', 'Leave this adventure?\nThis unfinished round will not be saved.'), ui('나가기', 'Leave'), ui('계속하기', 'Continue'));
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
    if (this.kbdToggle) this.kbdToggle.textContent = v ? '가이드 끄기' : '가이드 켜기';
    if (v) this.inputEl?.blur();
    else this.typing?.focus();
  }

  private finish(cleared: boolean, s: BattleSnapshot, reason?: 'time' | 'hp') {
    if (!this.battle) return;
    // 클리어 연출(씬의 STAGE CLEAR)이 대기 중인 팝업에 가리지 않게 큐를 비운다
    this.judgeQueue.length = 0;
    window.clearTimeout(this.judgeTimer);
    this.judgeTimer = 0;
    for (const old of this.el.querySelectorAll<HTMLElement>('.judge-pop')) old.remove();
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
      this.judge('STAGE CLEAR!', 'fever big');
    } else {
      this.judge(st.mode === 'telegram' ? '급정지 실패… 다시 도전!' : reason === 'time' ? `시간 종료 ${fmt.time(0)}` : 'HP가 0이 됐어요', 'miss');
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
    window.clearTimeout(this.judgeTimer);
    this.judgeTimer = 0;
    this.judgeQueue.length = 0;
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
