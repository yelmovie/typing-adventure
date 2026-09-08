import { Screen } from '../Screen';
import { h, fmt, icon, uiImg } from '../../util/dom';
import { navigate } from '../../Game';
import { getStage, getStageByIndex } from '../../data/stages';
import { getBadge } from '../../data/badges';
import type { BattleResult } from '../../types';
import { AudioManager } from '../../systems/AudioManager';
import { SaveSystem } from '../../systems/SaveSystem';
import { storyModal } from '../ModalController';

export class ResultScreen extends Screen<{ result: BattleResult }> {
  constructor() {
    super('result');
  }

  protected render(data: { result: BattleResult }) {
    const r = data.result;
    const st = getStage(r.stageId);
    const next = st.index > 0 ? getStageByIndex(st.index + 1) : undefined;
    const unlockedNext = r.cleared && next && SaveSystem.get().progress.unlockedStage >= next.index;

    const stat = (lbl: string | HTMLElement, val: string | HTMLElement, isNew: boolean) => h('div', { class: 'result-stat' }, h('div', { class: 'lbl' }, lbl), h('div', { class: 'val' }, val), isNew ? h('div', { class: 'new' }, 'NEW 최고!') : null);

    const stars = h('div', { class: 'stars stars-lg result-stars' }, [1, 2, 3].map((i) => h('span', { class: 'star', style: { animationDelay: `${0.25 + i * 0.35}s` } }, '★')));

    const panel = h(
      'div',
      { class: `panel ${r.cleared ? '' : 'panel-deep'} result-panel` },
      h('div', { class: `result-banner ${r.cleared ? '' : 'fail'}` }, r.cleared ? (st.index === 5 ? '🌟 세상에 글자를 되찾았다!' : st.mode === 'daily' ? '📅 오늘의 도전 완료!' : '🎉 STAGE CLEAR!') : '💦 다시 도전!'),
      h('div', { class: 'result-sub' }, st.mode === 'daily' ? `${st.name} · ${r.dailyNew ? '오늘 최고 기록 갱신!' : '오늘 기록에 못 미쳤어요'}` : `STAGE ${st.index} · ${st.name}${r.cleared ? '' : r.failReason === 'time' ? ' · 시간이 다 됐어요' : ' · HP가 0이 됐어요'}`),
      stars,
      h('div', { class: 'result-star-hint' }, st.mode === 'daily' ? '내일도 새 낱말 20개가 기다려요' : r.cleared ? (r.stars >= 3 ? '완벽해요! 별 3개 달성!' : r.stars === 2 ? `별 3개 조건: 정확도 95% + ${fmt.time(st.goalTimeSec)} 안에 클리어 또는 ${st.goalCombo}콤보` : '별 2개 조건: 정확도 90% 이상') : `낱말 ${r.wordsDone}개를 물리쳤어요. 다시 도전하면 더 잘할 수 있어요!`),
      h(
        'div',
        { class: 'result-grid' },
        stat(h('span', {}, icon('bolt'), ' 타수'), h('span', {}, fmt.int(r.cpm), h('small', {}, ' 타/분')), r.isNewCpm),
        stat(h('span', {}, icon('target'), ' 정확도'), h('span', {}, fmt.pct(r.accuracy), h('small', {}, '%')), r.isNewAccuracy),
        stat('🔥 최대 콤보', String(r.maxCombo), r.isNewCombo),
        stat(h('span', {}, icon('trophy'), ' 점수'), fmt.int(r.score), r.isNewScore),
      ),
      r.mistakes?.length
        ? h('div', { class: 'result-mistakes' }, h('div', { class: 'rm-title' }, r.cleared ? '📝 다시 연습하면 좋은 낱말' : '📝 여기서 막혔어요 — 다음엔 이 낱말부터'), h('div', { class: 'rm-list' }, r.mistakes.slice(0, 8).map((m) => h('span', { class: 'badge locked' }, m)), r.mistakes.length > 8 ? h('span', { class: 'muted' }, ` 외 ${r.mistakes.length - 8}개`) : null))
        : r.cleared
          ? h('div', { class: 'result-mistakes' }, h('div', { class: 'rm-title' }, '📝 틀린 낱말 없음 — 완벽한 손끝!'))
          : null,
      r.newUnlocks?.length ? h('div', { class: 'result-coins' }, `🔓 새로 합류: ${r.newUnlocks.join(', ')}`) : null,
      r.newTitles?.length ? h('div', { class: 'result-coins' }, `🏷 획득: ${r.newTitles.join(', ')}`) : null,
      r.ghost && r.cleared ? h('div', { class: 'result-coins' }, r.beatGhost === true ? '👻 어제의 나를 추월했어요! 새 기록 저장' : r.beatGhost === false ? '👻 어제의 나가 더 빨랐어요. 다음엔 추월!' : '👻 첫 기록 저장! 다음 판엔 어제의 나가 같이 달려요') : null,
      r.coins > 0 ? h('div', { class: 'result-coins' }, icon('coin'), ` 코인 +${r.coins} 획득! (모두 ${fmt.int(SaveSystem.get().progress.coins)}코인)`) : null,
      h(
        'div',
        { class: 'result-badges' },
        r.newBadges.length
          ? r.newBadges.map((id) => {
              const b = getBadge(id);
              return b ? h('span', { class: 'badge anim-pop' }, h('span', { class: 'badge-icon' }, uiImg(`badge_${b.id}`, '', b.icon)), `${b.name} 획득!`) : null;
            })
          : h('span', { class: 'none' }, r.cleared ? '새 배지는 없지만 기록은 저장됐어요' : '기록은 최대 콤보만 반영돼요'),
      ),
      h(
        'div',
        { class: 'result-actions' },
        st.index === 5 && r.cleared ? h('button', { class: 'btn btn-gold btn-md', onclick: () => { AudioManager.sfx('click'); storyModal('ending'); } }, '🌟 엔딩 이야기') : null,
        h('button', { class: 'btn btn-sky btn-md', onclick: () => { AudioManager.sfx('click'); void navigate('intro', { stageId: st.id }); } }, '🔁 다시 도전'),
        unlockedNext
          ? h('button', { class: 'btn btn-primary btn-md', onclick: () => { AudioManager.sfx('click'); void navigate('worldmap', { focusIndex: next!.index }); } }, `▶ 다음 스테이지 (${next!.name})`)
          : h('button', { class: 'btn btn-gold btn-md', onclick: () => { AudioManager.sfx('click'); void navigate('worldmap', { focusIndex: st.index }); } }, '🗺 지도로'),
        h('button', { class: 'btn btn-gray btn-md', onclick: () => { AudioManager.sfx('click'); void navigate('home'); } }, '🏠 홈으로'),
      ),
    );
    this.el.append(h('div', { class: 'result-wrap' }, panel));

    // 별 순차 점등
    const starEls = stars.querySelectorAll<HTMLElement>('.star');
    for (let i = 0; i < r.stars; i++) {
      window.setTimeout(() => {
        starEls[i].classList.add('on');
        AudioManager.sfx('star');
      }, 400 + i * 380);
    }
    if (unlockedNext && !SaveSystem.get().progress.clearedStages.includes(next!.id)) {
      window.setTimeout(() => {
        const t = h('div', { class: 'toast' }, `🔓 ${next!.name} 해금!`);
        document.getElementById('toast-root')!.append(t);
        window.setTimeout(() => t.remove(), 2500);
      }, 1600);
    }
  }
}
