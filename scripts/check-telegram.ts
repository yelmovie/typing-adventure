// TelegramSystem(폭주 열차) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { TelegramSystem, TELE } from '../src/game/systems/TelegramSystem';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';

const stage = { id: 'stage_4', index: 4, mode: 'telegram', targets: 3, timeLimitSec: 180 } as StageDef;
const pet: PetDef = { id: 'cat', name: '', desc: '', sheet: '', passive: 'block_wrong', passiveDesc: '', active: 'shield', activeDesc: '' };
const S = ['기관실로 긴급히 전합니다.', '앞 철교가 무너져 선로가 끊겼습니다.', '지금 즉시 속도를 줄이고 열차를 정지하십시오!'];
const units: ContentUnit[] = S.map((text, i) => ({ id: 't' + i, stage: 'stage_4', type: 'sentence', text, difficulty: 3, tags: ['전보'], weight: 1 }));

function make() {
  const events: [string, unknown][] = [];
  const T = new TelegramSystem(stage, 'normal', pet, units, (ev, d) => events.push([ev, d]));
  T.start();
  return { T, events, count: (ev: string) => events.filter((e) => e[0] === ev).length };
}

function clearAmbush(T: TelegramSystem) {
  while (T.snapshot().telegram!.bat.active) T.submit(T.snapshot().telegram!.bat.word!, false);
}

// 1. 가만히 있으면 펫의 1회 구조 뒤에도 결국 HP 또는 남은 거리로 실패
{
  const { T, count } = make();
  for (let i = 0; i < 2000 && !T.finished; i++) T.tick(0.1);
  assert.ok(T.finished);
  assert.equal(count('STAGE_FAILED'), 1);
  assert.ok(T.dist === 0 || T.playerHp === 0);
}

// 2. 어절 완료 → 전송률 상승, 오타 → 통신 끊김 1.5초 동안 판정 정지
{
  const { T, count } = make();
  T.commit('기관실로');
  assert.equal(count('TELE_WORD'), 1);
  assert.ok(T.transfer() > 0);
  T.commit('기관실로 긴급흐');
  assert.equal(count('TELE_OUTAGE'), 1);
  assert.ok(T.snapshot().telegram!.outage);
  T.commit('기관실로 긴급히'); // 끊긴 동안은 무시
  assert.equal(count('TELE_WORD'), 1);
  for (let i = 0; i < 16; i++) T.tick(0.1);
  assert.ok(!T.snapshot().telegram!.outage);
  assert.equal(count('TELE_OUTAGE'), 2, '복구 이벤트');
  T.commit('기관실로 긴급히');
  assert.equal(count('TELE_WORD'), 2);
}

// 3. 문장 완료 → 브레이크 단계, 속도 25% 감소. 3문장 → 정지·클리어, 남은 거리 보너스
{
  const { T, count } = make();
  const v0 = T.speed();
  T.submit(S[0], false);
  assert.equal(T.brake, 1);
  assert.ok(Math.abs(T.speed() - v0 * TELE.brakeMul) < 1e-9);
  clearAmbush(T);
  for (let i = 0; i < 100; i++) T.tick(0.1);
  T.submit(S[1], false);
  T.submit(S[2], false);
  assert.ok(T.finished && T.stopped);
  assert.equal(T.speed(), 0);
  assert.equal(count('TELE_STOP'), 1);
  assert.equal(count('STAGE_CLEAR'), 1);
  assert.equal(T.transfer(), 1);
  assert.ok(T.dist > 0 && T.score > 0);
}

// 4. 통신 끊김 중 제출은 버리지 않고 끊김이 끝나면 처리 (문장 소실 버그 회귀 방지)
{
  const { T, count } = make();
  T.commit('기관실로 긴급흐'); // 오타 → 끊김
  assert.ok(T.snapshot().telegram!.outage);
  T.submit(S[0], false); // 끊김 중 완성 문장 제출
  assert.equal(T.lines.length, 0, '끊김 중엔 아직 처리 안 됨');
  for (let i = 0; i < 16; i++) T.tick(0.1);
  assert.equal(T.lines.length, 1, '끊김 끝나면 대기 중이던 제출이 처리됨');
  assert.equal(count('TELE_BRAKE'), 1);
}

// 5. 첫 전보 뒤 박쥐 4마리 기습: 낱말은 중복 없이 별도 판정되고 끝나면 다음 전보로 복귀
{
  const { T, count } = make();
  T.submit(S[0], false);
  assert.equal(count('TELE_AMBUSH_START'), 1);
  assert.equal(T.snapshot().target?.type, 'word');
  const seen = new Set<string>();
  for (let i = 0; i < TELE.batCount; i++) {
    const bat = T.snapshot().telegram!.bat;
    assert.ok(bat.active && bat.word);
    seen.add(bat.word);
    T.submit(bat.word, false);
  }
  assert.equal(seen.size, TELE.batCount, '한 기습 안에서 박쥐 낱말은 반복하지 않음');
  assert.equal(count('TELE_BAT_HIT'), TELE.batCount);
  assert.equal(count('TELE_AMBUSH_END'), 1);
  assert.equal(T.snapshot().target?.text, S[1], '기습 뒤 중단한 전보 흐름으로 복귀');
  assert.ok(T.run.learningAttempts.every((a) => !a.targetId.startsWith('tele-bat-')), '박쥐 낱말은 전보 학습 기록과 분리');
}

// 6. 제한 시간 안에 못 치면 피해를 받고 다음 박쥐로 넘어가며, 네 마리 뒤 전보는 유지된다
{
  const { T, count } = make();
  T.submit(S[0], false);
  const hp = T.playerHp;
  for (let i = 0; i < 33; i++) T.tick(0.1);
  assert.equal(count('TELE_BAT_MISSED'), 1);
  assert.equal(T.playerHp, hp - TELE.batMissHp);
  clearAmbush(T);
  assert.equal(T.snapshot().target?.text, S[1]);
  assert.equal(T.lines.length, 1);
}

// 7. 기습 도중 저장해도 남은 박쥐와 전보 위치가 그대로 복원된다
{
  const { T } = make();
  T.submit(S[0], false);
  const first = T.snapshot().telegram!.bat.word!;
  T.submit(first, false);
  T.tick(0.7);
  const before = T.snapshot().telegram!.bat;
  const state = T.serialize();
  const events: [string, unknown][] = [];
  const restored = new TelegramSystem(stage, 'normal', pet, units, (ev, d) => events.push([ev, d]));
  restored.restore(state);
  restored.start();
  const after = restored.snapshot().telegram!.bat;
  assert.equal(events.filter(([event]) => event === 'TELE_AMBUSH_START').length, 1, '복원 시 기습 연출도 다시 연결');
  assert.equal(after.active, true);
  assert.equal(after.index, before.index);
  assert.equal(after.word, before.word);
  assert.ok(Math.abs(after.timeLeft - before.timeLeft) < 1e-9);
  clearAmbush(restored);
  assert.equal(restored.snapshot().target?.text, S[1]);
}

console.log('check-telegram: all passed');
