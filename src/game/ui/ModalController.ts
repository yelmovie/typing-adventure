import { h, clear, fmt, uiImg, icon, type IconName } from '../util/dom';
import { SaveSystem } from '../systems/SaveSystem';
import { AudioManager } from '../systems/AudioManager';
import { navigate, currentScreen } from '../Game';
import { BADGES } from '../data/badges';
import { todayKey, type DailyKind } from '../systems/DailySystem';
import { currentTitle, TITLES, DECORS, unlockMet2 } from '../data/titles';
import { ABOUT, STORY, STUDENT_GUIDE, TEACHER_GUIDE } from '../data/about';
import { ENEMIES } from '../data/enemies';
import { PETS, CHARACTERS, portraitUrl, profileDisplayName } from '../data/characters';
import { ITEMS } from '../data/items';
import { createFinalePlayer } from './FinalePlayer';
import { createOpeningPlayer } from './OpeningPlayer';
import { createPracticePanel, learningSummary } from './LearningPanel';
import { ClassroomReady, type ClassroomStatus } from '../systems/ClassroomReady';
import { REPLAY_GOALS, replayProgress, replayTitle } from '../systems/ReplaySystem';
import { STAGES } from '../data/stages';
import { getLanguage } from '../i18n/Locale';
import { journeyFor, journeyGoal, journeyProgress } from '../data/worldJourney';
import { chunkItems, pagedContent, type ContentPage } from './PagedContent';

const popupCopy = (ko: string, en: string) => getLanguage() === 'en' ? en : ko;

const root = () => document.getElementById('modal-root')!;
let modalCleanup: (() => void) | undefined;

function open(panel: HTMLElement, onClose?: () => void, onDispose?: () => void) {
  closeModal();
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const background = document.getElementById('ui-root');
  const previousInert = background?.inert ?? false;
  const customFocus = panel.classList.contains('finale-player');
  if (!customFocus && background) background.inert = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  if (!panel.hasAttribute('aria-labelledby')) panel.setAttribute('aria-label', panel.querySelector('.panel-title')?.textContent ?? '모험 안내');
  const keys = (event: KeyboardEvent) => {
    if (customFocus || !panel.isConnected || event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(onClose); return; }
    if (event.key !== 'Tab') return;
    const targets = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter((e) => e.getClientRects().length > 0);
    const first = targets[0], last = targets[targets.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (!panel.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', keys, true);
  const back = h('div', { class: 'modal-backdrop' }, panel);
  back.addEventListener('click', (e) => {
    if (e.target === back) close(onClose);
  });
  root().appendChild(back);
  modalCleanup = () => {
    document.removeEventListener('keydown', keys, true);
    onDispose?.();
    if (!customFocus && background) background.inert = previousInert;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const first = panel.querySelector<HTMLElement>('button, input');
  first?.focus();
  return back;
}

export function closeModal() {
  const cleanup = modalCleanup;
  modalCleanup = undefined;
  cleanup?.();
  clear(root());
}
function close(onClose?: () => void) {
  closeModal();
  onClose?.();
}

function closeBtn(onClose?: () => void) {
  return h('button', { class: 'modal-close', 'aria-label': '닫기', onclick: () => { AudioManager.sfx('click'); close(onClose); } }, '✕');
}

export function alertModal(title: string, body: string | HTMLElement, okText = '확인'): Promise<void> {
  return new Promise((resolve) => {
    const panel = h(
      'div',
      { class: 'panel modal' },
      h('div', { class: 'panel-title' }, title),
      h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); close(resolve); } }, okText)),
    );
    open(panel, resolve);
  });
}

export function confirmModal(title: string, body: string, okText = '예', cancelText = '아니요', options: { destructive?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const cancel = h('button', { type: 'button', class: `btn ${options.destructive ? 'btn-gray' : 'btn-red'}`, onclick: () => { AudioManager.sfx('click'); closeModal(); resolve(false); } }, cancelText);
    const panel = h(
      'div',
      { class: 'panel modal' },
      h('div', { class: 'panel-title' }, title),
      h('div', { class: 'modal-body', id: 'confirm-message' }, body),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { type: 'button', class: `btn ${options.destructive ? 'btn-red' : 'btn-primary'}`, onclick: () => { AudioManager.sfx('click'); closeModal(); resolve(true); } }, okText),
        cancel,
      ),
    );
    panel.setAttribute('aria-describedby', 'confirm-message');
    open(panel, () => resolve(false));
    if (options.destructive) cancel.focus({ preventScroll: true });
  });
}

