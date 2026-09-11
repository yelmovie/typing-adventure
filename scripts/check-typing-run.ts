// TypingRun 공통 코어 셀프체크. 실행: npm run check
// (esbuild로 번들 → node. 브라우저/Phaser 없이 순수 로직만 검증)
import assert from 'node:assert/strict';
import { TypingRun, RULES } from '../src/game/systems/TypingRun';
import { inputErrorCount } from '../src/game/systems/TypingStats';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';

const stage = { id: 'stage_1', index: 1, mode: 'wave', targets: 15 } as StageDef;
const pet = (over: Partial<PetDef> = {}): PetDef => ({ id: 'cat', name: '', desc: '', sheet: '', passive: 'block_wrong', passiveDesc: '', active: 'shield', activeDesc: '', ...over });
const unit = (text: string, variant?: ContentUnit['variant']): ContentUnit => ({ id: text, stage: 'stage_1', type: 'word', text, difficulty: 1, tags: [], weight: 1, variant });

function make(words: ContentUnit[], p = pet()) {
  const events: [string, unknown][] = [];
  let i = 0;
  const run = new TypingRun({ stage, difficulty: 'normal', pet: p, next: () => words[i++ % words.length], emit: (ev, d) => events.push([ev, d]), now: () => 0 });
  run.start();
  return { run, events, has: (ev: string) => events.some((e) => e[0] === ev), count: (ev: string) => events.filter((e) => e[0] === ev).length };
}

// 1. 음절 타격: '학교' — '학' 확정 → 약공격 1회, 완성은 약공격 없음(강공격은 submit)
{
  const { run, count } = make([unit('학교')]);
  assert.equal(run.onCommit('학').newHits, 1);
  assert.equal(run.onCommit('학').newHits, 0, '같은 음절 중복 없음');
  assert.equal(run.onCommit('학교').newHits, 0, '완성은 submit 몫');
  assert.equal(count('SYLLABLE_HIT'), 1);
}

// 2. 틀린 음절 표시 → 백스페이스로 고치면 콤보 유지, PERFECT 불가
{
  const { run, has } = make([unit('학교'), unit('나무')]);
  assert.equal(run.onCommit('핵').wrongIndex, 0);
  assert.ok(has('SYLLABLE_MISS'));
  run.onCommit('하'); // 조합 중 접두어 → 고침
  const r = run.submit('학교', true)!;
  assert.equal(r.correct, true);
  assert.equal(r.perfect, false);
  assert.equal(run.combo, 1);
}

// 3. 콤보 → POWER(10) → FEVER(20): 배율·용서·펫 액티브·타이머 종료
{
  const { run, events } = make([unit('가')]);
  for (let i = 0; i < 9; i++) run.submit('가', false), run.advance();
  assert.equal(run.feverLevel, 0);
  assert.equal(run.damageMult(), RULES.combo5Mult);
  run.submit('가', false), run.advance();
  assert.equal(run.feverLevel, 1, '10콤보 POWER');
  assert.equal(run.damageMult(), 1.5);
  let r;
  for (let i = 0; i < 10; i++) (r = run.submit('가', false)), run.advance();
  assert.equal(run.feverLevel, 2, '20콤보 FEVER');
  assert.equal(r!.feverEntered, true);
  assert.equal(r!.petActive, 'shield');
  assert.ok(run.isShielded());
  assert.ok(events.some((e) => e[0] === 'PET_ACTIVE'));
  // FEVER 중 오타 1회 용서 (고양이 패시브는 아직 안 씀)
  const w = run.submit('나', false)!;
  assert.equal(w.forgiven, true);
  assert.equal(run.combo, 20, '용서되면 콤보 유지');
  // 두 번째 오타는 고양이 패시브가 막음
  assert.equal(run.submit('나', false)!.forgiven, true);
  // 세 번째는 실제 오답으로 기록하지만, 아직 남은 방어막은 콤보를 보호한다.
  assert.equal(run.submit('나', false)!.forgiven, false);
  assert.equal(run.combo, 20);
  for (let t = 0; t < RULES.shieldSec * 10 + 1; t++) run.tick(0.1);
  run.submit('나', false);
  assert.equal(run.combo, 0, '방어막이 끝나면 오답 콤보 초기화');
  assert.equal(run.feverLevel, 2);
  for (let t = 0; t < RULES.feverSec * 10 + 1; t++) run.tick(0.1);
  assert.equal(run.feverLevel, 0, 'FEVER 8초 후 종료');
  assert.equal(run.shieldLeft, 0);
}

// 4. 낱말 읽기·자판 탐색 여유 12초 후 1초마다 콤보 -1
{
  const { run } = make([unit('가')]);
  for (let i = 0; i < 4; i++) run.submit('가', false), run.advance();
  assert.equal(run.combo, 4);
  for (let t = 0; t < RULES.idleSec * 10; t++) run.tick(0.1);
  assert.equal(run.combo, 4, '읽기 여유 시간까지 유지');
  for (let t = 0; t < 21; t++) run.tick(0.1);
  assert.equal(run.combo, 2, '이후 1초마다 -1');
  assert.equal(run.maxCombo, 4);
}

// 5. 변화구: 보물 코인, 폭탄 시간 초과(토끼 +2초) → 콤보만 0
{
  const { run, has } = make([unit('가'), unit('금', 'treasure'), unit('펑', 'bomb'), unit('가')], pet({ passive: 'bomb_time', active: 'time_plus' }));
  run.submit('가', false), run.advance();
  const r = run.submit('금', false)!;
  assert.equal(r.bonusScore, RULES.treasureScore);
  assert.equal(run.coins, RULES.treasureCoins);
  run.advance();
  assert.equal(run.bombLeft(), RULES.bombSec + RULES.bombPetBonusSec);
  let bomb = false;
  for (let t = 0; t < 80 && !bomb; t++) bomb = run.tick(0.1).bomb;
  assert.ok(bomb && has('BOMB_EXPLODE'));
  assert.equal(run.combo, 0);
  assert.equal(run.stats.wrongStrokes, 0, '폭탄 실패는 정확도에 안 들어감');
}

