// WaveSystem(푸른 숲) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { WaveSystem, WAVE } from '../src/game/systems/WaveSystem';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';

const stage = { id: 'stage_1', index: 1, mode: 'wave', targets: 20, timeLimitSec: 180 } as StageDef;
const pet: PetDef = { id: 'dragon', name: '', desc: '', sheet: '', passive: 'strong_bonus', passiveDesc: '', active: 'fire_aoe', activeDesc: '' };
const unit = (text: string, tags: string[] = []): ContentUnit => ({ id: text, stage: 'stage_1', type: 'word', text, difficulty: 1, tags, weight: 1 });
const bossUnit = unit('고슴도치', ['대장']); // 유일한 대장 태그 → bossWord()가 항상 이걸 고름
const words = { slime: ['나무', '바다', '구름', '바람', '학교', '친구'].map((t) => unit(t)), bat: ['무지개', '소나무', '도서관', '자전거', '놀이터'].map((t) => unit(t)).concat(bossUnit) };

const events: [string, unknown][] = [];
const w = new WaveSystem(stage, 'normal', pet, words, (ev, d) => events.push([ev, d]));
w.start();
const count = (ev: string) => events.filter((e) => e[0] === ev).length;

// 1. 시작: 첫 몬스터 등장 + 목표 잡힘
assert.equal(w.monsters.length, 1);
assert.ok(w.target && w.run.current?.text === w.target.word.text, '목표 = 가장 가까운 몬스터의 낱말');

// 2. 음절 타격 → hp 감소, 낱말 완성 → 처치 + 다음 목표
const t0 = w.target!;
const first = [...t0.word.text][0];
w.commit(first);
assert.equal(t0.hp, t0.maxHp - 1);
assert.equal(count('WAVE_HIT'), 1);
w.submit(t0.word.text, false);
assert.ok(t0.dead);
assert.equal(w.defeated, 1);
assert.equal(count('WAVE_DEFEAT'), 1);

// 3. 시간이 흐르면 등장 간격대로 스폰, 최대 4마리
for (let i = 0; i < 150; i++) { w.tick(0.1); if (i % 30 === 0 && w.target) w.commit(w.target.word.text[0]); } // 15초, 3초마다 한 글자 쳐서 무입력 감소는 안 걸리게
assert.ok(w.monsters.filter((m) => !m.dead).length <= WAVE.maxOnField);
assert.ok(w.spawnedCount() >= 5, '15초면 5마리 이상 등장');

// 4. 접촉: x가 1에 닿으면 HP-10, 밀려남
// (30초 동안 아무도 안 쳤으니 이미 몇 번 닿았을 수 있음 → 증가분만 본다)
const m = w.monsters.find((x) => !x.dead && x.pushed === 0)!;
m.x = 0.999;
const hp0 = w.playerHp;
const touches0 = count('WAVE_TOUCH');
w.tick(0.1);
assert.equal(w.playerHp, hp0 - WAVE.touchHp);
assert.ok(m.x < 0.6 && m.pushed > 0, '밀려남');
assert.equal(count('WAVE_TOUCH'), touches0 + 1);

// 5. 오타 → 콤보 0, HP -3(위험·보상 루프)
const hp1 = w.playerHp;
w.submit('틀림', false);
assert.equal(w.playerHp, hp1 - 3);
assert.equal(w.run.combo, 0);

// 6. 20마리 처치 → 문 개방 + 클리어 (광역은 TypingRun 테스트의 FEVER 진입에 의존)
let guard = 0;
while (!w.finished && guard++ < 200) {
  const t = w.target;
  if (!t) { w.tick(0.5); continue; }
  w.submit(t.word.text, false);
  w.tick(0.1);
}
assert.ok(w.finished, '클리어됨');
assert.equal(w.defeated, WAVE.total);
assert.equal(count('WAVE_GATE'), 1);
assert.equal(count('STAGE_CLEAR'), 1);

// 7. 점프(Tab): 3번까지, 정확도 영향 없이 콤보만 0 · 도망 처리. 5콤보마다 화면 소탕
{
  const ev2: [string, unknown][] = [];
  const w2 = new WaveSystem(stage, 'normal', pet, words, (ev, d) => ev2.push([ev, d]));
  w2.start();
  const c2 = (ev: string) => ev2.filter((e) => e[0] === ev).length;
  for (let i = 0; i < 20; i++) w2.tick(0.5); // 여러 마리 등장
  const wrongBefore = w2.run.stats.wrongStrokes;
  assert.ok(w2.skip() && w2.skip() && w2.skip(), '3번 점프');
  assert.equal(w2.skip(), false, '4번째는 안 됨');
  assert.equal(c2('SKIP'), 3);
  assert.equal(w2.run.stats.wrongStrokes, wrongBefore, '점프는 오타로 안 센다');
  for (let i = 0; i < 10; i++) w2.tick(0.5);
  let guard = 0;
  while (w2.run.combo < WAVE.sweepEvery && !w2.finished && guard++ < 60) { if (w2.target) w2.submit(w2.target.word.text, false); else w2.tick(0.5); }
  assert.equal(c2('WAVE_SWEEP'), 1, '5콤보 소탕 1회');
  assert.ok(w2.monsters.every((m) => m.dead), '화면의 적 전부 처치');
}