/** Content supplied by a screen uses the same pages and modal close behavior. */
export function infoPagesModal(title: string, pages: HTMLElement[]) {
  const panel = h('section', { class: 'panel modal modal-lg popup-paged info-pages-panel' },
    h('h2', { class: 'panel-title sky' }, title), closeBtn(),
    pagedContent(pages.map(content => ({ title: '', content }))).element,
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-gold', onclick: () => closeModal() }, '확인')));
  open(panel);
}

/** Additional home actions are a short window, so the home never becomes a scroll area. */
export function homeMenuModal(content: HTMLElement, onDispose?: () => void) {
  const panel = h('section', { class: 'panel modal home-menu-dialog' },
    h('h2', { class: 'panel-title sky', 'data-no-translate': 'true' }, popupCopy('모험 메뉴', 'Adventure menu')),
    closeBtn(), content);
  open(panel, undefined, onDispose);
}

/** 설정 모달: BGM / 효과음 / 화면 흔들림 / 키보드 가이드 / 초기화 */
export function settingsModal(opts: { onReset?: () => void } = {}) {
  const s = SaveSystem.get().settings;
  const row = (label: string, key: keyof typeof s) => {
    const t = h('button', { type: 'button', class: `toggle ${s[key] ? 'on' : ''}`, role: 'switch', 'aria-label': label, 'aria-checked': String(s[key]) });
    t.addEventListener('click', () => {
      const v = !SaveSystem.get().settings[key];
      SaveSystem.setSettings({ [key]: v });
      t.classList.toggle('on', v);
      t.setAttribute('aria-checked', String(v));
      AudioManager.applySettings();
      AudioManager.sfx('click');
    });
    return h('div', { class: 'setting-row' }, h('span', {}, label), t);
  };
  const slider = (label: string, key: 'bgmVolume' | 'sfxVolume') => {
    const input = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round((s[key] ?? 0.7) * 100)), class: 'vol', 'aria-label': label }) as HTMLInputElement;
    const val = h('span', { class: 'vol-val' }, `${input.value}%`);
    input.addEventListener('input', () => {
      SaveSystem.setSettings({ [key]: Number(input.value) / 100 });
      val.textContent = `${input.value}%`;
      AudioManager.applySettings();
    });
    input.addEventListener('change', () => AudioManager.sfx('click'));
    return h('div', { class: 'setting-row' }, h('span', {}, label), h('div', { class: 'vol-wrap' }, input, val));
  };
  const cleared = SaveSystem.get().progress.clearedStages.includes('stage_5');
  const panel = h(
    'div',
    { class: 'panel modal modal-sm' },
    h('div', { class: 'panel-title purple' }, icon('settings'), '설정'),
    closeBtn(),
    h(
      'div',
      { class: 'settings-body' },
      row('배경 음악', 'bgm'),
      slider('　　볼륨', 'bgmVolume'),
      row('효과음', 'sfx'),
      slider('　　볼륨', 'sfxVolume'),
      row('화면 흔들림', 'screenShake'),
      row('키보드 가이드', 'showKeyboardGuide'),
    ),
    h(
      'div',
      { class: 'setting-links' },
      h('button', { class: 'btn btn-sm btn-sky', onclick: () => { AudioManager.sfx('click'); guideModal('student'); } }, icon('book'), ' 학생 가이드'),
      h('button', { class: 'btn btn-sm btn-purple', onclick: () => { AudioManager.sfx('click'); guideModal('teacher'); } }, icon('book'), ' 교사용 가이드'),
      h('button', { class: 'btn btn-sm btn-sky', onclick: () => classroomModal() }, '수업 준비 · 오프라인'),
      h('button', { class: 'btn btn-sm btn-sky', disabled: !SaveSystem.hasSave(), onclick: () => { closeModal(); void navigate('setup', { step: 'pet' }); } }, '모험가·친구 변경'),
      h('button', { class: 'btn btn-sm btn-sky', onclick: () => practiceModal() }, '나의 교정 연습'),
      h('button', { class: 'btn btn-sm btn-gray', onclick: () => { AudioManager.sfx('click'); storyModal('prologue'); } }, '프롤로그 다시보기'),
      h('button', { class: 'btn btn-sm btn-gray', disabled: !cleared, onclick: () => { AudioManager.sfx('click'); storyModal('ending'); } }, cleared ? icon('star_on') : icon('lock'), ' 엔딩 다시보기'),
      h('button', { class: 'btn btn-sm btn-gold', onclick: () => { AudioManager.sfx('click'); aboutModal(); } }, '정보·크레딧'),
    ),
    h(
      'div',
      { class: 'modal-actions' },
      h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); closeModal(); } }, '확인'),
      h(
        'button',
        {
          class: 'btn btn-red btn-md',
          onclick: async () => {
            AudioManager.sfx('click');
            closeModal();
            const ok = await confirmModal('전체 초기화', '모든 진행 기록과 설정이 지워져요.\n정말 처음부터 다시 시작할까요?', popupCopy('모두 지우기', 'Erase everything'), popupCopy('돌아가기', 'Go back'), { destructive: true });
            if (ok) {
              if (SaveSystem.reset()) { opts.onReset?.(); void navigate('home'); }
            }
          },
        },
        '기록 초기화',
      ),
    ),
  );
  panel.classList.add('settings-panel', 'popup-paged');
  const controls = panel.querySelector('.settings-body')!;
  controls.classList.add('settings-page');
  const links = panel.querySelector('.setting-links')!;
  const actions = panel.querySelector('.modal-actions')!;
  const reset = actions.querySelector('.btn-red')!;
  const recordPage = h('div', { class: 'settings-record-page' },
    h('p', { 'data-no-translate': 'true' }, popupCopy('처음부터 다시 하고 싶을 때만 기록을 지워요.', 'Erase your records only when you want to start over.')), reset);
  const helpPages: ContentPage[] = chunkItems([...links.children] as HTMLElement[], 4).map((group, index) => ({
      title: index === 0 ? popupCopy('모험 도움말', 'Adventure help') : popupCopy('연습과 다시보기', 'Practice and replays'),
      content: h('div', { class: 'setting-links' }, group),
    }));
  links.remove();
  const pages = pagedContent([
    { title: popupCopy('소리와 화면', 'Sound and display'), content: controls as HTMLElement },
    ...helpPages,
    { title: popupCopy('기록 관리', 'Manage records'), content: recordPage },
  ], { className: 'settings-pages' });
  panel.insertBefore(pages.element, actions);
  open(panel);
}

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