// 6. 적응형: 10단어 중 3개 틀리면 -1, 전부 맞고 빠르면 +1 (비노출)
{
  const { run } = make([unit('가')]);
  for (let i = 0; i < 10; i++) run.submit(i < 3 ? '나' : '가', false), run.advance();
  assert.equal(run.adaptiveOffset, -1);
  const fast = make([unit('학교')]);
  for (let i = 0; i < 10; i++) fast.run.tick(0.5), fast.run.submit('학교', false), fast.run.advance();
  assert.equal(fast.run.adaptiveOffset, 1);
}

// 7. 무입력 drainAfterSec 초부터 초당 drainHpPerSec 감소 (목표가 있을 때만)
{
  const { run } = make([unit('가')]);
  let drained = 0;
  for (let t = 0; t < RULES.drainAfterSec * 10; t++) drained += run.idleDrain(0.1), run.tick(0.1);
  assert.equal(drained, 0, `${RULES.drainAfterSec}초까진 안 깎임`);
  const more = 6;
  const want = more * RULES.drainHpPerSec;
  for (let t = 0; t < more * 10; t++) { run.tick(0.1); drained += run.idleDrain(0.1); }
  assert.ok(drained >= want - 1 && drained <= want, `${more}초 더 방치 → 약 ${want} (실제 ${drained})`);
  run.onCommit('가');
  assert.equal(run.idleDrain(0.1), 0, '입력하면 즉시 멈춤');
}

// 8. 위험·보상 루프: 오답 hpDelta -3(용서되면 0), PERFECT +2, 10콤보마다 +5(중첩 가능)
{
  const { run } = make([unit('가')], pet({ passive: 'strong_bonus', active: 'fire_aoe' }));
  const wrong = run.submit('X', false)!;
  assert.equal(wrong.forgiven, false);
  assert.equal(wrong.hpDelta, -RULES.wrongHp, '오답 hpDelta -3');
  run.advance();
  for (let i = 0; i < 9; i++) run.submit('가', false), run.advance();
  assert.equal(run.combo, 9);
  const r10 = run.submit('가', false)!;
  assert.equal(run.combo, 10);
  assert.equal(r10.hpDelta, RULES.comboHealHp + RULES.perfectHealHp, '10콤보 + PERFECT 동시 회복');
  run.advance();
  const r11 = run.submit('가', false)!;
  assert.equal(r11.hpDelta, RULES.perfectHealHp, '10콤보 아니면 PERFECT만 회복');
}

// 같은 실제 오타를 Enter 전에 고치거나, 오답 제출 후 고쳐도 정확도 손실은 같다.
for (const text of ['친구와 문을 열자.', 'My words opened a new path.']) {
  const wrong = text.slice(0, -1) + '?';
  const states = [false, true].map((afterSubmit) => {
    const { run } = make([{ ...unit(text), type: 'sentence' }]);
    run.onCommit(wrong);
    if (afterSubmit) run.submit(wrong, false);
    run.onCommit(text);
    run.submit(text, true);
    assert.equal(run.correctedCount, 1);
    assert.equal(run.wordsDone, 1);
    assert.equal(run.stats.wrongStrokes, 1);
    return run.stats.accuracy();
  });
  assert.equal(states[0], states[1], 'Enter는 이미 확인한 오타를 다시 감점하지 않는다');
  console.log(`check-typing-run: ${text} repair accuracy ${states[0].toFixed(2)}% before/after Enter`);
}
assert.equal(inputErrorCount('we go!', 'wego!'), 1, '빠진 공백 한 개');
assert.equal(inputErrorCount('we go!', 'we  go!'), 1, '추가 공백 한 개');
assert.equal(inputErrorCount('we go!', 'we'), 4, '제출 시에는 빠진 글자를 센다');
assert.equal(inputErrorCount('we go!', 'we', false), 0, '입력 중 뒷부분 미완성은 오타가 아니다');
{
  const { run } = make([unit('cat')]);
  run.onCommit('b');
  run.onCommit('c'); // 앞선 오타를 고쳤지만 뒤 두 글자는 아직 입력하지 않았다.
  run.submit('c', true);
  assert.equal(run.stats.wrongStrokes, 3, '고친 오타 1개와 새 제출 누락 2개는 서로 다른 오류다');
  run.onCommit('cat');
  run.submit('cat', true);
  assert.equal(run.wordsDone, 1);
}
{
  const { run } = make([unit('cat')]);
  assert.equal(run.stats.accuracy(), 0);
  for (let i = 0; i < 3; i++) { run.onCommit('car'); run.submit('car', false); }
  assert.equal(run.stats.wrongStrokes, 3, '서로 다른 오답 시도는 매번 기록한다');
  assert.equal(run.stats.accuracy(), 0);
  assert.equal(run.wordsDone, 0);
  assert.equal(run.correctedCount, 0);
}
console.log('check-typing-run: all passed');

// Celebration distinguishes a real repaired error from using Backspace alone.
{
 const { run } = make([unit('cat')]);
 const result = run.submit('cat', true)!;
 assert.equal(result.corrected, false);
 assert.equal(result.perfect, false);
 assert.equal(run.correctedCount, 0);
 run.advance(); run.onCommit('car'); run.onCommit('cat');
 const repaired = run.submit('cat', true)!;
 assert.equal(repaired.corrected, true);
 assert.equal(run.correctedCount, 1);
}
