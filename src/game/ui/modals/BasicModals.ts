import { h } from '../../util/dom';
import { AudioManager } from '../../systems/AudioManager';
import { getLanguage } from '../../i18n/Locale';
import { pagedContent } from '../PagedContent';
import { open, closeModal, close, closeBtn } from './ModalHost';

export const popupCopy = (ko: string, en: string) => getLanguage() === 'en' ? en : ko;

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

export function toast(msg: string) {
  const root = document.getElementById('toast-root')!;
  const t = h('div', { class: 'toast' }, msg);
  root.appendChild(t);
  window.setTimeout(() => t.remove(), 2500);
}
