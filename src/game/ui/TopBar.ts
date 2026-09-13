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

/** 소리 버튼: BGM·효과음을 따로 켜고 음량을 바로 조절한다 (모든 화면·전투 HUD 공용). */
export function soundButton(): HTMLElement {
  ensureGlobalClose();
  const en = SaveSystem.get().settings.language === 'en';
  const soundSrc = () => `./assets/ui/icon_${AudioManager.isMuted() ? 'sound_off' : 'sound_on'}.webp`;
  const btnIcon = icon(AudioManager.isMuted() ? 'sound_off' : 'sound_on');
  const stateButtons: Array<{ key: 'bgm' | 'sfx'; button: HTMLButtonElement }> = [];
  const refreshMute = () => {
    btnIcon.src = soundSrc();
    for (const { key, button } of stateButtons) {
      const on = SaveSystem.get().settings[key];
      button.textContent = en ? on ? 'On' : 'Off' : on ? '켜짐' : '꺼짐';
      button.classList.toggle('btn-primary', on);
      button.classList.toggle('btn-gray', !on);
      button.setAttribute('aria-pressed', String(on));
    }
  };

  const toggleRow = (label: string, key: 'bgm' | 'sfx') => {
    const button = h('button', { type: 'button', class: 'btn btn-sm sound-state' }) as HTMLButtonElement;
    stateButtons.push({ key, button });
    button.addEventListener('click', () => {
      const on = !SaveSystem.get().settings[key];
      const volumeKey = key === 'bgm' ? 'bgmVolume' : 'sfxVolume';
      const volume = SaveSystem.get().settings[volumeKey] ?? (key === 'bgm' ? 0.7 : 0.9);
      SaveSystem.setSettings({ [key]: on, ...(on && volume <= 0.01 ? { [volumeKey]: key === 'bgm' ? 0.7 : 0.9 } : {}) });
      AudioManager.applySettings();
      refreshMute();
      AudioManager.sfx('click');
    });
    return h('div', { class: 'setting-row sp-row sound-toggle-row' }, h('span', {}, label), button);
  };

  const slider = (label: string, key: 'bgmVolume' | 'sfxVolume') => {
    const s = SaveSystem.get().settings;
    const input = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round((s[key] ?? 0.7) * 100)), class: 'vol', 'aria-label': label }) as HTMLInputElement;
    const val = h('span', { class: 'vol-val' }, `${input.value}%`);
    input.addEventListener('input', () => {
      const volume = Number(input.value) / 100;
      SaveSystem.setSettings({ [key]: volume, ...(volume > 0 ? { [key === 'bgmVolume' ? 'bgm' : 'sfx']: true } : {}) });
      val.textContent = `${input.value}%`;
      AudioManager.applySettings();
      refreshMute();
    });
    return h('div', { class: 'setting-row sp-row' }, h('span', {}, label), h('div', { class: 'vol-wrap' }, input, val));
  };

  const popover = h('div', { class: 'panel panel-glass sound-popover' },
    toggleRow(en ? 'Music' : '배경 음악', 'bgm'), slider(en ? 'Music volume' : '배경 음악 음량', 'bgmVolume'),
    toggleRow(en ? 'Sound effects' : '효과음', 'sfx'), slider(en ? 'Effects volume' : '효과음 음량', 'sfxVolume'));

  const btn = h('button', { type: 'button', class: 'icon-btn', title: '소리 설정', 'aria-label': '소리 설정', 'aria-expanded': 'false', onclick: (e: Event) => {
    e.stopPropagation();
    AudioManager.sfx('click');
    popover.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(popover.classList.contains('open')));
  } }, btnIcon);
  refreshMute();
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
