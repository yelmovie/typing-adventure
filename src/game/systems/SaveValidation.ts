import type { SaveData, LearningFocus, LearningPattern, LearningProgress } from '../types';

export const CURRENT_SAVE_VERSION = '2';
const stages = ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5'];
const characters = ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'];
const pets = ['cat', 'rabbit', 'dragon', 'squirrel'];
const patterns: LearningPattern[] = ['letters', 'batchim', 'vowel', 'spacing', 'punctuation'];
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const num = (v: unknown, fallback = 0, max = 1e9) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : fallback;
const str = (v: unknown, max = 120) => typeof v === 'string' ? v.normalize('NFC').slice(0, max) : '';
const bool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
const strings = (v: unknown, max = 250, itemMax = 120): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => str(x, itemMax)))].slice(-max) : [];
const choose = (v: unknown, allowed: string[], fallback: string) => typeof v === 'string' && allowed.includes(v) ? v : fallback;
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString();
const entries = (v: unknown) => Object.entries(obj(v)).filter(([key]) => /^[a-zA-Z0-9_:-]{1,80}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key));

export function defaultSave(): SaveData {
  return {
    version: CURRENT_SAVE_VERSION,
    profile: { name: '', characterId: 'brown_boy', petId: 'cat', difficulty: 'normal' },
    progress: { tutorialCompleted: false, practicedParts: [], skippedPracticeStages: [], unlockedStage: 1, stageStars: {}, clearedStages: [], coins: 0, fails: {}, assist: {} },
    records: { bestCpm: 0, bestAccuracy: 0, bestCombo: 0, bestScoreByStage: {}, ghosts: {}, daily: {}, learning: { patterns: {}, recent: [], seen: [] } },
    collection: { badges: [], wordsSeen: [], petsUnlocked: ['cat', 'rabbit'], charactersUnlocked: characters.slice(0, 3), enemiesSeen: [] },
    settings: { language: 'ko', bgm: true, sfx: true, screenShake: true, showKeyboardGuide: false, bgmVolume: 0.7, sfxVolume: 0.9, prologueSeen: false },
    stats: { totalClears: 0, totalWords: 0, totalPlaySec: 0 },
    updatedAt: new Date().toISOString(),
  };
}
function learning(v: unknown): LearningProgress {
  const source = obj(v);
  const focus: Partial<Record<LearningPattern, LearningFocus>> = {};
  for (const pattern of patterns) {
    const p = obj(obj(source.patterns)[pattern]);
    if (!Object.keys(p).length) continue;
    focus[pattern] = { mistakes: num(p.mistakes), corrections: num(p.corrections), newSuccesses: num(p.newSuccesses), delayedSuccesses: num(p.delayedSuccesses), lastTarget: str(p.lastTarget, 600), lastTyped: str(p.lastTyped, 600), lastErrorAt: date(p.lastErrorAt) };
    const savedFocus = focus[pattern]!;
    if (Array.isArray(p.comparedTargets)) savedFocus.comparedTargets = strings(p.comparedTargets, 10, 600).filter(text => text.trim());
    if (Array.isArray(p.pendingTargets)) savedFocus.pendingTargets = strings(p.pendingTargets, 10, 600).filter((text) => text.trim());
    if (Array.isArray(p.transferTargets)) savedFocus.transferTargets = strings(p.transferTargets, 2, 600).filter((text) => text.trim() && text !== savedFocus.lastTarget && !savedFocus.pendingTargets?.includes(text));
    const hasResolutionEvidence = (savedFocus.transferTargets?.length ?? 0) >= 2 || (savedFocus.corrections >= savedFocus.mistakes && savedFocus.corrections > 0 && savedFocus.newSuccesses >= 2);
    if (typeof p.resolvedAt === 'string' && Number.isFinite(Date.parse(p.resolvedAt)) && savedFocus.pendingTargets?.length === 0 && hasResolutionEvidence) savedFocus.resolvedAt = new Date(p.resolvedAt).toISOString();
  }
  return {
    patterns: focus, seen: strings(source.seen, 500, 600),
    recent: (Array.isArray(source.recent) ? source.recent : []).slice(-60).map((entry) => {
      const s = obj(entry);
      return { at: date(s.at), stageId: choose(s.stageId, [...stages, 'daily'], 'daily') as 'daily', source: s.source === 'practice' ? 'practice' : 'game', accuracy: num(s.accuracy, 0, 100), cpm: num(s.cpm, 0, 3000), correct: num(s.correct), corrected: num(s.corrected), skipped: num(s.skipped), newSuccesses: num(s.newSuccesses) };
    }),
  };
}
/** Validate storage as untrusted input; preserve valid fields without accepting malformed nested values. */
export function validateSave(value: unknown, includeArchives = true): SaveData {
  const d = defaultSave(), v = obj(value), p = obj(v.profile), progress = obj(v.progress), records = obj(v.records), c = obj(v.collection), s = obj(v.settings), stats = obj(v.stats);
  const unlockedCharacters = [...new Set([...characters.slice(0, 3), ...strings(c.charactersUnlocked).filter((id) => characters.includes(id))])];
  const unlockedPets = [...new Set(['cat', 'rabbit', ...strings(c.petsUnlocked).filter((id) => pets.includes(id))])];
  d.profile = { name: str(p.name, 24), characterId: choose(p.characterId, unlockedCharacters, 'brown_boy'), petId: choose(p.petId, unlockedPets, 'cat'), difficulty: choose(p.difficulty, ['beginner', 'normal', 'challenge'], 'normal') as SaveData['profile']['difficulty'], canDo: str(p.canDo, 80) };
  d.progress = {
    tutorialCompleted: bool(progress.tutorialCompleted, false),
    practicedParts: strings(progress.practicedParts, 4).filter((part): part is NonNullable<SaveData['progress']['practicedParts']>[number] => ['consonants', 'vowels', 'sentences', 'story'].includes(part)),
    skippedPracticeStages: strings(progress.skippedPracticeStages, stages.length).filter((id): id is NonNullable<SaveData['progress']['skippedPracticeStages']>[number] => stages.includes(id)),
    unlockedStage: Math.max(1, Math.floor(num(progress.unlockedStage, 1, stages.length))),
    stageStars: Object.fromEntries(entries(progress.stageStars).filter(([id]) => stages.includes(id)).map(([id, n]) => [id, Math.floor(num(n, 0, 3))])),
    clearedStages: strings(progress.clearedStages).filter((id) => stages.includes(id)), coins: num(progress.coins),
    fails: Object.fromEntries(entries(progress.fails).filter(([id]) => stages.includes(id)).map(([id, n]) => [id, Math.floor(num(n))])),
    assist: Object.fromEntries(entries(progress.assist).filter(([id]) => stages.includes(id)).map(([id, flag]) => [id, bool(flag, false)])),
  };
  d.progress.unlockedStage = Math.max(d.progress.unlockedStage, ...d.progress.clearedStages.map((id) => Math.min(stages.length, stages.indexOf(id) + 2)));
  d.records = {
    bestCpm: num(records.bestCpm, 0, 3000), bestAccuracy: num(records.bestAccuracy, 0, 100), bestCombo: num(records.bestCombo),
    bestScoreByStage: Object.fromEntries(entries(records.bestScoreByStage).filter(([id]) => stages.includes(id)).map(([id, n]) => [id, num(n)])),
    ghosts: Object.fromEntries(entries(records.ghosts).filter(([id]) => stages.includes(id)).slice(-5).map(([id, raw]) => {
      const g = obj(raw);
      return [id, { samples: (Array.isArray(g.samples) ? g.samples : []).slice(0, 3600).map((n) => num(n)), finishSec: num(g.finishSec, 0, 86400),
        ...(typeof g.goalDistance === 'number' && Number.isFinite(g.goalDistance) && g.goalDistance > 0 ? { goalDistance: num(g.goalDistance, 0, 100000) } : {}),
        ...(typeof g.rulesVersion === 'number' && Number.isInteger(g.rulesVersion) && g.rulesVersion > 0 ? { rulesVersion: num(g.rulesVersion, 0, 10000) } : {}),
      }];
    })),
    daily: Object.fromEntries(entries(records.daily).filter(([id]) => /^\d{4}-\d{2}-\d{2}(:sentence|:long)?$/.test(id)).sort(([a], [b]) => a.localeCompare(b)).slice(-180).map(([id, raw]) => {
      const r = obj(raw);
      return [id, { cpm: num(r.cpm, 0, 3000), accuracy: num(r.accuracy, 0, 100), score: num(r.score), maxCombo: num(r.maxCombo) }];
    })),
    learning: learning(records.learning),
    replay: { day: str(obj(records.replay).day, 10), completed: strings(obj(records.replay).completed, 3).filter((id) => ['steady', 'repair', 'remix'].includes(id)), stamps: Math.floor(num(obj(records.replay).stamps)) },
  };
  d.collection = { badges: strings(c.badges, 100), wordsSeen: strings(c.wordsSeen, 500), petsUnlocked: unlockedPets, charactersUnlocked: unlockedCharacters, enemiesSeen: strings(c.enemiesSeen, 100) };
  d.settings = { language: s.language === 'en' ? 'en' : 'ko', bgm: bool(s.bgm, true), sfx: bool(s.sfx, true), screenShake: bool(s.screenShake, true), showKeyboardGuide: bool(s.showKeyboardGuide, false), bgmVolume: num(s.bgmVolume, 0.7, 1), sfxVolume: num(s.sfxVolume, 0.9, 1), prologueSeen: bool(s.prologueSeen, false) };
  d.stats = { totalClears: num(stats.totalClears), totalWords: num(stats.totalWords), totalPlaySec: num(stats.totalPlaySec) };
  d.updatedAt = date(v.updatedAt);
  if (includeArchives) {
    d.languageArchives = {};
    for (const lang of ['ko', 'en'] as const) {
      const archive = obj(v.languageArchives)[lang];
      if (archive && typeof archive === 'object') {
        const a = validateSave(archive, false);
        d.languageArchives[lang] = { profile: a.profile, progress: a.progress, records: a.records, collection: a.collection, stats: a.stats };
      }
    }
  }
  return d;
}
export function hasInvalidStructure(value: unknown, includeArchives = true): boolean {
  const v = obj(value);
  if (!Object.keys(v).length) return true;
  for (const field of ['profile', 'progress', 'records', 'collection', 'settings', 'stats']) {
    if (field in v && (!v[field] || typeof v[field] !== 'object' || Array.isArray(v[field]))) return true;
  }
  const p = obj(v.progress), r = obj(v.records), c = obj(v.collection);
  for (const [value, array] of [[p.stageStars, false], [p.clearedStages, true], [r.daily, false], [c.badges, true], [c.petsUnlocked, true]] as const) {
    if (value !== undefined && (array ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value))) return true;
  }
  if (includeArchives && 'languageArchives' in v) {
    if (!v.languageArchives || typeof v.languageArchives !== 'object' || Array.isArray(v.languageArchives)) return true;
    const archives = obj(v.languageArchives);
    for (const language of ['ko', 'en']) {
      if (language in archives && hasInvalidStructure(archives[language], false)) return true;
    }
  }
  return false;
}

