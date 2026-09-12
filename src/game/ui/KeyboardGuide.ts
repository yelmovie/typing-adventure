import { h } from '../util/dom';
import { nextKeyHint } from '../util/hangul';
import { getLanguage } from '../i18n/Locale';

/** 두벌식 키보드 가이드 (CSS) — 다음에 눌러야 할 키와 사용할 손을 강조 */
type Hand = 'left' | 'right' | 'both';
type GuideKey = { key: string; shift?: string; hand: Exclude<Hand, 'both'> };
const assignHands = (rows: { key: string; shift?: string }[][]): GuideKey[][] => rows.map(row =>
  row.map((key, index) => ({ ...key, hand: index < 5 ? 'left' : 'right' })),
);
const ROWS = assignHands([
  [
    { key: 'ㅂ', shift: 'ㅃ' }, { key: 'ㅈ', shift: 'ㅉ' }, { key: 'ㄷ', shift: 'ㄸ' }, { key: 'ㄱ', shift: 'ㄲ' }, { key: 'ㅅ', shift: 'ㅆ' },
    { key: 'ㅛ' }, { key: 'ㅕ' }, { key: 'ㅑ' }, { key: 'ㅐ', shift: 'ㅒ' }, { key: 'ㅔ', shift: 'ㅖ' },
  ],
  [{ key: 'ㅁ' }, { key: 'ㄴ' }, { key: 'ㅇ' }, { key: 'ㄹ' }, { key: 'ㅎ' }, { key: 'ㅗ' }, { key: 'ㅓ' }, { key: 'ㅏ' }, { key: 'ㅣ' }],
  [{ key: 'ㅋ' }, { key: 'ㅌ' }, { key: 'ㅊ' }, { key: 'ㅍ' }, { key: 'ㅠ' }, { key: 'ㅜ' }, { key: 'ㅡ' }],
]);
const EN_ROWS = assignHands([
  'qwertyuiop'.split('').map((key) => ({ key })),
  "asdfghjkl;'".split('').map((key) => ({ key })),
  'zxcvbnm,./'.split('').map((key) => ({ key })),
  '1234567890'.split('').map((key) => ({ key })),
]);
const SHIFTED_KEYS: Record<string, string> = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '?': '/', '<': ',', '>': '.', ':': ';', '"': "'" };

export class KeyboardGuide {
  /** 화면 중앙 오버레이 배경(기본 숨김) — 켜기 버튼을 누르면 뜨고, 배경을 클릭하거나 다시 누르면 사라짐 */
  readonly el: HTMLElement;
  private panel: HTMLElement;
  private keys = new Map<string, HTMLElement>();
  private leftShiftKey: HTMLElement;
  private rightShiftKey: HTMLElement;
  private spaceKey: HTMLElement;
  private enterKey: HTMLElement;
  private backKey: HTMLElement;
  private english = getLanguage() === 'en';

