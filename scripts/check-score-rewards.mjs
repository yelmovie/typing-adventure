import assert from 'node:assert/strict';
import { build } from 'esbuild';

// 실제 ScoreSystem을 실행한다. 브라우저 저장 경계만 메모리 fixture로 바꾼다.
const output = await build({
  stdin: {
    contents: "export { finalizeAndSave } from './src/game/systems/ScoreSystem'; export { defaultSave } from './src/game/systems/SaveValidation'; export { getStage } from './src/game/data/stages';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
  plugins: [{ name: 'memory-save-boundary', setup(builder) {
    builder.onResolve({ filter: /(?:^|\/)SaveSystem$/ }, () => ({ path: 'save-fixture', namespace: 'score-check' }));
    builder.onLoad({ filter: /.*/, namespace: 'score-check' }, () => ({ contents: 'export const SaveSystem = { get: () => globalThis.__scoreRewardFixture, save: () => true };', loader: 'js' }));
  } }],
});
const { finalizeAndSave, defaultSave, getStage } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const partial = { stageId: 'stage_1', cleared: true, score: 1000, accuracy: 100, cpm: 100, maxCombo: 10, elapsedSec: 60, wordsDone: 10, perfectCount: 10, playerHp: 100, coins: 15, wordsSeen: [], learningAttempts: [], correctedCount: 0, attemptedCount: 10, skippedCount: 0 };
try {
  for (const language of ['ko', 'en']) {
    const save = defaultSave();
    save.settings.language = language;
    save.progress.coins = 190;
    globalThis.__scoreRewardFixture = save;
    const first = finalizeAndSave(partial, getStage('stage_1'));
    assert.equal(save.progress.coins, 205);
    assert.ok(first.newBadges.includes('coin_collector'), '이번 판 임계값 도달 결과에서 즉시 배지 지급');
    const second = finalizeAndSave({ ...partial, coins: 0 }, getStage('stage_1'));
    assert.ok(!second.newBadges.includes('coin_collector'), '배지는 최초 한 번만 지급');
    assert.equal(save.collection.badges.filter((id) => id === 'coin_collector').length, 1);
  }
  globalThis.__scoreRewardFixture = defaultSave();
  const empty = finalizeAndSave({ ...partial, wordsDone: 0, attemptedCount: 0, coins: 0 }, getStage('stage_1'));
  assert.equal(empty.cleared, false);
  assert.deepEqual(empty.newBadges, []);
  assert.deepEqual(globalThis.__scoreRewardFixture.progress.clearedStages, []);
  console.log('PASS score rewards: KO/EN same-result coin badge, idempotent badge, zero-input guard');
} finally { delete globalThis.__scoreRewardFixture; }
