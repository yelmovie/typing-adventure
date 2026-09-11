import assert from 'node:assert/strict';
import { journeyFor, journeyGoal, journeyProgress } from '../src/game/data/worldJourney';
import { STAGES } from '../src/game/data/stages';
import { getContentForStage, getRemixContent } from '../src/game/data/content';
import { REMIX_STORIES, buildRemixStory } from '../src/game/data/remixStories';
import { defaultSave, validateSave } from '../src/game/systems/SaveValidation';
import { calcStars } from '../src/game/systems/AwardRules';
import { setLanguage } from '../src/game/i18n/Locale';

const save = defaultSave();
assert.equal(journeyProgress(save).restored.length, 0, 'A fresh adventure awards no lights');
assert.equal(journeyProgress(save).next?.id, 'stage_1');
const damaged = { ...save, progress: { ...save.progress, clearedStages: ['stage_1', 'stage_1', 'daily', 'invalid'] as typeof save.progress.clearedStages } };
assert.equal(journeyProgress(damaged).restored.length, 1, 'Duplicate or unrelated ids cannot award extra lights');
for (const [i, stage] of STAGES.entries()) {
  save.progress.clearedStages.push(stage.id);
  save.progress.unlockedStage = Math.min(5, i + 2);
  save.progress.stageStars[stage.id] = 3;
  const progress = journeyProgress(save);
  assert.equal(progress.restored.length, i + 1);
  assert.equal(progress.complete, i === 4);
  assert.equal(progress.next?.id, STAGES[Math.min(4, i + 1)].id === stage.id ? 'stage_1' : STAGES[i + 1].id);
}
save.progress.stageStars.stage_3 = 2;
assert.equal(journeyProgress(save).next?.id, 'stage_3', 'After finishing, recommend a reachable missing star');
assert.deepEqual(journeyProgress(validateSave(save)).restored, journeyProgress(save).restored, 'Lights survive save round-trip without a second schema');
assert.equal(journeyFor('daily'), undefined);
assert.equal(STAGES[3].goalCombo, 3, 'The telegram combo star can be earned within its three sentences');
for (const lang of ['ko', 'en'] as const) {
  setLanguage(lang);
  for (const stage of STAGES) {
    const chapter = journeyFor(stage.id, lang)!;
    assert.ok(chapter.mission && chapter.restored && chapter.next && chapter.replay);
    if (lang === 'en') assert.equal(/[가-힣]/.test(JSON.stringify(chapter)), false);
    if (stage.mode === 'letter') {
      assert.equal(calcStars(stage, true, 95, 99999, 0), 3);
      assert.match(journeyGoal(stage, 2, lang), lang === 'en' ? /No speed requirement/ : /속도 조건은 없어/);
    } else {
      assert.equal(calcStars(stage, true, 95, stage.goalTimeSec, 0), 3);
      assert.equal(calcStars(stage, true, 95, 99999, stage.goalCombo), 3);
    }
  }
  for (const stage of ['stage_3', 'stage_4'] as const) {
    const expected = stage === 'stage_3' ? 6 : 3;
    for (const story of REMIX_STORIES[lang][stage]) {
      assert.equal(story.length, expected);
      assert.equal(new Set(story).size, expected);
      for (const line of story) {
        assert.equal(line.normalize('NFC'), line);
        assert.ok(line.length <= (lang === 'en' ? 40 : 32), `Readable sentence: ${line}`);
        assert.equal(lang === 'en' ? /[가-힣]/.test(line) : /[A-Za-z]/.test(line), false);
      }
    }
    let previous = '';
    for (let n = 0; n < 12; n++) {
      const units = buildRemixStory(stage, lang, getContentForStage(stage), () => n % 2)!;
      const text = units.map(unit => unit.text);
      assert.ok(REMIX_STORIES[lang][stage].some(story => JSON.stringify(story) === JSON.stringify(text)), 'An intact ordered story is selected');
      const signature = text.join('|');
      assert.notEqual(signature, previous, 'Immediate repeated story avoided even with the same random draw');
      assert.deepEqual(units.map(unit => unit.tags[1]), Array.from({ length: expected }, (_, i) => `순서${i + 1}`));
      previous = signature;
    }
  }
  for (const stage of ['stage_1', 'stage_2'] as const) {
    const originals = getContentForStage(stage);
    const pool = new Set(originals.map(unit => unit.text));
    for (let n = 0; n < 10; n++) {
      const remix = getRemixContent(stage);
      assert.equal(new Set(remix.map(unit => unit.text)).size, pool.size, 'No duplicate fallback words in a remix pool');
      remix.forEach((unit, i) => {
      assert.ok(pool.has(unit.text), 'Words stay inside their region');
      assert.equal(unit.text.length, originals[i].text.length);
      assert.equal(unit.difficulty, originals[i].difficulty);
      assert.deepEqual(unit.tags, originals[i].tags);
      const replacement = originals.find(candidate => candidate.text === unit.text)!;
      for (const tag of originals[i].tags.filter(tag => ['받침', '이중모음', '박쥐', '대장'].includes(tag))) assert.ok(replacement.tags.includes(tag));
      });
    }
  }
  assert.deepEqual(getRemixContent('stage_5'), getContentForStage('stage_5'), 'Boss role pool remains intact');
}
console.log('PASS journey: five-light save progression, reachable goals, bilingual coherent remix stories, repetition and learning contracts');
