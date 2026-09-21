// RaceSystem(네온 시티) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { RaceSystem, RACE, type GhostRecord } from '../src/game/systems/RaceSystem';
import { getStage } from '../src/game/data/stages';
import type { ContentUnit, PetDef } from '../src/game/types';

const stage = getStage('stage_2');
const pet: PetDef = { id: 'rabbit', name: '', desc: '', sheet: '', passive: 'bomb_time', passiveDesc: '', active: 'time_plus', activeDesc: '' };
const unit = (text: string): ContentUnit => ({ id: text, stage: 'stage_2', type: 'word', text, difficulty: 1, tags: [], weight: 1 });
const words = ['신호등', '도서관', '학교', '달리기', '미래', '버스'].map(unit);

function make(ghost: GhostRecord | null = null, source = words) {
  const events: [string, unknown][] = [];
  const r = new RaceSystem(stage, 'normal', pet, source, ghost, 'mon_ink_slime', (ev, d) => events.push([ev, d]));
  r.start();
  return { r, events, count: (ev: string) => events.filter((e) => e[0] === ev).length };
}

// 한 셔플 묶음에서는 같은 표기의 낱말이 다시 나오지 않고, 새 묶음의
// 첫 낱말도 직전 낱말과 겹치지 않는다. 적응형 길이 선택도 이 규칙을 지킨다.
{
  const duplicate = { ...unit('신호등'), id: 'same-text-different-id' };
  const { r } = make(null, [...words, duplicate]);
  const shown: string[] = [];
  for (let i = 0; i < words.length + 1; i++) {
    shown.push(r.run.current!.text);
    r.submit(r.run.current!.text, false);
  }
  assert.equal(new Set(shown.slice(0, words.length)).size, words.length, '한 묶음 안에서 낱말이 중복되지 않는다');
  assert.notEqual(shown[words.length - 1], shown[words.length], '새 묶음 경계에서 직전 낱말을 바로 반복하지 않는다');
}

// 1. 접두어를 계속 누르더라도 낱말을 완성하지 않으면 관성 주행이 멈추고 잡힌다.
{
  const { r, count } = make();
  for (let i = 0; i < 1800 && !r.finished; i++) { r.tick(0.1); if (i % 30 === 0) r.commit(r.run.current!.text[0]); } // 낱말은 안 끝내고 한 글자만 계속 → 무입력 감소 없이 추격만
  assert.ok(count('RACE_CAUGHT') >= 1, '가만히 있으면 잡힌다');
  assert.equal(count('STAGE_CLEAR'), 0, '접두어 반복으로 자동 완주하지 않는다');
  assert.equal(r.run.wordsDone, 0);
  assert.equal(r.speed(), 0, '완성 입력이 끊기면 지속 가속이 남지 않는다');
}

// 2. 낱말 완성 → BOOST 로 속도 상승, 오타 → 감속
{
  const { r } = make();
  const v0 = r.speed();
  r.submit(r.run.current!.text, false);
  r.tick(0.3);
  assert.ok(r.speed() > v0 + 3, 'BOOST');
  for (let i = 0; i < 12; i++) r.tick(0.1);
  const v1 = r.speed();
  r.submit('틀림', false);
  r.tick(0.3);
  assert.ok(r.speed() < v1, '오타 감속');
  assert.equal(r.run.combo, 0);
}

// 3. TURBO·FEVER는 속도 효과다. 낱말 제출로 추격자를 순간이동시키지 않는다.
{
  const { r, count } = make();
  for (let i = 0; i < 10; i++) r.submit(r.run.current!.text, false), r.tick(0.05);
  assert.equal(count('RACE_TURBO'), 1);
  assert.ok(r.speed() > RACE.baseSpeed * RACE.turboMul, 'TURBO 속도');
  for (let i = 0; i < 10; i++) {
    const before = { player: r.dist, chaser: r.chaser };
    r.submit(r.run.current!.text, false);
    assert.deepEqual({ player: r.dist, chaser: r.chaser }, before, '낱말·펫 기술은 위치를 순간 변경하지 않는다');
    r.tick(0.05);
  }
  assert.equal(r.run.feverLevel, 2);
  assert.ok(r.speed() <= RACE.maxSpeed, 'FEVER도 속도 상한을 넘지 않는다');
  const beforeGap = r.dist - r.chaser;
  for (let i = 0; i < 20; i++) r.tick(0.1);
  assert.ok(r.dist - r.chaser > beforeGap, '가속과 추격자 감속으로 실제 거리가 벌어진다');
}