/** 학생·교사 가이드 */
export function guideModal(kind: 'student' | 'teacher') {
  const lines = kind === 'student' ? STUDENT_GUIDE : TEACHER_GUIDE;
  const panel = h(
    'div',
    { class: 'panel modal modal-lg' },
    h('div', { class: `panel-title ${kind === 'student' ? 'sky' : 'purple'}` }, icon('book'), kind === 'student' ? '학생 가이드 · 이렇게 놀아요' : '교사용 가이드'),
    closeBtn(),
    // '◆' 로 시작하는 줄은 소제목. 긴 목록을 눈으로 훑을 수 있게 갈라 준다
    h('div', { class: 'guide-list' }, lines.map((l) => (l.startsWith('◆') ? h('h5', { class: 'guide-h' }, l.slice(1).trim()) : h('p', {}, l)))),
    kind === 'teacher'
      ? h('div', { class: 'guide-std' }, h('b', {}, '관련 성취기준(요약) '), h('span', { class: 'muted' }, ABOUT.standards.join(' · ')))
      : null,
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); closeModal(); } }, '확인')),
  );
  panel.classList.add('guide-panel', 'popup-paged');
  const sections: { title: string; lines: string[] }[] = [];
  for (const line of lines) {
    if (line.startsWith('◆')) sections.push({ title: line.slice(1).trim(), lines: [] });
    else sections[sections.length - 1]?.lines.push(line);
  }
  const pages: ContentPage[] = sections.flatMap(section => chunkItems(section.lines, 2).map(group => ({
    title: section.title, content: h('div', { class: 'guide-page-copy' }, group.map(line => h('p', {}, line))),
  })));
  if (kind === 'teacher') pages.push({ title: popupCopy('관련 성취기준', 'Learning standards'), content: h('div', { class: 'guide-page-copy' }, ABOUT.standards.map(line => h('p', {}, line))) });
  panel.querySelector('.guide-list')?.replaceWith(pagedContent(pages, { className: 'guide-pages', contents: true }).element);
  panel.querySelector('.guide-std')?.remove();
  // The fixed close control already ends reading; use this space for direct topic navigation.
  panel.querySelector('.modal-actions')?.remove();
  open(panel);
}

