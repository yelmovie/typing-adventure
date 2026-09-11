import type { BattleResult, SaveData } from '../types';

export const REPLAY_GOALS = [
  { id: 'steady', name: '차근차근 정확하게', nameEn: 'Steady and accurate', desc: '정확도 90% 이상으로 10개 완성 또는 편지·전보 한 지역 완주', descEn: 'Reach 90% accuracy with 10 completed targets, or finish a letter or telegram region.' },
  { id: 'repair', name: '실수를 나의 힘으로', nameEn: 'Learn from a mistake', desc: '틀린 글자를 고쳐서 1개 이상 정확하게 완성', descEn: 'Correct a real typing mistake and complete at least one target.' },
  { id: 'remix', name: '새로운 길의 발견', nameEn: 'Discover a new path', desc: '모험 플러스에서 새로운 낱말 조합으로 한 지역 완료', descEn: 'Complete a region with a fresh set of targets in Adventure Plus.' },
] as const;
export function replayDay(now = new Date()): string {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}
export function replayProgress(save: SaveData) {
  const day = replayDay();
  const previous = save.records.replay;
  return save.records.replay = previous?.day === day ? previous : { day, completed: [], stamps: previous?.stamps ?? 0 };
}
export function replayTitle(stamps: number): string {
  return stamps >= 30 ? '별빛 길잡이' : stamps >= 15 ? '글자 수호자' : stamps >= 5 ? '별빛 탐험가' : '새로운 발걸음';
}
export function awardReplay(save: SaveData, result: Pick<BattleResult, 'wordsDone' | 'accuracy' | 'correctedCount' | 'remix' | 'cleared'> & Partial<Pick<BattleResult, 'stageId'>>): string[] {
  const progress = replayProgress(save);
  const sentenceComplete = result.cleared && ((result.stageId === 'stage_3' && result.wordsDone >= 6) || (result.stageId === 'stage_4' && result.wordsDone >= 3));
  const achieved = { steady: (result.wordsDone >= 10 || sentenceComplete) && result.accuracy >= 90, repair: (result.correctedCount ?? 0) > 0 && result.wordsDone > 0, remix: result.remix === true && result.cleared && result.wordsDone > 0 };
  const added = REPLAY_GOALS.filter((goal) => achieved[goal.id] && !progress.completed.includes(goal.id));
  progress.completed.push(...added.map((goal) => goal.id));
  progress.stamps += added.length;
  return added.map((goal) => goal.name);
}
