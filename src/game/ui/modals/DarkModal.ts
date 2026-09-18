import { h, icon, fmt } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { AudioManager } from '../../systems/AudioManager';
import { navigate } from '../../Game';
import { STAGES, DIFFICULTY_RULES } from '../../data/stages';
import { applyDarkModifier, darkDifficulty, darkStars, darkUnlocked, DARK } from '../../data/darkMode';
import { endgameUnlocked, formatSpeedrunTime, SPEEDRUN_STAGES } from '../../systems/SpeedrunSystem';
import { TELE } from '../../systems/TelegramSystem';
import { getLanguage } from '../../i18n/Locale';
import { journeyFor } from '../../data/worldJourney';
import { chunkItems, pagedContent, type ContentPage } from '../PagedContent';
import { open, closeModal, closeBtn } from './ModalHost';
import { confirmModal, popupCopy } from './BasicModals';

/**
 * 어둠의 모험(뉴게임+): 다섯 지역을 모두 완료한 뒤 여는 지역별 어려운 판.
 * 지역마다 어둠 별(보통 별과 따로)과 「도전」 버튼. 소개 화면을 거쳐 dark: true 로 전투에 들어간다.
 */
export function darkModal() {
  const save = SaveSystem.get();
  const language = getLanguage();
  const unlocked = darkUnlocked(save);
  const cleared = save.progress.darkCleared?.length ?? 0;
  const rule = DIFFICULTY_RULES[darkDifficulty(save.profile.difficulty)];
  const rows = STAGES.map((stage) => {
    const chapter = journeyFor(stage.id, language)!;
    const dark = applyDarkModifier(stage);
    const stars = darkStars(save, stage.id);
    const limit = stage.mode === 'letter' ? popupCopy('시간제한 없음 · 자물쇠 3개', 'No time limit · 3 locks')
      : stage.mode === 'telegram' ? popupCopy(`열차 ${fmt.time(Math.round((TELE.dist / (TELE.speed * DARK.speedMul)) * rule.timeMul))} · 속도 ×${DARK.speedMul}`, `Train ${fmt.time(Math.round((TELE.dist / (TELE.speed * DARK.speedMul)) * rule.timeMul))} · speed ×${DARK.speedMul}`)
      : popupCopy(`제한 ${fmt.time(Math.round(dark.timeLimitSec * rule.timeMul))} · 속도 ×${DARK.speedMul}`, `Limit ${fmt.time(Math.round(dark.timeLimitSec * rule.timeMul))} · speed ×${DARK.speedMul}`);
    const go = h('button', { type: 'button', class: `btn btn-md ${stars > 0 ? 'btn-gray' : 'btn-primary'} dark-route-go`, disabled: !unlocked, 'data-no-translate': 'true',
      onclick: () => { AudioManager.sfx('go'); closeModal(); void navigate('intro', { stageId: stage.id, dark: true }); } },
      stars > 0 ? popupCopy('다시 도전', 'Try again') : popupCopy('도전', 'Challenge'));
    return h('div', { class: `dark-route ${stars > 0 ? 'cleared' : ''}`, 'data-no-translate': 'true', style: `--route-color: ${chapter.color}` },
      h('span', { class: 'dark-route-mark', 'aria-hidden': 'true' }, chapter.mark),
      h('span', { class: 'dark-route-copy' },
        h('span', { class: 'dark-route-heading' }, `${stage.index}. ${chapter.region}`),
        h('span', { class: 'dark-route-meta' }, limit),
        h('span', { class: 'dark-route-stars', 'aria-label': popupCopy(`어둠 별 ${stars}개`, `${stars} dark stars`) }, `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, h('small', {}, stars > 0 ? popupCopy(' 어둠 모드 완료', ' Dark clear') : popupCopy(' 아직 어둠 별 없음', ' No dark stars yet')))),
      go);
  });
  const lead = h('p', { class: 'dark-lead', 'data-no-translate': 'true' }, unlocked
    ? popupCopy(`같은 지역, 더 짧은 시간(×${DARK.timeMul})과 더 빠른 적(×${DARK.speedMul}). 어둠 별은 보통 별과 따로 모여. 완료 ${cleared}/5`, `Same regions, shorter time (×${DARK.timeMul}) and faster foes (×${DARK.speedMul}). Dark stars are kept apart from normal stars. Cleared ${cleared}/5`)
    : popupCopy('다섯 지역의 빛을 모두 되찾으면 어둠의 모험이 열려.', 'Restore all five lights to open the dark adventure.'));
  const note = h('p', { class: 'dark-note', 'data-no-translate': 'true' },
    popupCopy('도움 모드와 기초 난이도는 어둠 모드에 적용되지 않아(표준 이상). 코인·배지는 보통 판처럼 받아. 힘들면 언제든 지도로 돌아가도 괜찮아.', 'Assist mode and the Beginner rules do not apply in dark mode (Standard or above). Coins and badges are earned as usual. You can go back to the map at any time.'));
  const pages: ContentPage[] = chunkItems(rows, 2).map((group) => ({ title: popupCopy('어둠의 지역', 'Dark regions'), content: h('div', { class: 'dark-routes' }, ...group) }));
  pages[pages.length - 1].content.append(note);
  const body = h('div', { class: 'dark-body' }, lead, pagedContent(pages, { className: 'dark-pages' }).element);
  open(h('section', { class: 'panel panel-deep modal modal-lg dark-panel popup-paged' }, h('h2', { class: 'panel-title purple' }, icon('lock'), ' ', popupCopy('어둠의 모험', 'Dark adventure')), closeBtn(), body));
}

/** 스피드런 확인: 규칙 3줄과 최고 기록을 보여 주고 출발하면 1지역부터 speedrun: true 로 들어간다. */
export async function speedrunModal() {
  const save = SaveSystem.get();
  if (!endgameUnlocked(save.progress)) return;
  const best = save.records.speedrun?.bestSec ?? 0;
  const bestLine = best > 0 ? popupCopy(`내 최고 기록 ${formatSpeedrunTime(best)}`, `My best ${formatSpeedrunTime(best)}`) : popupCopy('첫 기록에 도전!', 'Set your first record!');
  const body = popupCopy(
    `${SPEEDRUN_STAGES.length}개 지역을 쉬지 않고 연속으로 달려.\n실패하면 그 지역만 다시 해(실패한 시간은 안 더해).\n기록은 다섯 지역 전투 시간의 합이야.\n${bestLine}`,
    `Run all ${SPEEDRUN_STAGES.length} regions back to back.\nIf you fail, only that region restarts (failed time is not counted).\nYour record is the sum of the five battle times.\n${bestLine}`);
  const go = await confirmModal(popupCopy('스피드런 · 전 코스 타임어택', 'Speedrun · full-course time attack'), body, popupCopy('출발!', 'Go!'), popupCopy('다음에', 'Later'));
  if (!go) return;
  AudioManager.sfx('go');
  SaveSystem.clearCheckpoint(); // 새 스피드런은 이전 중간 저장을 이어가지 않는다
  void navigate('battle', { stageId: 'stage_1', speedrun: true });
}
