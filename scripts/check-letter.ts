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
// 정답 조각 = 순서상 다음 문장. 테스트만 내부 순서를 본다(점프로 순서가 바뀔 수 있어 S 인덱스를 쓰지 않는다).
const answerOf = (sys: LetterSystem) => { const inner = sys as unknown as { sentences: ContentUnit[]; idx: number }; return inner.sentences[inner.idx].text; };
const pick = (sys: LetterSystem) => {
  const choices = sys.snapshot().letter!.choices;
  assert.ok(choices, '문장을 치기 전에 다음 조각을 고른다');
  assert.ok(sys.choose(choices!.indexOf(answerOf(sys))), '정답 조각을 고르면 그 문장이 목표가 된다');
};

// 0. 「다음 조각 고르기」: 시작하면 목표 없이 후보 3개. 오답은 힌트만·읽기 실수 1(타자 오타·제출 0). 정답이면 그 문장이 목표.
{
  const info = L.snapshot().letter!;
  assert.equal(L.run.current, null, '고르는 동안에는 입력 목표가 없다');
  assert.equal(count('LETTER_CHOICE'), 1);
  assert.equal(info.choices!.length, 3);
  assert.ok(info.choices!.includes(S[0]));
  assert.equal(new Set(info.choices).size, 3, '후보는 서로 다르다');
  const wrongIndex = info.choices!.findIndex((t) => t !== S[0]);
  assert.equal(L.choose(wrongIndex), false);
  assert.equal(count('LETTER_CHOICE_WRONG'), 1);
  assert.equal(L.readingMistakes, 1);
  assert.equal(L.snapshot().letter!.readingMistakes, 1);
  assert.equal(L.snapshot().letter!.choiceHint, '사막을', '힌트는 정답 문장의 첫 낱말');
  assert.equal(L.snapshot().letter!.choices!.length, 3, '오답 뒤에도 계속 고른다');
  assert.equal(L.run.current, null);
  assert.equal(L.run.stats.submissions, 0, '읽기 실수는 제출·타자 오타로 세지 않는다');
  assert.equal(L.run.learningAttempts.length, 0, '타자 오답 근거에도 넣지 않는다');
  assert.equal(L.run.mistakes.length, 0);
  assert.ok(L.choose(L.snapshot().letter!.choices!.indexOf(S[0])));
  assert.equal(count('LETTER_CHOICE_OK'), 1);
  assert.equal(count('TARGET_CHANGED'), 2, '시작 + 고른 뒤');
  assert.equal(L.run.current!.text, S[0]);
  assert.equal(L.snapshot().letter!.choices, null);
  assert.equal(L.snapshot().letter!.choiceHint, null);
}

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

// 2. 문장 완성 → 줄 기록, 3문장(LETTER.perLock)마다 자물쇠
L.submit(S[0], true); // 고쳐서 PERFECT 아님
assert.equal(L.lines.length, 1);
assert.equal(count('LETTER_LOCK'), 0);
assert.equal(L.run.current, null, '문장을 완성하면 다음 조각을 고른다');
assert.equal(count('LETTER_CHOICE'), 2);
pick(L);
L.submit(S[1], false);
assert.equal(count('LETTER_LOCK'), 0, '두 문장으로는 아직 자물쇠가 안 열린다');
pick(L);
L.submit(S[2], false);
assert.equal(count('LETTER_LOCK'), 1);
assert.equal(L.locksOpen, 1);

// 3. 10글자 무오타 → 룬 발광 이벤트 (한 문장 안에서 글자마다 확정)
{
  pick(L);
  const t = S[3];
  const before = count('LETTER_GLOW');
  let v = '';
  for (const ch of t) { v += ch; L.commit(v); }
  assert.equal(count('LETTER_GLOW'), before + 1);
  L.submit(t, false);
}

// 4. 5초 무입력 → 읽기 안내만. 읽는 동안 점수·콤보 유지, 입력하면 안내 꺼짐
{
  const s0 = L.score;
  const combo0 = L.run.combo;
  for (let i = 0; i < 60; i++) L.tick(0.1);
  assert.ok(L.snapshot().letter!.idle);
  assert.equal(L.score, s0, '읽기를 기다린다고 획득 점수를 빼앗지 않는다');
  assert.equal(L.run.combo, combo0, '문장 읽기 대기는 콤보를 유지한다');
  pick(L);
  L.commit('문');
  L.tick(0.1);
  assert.ok(!L.snapshot().letter!.idle);
}

