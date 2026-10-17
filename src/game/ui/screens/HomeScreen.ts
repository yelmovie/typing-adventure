import { Screen } from '../Screen';
import { h, icon, uiImg } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate, currentScreen } from '../../Game';
import { getCharacter, getPet, portraitUrl, profileDisplayName } from '../../data/characters';
import { DIFFICULTY_LABEL, getStage } from '../../data/stages';
import { collectionModal, certificateModal, confirmModal, dailyPickModal, replayModal, introMovieModal, homeMenuModal, closeModal, darkModal, speedrunModal } from '../ModalController';
import { endgameUnlocked, stageNumber, SPEEDRUN_STAGES } from '../../systems/SpeedrunSystem';
import { AudioManager } from '../../systems/AudioManager';
import { currentTitle, nextTitle, unlockedDecors } from '../../data/titles';
import { ABOUT } from '../../data/about';
import { commonTopBar } from '../TopBar';
import { getLanguage, setLanguage } from '../../i18n/Locale';
import { openingWasOffered, markOpeningOffered } from '../OpeningSession';
import { journeyFor, journeyProgress } from '../../data/worldJourney';
import { CHALLENGE_TOTAL, challengeCount } from '../../data/challenges';
import { collectionProgress } from '../modals/CollectionModal';
import { currentDailyKind, dailyCompare, shiftDay, todayKey } from '../../systems/DailySystem';
import { streakChip } from '../modals/AdventureModals';

export class HomeScreen extends Screen {
  private openingFrame?: number;
  private openingCancel?: () => void;
  constructor() {
    super('home');
  }

