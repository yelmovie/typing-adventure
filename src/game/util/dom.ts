// 아주 작은 DOM 헬퍼
type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
}

export const fmt = {
  int: (n: number) => Math.round(n).toLocaleString('ko-KR'),
  pct: (n: number) => `${Math.round(n * 10) / 10}`,
  time: (sec: number) => {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  },
};

export type IconName = 'home' | 'settings' | 'sound_on' | 'sound_off' | 'book' | 'trophy' | 'star_on' | 'star_off' | 'lock' | 'unlock' | 'heart' | 'bolt' | 'clock' | 'target' | 'pin' | 'flag' | 'coin' | 'key_back' | 'key_enter' | 'key_up';
/** public/assets/ui/{name}.webp 픽셀 아이콘(배지·아이템·지도 핀). 없으면 fallback 이모지 텍스트 */
export function uiImg(name: string, cls = '', fallback = ''): HTMLElement {
  const img = h('img', { class: `ui-icon ${cls}`, src: `./assets/ui/${name}.webp`, alt: '', draggable: 'false' }) as HTMLImageElement;
  if (fallback) img.addEventListener('error', () => img.replaceWith(h('span', { class: cls }, fallback)), { once: true });
  return img;
}

/** 아이콘 시트에서 잘라낸 픽셀 아이콘 (이모지 대체). 크기는 CSS .ui-icon */
export function icon(name: IconName, cls = ''): HTMLImageElement {
  return h('img', { class: `ui-icon ${cls}`, src: `./assets/ui/icon_${name}.webp`, alt: '', draggable: 'false' }) as HTMLImageElement;
}
