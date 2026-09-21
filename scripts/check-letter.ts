// LetterSystem(사막 유적) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { LetterSystem, LETTER } from '../src/game/systems/LetterSystem';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';

const stage = { id: 'stage_3', index: 3, mode: 'letter', targets: LETTER.sentences, timeLimitSec: 300 } as StageDef;
const pet: PetDef = { id: 'cat', name: '', desc: '', sheet: '', passive: 'block_wrong', passiveDesc: '', active: 'shield', activeDesc: '' };
const S = ['사막을 지나온 사람에게.', '오래된 탑 뒤의 길을 찾을 수 있겠는가?', '길 끝에는 별빛이 비치는 문이 있다.', '문은 정직한 손끝에만 열린다.', '한 글자씩 천천히, 그러나 멈추지 마라!', '너의 이름을 별들이 기억할 것이다.', '모래바람이 멎으면 계단이 드러난다.', '계단 끝의 촛불이 길을 비춘다.', '이제 황금문을 열어라.'];
assert.equal(S.length, LETTER.sentences, '테스트 편지는 실제 문장 수와 같다');
const units: ContentUnit[] = S.map((text, i) => ({ id: 's' + i, stage: 'stage_3', type: 'sentence', text, difficulty: 3, tags: ['편지'], weight: 1 }));

const events: [string, unknown][] = [];
const L = new LetterSystem(stage, 'normal', pet, units, (ev, d) => events.push([ev, d]));
L.start();
const count = (ev: string) => events.filter((e) => e[0] === ev).length;

// 0. 시작하자마자 첫 편지 문장이 입력 목표가 되고 선택 이벤트는 없다.
assert.equal(L.run.current?.text, S[0]);
assert.equal(L.snapshot().target?.text, S[0]);
assert.equal(count('LETTER_CHOICE'), 0);
assert.equal(count('TARGET_CHANGED'), 1);

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

// 2. 문장 완성 → 다음 편지 문장이 바로 이어지고, 3문장마다 자물쇠가 열린다.
L.submit(S[0], true); // 고쳐서 PERFECT 아님
assert.equal(L.lines.length, 1);
assert.equal(count('LETTER_LOCK'), 0);
assert.equal(L.run.current?.text, S[1]);
L.submit(S[1], false);
assert.equal(count('LETTER_LOCK'), 0, '두 문장으로는 아직 자물쇠가 안 열린다');
assert.equal(L.run.current?.text, S[2]);
L.submit(S[2], false);
assert.equal(count('LETTER_LOCK'), 1);
assert.equal(L.locksOpen, 1);
assert.equal(L.run.current?.text, S[3]);

// 3. 10글자 무오타 → 룬 발광 이벤트
{
  const t = S[3];
  const before = count('LETTER_GLOW');
  let v = '';
  for (const ch of t) { v += ch; L.commit(v); }
  assert.equal(count('LETTER_GLOW'), before + 1);
  L.submit(t, false);
}

// 4. 5초 무입력 → 읽기 안내만. 읽는 동안 점수·콤보 유지, 입력하면 안내가 꺼진다.
{
  const s0 = L.score;
  const combo0 = L.run.combo;
  for (let i = 0; i < 60; i++) L.tick(0.1);
  assert.ok(L.snapshot().letter!.idle);
  assert.equal(L.score, s0, '읽기를 기다린다고 획득 점수를 빼앗지 않는다');
  assert.equal(L.run.combo, combo0, '문장 읽기 대기는 콤보를 유지한다');
  L.commit('한');
  L.tick(0.1);
  assert.ok(!L.snapshot().letter!.idle);
}

// 5. 나머지 문장 완성(PERFECT 2개 이상) → 비밀방 + 황금문 + 클리어
L.submit(S[4], false);
assert.ok(L.secretRoom, 'PERFECT 2개 → 비밀방');
assert.equal(count('LETTER_SECRET'), 1);
L.submit(S[5], false);
assert.equal(L.locksOpen, 2, '6문장 → 자물쇠 2개');
assert.ok(!L.finished);
for (const s of S.slice(6)) L.submit(s, false);
assert.ok(L.finished);
assert.equal(L.locksOpen, LETTER.locks);
assert.equal(count('LETTER_GATE'), 1);
assert.equal(count('STAGE_CLEAR'), 1);
assert.ok(L.run.coins >= LETTER.secretCoins);

// 6. 점프한 문장만 편지 끝으로 이동하고, 선택 단계 없이 다음 문장이 바로 보인다.
{
  const K = new LetterSystem(stage, 'normal', pet, units, () => {});
  K.start();
  assert.equal(K.run.current?.text, S[0]);
  assert.ok(K.skip());
  assert.equal(K.run.skipsLeft, 2);
  assert.equal(K.run.current?.text, S[1]);
  K.submit(S[1], false);
  assert.equal(K.run.current?.text, S[2]);
  assert.ok(K.skip());
  assert.equal(K.run.current?.text, S[3]);
  assert.ok(K.skip());
  assert.equal(K.run.current?.text, S[4]);
  assert.equal(K.run.skipsLeft, 0);
  assert.equal(K.skip(), false);
  assert.equal(K.lines.length, 1, '점프한 문장은 완성으로 세지 않는다');
}

console.log('check-letter: all passed');
