import type { BattleResult, GameLanguage, SaveData, StageId } from '../types';
import { STAGES } from './stages';

/**
 * 도전 카드: 별(정확도 90/95% + 골드 시간 또는 콤보)보다 엄격한 지역별 목표 3개.
 * 다섯 지역을 모두 완료한 학생이 지도에서 "아직 못 채운 빈칸"을 보고 다시 도전할 이유가 되게 한다.
 * 조건은 BattleResult 값만으로 판정한다(remix 판도 같은 규칙, 오늘의 도전은 제외).
 */
export interface ChallengeDef {
  id: string;
  stageId: Exclude<StageId, 'daily'>;
  name: { ko: string; en: string };
  desc: { ko: string; en: string };
  met: (result: ChallengeResult) => boolean;
}
export type ChallengeResult = Pick<BattleResult, 'cleared' | 'accuracy' | 'elapsedSec' | 'maxCombo' | 'perfectCount' | 'beatGhost' | 'wordsDone'>;

const goalTime = (stageId: StageId) => STAGES.find((s) => s.id === stageId)?.goalTimeSec ?? 0;
const flawless = (stageId: Exclude<StageId, 'daily'>): ChallengeDef => ({
  id: `${stageId}_flawless`, stageId,
  name: { ko: '실수 없이', en: 'Flawless' },
  desc: { ko: '정확도 100%로 완료', en: 'Finish with 100% accuracy' },
  met: (r) => r.accuracy >= 100,
});
const swift = (stageId: Exclude<StageId, 'daily'>, sec = goalTime(stageId)): ChallengeDef => ({
  id: `${stageId}_swift`, stageId,
  name: { ko: '골드 시간', en: 'Gold time' },
  desc: { ko: `${Math.floor(sec / 60)}분 ${sec % 60 ? `${sec % 60}초 ` : ''}안에 완료`, en: `Finish within ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` },
  met: (r) => r.elapsedSec <= sec,
});
const perfect = (stageId: Exclude<StageId, 'daily'>, count: number, what: { ko: string; en: string }): ChallengeDef => ({
  id: `${stageId}_perfect`, stageId,
  name: { ko: `PERFECT ${count}회`, en: `${count} PERFECT` },
  desc: { ko: `지우지 않고 ${what.ko} ${count}개 완성`, en: `${count} ${what.en} typed with no backspace` },
  met: (r) => r.perfectCount >= count,
});
const combo = (stageId: Exclude<StageId, 'daily'>, count: number): ChallengeDef => ({
  id: `${stageId}_combo`, stageId,
  name: { ko: `${count}콤보`, en: `${count} combo` },
  desc: { ko: `한 판에 ${count}콤보 달성`, en: `Reach a ${count} combo in one run` },
  met: (r) => r.maxCombo >= count,
});

export const CHALLENGES: ChallengeDef[] = [
  // S1 푸른 숲: 낱말 30개, 골드 2:00. 250타 학생도 지우기 없이 25개는 집중해야 한다.
  flawless('stage_1'), swift('stage_1'), perfect('stage_1', 25, { ko: '낱말', en: 'words' }),
  // S2 네온 시티: 800m, 골드 1:30. 고스트 추월은 두 번째 판부터 가능하다.
  flawless('stage_2'), swift('stage_2'),
  { id: 'stage_2_ghost', stageId: 'stage_2', name: { ko: '고스트 추월', en: 'Beat the ghost' }, desc: { ko: '어제의 나보다 먼저 도착', en: 'Finish ahead of your ghost' }, met: (r) => r.beatGhost === true },
  // S3 사막 유적: 편지 9문장, 골드 3:40(별에는 시간 조건이 없다).
  flawless('stage_3'), swift('stage_3'), perfect('stage_3', 7, { ko: '문장', en: 'sentences' }),
  // S4 폭주 열차: 전보 5문장. 골드 2:30은 대부분 자동으로 넘기므로 1:30으로 조인다.
  flawless('stage_4'), swift('stage_4', 90), perfect('stage_4', 5, { ko: '전보', en: 'telegrams' }),
  // S5 어둠의 성채: 골드 4:00, 별 콤보 15 → 카드 콤보 25.
  flawless('stage_5'), swift('stage_5'), combo('stage_5', 25),
];
export const CHALLENGE_TOTAL = CHALLENGES.length;

export function challengesFor(stageId: StageId): ChallengeDef[] {
  return CHALLENGES.filter((c) => c.stageId === stageId);
}
export function getChallenge(id: string): ChallengeDef | undefined {
  return CHALLENGES.find((c) => c.id === id);
}
export function challengeName(c: ChallengeDef, language: GameLanguage): string { return c.name[language] ?? c.name.ko; }
export function challengeDesc(c: ChallengeDef, language: GameLanguage): string { return c.desc[language] ?? c.desc.ko; }

/** 이번 완료 결과로 새로 채운 카드 id (이미 가진 카드 제외). 미완료 판은 아무것도 주지 않는다. */
export function evaluateChallenges(result: ChallengeResult, stageId: StageId, done: string[] = []): string[] {
  if (!result.cleared || result.wordsDone <= 0 || stageId === 'daily') return [];
  return challengesFor(stageId).filter((c) => !done.includes(c.id) && c.met(result)).map((c) => c.id);
}

/** 지역별 달성 카드 id 목록(저장 값이 없거나 손상돼도 빈 배열). */
export function challengesDone(save: Pick<SaveData, 'progress'>, stageId: StageId): string[] {
  const list = save.progress.challenges?.[stageId] ?? [];
  const ids = new Set(challengesFor(stageId).map((c) => c.id));
  return list.filter((id) => ids.has(id));
}
export function challengeCount(save: Pick<SaveData, 'progress'>): number {
  return STAGES.reduce((n, st) => n + challengesDone(save, st.id).length, 0);
}
