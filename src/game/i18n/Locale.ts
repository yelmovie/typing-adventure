import type { GameLanguage } from '../types';

let language: GameLanguage = 'ko';
let dictionary: Record<string, string> = {};
let dynamic: (text: string) => string | undefined = () => undefined;
let refresh: (() => void) | undefined;
export function getLanguage(): GameLanguage { return language; }
export function setLanguage(next: GameLanguage) {
  language = next;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.title = next === 'en' ? 'Typing Adventure' : '타이핑 어드벤처';
    refresh?.();
  }
}
export function installTranslations(words: Record<string, string>, translate: typeof dynamic) { dictionary = words; dynamic = translate; }
export function t(text: string): string {
  if (language !== 'en' || !/[가-힣]/.test(text)) return text;
  const trimmed = text.trim();
  const translated = dictionary[trimmed] ?? dynamic(trimmed);
  return translated ? text.replace(trimmed, translated) : text;
}
/** Input values are never translated. Re-rendered screens use the selected corpus. */
export function installLocaleObserver() {
  const original = new WeakMap<Node, { source: string; rendered: string }>();
  const attributes = new WeakMap<HTMLElement, Record<string, { source: string; rendered: string }>>();
  const update = (root: Node) => {
    if (root instanceof HTMLScriptElement || root instanceof HTMLStyleElement) return;
    if (root.nodeType === Node.TEXT_NODE && root.parentElement?.closest('[data-no-translate]')) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const current = root.textContent ?? '', saved = original.get(root);
      const source = saved && current === saved.rendered ? saved.source : current;
      const rendered = t(source);
      original.set(root, { source, rendered });
      if (current !== rendered) root.textContent = rendered;
    } else {
      if (root instanceof HTMLElement && !root.closest('[data-no-translate]')) {
        for (const attr of ['aria-label', 'placeholder', 'title', 'alt']) {
          const value = root.getAttribute(attr);
          if (value) {
            const savedAttrs = attributes.get(root) ?? {};
            const saved = savedAttrs[attr];
            const source = saved && value === saved.rendered ? saved.source : value;
            const translated = t(source);
            savedAttrs[attr] = { source, rendered: translated };
            attributes.set(root, savedAttrs);
            if (translated !== value) root.setAttribute(attr, translated);
          }
        }
      }
      if (root instanceof HTMLInputElement || root instanceof HTMLTextAreaElement) return;
      for (const child of root.childNodes) update(child);
    }
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') update(record.target);
      else for (const node of record.addedNodes) update(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  refresh = () => update(document.body);
  update(document.body);
}
