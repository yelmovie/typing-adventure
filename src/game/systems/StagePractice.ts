import type { GameLanguage, StageId } from '../types';
import { SaveSystem } from './SaveSystem';
import { practiceReady, stagePracticeParts, type PracticePart } from './StagePracticeRules';
export * from './StagePracticeRules';

function progressFor(language: GameLanguage) {
  const save = SaveSystem.get();
  return (save.settings.language ?? 'ko') === language ? save.progress : save.languageArchives?.[language]?.progress;
}
export const StagePractice = {
  ready(stageId: StageId, language: GameLanguage, _remix = false) {
    if (stageId === 'daily') return true;
    const progress = progressFor(language);
    return !!progress && practiceReady(progress, stageId);
  },
  completePart(part: PracticePart, language: GameLanguage) {
    const progress = progressFor(language);
    if (!progress) return;
    progress.practicedParts = [...new Set([...(progress.practicedParts ?? []), part])];
    SaveSystem.save();
  },
  complete(stageId: StageId, language: GameLanguage, _remix = false) {
    const progress = progressFor(language);
    if (!progress) return;
    progress.practicedParts = [...new Set([...(progress.practicedParts ?? []), ...stagePracticeParts(stageId)])];
    SaveSystem.save();
  },
};
