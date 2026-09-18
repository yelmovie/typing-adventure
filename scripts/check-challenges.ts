// 도전 카드·모험 플러스 이야기 진행 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { CHALLENGES, CHALLENGE_TOTAL, challengesFor, evaluateChallenges, challengesDone, challengeCount, getChallenge, challengeName } from '../src/game/data/challenges';
import { buildRemixStory, remixStoryCount, remixStoryIndexOf, REMIX_STORIES } from '../src/game/data/remixStories';
import { getContentForStage, getRemixPick } from '../src/game/data/content';
import { defaultSave, validateSave } from '../src/game/systems/SaveValidation';
import { STAGES } from '../src/game/data/stages';
import { setLanguage } from '../src/game/i18n/Locale';
import type { ChallengeResult } from '../src/game/data/challenges';

// 1. 지역마다 카드 3개, id 는 `${stage}_` 로 시작, 이름·설명은 두 언어 모두.
assert.equal(CHALLENGE_TOTAL, 15);
for (const st of STAGES) {
  const cards = challengesFor(st.id);
  assert.equal(cards.length, 3, `${st.id} 카드 3개`);
  for (const c of cards) {
    assert.ok(c.id.startsWith(`${st.id}_`), c.id);
    assert.ok(c.name.ko && c.name.en && c.desc.ko && c.desc.en, `${c.id} 이름·설명`);
    assert.equal(/[가-힣]/.test(c.name.en + c.desc.en), false, `${c.id} 영어 문구`);
  }
}
assert.equal(new Set(CHALLENGES.map((c) => c.id)).size, CHALLENGE_TOTAL);
assert.equal(challengesFor('daily').length, 0);
assert.equal(challengeName(getChallenge('stage_2_ghost')!, 'en'), 'Beat the ghost');

// 2. 판정: 별 3개짜리 평범한 완료(정확도 96·골드 시간 초과·콤보 10)는 카드를 하나도 못 받는다 — 별보다 엄격.
const ordinary: ChallengeResult = { cleared: true, accuracy: 96, elapsedSec: 200, maxCombo: 10, perfectCount: 4, beatGhost: false, wordsDone: 30 };
for (const st of STAGES) assert.deepEqual(evaluateChallenges({ ...ordinary, elapsedSec: st.goalTimeSec + 30 }, st.id), [], `${st.id}: 평범한 완료(골드 시간 +30초, PERFECT 4, 10콤보)는 카드 없음`);
// 실수 없이 + 골드 시간 안에 + PERFECT 25 → S1 세 장 모두.
const s1Best: ChallengeResult = { cleared: true, accuracy: 100, elapsedSec: 110, maxCombo: 30, perfectCount: 26, wordsDone: 30 };
assert.deepEqual(evaluateChallenges(s1Best, 'stage_1'), ['stage_1_flawless', 'stage_1_swift', 'stage_1_perfect']);
assert.deepEqual(evaluateChallenges({ ...s1Best, elapsedSec: 121 }, 'stage_1'), ['stage_1_flawless', 'stage_1_perfect'], '골드 시간 120초 초과');
assert.deepEqual(evaluateChallenges({ ...s1Best, accuracy: 99.9, perfectCount: 24 }, 'stage_1'), ['stage_1_swift']);
// 미완료·입력 없음·오늘의 도전은 아무것도 주지 않는다.
assert.deepEqual(evaluateChallenges({ ...s1Best, cleared: false }, 'stage_1'), []);
assert.deepEqual(evaluateChallenges({ ...s1Best, wordsDone: 0 }, 'stage_1'), []);
assert.deepEqual(evaluateChallenges(s1Best, 'daily'), []);
// 이미 가진 카드는 다시 주지 않는다.
assert.deepEqual(evaluateChallenges(s1Best, 'stage_1', ['stage_1_flawless', 'stage_1_swift']), ['stage_1_perfect']);
// S2 고스트 추월은 beatGhost 가 true 일 때만(첫 판 undefined 는 아님).
assert.deepEqual(evaluateChallenges({ ...ordinary, beatGhost: undefined }, 'stage_2'), []);
assert.deepEqual(evaluateChallenges({ ...ordinary, beatGhost: true }, 'stage_2'), ['stage_2_ghost']);
assert.deepEqual(evaluateChallenges({ ...ordinary, elapsedSec: 90 }, 'stage_2'), ['stage_2_swift']);
// S3 편지: PERFECT 7문장, 골드 220초. S4 전보: 90초(골드 150초보다 조임), PERFECT 5문장. S5: 25콤보.
assert.deepEqual(evaluateChallenges({ ...ordinary, perfectCount: 7, elapsedSec: 220 }, 'stage_3'), ['stage_3_swift', 'stage_3_perfect']);
assert.deepEqual(evaluateChallenges({ ...ordinary, perfectCount: 6, elapsedSec: 221 }, 'stage_3'), []);
assert.deepEqual(evaluateChallenges({ ...ordinary, perfectCount: 5, elapsedSec: 140 }, 'stage_4'), ['stage_4_perfect'], '전보 골드 150초는 자동 통과라 카드는 90초');
assert.deepEqual(evaluateChallenges({ ...ordinary, elapsedSec: 90 }, 'stage_4'), ['stage_4_swift']);
assert.deepEqual(evaluateChallenges({ ...ordinary, maxCombo: 25, elapsedSec: 240 }, 'stage_5'), ['stage_5_swift', 'stage_5_combo']);
assert.deepEqual(evaluateChallenges({ ...ordinary, maxCombo: 24, elapsedSec: 241 }, 'stage_5'), []);

