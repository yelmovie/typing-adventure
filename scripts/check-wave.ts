// WaveSystem(푸른 숲) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { WaveSystem, WAVE } from '../src/game/systems/WaveSystem';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';

const stage = { id: 'stage_1', index: 1, mode: 'wave', targets: WAVE.total, timeLimitSec: 225 } as StageDef;
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

// 3. 시간이 흐르면 스폰되고, 화면 위 마릿수 상한을 넘지 않는다
for (let i = 0; i < 150; i++) { w.tick(0.1); if (i % 30 === 0 && w.target) w.commit(w.target.word.text[0]); } // 15초, 3초마다 한 글자 쳐서 무입력 감소는 안 걸리게
assert.ok(w.monsters.filter((m) => !m.dead).length <= WAVE.maxOnField);
assert.ok(w.spawnedCount() >= 3, '15초면 최소한 워밍업 3마리는 등장');

// 3-1. 화면에 떠 있는 낱말은 현재 선택 순서와 무관하게 곧바로 골라 처치한다.
{
  const free = new WaveSystem(stage, 'normal', pet, words, () => {});
  free.start();
  for (let i = 0; i < 45; i++) free.tick(0.1);
  const other = free.monsters.find((monster) => !monster.dead && monster.uid !== free.target?.uid);
  assert.ok(other, '자유 선택을 확인할 두 번째 몬스터가 등장');
  free.submit(other!.word.text, false);
  assert.equal(other!.dead, true, '현재 목표가 아니어도 화면의 낱말을 맞히면 처치');
}

// 4. 접촉: x가 1에 닿으면 HP-10, 밀려남
// 앞 루프에서 이미 몇 번 닿았을 수 있다. 무적·기운내기를 끄고 이 한 번의 접촉만 본다.
w.invulnLeft = 0;
w.rallyUsed = true;
const m = w.monsters.find((x) => !x.dead && x.pushed === 0)!;
m.x = 0.999;
const hp0 = w.playerHp;
const touches0 = count('WAVE_TOUCH');
w.tick(0.1);
assert.equal(w.playerHp, hp0 - WAVE.touchHp);
assert.ok(m.x < 0.6 && m.pushed > 0, '밀려남');
assert.equal(count('WAVE_TOUCH'), touches0 + 1);
assert.ok(w.invulnLeft > 0, '맞으면 무적 시간이 켜진다');

// 5. 오타 → 콤보 0, HP -3(위험·보상 루프)
const hp1 = w.playerHp;
w.submit('틀림', false);
assert.equal(w.playerHp, hp1 - 3);
assert.equal(w.run.combo, 0);

