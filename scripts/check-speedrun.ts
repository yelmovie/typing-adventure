// 스피드런·어둠 모드 셀프체크. 실행: npm run check
// 1) 스피드런 순수 로직: 총 시간 = 지역별 전투 시간의 합, 실패한 판은 더하지 않고 재도전만 센다, 최고 기록 갱신·최근 10회 보관
// 2) 어둠 모드 수정자: 시간 ×0.7, 3성 목표 ×0.7, 속도 ×1.3, 기초·도움 규칙 미적용, 실제 모드 시스템의 제한 시간·속도에 반영
// 3) 저장 검증: records.speedrun / progress.darkStars·darkCleared / checkpoint.speedrun·dark 가 깨진 값을 안전하게 되돌린다
import assert from 'node:assert/strict';
import { startSpeedrun, recordClear, recordFail, nextStage, totalSec, isComplete, currentStage, stageNumber, finishSpeedrun, readSpeedrunRun, formatSpeedrunTime, endgameUnlocked, SPEEDRUN_STAGES, SPEEDRUN_KEEP_RUNS } from '../src/game/systems/SpeedrunSystem';
import { applyDarkModifier, darkDifficulty, recordDarkClear, darkStars, DARK } from '../src/game/data/darkMode';
import { defaultSave, validateSave } from '../src/game/systems/SaveValidation';
import { validateCheckpoint } from '../src/game/systems/Checkpoint';
import { calcStars } from '../src/game/systems/AwardRules';
import { getStage, DAILY_STAGE, DIFFICULTY_RULES } from '../src/game/data/stages';
import { WaveSystem } from '../src/game/systems/WaveSystem';
import { TelegramSystem, TELE } from '../src/game/systems/TelegramSystem';
import { RaceSystem } from '../src/game/systems/RaceSystem';
import type { ContentUnit, PetDef, SaveRecords, StageId } from '../src/game/types';

