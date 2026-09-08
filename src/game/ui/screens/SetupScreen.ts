import { Screen } from '../Screen';
import { h, uiImg } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate } from '../../Game';
import { CHARACTERS, PETS, portraitUrl } from '../../data/characters';
import { DIFFICULTY_LABEL } from '../../data/stages';
import type { Difficulty } from '../../types';
import { EventBus, Events } from '../../EventBus';
import { AudioManager } from '../../systems/AudioManager';
import { storyModal, toast } from '../ModalController';

export class SetupScreen extends Screen {
  private characterId = 'brown_boy';
  private petId = 'cat';
  private difficulty: Difficulty = 'normal';
  private nameInput!: HTMLInputElement;
  private previewName!: HTMLElement;

  constructor() {
    super('setup');
  }

  protected render() {
    const save = SaveSystem.get();
    this.characterId = save.profile.characterId;
    this.petId = save.profile.petId;
    this.difficulty = save.profile.difficulty;

    this.nameInput = h('input', {
      class: 'input',
      type: 'text',
      maxlength: '8',
      placeholder: '이름을 입력하세요 (최대 8글자)',
      value: save.profile.name,
      autocomplete: 'off',
      spellcheck: 'false',
    }) as HTMLInputElement;

    const charOpen = new Set(save.collection.charactersUnlocked ?? CHARACTERS.map((c) => c.id));
    const petOpen = new Set(save.collection.petsUnlocked);
    if (!charOpen.has(this.characterId)) this.characterId = CHARACTERS[0].id;
    if (!petOpen.has(this.petId)) this.petId = PETS[0].id;
    const charGrid = h(
      'div',
      { class: 'setup-grid' },
      CHARACTERS.map((c) =>
        h(
          'div',
          {
            class: `card ${c.id === this.characterId ? 'selected' : ''} ${charOpen.has(c.id) ? '' : 'locked'}`,
            dataset: { id: c.id },
            role: 'button',
            tabindex: '0',
            onclick: () => (charOpen.has(c.id) ? this.pickChar(c.id, charGrid) : toast(`🔒 ${c.unlock?.desc ?? '아직 잠겨 있어요'}`)),
          },
          h('div', { class: 'card-check' }, '✓'),
          h('img', { class: 'card-img', src: portraitUrl(c.sheet), alt: c.name }),
          h('div', { class: 'card-name' }, c.name),
          h('div', { class: 'card-desc' }, charOpen.has(c.id) ? c.desc : `🔒 ${c.unlock?.desc ?? ''}`),
        ),
      ),
    );

    const diffRow = h(
      'div',
      { class: 'setup-diff' },
      (Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) =>
        h(
          'div',
          { class: `chip ${DIFFICULTY_LABEL[d].cls} ${d === this.difficulty ? 'selected' : ''}`, dataset: { id: d }, role: 'button', tabindex: '0', onclick: () => this.pickDiff(d, diffRow) },
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
          'div',
          { class: `card ${p.id === this.petId ? 'selected' : ''} ${petOpen.has(p.id) ? '' : 'locked'}`, dataset: { id: p.id }, role: 'button', tabindex: '0', onclick: () => (petOpen.has(p.id) ? this.pickPet(p.id, petGrid) : toast(`🔒 ${p.unlock?.desc ?? '아직 잠겨 있어요'}`)) },
          h('div', { class: 'card-check' }, '✓'),
          h('img', { class: 'card-img', src: portraitUrl(p.sheet), alt: p.name }),
          h('div', { class: 'card-name' }, p.name),
          h('div', { class: 'card-skill' }, petOpen.has(p.id) ? [p.passiveDesc, h('br'), uiImg(`item_${p.active}`), ' ', p.activeDesc] : `🔒 ${p.unlock?.desc ?? ''}`),
        ),
      ),
    );

    const panel = h(
      'div',
      { class: 'panel setup-panel' },
      h('div', { class: 'panel-title' }, '🎒 모험 준비'),
      h('div', {}, this.sectionTitle(1, '모험가의 이름'), h('div', { class: 'setup-name-row' }, this.nameInput, h('span', { class: 'hint' }, '이름은 이 기기에만 저장돼요'))),
      h('div', {}, this.sectionTitle(2, '캐릭터 선택'), charGrid),
      h('div', {}, this.sectionTitle(3, '난이도'), diffRow),
      h('div', {}, this.sectionTitle(4, '함께할 친구(펫)'), petGrid),
      h(
        'div',
        { class: 'setup-footer' },
        h('button', { class: 'btn btn-gray btn-md', onclick: () => { AudioManager.sfx('click'); void navigate('home'); } }, '← 뒤로'),
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => this.done() }, '준비 완료! 모험 지도로 →'),
      ),
    );
    this.el.append(panel);
    this.el.append(h('div', { class: 'setup-preview-label' }, '내 모험가 미리보기'));
    this.previewName = h('div', { class: 'panel panel-glass setup-preview-name' });
    this.el.append(this.previewName);
    this.updatePreviewName();
    window.setTimeout(() => this.nameInput.focus(), 350);
  }

  private sectionTitle(n: number, text: string) {
    return h('div', { class: 'setup-section-title' }, h('span', { class: 'num' }, String(n)), text);
  }

  private select(grid: HTMLElement, id: string) {
    [...grid.children].forEach((c) => c.classList.toggle('selected', (c as HTMLElement).dataset.id === id));
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
    this.previewName.replaceChildren(h('div', { class: 'n' }, `${c.name} & ${p.name}`), h('div', { class: 'd' }, `${c.desc} · ${p.desc}`));
  }

  private done() {
    const name = this.nameInput.value.trim().normalize('NFC');
    if (!name) {
      toast('모험가의 이름을 먼저 정해 주세요!');
      this.nameInput.focus();
      this.nameInput.classList.add('anim-shake');
      window.setTimeout(() => this.nameInput.classList.remove('anim-shake'), 500);
      return;
    }
    AudioManager.sfx('perfect');
    SaveSystem.setProfile(name, this.characterId, this.petId, this.difficulty);
    if (!SaveSystem.get().settings.prologueSeen) {
      SaveSystem.setSettings({ prologueSeen: true });
      storyModal('prologue', () => void navigate('worldmap'));
    } else void navigate('worldmap');
  }
}
