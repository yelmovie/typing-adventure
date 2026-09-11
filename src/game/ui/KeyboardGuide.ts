import { h } from '../util/dom';
import { nextKeyHint } from '../util/hangul';
import { getLanguage } from '../i18n/Locale';

/** 두벌식 키보드 가이드 (CSS) — 다음에 눌러야 할 키를 강조 */
const ROWS: { key: string; shift?: string }[][] = [
  [
    { key: 'ㅂ', shift: 'ㅃ' }, { key: 'ㅈ', shift: 'ㅉ' }, { key: 'ㄷ', shift: 'ㄸ' }, { key: 'ㄱ', shift: 'ㄲ' }, { key: 'ㅅ', shift: 'ㅆ' },
    { key: 'ㅛ' }, { key: 'ㅕ' }, { key: 'ㅑ' }, { key: 'ㅐ', shift: 'ㅒ' }, { key: 'ㅔ', shift: 'ㅖ' },
  ],
  [{ key: 'ㅁ' }, { key: 'ㄴ' }, { key: 'ㅇ' }, { key: 'ㄹ' }, { key: 'ㅎ' }, { key: 'ㅗ' }, { key: 'ㅓ' }, { key: 'ㅏ' }, { key: 'ㅣ' }],
  [{ key: 'ㅋ' }, { key: 'ㅌ' }, { key: 'ㅊ' }, { key: 'ㅍ' }, { key: 'ㅠ' }, { key: 'ㅜ' }, { key: 'ㅡ' }],
];
const EN_ROWS: { key: string; shift?: string }[][] = [
  'qwertyuiop'.split('').map((key) => ({ key })),
  "asdfghjkl;'".split('').map((key) => ({ key })),
  'zxcvbnm,./'.split('').map((key) => ({ key })),
  '1234567890'.split('').map((key) => ({ key })),
];
const SHIFTED_KEYS: Record<string, string> = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '?': '/', '<': ',', '>': '.', ':': ';', '"': "'" };

export class KeyboardGuide {
  /** 화면 중앙 오버레이 배경(기본 숨김) — 켜기 버튼을 누르면 뜨고, 배경을 클릭하거나 다시 누르면 사라짐 */
  readonly el: HTMLElement;
  private panel: HTMLElement;
  private keys = new Map<string, HTMLElement>();
  private shiftKey: HTMLElement;
  private spaceKey: HTMLElement;
  private enterKey: HTMLElement;
  private backKey: HTMLElement;
  private english = getLanguage() === 'en';

  constructor(opts: { onBackdropClick?: () => void; embedded?: boolean } = {}) {
    this.backKey = h('div', { class: 'key wide' }, this.english ? '← Delete' : '← 지움');
    this.shiftKey = h('div', { class: 'key wide' }, '⇧ Shift');
    this.spaceKey = h('div', { class: 'key space' }, 'Space');
    this.enterKey = h('div', { class: 'key wide' }, '⏎ Enter');
    const rows = (this.english ? EN_ROWS : ROWS).map((r, i) =>
      h(
        'div',
        { class: 'kbd-row' },
        r.map((k) => {
          const el = h('div', { class: 'key' }, k.shift ? h('span', { class: 'alt' }, k.shift) : null, k.key);
          this.keys.set(k.key, el);
          return el;
        }),
        i === 0 ? this.backKey : i === 1 ? this.enterKey : null,
      ),
    );
    rows[2].prepend(this.shiftKey);
    const punctuation = opts.embedded && !this.english ? ['1', '.'].map(key => {
      const el = h('div', { class: 'key' }, key === '1' ? h('span', { class: 'alt' }, '!') : null, key);
      this.keys.set(key, el); return el;
    }) : [];
    this.panel = h('div', { class: 'kbd-guide' }, rows, h('div', { class: 'kbd-row' }, punctuation, this.spaceKey));
    this.el = h('div', {
      class: opts.embedded ? 'kbd-embedded' : 'kbd-overlay',
      onclick: (e: MouseEvent) => { if (e.target === this.el) opts.onBackdropClick?.(); },
    }, this.panel);
  }

  /** Physical key codes remain available while the Korean IME is composing. */
  setPressed(code: string, pressed: boolean) {
    const latin = code.startsWith('Key') ? code.slice(3).toLowerCase() : '';
    const index = 'qwertyuiopasdfghjklzxcvbnm'.indexOf(latin);
    const label = latin.length === 1 && index >= 0
      ? (this.english ? latin : ROWS.flat()[index].key)
      : ({ Digit1: '1', Period: '.', Comma: ',', Slash: '/' } as Record<string, string>)[code];
    const el = code.startsWith('Shift') ? this.shiftKey : code === 'Space' ? this.spaceKey
      : code === 'Enter' ? this.enterKey : code === 'Backspace' ? this.backKey : this.keys.get(label);
    el?.classList.toggle('pressed', pressed);
  }

  clearPressed() { this.el.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed')); }

  setVisible(v: boolean) {
    this.el.classList.toggle('show', v);
  }

  /** 다람쥐 패시브: 다음 키를 크게 */
  setBig(v: boolean) {
    this.panel.classList.toggle('big', v);
  }

  update(target: string, current: string) {
    for (const el of this.keys.values()) el.classList.remove('next');
    this.shiftKey.classList.remove('next', 'next-shift');
    this.spaceKey.classList.remove('next');
    this.enterKey.classList.remove('next');
    this.backKey.classList.remove('next-back');
    const hint = nextKeyHint(target, current);
    if (!hint) return;
    if (hint.type === 'backspace') {
      this.backKey.classList.add('next-back');
      return;
    }
    if (hint.type === 'enter') {
      this.enterKey.classList.add('next');
      return;
    }
    const { key, shift } = hint.stroke;
    if (key === ' ') this.spaceKey.classList.add('next');
    else this.keys.get(SHIFTED_KEYS[key] ?? (this.english ? key.toLowerCase() : key))?.classList.add('next');
    if (shift) this.shiftKey.classList.add('next-shift');
  }
}
