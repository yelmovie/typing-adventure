import { h, icon } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { AudioManager } from '../../systems/AudioManager';
import { navigate } from '../../Game';
import { chunkItems, pagedContent, type ContentPage } from '../PagedContent';
import { open, closeModal, closeBtn } from './ModalHost';
import { confirmModal, popupCopy } from './BasicModals';
import { guideModal, storyModal, aboutModal } from './GuideModals';
import { practiceModal } from './RecordModals';
import { classroomModal } from './ClassroomModal';

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
