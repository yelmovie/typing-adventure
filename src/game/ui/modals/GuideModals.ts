import { h, icon } from '../../util/dom';
import { AudioManager } from '../../systems/AudioManager';
import { ABOUT, STORY, STUDENT_GUIDE, TEACHER_GUIDE } from '../../data/about';
import { chunkItems, pagedContent, type ContentPage } from '../PagedContent';
import { open, closeModal, closeBtn } from './ModalHost';
import { popupCopy } from './BasicModals';

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
  // 성취기준 원문은 한 줄이 길어 2줄씩 나눠야 915×412 에서도 스크롤 없이 들어간다(popup-fit).
  if (kind === 'teacher') pages.push(...chunkItems(ABOUT.standards, 2).map(group => ({ title: popupCopy('관련 성취기준', 'Learning standards'), content: h('div', { class: 'guide-page-copy' }, group.map(line => h('p', {}, line))) })));
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
