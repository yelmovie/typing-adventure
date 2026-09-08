import { h, clear } from '../util/dom';

/** DOM 화면 베이스: show(data)로 매번 새로 그린다 */
export abstract class Screen<D = Record<string, unknown>> {
  readonly el: HTMLElement;
  constructor(cls: string) {
    this.el = h('div', { class: `screen ${cls}` });
  }
  show(data: D) {
    clear(this.el);
    this.render(data);
    this.el.style.display = '';
  }
  hide() {
    this.onHide();
    this.el.style.display = 'none';
    clear(this.el);
  }
  protected onHide() {}
  protected abstract render(data: D): void;
}
