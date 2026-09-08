// BossSystem(어둠의 성채) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { BossSystem, BOSS } from '../src/game/systems/BossSystem';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';

const stage = { id: 'stage_5', index: 5, mode: 'boss', targets: 20, timeLimitSec: 300 } as StageDef;
const pet: PetDef = { id: 'dragon', name: '', desc: '', sheet: '', passive: 'strong_bonus', passiveDesc: '', active: 'fire_aoe', activeDesc: '' };
const w = (text: string, type: 'word' | 'sentence' = 'word'): ContentUnit => ({ id: text, stage: 'stage_5', type, text, difficulty: 1, tags: [], weight: 1 });
const words = {
  crystals: ['빛', '용기', '희망', '미래', '도전'].map((t) => w(t)),
  rush: ['별', '함께', '마음', '친구', '시작', '약속', '하늘'].map((t) => w(t)),
  final: [w('우리는 작은 한 글자부터 새로운 길을 만들었다.', 'sentence'), w('포기하지 않고 계속 나아가면 더 넓은 세상이 열린다!', 'sentence')],
};
const events: [string, unknown][] = [];
const B = new BossSystem(stage, 'normal', pet, words, 'mon_keyboard_golem', (ev, d) => events.push([ev, d]));
B.start();
const count = (ev: string) => events.filter((e) => e[0] === ev).length;

// P1: 결정 5개 → 페이즈 2
assert.equal(B.phase, 1);
B.commit('용');
for (let i = 0; i < 5; i++) { B.submit(B.run.current!.text, false); B.tick(0.1); }
assert.equal(count('BOSS_CRYSTAL_BREAK'), 5);
assert.equal(B.phase, 2);
assert.equal(B.bossHp, BOSS.hp, 'P1 은 보호막, 보스 HP 그대로');

// P2: 큐가 3초마다 차고, 4개 넘치면 어둠 → HP-10
for (let i = 0; i < 6; i++) B.tick(0.1); // 첫 낱말 등장(0.5초)
assert.ok(B.queue.length >= 1 && B.run.current?.text === B.queue[0].text);
for (let i = 0; i < 160; i++) B.tick(0.1); // 16초 방치 → 큐 4 + 넘침
assert.equal(B.queue.length, BOSS.queueMax);
assert.ok(count('BOSS_DARK') >= 1);
assert.ok(B.playerHp < 100);

// P2: 낱말 완성 → 보스 피해, HP 30% 이하 → 페이즈 3
let guard = 0;
while (B.phase === 2 && guard++ < 600) {
  if (!B.run.current) { B.tick(0.5); continue; } // 큐가 비면 다음 낱말 등장까지 대기
  B.submit(B.run.current.text, false);
  B.tick(0.1);
}
assert.equal(B.phase, 3);
assert.equal(B.bossHp, BOSS.phase3At);
assert.ok(count('BOSS_HIT') >= 5);

// P3: 문장 1 → 갑옷, 문장 2 → 코어 + 최종 + 클리어
B.submit(B.run.current!.text, false);
assert.ok(B.armorBroken && B.bossHp === BOSS.armorHp);
assert.equal(count('BOSS_ARMOR'), 1);
B.submit(B.run.current!.text, false);
assert.ok(B.finished && B.finalDone && B.bossHp === 0);
assert.equal(count('BOSS_FINAL'), 1);
assert.equal(count('STAGE_CLEAR'), 1);

console.log('check-boss: all passed');
