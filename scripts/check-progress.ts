import assert from 'node:assert/strict';
import { defaultSave, validateSave, hasInvalidStructure } from '../src/game/systems/SaveValidation';
import { recordLearning, practicePlan, errorPattern, strongestFocus, needsCorrection, learningOf } from '../src/game/systems/LearningSystem';
import { awardReplay } from '../src/game/systems/ReplaySystem';
import { calcStars, hasAchievement } from '../src/game/systems/AwardRules';
import { allContent, getContentForStage, getRemixContent } from '../src/game/data/content';
import { STAGES, DAILY_STAGE } from '../src/game/data/stages';
import { setLanguage } from '../src/game/i18n/Locale';
import type { LearningAttempt, LearningSession } from '../src/game/types';

const corrupt = { version: '1', profile: { name: '모험가', characterId: 'missing' }, progress: { stageStars: null, clearedStages: null, coins: -10 }, records: { bestAccuracy: Infinity, daily: null }, settings: { bgm: 'false', bgmVolume: 20 }, collection: { badges: null } };
assert.equal(hasInvalidStructure(corrupt), true);
const safe = validateSave(corrupt);
assert.deepEqual(safe.progress.stageStars, {});
assert.deepEqual(safe.progress.clearedStages, []);
assert.equal(safe.profile.name, '모험가');
assert.equal(safe.profile.characterId, 'brown_boy');
assert.equal(safe.progress.coins, 0);
assert.equal(safe.settings.bgmVolume, 1);
assert.equal(safe.settings.bgm, true);
assert.equal(safe.records.bestAccuracy, 0);
const legacy = validateSave({ profile: { name: '하늘' }, progress: { clearedStages: ['stage_2'], stageStars: { stage_2: 2 } } });
assert.equal(legacy.progress.unlockedStage, 3);
assert.equal(legacy.profile.name, '하늘');
assert.deepEqual(validateSave(null).progress.clearedStages, []);
assert.equal(Object.prototype.hasOwnProperty.call(validateSave(JSON.parse('{"progress":{"stageStars":{"__proto__":3}}}')).progress.stageStars, '__proto__'), false);
const archived = validateSave({ ...defaultSave(), languageArchives: { en: { ...defaultSave(), profile: { name: 'English hero' }, progress: { stageStars: null } } } });
assert.equal(archived.languageArchives?.en?.profile.name, 'English hero');
assert.deepEqual(archived.languageArchives?.en?.progress.stageStars, {});
assert.equal(hasInvalidStructure({ ...defaultSave(), languageArchives: { en: { progress: { stageStars: null, clearedStages: null } } } }), true, 'Archive repairs also show the recovery notice');
assert.equal(hasInvalidStructure({ ...defaultSave(), languageArchives: { en: null } }), true);
assert.equal(hasInvalidStructure({ ...defaultSave(), languageArchives: { en: defaultSave() } }), false);

const save = defaultSave();
const attempt = (target: string, typed: string, outcome: LearningAttempt['outcome'], corrected = false): LearningAttempt => ({ targetId: target, target, typed, outcome, corrected });
const session = (at: string): Omit<LearningSession, 'newSuccesses'> => ({ at, stageId: 'stage_1', source: 'game', accuracy: 90, cpm: 100, correct: 2, corrected: 1, skipped: 0 });
assert.equal(errorPattern('밤', '밥'), 'batchim');
assert.equal(errorPattern('한 걸음', '한걸음'), 'spacing');
assert.equal(errorPattern('Go!', 'Go'), 'punctuation');
recordLearning(save, [attempt('밤', '밥', 'wrong'), attempt('밤', '밤', 'correct', true), attempt('강', '강', 'correct')], session('2026-09-10T00:00:00Z'));
assert.equal(save.records.learning?.patterns.batchim?.mistakes, 1);
assert.equal(save.records.learning?.patterns.batchim?.corrections, 1);
assert.equal(save.records.learning?.patterns.batchim?.newSuccesses, 1);
recordLearning(save, [attempt('강', '강', 'correct')], session('2026-09-11T00:00:00Z'));
assert.equal(save.records.learning?.patterns.batchim?.newSuccesses, 1, 'repeating an old target is not transfer');
recordLearning(save, [attempt('별', '별', 'correct')], session('2026-09-14T00:00:00Z'));
assert.equal(save.records.learning?.patterns.batchim?.delayedSuccesses, 1);
for (let i = 0; i < 80; i++) recordLearning(save, [], session('2026-09-14T00:00:00Z'));
assert.equal(save.records.learning?.recent.length, 60);
assert.equal(strongestFocus(save), undefined, '원문 교정+다른 예시2개 성공 뒤 해당 패턴 추천 졸업');
assert.notEqual(practicePlan(save, allContent()).items[0].text, '밤');
assert.equal(hasAchievement({ cleared: true, wordsDone: 0, accuracy: 100 }), false);
assert.equal(calcStars(DAILY_STAGE, true, 0, 0, 0), 0);
assert.equal(calcStars(DAILY_STAGE, true, 91, 200, 10), 2);
assert.equal(calcStars(DAILY_STAGE, true, 96, 200, 10), 3);
assert.equal(awardReplay(save, { wordsDone: 0, accuracy: 100, correctedCount: 0, remix: true, cleared: true }).length, 0);
assert.equal(awardReplay(save, { wordsDone: 20, accuracy: 96, correctedCount: 1, remix: true, cleared: true }).length, 3);
assert.equal(awardReplay(save, { wordsDone: 20, accuracy: 96, correctedCount: 1, remix: true, cleared: true }).length, 0);

