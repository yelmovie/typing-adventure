// LetterSystem(사막 유적) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { LetterSystem, LETTER } from '../src/game/systems/LetterSystem';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';

const stage = { id: 'stage_3', index: 3, mode: 'letter', targets: 6, timeLimitSec: 210 } as StageDef;
const pet: PetDef = { id: 'cat', name: '', desc: '', sheet: '', passive: 'block_wrong', passiveDesc: '', active: 'shield', activeDesc: '' };
const S = ['사막을 지나온 사람에게.', '오래된 탑 뒤의 길을 찾을 수 있겠는가?', '길 끝에는 별빛이 비치는 문이 있다.', '문은 정직한 손끝에만 열린다.', '한 글자씩 천천히, 그러나 멈추지 마라!', '너의 이름을 별들이 기억할 것이다.'];
const units: ContentUnit[] = S.map((text, i) => ({ id: 's' + i, stage: 'stage_3', type: 'sentence', text, difficulty: 3, tags: ['편지'], weight: 1 }));

const events: [string, unknown][] = [];
const L = new LetterSystem(stage, 'normal', pet, units, (ev, d) => events.push([ev, d]));
L.start();
const count = (ev: string) => events.filter((e) => e[0] === ev).length;

// 1. 어절 룬: "사막을 " 까지 치면 룬 0 점등, 틀린 글자면 균열, 고치면 복구
assert.equal(L.snapshot().letter!.runes.length, 3);
L.commit('사막을');
assert.equal(count('LETTER_RUNE'), 1);
L.commit('사막을 지나옴');
assert.equal(count('LETTER_CRACK'), 1);
assert.equal(L.snapshot().letter!.runes[1], 'crack');
L.commit('사막을 지나온');
assert.equal(count('LETTER_RESTORE'), 1);
assert.equal(count('LETTER_RUNE'), 2, '두 번째 어절 점등');

// 2. 문장 완성 → 줄 기록, 2문장마다 자물쇠
L.submit(S[0], true); // 고쳐서 PERFECT 아님
assert.equal(L.lines.length, 1);
assert.equal(count('LETTER_LOCK'), 0);
L.submit(S[1], false);
assert.equal(count('LETTER_LOCK'), 1);
assert.equal(L.locksOpen, 1);

// 3. 10글자 무오타 → 룬 발광 이벤트 (한 문장 안에서 글자마다 확정)
{
  const t = S[2];
  const before = count('LETTER_GLOW');
  let v = '';
  for (const ch of t) { v += ch; L.commit(v); }
  assert.equal(count('LETTER_GLOW'), before + 1);
  L.submit(t, false);
}

// 4. 5초 무입력 → 모래시계 켜짐, 점수 감소. 입력하면 꺼짐
{
  const s0 = L.score;
  for (let i = 0; i < 60; i++) L.tick(0.1);
  assert.ok(L.snapshot().letter!.idle);
  assert.ok(L.score < s0);
  L.commit('문');
  L.tick(0.1);
  assert.ok(!L.snapshot().letter!.idle);
}

// 5. 나머지 문장 완성(PERFECT 2개 이상) → 비밀방 + 황금문 + 클리어
L.submit(S[3], false);
L.submit(S[4], false);
assert.ok(L.secretRoom, 'PERFECT 2개 → 비밀방');
assert.equal(count('LETTER_SECRET'), 1);
L.submit(S[5], false);
assert.ok(L.finished);
assert.equal(L.locksOpen, LETTER.locks);
assert.equal(count('LETTER_GATE'), 1);
assert.equal(count('STAGE_CLEAR'), 1);
assert.ok(L.run.coins >= LETTER.secretCoins);

console.log('check-letter: all passed');
