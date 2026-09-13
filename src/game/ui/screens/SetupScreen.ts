import { Screen } from '../Screen';
import { h, uiImg, icon } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate } from '../../Game';
import { CHARACTERS, PETS, portraitUrl } from '../../data/characters';
import { DIFFICULTY_LABEL } from '../../data/stages';
import type { Difficulty } from '../../types';
import { EventBus, Events } from '../../EventBus';
import { AudioManager } from '../../systems/AudioManager';
import { storyModal, toast } from '../ModalController';
import { commonTopBar } from '../TopBar';

export class SetupScreen extends Screen {
  private characterId = 'brown_boy';
  private petId = 'cat';
  private difficulty: Difficulty = 'normal';
  private previewName!: HTMLElement;
  private step = 0;
  private stepPanels: HTMLElement[] = [];
  private stepTabs: HTMLButtonElement[] = [];
  private nextButton!: HTMLButtonElement;

  constructor() {
    super('setup');
  }

  protected render(data: Record<string, unknown> = {}) {
    const save = SaveSystem.get();
    this.characterId = save.profile.characterId;
    this.petId = save.profile.petId;
    this.difficulty = save.profile.difficulty;
    this.step = data.step === 'pet' ? 2 : 0;

    const charOpen = new Set(save.collection.charactersUnlocked ?? CHARACTERS.map((c) => c.id));
    const petOpen = new Set(save.collection.petsUnlocked);
    if (!charOpen.has(this.characterId)) this.characterId = CHARACTERS[0].id;
    if (!petOpen.has(this.petId)) this.petId = PETS[0].id;
    const charGrid = h(
      'div',
      { class: 'setup-grid' },
      CHARACTERS.map((c) =>
        h(
          'button',
          {
            class: `card ${c.id === this.characterId ? 'selected' : ''} ${charOpen.has(c.id) ? '' : 'locked'}`,
            dataset: { id: c.id },
            type: 'button',
            'aria-pressed': String(c.id === this.characterId),
            'aria-label': `${c.name} · ${charOpen.has(c.id) ? c.desc : c.unlock?.desc}`,
            'aria-disabled': String(!charOpen.has(c.id)),
            onclick: () => (charOpen.has(c.id) ? this.pickChar(c.id, charGrid) : toast(`잠김 · ${c.unlock?.desc ?? '아직 잠겨 있어요'}`)),
          },
          h('div', { class: 'card-check' }, '✓'),
          h('img', { class: 'card-img', src: portraitUrl(c.sheet), alt: c.name }),
          h('div', { class: 'card-name' }, c.name),
          h('div', { class: 'card-desc' }, charOpen.has(c.id) ? c.desc : [icon('lock'), ` ${c.unlock?.desc ?? ''}`]),
        ),
      ),
    );

    const diffRow = h(
      'div',
      { class: 'setup-diff' },
      (Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) =>
        h(
          'button',
          { type: 'button', class: `chip ${DIFFICULTY_LABEL[d].cls} ${d === this.difficulty ? 'selected' : ''}`, dataset: { id: d }, 'aria-pressed': String(d === this.difficulty), onclick: () => this.pickDiff(d, diffRow) },
          DIFFICULTY_LABEL[d].name,
          h('small', {}, DIFFICULTY_LABEL[d].desc),
        ),
      ),
    );

    const petGrid = h(
      'div',
      { class: 'setup-grid setup-pets' },
      PETS.map((p) =>
        h(
          'button',
          { type: 'button', class: `card ${p.id === this.petId ? 'selected' : ''} ${petOpen.has(p.id) ? '' : 'locked'}`, dataset: { id: p.id }, 'aria-pressed': String(p.id === this.petId), 'aria-disabled': String(!petOpen.has(p.id)), onclick: () => (petOpen.has(p.id) ? this.pickPet(p.id, petGrid) : toast(`잠김 · ${p.unlock?.desc ?? '아직 잠겨 있어요'}`)) },
          h('div', { class: 'card-check' }, '✓'),
          h('img', { class: 'card-img', src: portraitUrl(p.sheet), alt: p.name }),
          h('div', { class: 'card-name' }, p.name),
          h('div', { class: 'card-skill', title: petOpen.has(p.id) ? `${p.passiveDesc} · ${p.activeDesc}` : '' }, petOpen.has(p.id) ? [uiImg(`item_${p.active}`), p.activeDesc] : [icon('lock'), ` ${p.unlock?.desc ?? ''}`]),
        ),
      ),
    );

