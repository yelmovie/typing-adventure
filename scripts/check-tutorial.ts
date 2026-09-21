import assert from 'node:assert/strict';
import { practiceAccuracy, practiceCpm, practiceStrokeErrors, TutorialSystem } from '../src/game/systems/TutorialSystem';
import { defaultSave, validateSave } from '../src/game/systems/SaveValidation';
import { practiceReady, stagePracticeParts, PRACTICE_PARTS } from '../src/game/systems/StagePracticeRules';
import { nextKeyHint } from '../src/game/util/hangul';

for (const language of ['ko', 'en'] as const) {
  const lesson = new TutorialSystem(language);
  assert.equal(lesson.next(), false, 'Cannot skip an unfinished step');
  assert.equal(lesson.submit(''), 'wrong');
  assert.equal(lesson.submit('wrong target'), 'wrong');
  assert.equal(lesson.stepIndex, 0, 'Wrong input keeps the target');
  for (let i = 0; i < 4; i++) {
    if (lesson.step.prefill) assert.equal(lesson.submit(lesson.step.prefill), 'wrong', 'Prefilled typo is not a success');
    if (i === 2) assert.equal(lesson.submit(lesson.target.replace(' ', '')), 'wrong', 'Spacing is required');
    while (!lesson.stepComplete) lesson.submit(lesson.target.normalize('NFD'));
    assert.equal(lesson.submit(lesson.target), 'ignored', 'Repeated Enter cannot advance or award success twice');
    assert.equal(lesson.complete, i === 3);
    if (i < 3) assert.equal(lesson.next(), true);
  }
  assert.equal(lesson.next(), false);
  const combo = new TutorialSystem(language);
  for (let step = 0; step < 3; step++) { while (!combo.stepComplete) combo.submit(combo.target); combo.next(); }
  const first = combo.target;
  assert.equal(combo.submit(first), 'correct');
  assert.equal(combo.submit('incorrect'), 'wrong');
  assert.equal(combo.target, combo.step.targets[1], 'Mistakes keep completed story sentences');
  assert.equal(combo.complete, false);
  while (!combo.complete) combo.submit(combo.target);
  for (const part of PRACTICE_PARTS) {
    const single = new TutorialSystem(language, [part]);
    assert.equal(single.steps.length, 1);
    while (!single.complete) single.submit(single.target);
    assert.equal(single.next(), false);
  }
}
assert.deepEqual(new TutorialSystem('ko').steps.map(s => s.targets.length), [19, 21, 50, 3]);
assert.equal(new Set(new TutorialSystem('ko', ['sentences']).step.targets).size, 50, 'World practice sentences stay unique');
assert.equal(practiceCpm(0, '학교', '학', 30_000), 6, 'CPM counts actual 2-beolsik strokes during IME composition');
assert.equal(practiceStrokeErrors('학교', '학겨'), 1, 'Only entered mismatched strokes count as errors');
assert.equal(practiceAccuracy(9, 1), 90);
assert.equal(practiceAccuracy(0, 0), 100);
assert.deepEqual(nextKeyHint('ㅙ', 'ㅗ'), { type: 'key', stroke: { key: 'ㅐ', shift: false } });
assert.deepEqual(nextKeyHint('ㄲ', ''), { type: 'key', stroke: { key: 'ㄱ', shift: true } });
for (const [index, part] of PRACTICE_PARTS.entries()) assert.deepEqual(stagePracticeParts(`stage_${index + 1}` as 'stage_1'), [part]);
assert.deepEqual(stagePracticeParts('stage_5'), PRACTICE_PARTS);
const prep = defaultSave().progress;
assert.equal(practiceReady(prep,'stage_1'), false);
prep.practicedParts = ['consonants'];
assert.equal(practiceReady(prep,'stage_1'), true);
assert.equal(practiceReady(prep,'stage_2'), false);
assert.equal(practiceReady(defaultSave().progress,'stage_1'), false);
const skipped = defaultSave().progress;
skipped.skippedPracticeStages = ['stage_2'];
assert.equal(practiceReady(skipped,'stage_2'), true,'An intentional skip unlocks only that stage');
assert.equal(practiceReady(skipped,'stage_1'), false);
prep.clearedStages=['stage_1','stage_2','stage_3','stage_4'];
assert.equal(practiceReady(prep,'stage_5'), true, 'Boss reuses earlier parts');
assert.deepEqual(new TutorialSystem('ko', undefined, true).steps.map(s => s.targets.length), [3, 3, 1, 2]);
assert.deepEqual(new TutorialSystem('en', undefined, true).steps.map(s => s.targets.length), [3, 3, 1, 2]);
const before = defaultSave();
const save = validateSave({ ...before, progress: { ...before.progress, tutorialCompleted: true }, records: { ...before.records, ghosts: { stage_2: { samples: [0, 100, 500], finishSec: 65, goalDistance: 500, rulesVersion: 2 } } }, languageArchives: { en: before } });
assert.equal(save.progress.tutorialCompleted, true);
assert.equal(save.languageArchives?.en?.progress.tutorialCompleted, false);
assert.equal(save.progress.coins, 0);
assert.deepEqual(save.stats, before.stats);
assert.equal(save.records.ghosts.stage_2.goalDistance, 500);
assert.equal(save.records.ghosts.stage_2.rulesVersion, 2);
const legacy = validateSave({ records: { ghosts: { stage_2: { samples: [0, 1000], finishSec: 120 } } } });
assert.equal(legacy.records.ghosts.stage_2.goalDistance, undefined, 'Do not relabel old 1000m records');
assert.equal(legacy.progress.tutorialCompleted, false);
assert.deepEqual(validateSave({progress:{practicedParts:['vowels','bad','vowels']}}).progress.practicedParts,['vowels']);
assert.deepEqual(validateSave({progress:{skippedPracticeStages:['stage_2','daily','bad','stage_2']}}).progress.skippedPracticeStages,['stage_2']);
const malformed = validateSave({ progress: { tutorialCompleted: 'true' }, records: { ghosts: { stage_2: { goalDistance: Infinity, rulesVersion: -1 } } } });
assert.equal(malformed.progress.tutorialCompleted, false);
assert.equal(malformed.records.ghosts.stage_2.goalDistance, undefined);
assert.equal(malformed.records.ghosts.stage_2.rulesVersion, undefined);
console.log('PASS tutorial: bilingual real-input steps, typo/spacing correction, repeat guards, language archives and legacy ghost migration');
