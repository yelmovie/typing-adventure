// TypingRun 공통 코어 셀프체크. 실행: npm run check
// (esbuild로 번들 → node. 브라우저/Phaser 없이 순수 로직만 검증)
import assert from 'node:assert/strict';
import { TypingRun, RULES } from '../src/game/systems/TypingRun';
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
  // 세 번째는 진짜 오답 → 콤보 0, 하지만 FEVER 타이머는 계속
  assert.equal(run.submit('나', false)!.forgiven, false);
  assert.equal(run.combo, 0);
  assert.equal(run.feverLevel, 2);
  for (let t = 0; t < RULES.feverSec * 10 + 1; t++) run.tick(0.1);
  assert.equal(run.feverLevel, 0, 'FEVER 8초 후 종료');
  assert.equal(run.shieldLeft, 0);
}

// 4. 무입력 3초 후 1초마다 콤보 -1
{
  const { run } = make([unit('가')]);
  for (let i = 0; i < 4; i++) run.submit('가', false), run.advance();
  assert.equal(run.combo, 4);
  for (let t = 0; t < 30; t++) run.tick(0.1);
  assert.equal(run.combo, 4, '3초까진 유지');
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

console.log('check-typing-run: all passed');
