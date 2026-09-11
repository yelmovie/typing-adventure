// 실제 출제 목록을 일정한 입력 속도로 풀어 추격 거리·완주 시간을 비교한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RaceSystem, RACE } from '../src/game/systems/RaceSystem';
import { getStage } from '../src/game/data/stages';
import { getContentForStage } from '../src/game/data/content';
import { getPet } from '../src/game/data/characters';
import { setLanguage } from '../src/game/i18n/Locale';
import type { Difficulty } from '../src/game/types';

const baseline = process.env.RACE_PACING_BASELINE === '1';
const tag = process.env.RACE_PACING_TAG || (baseline ? 'baseline' : 'after');
const originalRandom = Math.random;
Math.random = () => 0.5; // 무작위 보너스에 기대지 않고 같은 출제 순서로 비교
const stepSeconds = Number(process.env.RACE_PACING_DT || 0.05);
const cases: { name: string; seconds?: number; difficulty: Difficulty; wrongEvery?: number; onlyWrong?: boolean; stopAfter?: number; pauseFrom?: number; pauseTo?: number; prefixOnly?: boolean }[] = [
  { name: 'normal-3s', seconds: 3, difficulty: 'normal' },
  { name: 'normal-4s', seconds: 4, difficulty: 'normal' },
  { name: 'slow-8s-normal', seconds: 8, difficulty: 'normal' },
  { name: 'slow-8s-beginner', seconds: 8, difficulty: 'beginner' },
  { name: 'slow-8s-repair', seconds: 8, difficulty: 'normal', wrongEvery: 3 },
  { name: 'wrong-then-repair', seconds: 4, difficulty: 'normal', wrongEvery: 3 },
  { name: 'stop-then-recover', seconds: 4, difficulty: 'normal', pauseFrom: 20, pauseTo: 32 },
  { name: 'caught-then-recover', seconds: 3, difficulty: 'normal', pauseFrom: 20, pauseTo: 43 },
  { name: 'idle', difficulty: 'normal' },
  { name: 'only-wrong', seconds: 2, difficulty: 'normal', onlyWrong: true },
  { name: 'prefix-only', difficulty: 'normal', prefixOnly: true },
  { name: 'one-word-then-stop', seconds: 3, difficulty: 'normal', stopAfter: 1 },
];
const all = [];
const corpus: Record<string, string[]> = {};
try {
  for (const language of ['ko', 'en'] as const) {
    setLanguage(language);
    const pool = getContentForStage('stage_2').filter((unit) => unit.type === 'word');
    corpus[language] = pool.map((unit) => unit.text);
    for (const config of cases) {
      const events: string[] = [];
      let failReason = '', nextSubmit = config.seconds ?? Infinity, wordStarted = 0, repairing = false, wrongCount = 0, lastCommit = '';
      const stage = { ...getStage('stage_2'), ...(baseline ? { timeLimitSec: 180, goalTimeSec: 110 } : {}) };
      const race = new RaceSystem(stage, config.difficulty, getPet('rabbit'), pool, null, '', (event, data) => {
        events.push(event);
        if (event === 'STAGE_FAILED') failReason = (data as { reason: string }).reason;
      });
      race.start();
      const trace = [];
      let minGap = Infinity, maxGap = -Infinity, farSeconds = 0, threatSeconds = 0, maxPlayerStep = 0, maxChaserStep = 0;
      let previousPlayer = race.dist, previousChaser = race.chaser, previousSample = -1;
      const dt = stepSeconds;
      for (let tick = 0; tick < 6000 && !race.finished; tick++) {
        race.tick(dt);
        const now = race.elapsed;
        const stopped = config.stopAfter !== undefined && race.run.wordsDone >= config.stopAfter;
        const pausing = config.pauseFrom !== undefined && now >= config.pauseFrom && now < config.pauseTo!;
        if (config.prefixOnly && Math.floor(now * 2) !== Math.floor((now - dt) * 2)) race.commit(race.run.current!.text[0]);
        if (config.seconds && !stopped && !pausing && !race.finished) {
          if (now >= nextSubmit) {
            if (config.onlyWrong) {
              race.submit('※', false);
              wrongCount++;
              nextSubmit = now + config.seconds;
            } else if (config.wrongEvery && !repairing && (race.run.wordsDone + 1) % config.wrongEvery === 0) {
              race.submit('※', false);
              wrongCount++;
              repairing = true;
              nextSubmit = now + 1;
            } else {
              race.submit(race.run.current!.text, repairing);
              repairing = false;
              wordStarted = now;
              lastCommit = '';
              nextSubmit = now + config.seconds;
            }
          } else if (!repairing && !config.onlyWrong) {
            const target = race.run.current!.text;
            const letters = Math.floor((now - wordStarted) / config.seconds * target.length);
            const value = target.slice(0, Math.max(0, Math.min(target.length - 1, letters)));
            if (value !== lastCommit) { race.commit(value); lastCommit = value; }
          }
        }
        const gap = race.dist - race.chaser;
        minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
        if (gap > 65) farSeconds += dt;
        if (gap < 20) threatSeconds += dt;
        maxPlayerStep = Math.max(maxPlayerStep, Math.abs(race.dist - previousPlayer));
        maxChaserStep = Math.max(maxChaserStep, Math.abs(race.chaser - previousChaser));
        previousPlayer = race.dist; previousChaser = race.chaser;
        if (Math.floor(now) !== previousSample || race.finished) {
          previousSample = Math.floor(now);
          trace.push({ time: round(now), player: round(race.dist), gap: round(gap), speed: round(race.speed()), chaserSpeed: round(race.chaserSpeed()), correct: race.run.wordsDone, catches: race.catches });
        }
      }
      const result = { language, name: config.name, difficulty: config.difficulty, goal: RACE.goal, limit: race.timeLimit, cleared: events.includes('STAGE_CLEAR'), failed: events.includes('STAGE_FAILED'), failReason, elapsed: round(race.elapsed), correct: race.run.wordsDone, wrong: wrongCount, catches: race.catches, minGap: round(minGap), maxGap: round(maxGap), farPercent: round(farSeconds / race.elapsed * 100), threatSeconds: round(threatSeconds), maxPlayerStep: round(maxPlayerStep), maxChaserStep: round(maxChaserStep), trace };
      all.push(result);
      console.log(JSON.stringify({ ...result, trace: undefined }));
      if (!baseline) {
        assert.equal(result.goal, 500);
        if (['idle', 'only-wrong', 'prefix-only', 'one-word-then-stop'].includes(config.name)) {
          assert.equal(result.cleared, false, `${language} ${config.name}: 완성 입력 없이 자동 완주 금지`);
          assert.equal(result.failed, true);
        } else {
          assert.equal(result.cleared, true, `${language} ${config.name}: 정확 입력/수정으로 회복 가능`);
          assert.ok(result.elapsed <= race.timeLimit, `${language} ${config.name}: 제한 시간 내 완료`);
        }
        assert.ok(result.maxPlayerStep <= RACE.maxSpeed * dt + 0.005, `${language} ${config.name}: 이동에 순간이동 없음`);
        assert.ok(result.maxChaserStep <= RACE.chaserMaxSpeed * dt + 0.005, `${language} ${config.name}: 추격자 순간이동 없음`);
        if (config.name.startsWith('normal-')) assert.ok(result.farPercent < 10, '정상 입력 중에도 추격자는 대부분 화면 거리 안에 있다');
        if (config.name === 'stop-then-recover') {
          assert.ok(result.minGap < 15, '입력을 멈추면 추격자가 빠르게 가까워진다');
          assert.ok(result.threatSeconds >= 2, '위험을 실제 거리로 경험한 뒤 입력으로 회복한다');
        }
        if (config.name === 'caught-then-recover') assert.ok(result.catches >= 1, '실제 피격 후에도 정확 입력으로 완주를 회복한다');
      }
    }
  }
} finally {
  fs.mkdirSync('tmp/race-pacing', { recursive: true });
  fs.writeFileSync(`tmp/race-pacing/${tag}.json`, JSON.stringify({ at: new Date().toISOString(), baseline, stepSeconds, corpus, rules: RACE, results: all }, null, 2));
  Math.random = originalRandom;
  setLanguage('ko');
}
function round(value: number): number { return Math.round(value * 100) / 100; }
