import type { SaveData, Difficulty, SaveSettings } from '../types';
import { EventBus, Events } from '../EventBus';

export const STORAGE_KEY = 'typing_adventure_save_v1';
const CURRENT_VERSION = '1';

function defaultSave(): SaveData {
  return {
    version: CURRENT_VERSION,
    profile: { name: '', characterId: 'brown_boy', petId: 'cat', difficulty: 'normal' },
    progress: { unlockedStage: 1, stageStars: {}, clearedStages: [], coins: 0, fails: {}, assist: {} },
    records: { bestCpm: 0, bestAccuracy: 0, bestCombo: 0, bestScoreByStage: {}, ghosts: {}, daily: {} },
    collection: { badges: [], wordsSeen: [], petsUnlocked: ['cat', 'rabbit'], charactersUnlocked: ['brown_boy', 'pink_girl', 'glasses_boy'], enemiesSeen: [] },
    settings: { bgm: true, sfx: true, screenShake: true, showKeyboardGuide: false, bgmVolume: 0.7, sfxVolume: 0.9, prologueSeen: false },
    stats: { totalClears: 0, totalWords: 0, totalPlaySec: 0 },
    updatedAt: new Date().toISOString(),
  };
}

// version 값에 따라 순차 마이그레이션
const migrations: Record<string, (d: SaveData) => SaveData> = {
  // '1' → '2' 예시 자리
};

function migrate(data: SaveData): SaveData {
  let d = data;
  while (d.version !== CURRENT_VERSION && migrations[d.version]) d = migrations[d.version](d);
  // 누락 필드 보정
  const def = defaultSave();
  return {
    ...def,
    ...d,
    version: CURRENT_VERSION,
    profile: { ...def.profile, ...d.profile },
    progress: { ...def.progress, ...d.progress },
    records: { ...def.records, ...d.records },
    collection: { ...def.collection, ...d.collection },
    settings: { ...def.settings, ...d.settings },
    stats: { ...def.stats, ...(d.stats ?? {}) },
  };
}

class SaveSystemImpl {
  private data: SaveData;
  private _hasSave = false;

  constructor() {
    this.data = defaultSave();
    this.load();
  }

  get(): SaveData {
    return this.data;
  }

  /** 프로필이 저장된 적 있는지 (이어하기 활성화 조건) */
  hasSave(): boolean {
    return this._hasSave;
  }

  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.data = defaultSave();
        this._hasSave = false;
        return;
      }
      const parsed = JSON.parse(raw) as SaveData;
      this.data = migrate(parsed);
      this._hasSave = !!this.data.profile.name;
    } catch (e) {
      console.warn('[SaveSystem] load failed, using defaults', e);
      this.data = defaultSave();
      this._hasSave = false;
    }
  }

  save() {
    this.data.updatedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      this._hasSave = !!this.data.profile.name;
      EventBus.emit(Events.SAVE_UPDATED, this.data);
    } catch (e) {
      console.warn('[SaveSystem] save failed', e);
    }
  }

  setProfile(name: string, characterId: string, petId: string, difficulty: Difficulty) {
    this.data.profile = { name, characterId, petId, difficulty };
    this.save();
  }

  setSettings(patch: Partial<SaveSettings>) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
    EventBus.emit(Events.SETTINGS_CHANGED, this.data.settings);
  }

  reset() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.data = defaultSave();
    this._hasSave = false;
    EventBus.emit(Events.SAVE_UPDATED, this.data);
  }

  /** 플레이어 레벨 = 1 + 클리어 스테이지 수 + 별 총합/3 */
  level(): number {
    const p = this.data.progress;
    const stars = Object.values(p.stageStars).reduce((a, b) => a + b, 0);
    return 1 + p.clearedStages.length + Math.floor(stars / 3);
  }
}

export const SaveSystem = new SaveSystemImpl();