    const labels = ['모험가', '도전 방식', '동행 친구'];
    this.stepTabs = labels.map((label, i) => h('button', {
      type: 'button', class: 'setup-step', id: `setup-tab-${i}`, role: 'tab',
      'aria-controls': `setup-step-${i}`, onclick: () => this.showStep(i),
      onkeydown: (event: KeyboardEvent) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        this.showStep((i + (event.key === 'ArrowRight' ? 1 : 2)) % 3);
        this.stepTabs[this.step].focus();
      },
    }, h('span', { class: 'num' }, String(i + 1)), label));
    this.stepPanels = [
      h('section', {}, this.sectionTitle(1, '나를 닮은 모험가를 골라요'), h('p', { class: 'setup-step-note' }, '모험가마다 말투와 모습이 달라요. 언제든 바꿀 수 있어요.'), charGrid),
      h('section', {}, this.sectionTitle(2, '내 속도에 맞춰 시작해요'), h('p', { class: 'setup-step-note' }, '처음이라면 기초부터. 익숙해지면 더 어려운 도전으로 바꿔 봐요.'), diffRow),
      h('section', {}, this.sectionTitle(3, '함께할 친구를 골라요'), h('p', { class: 'setup-step-note' }, '친구의 도움을 살펴봐요. 새로 만난 친구도 여기서 선택해요.'), petGrid),
    ];
    this.stepPanels.forEach((el, i) => {
      el.id = `setup-step-${i}`;
      el.className = 'setup-step-panel';
      el.setAttribute('role', 'tabpanel');
      el.setAttribute('aria-labelledby', `setup-tab-${i}`);
    });
    this.nextButton = h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => {
      if (this.step < 2) this.showStep(this.step + 1);
      else this.done();
    } });
    const panel = h(
      'div',
      { class: 'panel setup-panel setup-fit' },
      h('div', { class: 'setup-heading' }, h('h1', {}, SaveSystem.hasSave() ? '나의 모험 준비' : '모험을 시작해 볼까요?'), h('p', {}, SaveSystem.hasSave() ? '친구와 도전 방식을 바꿔도 모험 기록은 그대로예요.' : '세 가지만 고르면 모험을 떠날 수 있어요.')),
      h('div', { class: 'setup-steps', role: 'tablist', 'aria-label': '모험 준비 단계' }, this.stepTabs),
      h('div', { class: 'setup-content' }, this.stepPanels),
      h(
        'div',
        { class: 'setup-footer' },
        h('button', { type: 'button', class: 'btn btn-gray btn-md', onclick: () => { AudioManager.sfx('click'); if (this.step > 0) this.showStep(this.step - 1); else void navigate('home'); } }, '이전'),
        this.nextButton,
      ),
    );
    this.el.append(panel);
    this.el.append(h('div', { class: 'setup-preview-label' }, '내 모험가 미리보기'));
    this.previewName = h('div', { class: 'panel panel-glass setup-preview-name' });
    this.el.append(this.previewName);
    this.updatePreviewName();
    this.showStep(this.step);
    this.el.append(commonTopBar());
  }

  private sectionTitle(n: number, text: string) {
    return h('div', { class: 'setup-section-title' }, h('span', { class: 'num' }, String(n)), text);
  }

  private select(grid: HTMLElement, id: string) {
    [...grid.children].forEach((c) => {
      const selected = (c as HTMLElement).dataset.id === id;
      c.classList.toggle('selected', selected);
      c.setAttribute('aria-pressed', String(selected));
    });
  }
  private showStep(step: number) {
    this.step = step;
    this.stepPanels.forEach((panel, i) => { panel.hidden = i !== step; });
    this.stepTabs.forEach((tab, i) => {
      tab.classList.toggle('selected', i === step);
      tab.setAttribute('aria-selected', String(i === step));
      tab.tabIndex = i === step ? 0 : -1;
    });
    this.nextButton.textContent = step === 2 ? (!SaveSystem.hasSave() && !SaveSystem.get().progress.tutorialCompleted ? '연습하고 모험 시작' : '이대로 모험 지도로') : `다음 · ${step === 0 ? '도전 방식' : '동행 친구'}`;
  }
  private pickChar(id: string, grid: HTMLElement) {
    AudioManager.sfx('click');
    this.characterId = id;
    this.select(grid, id);
    EventBus.emit(Events.PREVIEW_CHANGED, { characterId: id });
    this.updatePreviewName();
  }
  private pickPet(id: string, grid: HTMLElement) {
    AudioManager.sfx('click');
    this.petId = id;
    this.select(grid, id);
    EventBus.emit(Events.PREVIEW_CHANGED, { petId: id });
    this.updatePreviewName();
  }
  private pickDiff(d: Difficulty, row: HTMLElement) {
    AudioManager.sfx('click');
    this.difficulty = d;
    this.select(row, d);
  }
  private updatePreviewName() {
    const c = CHARACTERS.find((x) => x.id === this.characterId)!;
    const p = PETS.find((x) => x.id === this.petId)!;
    this.previewName.replaceChildren(h('div', { class: 'n' }, `${c.name} & ${p.name}`), h('div', { class: 'd' }, p.passiveDesc), h('div', { class: 'd' }, p.activeDesc));
  }

  private done() {
    // SaveSystem keeps a personal nickname, while automatic names follow the chosen character.
    const existing = SaveSystem.get().profile.name?.trim();
    const name = existing || '';
    AudioManager.sfx('perfect');
    SaveSystem.setProfile(name, this.characterId, this.petId, this.difficulty);
    const next = () => void navigate(!existing && !SaveSystem.get().progress.tutorialCompleted ? 'tutorial' : 'worldmap', { next: 'worldmap' });
    // 기존 모험의 키보드 도움·해금·기록은 바꾸지 않는다. 새 모험 기본값은 SaveSystem이 맡는다.
    if (!SaveSystem.get().settings.prologueSeen) {
      SaveSystem.setSettings({ prologueSeen: true });
      storyModal('prologue', next);
    } else next();
  }
}
