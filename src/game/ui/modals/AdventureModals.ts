import { h, icon, type IconName } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { AudioManager } from '../../systems/AudioManager';
import { navigate } from '../../Game';
import { type DailyKind, todayKey, shiftDay, streakOf, streakDots } from '../../systems/DailySystem';
import type { SaveData } from '../../types';
import { REPLAY_GOALS, replayProgress, replayTitle } from '../../systems/ReplaySystem';
import { STAGES } from '../../data/stages';
import { getLanguage } from '../../i18n/Locale';
import { journeyFor, journeyGoal, journeyProgress } from '../../data/worldJourney';
import { createOpeningPlayer } from '../OpeningPlayer';
import { chunkItems, pagedContent, type ContentPage } from '../PagedContent';
import { open, closeModal, closeBtn } from './ModalHost';
import { popupCopy } from './BasicModals';

/** 출석 스트릭 칩: "3일 연속 모험 중 · 최고 5일" (홈 주인공 블록과 오늘의 도전 모달이 같이 쓴다) */
export function streakChip(save: SaveData = SaveSystem.get(), today = todayKey()): HTMLElement {
  const en = getLanguage() === 'en';
  const s = streakOf(save);
  const active = s.count > 0 && s.last === today;
  const pending = s.count > 0 && s.last === shiftDay(today, -1);
  const main = active ? (en ? `${s.count}-day streak` : `${s.count}일 연속 모험 중`)
    : pending ? (en ? `${s.count}-day streak · keep it going today` : `${s.count}일 연속 · 오늘도 이어가자`)
    : s.best > 0 ? (en ? 'Start a new streak today' : '오늘부터 새 연속 도전')
    : (en ? 'Your first attendance stamp is waiting' : '오늘 첫 출석 도장을 찍어 보자');
  const best = s.best > 0 ? (en ? ` · best ${s.best} days` : ` · 최고 ${s.best}일`) : '';
  return h('span', { class: `streak-chip ${active ? 'is-active' : ''}`, 'data-no-translate': 'true' }, icon('bolt'), `${main}${best}`);
}

/** 최근 7일 출석 점(오래된 날 → 오늘). 요일 글자를 넣어 어느 날인지 알 수 있게 한다. */
export function streakDotsRow(save: SaveData = SaveSystem.get(), today = todayKey()): HTMLElement {
  const en = getLanguage() === 'en';
  const dots = streakDots(save, today, 7);
  const weekday = (day: string) => { const [y, m, d] = day.split('-').map(Number); return (en ? 'SMTWTFS' : '일월화수목금토')[new Date(y, m - 1, d).getDay()]; };
  const stamped = dots.filter((d) => d.done).length;
  return h('div', { class: 'streak-dots', role: 'img', 'data-no-translate': 'true', 'aria-label': en ? `Last 7 days: ${stamped} stamped` : `최근 7일 출석 ${stamped}일` },
    dots.map((d) => h('span', { class: `streak-dot ${d.done ? 'done' : ''} ${d.day === today ? 'today' : ''}`, title: d.day, 'aria-hidden': 'true' }, weekday(d.day))));
}

/** 오늘의 도전 종류 선택: 단어 / 문장 / 긴 글 */
export function dailyPickModal() {
  const kinds: { kind: DailyKind; name: string; desc: string; ic: IconName }[] = [
    { kind: 'word', name: '단어', desc: '짧은 낱말 20개로 빠르게 도전해요', ic: 'bolt' },
    { kind: 'sentence', name: '문장', desc: '문장을 띄어쓰기까지 정확하게 입력해요', ic: 'target' },
    { kind: 'long', name: '긴 글', desc: '짧은 이야기를 한 문장씩 완성해요', ic: 'book' },
  ];
  const panel = h(
    'div',
    { class: 'panel modal modal-md' },
    h('div', { class: 'panel-title sky' }, icon('clock'), '오늘의 도전'),
    closeBtn(),
    h('div', { class: 'modal-body' }, '어떤 도전을 해볼까요?', h('div', { class: 'daily-streak' }, streakChip(), streakDotsRow())),
    h(
      'div',
      { class: 'daily-pick-grid' },
      kinds.map((k) =>
        h(
          'button',
          { class: 'card daily-pick-card', type: 'button', onclick: () => { AudioManager.sfx('click'); closeModal(); void navigate('battle', { stageId: 'daily', dailyKind: k.kind }); } },
          icon(k.ic, 'lg'),
          h('div', { class: 'card-name' }, k.name),
          h('div', { class: 'card-desc' }, k.desc),
        ),
      ),
    ),
  );
  open(panel);
}

