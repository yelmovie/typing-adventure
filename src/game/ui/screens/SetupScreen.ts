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

  constructor() {
    super('setup');
  }

  protected render() {
    const save = SaveSystem.get();
    this.characterId = save.profile.characterId;
    this.petId = save.profile.petId;
    this.difficulty = save.profile.difficulty;

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
          { class: `card ${p.id === this.petId ? 'selected' : ''} ${petOpen.has(p.id) ? '' : 'locked'}`, dataset: { id: p.id }, role: 'button', tabindex: '0', onclick: () => (petOpen.has(p.id) ? this.pickPet(p.id, petGrid) : toast(`잠김 · ${p.unlock?.desc ?? '아직 잠겨 있어요'}`)) },
          h('div', { class: 'card-check' }, '✓'),
          h('img', { class: 'card-img', src: portraitUrl(p.sheet), alt: p.name }),
          h('div', { class: 'card-name' }, p.name),
          h('div', { class: 'card-skill', title: petOpen.has(p.id) ? `${p.passiveDesc} · ${p.activeDesc}` : '' }, petOpen.has(p.id) ? [uiImg(`item_${p.active}`), p.activeDesc] : [icon('lock'), ` ${p.unlock?.desc ?? ''}`]),
        ),
      ),
    );

    const panel = h(
      'div',
      { class: 'panel setup-panel' },
      h('div', { class: 'panel-title' }, '모험 준비'),
      h('div', {}, this.sectionTitle(1, '캐릭터 선택'), charGrid),
      h('div', {}, this.sectionTitle(2, '난이도'), diffRow),
      h('div', {}, this.sectionTitle(3, '함께할 친구(펫)'), petGrid),
      h(
        'div',
        { class: 'setup-footer' },
        h('button', { class: 'btn btn-gray btn-md', onclick: () => { AudioManager.sfx('click'); void navigate('home'); } }, icon('home'), ' 뒤로'),
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => this.done() }, '준비 완료 · 모험 지도로'),
      ),
    );
    this.el.append(panel);
    this.el.append(h('div', { class: 'setup-preview-label' }, '내 모험가 미리보기'));
    this.previewName = h('div', { class: 'panel panel-glass setup-preview-name' });
    this.el.append(this.previewName);
    this.updatePreviewName();
    this.el.append(commonTopBar());
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
    // 이름 입력란 없음: 기존 세이브 이름을 유지하고, 없으면 선택한 캐릭터 이름을 기본값으로 쓴다
    const existing = SaveSystem.get().profile.name?.trim();
    const name = existing || CHARACTERS.find((c) => c.id === this.characterId)!.name;
    AudioManager.sfx('perfect');
    SaveSystem.setProfile(name, this.characterId, this.petId, this.difficulty);
    // 셋업 화면은 항상 새 모험(reset 직후)에만 오므로, 키보드 가이드는 매 새 모험마다 기본 숨김으로 시작한다
    SaveSystem.setSettings({ showKeyboardGuide: false });
    if (!SaveSystem.get().settings.prologueSeen) {
      SaveSystem.setSettings({ prologueSeen: true });
      storyModal('prologue', () => void navigate('worldmap'));
    } else void navigate('worldmap');
  }
}
