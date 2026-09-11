import type { SaveProgress, StageId } from '../types';
import type { TutorialStep } from './TutorialSystem';

export type PracticePart = TutorialStep['part'];
export const PRACTICE_PARTS: PracticePart[] = ['consonants', 'vowels', 'sentences', 'story'];
export const PART_LABELS: Record<PracticePart, [string, string]> = {
  consonants: ['자음', 'Consonants'], vowels: ['모음', 'Vowels'],
  sentences: ['문장', 'Sentences'], story: ['짧은 글', 'Short story'],
};
export function stagePracticeParts(stageId: StageId): PracticePart[] {
  if (stageId === 'daily') return [];
  const mapping: Partial<Record<StageId, PracticePart>> = { stage_1: 'consonants', stage_2: 'vowels', stage_3: 'sentences', stage_4: 'story' };
  const part = mapping[stageId];
  return part ? [part] : [...PRACTICE_PARTS];
}

/** A completed lesson stays learned. Retries never consume it or reset a child's record. */
export function practicedParts(progress: SaveProgress): PracticePart[] {
  if (progress.tutorialCompleted) return [...PRACTICE_PARTS];
  return [...new Set([...(progress.practicedParts ?? []), ...progress.clearedStages.flatMap(id => stagePracticeParts(id as StageId))])];
}

export function practiceReady(progress: SaveProgress, stageId: StageId): boolean {
 return stageId === 'daily' || stagePracticeParts(stageId).every(part => practicedParts(progress).includes(part));
}