// 6. 30마리(WAVE.total) 처치 → 문 개방 + 클리어 (광역은 TypingRun 테스트의 FEVER 진입에 의존)
let guard = 0;
while (!w.finished && guard++ < 800) {
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
  while (w2.run.combo < WAVE.sweepEvery && !w2.finished && guard++ < 400) { if (w2.target) w2.submit(w2.target.word.text, false); else w2.tick(0.5); }
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

  // ↑ 를 누른 채로 두어도 jumpSec 이 지나면 회피 판정이 끝난다(캐릭터는 이미 착지했으므로)
  for (let i = 0; i < 12; i++) w3.tick(0.05); // 0.6초 > WAVE.jumpSec
  const hp1 = w3.playerHp;
  const dodged1 = c3('DODGE');
  slime.pushed = 0;
  slime.x = 0.999;
  w3.tick(0.05);
  assert.equal(c3('DODGE'), dodged1, '점프 시간이 지나면 ↑ 를 꾹 눌러도 회피 안 됨');
  assert.ok(w3.playerHp < hp1, '점프 끝난 뒤 접촉은 정상 피해');
  w3.move('up', false);

  // 박쥐가 나올 때까지 목표를 맞혀 웨이브를 진행시킨다(회피 꺼짐 → 접촉은 정상 피해, HP는 넉넉함)
  let guard2 = 0;
  while (!w3.monsters.some((m) => m.kind === 'bat') && !w3.finished && guard2++ < 1200) {
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

// 9. 아이템 6종: 코인은 즉시, 나머지는 인벤토리에 모아 선택 사용
{
  const items = new Set(WAVE.drops.map((d) => d.item));
  assert.deepEqual([...items].sort(), ['bolt', 'coin', 'gem', 'heart', 'shield', 'star'].sort());

  const itemEvents: [string, unknown][] = [];
  const w4 = new WaveSystem(stage, 'normal', pet, words, (ev, data) => itemEvents.push([ev, data]));
  w4.start();
  w4.loadItemInventory({ heart: 2, star: 1, shield: 1, bolt: 1 });
  assert.equal(w4.useItem('heart'), false, 'HP가 가득 찼을 때 하트를 낭비하지 않음');
  w4.playerHp -= 30;
  assert.ok(w4.useItem('heart'));
  assert.equal(w4.playerHp, w4.playerMaxHp - 10, '하트 사용: HP 20 회복');
  const itemScore = w4.score;
  assert.ok(w4.useItem('star'));
  assert.equal(w4.score, itemScore + 150, '별 사용: 점수 150점');
  assert.ok(w4.useItem('shield'));
  assert.equal(w4.itemShieldCharges, 1, '방패 사용: 방어 1회 충전');
  const m4 = w4.monsters[0];
  const hp4 = w4.playerHp;
  m4.x = 0.999;
  w4.tick(0.05);
  assert.equal(w4.playerHp, hp4, '방패가 접촉 1회를 무효화');
  assert.equal(w4.itemShieldCharges, 0, '방패 소모');
  assert.equal(itemEvents.filter(([ev]) => ev === 'ITEM_USED').length, 3, '하트·별·방패 사용 이벤트');

  const restoredItems = new WaveSystem(stage, 'normal', pet, words, () => {});
  restoredItems.restore(w4.serialize());
  assert.deepEqual(restoredItems.items, w4.items, '체크포인트에서 사용 아이템 수량 복원');
  assert.equal(restoredItems.score, w4.score, '별 사용 점수도 체크포인트 복원');

  const w5 = new WaveSystem(stage, 'normal', pet, words, () => {});
  w5.start();
  w5.loadItemInventory({ bolt: 1 });
  assert.ok(w5.useItem('bolt'));
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
  assert.equal(w5.useItem('bolt'), false, '재고가 없거나 감속 중이면 중복 사용 안 됨');

  // 보석 드롭: 동전과 인벤토리에 실제 적립되고, 등급별 시간 동안 적 이동을 완전히 멈춘다.
  const gemEvents: [string, unknown][] = [];
  const gemRun = new WaveSystem(stage, 'normal', pet, words, (ev, data) => gemEvents.push([ev, data]));
  gemRun.start();
  const originalRandom = Math.random;
  const rolls = [0, 0.47, 0.99]; // 드롭 성공 → gem 선택 → violet 선택
  Math.random = () => rolls.shift() ?? 0.99;
  try { gemRun.submit(gemRun.target!.word.text, false); } finally { Math.random = originalRandom; }
  assert.equal(gemRun.run.coins, 5, '보석 드롭 동전 5개 적립');
  assert.equal(gemRun.gems.violet, 1, '보라 보석 인벤토리 적립');
  while (!gemRun.target) gemRun.tick(0.5);
  const frozen = gemRun.target!;
  const frozenX = frozen.x;
  assert.ok(gemRun.useGem('violet'));
  assert.equal(gemRun.useGem('violet'), false, '정지 중 보석을 중복 소비하지 않음');
  gemRun.tick(1);
  assert.equal(frozen.x, frozenX, '보라 보석 사용 중 적 이동 정지');
  assert.equal(gemRun.gems.violet, 0, '사용한 보석 차감');
  assert.ok(gemEvents.some(([event]) => event === 'GEM_COLLECTED'));
  assert.ok(gemEvents.some(([event]) => event === 'GEM_USED'));

  const pickupEvents: [string, unknown][] = [];
  const pickupRun = new WaveSystem(stage, 'normal', pet, words, (ev, data) => pickupEvents.push([ev, data]));
  pickupRun.start();
  const pickupRandom = Math.random;
  const pickupRolls = [0, 0.75]; // 드롭 성공 → heart 구간
  Math.random = () => pickupRolls.shift() ?? 0.75;
  try { pickupRun.submit(pickupRun.target!.word.text, false); } finally { Math.random = pickupRandom; }
  assert.equal(pickupRun.items.heart, 1, '하트 드롭은 즉시 쓰지 않고 인벤토리에 적립');
  assert.ok(pickupEvents.some(([event]) => event === 'ITEM_COLLECTED'));
}

// 10. S1 대왕 슬라임: 마지막 몬스터, 느린 10시 진입, 정확히 5회 완성 후 처치
{
  const bossEvents: [string, unknown][] = [];
  const w7 = new WaveSystem(stage, 'normal', pet, words, (ev, data) => bossEvents.push([ev, data]));
  w7.start();
  let guard3 = 0;
  let boss = w7.monsters.find((m) => m.big);
  while (!boss && !w7.finished && guard3++ < 1200) {
    const t = w7.target;
    if (!t) { w7.tick(0.5); boss = w7.monsters.find((m) => m.big); continue; }
    w7.submit(t.word.text, false);
    w7.tick(0.1);
    boss = w7.monsters.find((m) => m.big);
  }
  assert.ok(boss, '대장 슬라임이 스폰됨');
  assert.equal(boss!.kind, 'slime');
  assert.equal(boss!.name, '대장 슬라임');
  assert.equal(boss!.maxHp, 4, '4음절 낱말의 글자 타격 진행');
  assert.ok(boss!.speed < (1 / WAVE.travelSec.slime), '대장은 일반 슬라임보다 느림');
  assert.equal(boss!.bossHitsTotal, 5);
  for (const remaining of [4, 3, 2, 1]) {
    w7.submit(boss!.word.text, false);
    assert.equal(boss!.dead, false, `${5 - remaining}번째 완성에는 생존`);
    assert.equal(boss!.bossHitsRemaining, remaining);
    assert.equal(boss!.hp, boss!.maxHp, '다음 타격을 위해 낱말 체력 복원');
  }
  assert.equal(bossEvents.filter(([ev]) => ev === 'WAVE_BOSS_HIT').length, 4, '중간 4타 피드백');
  w7.submit(boss!.word.text, false);
  assert.equal(boss!.dead, true, '5번째 완성에만 처치');
  assert.equal(boss!.bossHitsRemaining, 0);
  assert.ok(w7.finished, '대왕 슬라임 처치 뒤 클리어');
  assert.equal(bossEvents.filter(([ev]) => ev === 'STAGE_CLEAR').length, 1);
}

// 11. 속도 적응형 스폰: 빨리 치는 아이에겐 촘촘하게, 느린 아이에겐 뜸하게 나온다
{
  const SEC = 24;
  // 느린 아이: 8초에 한 낱말
  const slow = new WaveSystem(stage, 'normal', pet, words, () => {});
  slow.start();
  for (let i = 0; i < SEC * 10 && !slow.finished; i++) {
    slow.tick(0.1);
    if (i % 80 === 79 && slow.target) slow.submit(slow.target.word.text, false);
  }
  const slowSpawns = slow.spawnedCount();
  const slowField = slow.monsters.filter((m) => !m.dead).length;

  // 빠른 아이: 1.5초에 한 낱말
  const fast = new WaveSystem(stage, 'normal', pet, words, () => {});
  fast.start();
  let fastSpawns = 0;
  for (let i = 0; i < SEC * 10 && !fast.finished; i++) {
    fast.tick(0.1);
    if (i % 15 === 14 && fast.target) fast.submit(fast.target.word.text, false);
    fastSpawns = Math.max(fastSpawns, fast.spawnedCount());
  }

  assert.ok(fastSpawns > slowSpawns, `빠른 아이에게 더 많이 등장 (빠름 ${fastSpawns} > 느림 ${slowSpawns})`);
  assert.ok(slowField <= 3, `느린 아이 화면엔 3마리 이하만 남는다 (실제 ${slowField})`);
  assert.ok(slowSpawns >= 3, '느려도 워밍업 3마리는 나온다');
}

// 12. 피격 무적: 여러 마리가 동시에 닿아도 한 번만 깎인다
{
  const w8 = new WaveSystem(stage, 'normal', pet, words, () => {});
  w8.start();
  for (let i = 0; i < 200; i++) w8.tick(0.1); // 여러 마리 등장
  w8.rallyUsed = true; // 기운내기와 섞이지 않게
  w8.invulnLeft = 0;
  const alive = w8.monsters.filter((m) => !m.dead).slice(0, 3);
  assert.ok(alive.length >= 2, '두 마리 이상 살아 있어야 이 검사가 의미 있다');
  const hpA = w8.playerHp;
  for (const m of alive) { m.x = 0.999; m.pushed = 0; }
  w8.tick(0.05); // 같은 프레임에 전부 접촉
  assert.equal(w8.playerHp, hpA - WAVE.touchHp, '동시에 닿아도 피해는 1회분');

  // 무적이 끝나면 다시 맞는다
  for (let i = 0; i < Math.ceil(WAVE.hitInvulnSec / 0.1) + 2; i++) w8.tick(0.1);
  assert.equal(w8.invulnLeft, 0, '무적이 끝났다');
  const hpB = w8.playerHp;
  const m8 = w8.monsters.find((m) => !m.dead)!;
  m8.pushed = 0;
  m8.x = 0.999;
  w8.tick(0.05);
  assert.equal(w8.playerHp, hpB - WAVE.touchHp, '무적이 끝나면 정상 피해');
}

// 13. 기운내기: HP 가 문턱 아래로 처음 떨어지면 판당 1회 발동 — 회복 + 적 정지
{
  const ev9: [string, unknown][] = [];
  const w9 = new WaveSystem(stage, 'normal', pet, words, (ev, d) => ev9.push([ev, d]));
  w9.start();
  for (let i = 0; i < 100; i++) w9.tick(0.1);
  const c9 = (ev: string) => ev9.filter((e) => e[0] === ev).length;
  assert.equal(c9('RALLY'), 0, '아직 HP 가 넉넉하면 발동 안 함');

  w9.playerHp = WAVE.rallyAtHp + WAVE.touchHp; // 한 대 맞으면 문턱 아래로
  w9.invulnLeft = 0;
  const m9 = w9.monsters.find((m) => !m.dead)!;
  m9.pushed = 0;
  m9.x = 0.999;
  w9.tick(0.05);
  assert.equal(c9('RALLY'), 1, '문턱 아래로 떨어지면 발동');
  assert.equal(w9.playerHp, WAVE.rallyAtHp + WAVE.rallyHeal, '맞은 뒤 회복량만큼 돌아온다');
  assert.ok(w9.monsters.filter((m) => !m.dead).every((m) => m.pushed > 0), '화면의 적이 전부 멈춘다');
  assert.ok(w9.rallyUsed);

  // 판당 1회 — 다시 떨어져도 발동하지 않는다
  w9.playerHp = 20;
  w9.invulnLeft = 0;
  const m9b = w9.monsters.find((m) => !m.dead)!;
  m9b.pushed = 0;
  m9b.x = 0.999;
  w9.tick(0.05);
  assert.equal(c9('RALLY'), 1, '판당 1회만');
}

console.log('check-wave: all passed');