// ---- 1) 스피드런 순수 로직 ----
assert.equal(endgameUnlocked({ clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4'] }), false, '4지역만 완료하면 아직 잠김');
assert.equal(endgameUnlocked({ clearedStages: ['stage_5', 'stage_1', 'stage_3', 'stage_2', 'stage_4'] }), true, '순서와 무관하게 5지역 완료면 열림');

let run = startSpeedrun(new Date('2026-09-18T07:00:00Z'));
assert.equal(currentStage(run), 'stage_1'); assert.equal(stageNumber(run), 1); assert.equal(totalSec(run), 0);
run = recordClear(run, 61.4);
assert.deepEqual(run.stageSec, [61]); assert.equal(currentStage(run), 'stage_2'); assert.equal(stageNumber(run), 2);
const failed = nextStage(run, false, 40);
assert.equal(failed.stageId, 'stage_2', '실패하면 같은 지역을 다시');
assert.equal(totalSec(failed.run), 61, '실패한 판의 시간은 더하지 않는다');
assert.equal(failed.run.retries, 1, '재도전 횟수만 센다');
run = failed.run;
run = recordClear(run, 50); run = recordClear(run, 120.6); run = recordClear(run, 90);
assert.equal(isComplete(run), false); assert.equal(currentStage(run), 'stage_5');
const last = nextStage(run, true, 200);
run = last.run;
assert.equal(last.stageId, undefined, '5지역째를 마치면 다음 지역이 없다');
assert.ok(isComplete(run));
assert.equal(totalSec(run), 61 + 50 + 121 + 90 + 200, '총 시간 = 지역별 전투 시간(반올림)의 합');
assert.equal(recordClear(run, 5).stageSec.length, 5, '완주 뒤에는 더 쌓이지 않는다');
assert.equal(formatSpeedrunTime(totalSec(run)), '8:42'); assert.equal(formatSpeedrunTime(3661), '1:01:01'); assert.equal(formatSpeedrunTime(-3), '0:00');

const records = defaultSave().records as SaveRecords;
const first = finishSpeedrun(records, run, new Date('2026-09-18T07:10:00Z'));
assert.deepEqual({ totalSec: first.totalSec, prevBestSec: first.prevBestSec, isNewBest: first.isNewBest, retries: first.retries }, { totalSec: 522, prevBestSec: 0, isNewBest: true, retries: 1 });
assert.equal(records.speedrun?.bestSec, 522); assert.equal(records.speedrun?.runs.length, 1);
const slower = { ...run, stageSec: [70, 60, 130, 100, 210] };
const second = finishSpeedrun(records, slower, new Date('2026-09-18T08:00:00Z'));
assert.equal(second.isNewBest, false); assert.equal(second.prevBestSec, 522); assert.equal(records.speedrun?.bestSec, 522, '느린 완주는 최고 기록을 바꾸지 않는다');
assert.equal(records.speedrun?.bestAt, '2026-09-18T07:10:00.000Z');
const faster = { ...run, stageSec: [50, 40, 100, 80, 180] };
const third = finishSpeedrun(records, faster, new Date('2026-09-18T09:00:00Z'));
assert.equal(third.isNewBest, true); assert.equal(third.prevBestSec, 522); assert.equal(records.speedrun?.bestSec, 450); assert.equal(records.speedrun?.bestAt, '2026-09-18T09:00:00.000Z');
for (let i = 0; i < 15; i++) finishSpeedrun(records, slower);
assert.equal(records.speedrun?.runs.length, SPEEDRUN_KEEP_RUNS, '최근 10회만 남긴다');
assert.equal(records.speedrun?.bestSec, 450);
assert.deepEqual(readSpeedrunRun({ stageSec: [10, 20], retries: 2.9, startedAt: 'nope' })?.stageSec, [10, 20]);
assert.equal(readSpeedrunRun({ stageSec: [10, 20], retries: 2.9 })?.retries, 2);
assert.equal(readSpeedrunRun({ stageSec: [10, 'x'] }), undefined, '깨진 진행은 버린다');
assert.equal(readSpeedrunRun('garbage'), undefined);
assert.equal(readSpeedrunRun({ stageSec: [1, 2, 3, 4, 5, 6] }), undefined, '5지역을 넘는 진행은 버린다');

// ---- 2) 어둠 모드 수정자 ----
assert.deepEqual(DARK, { timeMul: 0.7, speedMul: 1.3 });
for (const id of SPEEDRUN_STAGES) {
  const base = getStage(id), dark = applyDarkModifier(base);
  assert.equal(dark.timeLimitSec, Math.round(base.timeLimitSec * 0.7), `${id} 제한 시간 ×0.7`);
  assert.equal(dark.goalTimeSec, Math.round(base.goalTimeSec * 0.7), `${id} 3성 목표 시간 ×0.7`);
  assert.equal(dark.speedMul, 1.3); assert.equal(base.speedMul, undefined, '원본 StageDef 는 바꾸지 않는다');
  assert.equal(dark.targets, base.targets); assert.equal(dark.mode, base.mode);
}
assert.equal(applyDarkModifier(DAILY_STAGE), DAILY_STAGE, '오늘의 도전에는 어둠 모드가 없다');
assert.equal(darkDifficulty('beginner'), 'normal'); assert.equal(darkDifficulty('normal'), 'normal'); assert.equal(darkDifficulty('challenge'), 'challenge');
// 별: 어둠 모드의 3성 시간 조건은 ×0.7 로 빡빡해진다(정확도 95% 이상, 콤보 조건은 그대로).
const s1 = getStage('stage_1'), d1 = applyDarkModifier(s1);
assert.equal(calcStars(s1, true, 97, 100, 1), 3);
assert.equal(calcStars(d1, true, 97, 100, 1), 2, '보통에선 3성인 100초가 어둠(84초)에선 2성');
assert.equal(calcStars(d1, true, 97, 80, 1), 3);

// 실제 시스템에 반영되는지: 숲 몬스터 속도·제한 시간, 열차 속도(→ 제한 시간), 레이스 제한 시간
const pet: PetDef = { id: 'cat', name: '', desc: '', sheet: '', passive: 'block_wrong', passiveDesc: '', active: 'shield', activeDesc: '' };
const unit = (stage: StageId, text: string, type: ContentUnit['type'] = 'word'): ContentUnit => ({ id: `${stage}:${text}`, stage, type, text, difficulty: 1, tags: [], weight: 1 });
const noop = () => {};
const words = ['별', '하늘', '바다', '친구', '나무', '구름', '바람', '햇살'].map((w) => unit('stage_1', w));
const waveNormal = new WaveSystem(s1, 'normal', pet, { slime: words, bat: words }, noop);
const waveDark = new WaveSystem(d1, 'normal', pet, { slime: words, bat: words }, noop);
assert.equal(waveNormal.snapshot().timeLimit, 270); assert.equal(waveDark.snapshot().timeLimit, 189, '숲 제한 시간 270 → 189초');
const speedOf = (w: WaveSystem) => (w as unknown as { speedMul: number }).speedMul;
assert.ok(Math.abs(speedOf(waveDark) / speedOf(waveNormal) - 1.3) < 1e-9, '숲 몬스터 속도 ×1.3');
const waveDarkChallenge = new WaveSystem(d1, 'challenge', pet, { slime: words, bat: words }, noop);
assert.ok(Math.abs(speedOf(waveDarkChallenge) - (1 / DIFFICULTY_RULES.challenge.timeMul) * 1.3) < 1e-9, '도전 난이도 위에 어둠 배수를 곱한다');
assert.equal(waveDarkChallenge.snapshot().timeLimit, Math.round(189 * 0.8));
const s4 = getStage('stage_4'), d4 = applyDarkModifier(s4);
const sentences = ['열차를 멈춰 주세요.', '다리가 끊겼어요!', '지금 바로 브레이크!', '모두 안전하게.', '고마워요, 기관사님.'].map((t) => unit('stage_4', t, 'sentence'));
const teleNormal = new TelegramSystem(s4, 'normal', pet, sentences, noop);
const teleDark = new TelegramSystem(d4, 'normal', pet, sentences, noop);
assert.ok(Math.abs(teleDark.speed() / teleNormal.speed() - 1.3) < 1e-9, '열차 속도 ×1.3');
assert.ok(Math.abs(teleDark.snapshot().timeLimit - TELE.dist / (TELE.speed * 1.3)) < 1e-6, '열차 제한 시간은 속도에서 나온다(180 → 약 138초)');
const s2 = getStage('stage_2'), d2 = applyDarkModifier(s2);
const raceDark = new RaceSystem(d2, 'normal', pet, words.map((w) => ({ ...w, stage: 'stage_2' as const })), null, '', noop);
assert.equal(raceDark.snapshot().timeLimit, 105, '레이스 제한 시간 150 → 105초');

// 어둠 기록: 별은 최고치만, 완료 지역은 한 번만
const darkSave = defaultSave();
recordDarkClear(darkSave, 'stage_2', 2); recordDarkClear(darkSave, 'stage_2', 1); recordDarkClear(darkSave, 'stage_2', 3); recordDarkClear(darkSave, 'daily', 3);
assert.equal(darkStars(darkSave, 'stage_2'), 3); assert.deepEqual(darkSave.progress.darkCleared, ['stage_2']);
assert.equal(darkStars(darkSave, 'stage_1'), 0);
assert.deepEqual(darkSave.progress.stageStars, {}, '어둠 별은 보통 별과 따로 둔다');

// ---- 3) 저장 검증 ----
const validated = validateSave({ records: { speedrun: { bestSec: 480.4, bestAt: '2026-09-18T07:10:00Z', runs: [{ at: 'x', totalSec: 500, stageSec: [1, 2, 3, 4, 5] }, { totalSec: -3, stageSec: [1, 2, 3, 4, 5] }, { totalSec: 600, stageSec: [1, 2] }, 'junk'] } },
  progress: { darkStars: { stage_1: 7.9, stage_9: 3, stage_3: -1 }, darkCleared: ['stage_1', 'stage_1', 'nope', 'stage_5'] } });
assert.equal(validated.records.speedrun?.bestSec, 480);
assert.equal(validated.records.speedrun?.runs.length, 1, '지역 5개 시간이 다 있는 양의 완주만 남긴다');
assert.deepEqual(validated.progress.darkStars, { stage_1: 3, stage_3: 0 });
assert.deepEqual(validated.progress.darkCleared, ['stage_1', 'stage_5']);
assert.equal(validateSave({}).records.speedrun, undefined, '기록이 없으면 필드도 없다');
assert.equal(validateSave({ records: { speedrun: { runs: [{ totalSec: 300, stageSec: [1, 2, 3, 4, 290] }] } } }).records.speedrun?.bestSec, 300, 'bestSec 이 없으면 완주 기록에서 되찾는다');
assert.equal(validateSave({ records: { speedrun: 'garbage' } }).records.speedrun, undefined);
assert.deepEqual(validateSave({ progress: { darkStars: 'x', darkCleared: 'y' } }).progress.darkStars, {});

const now = Date.now();
const cp = { stageId: 'stage_3', savedAt: new Date(now - 1000).toISOString(), language: 'ko', done: 2, total: 9, state: { idx: 2 }, dark: true, speedrun: { startedAt: 'bad', stageSec: [61, 50], retries: 1.7 } };
const checked = validateCheckpoint(cp, now)!;
assert.equal(checked.dark, true);
assert.deepEqual(checked.speedrun, { startedAt: checked.savedAt, stageSec: [61, 50], retries: 1 }, '스피드런 진행은 지역 시간·재도전과 함께 이어진다');
assert.equal(validateCheckpoint({ ...cp, dark: 'yes', speedrun: { stageSec: [1, 2, 3, 4, 5] } }, now)?.dark, undefined);
assert.equal(validateCheckpoint({ ...cp, speedrun: { stageSec: [1, 2, 3, 4, 5] } }, now)?.speedrun, undefined, '이미 5지역을 마친 진행은 이어갈 게 없다');
assert.equal(validateCheckpoint({ ...cp, speedrun: { stageSec: [1, 'x'] } }, now)?.speedrun, undefined, '깨진 진행은 보통 판으로 이어간다');
assert.equal(validateCheckpoint({ ...cp, speedrun: null }, now)?.speedrun, undefined);
assert.equal(validateSave({ ...defaultSave(), checkpoint: cp }).checkpoint?.speedrun?.stageSec.length, 2, '저장 전체 검증을 거쳐도 남는다');

console.log('PASS speedrun: run state/total/fail-excluded/best+keep10, dark modifier ×0.7 time ×1.3 speed reflected in wave/telegram/race, save+checkpoint validation');
