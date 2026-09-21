import { h, fmt, icon } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { AudioManager } from '../../systems/AudioManager';
import { todayKey } from '../../systems/DailySystem';
import { currentTitle } from '../../data/titles';
import { profileDisplayName } from '../../data/characters';
import { getLanguage } from '../../i18n/Locale';
import { createFinalePlayer } from '../FinalePlayer';
import { createPracticePanel, learningSummary } from '../LearningPanel';
import { pagedContent, type ContentPage } from '../PagedContent';
import { open, closeModal, close, closeBtn } from './ModalHost';
import { popupCopy } from './BasicModals';

/** 인증서 능력 진술: "나는 이제 ___ 할 수 있다" — 아이가 직접 고르거나 쓴다 */
const CAN_DO_CHIPS = ['받침 있는 낱말도 정확하게 칠', '문장을 띄어쓰기에 맞게 칠', '틀린 글자를 바로 찾아 고칠', '1분에 100타 넘게 칠'];

function canDoBlock(current: string): HTMLElement {
  const line = h('div', { class: 'c-cando-line' }, '나는 이제 ', h('b', {}, current || '________'), ' 수 있다.');
  const input = h('input', { class: 'input c-cando-input', type: 'text', maxlength: '24', placeholder: '직접 쓰기 (예: 문장도 안 틀리고 칠)', value: current }) as HTMLInputElement;
  const apply = (v: string) => {
    const t = v.trim().normalize('NFC');
    SaveSystem.get().profile.canDo = t;
    SaveSystem.save();
    line.replaceChildren('나는 이제 ', h('b', {}, t || '________'), ' 수 있다.');
    chips.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.choice === t)));
  };
  input.addEventListener('change', () => apply(input.value));
  const chips = h('div', { class: 'c-cando-chips' }, CAN_DO_CHIPS.map((c) => h('button', { class: 'btn btn-sm btn-sky', 'data-choice': c, 'aria-pressed': String(current === c), onclick: () => { AudioManager.sfx('click'); input.value = c; apply(c); } }, c)));
  input.setAttribute('aria-label', '내가 느낀 성장 한 문장');
  return h('div', { class: 'c-cando' }, h('div', { class: 'c-cando-title' }, '내가 느낀 성장 · 자기평가'), line, chips, input);
}

/** 완주한 모험가는 축하 영상을 거쳐 인증서로 이동한다. */
export function certificateModal() {
  if (!SaveSystem.get().progress.clearedStages.includes('stage_5')) {
    showCertificate();
    return;
  }
  const player = createFinalePlayer(profileDisplayName(SaveSystem.get().profile, getLanguage()), showCertificate);
  open(player.panel, showCertificate, player.dispose).classList.add('finale-backdrop');
  player.start();
}