/** 프롤로그 / 엔딩 이야기 */
export function storyModal(kind: 'prologue' | 'ending', onDone?: () => void) {
  const lines = kind === 'prologue' ? STORY.prologue : STORY.ending;
  const body = h('div', { class: 'story-body' });
  let i = 0;
  const showNext = () => {
    if (i >= lines.length) return;
    const previousFocused = document.activeElement === previous;
    const p = h('p', { class: 'anim-fade-in' }, lines[i++]);
    body.replaceChildren(p);
    count.textContent = `${i} / ${lines.length}`;
    previous.disabled = i <= 1;
    btn.textContent = i >= lines.length ? (kind === 'prologue' ? '모험 시작!' : '확인') : '다음';
    if (previousFocused && previous.disabled) btn.focus({ preventScroll: true });
  };
  const count = h('span', { class: 'story-page-count', role: 'status', 'aria-live': 'polite' });
  const previous = h('button', { class: 'btn btn-gray btn-md', 'data-no-translate': 'true', onclick: () => { i = Math.max(0, i - 2); showNext(); } }, popupCopy('이전', 'Previous'));
  const btn = h('button', { class: 'btn btn-gold btn-md', onclick: () => { AudioManager.sfx('click'); if (i < lines.length) showNext(); else { closeModal(); onDone?.(); } } }, '다음');
  // 두 번째 이후로는 이야기를 이미 읽었다. 한 줄씩 넘기게 강요하지 않는다.
  const skipBtn = h('button', { class: 'btn btn-gray btn-md', onclick: () => { AudioManager.sfx('click'); closeModal(); onDone?.(); } }, '건너뛰기 ▶▶');
  const panel = h(
    'div',
    { class: 'panel panel-cream modal story-modal modal-lg' },
    h('div', { class: 'panel-title' }, kind === 'prologue' ? '사라진 글자들' : '되찾은 글자들'),
    h('img', { class: 'story-art', src: './assets/backgrounds/bg_world_map.webp', alt: '숲, 도시, 사막, 열차, 성채로 이어지는 모험 지도', draggable: 'false' }),
    closeBtn(onDone),
    body,
    h('div', { class: 'modal-actions story-actions' }, skipBtn, previous, count, btn),
  );
  open(panel, onDone);
  showNext();
}

