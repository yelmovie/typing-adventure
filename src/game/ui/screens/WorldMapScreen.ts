import { Screen } from '../Screen';
import { h, icon, uiImg } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate } from '../../Game';
import { STAGES } from '../../data/stages';
import { EventBus, Events } from '../../EventBus';
import { AudioManager } from '../../systems/AudioManager';
import { toast } from '../ModalController';
import { commonTopBar } from '../TopBar';
import { getLanguage } from '../../i18n/Locale';
import { journeyFor, journeyProgress } from '../../data/worldJourney';
import { CHALLENGE_TOTAL, challengeCount, challengeName, challengesDone, challengesFor } from '../../data/challenges';
import { remixStoryCount } from '../../data/remixStories';


export class WorldMapScreen extends Screen {
  private busy = false;

  constructor() {
    super('worldmap');
  }

  protected render() {
    this.busy = false;
    const save = SaveSystem.get();
    const unlocked = save.progress.unlockedStage;
    const language = getLanguage();
    const journey = journeyProgress(save, language);

    // 점선 길은 WorldMapScene(Phaser) 에서 캐릭터 아래 깊이로 그린다 — DOM 으로 그리면 캐릭터를 덮었다

    const allClear = journey.complete;
    this.el.classList.toggle('all-clear', allClear);
    this.el.append(h('div', { class: 'map-title text-outline' }, allClear ? '빛을 되찾은 세상' : '모험 지도'));

    // 노드
    for (const st of STAGES) {
      const cleared = save.progress.clearedStages.includes(st.id);
      const locked = st.index > unlocked;
      const current = !locked && !cleared && st.index === unlocked;
      const stars = save.progress.stageStars[st.id] ?? 0;
      // 도전 카드 3칸 + (편지·전보) 이야기 n/5: 별을 다 모은 뒤에도 "아직 못 채운 빈칸" 이 보이게.
      const cards = challengesFor(st.id), cardsDone = challengesDone(save, st.id);
      const storyTotal = remixStoryCount(st.id), storiesDone = storyTotal ? (save.progress.storiesDone?.[st.id] ?? []).length : 0;
      const cardLabel = cards.map((c) => `${challengeName(c, language)}${cardsDone.includes(c.id) ? (language === 'en' ? ' (done)' : ' (달성)') : ''}`).join(', ');
      const cardText = language === 'en' ? `Challenge cards ${cardsDone.length}/${cards.length}: ${cardLabel}` : `도전 카드 ${cardsDone.length}/${cards.length}: ${cardLabel}`;
      const storyText = storyTotal ? (language === 'en' ? `Stories ${storiesDone}/${storyTotal}` : `이야기 ${storiesDone}/${storyTotal}`) : '';
      const node = h(
        'button',
        {
          class: `map-node ${st.map.y < 300 ? 'map-node-upper' : ''} ${locked ? 'locked' : ''} ${cleared ? 'cleared' : ''} ${current ? 'current' : ''}`,
          style: `left: ${st.map.x + 60}px; top: ${st.map.y + 40}px; --map-anchor-y: ${st.map.y + 40}px`,
          type: 'button',
          'aria-disabled': String(locked),
          'aria-label': `${st.index}. ${st.name} · ${locked ? '이전 지역을 완료하면 열려요' : cleared ? `완료, 별 ${stars}개` : '지금 도전할 지역'}`,
          onclick: () => this.pick(st.index, locked),
        },
        h('div', { class: 'node-pin' }, locked ? icon('lock', 'lg') : uiImg(`map_${st.id}`, 'pin', st.map.icon)),
        h('div', { class: 'node-label' }, h('span', { class: 'node-num' }, String(st.index)), st.name),
        h('div', { class: 'stars' }, [1, 2, 3].map((i) => h('span', { class: `star ${i <= stars ? 'on' : ''}` }, '★'))),
        locked ? null : h('div', { class: 'node-goals', 'data-no-translate': 'true' },
          h('span', { class: 'card-slots', role: 'img', 'aria-label': cardText, title: cardText }, cards.map((c) => h('i', { class: `card-slot ${cardsDone.includes(c.id) ? 'on' : ''}` }))),
          storyTotal ? h('span', { class: `node-stories ${storiesDone >= storyTotal ? 'done' : ''}`, title: storyText }, storyText) : null),
        h('div', { class: 'node-status' }, locked ? '잠김' : cleared ? '완료 · 다시 도전' : '지금 도전'),
      );
      this.el.append(node);
    }

    // 진행도 패널
    const starTotal = Object.values(save.progress.stageStars).reduce((a, b) => a + b, 0);
    const cardTotal = challengeCount(save);
    const storyTotalAll = STAGES.reduce((n, st) => n + remixStoryCount(st.id), 0);
    const storyDoneAll = STAGES.reduce((n, st) => n + (remixStoryCount(st.id) ? (save.progress.storiesDone?.[st.id] ?? []).length : 0), 0);
    const nextRegion = journey.next ? journeyFor(journey.next.id, language)?.region : undefined;
    this.el.append(
      h(
        'div',
        { class: 'panel panel-glass map-progress journey-map', 'data-no-translate': 'true' },
        h('div', { class: 'mp-title' }, h('span', {}, language === 'en' ? `Lights restored ${journey.restored.length}/5` : `되찾은 빛 ${journey.restored.length}/5`), h('span', {}, icon('star_on'), ` ${starTotal}/15`)),
        h('div', { class: 'mp-cards', title: language === 'en' ? 'Challenge cards: three goals per region, stricter than stars' : '도전 카드: 지역마다 별보다 엄격한 목표 3개' },
          h('i', { class: `card-slot ${cardTotal >= CHALLENGE_TOTAL ? 'on' : 'half'}`, 'aria-hidden': 'true' }),
          h('span', {}, language === 'en' ? ` Challenge cards ${cardTotal}/${CHALLENGE_TOTAL}` : ` 도전 카드 ${cardTotal}/${CHALLENGE_TOTAL}`),
          storyTotalAll ? h('span', { class: 'mp-stories' }, language === 'en' ? ` · Stories ${storyDoneAll}/${storyTotalAll}` : ` · 이야기 ${storyDoneAll}/${storyTotalAll}`) : null),
        h('div', { class: 'journey-lights', role: 'list', 'aria-label': language === 'en' ? 'Five lights of the world' : '다섯 지역의 빛' }, journey.chapters.map(chapter => {
          const restored = journey.restored.some(item => item.stageId === chapter.stageId);
          const label = `${chapter.relic} · ${language === 'en' ? restored ? 'restored' : 'waiting' : restored ? '되찾았어' : '아직 기다리는 중'}`;
          return h('div', { class: `journey-light ${restored ? 'restored' : ''}`, role: 'listitem', 'aria-label': label, title: label, style: `--journey-color: ${chapter.color}` },
            h('span', { class: 'journey-light-mark', 'aria-hidden': 'true' }, restored ? chapter.mark : '·'),
            h('span', { class: 'journey-light-label', 'aria-hidden': 'true' }, chapter.relic));
        })),
        h('div', { class: 'mp-next' }, journey.complete
          ? (language === 'en' ? 'All five lights shine. Try a new journey!' : '다섯 빛이 모두 반짝여. 새 낱말로 다시 모험!')
          : (language === 'en' ? `Next · ${nextRegion}` : `다음 · ${nextRegion}`)),
      ),
    );
    this.el.append(h('div', { class: 'map-legend' }, h('span', { class: 'lg-clear' }, '클리어'), h('span', { class: 'lg-cur' }, '현재 위치'), h('span', { class: 'lg-lock' }, '잠김')));

    this.el.append(commonTopBar({ onReset: () => void navigate('home') }));
  }

  private pick(index: number, locked: boolean) {
    if (this.busy) return;
    if (locked) {
      AudioManager.sfx('miss');
      toast('이전 스테이지를 먼저 클리어해야 열려요!');
      return;
    }
    this.busy = true;
    AudioManager.sfx('click');
    const st = STAGES[index - 1];
    EventBus.emit(Events.MAP_FOCUS, { index, then: async () => {
      try { await navigate('intro', { stageId: st.id }); }
      finally { this.busy = false; }
    } });
  }
}
