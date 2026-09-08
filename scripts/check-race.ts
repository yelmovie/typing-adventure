// RaceSystem(네온 시티) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { RaceSystem, RACE } from '../src/game/systems/RaceSystem';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';

const stage = { id: 'stage_2', index: 2, mode: 'race', targets: 18, timeLimitSec: 180 } as StageDef;
const pet: PetDef = { id: 'rabbit', name: '', desc: '', sheet: '', passive: 'bomb_time', passiveDesc: '', active: 'time_plus', activeDesc: '' };
const unit = (text: string): ContentUnit => ({ id: text, stage: 'stage_2', type: 'word', text, difficulty: 1, tags: [], weight: 1 });
const words = ['신호등', '도서관', '학교', '달리기', '미래', '버스'].map(unit);

function make(ghost: { samples: number[]; finishSec: number } | null = null) {
  const events: [string, unknown][] = [];
  const r = new RaceSystem(stage, 'normal', pet, words, ghost, 'mon_ink_slime', (ev, d) => events.push([ev, d]));
  r.start();
  return { r, events, count: (ev: string) => events.filter((e) => e[0] === ev).length };
}

// 1. 아무것도 안 치면 기본 속도로 달리고, 추격자가 따라잡는다 (60m 차이, 5 vs 4.5 → 못 잡음… 30초마다 가속 → 결국 잡힘)
{
  const { r, count } = make();
  for (let i = 0; i < 1800 && !r.finished; i++) r.tick(0.1); // 최대 180초
  assert.ok(count('RACE_CAUGHT') >= 1, '가만히 있으면 잡힌다');
}

// 2. 낱말 완성 → BOOST 로 속도 상승, 오타 → 감속
{
  const { r } = make();
  const v0 = r.speed();
  r.submit(r.run.current!.text, false);
  assert.ok(r.speed() > v0 + 3, 'BOOST');
  for (let i = 0; i < 12; i++) r.tick(0.1);
  const v1 = r.speed();
  r.submit('틀림', false);
  assert.ok(r.speed() < v1, '오타 감속');
  assert.equal(r.run.combo, 0);
}

// 3. 10낱말 연속 무오타 → TURBO, FEVER(20) → 추격자 100m 뒤로
{
  const { r, count } = make();
  for (let i = 0; i < 10; i++) r.submit(r.run.current!.text, false), r.tick(0.05);
  assert.equal(count('RACE_TURBO'), 1);
  assert.ok(r.speed() > RACE.baseSpeed * RACE.turboMul, 'TURBO 속도');
  const chaserBefore = r.chaser;
  for (let i = 0; i < 10; i++) r.submit(r.run.current!.text, false), r.tick(0.05);
  assert.equal(r.run.feverLevel, 2);
  assert.ok(r.chaser < chaserBefore - RACE.feverPush + 10, 'FEVER 진입 시 추격자 밀림');
}

// 4. 1000m 도착 → 클리어, 고스트 기록 생성. 느린 고스트가 있으면 추월 판정
{
  const { r, count } = make({ samples: Array.from({ length: 400 }, (_, i) => i * 2.6), finishSec: 385 });
  let guard = 0;
  while (!r.finished && guard++ < 5000) {
    r.submit(r.run.current!.text, false);
    r.tick(0.3);
  }
  assert.ok(r.finished && r.dist >= RACE.goal, '도착');
  assert.equal(count('RACE_FINISH'), 1);
  assert.equal(count('STAGE_CLEAR'), 1);
  assert.ok(r.beatGhost, '어제의 나 추월');
  const g = r.ghostRecord();
  assert.ok(g.samples.length >= 2 && g.samples[g.samples.length - 1] === RACE.goal && g.finishSec < 385);
  assert.ok(r.snapshot().race!.player === RACE.goal);
}

// 5. 3번 잡히면 실패
{
  const { r, count } = make();
  r.chaser = r.dist + 1; r.tick(0.1);
  r.chaser = r.dist + 1; r.tick(0.1);
  r.chaser = r.dist + 1; r.tick(0.1);
  assert.equal(r.catches, 3);
  assert.ok(r.finished);
  assert.equal(count('STAGE_FAILED'), 1);
}

console.log('check-race: all passed');