/** 정보·크레딧·저작권 */
export function aboutModal() {
  const panel = h(
    'div',
    { class: 'panel modal modal-lg' },
    h('div', { class: 'panel-title gold' }, `${ABOUT.appName} ${ABOUT.version}`),
    closeBtn(),
    h(
      'div',
      { class: 'about-body' },
      h('p', {}, h('b', {}, '기획·제작 '), ABOUT.author),
      h('p', {}, h('b', {}, '제공 '), ABOUT.platform),
      h('p', {}, h('b', {}, '교육 내용 출처 '), ABOUT.sources.join(' / ')),
      h('p', {}, h('b', {}, '생성형 AI 고지 '), '배경·캐릭터·아이콘은 ChatGPT 이미지 생성, 완주 영상은 Higgsfield, 배경 음악은 Suno로 제작했습니다. 효과음은 자체 합성입니다. 글꼴 등 외부 자료의 권리는 각 권리자에게 있습니다.'),
      h('p', {}, h('b', {}, '저작권 '), `ⓒ ${ABOUT.year} ${ABOUT.author}. 이 앱의 화면 캡처·일러스트·음원 등 자체 제작 자료의 무단 복제·재배포·전용·상업적 이용을 금지합니다. 이용 조건은 ${ABOUT.platform} 이용약관을 따릅니다.`),
      h('p', { class: 'muted' }, '기록은 이 기기의 브라우저에만 저장되며 서버로 전송되지 않습니다. 개인정보를 수집하지 않습니다.'),
    ),
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); closeModal(); } }, '확인')),
  );
  panel.classList.add('about-panel', 'popup-paged');
  const body = panel.querySelector('.about-body')!;
  const paragraphs = [...body.children] as HTMLElement[];
  body.replaceWith(pagedContent([
    { title: popupCopy('만든 사람과 교육 내용', 'Creators and learning sources'), content: h('div', { class: 'about-page-copy' }, paragraphs.slice(0, 3)) },
    { title: popupCopy('사용한 자료', 'Artwork and media'), content: h('div', { class: 'about-page-copy' }, paragraphs[3]) },
    { title: popupCopy('이용 조건과 기록 보관', 'Terms and saved records'), content: h('div', { class: 'about-page-copy' }, paragraphs.slice(4)) },
  ], { className: 'about-pages' }).element);
  open(panel);
}

/** 이미지가 없으면(404) 글자 CSS 아이콘으로 대체 — portraitUrl 기준(몬스터·펫) */
function portraitWithFallback(sheet: string, alt: string, fallback: string): HTMLElement {
  const img = h('img', { class: 'ui-icon xl', src: portraitUrl(sheet), alt }) as HTMLImageElement;
  img.addEventListener('error', () => img.replaceWith(h('span', {}, fallback)), { once: true });
  return img;
}