// 5. 나머지 문장 완성(PERFECT 2개 이상) → 비밀방 + 황금문 + 클리어
L.submit(S[4], false);
assert.ok(L.secretRoom, 'PERFECT 2개 → 비밀방');
assert.equal(count('LETTER_SECRET'), 1);
pick(L);
L.submit(S[5], false);
assert.equal(L.locksOpen, 2, '6문장 → 자물쇠 2개');
assert.ok(!L.finished);
for (const s of S.slice(6)) { pick(L); L.submit(s, false); }
assert.ok(L.finished);
assert.equal(L.snapshot().letter!.choices, null, '다 되찾으면 고를 조각이 없다');
assert.equal(L.readingMistakes, 1, '읽기 실수는 처음 한 번뿐');
assert.equal(L.locksOpen, LETTER.locks);
assert.equal(count('LETTER_GATE'), 1);
assert.equal(count('STAGE_CLEAR'), 1);
assert.ok(L.run.coins >= LETTER.secretCoins);

const makeUnits = (prefix: string, tags: string[] = ['편지'], texts = S) => texts.map((text, i) => ({ id: prefix + i, stage: 'stage_3', type: 'sentence', text, difficulty: 3, tags, weight: 1 } as ContentUnit));

// 6. 고르는 중의 점프: 점프 1회를 쓰고 그 문장을 뒤로 보낸 뒤 다음 문장이 바로 목표가 된다(고르기 없음). 점프가 없으면 고르기를 건너뛸 수 없다.
{
  const K = new LetterSystem(stage, 'normal', pet, makeUnits('k'), () => {});
  K.start();
  assert.equal(K.run.current, null);
  assert.ok(K.skip(), '고르는 중에도 점프할 수 있다');
  assert.equal(K.run.skipsLeft, 2, '점프 1회 소모');
  assert.equal(K.run.current!.text, S[1], '고르기를 건너뛰면 다음 문장이 바로 보인다');
  assert.equal(K.readingMistakes, 0, '점프는 읽기 실수가 아니다');
  assert.equal(K.snapshot().letter!.choices, null);
  K.submit(S[1], false);
  assert.equal(K.run.current, null, '문장을 완성하면 다시 고른다');
  assert.ok(K.skip()); // 고르는 중 점프: S[2] 뒤로, S[3] 목표
  assert.equal(K.run.current!.text, S[3]);
  assert.ok(K.skip()); // 입력 중 점프: S[3] 뒤로, S[4] 목표
  assert.equal(K.run.current!.text, S[4]);
  assert.equal(K.run.skipsLeft, 0);
  K.submit(S[4], false);
  assert.ok(K.snapshot().letter!.choices, '완성 뒤 다시 고르기');
  assert.equal(K.skip(), false, '점프가 없으면 고르기를 건너뛸 수 없다');
  assert.ok(K.snapshot().letter!.choices);
  assert.equal(K.lines.length, 2, '점프한 문장은 완성으로 세지 않는다');
}

// 7. 마지막 문장도 후보 3개: 뒤 문장이 없으면 다른 후보 문장(사막·리믹스)에서, 그것도 없으면 이미 되찾은 문장에서 채운다.
{
  const extras = makeUnits('x', ['사막'], ['모래 고양이가 꼬리를 흔들었어.', '보물은 우리가 되찾은 글자였어.']);
  const M = new LetterSystem(stage, 'normal', pet, makeUnits('m'), () => {}, { distractors: extras, random: () => 0.5 });
  M.start();
  for (let i = 0; i < S.length; i++) {
    const choices = M.snapshot().letter!.choices!;
    assert.equal(choices.length, 3, `${i + 1}번째 문장도 후보 3개`);
    assert.equal(new Set(choices).size, 3);
    if (i === S.length - 1) assert.ok(choices.some((t) => extras.some((x) => x.text === t)), '마지막 문장은 다른 후보 문장에서 채운다');
    assert.ok(M.choose(choices.indexOf(S[i])));
    M.submit(S[i], false);
  }
  assert.ok(M.finished);
  const N = new LetterSystem(stage, 'normal', pet, makeUnits('n'), () => {});
  N.start();
  for (let i = 0; i < S.length; i++) {
    const choices = N.snapshot().letter!.choices!;
    assert.equal(choices.length, 3, `후보 문장이 없어도 ${i + 1}번째 문장은 후보 3개(되찾은 문장으로 채움)`);
    assert.ok(N.choose(choices.indexOf(S[i])));
    N.submit(S[i], false);
  }
  assert.ok(N.finished);
}

console.log('check-letter: all passed');