// 모드의 실제 문장 수를 완료하면 낱말10개와 동등하게 정확 입력 인장을 받을 수 있다.
for (const [stageId, wordsDone] of [['stage_3', 6], ['stage_4', 3]] as const) {
  const fixture = defaultSave();
  const result = { stageId, wordsDone, accuracy: 95, correctedCount: 0, remix: false, cleared: true };
  assert.equal(awardReplay(fixture, { ...result, cleared: false }).length, 0, '미완주는 문장 인장 아님');
  assert.equal(awardReplay(fixture, { ...result, wordsDone: 0 }).length, 0);
  assert.equal(awardReplay(fixture, { ...result, wordsDone: wordsDone - 1 }).length, 0);
  assert.equal(awardReplay(fixture, { ...result, accuracy: 89 }).length, 0);
  assert.deepEqual(awardReplay(fixture, result), ['차근차근 정확하게']);
  assert.deepEqual(awardReplay(fixture, result), [], '같은 날 중복 인장 없음');
}

// 이미 교정한 원문에 corrected:true를 반복 전달해도 새 교정으로 부풀리지 않는다.
const practiceSave = defaultSave();
recordLearning(practiceSave, [attempt('밤', '밥', 'wrong')], session('2026-09-10T00:00:00Z'));
assert.ok(needsCorrection(practiceSave, '밤'));
const practiceSession = { ...session('2026-09-10T01:00:00Z'), source: 'practice' as const };
const repaired = recordLearning(practiceSave, [attempt('밤', '밤', 'correct', true)], practiceSession);
assert.equal(repaired.corrected, 1);
assert.equal(needsCorrection(practiceSave, '밤'), false);
for (let i = 0; i < 3; i++) assert.equal(recordLearning(practiceSave, [attempt('밤', '밤', 'correct', true)], practiceSession).corrected, 0);
assert.equal(practiceSave.records.learning!.patterns.batchim!.corrections, 1);
recordLearning(practiceSave, [attempt('강', '강', 'correct'), attempt('별', '별', 'correct')], practiceSession);
assert.equal(strongestFocus(practiceSave), undefined);
const restoredPractice = validateSave(practiceSave);
assert.equal(strongestFocus(restoredPractice), undefined, '새로고침해도 졸업 상태 유지');
recordLearning(restoredPractice, [attempt('문', '무', 'wrong')], session('2026-09-11T00:00:00Z'));
assert.equal(strongestFocus(restoredPractice)?.[0], 'batchim', '새 실제 오류는 다시 추천한다');
assert.ok(needsCorrection(restoredPractice, '문'));
assert.deepEqual(restoredPractice.records.learning!.patterns.batchim!.transferTargets, []);

// 같은 패턴의 여러 오류를 기억하고, 마지막 오류 문자열만으로 교정을 누락하지 않는다.
recordLearning(restoredPractice, [attempt('산', '사', 'wrong'), attempt('문', '문', 'correct', true)], practiceSession);
assert.equal(needsCorrection(restoredPractice, '문'), false);
assert.equal(needsCorrection(restoredPractice, '산'), true);
assert.equal(practicePlan(restoredPractice, allContent()).items[0].text, '산');

// 영문도 같은 교정→다른 예시→다음 패턴 규칙을 따른다.
const englishLearning = defaultSave();
recordLearning(englishLearning, [attempt('Go!', 'Go?', 'wrong'), attempt('Go!', 'Go!', 'correct', true), attempt('Hi!', 'Hi!', 'correct'), attempt('Run.', 'Run.', 'correct')], practiceSession);
assert.equal(strongestFocus(englishLearning), undefined);
assert.equal(englishLearning.records.learning!.patterns.punctuation!.corrections, 1);