/** 도감: 고정된 제목·탭 아래에서 카드 목록만 스크롤한다. */
export function collectionModal() {
  const save = SaveSystem.get();
  const pageByTab: Record<string, number> = {};
  const cardsPerPage = () => window.innerWidth >= 1500 && window.innerHeight >= 800 ? 6 : window.innerWidth >= 1100 && window.innerHeight >= 650 ? 4 : 2;
  let activeTab = 'monsters', pageSize = cardsPerPage();
  let equipmentChanged = false;
  const refreshEquipment = () => {
    const screen = currentScreen();
    if (equipmentChanged && (screen === 'home' || screen === 'worldmap')) void navigate(screen);
  };
  const body = h('div', { class: 'collection-body detail-modal-body', role: 'region', tabindex: '0', 'aria-label': getLanguage() === 'en' ? 'Collection entries' : '도감 목록' });
  const tabs = h('div', { class: 'coll-tabs' });
  const render = (tab: string) => {
    clear(body);
    body.scrollTop = 0;
    [...tabs.children].forEach((c) => c.classList.toggle('btn-gold', (c as HTMLElement).dataset.tab === tab));
    [...tabs.children].forEach((c) => c.classList.toggle('btn-gray', (c as HTMLElement).dataset.tab !== tab));
    if (tab === 'monsters') {
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          ENEMIES.map((e) => {
            const seen = save.collection.enemiesSeen.includes(e.id);
            return h(
              'div',
              { class: `coll-item ${seen ? '' : 'locked'}` },
              h('div', { class: `coll-icon ${seen ? '' : 'dim'}` }, portraitWithFallback(e.sheet, e.name, seen ? e.name.slice(0, 1) : '?')),
              h('div', { class: 'n' }, seen ? e.name : '???'),
              h('div', { class: 'coll-desc' }, seen ? e.desc : '아직 만나지 못했어요'),
            );
          }),
        ),
      );
    } else if (tab === 'badges') {
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          BADGES.map((b) => {
            const has = save.collection.badges.includes(b.id);
            return h('div', { class: `coll-item ${has ? '' : 'locked'}` }, h('div', { class: `coll-icon ${has ? '' : 'dim'}` }, uiImg(`badge_${b.id}`, 'xl', b.icon)), h('div', { class: 'n' }, b.name), h('div', { class: 'coll-desc' }, b.desc));
          }),
        ),
      );
    } else if (tab === 'pets') {
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          [...CHARACTERS, ...PETS].map((p) => {
            const open = 'passive' in p ? save.collection.petsUnlocked.includes(p.id) : (save.collection.charactersUnlocked ?? CHARACTERS.map((c) => c.id)).includes(p.id);
            const isPet = 'passive' in p;
            const selected = isPet ? save.profile.petId === p.id : save.profile.characterId === p.id;
            return h('div', { class: `coll-item ${open ? '' : 'locked'}`, dataset: { equipment: p.id }, tabindex: '-1' }, h('img', { class: 'ui-icon xl', src: portraitUrl(p.sheet), alt: p.name }), h('div', { class: 'n' }, open ? p.name : '???'), h('div', { class: 'coll-desc' }, open ? p.desc : [icon('lock'), ` ${p.unlock?.desc ?? ''}`]),
              open ? h('button', { class: 'btn btn-sm btn-sky coll-equip', disabled: selected, onclick: () => {
                SaveSystem.setProfile(save.profile.name, isPet ? save.profile.characterId : p.id, isPet ? p.id : save.profile.petId, save.profile.difficulty);
                equipmentChanged = true;
                paginate('pets'); toast(`${p.name}와 함께해요!`);
                body.querySelector<HTMLElement>(`[data-equipment="${p.id}"]`)?.focus({ preventScroll: true });
              } }, selected ? '함께하는 중' : '함께하기') : null);
          }),
        ),
      );
    } else if (tab === 'items') {
      body.appendChild(h('div', { class: 'coll-note' }, '몬스터를 물리치면 무작위로 떨어져요'));
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          ITEMS.map((it) => h(
            'div',
            { class: 'coll-item' },
            h('div', { class: 'coll-icon' }, it.img ? uiImg(it.img, 'xl', it.name.slice(0, 1)) : h('span', { class: `css-icon ci-${it.cssIcon}` })),
            h('div', { class: 'n' }, it.name),
            h('div', { class: 'coll-desc' }, it.desc),
          )),
        ),
      );
    } else {
      // 칭호·장식
      const coins = save.progress.coins ?? 0;
      body.appendChild(h('div', { class: 'coll-note' }, `지금 코인 ${coins} · 보물 낱말·비밀방·정확도 보상으로 모아요`));
      const titleItems = TITLES.map((t, i) => ({ name: t.name, coins: t.coins, img: undefined as string | undefined, label: String(i + 1) }));
      const decorItems = DECORS.map((d) => ({ name: d.name, coins: d.coins, img: `item_${d.id}`, label: d.icon }));
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          [...titleItems, ...decorItems].map((x) => {
            const has = unlockMet2(coins, x.coins);
            return h(
              'div',
              { class: `coll-item ${has ? '' : 'locked'}` },
              h('div', { class: `coll-icon ${has ? '' : 'dim'}` }, x.img ? uiImg(x.img, 'xl', x.label) : h('span', {}, x.label)),
              h('div', { class: 'n' }, x.name),
              h('div', { class: 'coll-desc' }, has ? '열림' : `코인 ${x.coins}`),
            );
          }),
        ),
      );
    }
  };
  const paginate = (tab: string) => {
    activeTab = tab;
    render(tab);
    const grid = body.querySelector('.coll-grid');
    if (!grid) return;
    const cards = [...grid.children] as HTMLElement[];
    const perPage = cardsPerPage();
    pageSize = perPage;
    const pages = chunkItems(cards, perPage).map(group => ({ title: '', content: h('div', {
      class: 'coll-grid popup-card-grid', style: `--popup-card-columns: ${perPage === 6 ? 3 : 2}`,
    }, group) }));
    grid.replaceWith(pagedContent(pages, { className: 'collection-pages', initialPage: pageByTab[tab] ?? 0, onPage: index => { pageByTab[tab] = index; } }).element);
  };
  for (const [key, label] of [
    ['monsters', '몬스터'],
    ['badges', '배지'],
    ['pets', '친구들'],
    ['items', '아이템'],
    ['titles', '칭호·장식'],
  ]) {
    tabs.appendChild(h('button', { class: 'btn btn-sm btn-gray', dataset: { tab: key }, onclick: () => { AudioManager.sfx('click'); paginate(key); } }, label));
  }
  const panel = h('div', { class: 'panel modal modal-xl collection-modal detail-modal popup-paged', 'aria-labelledby': 'collection-title' },
    h('div', { class: 'detail-modal-header' }, h('h2', { class: 'panel-title sky', id: 'collection-title' }, icon('book'), '모험 도감'), closeBtn(refreshEquipment)), tabs, body);
  const resize = () => { if (panel.isConnected && cardsPerPage() !== pageSize) paginate(activeTab); };
  window.addEventListener('resize', resize);
  open(panel, refreshEquipment, () => window.removeEventListener('resize', resize));
  paginate('monsters');
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
    h('div', { class: 'modal-body' }, '어떤 도전을 해볼까요?'),
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