// 4. 800m 도착 → 클리어. 같은 코스·규칙의 고스트만 비교한다.
{
  const { r, count } = make({ samples: Array.from({ length: 194 }, (_, i) => Math.min(RACE.goal, i * 4.2)), finishSec: 193, goalDistance: RACE.goal, rulesVersion: RACE.rulesVersion });
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
  assert.ok(g.samples.length >= 2 && g.samples[g.samples.length - 1] === RACE.goal && g.finishSec < 193);
  assert.equal(g.goalDistance, RACE.goal);
  assert.equal(g.rulesVersion, RACE.rulesVersion);
  assert.ok(r.snapshot().race!.player === RACE.goal);
}

// 이전 1000m·500m 또는 다른 규칙의 고스트를 800m 기록으로 비교하지 않는다.
for (const ghost of [
  { samples: [0, 500, 1000], finishSec: 40 },
  { samples: [0, 250, 500], finishSec: 40, goalDistance: 500, rulesVersion: 2 },
  { samples: [0, 400, 800], finishSec: 40, goalDistance: 800, rulesVersion: 2 },
]) {
  const { r } = make(ghost);
  assert.equal(r.ghostDist(), null);
  for (let i = 0; i < 2000 && !r.finished; i++) { r.submit(r.run.current!.text, false); r.tick(0.1); }
  assert.equal(r.beatGhost, undefined);
}

// 5. 추격자가 고스트와 부딪히면 고스트는 사라지고, 같은 프레임의 플레이어 접촉과 중복 없이 한 번만 피해를 준다.
{
  const ghost: GhostRecord = { samples: [0, 0, 0], finishSec: 20, goalDistance: RACE.goal, rulesVersion: RACE.rulesVersion };
  const { r, events, count } = make(ghost);
  const hp = r.playerHp;
  r.chaser = r.dist + 1;
  r.tick(0.05);
  assert.equal(r.ghostDist(), null, '추격자와 충돌한 고스트는 즉시 사라진다');
  assert.equal(count('RACE_GHOST_CAUGHT'), 1);
  assert.equal(count('PLAYER_HIT'), 1, '고스트와 플레이어를 함께 지나도 피해 이벤트는 1회다');
  assert.equal(count('RACE_CAUGHT'), 0, '같은 프레임의 플레이어 접촉을 중복 피격으로 세지 않는다');
  assert.equal(r.playerHp, hp - RACE.catchHp);
  assert.equal(r.catches, 0);
  assert.equal((events.find(([ev]) => ev === 'RACE_GHOST_CAUGHT')?.[1] as { hpLoss: number }).hpLoss, RACE.catchHp);

  const restored = new RaceSystem(stage, 'normal', pet, words, ghost, 'mon_ink_slime', () => {});
  restored.restore(JSON.parse(JSON.stringify(r.serialize())));
  restored.start();
  assert.equal(restored.ghostDist(), null, '이어하기해도 소멸한 고스트가 재등장하지 않는다');
}

// 6. 플레이어 피격 직후에는 회복 시간이 있고, 위치를 뒤로 옮기지 않는다. 방치는 결국 3회 피격 실패.
{
  const { r, count } = make();
  r.chaser = r.dist + 1; r.tick(0.05);
  assert.equal(r.catches, 1);
  assert.ok(r.chaser > 0, '피격 후 80m 순간 후퇴가 없다');
  for (let i = 0; i < 25; i++) r.tick(0.1);
  assert.equal(r.catches, 1, '접촉이 겹쳐도 회복 시간에는 중복 피격하지 않는다');
  for (let i = 0; i < 1000 && !r.finished; i++) r.tick(0.1);
  assert.equal(r.catches, 3);
  assert.ok(r.finished);
  assert.equal(count('STAGE_FAILED'), 1);
}

console.log('check-race: all passed');
