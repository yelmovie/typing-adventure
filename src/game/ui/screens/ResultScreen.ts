import { Screen } from '../Screen';
import { currentDailyKind } from '../../systems/DailySystem';
import { h, fmt, icon, uiImg } from '../../util/dom';
import { navigate } from '../../Game';
import { getStage, getStageByIndex } from '../../data/stages';
import { getBadge } from '../../data/badges';
import { getCharacter, getPet } from '../../data/characters';
import type { BattleResult } from '../../types';
import { AudioManager } from '../../systems/AudioManager';
import { SaveSystem } from '../../systems/SaveSystem';
import { certificateModal, practiceModal, replayModal } from '../ModalController';
import { learningSummary } from '../LearningPanel';
import { commonTopBar } from '../TopBar';
import { getLanguage, t } from '../../i18n/Locale';
import { journeyFor } from '../../data/worldJourney';
import { scoreGuide } from '../../systems/ScoreGuide';

import { resultPages } from '../ResultPages';

export class ResultScreen extends Screen<{ result: BattleResult }> {
  private cleanups: (() => void)[] = [];
  constructor() { super('result'); }
  protected onHide() { this.cleanups.splice(0).forEach(cleanup => cleanup()); }

  protected render(data: { result: BattleResult }) {
    this.onHide();
    const r = data.result, st = getStage(r.stageId), save = SaveSystem.get();
    const next = st.index > 0 ? getStageByIndex(st.index + 1) : undefined;
    const unlockedNext = r.cleared && next && save.progress.unlockedStage >= next.index;
    const language = getLanguage(), en = language === 'en', chapter = journeyFor(st.id, language);
    const copy = (ko: string, english: string) => en ? english : ko;
    const card = (...children: (HTMLElement | string | null)[]) => h('section', { class: 'result-detail-card' }, ...children);
    const stat = (label: string, value: string, isNew: boolean) => h('div', { class: 'result-stat' },
      h('span', { class: 'lbl' }, label), h('strong', { class: 'val' }, value),
      isNew ? h('span', { class: 'new' }, copy('최고!', 'BEST')) : null);
    // 타수는 결과의 주인공: 크게 보여 주고, 지난 판과 비교해 "점점 빨라진다"는 성취감을 준다.
    // 기록은 모든 지역의 실제 플레이(입력 1개 이상)를 시간순으로 본다. 이번 판은 finalizeAndSave 가 이미 recent 에 넣었다.
    const history = (save.records.learning?.recent ?? []).filter((s) => s.source === 'game' && s.correct > 0);
    const last = history[history.length - 1];
    const isCurrent = !!last && last.stageId === r.stageId && Math.round(last.cpm) === Math.round(r.cpm);
    const past = isCurrent ? history.slice(0, -1) : history;
    const prev = past[past.length - 1];
    const cpmNow = Math.round(r.cpm);
    const delta = prev ? cpmNow - Math.round(prev.cpm) : 0;
    const trend = [...past.slice(-7).map((s) => Math.round(s.cpm)), cpmNow];
    const peak = Math.max(1, ...trend);
    const compare = r.cpm <= 0
      ? h('p', { class: 'result-cpm-compare' }, copy('낱말을 완성하면 타수가 기록돼. 다음 판에 도전!', 'Complete a word to record your speed. Try again!'))
      : !prev
        ? h('p', { class: 'result-cpm-compare' }, copy('첫 기록! 다음 판부터 얼마나 빨라졌는지 보여 줄게.', 'First record! Next time you will see how much faster you are.'))
        : h('p', { class: 'result-cpm-compare' },
          copy(`지난번 ${fmt.int(prev.cpm)}타 → `, `Last time ${fmt.int(prev.cpm)} → `),
          h('b', { class: `delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'}` }, delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '='),
          delta > 0 ? copy(' 더 빨라졌어!', ' faster!') : delta < 0 ? copy(' 다음엔 더 빨리!', ' faster next time!') : copy(' 같은 속도 · 꾸준해!', ' same speed · steady!'));
    const bars = r.cpm > 0 && trend.length > 1
      ? h('div', { class: 'result-cpm-bars', role: 'img', 'aria-label': copy(`최근 타수 ${trend.join(', ')}`, `Recent speeds ${trend.join(', ')}`) },
        ...trend.map((v, i) => h('span', { class: `bar ${i === trend.length - 1 ? 'now' : ''}`, style: `height:${Math.max(10, Math.round((v / peak) * 100))}%` })))
      : null;
    const bestLine = r.isNewCpm ? h('span', { class: 'result-cpm-best' }, copy('새로운 최고 기록!', 'NEW PERSONAL BEST!'))
      : save.records.bestCpm > 0 ? h('span', { class: 'result-cpm-best-line' }, copy(`내 최고 ${fmt.int(save.records.bestCpm)}타/분`, `My best ${fmt.int(save.records.bestCpm)} keys/min`)) : null;
    const cpmValue = h('strong', { class: 'result-cpm-value' }, fmt.int(r.cpm));
    const cpmHero = h('section', { class: `result-cpm-hero ${r.isNewCpm ? 'is-best' : ''} ${delta > 0 ? 'is-up' : ''}`, 'aria-label': copy(`이번 타수 ${fmt.int(r.cpm)}타/분`, `This run ${fmt.int(r.cpm)} keys per minute`) },
      h('div', { class: 'result-cpm-main' },
        h('span', { class: 'result-cpm-kicker' }, copy('이번 타수', 'MY SPEED')),
        cpmValue,
        h('span', { class: 'result-cpm-unit' }, copy('타/분', 'keys/min'))),
      h('div', { class: 'result-cpm-growth' }, compare, bars, bestLine));
    const stars = h('div', { class: 'stars result-stars', 'aria-label': copy(`별 ${r.stars}개`, `${r.stars} stars`) }, [1, 2, 3].map(() => h('span', { class: 'star', 'aria-hidden': 'true' }, '★')));
    const banner = h('h1', { class: `result-banner ${r.cleared ? '' : 'fail'}`, 'data-no-translate': '' },
      r.cleared ? st.index === 5 ? copy('모험 완주!', 'Adventure complete!') : st.mode === 'daily' ? copy('오늘의 도전 완료!', 'Daily challenge complete!') : copy('스테이지 성공!', 'Stage clear!') : copy('다시 도전!', 'Try again!'));
    const sub = h('p', { class: 'result-sub' }, `${r.remix ? copy('모험 플러스 · ', 'Adventure Plus · ') : ''}${st.mode === 'daily' ? '' : `STAGE ${st.index} · `}${t(st.name)}`);
    const heading = h('header', { class: 'result-heading' }, h('div', {}, sub, banner), stars);
    const overview = h('section', { class: 'result-pane result-overview', role: 'tabpanel', id: 'result-pane-0', 'aria-labelledby': 'result-tab-0', 'data-no-translate': '' },
      h('div', { class: 'result-highlight-row' },
        cpmHero,
        h('div', { class: 'journey-result-story' },
          h('span', { class: 'journey-relic-mark', 'aria-hidden': 'true', style: `--journey-color:${chapter?.color ?? '#77cf91'}` }, r.cleared ? chapter?.mark ?? '✓' : '↗'),
          h('div', {}, h('b', {}, r.cleared ? chapter ? copy(`${chapter.relic} 되찾기 성공!`, `${chapter.relic} restored!`) : copy('오늘도 한 걸음 해냈어!', 'One more step today!') : r.attemptedCount === 0 ? copy('첫 글자부터 천천히 해 보자.', 'Start slowly, one letter at a time.') : copy('해낸 만큼, 다음엔 더 멀리!', 'Build on what you completed!')),
            h('p', { class: 'result-completed' }, copy(`정확히 완성 ${r.wordsDone}개 · 고쳐서 성공 ${r.correctedCount ?? 0}개`, `${r.wordsDone} completed · ${r.correctedCount ?? 0} corrected`))))),
      h('div', { class: 'result-grid' },
        stat(copy('정확도', 'Accuracy'), r.attemptedCount === 0 ? '—' : `${fmt.pct(r.accuracy)}%`, r.isNewAccuracy),
        stat(copy('최대 콤보', 'Best combo'), String(r.maxCombo), r.isNewCombo),
        stat(copy('점수', 'Score'), fmt.int(r.score), r.isNewScore)),
      h('p', { class: 'result-star-hint' }, r.cleared ? r.stars >= 3 ? copy('정확한 입력으로 별 3개를 모았어!', 'Three stars for accurate typing!') : copy('별을 더 모으는 방법은 성장 기록에서 볼 수 있어.', 'Find your next star goal in Growth.') : r.attemptedCount === 0 ? copy('아직 입력한 기록이 없어. 다시 도전해 보자!', 'No typing yet. Ready for another try?') : copy('어려웠던 부분은 성장 기록에서 함께 연습하자.', 'Practice the tricky parts in Growth.')),
      h('p', { class: 'journey-result-next' }, r.cleared ? chapter?.next ?? copy('새 낱말로 한 번 더 도전해 보자.', 'Try again with new words.') : copy('틀려도 괜찮아. 한 글자씩 완성하면 돼.', 'Mistakes are OK. Finish one letter at a time.')));

    const learning = learningSummary(r, () => practiceModal(() => {
      if (this.el.style.display === 'none') return;
      this.show({ result: r });
      const growth = this.el.querySelector<HTMLButtonElement>('#result-tab-1');
      growth?.click(); growth?.focus({ preventScroll: true });
    }));
    // The practice activity shows the full target; this page presents the next learning step.
    learning.querySelector('.learning-example')?.remove();
    const learningBlocks: HTMLElement[] = [];
    learningBlocks.push(card(learning.querySelector('h3')!, learning.querySelector<HTMLElement>('.learning-counts')!));
    for (const child of [...learning.children]) learningBlocks.push(card(child as HTMLElement));
    learningBlocks.push(card(h('h3', {}, copy('다음 별을 향해', 'Your next star')),
      h('p', {}, r.stars >= 3 && r.cleared ? copy('별 3개 달성! 새 낱말에서도 정확하게 입력해 보자.', 'Three stars earned! Try accurate typing with new words.') : r.cleared && r.stars === 1 ? copy('정확도 90% 이상으로 완료하면 별 2개!', 'Finish with 90% accuracy for two stars.') : st.mode === 'letter' || st.mode === 'daily' ? copy('정확도 95% 이상으로 완료하면 별 3개!', 'Finish with 95% accuracy for three stars.') : copy(`별 3개: 정확도 95% 이상 + ${fmt.time(st.goalTimeSec)} 안에 또는 ${st.goalCombo}콤보로 완료.`, `Three stars: 95% accuracy + finish within ${fmt.time(st.goalTimeSec)} or reach ${st.goalCombo} combo.`))));
    scoreGuide(st, language).forEach((line, i) => learningBlocks.push(card(h('h3', {}, copy(`점수 도움 ${i + 1}`, `Scoring tip ${i + 1}`)), h('p', {}, line))));
    const learningPages = resultPages(learningBlocks, en);

    const rewards: HTMLElement[] = [];
    if (r.coins > 0) rewards.push(card(h('h3', {}, icon('coin'), copy(` 코인 +${r.coins}`, ` +${r.coins} coins`)), h('p', { class: 'result-coins' }, copy(`모두 ${fmt.int(save.progress.coins)}코인`, `${fmt.int(save.progress.coins)} coins in total`))));
    for (const name of r.newUnlocks ?? []) rewards.push(card(h('h3', {}, icon('unlock'), copy(' 새 친구!', ' New friend!')), h('p', {}, t(name))));
    if (r.newUnlocks?.length) rewards.push(card(h('button', { class: 'btn btn-sky', onclick: () => void navigate('setup', { step: 'pet' }) }, copy('새 친구와 함께하기', 'Meet your new friend'))));
    for (const title of r.newTitles ?? []) rewards.push(card(h('h3', {}, copy('새 칭호', 'New title')), h('p', {}, t(title))));
    for (const seal of r.replayRewards ?? []) rewards.push(card(h('h3', {}, copy('별빛 인장 +1', 'Starlight seal +1')), h('p', {}, t(seal))));
    for (const id of r.newBadges) { const b = getBadge(id); if (b) rewards.push(card(h('div', { class: 'result-badges' }, h('span', { class: 'badge' }, uiImg(`badge_${b.id}`, '', b.icon), `${t(b.name)} ${copy('획득!', 'earned!')}`)))); }
    if (r.ghost && r.cleared) rewards.push(card(h('h3', {}, copy('어제의 나와 달리기', 'Run with your ghost')), h('p', {}, r.beatGhost === true ? copy('어제의 나를 추월했어! 새 기록 저장.', 'You beat your ghost! New record saved.') : r.beatGhost === false ? copy('다음엔 어제의 나를 추월해 보자.', 'Try to beat your ghost next time.') : copy('첫 기록 저장! 다음엔 같이 달려.', 'First record saved! Your ghost will join you next time.'))));
    if (!rewards.length) rewards.push(card(h('h3', {}, copy('다음 모험에서 만나자!', 'See you next adventure!')), h('p', {}, copy('이번에 새로 받은 선물은 없어. 한 글자씩 도전하며 별과 친구를 모아 보자.', 'No new gifts this time. Keep typing to collect stars and friends.'))));
    if (r.cleared) rewards.push(card(h('button', { class: 'btn btn-sky', onclick: () => replayModal() }, copy('새 조합으로 다시 모험', 'Try a new adventure mix'))));
    const rewardPages = resultPages(rewards, en);
    const panes = [overview, ...[learningPages, rewardPages].map((page, i) => h('section', { class: 'result-pane', role: 'tabpanel', id: `result-pane-${i + 1}`, 'aria-labelledby': `result-tab-${i + 1}`, hidden: true }, page.el))];
    const tabs = h('div', { class: 'result-tabs', role: 'tablist', 'aria-label': copy('모험 결과', 'Adventure results') });
    const buttons: HTMLButtonElement[] = [];
    const select = (index: number) => {
      panes.forEach((pane, i) => { pane.hidden = i !== index; buttons[i].setAttribute('aria-selected', String(i === index)); buttons[i].tabIndex = i === index ? 0 : -1; });
      [learningPages, rewardPages].forEach(page => page.refresh());
    };
    [copy('이번 결과', 'Results'), copy('성장 기록', 'Growth'), copy('받은 선물', 'Rewards')].forEach((label, i) => {
      const button = h('button', { class: 'btn btn-gray', id: `result-tab-${i}`, type: 'button', role: 'tab', 'aria-controls': `result-pane-${i}`, 'aria-selected': String(i === 0), tabindex: i === 0 ? '0' : '-1', onclick: () => select(i), onkeydown: (event: KeyboardEvent) => {
        const dest = event.key === 'ArrowRight' ? (i + 1) % 3 : event.key === 'ArrowLeft' ? (i + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
        if (dest >= 0) { event.preventDefault(); select(dest); buttons[dest].focus(); }
      } }, label);
      buttons.push(button); tabs.append(button);
    });
    const actions = h('div', { class: 'result-actions' },
      st.index === 5 && r.cleared ? h('button', { class: 'btn btn-primary result-main', onclick: () => certificateModal() }, copy('완주 영상 · 인증서', 'Movie & certificate')) : null,
      h('button', { class: `btn ${r.cleared ? 'btn-sky' : 'btn-primary result-main'}`, onclick: () => { AudioManager.sfx('click'); void navigate('battle', { stageId: st.id, remix: r.remix, dailyKind: st.id === 'daily' ? currentDailyKind() : undefined }); } }, copy('바로 다시 도전', 'Play again')),
      unlockedNext ? h('button', { class: 'btn btn-primary', onclick: () => void navigate('worldmap', { focusIndex: next!.index }) }, icon('flag'), copy(' 다음 지역', ' Next region'))
        : h('button', { class: 'btn btn-gold', onclick: () => void navigate('worldmap', { focusIndex: st.index }) }, icon('pin'), copy(' 지도로', ' Map')));
    const panel = h('div', { class: 'panel panel-deep result-panel result-fit-panel' }, heading, tabs, h('div', { class: 'result-body' }, ...panes), actions);
    const cast = h('aside', { class: 'result-cast-label', 'data-no-translate': '' }, h('strong', {}, `${t(getCharacter(save.profile.characterId).name)} & ${t(getPet(save.profile.petId).name)}`), h('p', {}, copy(r.cleared ? '함께 해냈어!' : '다시 할 수 있어!', r.cleared ? 'We did it together!' : 'We can try again!')));
    this.el.append(h('div', { class: 'result-wrap result-fit' }, cast, panel), commonTopBar());
    this.cleanups.push(learningPages.dispose, rewardPages.dispose);
    // 타수가 0에서 차오르는 연출 (동작 줄이기 설정이면 바로 최종값)
    if (r.cpm > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const startAt = performance.now(), total = 900;
      let raf = 0;
      const step = (now: number) => {
        const p = Math.min(1, (now - startAt) / total), eased = 1 - Math.pow(1 - p, 3);
        cpmValue.textContent = fmt.int(Math.round(r.cpm * eased));
        if (p < 1) raf = requestAnimationFrame(step);
        else cpmValue.textContent = fmt.int(r.cpm);
      };
      raf = requestAnimationFrame(step);
      this.cleanups.push(() => cancelAnimationFrame(raf));
    }
    const starEls = stars.querySelectorAll<HTMLElement>('.star');
    for (let i = 0; i < r.stars; i++) {
      const timer = window.setTimeout(() => { starEls[i]?.classList.add('on'); AudioManager.sfx('star'); }, 400 + i * 380);
      this.cleanups.push(() => window.clearTimeout(timer));
    }
  }
}
