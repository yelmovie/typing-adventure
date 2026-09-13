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
import { SpeechBubble } from '../SpeechBubble';
import { playerLine, petLine, enemyLine } from '../../data/introLines';
import { EventBus, Events } from '../../EventBus';
import { RACE } from '../../systems/RaceSystem';
import { getLanguage } from '../../i18n/Locale';
import { journeyFor, journeyGoal } from '../../data/worldJourney';
import { StagePractice, stagePracticeParts, PART_LABELS } from '../../systems/StagePractice';
import { infoPagesModal, closeModal } from '../ModalController';

export class IntroScreen extends Screen<{ stageId: StageId; remix?: boolean }> {
  private bubbles: SpeechBubble[] = [];
  private offAnchors?: () => void;

  constructor() {
    super('intro');
  }

  protected render(data: { stageId: StageId; remix?: boolean }) {
    const st = getStage(data.stageId);
    const save = SaveSystem.get();
    const diff = save.profile.difficulty;
    const rule = DIFFICULTY_RULES[diff];
    const best = save.records.bestScoreByStage[st.id];
    const fails = save.progress.fails?.[st.id] ?? 0;
    const assist = !!save.progress.assist?.[st.id];
    const stars = save.progress.stageStars[st.id] ?? 0;
    const language = getLanguage(), en = language === 'en';
    const practiceReady = StagePractice.ready(st.id, language, !!data.remix);
    const practiceSkipped = st.id !== 'daily' && save.progress.skippedPracticeStages?.includes(st.id) === true;
    const practiceLabel = stagePracticeParts(st.id).map(part => PART_LABELS[part][en ? 1 : 0]).join(' · ');
    const chapter = journeyFor(st.id, language);
    const restored = save.progress.clearedStages.includes(st.id);

    // Keep the mission on the stage; optional reading has its own short pages.
    const body = h(
      'div',
      { class: 'intro-body journey-intro-body' },
      h('div', { class: 'intro-stage-num' }, st.subtitle),
      h('div', { class: 'intro-name' }, st.name),
      st.id !== 'daily' ? h('p', { class: 'intro-practice-status', 'data-no-translate': 'true' }, practiceReady
        ? practiceSkipped
          ? (en ? 'You skipped the warm-up. Start now, or practice again whenever you want.' : '연습은 건너뛰었어요. 바로 시작하거나, 원할 때 다시 연습할 수 있어요.')
          : (en ? 'You are ready. Jump straight into the adventure!' : '준비는 이미 끝났어요. 바로 모험을 시작해요!')
        : (en ? `First, a short warm-up: ${practiceLabel}` : `처음 한 번, 짧게 준비해요: ${practiceLabel}`)) : null,
      h('div', { class: 'journey-mechanic', 'data-no-translate': 'true' }, chapter?.mechanic ?? (en ? 'Accurate typing → your daily record' : st.goal)),
      h('div', { class: 'intro-block journey-mission', 'data-no-translate': 'true' }, h('h4', {}, icon('flag'), en ? 'Your mission' : '오늘의 미션'), h('div', { class: 'intro-mission' }, chapter ? data.remix ? chapter.replay : chapter.mission : en ? 'Complete today’s words carefully and build your record.' : st.mission)),
      chapter ? h('div', { class: 'journey-relic', 'data-no-translate': 'true', style: `--journey-color: ${chapter.color}` },
        h('span', { class: 'journey-relic-mark', 'aria-hidden': 'true' }, chapter.mark),
        h('span', {}, h('small', {}, en ? restored ? 'Light to protect' : 'Light to recover' : restored ? '다시 지킬 빛' : '되찾을 빛'), h('b', {}, chapter.relic))) : null,
      h('details', { class: 'journey-details intro-details' },
      h('summary', { 'data-no-translate': 'true' }, en ? 'Learning, difficulty & stars' : '학습 목표 · 난이도 · 별 조건'),
      h('div', { class: 'intro-focus' }, `학습 목표 · ${st.goal}`),
      // 몬스터와 난이도는 한 줄씩 차지할 만큼 길지 않다. 나란히 놓아 세로를 아낀다(스크롤 없이 한 창에 담기 위해)
      h(
        'div',
        { class: 'intro-block intro-row2' },
        h(
          'div',
          {},
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
          {},
          h('h4', {}, icon('target'), '난이도'),
          h(
            'div',
            { class: 'intro-diff' },
            h('span', { class: 'badge' }, h('span', { class: 'badge-icon' }, icon('bolt')), DIFFICULTY_LABEL[diff].name),
            h('span', { class: 'muted' }, st.mode === 'letter' ? '편지 6문장 · 시간제한 없음' : st.mode === 'telegram' ? `전보 3문장 · 280m (약 ${fmt.time(Math.round(140 * rule.timeMul))})` : `${fmt.time(Math.round(st.timeLimitSec * rule.timeMul))} · ${st.mode === 'wave' ? `몬스터 ${st.targets}마리` : st.mode === 'race' ? `${RACE.goal}m` : st.mode === 'boss' ? '보스 3페이즈' : `낱말 ${st.targets}개`}`),
          ),
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
          h('span', { class: 'intro-reward', 'data-no-translate': 'true' }, st.mode === 'letter' || st.mode === 'daily'
            ? (en ? '★★★ Finish with 95% accuracy · no speed requirement' : '★★★ 정확도 95%로 완료 · 속도 조건 없음')
            : (en ? `★★★ Finish with 95% accuracy + (within ${fmt.time(st.goalTimeSec)} OR ${st.goalCombo} combo)` : `★★★ 정확도 95%로 완료 + (${fmt.time(st.goalTimeSec)} 안에 또는 ${st.goalCombo}콤보)`)),
          best ? h('span', { class: 'intro-reward' }, `내 최고 점수 ${fmt.int(best)}점 · `, h('span', { class: 'stars stars-sm' }, [1, 2, 3].map((i) => h('span', { class: `star ${i <= stars ? 'on' : ''}` }, '★')))) : null,
        ),
      ),
      h('p', { class: 'journey-star-goal', 'data-no-translate': 'true' }, journeyGoal(st, stars, language)),
      ),
      fails >= 1 || assist
        ? h(
            'div',
            { class: 'intro-block intro-assist' },
            h('h4', {}, icon('heart'), '도움 모드'),
            h('div', { class: 'intro-diff' }, h('span', { class: 'muted' }, assist ? '켜져 있어요: 시간이 넉넉하고 적이 느려요' : `${fails}번 도전했어요. 도움 모드를 켜면 시간이 넉넉해지고 적이 느려져요 — 켜도 별은 그대로 받아요`), h('button', { class: `btn btn-sm ${assist ? 'btn-gray' : 'btn-sky'}`, onclick: () => { AudioManager.sfx('click'); save.progress.assist ??= {}; save.progress.assist[st.id] = !assist; SaveSystem.save(); this.show({ stageId: st.id, remix: data.remix }); } }, assist ? '도움 모드 끄기' : '도움 모드 켜기')),
          )
        : null,
    );

    const panel = h(
      'div',
      { class: 'panel intro-panel journey-intro-panel' },
      h('div', { class: 'panel-title green' }, `STAGE ${st.index}`),
      body,
      h(
        'div',
        { class: 'intro-actions' },
        h('button', { class: 'btn btn-gray btn-md', onclick: () => { AudioManager.sfx('click'); void navigate('worldmap', { focusIndex: st.index }); } }, '← 지도로'),
        !practiceReady ? h('button', { class: 'btn btn-primary btn-lg intro-practice', 'data-no-translate': 'true', onclick: () => void navigate('tutorial', { stageId: st.id, remix: data.remix }) }, en ? 'Quick warm-up' : '짧게 준비하기') : null,
        practiceReady ? h('button', { class: 'btn btn-primary btn-lg intro-battle', disabled: !st.playable, 'data-no-translate': 'true', onclick: () => { AudioManager.sfx('go'); void navigate('battle', { stageId: st.id, remix: data.remix }); } }, en ? 'Start battle!' : '전투 시작!') : null,
      ),
    );
    this.el.append(panel);
    body.querySelector('.intro-details')?.append(
      h(
        'div',
        { class: 'journey-keytip' },
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
    const details = body.querySelector<HTMLElement>('.intro-details');
    if (details) {
      const pages = [...details.children].filter(child => child.tagName !== 'SUMMARY').map(child =>
        h('div', { class: 'intro-help-pages' }, child));
      if (practiceReady && st.id !== 'daily') pages.unshift(h('div', { class: 'intro-help-pages', 'data-no-translate': 'true' },
        h('h3', {}, en ? 'Practice at your own pace' : '필요할 때 천천히 연습해요'),
        h('p', {}, practiceSkipped
          ? (en ? 'Skipping does not count as completing the lesson. You can still learn it here whenever you like.' : '건너뛰기는 연습 완료로 기록되지 않아요. 원할 때 여기서 다시 배울 수 있어요.')
          : (en ? 'Your warm-up stays complete. You can revisit the full lesson whenever you like.' : '준비 기록은 그대로예요. 헷갈리는 내용은 전체 연습으로 다시 익힐 수 있어요.')),
        h('button', { class: 'btn btn-sky', onclick: () => { closeModal(); void navigate('tutorial', { stageId: st.id, remix: data.remix, full: true }); } }, en ? 'Open full practice' : '전체 연습 열기')));
      const help = body.querySelector<HTMLElement>('.intro-assist');
      if (help) {
        help.querySelector('button')?.addEventListener('click', closeModal);
        pages.unshift(h('div', { class: 'intro-help-pages' }, help));
      }
      details.replaceWith(h('button', {
        type: 'button', class: 'btn btn-gray intro-help', 'data-no-translate': 'true',
        onclick: () => infoPagesModal(en ? 'Adventure guide' : '모험 도움말', pages),
      }, en ? 'Stars · typing tips · help' : '별 조건 · 타자 팁 · 도움 모드'));
    }
    this.el.append(commonTopBar());

    // 씬이 캐릭터를 다 세운 뒤 실제 좌표를 보내 준다. 그때 머리 위에 말풍선을 붙인다.
    this.clearBubbles();
    const layer = h('div', { class: 'intro-bubbles' });
    this.el.append(layer);
    this.offAnchors?.();
    const onAnchors = (d: { anchors: { who: string; x: number; y: number }[] }) => this.showBubbles(layer, d.anchors, st.id, save.profile.characterId, save.profile.petId);
    EventBus.on(Events.INTRO_ANCHORS, onAnchors);
    this.offAnchors = () => EventBus.off(Events.INTRO_ANCHORS, onAnchors);
  }

  /**
   * 캐릭터 → 펫 → 몬스터 순서로 한 명씩 말한다. 말풍선이 서로 덮지 않게
   * 이미 놓인 것과 가로로 겹치면 그만큼 위로 올린다.
   */
  private showBubbles(layer: HTMLElement, anchors: { who: string; x: number; y: number }[], stageId: StageId, characterId: string, petId: string) {
    this.clearBubbles();
    const placed: { x: number; y: number }[] = [];
    let order = 0;
    for (const a of anchors) {
      const text = a.who === 'player' ? playerLine(characterId, stageId) : a.who === 'pet' ? petLine(petId) : enemyLine(a.who);
      if (!text) continue;
      // 앞서 놓인 말풍선과 가로로 가까우면(≈말풍선 폭) 한 칸 위로 비켜 세운다
      let y = a.y - 12;
      for (const p of placed) if (Math.abs(p.x - a.x) < 330 && Math.abs(p.y - y) < 130) y = p.y - 130;
      placed.push({ x: a.x, y });
      const tone = a.who === 'player' ? 'hero' : a.who === 'pet' ? 'pet' : 'foe';
      // 사라지게 두면 먼저 말한 캐릭터의 말풍선이 없어져 넷이 함께 보이질 않는다. 화면을 뜰 때까지 남긴다.
      this.bubbles.push(new SpeechBubble(layer, { x: a.x, y, text, delay: 200 + order * 1100, tone }));
      order++;
    }
  }

  private clearBubbles() {
    for (const b of this.bubbles) b.destroy();
    this.bubbles = [];
  }

  /** 화면을 벗어나면 타이머·구독을 정리한다 — 남으면 다음 화면에서 말풍선이 뒤늦게 뜬다 */
  protected onHide() {
    this.clearBubbles();
    this.offAnchors?.();
    this.offAnchors = undefined;
  }
}