// 3. 저장: 손상된 값은 버리고 올바른 카드 id·이야기 번호만 남긴다. 합계도 손상 값을 세지 않는다.
{
  const save = validateSave({ progress: { challenges: { stage_1: ['stage_1_flawless', 'stage_2_swift', 42, 'stage_1_flawless'], stage_9: ['x'], daily: ['daily_x'] }, storiesDone: { stage_3: [0, 4, 4, 5, -1, 1.5, 'a'], stage_4: 'nope' } } });
  assert.deepEqual(save.progress.challenges, { stage_1: ['stage_1_flawless'] });
  assert.deepEqual(save.progress.storiesDone, { stage_3: [0, 4], stage_4: [] });
  assert.deepEqual(challengesDone(save, 'stage_1'), ['stage_1_flawless']);
  assert.equal(challengeCount(save), 1);
  assert.deepEqual(defaultSave().progress.challenges, {});
  assert.deepEqual(defaultSave().progress.storiesDone, {});
  assert.equal(challengeCount(validateSave(null)), 0);
  const legacy = { ...defaultSave(), progress: { unlockedStage: 1, stageStars: {}, clearedStages: [], coins: 0, fails: {}, assist: {} } };
  assert.equal(challengeCount(legacy), 0, '옛 저장(필드 없음)도 0으로 읽는다');
}

// 4. 이야기 고르기: 완주하지 않은 이야기를 순서대로 먼저, 다 채우면 직전을 피해 무작위.
assert.equal(remixStoryCount('stage_3'), 5);
assert.equal(remixStoryCount('stage_4'), 5);
assert.equal(remixStoryCount('stage_1'), 0);
assert.equal(remixStoryCount('stage_5'), 0);
for (const lang of ['ko', 'en'] as const) {
  setLanguage(lang);
  for (const stage of ['stage_3', 'stage_4'] as const) {
    const originals = getContentForStage(stage);
    const played: number[] = [];
    // 새 학생: 0 → 1 → 2 → 3 → 4 순으로 이야기 n/5 가 차오른다.
    for (let n = 0; n < 5; n++) {
      const pick = buildRemixStory(stage, lang, originals, () => 0.99, played)!;
      assert.equal(pick.storyIndex, n, `${lang} ${stage}: 안 한 이야기 중 첫 번째(${n})`);
      assert.deepEqual(pick.units.map((u) => u.text), REMIX_STORIES[lang][stage][n]);
      assert.ok(pick.units.every((u) => u.tags.includes(`이야기${n + 1}`)));
      played.push(pick.storyIndex);
    }
    // 하나 빼먹었다면(예: 2번 미완주) 그것부터.
    const gap = buildRemixStory(stage, lang, originals, () => 0.99, [0, 1, 3, 4])!;
    assert.equal(gap.storyIndex, 2);
    // 전부 완주: 직전(2)을 피해 무작위.
    const seen = new Set<number>();
    for (let n = 0; n < 20; n++) {
      const pick = buildRemixStory(stage, lang, originals, () => (n % 4) / 4, [0, 1, 2, 3, 4])!;
      seen.add(pick.storyIndex);
    }
    assert.ok(seen.size >= 3, `${lang} ${stage}: 다 채운 뒤에는 여러 이야기가 나온다`);
    // getRemixPick 은 storyIndex 를 함께 돌려주고, 완주한 문장으로 번호를 되찾을 수 있다(이어하기 복원용).
    const pick = getRemixPick(stage, [0, 1]);
    assert.equal(pick.storyIndex, 2);
    assert.equal(remixStoryIndexOf(stage, lang, pick.units.map((u) => u.text)), 2);
    assert.equal(remixStoryIndexOf(stage, lang, ['이런 문장은 없다']), undefined);
  }
  assert.equal(getRemixPick('stage_1').storyIndex, undefined, '낱말 지역은 이야기 번호가 없다');
  assert.equal(getRemixPick('stage_5').storyIndex, undefined);
}
setLanguage('ko');
console.log('PASS challenges: 15 cards stricter than stars, save validation, unplayed-first story picking');
