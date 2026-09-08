// DailySystem(오늘의 도전) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { DailySystem, DAILY, pickDailyWords, pickDailyLong, currentDailyKind } from '../src/game/systems/DailySystem';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';

const stage = { id: 'daily', index: 0, mode: 'daily', targets: 20, timeLimitSec: 0 } as StageDef;
const pet: PetDef = { id: 'cat', name: '', desc: '', sheet: '', passive: 'block_wrong', passiveDesc: '', active: 'shield', activeDesc: '' };
const unit = (text: string, tags: string[] = [], type: ContentUnit['type'] = 'word'): ContentUnit =>
  ({ id: text + tags.join(''), stage: 'daily', type, text, difficulty: 1, tags, weight: 1 });

// 1. pickDailyWords: 같은 시드 → 같은 순서, count 만큼만
{
  const pool = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차'].map((t) => unit(t));
  const a = pickDailyWords(pool, 5, '2026-09-09');
  const b = pickDailyWords(pool, 5, '2026-09-09');
  assert.equal(a.length, 5);
  assert.deepEqual(a.map((u) => u.id), b.map((u) => u.id), '같은 날짜 시드 → 같은 결과');
  const c = pickDailyWords(pool, 5, '2026-09-10');
  assert.notDeepEqual(a.map((u) => u.id), c.map((u) => u.id), '다른 날짜 시드 → 보통 다른 결과');
}

// 2. pickDailyLong: 장문N 태그로 묶고 순서N으로 정렬, 날짜 시드로 한 편만 고름
{
  const mk = (tag: string, n: number, text: string) => unit(text, [tag, `순서${n}`], 'sentence');
  const pool = [
    mk('장문1', 2, '두 번째 문장'), mk('장문1', 1, '첫 문장'), mk('장문1', 3, '세 번째 문장'),
    mk('장문2', 1, 'B 첫 문장'), mk('장문2', 2, 'B 두 번째 문장'),
  ];
  const picked = pickDailyLong(pool, '2026-09-09');
  assert.ok(picked.every((u) => u.tags[0] === picked[0].tags[0]), '한 편만 골라짐(태그 통일)');
  assert.deepEqual(picked.map((u) => u.text.length > 0), picked.map(() => true));
  // 순서N 대로 정렬됐는지(첫 조각의 순서가 1)
  assert.ok(picked[0].tags.includes('순서1'), '순서1이 맨 앞');
  const picked2 = pickDailyLong(pool, '2026-09-09');
  assert.deepEqual(picked.map((u) => u.id), picked2.map((u) => u.id), '같은 날짜 시드 → 같은 편');
}

// 3. DailySystem: word 20개 완주 → STAGE_CLEAR, kind 보존
{
  const words = pickDailyWords(['가', '나', '다'].map((t) => unit(t)), 3, 'seed-a');
  const events: [string, unknown][] = [];
  const d = new DailySystem(stage, 'normal', pet, words, (ev, ev2) => events.push([ev, ev2]), 'word');
  d.start();
  assert.equal(d.kind, 'word');
  assert.equal(currentDailyKind(), 'word');
  for (const w of words) d.submit(w.text, false);
  assert.ok(d.finished, '전부 풀면 클리어');
  assert.ok(events.some((e) => e[0] === 'STAGE_CLEAR'));
}

// 4. DailySystem: sentence 종류로 만들어도 동일하게 동작 + kind 전환 확인
{
  const sentences = ['안녕하세요.', '반갑습니다.'].map((t) => unit(t, ['오늘문장'], 'sentence'));
  const d = new DailySystem(stage, 'normal', pet, sentences, () => {}, 'sentence');
  d.start();
  assert.equal(d.kind, 'sentence');
  assert.equal(currentDailyKind(), 'sentence');
  assert.equal(d.run.current?.type, 'sentence');
  for (const s of sentences) d.submit(s.text, false);
  assert.ok(d.finished);
}

// 5. 방향키: move()는 연출용 PLAYER_MOVE만 emit(판정에 영향 없음)
{
  const words = ['가'].map((t) => unit(t));
  const events: [string, unknown][] = [];
  const d = new DailySystem(stage, 'normal', pet, words, (ev, ev2) => events.push([ev, ev2]), 'word');
  d.start();
  d.move('up', true);
  assert.ok(events.some((e) => e[0] === 'PLAYER_MOVE'));
  assert.equal(d.run.current?.text, '가', '판정에는 영향 없음');
}

console.log('check-daily: all passed');
