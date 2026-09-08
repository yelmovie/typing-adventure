// WaveSystem(푸른 숲) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { WaveSystem, WAVE } from '../src/game/systems/WaveSystem';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';

const stage = { id: 'stage_1', index: 1, mode: 'wave', targets: 20, timeLimitSec: 180 } as StageDef;
const pet: PetDef = { id: 'dragon', name: '', desc: '', sheet: '', passive: 'strong_bonus', passiveDesc: '', active: 'fire_aoe', activeDesc: '' };
const unit = (text: string): ContentUnit => ({ id: text, stage: 'stage_1', type: 'word', text, difficulty: 1, tags: [], weight: 1 });
const words = { slime: ['나무', '바다', '구름', '바람', '학교', '친구'].map(unit), bat: ['무지개', '소나무', '도서관', '자전거', '놀이터'].map(unit) };

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
for (let i = 0; i < 300; i++) w.tick(0.1); // 30초
assert.ok(w.monsters.filter((m) => !m.dead).length <= WAVE.maxOnField);
assert.ok(w.spawnedCount() >= 5, '30초면 5마리 이상 등장');

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

// 5. 오타 → 콤보만 0, HP 그대로
const hp1 = w.playerHp;
w.submit('틀림', false);
assert.equal(w.playerHp, hp1);
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

console.log('check-wave: all passed');
