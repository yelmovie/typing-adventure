/**
 * Mid-stage checkpoint helpers shared by SaveValidation, the battle modes and the screens.
 * Pure logic: everything read from storage is treated as untrusted and coerced with these readers,
 * so a corrupt checkpoint can at worst start the stage fresh, never crash boot or a battle.
 */
import type { BattleCheckpoint, ContentUnit, GameLanguage, StageId } from '../types';

export const CHECKPOINT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const STAGE_IDS: StageId[] = ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5', 'daily'];
const DAILY_KINDS = ['word', 'sentence', 'long'] as const;

/** Mode-specific checkpoint payload. JSON-safe by construction (numbers, strings, booleans, arrays, plain objects). */
export type CheckpointState = Record<string, unknown>;

export const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function readNum(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
export function readInt(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return Math.floor(readNum(v, fallback, min, max));
}
export const readBool = (v: unknown, fallback = false): boolean => typeof v === 'boolean' ? v : fallback;
export const readStrings = (v: unknown, max = 5000, itemMax = 600): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.normalize('NFC').slice(0, itemMax)).slice(0, max) : [];
export const readNums = (v: unknown, max = 3600): number[] => Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).slice(0, max) : [];

/** Content units persisted inside a checkpoint (sentence order, boss finals, daily words). Malformed entries are skipped. */
export function readUnits(v: unknown, stage: StageId, max = 60): ContentUnit[] {
  if (!Array.isArray(v)) return [];
  const out: ContentUnit[] = [];
  for (const raw of v.slice(0, max)) {
    const u = obj(raw);
    if (typeof u.id !== 'string' || typeof u.text !== 'string' || !u.text.trim()) continue;
    const unit: ContentUnit = {
      id: u.id.slice(0, 120), stage, type: u.type === 'sentence' ? 'sentence' : 'word', text: u.text.normalize('NFC').slice(0, 600),
      difficulty: readNum(u.difficulty, 1, 0, 100), tags: readStrings(u.tags, 20, 40), weight: readNum(u.weight, 1, 0, 1000),
    };
    if (u.variant === 'treasure' || u.variant === 'heart' || u.variant === 'bomb') unit.variant = u.variant;
    out.push(unit);
  }
  return out;
}

/** Re-apply a persisted order to a freshly built pool: listed keys first (only those still present), the rest in their original order. */
export function restoreOrder<T>(items: T[], keys: unknown, key: (item: T) => string): T[] {
  const wanted = readStrings(keys);
  if (!wanted.length) return items;
  const byKey = new Map<string, T>();
  for (const item of items) if (!byKey.has(key(item))) byKey.set(key(item), item);
  const used = new Set<string>();
  const out: T[] = [];
  for (const k of wanted) {
    const item = byKey.get(k);
    if (item && !used.has(k)) { out.push(item); used.add(k); }
  }
  for (const item of items) if (!used.has(key(item))) out.push(item);
  return out;
}

export function checkpointFresh(cp: Pick<BattleCheckpoint, 'savedAt'>, now = Date.now()): boolean {
  const at = Date.parse(cp.savedAt);
  return Number.isFinite(at) && now - at <= CHECKPOINT_MAX_AGE_MS;
}

/** Storage → checkpoint. Returns undefined when malformed, stale, or for an unknown stage. */
export function validateCheckpoint(value: unknown, now = Date.now()): BattleCheckpoint | undefined {
  const v = obj(value);
  if (!Object.keys(v).length) return undefined;
  const stageId = v.stageId;
  if (typeof stageId !== 'string' || !STAGE_IDS.includes(stageId as StageId)) return undefined;
  if (v.language !== 'en' && v.language !== 'ko') return undefined;
  const language: GameLanguage = v.language;
  if (typeof v.savedAt !== 'string' || !checkpointFresh({ savedAt: v.savedAt }, now)) return undefined;
  const state = v.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return undefined;
  const cp: BattleCheckpoint = {
    stageId: stageId as StageId, savedAt: new Date(v.savedAt).toISOString(), language,
    done: readInt(v.done, 0, 0, 100000), total: readInt(v.total, 0, 0, 100000),
    state: { ...(state as Record<string, unknown>) },
  };
  if (v.remix === true) cp.remix = true;
  if (typeof v.dailyKind === 'string' && (DAILY_KINDS as readonly string[]).includes(v.dailyKind)) cp.dailyKind = v.dailyKind as BattleCheckpoint['dailyKind'];
  if (stageId === 'daily' && !cp.dailyKind) cp.dailyKind = 'word';
  if (v.unit === 'm') cp.unit = 'm';
  if (v.dark === true) cp.dark = true;
  // 스피드런 진행: 완료한 지역 시간(0 이상, 최대 5개)과 재도전 수. 모양이 깨졌으면 이 판은 보통 판으로 이어간다.
  const sr = obj(v.speedrun);
  if (Object.keys(sr).length && Array.isArray(sr.stageSec) && sr.stageSec.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) && sr.stageSec.length < 5) {
    cp.speedrun = {
      startedAt: typeof sr.startedAt === 'string' && Number.isFinite(Date.parse(sr.startedAt)) ? new Date(sr.startedAt).toISOString() : cp.savedAt,
      stageSec: (sr.stageSec as number[]).map((n) => Math.round(n)), retries: readInt(sr.retries, 0, 0, 1000),
    };
  }
  return cp;
}
