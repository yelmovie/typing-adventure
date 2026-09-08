import { Screen } from '../Screen';
import { h, icon, uiImg } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate } from '../../Game';
import { STAGES } from '../../data/stages';
import { EventBus, Events } from '../../EventBus';
import { AudioManager } from '../../systems/AudioManager';
import { toast } from '../ModalController';
import { commonTopBar } from '../TopBar';


export class WorldMapScreen extends Screen {
  private busy = false;

  constructor() {
    super('worldmap');
  }

  protected render() {
    this.busy = false;
    const save = SaveSystem.get();
    const unlocked = save.progress.unlockedStage;

    // 점선 길은 WorldMapScene(Phaser) 에서 캐릭터 아래 깊이로 그린다 — DOM 으로 그리면 캐릭터를 덮었다

    const allClear = save.progress.clearedStages.length >= 5;
    this.el.classList.toggle('all-clear', allClear);
    this.el.append(h('div', { class: 'map-title text-outline' }, allClear ? '빛을 되찾은 세상' : '모험 지도'));

    // 노드
    for (const st of STAGES) {
      const cleared = save.progress.clearedStages.includes(st.id);
      const locked = st.index > unlocked;
      const current = !locked && !cleared && st.index === unlocked;
      const stars = save.progress.stageStars[st.id] ?? 0;
      const node = h(
        'div',
        {
          class: `map-node ${locked ? 'locked' : ''} ${cleared ? 'cleared' : ''} ${current ? 'current' : ''}`,
          style: { left: `${st.map.x + 60}px`, top: `${st.map.y + 40}px` },
          role: 'button',
          tabindex: locked ? '-1' : '0',
          'aria-label': `${st.index}. ${st.name}${locked ? ' (잠김)' : ''}`,
          onclick: () => this.pick(st.index, locked),
        },
        h('div', { class: 'node-pin' }, locked ? icon('lock', 'lg') : uiImg(`map_${st.id}`, 'pin', st.map.icon)),
        h('div', { class: 'node-label' }, h('span', { class: 'node-num' }, String(st.index)), st.name),
        h('div', { class: 'stars' }, [1, 2, 3].map((i) => h('span', { class: `star ${i <= stars ? 'on' : ''}` }, '★'))),
      );
      this.el.append(node);
    }

    // 진행도 패널
    const clearedCount = save.progress.clearedStages.length;
    const starTotal = Object.values(save.progress.stageStars).reduce((a, b) => a + b, 0);
    this.el.append(
      h(
        'div',
        { class: 'panel panel-glass map-progress' },
        h('div', { class: 'mp-title' }, h('span', {}, `${save.profile.name} 모험가 · Lv.${SaveSystem.level()}`), h('span', {}, icon('star_on'), ` ${starTotal}/15`)),
        h('div', { class: 'gauge gauge-lg' }, h('div', { class: 'gauge-fill gold', style: { width: `${(clearedCount / 5) * 100}%` } }), h('div', { class: 'gauge-label' }, `스테이지 ${clearedCount} / 5 클리어`)),
        h('div', { class: 'mp-next' }, unlocked <= 5 && clearedCount < 5 ? `다음 목표: ${STAGES[unlocked - 1].name}` : '모든 스테이지를 정복했어요!'),
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
    EventBus.emit(Events.MAP_FOCUS, { index, then: () => void navigate('intro', { stageId: st.id }) });
  }
}