  constructor(opts: { onBackdropClick?: () => void; embedded?: boolean } = {}) {
    const handName = (hand: Hand) => hand === 'left'
      ? (this.english ? 'left hand' : '왼손')
      : hand === 'right' ? (this.english ? 'right hand' : '오른손') : (this.english ? 'either thumb' : '양손 엄지');
    const specialKey = (label: string, kind: string, hand: Hand, key: string) => h('div', {
      class: `key ${kind} hand-${hand}`,
      'data-key': key,
      'data-hand': hand,
      'aria-label': `${label}, ${handName(hand)}`,
    }, label);
    this.backKey = specialKey(this.english ? '← Delete' : '← 지움', 'wide', 'right', 'Backspace');
    this.leftShiftKey = specialKey('⇧ Shift', 'wide shift-left', 'left', 'ShiftLeft');
    this.rightShiftKey = specialKey('Shift ⇧', 'wide shift-right hand-split', 'right', 'ShiftRight');
    this.spaceKey = specialKey('Space', 'space', 'both', 'Space');
    this.enterKey = specialKey('⏎ Enter', 'wide', 'right', 'Enter');
    const rows = (this.english ? EN_ROWS : ROWS).map((r, i) =>
      h(
        'div',
        { class: `kbd-row kbd-row-${i + 1}` },
        r.map((k, index) => {
          const el = h('div', {
            class: `key hand-${k.hand}${index === 5 ? ' hand-split' : ''}`,
            'data-key': k.key,
            'data-hand': k.hand,
            'aria-label': `${k.shift ? `${k.key}, ${k.shift}` : k.key}, ${handName(k.hand)}`,
          }, k.shift ? h('span', { class: 'alt' }, k.shift) : null, k.key);
          this.keys.set(k.key, el);
          return el;
        }),
        i === 0 ? this.backKey : i === 1 ? this.enterKey : null,
      ),
    );
    rows[2].prepend(this.leftShiftKey);
    rows[2].append(this.rightShiftKey);
    const punctuation = opts.embedded && !this.english ? ['1', '.'].map(key => {
      const hand: Exclude<Hand, 'both'> = key === '1' ? 'left' : 'right';
      const el = h('div', {
        class: `key hand-${hand}${hand === 'right' ? ' hand-split' : ''}`,
        'data-key': key,
        'data-hand': hand,
        'aria-label': `${key === '1' ? '1, !' : key}, ${handName(hand)}`,
      }, key === '1' ? h('span', { class: 'alt' }, '!') : null, key);
      this.keys.set(key, el); return el;
    }) : [];
    const handLegend = h('div', { class: 'kbd-hand-legend', 'aria-label': this.english ? 'Keyboard hand colors' : '자판 손 색깔 안내' },
      h('span', { class: 'kbd-hand-item' }, h('i', { class: 'kbd-hand-swatch hand-left' }), this.english ? 'Left hand' : '왼손'),
      h('span', { class: 'kbd-hand-item' }, h('i', { class: 'kbd-hand-swatch hand-right' }), this.english ? 'Right hand' : '오른손'),
      h('span', { class: 'kbd-hand-item' }, h('i', { class: 'kbd-hand-swatch hand-both' }), this.english ? 'Either thumb' : '양손 엄지'),
    );
    this.panel = h('div', { class: 'kbd-guide' }, handLegend, rows, h('div', { class: 'kbd-row kbd-space-row' }, punctuation, this.spaceKey));
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
      : code.startsWith('Digit') ? code.slice(5)
        : ({ Period: '.', Comma: ',', Slash: '/' } as Record<string, string>)[code];
    const el = code === 'ShiftLeft' ? this.leftShiftKey : code === 'ShiftRight' ? this.rightShiftKey
      : code.startsWith('Shift') ? undefined : code === 'Space' ? this.spaceKey
      : code === 'Enter' ? this.enterKey : code === 'Backspace' ? this.backKey : this.keys.get(label);
    if (code.startsWith('Shift') && !el) {
      this.leftShiftKey.classList.toggle('pressed', pressed);
      this.rightShiftKey.classList.toggle('pressed', pressed);
    } else el?.classList.toggle('pressed', pressed);
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
    this.leftShiftKey.classList.remove('next', 'next-shift');
    this.rightShiftKey.classList.remove('next', 'next-shift');
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
    let nextKey: HTMLElement | undefined;
    if (key === ' ') this.spaceKey.classList.add('next');
    else {
      nextKey = this.keys.get(SHIFTED_KEYS[key] ?? (this.english ? key.toLowerCase() : key));
      nextKey?.classList.add('next');
    }
    // 큰글자·쌍자음은 글자 키와 반대 손의 Shift를 눌러 손가락 자리를 지킨다.
    if (shift) (nextKey?.dataset.hand === 'left' ? this.rightShiftKey : this.leftShiftKey).classList.add('next-shift');
  }
}
