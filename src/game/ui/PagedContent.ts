import { h } from '../util/dom';
import { getLanguage } from '../i18n/Locale';

export interface ContentPage { title: string; content: HTMLElement }

/** Keep every page mounted so fields, selections and pending progress survive paging. */
export function pagedContent(pages: ContentPage[], options: { className?: string; initialPage?: number; contents?: boolean; onPage?: (index: number) => void } = {}) {
  const en = getLanguage() === 'en';
  let index = Math.max(0, Math.min(pages.length - 1, options.initialPage ?? 0));
  const stack = h('div', { class: 'popup-page-stack' });
  const counter = h('span', { class: 'popup-page-count', role: 'status', 'aria-live': 'polite', 'data-no-translate': 'true' });
  const previous = h('button', { type: 'button', class: 'btn btn-sm btn-gray popup-page-prev', 'data-no-translate': 'true', onclick: () => show(index - 1) }, en ? '← Previous' : '← 이전');
  const next = h('button', { type: 'button', class: 'btn btn-sm btn-sky popup-page-next', 'data-no-translate': 'true', onclick: () => show(index + 1) }, en ? 'Next →' : '다음 →');
  const chapters = pages.flatMap((page, i) => !page.title || (i > 0 && pages[i - 1].title === page.title) ? [] : [{ title: page.title, index: i }]);
  const contents = options.contents && chapters.length > 1 ? h('select', {
    class: 'popup-contents-select', 'aria-label': en ? 'Go to a guide topic' : '궁금한 내용 바로 찾기',
    onchange: (event: Event) => show(Number((event.target as HTMLSelectElement).value)),
  }, chapters.map(chapter => h('option', { value: String(chapter.index) }, chapter.title))) : null;
  const contentsRow = contents ? h('label', { class: 'popup-contents' },
    h('span', { 'data-no-translate': 'true' }, en ? 'Find a topic' : '궁금한 내용'), contents) : null;
  const elements = pages.map((page, i) => {
    page.content.classList.add('popup-page-content');
    const element = h('section', { class: 'popup-page', 'aria-label': page.title, dataset: { page: String(i + 1) } },
      page.title ? h('h3', { class: 'popup-page-title' }, page.title) : null, page.content);
    stack.append(element);
    return element;
  });
  const pagination = h('nav', { class: 'popup-pagination', 'aria-label': en ? 'Pages' : '쪽 넘기기', 'data-no-translate': 'true' }, previous, counter, next);
  const element = h('div', { class: `popup-pages ${options.className ?? ''}` }, contentsRow, stack, pagination);
  function show(value: number) {
    const focused = document.activeElement;
    index = Math.max(0, Math.min(pages.length - 1, value));
    elements.forEach((page, i) => { page.hidden = i !== index; });
    previous.disabled = index === 0;
    next.disabled = index === pages.length - 1;
    counter.textContent = `${index + 1} / ${pages.length}`;
    if (contents) contents.value = String([...chapters].reverse().find(chapter => chapter.index <= index)?.index ?? 0);
    pagination.hidden = pages.length <= 1;
    // A disabled paging button loses focus in Chromium. Keep keyboard users in
    // the dialog when the first or last page disables the button they pressed.
    if (element.isConnected && pages.length > 1) {
      if (focused === next && next.disabled) previous.focus({ preventScroll: true });
      else if (focused === previous && previous.disabled) next.focus({ preventScroll: true });
    }
    options.onPage?.(index);
  }
  show(index);
  return { element, show, get index() { return index; } };
}

export function chunkItems<T>(items: T[], count: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / count) }, (_, i) => items.slice(i * count, (i + 1) * count));
}
