import { Screen } from '../Screen';
import { h, icon } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate } from '../../Game';
import { getStage, DIFFICULTY_LABEL, DIFFICULTY_RULES } from '../../data/stages';
import { getEnemy } from '../../data/enemies';
import { portraitUrl } from '../../data/characters';
import type { StageId } from '../../types';
import { AudioManager } from '../../systems/AudioManager';
import { fmt } from '../../util/dom';
import { commonTopBar } from '../TopBar';

export class IntroScreen extends Screen<{ stageId: StageId }> {
  constructor() {
    super('intro');
  }

  protected render(data: { stageId: StageId }) {
    const st = getStage(data.stageId);
    const save = SaveSystem.get();
    const diff = save.profile.difficulty;
    const rule = DIFFICULTY_RULES[diff];
    const best = save.records.bestScoreByStage[st.id];
    const fails = save.progress.fails?.[st.id] ?? 0;
    const assist = !!save.progress.assist?.[st.id];
    const stars = save.progress.stageStars[st.id] ?? 0;

    const panel = h(
      'div',
      { class: 'panel intro-panel' },
      h('div', { class: 'panel-title green' }, `STAGE ${st.index}`),
      h('div', { class: 'intro-stage-num' }, st.subtitle),
      h('div', { class: 'intro-name' }, st.name),
      h('div', { class: 'intro-focus' }, `학습 목표 · ${st.goal}`),
      h('div', { class: 'intro-block' }, h('h4', {}, icon('flag'), '오늘의 미션'), h('div', { class: 'intro-mission' }, st.mission)),
      h(
        'div',
        { class: 'intro-block' },
        h('h4', {}, '등장 몬스터'),
        h(
          'div',
          { class: 'intro-enemies' },
          [...new Set(st.enemies)].map((id) => {
            const e = getEnemy(id);
            return h('div', { class: 'intro-enemy' }, h('img', { src: portraitUrl(e.sheet), alt: e.name }), e.name);
          }),
        ),
      ),
      h(
        'div',
        { class: 'intro-block' },
        h('h4', {}, icon('target'), '난이도'),
        h(
          'div',
          { class: 'intro-diff' },
          h('span', { class: 'badge' }, h('span', { class: 'badge-icon' }, icon('bolt')), DIFFICULTY_LABEL[diff].name),
          h('span', { class: 'muted' }, st.mode === 'letter' ? '편지 6문장 · 시간제한 없음' : st.mode === 'telegram' ? `전보 3문장 · 위험 지점까지 280m (약 ${fmt.time(Math.round(140 * rule.timeMul))})` : `제한 시간 ${fmt.time(Math.round(st.timeLimitSec * rule.timeMul))} · ${st.mode === 'wave' ? `몬스터 ${st.targets}마리` : st.mode === 'race' ? '1000m 달리기' : st.mode === 'boss' ? '보스 3페이즈' : `낱말 ${st.targets}개`}`),
        ),
      ),
      h(
        'div',
        { class: 'intro-block' },
        h('h4', {}, icon('trophy'), '보상'),
        h(
          'div',
          { class: 'intro-rewards' },
          h('span', { class: 'intro-reward' }, '★ 클리어'),
          h('span', { class: 'intro-reward' }, '★★ 정확도 90%'),
          h('span', { class: 'intro-reward' }, `★★★ 정확도 95% + ${fmt.time(st.goalTimeSec)} 안에 또는 ${st.goalCombo}콤보`),
          best ? h('span', { class: 'intro-reward' }, `내 최고 점수 ${fmt.int(best)}점 · `, h('span', { class: 'stars stars-sm' }, [1, 2, 3].map((i) => h('span', { class: `star ${i <= stars ? 'on' : ''}` }, '★')))) : null,
        ),
      ),
      fails >= 3 || assist
        ? h(
            'div',
            { class: 'intro-block intro-assist' },
            h('h4', {}, icon('heart'), '도움 모드'),
            h('div', { class: 'intro-diff' }, h('span', { class: 'muted' }, assist ? '켜져 있어요: 시간이 넉넉하고 적이 느려요' : `${fails}번 도전했어요. 도움 모드를 켜면 시간이 넉넉해지고 적이 느려져요`), h('button', { class: `btn btn-sm ${assist ? 'btn-gray' : 'btn-sky'}`, onclick: () => { AudioManager.sfx('click'); save.progress.assist ??= {}; save.progress.assist[st.id] = !assist; SaveSystem.save(); this.show({ stageId: st.id }); } }, assist ? '도움 모드 끄기' : '도움 모드 켜기')),
          )
        : null,
      h(
        'div',
        { class: 'intro-actions' },
        h('button', { class: 'btn btn-gray btn-md', onclick: () => { AudioManager.sfx('click'); void navigate('worldmap', { focusIndex: st.index }); } }, '← 지도로'),
        h('button', { class: `btn btn-primary btn-lg ${st.playable ? '' : 'disabled'}`, onclick: () => { AudioManager.sfx('go'); void navigate('battle', { stageId: st.id }); } }, '전투 시작!'),
      ),
    );
    this.el.append(panel);
    this.el.append(
      h(
        'div',
        { class: 'panel panel-glass intro-tip' },
        h('b', {}, icon('book'), ' 타자 팁 · '),
        st.index <= 2
          ? '화면에 보이는 낱말을 그대로 입력하고 '
          : '띄어쓰기와 문장부호까지 똑같이 입력하고 ',
        h('span', { class: 'kbd' }, 'Enter'),
        st.index <= 2 ? ' 또는 ' : ' 를 누르면 공격! ',
        st.index <= 2 ? h('span', { class: 'kbd' }, 'Space') : '',
        st.index <= 2 ? ' 를 누르면 공격! 글자가 완성되면 자동으로도 날아가요. 틀려도 괜찮아요, 정확하게 다시!' : '틀려도 괜찮아요, 정확하게 다시!',
      ),
    );
    this.el.append(commonTopBar());
  }
}
