import { h } from '../util/dom';
import { nextKeyHint } from '../util/hangul';
import { getLanguage } from '../i18n/Locale';

/** 두벌식 키보드 가이드 (CSS) — 다음에 눌러야 할 키와 사용할 손을 강조 */
type Hand = 'left' | 'right' | 'both';
type Finger = 'left-pinky' | 'left-ring' | 'left-middle' | 'left-index' | 'left-thumb'
  | 'right-thumb' | 'right-index' | 'right-middle' | 'right-ring' | 'right-pinky';
type GuideKey = { key: string; shift?: string; hand: Exclude<Hand, 'both'>; finger: Finger };
const KO_FINGER_ROWS: Finger[][] = [
  ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-index', 'right-index', 'right-index', 'right-middle', 'right-ring', 'right-pinky'],
  ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-index', 'right-index', 'right-index', 'right-middle', 'right-ring'],
  ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-index', 'right-index', 'right-index'],
];
const EN_FINGER_ROWS: Finger[][] = [
  KO_FINGER_ROWS[0],
  ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-index', 'right-index', 'right-index', 'right-middle', 'right-ring', 'right-pinky', 'right-pinky'],
  ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-index', 'right-index', 'right-index', 'right-middle', 'right-ring', 'right-pinky'],
  ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-index', 'right-index', 'right-index', 'right-middle', 'right-ring', 'right-pinky'],
];
const assignHands = (rows: { key: string; shift?: string }[][], fingers: Finger[][]): GuideKey[][] => rows.map((row, rowIndex) =>
  row.map((key, index) => {
    const finger = fingers[rowIndex][index];
    return { ...key, finger, hand: finger.startsWith('left') ? 'left' : 'right' };
  }),
);
const ROWS = assignHands([
  [
    { key: 'ㅂ', shift: 'ㅃ' }, { key: 'ㅈ', shift: 'ㅉ' }, { key: 'ㄷ', shift: 'ㄸ' }, { key: 'ㄱ', shift: 'ㄲ' }, { key: 'ㅅ', shift: 'ㅆ' },
    { key: 'ㅛ' }, { key: 'ㅕ' }, { key: 'ㅑ' }, { key: 'ㅐ', shift: 'ㅒ' }, { key: 'ㅔ', shift: 'ㅖ' },
  ],
  [{ key: 'ㅁ' }, { key: 'ㄴ' }, { key: 'ㅇ' }, { key: 'ㄹ' }, { key: 'ㅎ' }, { key: 'ㅗ' }, { key: 'ㅓ' }, { key: 'ㅏ' }, { key: 'ㅣ' }],
  [{ key: 'ㅋ' }, { key: 'ㅌ' }, { key: 'ㅊ' }, { key: 'ㅍ' }, { key: 'ㅠ' }, { key: 'ㅜ' }, { key: 'ㅡ' }],
], KO_FINGER_ROWS);
const EN_ROWS = assignHands([
  'qwertyuiop'.split('').map((key) => ({ key })),
  "asdfghjkl;'".split('').map((key) => ({ key })),
  'zxcvbnm,./'.split('').map((key) => ({ key })),
  '1234567890'.split('').map((key) => ({ key })),
], EN_FINGER_ROWS);
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
  private fingerGuide?: HTMLElement;
  private fingerCopy?: HTMLElement;
  private fingerLabel?: HTMLElement;
  private fingerMarker?: HTMLElement;
  private fingerSecondaryMarker?: HTMLElement;
  private english = getLanguage() === 'en';

  constructor(opts: { onBackdropClick?: () => void; embedded?: boolean } = {}) {
    const handName = (hand: Hand) => hand === 'left'
      ? (this.english ? 'left hand' : '왼손')
      : hand === 'right' ? (this.english ? 'right hand' : '오른손') : (this.english ? 'either thumb' : '양손 엄지');
    const specialKey = (label: string, kind: string, hand: Hand, key: string, finger: Finger) => h('div', {
      class: `key ${kind} hand-${hand}`,
      'data-key': key,
      'data-hand': hand,
      'data-finger': finger,
      'aria-label': `${label}, ${handName(hand)}`,
    }, label);
    this.backKey = specialKey(this.english ? '← Delete' : '← 지움', 'wide', 'right', 'Backspace', 'right-pinky');
    this.leftShiftKey = specialKey('⇧ Shift', 'wide shift-left', 'left', 'ShiftLeft', 'left-pinky');
    this.rightShiftKey = specialKey('Shift ⇧', 'wide shift-right hand-split', 'right', 'ShiftRight', 'right-pinky');
    this.spaceKey = specialKey('Space', 'space', 'both', 'Space', 'left-thumb');
    this.enterKey = specialKey('⏎ Enter', 'wide', 'right', 'Enter', 'right-pinky');
    const rows = (this.english ? EN_ROWS : ROWS).map((r, i) =>
      h(
        'div',
        { class: `kbd-row kbd-row-${i + 1}` },
        r.map((k, index) => {
          const el = h('div', {
            class: `key hand-${k.hand}${index === 5 ? ' hand-split' : ''}`,
            'data-key': k.key,
            'data-hand': k.hand,
            'data-finger': k.finger,
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
      const finger: Finger = key === '1' ? 'left-pinky' : 'right-ring';
      const el = h('div', {
        class: `key hand-${hand}${hand === 'right' ? ' hand-split' : ''}`,
        'data-key': key,
        'data-hand': hand,
        'data-finger': finger,
        'aria-label': `${key === '1' ? '1, !' : key}, ${handName(hand)}`,
      }, key === '1' ? h('span', { class: 'alt' }, '!') : null, key);
      this.keys.set(key, el); return el;
    }) : [];
    const handLegend = h('div', { class: 'kbd-hand-legend', 'aria-label': this.english ? 'Keyboard hand colors' : '자판 손 색깔 안내' },
      h('span', { class: 'kbd-hand-item' }, h('i', { class: 'kbd-hand-swatch hand-left' }), this.english ? 'Left hand' : '왼손'),
      h('span', { class: 'kbd-hand-item' }, h('i', { class: 'kbd-hand-swatch hand-right' }), this.english ? 'Right hand' : '오른손'),
      h('span', { class: 'kbd-hand-item' }, h('i', { class: 'kbd-hand-swatch hand-both' }), this.english ? 'Either thumb' : '양손 엄지'),
    );
    // 전투 오버레이는 게임을 멈추지 않는다. 글자를 치면 걷힌다는 걸 알려 "멈춘 것처럼" 보이지 않게 한다.
    const hint = opts.embedded ? null : h('p', { class: 'kbd-hint' }, this.english ? 'Start typing and the guide slides away · Esc' : '글자를 치면 가이드가 사라져요 · Esc');
    const spaceRow = h('div', { class: 'kbd-row kbd-space-row' }, punctuation, this.spaceKey);
    if (opts.embedded) {
      this.fingerLabel = h('strong', { class: 'kbd-finger-label' });
      this.fingerCopy = h('div', { class: 'kbd-finger-copy', 'aria-live': 'polite' },
        h('span', {}, this.english ? 'NEXT FINGER' : '다음 손가락'), this.fingerLabel);
      // 색 범례를 손 안내와 한 줄에 둬서 연습 패널 세로 공간을 아낀다.
      handLegend.append(h('span', { class: 'kbd-key-legend' }, this.english ? 'Yellow: next key · Mint: pressed key' : '노랑: 다음 키 · 민트: 누른 키'), this.fingerCopy);
      this.fingerMarker = h('i', { class: 'kbd-fingertip-marker', 'aria-hidden': 'true' });
      this.fingerSecondaryMarker = h('i', { class: 'kbd-fingertip-marker secondary', 'aria-hidden': 'true' });
      this.fingerGuide = h('div', { class: 'kbd-finger-guide', 'aria-hidden': 'true' });
      this.panel = h('div', { class: 'kbd-guide' }, handLegend,
        h('div', { class: 'kbd-keyboard-deck' }, rows, spaceRow, this.fingerGuide), hint);
    } else {
      this.panel = h('div', { class: 'kbd-guide' }, handLegend, rows, spaceRow, hint);
    }
    this.el = h('div', {
      class: opts.embedded ? 'kbd-embedded' : 'kbd-overlay',
      onclick: (e: MouseEvent) => { if (e.target === this.el) opts.onBackdropClick?.(); },
    }, this.panel);
    // 자판 그림은 안내용이다. 태블릿에서 키를 손으로 눌러도 입력창 포커스를 뺏지 않아야 화면 키보드가 닫히지 않는다.
    this.panel.addEventListener('mousedown', e => e.preventDefault());
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
    if (!hint) { this.setFinger(); return; }
    if (hint.type === 'backspace') {
      this.backKey.classList.add('next-back');
      this.setFinger('right-pinky', this.backKey);
      return;
    }
    if (hint.type === 'enter') {
      this.enterKey.classList.add('next');
      this.setFinger('right-pinky', this.enterKey);
      return;
    }
    const { key, shift } = hint.stroke;
    let nextKey: HTMLElement | undefined;
    let primary: Finger | undefined;
    let secondary: Finger | undefined;
    let secondaryKey: HTMLElement | undefined;
    if (key === ' ') {
      nextKey = this.spaceKey;
      this.spaceKey.classList.add('next');
      primary = 'left-thumb';
      secondary = 'right-thumb';
      secondaryKey = this.spaceKey;
    }
    else {
      nextKey = this.keys.get(SHIFTED_KEYS[key] ?? (this.english ? key.toLowerCase() : key));
      nextKey?.classList.add('next');
      primary = nextKey?.dataset.finger as Finger | undefined;
    }
    // 큰글자·쌍자음은 글자 키와 반대 손의 Shift를 눌러 손가락 자리를 지킨다.
    if (shift) {
      secondaryKey = nextKey?.dataset.hand === 'left' ? this.rightShiftKey : this.leftShiftKey;
      secondaryKey.classList.add('next-shift');
      secondary = secondaryKey.dataset.finger as Finger;
    }
    this.setFinger(primary, nextKey, secondary, secondaryKey);
  }

  private setFinger(primary?: Finger, primaryKey?: HTMLElement, secondary?: Finger, secondaryKey?: HTMLElement) {
    if (!this.fingerGuide || !this.fingerCopy || !this.fingerLabel || !this.fingerMarker || !this.fingerSecondaryMarker) return;
    const names: Record<Finger, [string, string]> = {
      'left-pinky': ['왼손 새끼', 'Left pinky'], 'left-ring': ['왼손 약지', 'Left ring'],
      'left-middle': ['왼손 중지', 'Left middle'], 'left-index': ['왼손 검지', 'Left index'],
      'left-thumb': ['왼손 엄지', 'Left thumb'], 'right-thumb': ['오른손 엄지', 'Right thumb'],
      'right-index': ['오른손 검지', 'Right index'], 'right-middle': ['오른손 중지', 'Right middle'],
      'right-ring': ['오른손 약지', 'Right ring'], 'right-pinky': ['오른손 새끼', 'Right pinky'],
    };
    this.fingerGuide.classList.toggle('is-empty', !primary);
    this.fingerCopy.classList.toggle('is-empty', !primary);
    this.fingerMarker.remove();
    this.fingerSecondaryMarker.remove();
    if (!primary) {
      this.fingerLabel.textContent = '';
      return;
    }
    primaryKey?.append(this.fingerMarker);
    if (secondary && secondaryKey) secondaryKey.append(this.fingerSecondaryMarker);
    const isThumbPair = primary.endsWith('thumb') && secondary?.endsWith('thumb');
    this.fingerLabel.textContent = secondary
      ? isThumbPair ? (this.english ? 'Either thumb' : '양손 엄지')
        : `${names[primary][this.english ? 1 : 0]} + ${names[secondary][this.english ? 1 : 0]}`
      : names[primary][this.english ? 1 : 0];
    this.fingerGuide.setAttribute('aria-label', this.fingerLabel.textContent);
  }
}
