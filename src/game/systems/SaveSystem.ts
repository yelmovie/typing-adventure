import type { SaveData, Difficulty, SaveSettings } from '../types';
import { EventBus, Events } from '../EventBus';
import { defaultSave, validateSave, hasInvalidStructure } from './SaveValidation';
import { nameForCharacter } from '../data/characters';
import { STORAGE_KEY } from './SaveKey';

export { STORAGE_KEY } from './SaveKey';
export interface SaveStatus { state: 'saved' | 'recovered' | 'memory'; message: string }
class SaveSystemImpl {
  private data: SaveData = defaultSave();
  private _hasSave = false;
  private original = '';
  private storageStatus: SaveStatus = { state: 'saved', message: '이 기기의 브라우저에 저장돼요.' };
  private listeners = new Set<(status: SaveStatus) => void>();
  constructor() { this.load(); }
  get(): SaveData { return this.data; }
  hasSave(): boolean { return this._hasSave; }
  status(): SaveStatus { return this.storageStatus; }
  backup(): string { return this.original || JSON.stringify(this.data, null, 2); }
  subscribe(listener: (status: SaveStatus) => void): () => void {
    this.listeners.add(listener); listener(this.storageStatus);
    return () => { this.listeners.delete(listener); };
  }
  private notify(state: SaveStatus['state'], message: string) {
    this.storageStatus = { state, message };
    for (const listener of this.listeners) listener(this.storageStatus);
  }
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) { this.data = defaultSave(); this._hasSave = false; return; }
      this.original = raw;
      const parsed: unknown = JSON.parse(raw);
      this.data = validateSave(parsed);
      this.syncCharacterName();
      this._hasSave = !!this.data.profile.name;
      if (hasInvalidStructure(parsed)) this.notify('recovered', '기록의 일부를 복구했어요. 남아 있는 모험은 계속할 수 있어요.');
    } catch {
      this.data = defaultSave(); this._hasSave = false;
      this.notify(this.original ? 'recovered' : 'memory', this.original ? '읽을 수 없는 기록을 발견했어요. 원본을 보관한 뒤 새로 시작할 수 있어요.' : '이 브라우저에서 기록을 저장할 수 없어요. 창을 닫기 전에 선생님에게 알려 주세요.');
    }
  }
  save(): boolean {
    this.syncCharacterName();
    this.data.updatedAt = new Date().toISOString();
    this._hasSave = !!this.data.profile.name;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      this.notify('saved', '이 기기의 브라우저에 저장됐어요.');
      EventBus.emit(Events.SAVE_UPDATED, this.data);
      return true;
    } catch {
      this.notify('memory', '지금 기록은 이 창에만 있어요. 저장 공간을 확인한 뒤 다시 저장해 주세요.');
      return false;
    }
  }
  setProfile(name: string, characterId: string, petId: string, difficulty: Difficulty) {
    this.data.profile = { ...this.data.profile, name: nameForCharacter(name, characterId), characterId, petId, difficulty }; this.save();
  }
  private syncCharacterName() {
    // An empty name still means a new adventure has not completed setup.
    if (this.data.profile.name.trim()) this.data.profile.name = nameForCharacter(this.data.profile.name, this.data.profile.characterId);
  }
  setSettings(patch: Partial<SaveSettings>) {
    const oldLanguage = this.data.settings.language ?? 'ko';
    if (patch.language && patch.language !== oldLanguage) {
      const archives = this.data.languageArchives ??= {};
      archives[oldLanguage] = JSON.parse(JSON.stringify({ profile: this.data.profile, progress: this.data.progress, records: this.data.records, collection: this.data.collection, stats: this.data.stats }));
      const next = archives[patch.language] ?? defaultSave();
      const copy = JSON.parse(JSON.stringify(next)) as SaveData;
      this.data.profile = copy.profile;
      this.data.progress = copy.progress;
      this.data.records = copy.records;
      this.data.collection = copy.collection;
      this.data.stats = copy.stats;
    }
    this.data.settings = { ...this.data.settings, ...patch }; this.save();
    EventBus.emit(Events.SETTINGS_CHANGED, this.data.settings);
  }
  reset(): boolean {
    try { window.localStorage.removeItem(STORAGE_KEY); }
    catch { this.notify('memory', '기록을 지우지 못했어요. 브라우저 저장소 설정을 확인해 주세요.'); return false; }
    const language = this.data.settings.language;
    this.data = defaultSave(); this.data.settings.language = language; this.original = ''; this._hasSave = false;
    this.notify('saved', '기록을 초기화했어요.');
    EventBus.emit(Events.SAVE_UPDATED, this.data);
    return true;
  }
  restartAdventure(): boolean {
    const previous = this.data;
    const next = defaultSave();
    next.settings = { ...previous.settings };
    next.languageArchives = { ...previous.languageArchives };
    delete next.languageArchives[next.settings.language ?? 'ko'];
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { this.notify('memory', '새 모험을 저장하지 못했어요. 기존 기록은 그대로예요.'); return false; }
    this.data = next;
    this._hasSave = false;
    this.notify('saved', '새 모험을 준비했어요. 다른 언어의 기록은 그대로예요.');
    EventBus.emit(Events.SAVE_UPDATED, this.data);
    return true;
  }
  level(): number {
    const p = this.data.progress;
    const stars = Object.values(p.stageStars).reduce((a, b) => a + b, 0);
    return 1 + p.clearedStages.length + Math.floor(stars / 3);
  }
}
export const SaveSystem = new SaveSystemImpl();