// 구 저장은 누적 교정·전이 근거로 이어받으며, 전이 근거 없는 오류를 임의로 졸업시키지 않는다.
for (const [corrections, newSuccesses, resolved] of [[1, 2, true], [1, 0, false], [0, 2, false]] as const) {
  const legacyLearning = validateSave({ records: { learning: { patterns: { batchim: { mistakes: 1, corrections, newSuccesses, delayedSuccesses: 0, lastTarget: '밤', lastTyped: '밥', lastErrorAt: '2026-09-01T00:00:00Z' } } } } });
  const focus = learningOf(legacyLearning).patterns.batchim!;
  assert.equal(!!focus.resolvedAt, resolved);
  assert.equal(focus.corrections, corrections);
  assert.equal(focus.newSuccesses, newSuccesses);
  assert.equal(needsCorrection(legacyLearning, '밤'), corrections === 0);
}
{
  const damaged = validateSave({ records: { learning: { patterns: { batchim: { mistakes: 1, lastTarget: '밤', pendingTargets: [...Array(13)].map((_, i) => '문' + i).concat(['문12']), transferTargets: ['강', '강', '별', '빛'], resolvedAt: 'not-a-date' } } } } });
  const focus = learningOf(damaged).patterns.batchim!;
  assert.equal(focus.pendingTargets!.length, 10);
  assert.equal(focus.transferTargets!.length, 2);
  assert.equal(focus.resolvedAt, undefined);
  const malformed = validateSave({ records: { learning: { patterns: { letters: { mistakes: 1, lastTarget: 'cat', pendingTargets: null, transferTargets: { wrong: true }, resolvedAt: 'invalid' } } } } });
  assert.ok(needsCorrection(malformed, 'cat'), '잘못된 새 필드 모양은 기존 원문으로 안전 복구');
}

for (const language of ['ko', 'en'] as const) {
  setLanguage(language);
  const content = allContent();
  assert.equal(new Set(content.map((u) => u.id)).size, content.length);
  for (const unit of content) {
    assert.equal(unit.text, unit.text.normalize('NFC'));
    assert.ok(unit.text.trim().length && unit.weight > 0 && Number.isFinite(unit.difficulty));
    if (language === 'en') assert.equal(/[가-힣]/.test(unit.text), false);
  }
  for (const stage of STAGES) {
    const pool = getContentForStage(stage.id);
    assert.ok(pool.length > 0);
    const remix = getRemixContent(stage.id);
    assert.equal(remix.length, stage.id === 'stage_3' ? 6 : stage.id === 'stage_4' ? 3 : pool.length);
    if (stage.id === 'stage_5') {
      // 보스 출제의 세트 다양화·연속 중복 회피는 check-boss가 실제 BossSystem으로 검증한다.
      // 여기서는 변형 도전이 편지·전보를 보스의 갑옷/코어/마무리로 잘못 붙이는 의미 오류를 막는다.
      const random = Math.random;
      try {
        Math.random = () => 0; // 기존 전체 문장 교체 구현에서는 첫 편지 문장이 섞이던 재현 조건.
        for (const candidates of [remix, getRemixContent(stage.id)]) {
          const finals = candidates.filter((u) => u.type === 'sentence' && u.tags.includes('최종'));
          assert.ok(finals.length >= 3);
          for (const unit of finals) {
            const role = unit.tags.find((tag) => ['갑옷', '코어', '마무리'].includes(tag));
            assert.ok(role, '모든 보스 최종 문장에는 전투 역할이 있다');
            assert.ok(pool.some((original) => original.type === 'sentence' && original.tags.includes('최종') && original.tags.includes(role!) && original.text === unit.text), `${language} ${role}: 허용된 보스 원문이어야 한다. 편지·전보 또는 다른 역할 문장 혼입 금지: ${unit.text}`);
          }
        }
      } finally { Math.random = random; }
    } else assert.ok(remix.some((u, i) => u.text !== pool[i].text));
    if (stage.id === 'stage_3' || stage.id === 'stage_4') {
      const missionTag = stage.id === 'stage_3' ? '편지' : '전보';
      assert.ok(remix.every((u) => u.stage === stage.id && u.type === 'sentence' && u.tags.includes(missionTag)), '이야기 도전은 해당 지역의 문장 미션이어야 한다');
      // 이야기별 연결·순서·연속 중복 회피는 check-journey에서 검증한다.
    } else assert.deepEqual(remix.map((u) => u.tags), pool.map((u) => u.tags));
  }
  assert.ok(getContentForStage('stage_3').filter((u) => u.tags.includes('편지')).length >= 6);
  assert.ok(getContentForStage('stage_4').filter((u) => u.tags.includes('전보')).length >= 3);
  assert.ok(getContentForStage('stage_5').filter((u) => u.tags.includes('결정')).length >= 5);
  assert.ok(content.filter((u) => u.tags.includes('오늘문장')).length >= 3);
}
setLanguage('ko');
console.log('PASS progress: corrupt/legacy/language storage, correction/new-text/delayed evidence, reward guards, replay idempotency, bilingual content');
