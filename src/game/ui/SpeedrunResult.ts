import { h, icon } from '../util/dom';
import type { BattleResult } from '../types';
import { formatSpeedrunTime, SPEEDRUN_STAGES } from '../systems/SpeedrunSystem';
import { journeyFor } from '../data/worldJourney';
import { getLanguage } from '../i18n/Locale';

/** 결과 화면(5지역째 클리어)에 붙는 스피드런 완주 블록: 총 시간 · 최고 기록 비교 · 지역별 시간. */
export function speedrunResultBlock(sr: NonNullable<BattleResult['speedrun']>, en: boolean): HTMLElement {
  const language = getLanguage();
  const total = formatSpeedrunTime(sr.totalSec);
  const compare = sr.prevBestSec <= 0
    ? (en ? 'First full-course record!' : '첫 완주 기록!')
    : sr.isNewBest
      ? (en ? `Best ${formatSpeedrunTime(sr.prevBestSec)} → ▲${formatSpeedrunTime(sr.prevBestSec - sr.totalSec)} faster!` : `최고 ${formatSpeedrunTime(sr.prevBestSec)} → ▲${formatSpeedrunTime(sr.prevBestSec - sr.totalSec)} 단축!`)
      : (en ? `Best ${formatSpeedrunTime(sr.prevBestSec)} · ${formatSpeedrunTime(sr.totalSec - sr.prevBestSec)} behind` : `최고 ${formatSpeedrunTime(sr.prevBestSec)} · ${formatSpeedrunTime(sr.totalSec - sr.prevBestSec)} 차이`);
  const retries = sr.retries > 0 ? (en ? ` · retries ${sr.retries}` : ` · 재도전 ${sr.retries}회`) : '';
  return h('section', { class: `result-speedrun ${sr.isNewBest ? 'is-best' : ''}`, 'data-no-translate': 'true', 'aria-label': en ? `Speedrun total ${total}` : `스피드런 총 시간 ${total}` },
    h('div', { class: 'result-speedrun-head' },
      h('span', { class: 'result-speedrun-kicker' }, icon('bolt'), en ? ' SPEEDRUN COMPLETE' : ' 스피드런 완주'),
      h('strong', { class: 'result-speedrun-total' }, en ? `Total ${total}` : `총 ${total}`),
      h('span', { class: `result-speedrun-compare ${sr.isNewBest ? 'up' : ''}` }, compare + retries)),
    h('ul', { class: 'result-speedrun-splits' }, sr.stageSec.map((sec, i) => {
      const id = SPEEDRUN_STAGES[i];
      return h('li', {}, h('span', { class: 'lbl' }, `${i + 1}. ${id ? journeyFor(id, language)?.region ?? id : ''}`), h('b', {}, formatSpeedrunTime(sec)));
    })));
}

/** 어둠 모드 결과 리본(부제 앞에 붙는 짧은 표시) */
export function darkResultRibbon(cleared: boolean, en: boolean): HTMLElement {
  return h('span', { class: `result-dark-ribbon ${cleared ? 'cleared' : ''}`, 'data-no-translate': 'true' }, icon('lock'), cleared ? (en ? ' Dark mode clear · ' : ' 어둠 모드 클리어 · ') : (en ? ' Dark mode · ' : ' 어둠 모드 · '));
}