/** Opening/replay never continues into the certificate flow. */
export function introMovieModal() {
  const player = createOpeningPlayer(closeModal);
  open(player.panel, undefined, player.dispose).classList.add('finale-backdrop', 'opening-backdrop');
  player.start();
  // A HomeScreen that is hidden must not close another modal opened afterwards.
  return () => { if (player.panel.isConnected) closeModal(); };
}

/** 오늘의 인증서: 개인 기록만 (우리 반/친구 기록 없음) */
function showCertificate() {
  const save = SaveSystem.get();
  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const name = profileDisplayName(save.profile, getLanguage());
  const cpm = save.records.bestCpm;
  const acc = save.records.bestAccuracy;
  const clears = save.progress.clearedStages.length;
  const praise =
    clears === 0
      ? '첫 모험을 떠나면 인증서가 채워져요!'
      : acc >= 95
        ? '정확한 손가락, 진짜 타자 마스터의 자세예요!'
        : acc >= 90
          ? '꼼꼼한 연습이 빛나고 있어요. 멋져요!'
          : '조금씩 성장하는 모습이 보여요. 계속 도전!';
  const cert = h(
    'div',
    { class: 'cert' },
    h('div', { class: 'c-title' }, '오늘의 모험 인증서'),
    h('div', { class: 'c-date' }, dateStr),
    h('div', { class: 'c-name' }, h('span', { 'data-no-translate': 'true' }, getLanguage() === 'en' ? `Adventurer ${name}` : `${name} 모험가`), h('div', { class: 'c-title-tag' }, `칭호 · ${currentTitle(save.progress.coins ?? 0).name}`)),
    h('div', { class: 'c-line' }, `타이핑 어드벤처에서 ${clears}개 지역을 완료했어요.`, h('br'), '아래는 이 기기에 남긴 나의 모험 기록이에요.'),
    h(
      'div',
      { class: 'c-stats' },
      h('div', {}, `${fmt.int(cpm)}`, h('small', {}, '최고 타/분')),
      h('div', {}, `${fmt.pct(acc)}%`, h('small', {}, '최고 정확도')),
      h('div', {}, `${save.records.bestCombo}`, h('small', {}, '최대 콤보')),
      h('div', {}, `${save.collection.badges.length}`, h('small', {}, '획득 배지')),
    ),
    (() => {
      const todayRecords = ['', ':sentence', ':long'].flatMap((suffix, i) => {
        const d = save.records.daily[todayKey() + suffix];
        return d ? [h('div', { class: 'c-line' }, `오늘 ${['낱말', '문장', '긴 글'][i]}: ${fmt.int(d.cpm)}타/분 · 정확도 ${fmt.pct(d.accuracy)}%`)] : [];
      });
      return todayRecords.length ? h('div', {}, todayRecords) : h('div', { class: 'c-line muted' }, '오늘의 도전은 아직 안 했어요');
    })(),
    learningSummary(),
    h('div', { class: 'c-praise' }, praise),
    canDoBlock(save.profile.canDo ?? ''),
  );
  const panel = h('div', { class: 'panel panel-cream modal modal-md certificate-modal detail-modal', 'aria-labelledby': 'certificate-title' },
    h('div', { class: 'detail-modal-header' }, h('h2', { class: 'panel-title', id: 'certificate-title' }, icon('trophy'), '오늘의 인증서'), closeBtn()),
    h('div', { class: 'detail-modal-body certificate-body', role: 'region', tabindex: '0', 'aria-label': getLanguage() === 'en' ? 'Certificate details' : '인증서 내용' }, cert),
    h('div', { class: 'modal-actions detail-modal-actions' }, h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); closeModal(); } }, '확인')));
  panel.classList.add('popup-paged');
  const parts = [...cert.children] as HTMLElement[];
  const learningParts = [...parts[6].children] as HTMLElement[];
  cert.replaceChildren(parts[0], parts[1], parts[2], parts[4]);
  const pages: ContentPage[] = [
    { title: '', content: cert },
    { title: popupCopy('오늘의 도전 기록', 'Today’s challenge records'), content: h('div', { class: 'certificate-record-page' }, parts[3], parts[5], parts[7]) },
    { title: popupCopy('차곡차곡 쌓인 성장', 'Your progress'), content: h('div', { class: 'learning-summary' }, learningParts.slice(0, 3)) },
    { title: popupCopy('다음에 연습할 것', 'What to practise next'), content: h('div', { class: 'learning-summary' }, learningParts.slice(3)) },
    { title: '', content: parts[8] },
  ];
  const writing = parts[8].querySelector<HTMLInputElement>('.c-cando-input')!;
  const writingLine = parts[8].querySelector<HTMLElement>('.c-cando-line')!;
  pages.push({ title: popupCopy('내 말로 쓰기', 'Write it in your own words'), content: h('div', { class: 'certificate-writing-page' },
    writingLine,
    writing,
    h('p', { class: 'muted' }, popupCopy('다 쓰고 확인을 누르면 저장돼요.', 'Choose Confirm when you finish to save it.')),
  ) });
  panel.querySelector('.certificate-body')!.append(pagedContent(pages, { className: 'certificate-pages' }).element);
  open(panel);
}