// 8. 방향키 회피: 점프중 슬라임 / 앉기중 박쥐 접촉 → 피해 0·밀림·+30점·DODGE
{
  const ev3: [string, unknown][] = [];
  const w3 = new WaveSystem(stage, 'normal', pet, words, (ev, d) => ev3.push([ev, d]));
  w3.start();
  const c3 = (ev: string) => ev3.filter((e) => e[0] === ev).length;

  w3.move('up', true);
  const slime = w3.monsters.find((m) => m.kind === 'slime')!;
  const hp0 = w3.playerHp;
  const score0 = w3.score;
  slime.x = 0.999;
  w3.tick(0.05);
  assert.equal(c3('DODGE'), 1, '점프 중 슬라임 접촉 → 회피');
  assert.equal(w3.playerHp, hp0, '회피는 피해 0');
  assert.equal(w3.score, score0 + WAVE.dodgeScore);
  w3.move('up', false);

  // 박쥐가 나올 때까지 목표를 맞혀 웨이브를 진행시킨다(회피 꺼짐 → 접촉은 정상 피해, HP는 넉넉함)
  let guard2 = 0;
  while (!w3.monsters.some((m) => m.kind === 'bat') && !w3.finished && guard2++ < 400) {
    if (w3.target) w3.submit(w3.target.word.text, false);
    w3.tick(0.1);
  }
  assert.ok(w3.monsters.some((m) => m.kind === 'bat'), '박쥐 등장');

  w3.move('down', true);
  const bat = w3.monsters.find((m) => m.kind === 'bat')!;
  const score1 = w3.score;
  const dodgeBefore = c3('DODGE');
  bat.x = 0.999;
  w3.tick(0.05);
  assert.equal(c3('DODGE'), dodgeBefore + 1, '앉기 중 박쥐 접촉 → 회피');
  assert.equal(w3.score, score1 + WAVE.dodgeScore);
}

// 9. 아이템 6종: 드롭 테이블 구성 + 방패(접촉 1회 무효)·번개(적 이동 절반)
{
  const items = new Set(WAVE.drops.map((d) => d.item));
  assert.deepEqual([...items].sort(), ['bolt', 'coin', 'gem', 'heart', 'shield', 'star'].sort());

  const w4 = new WaveSystem(stage, 'normal', pet, words, () => {});
  w4.start();
  w4.itemShieldCharges = 1;
  const m4 = w4.monsters[0];
  const hp4 = w4.playerHp;
  m4.x = 0.999;
  w4.tick(0.05);
  assert.equal(w4.playerHp, hp4, '방패가 접촉 1회를 무효화');
  assert.equal(w4.itemShieldCharges, 0, '방패 소모');

  const w5 = new WaveSystem(stage, 'normal', pet, words, () => {});
  w5.start();
  w5.itemSlowLeft = WAVE.boltSec;
  const m5 = w5.monsters[0];
  const x5 = m5.x;
  w5.tick(1);
  const slowMoved = m5.x - x5;

  const w6 = new WaveSystem(stage, 'normal', pet, words, () => {});
  w6.start();
  const m6 = w6.monsters[0];
  const x6 = m6.x;
  w6.tick(1);
  const normalMoved = m6.x - x6;
  assert.ok(slowMoved < normalMoved * 0.6, '번개: 적 이동 속도 절반');
}

// 10. S1 마지막 웨이브 대장 슬라임: 20번째(마지막) 몬스터가 큰 슬라임(HP 2배·느림)
{
  const w7 = new WaveSystem(stage, 'normal', pet, words, () => {});
  w7.start();
  let guard3 = 0;
  while (!w7.finished && guard3++ < 200) {
    const t = w7.target;
    if (!t) { w7.tick(0.5); continue; }
    w7.submit(t.word.text, false);
    w7.tick(0.1);
  }
  assert.ok(w7.finished, '클리어됨');
  const boss = w7.monsters.find((m) => m.big);
  assert.ok(boss, '대장 슬라임이 스폰됨');
  assert.equal(boss!.kind, 'slime');
  assert.equal(boss!.name, '대장 슬라임');
  assert.equal(boss!.maxHp, 4 * WAVE.bossHpMul, '4음절 대장 낱말 × HP배율');
  assert.ok(boss!.speed < (1 / WAVE.travelSec.slime), '대장은 일반 슬라임보다 느림');
}

console.log('check-wave: all passed');