/** Opening/replay never continues into the certificate flow. */
export function introMovieModal() {
  const player = createOpeningPlayer(closeModal);
  open(player.panel, undefined, player.dispose).classList.add('finale-backdrop', 'opening-backdrop');
  player.start();
  // A HomeScreen that is hidden must not close another modal opened afterwards.
  return () => { if (player.panel.isConnected) closeModal(); };
}

export function replayModal() {
  const save = SaveSystem.get(), progress = replayProgress(save);
  const language = getLanguage(), en = language === 'en';
  const journey = journeyProgress(save, language);
  const body = h('div', { class: 'replay-body' },
    h('p', { class: 'replay-title', 'data-no-translate': 'true' }, en ? `${progress.stamps} starlight stamps · choose your next route` : `${replayTitle(progress.stamps)} · 별빛 인장 ${progress.stamps}개`),
    h('p', { class: 'replay-lead', 'data-no-translate': 'true' }, en ? 'New words, connected stories. Pick a region and check your mission before starting.' : '새 낱말, 이어지는 이야기. 지역을 골라 이번 목표를 보고 출발하자.'),
    h('div', { class: 'replay-stages replay-routes' }, STAGES.map(stage => {
      const chapter = journeyFor(stage.id, language)!;
      const locked = stage.index > save.progress.unlockedStage;
      const stars = save.progress.stageStars[stage.id] ?? 0;
      const recommended = stage.id === journey.next?.id;
      return h('button', { class: `replay-route ${recommended ? 'recommended' : ''}`, type: 'button', disabled: locked,
        'data-no-translate': 'true', style: `--route-color: ${chapter.color}`,
        onclick: () => { closeModal(); void navigate('intro', { stageId: stage.id, remix: true }); } },
        h('span', { class: 'route-mark', 'aria-hidden': 'true' }, chapter.mark),
        h('span', { class: 'route-copy' },
          h('span', { class: 'route-heading' }, `${stage.index}. ${chapter.region}`, recommended ? h('small', {}, en ? 'NEXT ROUTE' : '다음 추천') : null),
          h('span', { class: 'route-description' }, locked ? (en ? 'Finish the previous region to open this path.' : '이전 지역을 완료하면 이 길이 열려.') : chapter.replay),
          h('span', { class: 'route-goal' }, locked ? (en ? 'Locked' : '잠김') : journeyGoal(stage, stars, language)),
          h('span', { class: 'route-status' }, `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · ${locked ? (en ? 'Not open yet' : '아직 열리지 않음') : (en ? 'View mission →' : '이번 미션 보기 →')}`)));
    })),
    h('details', { class: 'replay-goals-details' },
      h('summary', {}, en ? 'Starlight goals and rewards' : '별빛 인장 목표와 보상'),
      h('div', { class: 'replay-goals' }, REPLAY_GOALS.map(goal => h('div', { class: `replay-goal ${progress.completed.includes(goal.id) ? 'complete' : ''}`, 'data-no-translate': 'true' },
        h('b', {}, `${progress.completed.includes(goal.id) ? '✓ ' : ''}${en ? goal.nameEn : goal.name}`), h('p', {}, en ? goal.descEn : goal.desc)))),
      h('p', { class: 'replay-note', 'data-no-translate': 'true' }, en ? 'Each goal gives one stamp per day. Your stamps stay when you take a break. Choose any route you like.' : '목표마다 하루 한 번 인장을 받아. 쉬어도 모은 인장은 그대로야. 추천 말고 다른 길을 골라도 좋아.')));
  const routes = body.querySelector('.replay-routes')!;
  const goals = body.querySelector('.replay-goals')!;
  const note = body.querySelector('.replay-note')!;
  const lead = body.querySelector('.replay-lead')!;
  const pages: ContentPage[] = chunkItems([...routes.children] as HTMLElement[], 2).map(group => ({
    title: popupCopy('다시 모험할 지역', 'Choose a region'), content: h('div', { class: 'replay-stages replay-routes' }, group),
  }));
  pages.push(...chunkItems([...goals.children] as HTMLElement[], 2).map(group => ({
    title: popupCopy('별빛 인장 목표', 'Starlight stamp goals'), content: h('div', { class: 'replay-goals' }, group),
  })));
  pages.push({ title: popupCopy('모험 플러스 안내', 'About Adventure Plus'), content: h('div', { class: 'replay-notes-page' }, lead, note) });
  routes.remove(); body.querySelector('.replay-goals-details')?.remove();
  body.append(pagedContent(pages, { className: 'replay-pages' }).element);
  open(h('section', { class: 'panel panel-cream modal modal-lg replay-panel popup-paged' }, h('h2', { class: 'panel-title gold' }, '모험 플러스'), closeBtn(), body));
}
