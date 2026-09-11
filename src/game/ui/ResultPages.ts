import { h } from '../util/dom';
import { t } from '../i18n/Locale';

/** Fill the available space with whole cards, then shrink the window to that page. */
export function resultPages(blocks: HTMLElement[], en: boolean) {
  const content = h('div', { class: 'result-page-content' });
  const count = h('span', { role: 'status', 'aria-live': 'polite', 'data-no-translate': '' });
  let pages: HTMLElement[][] = [], index = 0, alive = true;
  const show = () => {
    const focused = document.activeElement;
    content.replaceChildren(...(pages[index] ?? []));
    count.textContent = `${index + 1} / ${Math.max(1, pages.length)}`;
    previous.disabled = index === 0;
    next.disabled = index >= pages.length - 1;
    controls.hidden = pages.length <= 1;
    content.style.height = 'auto';
    if (!controls.hidden && focused === next && next.disabled) previous.focus({ preventScroll: true });
    else if (!controls.hidden && focused === previous && previous.disabled) next.focus({ preventScroll: true });
  };
  const previous = h('button', { class: 'btn btn-gray', type: 'button', 'data-result-page-prev': '', 'aria-label': en ? 'Previous details' : '앞 내용', onclick: () => { if (index > 0) { index--; show(); } } }, en ? 'Previous' : '이전');
  const next = h('button', { class: 'btn btn-sky', type: 'button', 'data-result-page-next': '', 'aria-label': en ? 'Next details' : '다음 내용', onclick: () => { if (index < pages.length - 1) { index++; show(); } } }, en ? 'Next' : '다음');
  const controls = h('div', { class: 'result-page-nav' }, previous, count, next);
  const el = h('div', { class: 'result-pages' }, content, controls);
  for (const block of blocks) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) walker.currentNode.textContent = t(walker.currentNode.textContent ?? '');
  }
  const refresh = () => {
    if (!alive || !el.isConnected || !el.getClientRects().length) return;
    const panel = el.closest<HTMLElement>('.result-fit-panel');
    if (!panel) return;
    const css = getComputedStyle(panel);
    const chrome = [...panel.children].filter(child => !child.classList.contains('result-body'))
      .reduce((sum, child) => sum + (child as HTMLElement).offsetHeight, 0);
    controls.hidden = false;
    const capacity = 1080 - panel.offsetTop - 36 - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)
      - chrome - parseFloat(css.rowGap) * 3 - controls.offsetHeight - 12;
    content.style.height = `${Math.max(120, capacity)}px`;
    pages = []; let page: HTMLElement[] = [];
    content.replaceChildren();
    for (const block of blocks) {
      content.append(block);
      if (page.length && content.scrollHeight > content.clientHeight + 1) {
        pages.push(page); page = []; content.replaceChildren(block);
      }
      page.push(block);
    }
    if (page.length) pages.push(page);
    index = Math.min(index, Math.max(0, pages.length - 1));
    show();
  };
  let lastWidth = 0;
  const observer = new ResizeObserver(() => {
    if (el.clientWidth !== lastWidth) { lastWidth = el.clientWidth; refresh(); }
  });
  observer.observe(el);
  let frame = 0;
  const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(refresh); };
  window.addEventListener('resize', resize);
  void document.fonts.ready.then(refresh);
  return { el, refresh, dispose: () => { alive = false; observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', resize); } };
}

