import { h, icon } from '../../util/dom';

/** Short-lived input flashes and sequential judgments, owned by one BattleScreen lifetime. */
export class BattleFeedback {
  private queue: [string, string][] = [];
  private judgeTimer = 0;
  private timers = new Set<number>();
  private animations = new Set<Animation>();
  private disposed = false;

  constructor(private readonly root: HTMLElement, private readonly bottom: HTMLElement) {}

  flash(cls: 'right' | 'wrong') {
    if (this.disposed) return;
    this.bottom.classList.remove('right', 'wrong');
    void this.bottom.offsetWidth;
    this.bottom.classList.add(cls);
    this.later(() => this.bottom.classList.remove(cls), 420);
  }

  /** 획득 위치에서 HUD 반영 위치까지 원인→결과를 잇는 짧은 보상 토큰. */
  reward(kind: 'coin' | 'heart', amount: number, destination: HTMLElement) {
    if (this.disposed || amount <= 0) return;
    const token = h('div', { class: `reward-flight ${kind}`, role: 'status', 'aria-label': `${kind === 'coin' ? '코인' : '체력'} +${amount}` }, icon(kind), h('b', {}, `+${amount}`));
    this.root.append(token);
    const rootRect = this.root.getBoundingClientRect();
    const sourceRect = this.bottom.getBoundingClientRect();
    const targetRect = destination.getBoundingClientRect();
    const scaleX = rootRect.width / Math.max(1, this.root.offsetWidth);
    const scaleY = rootRect.height / Math.max(1, this.root.offsetHeight);
    const sourceX = (sourceRect.left + sourceRect.width / 2 - rootRect.left) / scaleX;
    const sourceY = (sourceRect.top - rootRect.top + 8 * scaleY) / scaleY;
    const targetX = (targetRect.left + targetRect.width / 2 - rootRect.left) / scaleX;
    const targetY = (targetRect.top + targetRect.height / 2 - rootRect.top) / scaleY;
    token.style.left = `${sourceX}px`;
    token.style.top = `${sourceY}px`;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = token.animate(reduced ? [
      { opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 },
    ] : [
      { transform: 'translate(-50%, -50%) scale(.55)', opacity: 0 },
      { transform: 'translate(-50%, -95px) scale(1.12)', opacity: 1, offset: 0.28 },
      { transform: `translate(calc(-50% + ${targetX - sourceX}px), calc(-50% + ${targetY - sourceY}px)) scale(.72)`, opacity: 1, offset: 0.86 },
      { transform: `translate(calc(-50% + ${targetX - sourceX}px), calc(-50% + ${targetY - sourceY}px)) scale(.35)`, opacity: 0 },
    ], { duration: reduced ? 260 : 720, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    this.animations.add(animation);
    animation.finished.then(() => {
      this.animations.delete(animation);
      token.remove();
      destination.classList.remove('reward-land');
      void destination.offsetWidth;
      destination.classList.add('reward-land');
      this.later(() => destination.classList.remove('reward-land'), 320);
    }).catch(() => token.remove());
  }

  /** 불가능한 조작도 무반응으로 두지 않고 해당 컨트롤에서만 짧게 되돌린다. */
  reject(control: HTMLElement) {
    if (this.disposed) return;
    control.classList.remove('input-rejected');
    void control.offsetWidth;
    control.classList.add('input-rejected');
    this.later(() => control.classList.remove('input-rejected'), 360);
  }

  /** Several events can accompany one answer; keep their feedback in a single readable band. */
  judge(text: string, cls: string) {
    if (this.disposed) return;
    this.queue.push([text, cls]);
    this.pump();
  }

  judgeNow(text: string, cls: string) {
    this.queue.length = 0;
    window.clearTimeout(this.judgeTimer);
    this.judgeTimer = 0;
    this.judge(text, cls);
  }

  later(callback: () => void, delay: number) {
    if (this.disposed) return;
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      if (!this.disposed) callback();
    }, delay);
    this.timers.add(timer);
  }

  clearJudgments() {
    this.queue.length = 0;
    window.clearTimeout(this.judgeTimer);
    this.judgeTimer = 0;
    for (const old of this.root.querySelectorAll('.judge-pop')) old.remove();
  }

  dispose() {
    this.disposed = true;
    this.clearJudgments();
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    for (const token of this.root.querySelectorAll('.reward-flight')) token.remove();
    this.bottom.classList.remove('right', 'wrong');
  }

  private pump() {
    if (this.judgeTimer) return;
    const next = this.queue.shift();
    if (!next) return;
    for (const old of this.root.querySelectorAll('.judge-pop')) old.remove();
    this.show(next[0], next[1]);
    this.judgeTimer = window.setTimeout(() => {
      this.judgeTimer = 0;
      this.pump();
    }, 380);
  }

  private show(text: string, cls: string) {
    const kind = cls.split(' ')[0];
    const live = [...this.root.querySelectorAll<HTMLElement>('.judge-pop')];
    for (const old of live) if (old.dataset.cls === kind || (['perfect', 'good', 'miss'].includes(kind) && ['perfect', 'good', 'miss'].includes(old.dataset.cls ?? ''))) old.remove();
    const rest = [...this.root.querySelectorAll('.judge-pop')];
    const pop = h('div', { class: `judge-pop ${cls}`, dataset: { cls: kind } }, h('span', { class: 'jp-text' }, h('span', { class: 'jp-inner' }, text)));
    pop.style.setProperty('--stack', String(rest.length));
    this.root.append(pop);
    this.later(() => pop.remove(), ['perfect', 'good', 'miss'].includes(kind) ? 900 : 1150);
  }
}
