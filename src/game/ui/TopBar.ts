import { h, icon } from '../util/dom';
import { SaveSystem } from '../systems/SaveSystem';
import { AudioManager } from '../systems/AudioManager';
import { navigate } from '../Game';
import { settingsModal } from './ModalController';

let globalCloseBound = false;
/** 열려 있는 소리 팝오버를 바깥 클릭 시 닫는다. document 리스너는 한 번만 등록(재생성 누수 방지) */
function ensureGlobalClose() {
  if (globalCloseBound) return;
  globalCloseBound = true;
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.sound-popover.open').forEach((p) => {
      if (!p.parentElement?.contains(e.target as Node)) {
        p.classList.remove('open');
        p.parentElement?.querySelector('button[aria-expanded]')?.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

/** 소리 버튼: 작은 팝오버로 BGM·효과음 볼륨 + 음소거 (모든 화면·전투 HUD 공용) */
export function soundButton(): HTMLElement {
  ensureGlobalClose();
  const soundSrc = () => `./assets/ui/icon_${AudioManager.isMuted() ? 'sound_off' : 'sound_on'}.webp`;
  const btnIcon = icon(AudioManager.isMuted() ? 'sound_off' : 'sound_on');
  const rowIcon = icon(AudioManager.isMuted() ? 'sound_off' : 'sound_on');
  const refreshMute = () => { btnIcon.src = soundSrc(); rowIcon.src = soundSrc(); };

  const slider = (label: string, key: 'bgmVolume' | 'sfxVolume') => {
    const s = SaveSystem.get().settings;
    const input = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round((s[key] ?? 0.7) * 100)), class: 'vol', 'aria-label': label }) as HTMLInputElement;
    const val = h('span', { class: 'vol-val' }, `${input.value}%`);
    input.addEventListener('input', () => {
      SaveSystem.setSettings({ [key]: Number(input.value) / 100 });
      val.textContent = `${input.value}%`;
      AudioManager.applySettings();
      refreshMute();
    });
    return h('div', { class: 'setting-row sp-row' }, h('span', {}, label), h('div', { class: 'vol-wrap' }, input, val));
  };

  const muteRow = h(
    'div',
    { class: 'setting-row sp-row' },
    h('span', {}, '음소거'),
    h('button', {
      class: 'btn btn-sm btn-gray',
      onclick: () => { AudioManager.toggleMute(); refreshMute(); AudioManager.sfx('click'); },
    }, rowIcon, ' 켜기/끄기'),
  );

  const popover = h('div', { class: 'panel panel-glass sound-popover' }, muteRow, slider('배경 음악', 'bgmVolume'), slider('효과음', 'sfxVolume'));

  const btn = h('button', { type: 'button', class: 'icon-btn', title: '소리 설정', 'aria-label': '소리 설정', 'aria-expanded': 'false', onclick: (e: Event) => {
    e.stopPropagation();
    AudioManager.sfx('click');
    popover.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(popover.classList.contains('open')));
  } }, btnIcon);
  const wrap = h('div', { class: 'sound-pop-wrap' }, btn, popover);
  wrap.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !popover.classList.contains('open')) return;
    event.stopPropagation();
    popover.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  });
  return wrap;
}

/** 다른 곳(설정 모달 등)에서 bgm/sfx 를 껐다 켰을 때 소리 버튼 아이콘을 동기화 */
export function refreshSoundIcon(wrap: HTMLElement) {
  const src = `./assets/ui/icon_${AudioManager.isMuted() ? 'sound_off' : 'sound_on'}.webp`;
  wrap.querySelectorAll<HTMLImageElement>('img.ui-icon').forEach((img) => {
    if (img.src.includes('icon_sound_')) img.src = src;
  });
}

/**
 * 모든 화면 우상단 공통 바: 홈 + 소리 + 설정.
 * 전투처럼 나가기 전 확인이 필요한 화면은 onHome 에 직접 confirmModal → navigate 로직을 넘긴다.
 */
export function commonTopBar(opts: { onHome?: () => void; onReset?: () => void; hideHome?: boolean } = {}): HTMLElement {
  const homeBtn = h('button', { class: 'icon-btn', title: '홈으로', 'aria-label': '홈으로', onclick: () => {
    AudioManager.sfx('click');
    if (opts.onHome) opts.onHome();
    else void navigate('home');
  } }, icon('home'));

  const settingsBtn = h('button', { class: 'icon-btn', title: '설정', 'aria-label': '설정', onclick: () => {
    AudioManager.sfx('click');
    settingsModal({ onReset: opts.onReset });
  } }, icon('settings'));

  return h('div', { class: 'topbar-common' }, ...(opts.hideHome ? [] : [homeBtn]), soundButton(), settingsBtn);
}
