import { h } from '../util/dom';
import { t } from '../i18n/Locale';

/**
 * 픽셀 말풍선. Phaser 캔버스와 DOM 은 같은 1920×1080 디자인 좌표를 쓰므로
 * 캐릭터의 게임 좌표를 그대로 넘기면 머리 위에 붙는다.
 *
 * 글자는 한 자씩 찍히고(타이핑), 조사·받침이 깨지지 않게 코드 포인트 단위로 자른다.
 */
export interface BubbleOpts {
  /** 말풍선 꼬리가 가리킬 지점(디자인 좌표) — 보통 캐릭터 머리 끝 */
  x: number;
  y: number;
  text: string;
  /** 나타나기까지 기다릴 시간(ms) */
  delay?: number;
  /** 한 글자당 ms */
  speed?: number;
  /** 다 찍고 이만큼 뒤 사라진다. 0 이면 안 사라짐 */
  holdMs?: number;
  /** 몬스터 말풍선은 붉은 톤 */
  tone?: 'hero' | 'pet' | 'foe';
}

export class SpeechBubble {
  readonly el: HTMLElement;
  private textEl: HTMLElement;
  private timers: number[] = [];
  private done = false;
  /** 글자를 다 찍었을 때의 상자 폭(디자인 px). 화면 안쪽으로 밀어 넣을 때 쓴다 */
  readonly fullWidth: number;

  constructor(parent: HTMLElement, private opts: BubbleOpts) {
    // Translate the full line before revealing it; partial Korean cannot match a dictionary.
    this.opts = { ...opts, text: t(opts.text) };
    this.textEl = h('span', { class: 'sb-text' });
    // 바깥(.speech-bubble)은 자르지 않는다 — 자르면 꼬리(.sb-tail)까지 잘려 사라진다.
    // 계단 모서리는 안쪽 상자(.sb-box)만 clip-path 로 자른다.
    this.el = h(
      'div',
      { class: `speech-bubble sb-${opts.tone ?? 'hero'}`, 'data-no-translate': 'true' },
      h('div', { class: 'sb-box' }, this.textEl, h('span', { class: 'sb-caret' })),
      h('span', { class: 'sb-tail' }),
    );
    // 꼬리가 (x, y) 를 가리키도록 가로 가운데 정렬 + 아래쪽 기준
    this.el.style.left = `${opts.x}px`;
    this.el.style.bottom = `${1080 - opts.y}px`;
    parent.append(this.el);
    // 글자가 한 자씩 찍히므로 지금 폭은 최종 폭이 아니다. 잠깐 전부 채워 재 두고 비운다(아직 보이지 않는 상태).
    this.textEl.textContent = this.opts.text;
    this.fullWidth = this.el.offsetWidth;
    this.textEl.textContent = '';
    this.after(opts.delay ?? 0, () => this.start());
  }

  /**
   * 상자가 [minX, maxX] 밖(옆의 창이나 화면 가장자리)으로 나가면 안쪽으로 밀되,
   * 꼬리는 계속 원래 지점(캐릭터 머리)을 가리키게 상자 안에서 옮긴다.
   */
  keepWithin(minX: number, maxX: number) {
    const half = this.fullWidth / 2;
    const shift = Math.max(0, minX + half - this.opts.x) || Math.min(0, maxX - half - this.opts.x);
    if (!shift) return;
    this.el.style.left = `${this.opts.x + shift}px`;
    const tail = this.el.querySelector<HTMLElement>('.sb-tail');
    if (tail) tail.style.left = `${Math.min(this.fullWidth - 24, Math.max(24, half - shift))}px`;
  }

  private after(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private start() {
    this.el.classList.add('show');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.textEl.textContent = this.opts.text;
      this.done = true;
      this.el.classList.add('typed');
      if (this.opts.holdMs) this.after(this.opts.holdMs, () => this.el.classList.remove('show'));
      return;
    }
    const chars = [...this.opts.text];
    const speed = this.opts.speed ?? 45;
    chars.forEach((_, i) => {
      this.after(i * speed, () => {
        this.textEl.textContent = chars.slice(0, i + 1).join('');
      });
    });
    const total = chars.length * speed;
    this.after(total, () => {
      this.done = true;
      this.el.classList.add('typed');
    });
    if (this.opts.holdMs) this.after(total + this.opts.holdMs, () => this.el.classList.remove('show'));
  }

  /** 다 찍히기 전에 건너뛰기 (버튼을 눌러 넘어갈 때) */
  finish() {
    if (this.done) return;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.textEl.textContent = this.opts.text;
    this.el.classList.add('show', 'typed');
    this.done = true;
  }

  destroy() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.el.remove();
  }
}
