import { h, clear } from '../../util/dom';
import { AudioManager } from '../../systems/AudioManager';

const root = () => document.getElementById('modal-root')!;

let modalCleanup: (() => void) | undefined;

export function open(panel: HTMLElement, onClose?: () => void, onDispose?: () => void) {
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

export function close(onClose?: () => void) {
  closeModal();
  onClose?.();
}

export function closeBtn(onClose?: () => void) {
  return h('button', { class: 'modal-close', 'aria-label': '닫기', onclick: () => { AudioManager.sfx('click'); close(onClose); } }, '✕');
}
