import { h } from '../../util/dom';

/** Short-lived input flashes and sequential judgments, owned by one BattleScreen lifetime. */
export class BattleFeedback {
  private queue: [string, string][] = [];
  private judgeTimer = 0;
  private timers = new Set<number>();
  private disposed = false;

  constructor(private readonly root: HTMLElement, private readonly bottom: HTMLElement) {}

  flash(cls: 'right' | 'wrong') {
    if (this.disposed) return;
    this.bottom.classList.remove('right', 'wrong');
    void this.bottom.offsetWidth;
    this.bottom.classList.add(cls);
    this.later(() => this.bottom.classList.remove(cls), 420);
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