export function toast(msg: string) {
  const root = document.getElementById('toast-root')!;
  const t = h('div', { class: 'toast' }, msg);
  root.appendChild(t);
  window.setTimeout(() => t.remove(), 2500);
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

export function classroomModal() {
  const abort = new AbortController();
  const status = h('p', { role: 'status', 'aria-live': 'polite' }, '수업 자료를 확인하고 있어요.');
  const progress = h('progress', { class: 'classroom-progress', max: '100', value: '0', 'aria-label': '수업 자료 준비 진행률' });
  const size = h('p', { class: 'classroom-size' });
  const start = h('button', { class: 'btn btn-primary', disabled: true }, '자료 다운로드');
  const verify = h('button', { class: 'btn btn-sky' }, '준비 상태 확인');
  const update = (s: ClassroomStatus) => {
    if (abort.signal.aborted) return;
    status.textContent = s.message;
    progress.value = s.total ? Math.round(100 * s.completed / s.total) : 0;
    size.textContent = s.total ? `${s.completed}/${s.total}개 · ${(s.bytes / 1e6).toFixed(1)} / ${(s.totalBytes / 1e6).toFixed(1)}MB · 완주 영상 포함` : '';
    start.disabled = s.state === 'downloading' || s.state === 'unsupported';
    verify.disabled = s.state === 'downloading';
    start.textContent = s.state === 'ready' ? '자료 다시 확인' : s.completed ? '남은 자료 이어 받기' : '수업 자료 다운로드';
  };
  start.onclick = () => { void ClassroomReady.prepare(update, abort.signal).then(update); };
  verify.onclick = () => { void ClassroomReady.verify().then(update); };
  const panel = h('section', { class: 'panel modal modal-md' }, h('h2', { class: 'panel-title sky' }, '수업 준비 · 오프라인'), closeBtn(),
    h('div', { class: 'classroom-status' }, h('p', {}, '인터넷이 연결되어 있을 때 한 번 준비해 주세요. 완료하면 이 브라우저에서 모든 지역을 이용할 수 있어요.'), status, progress, size),
    h('div', { class: 'modal-actions' }, start, verify, h('button', { class: 'btn btn-gray', onclick: () => closeModal() }, '닫기')));
  open(panel, undefined, () => abort.abort());
  void ClassroomReady.inspect().then(update);
}