  protected render() {
    this.cancelOpening();
    const save = SaveSystem.get();
    const has = SaveSystem.hasSave();
    this.el.classList.toggle('has-save', has);
    const ch = getCharacter(save.profile.characterId);
    const pet = getPet(save.profile.petId);
    const language = getLanguage();
    const playerName = profileDisplayName(save.profile, language);
    this.el.classList.toggle('language-en', language === 'en');
    this.el.append(h('div', { class: 'home-language', role: 'group', 'aria-label': '타이핑 언어' },
      h('span', { class: 'home-language-label' }, '타이핑 언어'),
      (['ko', 'en'] as const).map((value) => h('button', {
        type: 'button', class: `language-choice ${language === value ? 'selected' : ''}`,
        'aria-pressed': String(language === value), lang: value, 'data-no-translate': 'true',
        onclick: () => {
          if (getLanguage() === value) return;
          SaveSystem.setSettings({ language: value });
          setLanguage(value);
          void navigate('home');
        },
      }, value === 'ko' ? '한국어' : 'English')),
    ));

    this.el.append(
      h(
        'div',
        { class: 'home-logo' },
        language === 'en'
          ? h('img', { class: 'logo-img logo-img-en', src: './assets/ui/logo-en-v1.webp', alt: 'Typing Adventure', 'data-no-translate': 'true', draggable: 'false' })
          : h('img', { class: 'logo-img', src: './assets/ui/logo.webp', alt: '타이핑 어드벤처', draggable: 'false' }),
        h('div', { class: 'logo-sub' }, 'TYPING ADVENTURE'),
        h('div', { class: 'logo-tag' }, '한글 타자로 몬스터를 물리치는 판타지 모험'),
      ),
    );

    if (has) {
      const stars = Object.values(save.progress.stageStars).reduce((a, b) => a + b, 0);
      this.el.append(
        h(
          'div',
          { class: 'panel panel-glass player-card' },
          h('img', { src: portraitUrl(ch.sheet), alt: ch.name }),
          h(
            'div',
            {},
            h('div', { class: 'pc-name', 'data-no-translate': 'true' }, `${playerName} · Lv.${SaveSystem.level()}`),
            h('div', { class: 'pc-title' }, h('span', { class: 'tag' }, currentTitle(save.progress.coins ?? 0).name), h('span', { class: 'muted' }, (() => { const n = nextTitle(save.progress.coins ?? 0); return n ? ` · 다음 칭호까지 ${n.coins - (save.progress.coins ?? 0)}코인` : ' · 최고 칭호!'; })())),
            h('div', { class: 'pc-sub' }, `${ch.name} · ${pet.name} · `, h('b', {}, DIFFICULTY_LABEL[save.profile.difficulty].name)),
            h('div', { class: 'pc-sub' }, icon('star_on'), ` ${stars} · `, icon('coin'), ` ${save.progress.coins ?? 0} · 최고 `, h('b', {}, `${save.records.bestCpm}타/분`), ` · 도감 ${collectionProgress(save).percent}% · 도전 카드 ${challengeCount(save)}/${CHALLENGE_TOTAL}`),
          ),
        ),
      );
    }

    // 코인으로 열린 홈 장식
    if (has) {
      for (const d of unlockedDecors(save.progress.coins ?? 0)) {
        this.el.append(h('div', { class: 'home-decor anim-float', title: d.name, style: { left: `${d.x}px`, top: `${d.y}px` } }, uiImg(`item_${d.id}`, 'decor', d.icon)));
      }
    }
    const journey = journeyProgress(save, language);
    const nextRegion = journey.next ? journeyFor(journey.next.id, language)?.region : undefined;
    const newAdventure = this.btn(icon('flag'), has ? '기록 지우고 시작' : '모험 시작', has ? 'btn-gray btn-md home-new' : 'btn-primary btn-lg home-start-pulse', async () => {
        if (has) {
          const ok = await confirmModal(
            language === 'en' ? 'Erase English progress?' : '한국어 기록을 지울까?',
            language === 'en'
              ? 'Your English adventure will start again at Stage 1.\nYou will lose your stars, coins, unlocked friends, collection and typing records.\nYour Korean progress will stay. Erased progress cannot be brought back.'
              : '한국어 모험 기록을 모두 지우고 1단계부터 시작해.\n모은 별·코인·친구와 도감·타자 기록이 사라져.\n영어 기록은 그대로 남아. 지운 기록은 되돌릴 수 없어.',
            '지우고 시작', '기록 남기기', { destructive: true },
          );
          if (!ok) return;
          if (!SaveSystem.restartAdventure()) return;
        }
        void navigate('setup');
      });
    const extras = h('div', { class: 'home-extra-grid' },
      has ? this.btn(icon('unlock'), '모험가·친구 변경', 'btn-gray btn-md home-profile', () => void navigate('setup', { step: 'pet' })) : null,
      this.btn(icon('clock'), '오늘의 도전', 'btn-sky btn-md', () => dailyPickModal(), !has),
      // 다섯 지역을 모두 완료한 뒤에만: 스피드런(전 코스 타임어택)·어둠의 모험(뉴게임+)
      has && endgameUnlocked(save.progress) ? this.btn(icon('bolt'), '스피드런', 'btn-sky btn-md home-speedrun', () => void speedrunModal()) : null,
      has && endgameUnlocked(save.progress) ? this.btn(icon('lock'), '어둠의 모험', 'btn-gray btn-md home-dark', () => darkModal()) : null,
      this.btn(icon('book'), '도감', 'btn-gray btn-md', () => collectionModal()),
      this.btn(icon('trophy'), '인증서', 'btn-gray btn-md', () => certificateModal()),
      this.btn(icon('star_on'), language === 'en' ? 'Replay intro' : '인트로 다시보기', 'btn-gray btn-md home-intro', () => {
        markOpeningOffered();
        this.cancelOpening();
        this.openingCancel = introMovieModal();
      }),
      has ? newAdventure : null,
    );
    // Close this menu before an existing action navigates or opens its own dialog.
    extras.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) closeModal();
    }, true);
    const more = h('details', { class: 'journey-details home-more' });
    const moreButton = h('summary', {
      'data-no-translate': 'true', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
      onclick: (event: Event) => {
        event.preventDefault();
        more.open = true;
        moreButton.setAttribute('aria-expanded', 'true');
        homeMenuModal(extras, () => { more.open = false; moreButton.setAttribute('aria-expanded', 'false'); });
      },
    }, language === 'en' ? 'More adventure options' : '모험 메뉴 더보기');
    more.append(moreButton);
    // 새로고침으로 끊긴 전투가 있으면(2시간 이내, 같은 언어) 그 자리부터 이어가거나 처음부터 시작할 수 있다.
    const checkpoint = has ? SaveSystem.checkpoint() : undefined;
    const resume = checkpoint && checkpoint.language === language ? checkpoint : undefined;
    const resumeChoice = resume ? (() => {
      const st = getStage(resume.stageId);
      const region = st.id === 'daily' ? (language === 'en' ? 'Daily practice' : '오늘의 도전') : `STAGE ${st.index} ${journeyFor(st.id, language)?.region ?? st.name}`;
      const progress = resume.unit === 'm' ? `${resume.done}m/${resume.total}m` : `${resume.done}/${resume.total}`;
      // 스피드런·어둠 모드 중간 저장은 어떤 판을 이어가는지 라벨에 밝힌다.
      const mode = resume.speedrun ? (language === 'en' ? `Speedrun ${stageNumber(resume.speedrun)}/${SPEEDRUN_STAGES.length} · ` : `스피드런 ${stageNumber(resume.speedrun)}/${SPEEDRUN_STAGES.length} · `)
        : resume.dark ? (language === 'en' ? 'Dark · ' : '어둠 · ') : '';
      return h('div', { class: 'home-resume', 'data-no-translate': 'true' },
        this.btn(icon('pin'), language === 'en' ? `Resume battle · ${mode}${region} (${progress})` : `하던 전투 이어하기 · ${mode}${region} (진행 ${progress})`, 'btn-primary btn-lg home-resume-continue',
          () => void navigate('battle', { stageId: resume.stageId, remix: resume.remix, dailyKind: resume.dailyKind, resume: true })),
        this.btn(icon('flag'), language === 'en' ? 'Restart that battle' : '그 전투 처음부터', 'btn-gray btn-md home-resume-restart', () => { SaveSystem.clearCheckpoint(); this.show({}); }));
    })() : null;
    // 완주한 뒤 홈의 주인공은 '오늘의 도전'. 이어서 하기(중간 저장)가 떠 있으면 그쪽이 우선이라 이 블록은 쉰다.
    const finished = has && ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5'].every((id) => save.progress.clearedStages.includes(id));
    const dailyHero = finished && !resumeChoice ? (() => {
      const en = language === 'en', today = todayKey(), kind = currentDailyKind();
      const kindName = { word: en ? 'Words' : '단어', sentence: en ? 'Sentences' : '문장', long: en ? 'Long passage' : '긴 글' }[kind];
      const cmp = dailyCompare(save, kind, today);
      const shortDay = (day: string) => day.slice(5).replace('-', '/');
      const prevLabel = cmp.prev && cmp.prev.day !== shiftDay(today, -1) ? (en ? `Last (${shortDay(cmp.prev.day)})` : `지난 도전(${shortDay(cmp.prev.day)})`) : (en ? 'Yesterday' : '어제');
      const record = cmp.today === undefined && !cmp.prev
        ? (en ? 'Play today to start your record.' : '오늘 도전하면 기록이 시작돼.')
        : en ? `Today: ${cmp.today === undefined ? 'not yet' : `${cmp.today} keys/min`} · ${prevLabel}: ${cmp.prev ? `${cmp.prev.cpm} keys/min` : 'no record'}`
          : `오늘 기록: ${cmp.today === undefined ? '아직 없음' : `${cmp.today}타`} · ${prevLabel}: ${cmp.prev ? `${cmp.prev.cpm}타` : '기록 없음'}`;
      return h('section', { class: 'panel panel-glass daily-hero', 'data-no-translate': 'true', 'aria-label': en ? 'Daily practice' : '오늘의 도전' },
        h('div', { class: 'daily-hero-kicker' }, icon('clock'), h('b', {}, en ? 'Daily practice' : '오늘의 도전'), h('span', { class: 'daily-hero-kind' }, ` · ${kindName}`)),
        h('div', { class: 'daily-hero-row' }, streakChip(save, today), h('span', { class: 'daily-hero-record' }, record)),
        this.btn(icon('bolt'), en ? 'Start daily practice' : '오늘의 도전 시작', 'btn-primary btn-lg daily-hero-start', () => dailyPickModal()));
    })() : null;
    const menu = h('div', { class: `home-menu journey-home-menu ${dailyHero ? 'has-daily-hero' : ''}` },
      dailyHero,
      h('div', { class: 'home-journey', 'data-no-translate': 'true' },
        h('span', { class: 'home-journey-mark', 'aria-hidden': 'true' }, '✦'),
        h('span', {}, !has ? (language === 'en' ? 'Bring light back to five regions.' : '다섯 지역에 빛을 되찾아 줘.')
          : journey.complete ? (language === 'en' ? '5 lights restored · explore with new words' : '5개의 빛을 되찾았어 · 새 낱말로 다시 모험')
          : (language === 'en' ? `Next: ${nextRegion} · ${journey.restored.length}/5 lights` : `다음은 ${nextRegion} · 빛 ${journey.restored.length}/5`))),
      resumeChoice,
      // 하던 전투가 있으면 그쪽이 주 버튼이다. 지도 버튼은 한 단계 낮춰 주 버튼이 둘로 보이지 않게 한다.
      has ? this.btn(icon('pin'), '모험 지도 열기', resumeChoice ? 'btn-sky btn-lg home-map' : 'btn-primary btn-lg home-map', () => void navigate('worldmap')) : newAdventure,
      h('div', { class: 'home-secondary' },
        this.btn(icon('book'), language === 'en' ? 'Choose typing practice' : '타이핑 연습 선택', 'btn-sky btn-lg home-tutorial', () => void navigate('tutorial')),
        has && save.progress.clearedStages.includes('stage_1') ? this.btn(icon('flag'), '모험 플러스 · 새 낱말 도전', 'btn-sky btn-md home-replay', () => replayModal()) : null),
      more,
    );
    this.el.append(menu);
    this.el.append(commonTopBar({ hideHome: true, onReset: () => this.show({}) }));
    this.el.append(has
      ? h('div', { class: 'home-tip', 'data-no-translate': 'true' }, language === 'en' ? `${playerName}, one step at a time!` : `${playerName} 모험가, 오늘도 한 걸음씩!`)
      : h('div', { class: 'home-tip' }, '모험가와 친구를 골라 잃어버린 글자를 찾아요'));
    this.el.append(h('div', { class: 'home-version' }, `${ABOUT.version} · 기록은 이 기기에만 저장돼요 · © ${ABOUT.year} ${ABOUT.author}`));
    if (!openingWasOffered()) {
      markOpeningOffered();
      const ready = () => {
        this.openingFrame = undefined;
        if (currentScreen() !== 'home' || !this.el.isConnected || this.el.style.display === 'none') return;
        const stage = document.getElementById('ui-stage');
        if (stage?.hasAttribute('aria-busy') || document.getElementById('fade')?.classList.contains('on')) {
          this.openingFrame = requestAnimationFrame(ready);
          return;
        }
        if (document.hidden || document.getElementById('modal-root')?.childElementCount) return;
        this.openingCancel = introMovieModal();
      };
      this.openingFrame = requestAnimationFrame(ready);
    }
  }

  private cancelOpening() {
    if (this.openingFrame !== undefined) cancelAnimationFrame(this.openingFrame);
    this.openingFrame = undefined;
    this.openingCancel?.();
    this.openingCancel = undefined;
  }

  protected onHide() { this.cancelOpening(); }

  private btn(ic: string | HTMLElement, label: string, cls: string, onClick: () => void, disabled = false) {
    const b = h('button', { type: 'button', class: `btn ${cls}`, disabled }, h('span', { class: 'btn-icon' }, ic), label);
    b.addEventListener('click', () => {
      AudioManager.unlock();
      AudioManager.sfx('click');
      onClick();
    });
    return b;
  }
}
