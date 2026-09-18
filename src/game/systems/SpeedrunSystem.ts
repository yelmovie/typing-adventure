/**
 * 스피드런(전 코스 타임어택) 순수 로직. 저장·화면·시계는 호출하는 쪽이 넘긴다.
 * 총 시간은 벽시계가 아니라 각 지역 전투의 elapsedSec 합이다(소개·로딩·막간은 세지 않는다).
 * 실패한 판의 시간은 더하지 않고 retries 만 센다.
 */
import type { SaveData, SaveRecords, StageId } from '../types';

export const SPEEDRUN_STAGES: Exclude<StageId, 'daily'>[] = ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5'];
export const SPEEDRUN_KEEP_RUNS = 10;

export interface SpeedrunRun {
  startedAt: string;
  /** 완료한 지역의 전투 시간(초). 길이가 곧 다음 지역의 인덱스다. */
  stageSec: number[];
  retries: number;
}
export type SpeedrunRecord = NonNullable<SaveRecords['speedrun']>;
export interface SpeedrunFinish {
  totalSec: number;
  stageSec: number[];
  retries: number;
  /** 이번 완주 전의 최고 기록(없으면 0) */
  prevBestSec: number;
  isNewBest: boolean;
}

/** 다섯 지역을 모두 완료해야 스피드런·어둠 모드가 열린다. */
export function endgameUnlocked(progress: Pick<SaveData['progress'], 'clearedStages'>): boolean {
  return SPEEDRUN_STAGES.every((id) => progress.clearedStages.includes(id));
}

export function startSpeedrun(now = new Date()): SpeedrunRun {
  return { startedAt: now.toISOString(), stageSec: [], retries: 0 };
}
/** 지금 치러야 할 지역. 다섯 지역을 다 마쳤으면 undefined. */
export function currentStage(run: Pick<SpeedrunRun, 'stageSec'>): Exclude<StageId, 'daily'> | undefined {
  return SPEEDRUN_STAGES[run.stageSec.length];
}
export function stageNumber(run: Pick<SpeedrunRun, 'stageSec'>): number {
  return Math.min(SPEEDRUN_STAGES.length, run.stageSec.length + 1);
}
export function totalSec(run: Pick<SpeedrunRun, 'stageSec'>): number {
  return run.stageSec.reduce((a, b) => a + b, 0);
}
export function isComplete(run: Pick<SpeedrunRun, 'stageSec'>): boolean {
  return run.stageSec.length >= SPEEDRUN_STAGES.length;
}
/** 지역 클리어: 그 판의 전투 시간을 더한다. */
export function recordClear(run: SpeedrunRun, elapsedSec: number): SpeedrunRun {
  if (isComplete(run)) return run;
  return { ...run, stageSec: [...run.stageSec, Math.max(0, Math.round(elapsedSec))] };
}
/** 지역 실패: 시간은 더하지 않고 같은 지역을 다시 한다. */
export function recordFail(run: SpeedrunRun): SpeedrunRun {
  return { ...run, retries: run.retries + 1 };
}
export function nextStage(run: SpeedrunRun, cleared: boolean, elapsedSec: number): { run: SpeedrunRun; stageId: Exclude<StageId, 'daily'> | undefined } {
  const next = cleared ? recordClear(run, elapsedSec) : recordFail(run);
  return { run: next, stageId: currentStage(next) };
}

/** 완주 확정: records.speedrun 을 갱신하고(최고 기록·최근 10회) 비교 결과를 돌려준다. 호출한 쪽이 저장한다. */
export function finishSpeedrun(records: SaveRecords, run: SpeedrunRun, now = new Date()): SpeedrunFinish {
  const total = totalSec(run);
  const prev = records.speedrun;
  const prevBestSec = prev && prev.bestSec > 0 ? prev.bestSec : 0;
  const isNewBest = prevBestSec === 0 || total < prevBestSec;
  const at = now.toISOString();
  const runs = [...(prev?.runs ?? []), { at, totalSec: total, stageSec: [...run.stageSec] }].slice(-SPEEDRUN_KEEP_RUNS);
  records.speedrun = { bestSec: isNewBest ? total : prevBestSec, bestAt: isNewBest ? at : prev?.bestAt ?? at, runs };
  return { totalSec: total, stageSec: [...run.stageSec], retries: run.retries, prevBestSec, isNewBest };
}

/** 저장에서 읽은 스피드런 진행(중간 저장)을 안전한 값으로 되돌린다. 모양이 이상하면 undefined. */
export function readSpeedrunRun(value: unknown): SpeedrunRun | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const stageSec = Array.isArray(v.stageSec) ? v.stageSec.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0).map((n) => Math.round(n)).slice(0, SPEEDRUN_STAGES.length) : [];
  if (Array.isArray(v.stageSec) && stageSec.length !== v.stageSec.length) return undefined;
  const startedAt = typeof v.startedAt === 'string' && Number.isFinite(Date.parse(v.startedAt)) ? new Date(v.startedAt).toISOString() : new Date().toISOString();
  const retries = typeof v.retries === 'number' && Number.isFinite(v.retries) && v.retries >= 0 ? Math.floor(Math.min(1000, v.retries)) : 0;
  return { startedAt, stageSec, retries };
}

/** m:ss (한 시간을 넘으면 h:mm:ss). 초 단위 올림 없이 반올림한 정수 초를 쓴다. */
export function formatSpeedrunTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return hh > 0 ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}