/** 오늘의 인증서: 개인 기록만 (우리 반/친구 기록 없음) */
function showCertificate() {
  const save = SaveSystem.get();
  const language = getLanguage();
  const today = new Date();
  const dateStr = language === 'en'
    ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(today)
    : `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const name = profileDisplayName(save.profile, language);
  const cpm = save.records.bestCpm;
  const acc = save.records.bestAccuracy;
  const clears = save.progress.clearedStages.length;
  const praise = language === 'en'
    ? clears === 0
      ? 'Begin your first adventure to fill this certificate!'
      : acc >= 95
        ? 'Careful fingers and a true typing master’s focus!'
        : acc >= 90
          ? 'Your thoughtful practice is shining. Well done!'
          : 'Your progress shows with every try. Keep exploring!'
    :
    clears === 0
      ? '첫 모험을 떠나면 인증서가 채워져요!'
      : acc >= 95
        ? '정확한 손가락, 진짜 타자 마스터의 자세예요!'
        : acc >= 90
          ? '꼼꼼한 연습이 빛나고 있어요. 멋져요!'
          : '조금씩 성장하는 모습이 보여요. 계속 도전!';
  const title = h('div', { class: 'c-title' }, popupCopy('타이핑 모험 인증서', 'Typing Adventure Certificate'));
  const date = h('div', { class: 'c-date' }, dateStr);
  const adventurerName = h('div', { class: 'c-name' },
    h('span', { 'data-no-translate': 'true' }, language === 'en' ? `Adventurer ${name}` : `${name} 모험가`),
    h('div', { class: 'c-title-tag' }, `${popupCopy('칭호', 'Title')} · ${currentTitle(save.progress.coins ?? 0).name}`),
  );
  const completion = h('div', { class: 'c-line' },
    language === 'en'
      ? `Completed ${clears} regions in Typing Adventure.`
      : `타이핑 어드벤처에서 ${clears}개 지역을 완료했어요.`,
    h('br'),
    popupCopy('아래는 이 기기에 남긴 나의 모험 기록이에요.', 'These are the adventure records saved on this device.'),
  );
  const stats = h(
      'div',
      { class: 'c-stats' },
      h('div', {}, `${fmt.int(cpm)}`, h('small', {}, popupCopy('최고 타/분', 'Best CPM'))),
      h('div', {}, `${fmt.pct(acc)}%`, h('small', {}, popupCopy('최고 정확도', 'Best accuracy'))),
      h('div', {}, `${save.records.bestCombo}`, h('small', {}, popupCopy('최대 콤보', 'Best combo'))),
      h('div', {}, `${save.collection.badges.length}`, h('small', {}, popupCopy('획득 배지', 'Badges'))),
    );
  const todayRecord = (() => {
      const todayRecords = ['', ':sentence', ':long'].flatMap((suffix, i) => {
        const d = save.records.daily[todayKey() + suffix];
        const type = language === 'en' ? ['words', 'sentences', 'story'][i] : ['낱말', '문장', '긴 글'][i];
        return d ? [h('div', { class: 'c-line' }, language === 'en'
          ? `Today’s ${type}: ${fmt.int(d.cpm)} CPM · ${fmt.pct(d.accuracy)}% accuracy`
          : `오늘 ${type}: ${fmt.int(d.cpm)}타/분 · 정확도 ${fmt.pct(d.accuracy)}%`)] : [];
      });
      return todayRecords.length ? h('div', {}, todayRecords) : h('div', { class: 'c-line muted' }, popupCopy('오늘의 도전은 아직 안 했어요', 'No daily challenge yet today'));
    })();
  const learning = learningSummary();
  const praiseLine = h('div', { class: 'c-praise' }, praise);
  const canDo = canDoBlock(save.profile.canDo ?? '');
  const cert = h(
    'div',
    { class: `cert${language === 'en' ? ' cert-en' : ''}` },
    h('img', { class: 'certificate-art', src: './assets/ui/certificate-frame-v2.webp', alt: '', 'aria-hidden': 'true' }),
    h('div', { class: 'certificate-copy' },
      h('div', { class: 'c-kicker' }, popupCopy('별빛 기록 보관소', 'STARLIGHT ARCHIVE')),
      title,
      date,
      h('div', { class: 'certificate-rule', 'aria-hidden': 'true' }),
      adventurerName,
      stats,
    ),
    h('div', { class: 'certificate-seal', 'aria-hidden': 'true' }, popupCopy('완주', 'BRAVE')),
  );
  const panel = h('div', { class: 'panel panel-cream modal modal-md certificate-modal detail-modal', 'aria-labelledby': 'certificate-title' },
    h('div', { class: 'detail-modal-header' }, h('h2', { class: 'panel-title', id: 'certificate-title' }, icon('trophy'), popupCopy('오늘의 인증서', 'Today’s certificate')), closeBtn()),
    h('div', { class: 'detail-modal-body certificate-body', role: 'region', tabindex: '0', 'aria-label': getLanguage() === 'en' ? 'Certificate details' : '인증서 내용' }, cert),
    h('div', { class: 'modal-actions detail-modal-actions' }, h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); closeModal(); } }, popupCopy('확인', 'Confirm'))));
  panel.classList.add('popup-paged');
  const learningParts = [...learning.children] as HTMLElement[];
  const pages: ContentPage[] = [
    { title: '', content: cert },
    { title: popupCopy('오늘의 도전 기록', 'Today’s challenge records'), content: h('div', { class: 'certificate-record-page' }, completion, todayRecord, praiseLine) },
    { title: popupCopy('차곡차곡 쌓인 성장', 'Your progress'), content: h('div', { class: 'learning-summary' }, learningParts.slice(0, 3)) },
    { title: popupCopy('다음에 연습할 것', 'What to practise next'), content: h('div', { class: 'learning-summary' }, learningParts.slice(3)) },
    { title: '', content: canDo },
  ];
  const writing = canDo.querySelector<HTMLInputElement>('.c-cando-input')!;
  const writingLine = canDo.querySelector<HTMLElement>('.c-cando-line')!;
  pages.push({ title: popupCopy('내 말로 쓰기', 'Write it in your own words'), content: h('div', { class: 'certificate-writing-page' },
    writingLine,
    writing,
    h('p', { class: 'muted' }, popupCopy('다 쓰고 확인을 누르면 저장돼요.', 'Choose Confirm when you finish to save it.')),
  ) });
  panel.querySelector('.certificate-body')!.append(pagedContent(pages, { className: 'certificate-pages' }).element);
  open(panel);
}

export function practiceModal(onClosed?: () => void) {
  let notified = false;
  const afterClose = () => {
    if (notified) return;
    notified = true;
    // Let disposal save the final attempt and restore focus before rebuilding its screen.
    if (onClosed) window.queueMicrotask(onClosed);
  };
  const practice = createPracticePanel(() => close(afterClose));
  open(practice.panel, afterClose, practice.dispose);
}
