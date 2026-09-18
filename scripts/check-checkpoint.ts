// 중간 저장(체크포인트) 셀프체크: 여섯 모드를 조금 진행 → serialize → 새 인스턴스에 restore → 진행·점수·HP·시간이 이어지고 끝까지 완주한다. 실행: npm run check
import assert from 'node:assert/strict';
import { WaveSystem, WAVE } from '../src/game/systems/WaveSystem';
import { RaceSystem, RACE } from '../src/game/systems/RaceSystem';
import { LetterSystem, LETTER } from '../src/game/systems/LetterSystem';
import { TelegramSystem } from '../src/game/systems/TelegramSystem';
import { BossSystem, BOSS } from '../src/game/systems/BossSystem';
import { DailySystem } from '../src/game/systems/DailySystem';
import { defaultSave, validateSave } from '../src/game/systems/SaveValidation';
import { CHECKPOINT_MAX_AGE_MS, restoreOrder, validateCheckpoint } from '../src/game/systems/Checkpoint';
import { getStage } from '../src/game/data/stages';
import type { CheckpointState, TypingMode } from '../src/game/systems/BattleState';
import type { ContentUnit, PetDef, StageId } from '../src/game/types';

const pet: PetDef = { id: 'cat', name: '', desc: '', sheet: '', passive: 'block_wrong', passiveDesc: '', active: 'shield', activeDesc: '' };
const unit = (stage: StageId, text: string, type: ContentUnit['type'] = 'word', tags: string[] = []): ContentUnit => ({ id: `${stage}:${text}`, stage, type, text, difficulty: 1, tags, weight: 1 });
/** 저장은 localStorage JSON 을 거친다. 직렬화 결과가 JSON-safe 인지도 같이 확인한다. */
const roundTrip = (state: CheckpointState | undefined): CheckpointState => { assert.ok(state, 'serialize() 가 상태를 돌려준다'); return JSON.parse(JSON.stringify(state)); };
const recorder = () => { const events: [string, unknown][] = []; return { events, emit: (ev: string, d?: unknown) => { events.push([ev, d]); }, count: (ev: string) => events.filter((e) => e[0] === ev).length }; };
const garbage: CheckpointState = { idx: -5, lines: 'x', run: null, crystals: 3, sentences: [{ id: 1 }], pool: [null], samples: 'no', phase: 9, dist: Infinity, score: NaN };

/** 공통 카운터·통계가 그대로 이어지는지 */
function assertRunContinues(a: TypingMode, b: TypingMode) {
  for (const key of ['wordsDone', 'combo', 'maxCombo', 'perfectCount', 'coins', 'skipsLeft', 'skippedCount', 'correctedCount'] as const) assert.equal(b.run[key], a.run[key], `run.${key} 이어짐`);
  assert.deepEqual(b.run.mistakes, a.run.mistakes, '오답 노트 이어짐');
  assert.deepEqual(b.run.learningAttempts, a.run.learningAttempts, '학습 근거 이어짐');
  assert.equal(b.run.stats.wrongStrokes, a.run.stats.wrongStrokes, '오타 수 이어짐');
  assert.equal(b.run.stats.correctStrokes, a.run.stats.correctStrokes);
  assert.equal(b.run.stats.accuracy(), a.run.stats.accuracy(), '정확도 이어짐');
  assert.equal(b.snapshot().elapsedSec, a.snapshot().elapsedSec, '입력 시간 이어짐');
  assert.equal(b.snapshot().score, a.snapshot().score, '점수 이어짐');
  assert.equal(b.snapshot().playerHp, a.snapshot().playerHp, 'HP 이어짐');
  const seen = new Set(b.wordsSeen());
  assert.ok(a.wordsSeen().every((id) => seen.has(id)), '본 낱말 이어짐 (복원 직후 새 목표가 하나 더 보일 수 있다)');
}
/** 편지의 「다음 조각 고르기」가 열려 있으면 순서상 다음 문장을 고른다(없는 모드·판에서는 아무것도 하지 않는다). */
function resolveChoice(mode: TypingMode) {
  const choices = mode.snapshot().letter?.choices;
  if (!choices || mode.run.current) return;
  const m = mode as unknown as { sentences?: ContentUnit[]; idx?: number; choose?: (index: number) => boolean };
  const want = choices.indexOf(m.sentences?.[m.idx ?? 0]?.text ?? '');
  for (const index of want >= 0 ? [want] : choices.map((_, k) => k)) { if (mode.run.current) break; m.choose?.(index); }
}
/** 현재 목표를 계속 정답 제출해 끝까지 간다 */
function finish(mode: TypingMode, guard = 6000) {
  for (let i = 0; i < guard && !mode.finished; i++) {
    resolveChoice(mode);
    if (mode.run.current) mode.submit(mode.run.current.text, false);
    mode.tick(0.1);
  }
  assert.ok(mode.finished, '복원한 판을 끝까지 완주한다');
}

// 1. 푸른 숲(웨이브): 처치 수·HP·시간·점수·기운내기. 화면 위 몬스터는 새로 등장하지만 총 30마리는 그대로다.
{
  const stage = getStage('stage_1');
  const words = { slime: ['나무', '바다', '구름', '바람', '학교', '친구'].map((t) => unit('stage_1', t)), bat: ['무지개', '소나무', '도서관', '자전거', '놀이터', '고슴도치'].map((t) => unit('stage_1', t)) };
  const ra = recorder(), a = new WaveSystem(stage, 'normal', pet, words, ra.emit);
  a.start();
  for (let played = 0, guard = 0; played < 4 && guard < 400; guard++) { const t = a.target; if (t) { a.submit(t.word.text, false); played++; } a.tick(0.3); }
  while (!a.target) a.tick(0.5);
  a.submit('틀림', false);
  a.tick(1);
  const state = roundTrip(a.serialize());
  const rb = recorder(), b = new WaveSystem(stage, 'normal', pet, words, rb.emit);
  b.restore(state);
  b.start();
  assert.equal(b.defeated, a.defeated, '처치 수 이어짐');
  assert.equal(b.timeLeft, a.timeLeft, '남은 시간 이어짐');
  assert.equal(b.rallyUsed, a.rallyUsed);
  assert.equal(b.spawnedCount(), a.defeated + 1, '복원 직후 한 마리 등장, 처치 수만큼 큐가 줄었다');
  assertRunContinues(a, b);
  finish(b);
  assert.equal(b.defeated, WAVE.total, '남은 몬스터를 모두 잡으면 정확히 30마리');
  assert.equal(rb.count('STAGE_CLEAR'), 1);
  const g = new WaveSystem(stage, 'normal', pet, words, () => {}); g.restore(garbage); g.start(); g.submit(g.target!.word.text, false); g.tick(0.1);
  assert.ok(!g.finished && g.defeated === 1, '손상된 저장은 안전하게 새 판처럼 시작');
}

// 2. 네온 시티(레이스): 거리·추격자·경과·피격·고스트 샘플·낱말 순서(같은 낱말을 다시 본다).
{
  const stage = getStage('stage_2');
  const words = ['신호등', '도서관', '학교', '달리기', '미래', '버스', '하늘', '바람'].map((t) => unit('stage_2', t));
  const ra = recorder(), a = new RaceSystem(stage, 'normal', pet, words, null, 'mon_ink_slime', ra.emit);
  a.start();
  for (let i = 0; i < 5; i++) { a.submit(a.run.current!.text, false); a.tick(0.5); }
  a.submit('틀림', false);
  a.tick(0.5);
  const state = roundTrip(a.serialize());
  const rb = recorder(), b = new RaceSystem(stage, 'normal', pet, words, null, 'mon_ink_slime', rb.emit);
  b.restore(state);
  b.start();
  assert.equal(b.dist, a.dist, '거리 이어짐');
  assert.equal(b.elapsed, a.elapsed);
  assert.equal(b.catches, a.catches);
  assert.equal(b.timeLeft, a.timeLeft);
  assert.deepEqual(b.samples, a.samples, '고스트 샘플 이어짐');
  assert.equal(b.snapshot().race!.noTypoStreak, a.snapshot().race!.noTypoStreak);
  assert.equal(b.run.current!.id, a.run.current!.id, '보고 있던 낱말이 그대로 다시 나온다');
  assert.ok(b.chaser < b.dist, '복원 직후 바로 잡히지 않는다');
  assertRunContinues(a, b);
  finish(b);
  assert.ok(b.dist >= RACE.goal && rb.count('STAGE_CLEAR') === 1);
  const g = new RaceSystem(stage, 'normal', pet, words, null, '', () => {}); g.restore(garbage); g.start(); g.submit(g.run.current!.text, false); g.tick(0.1);
  assert.equal(g.run.wordsDone, 1);
}

// 3. 사막 유적(편지): 되찾은 문장·자물쇠·PERFECT·비밀방·경과·문장 순서. 변형 도전이라 다른 편지가 만들어져도 저장된 편지가 이어진다.
{
  const stage = getStage('stage_3');
  const S = ['사막을 지나온 사람에게.', '오래된 탑 뒤의 길을 찾을 수 있겠는가?', '길 끝에는 별빛이 비치는 문이 있다.', '문은 정직한 손끝에만 열린다.', '한 글자씩 천천히, 그러나 멈추지 마라!', '너의 이름을 별들이 기억할 것이다.', '모래바람이 멎으면 계단이 드러난다.', '계단 끝의 촛불이 길을 비춘다.', '이제 황금문을 열어라.'];
  const units = S.map((text, i) => ({ ...unit('stage_3', text, 'sentence', ['편지', `순서${i + 1}`]), id: `s${i}` }));
  const ra = recorder(), a = new LetterSystem(stage, 'normal', pet, units, ra.emit);
  a.start();
  resolveChoice(a); a.submit(S[0], true); a.tick(2);
  resolveChoice(a); a.submit(S[1], false); a.tick(2);
  resolveChoice(a); a.submit(S[2], false); a.tick(2);
  resolveChoice(a); a.commit('문은 정직한 손끗'); a.submit('문은 정직한 손끗에만 열린다.', false); a.tick(1);
  a.submit(S[3], false); a.tick(2);
  assert.equal(a.lines.length, 4); assert.equal(a.locksOpen, 1);
  resolveChoice(a);
  const state = roundTrip(a.serialize());
  const rb = recorder(), b = new LetterSystem(stage, 'normal', pet, [...units].reverse(), rb.emit);
  b.restore(state);
  b.start();
  assert.deepEqual(b.lines, a.lines, '되찾은 문장 이어짐');
  assert.equal(b.locksOpen, 1); assert.equal(b.perfectLines, a.perfectLines); assert.equal(b.secretRoom, a.secretRoom);
  assert.equal(b.elapsed, a.elapsed);
  resolveChoice(b); // 문장 사이 고르기가 걸려 있었다면 복원 뒤 다시 고른다
  assert.equal(b.run.current!.text, S[4], '다섯 번째 문장부터 — 저장된 편지 순서를 따른다');
  assert.equal(rb.count('LETTER_LOCK'), 1, '열린 자물쇠를 씬이 다시 그리도록 알린다');
  assert.ok(rb.events.every(([ev, d]) => ev !== 'LETTER_LOCK' || (d as { restored?: boolean }).restored === true), '복원 알림은 restored 표시');
  assertRunContinues(a, b);
  finish(b);
  assert.equal(b.lines.length, LETTER.sentences); assert.equal(b.locksOpen, LETTER.locks); assert.equal(rb.count('STAGE_CLEAR'), 1);
  const g = new LetterSystem(stage, 'normal', pet, units, () => {}); g.restore(garbage); g.start(); resolveChoice(g); g.submit(g.run.current!.text, false);
  assert.equal(g.lines.length, 1);
}

// 4. 폭주 열차(전보): 보낸 문장·브레이크·거리·경과·전송 어절.
{
  const stage = getStage('stage_4');
  const S = ['기관실로 긴급히 전합니다.', '앞 철교가 무너져 선로가 끊겼습니다.', '지금 즉시 속도를 줄이고 열차를 정지하십시오!', '승객 여러분은 손잡이를 꼭 잡으세요.', '곧 안전하게 멈춥니다.'];
  const units = S.map((text, i) => ({ ...unit('stage_4', text, 'sentence', ['전보', `순서${i + 1}`]), id: `t${i}` }));
  const ra = recorder(), a = new TelegramSystem(stage, 'normal', pet, units, ra.emit);
  a.start();
  a.submit(S[0], false); a.tick(1);
  a.submit('틀린 전보', false); for (let i = 0; i < 25; i++) a.tick(0.1); // 통신 끊김이 끝난 뒤 저장
  a.submit(S[1], false); a.tick(1);
  const state = roundTrip(a.serialize());
  const rb = recorder(), b = new TelegramSystem(stage, 'normal', pet, [...units].reverse(), rb.emit);
  b.restore(state);
  b.start();
  assert.deepEqual(b.lines, a.lines); assert.equal(b.brake, 2); assert.equal(b.dist, a.dist); assert.equal(b.elapsed, a.elapsed);
  assert.equal(b.snapshot().telegram!.transfer, a.snapshot().telegram!.transfer, '전송률 이어짐');
  assert.equal(b.run.current!.text, S[2]);
  assertRunContinues(a, b);
  finish(b);
  assert.ok(b.stopped && rb.count('STAGE_CLEAR') === 1);
  const g = new TelegramSystem(stage, 'normal', pet, units, () => {}); g.restore(garbage); g.start(); g.submit(g.run.current!.text, false);
  assert.equal(g.brake, 1);
}

// 5. 어둠의 성채(보스): 세 페이즈 각각에서 저장·복원. 보스 HP 는 저장값이 아니라 페이즈·진행에서 다시 계산한다.
{
  const stage = getStage('stage_5');
  const w = (text: string, type: 'word' | 'sentence' = 'word') => unit('stage_5', text, type);
  const words = { crystals: ['빛', '용기', '희망', '미래', '도전'].map((t) => w(t)), rush: ['별', '함께', '마음', '친구', '시작', '약속', '하늘'].map((t) => w(t)), final: [w('우리는 작은 한 글자부터 새로운 길을 만들었다.', 'sentence'), w('포기하지 않고 계속 나아가면 더 넓은 세상이 열린다!', 'sentence')] };
  const make = () => { const r = recorder(); return { ...r, mode: new BossSystem(stage, 'normal', pet, words, 'mon_keyboard_golem', r.emit, { random: () => 0.37 }) }; };
  // P1: 결정 2개 부수고 저장
  const a = make(); a.mode.start();
  for (let i = 0; i < 2; i++) { a.mode.submit(a.mode.run.current!.text, false); a.mode.tick(0.2); }
  a.mode.submit('틀림', false); a.mode.tick(0.2);
  const p1 = roundTrip(a.mode.serialize());
  const b = make(); b.mode.restore(p1); b.mode.start();
  assert.equal(b.mode.phase, 1); assert.equal(b.mode.bossHp, BOSS.hp); assert.equal(b.mode.timeLeft, a.mode.timeLeft);
  assert.deepEqual(b.mode.crystals.map((c) => [c.word.id, c.broken]), a.mode.crystals.map((c) => [c.word.id, c.broken]), '결정 순서·파괴 상태 이어짐');
  assert.equal(b.mode.run.current!.text, a.mode.run.current!.text, '같은 결정을 이어서 친다');
  assert.deepEqual(b.events.find(([ev]) => ev === 'BOSS_PHASE')?.[1], { phase: 1 });
  assertRunContinues(a.mode, b.mode);
  // P2: 러시 낱말 3개 맞히고 저장
  while (b.mode.phase === 1) b.mode.submit(b.mode.run.current!.text, false);
  for (let done = 0, guard = 0; done < 3 && guard < 500; guard++) { if (b.mode.run.current) { b.mode.submit(b.mode.run.current.text, false); done++; } b.mode.tick(0.1); }
  assert.equal(b.mode.phase, 2);
  const p2 = roundTrip(b.mode.serialize());
  const c = make(); c.mode.restore(p2); c.mode.start();
  assert.equal(c.mode.phase, 2); assert.equal(c.mode.bossHp, b.mode.bossHp, '보스 HP 이어짐'); assert.equal(c.mode.darkness, b.mode.darkness);
  assert.deepEqual(c.events.find(([ev]) => ev === 'BOSS_PHASE')?.[1], { phase: 2 }, '복원한 페이즈로 시작을 알린다');
  assert.equal(c.mode.queue.length, 0, '러시 큐는 비운 채 재개');
  assertRunContinues(b.mode, c.mode);
  for (let i = 0; i < 6; i++) c.mode.tick(0.1);
  assert.ok(c.mode.run.current, '타이머가 곧 다음 낱말을 낸다');
  // P3: 첫 장문 완성 후 저장
  for (let guard = 0; c.mode.phase !== 3 && !c.mode.finished && guard < 1000; guard++) { if (c.mode.run.current) c.mode.submit(c.mode.run.current.text, false); c.mode.tick(0.1); }
  assert.equal(c.mode.phase, 3);
  c.mode.submit(c.mode.run.current!.text, false);
  assert.ok(c.mode.armorBroken);
  const p3 = roundTrip(c.mode.serialize());
  const d = make(); d.mode.restore(p3); d.mode.start();
  assert.equal(d.mode.phase, 3); assert.equal(d.mode.bossHp, BOSS.armorHp, '갑옷 한 겹 벗긴 HP 로 다시 계산'); assert.ok(d.mode.armorBroken);
  assert.equal(d.mode.run.current!.text, c.mode.run.current!.text, '남은 장문이 그대로');
  assertRunContinues(c.mode, d.mode);
  d.mode.submit(d.mode.run.current!.text, false);
  assert.ok(d.mode.finished && d.mode.finalDone && d.mode.bossHp === 0 && d.count('STAGE_CLEAR') === 1);
  const g = make(); g.mode.restore(garbage); g.mode.start(); g.mode.submit(g.mode.run.current!.text, false);
  assert.equal(g.mode.phase, 1); assert.equal(g.mode.crystals.filter((x) => x.broken).length, 1);
}

// 6. 오늘의 도전: 진행 위치·점수·경과. 건너뛰기로 바뀐 낱말 순서도 그대로.
{
  const stage = getStage('daily');
  const words = ['가위', '나비', '다람쥐', '라면', '마을', '바다'].map((t) => unit('daily', t));
  const ra = recorder(), a = new DailySystem(stage, 'normal', pet, words, ra.emit, 'word');
  a.start();
  a.submit(words[0].text, false); a.tick(1);
  a.skip(); a.tick(0.5);
  a.submit(a.run.current!.text, false); a.tick(1);
  a.submit('틀림', false); a.tick(0.5);
  const state = roundTrip(a.serialize());
  const rb = recorder(), b = new DailySystem(stage, 'normal', pet, words, rb.emit, 'word');
  b.restore(state);
  b.start();
  assert.equal(b.snapshot().targetIndex, 2); assert.equal(b.elapsed, a.elapsed);
  assert.equal(b.run.current!.id, a.run.current!.id, '건너뛴 뒤의 순서까지 그대로');
  assertRunContinues(a, b);
  finish(b);
  assert.equal(rb.count('STAGE_CLEAR'), 1); assert.equal(b.run.wordsDone, words.length);
  const g = new DailySystem(stage, 'normal', pet, words, () => {}, 'word'); g.restore(garbage); g.start(); g.submit(g.run.current!.text, false);
  assert.equal(g.run.wordsDone, 1);
}

// 7. 저장 검증: 2시간 지난 것·모르는 스테이지·깨진 모양은 버리고, 나머지는 그대로 실린다. 순서 복원 도우미.
{
  const now = Date.now();
  const fresh = { stageId: 'stage_3', savedAt: new Date(now - 60e3).toISOString(), language: 'ko', done: 2, total: 9, state: { idx: 2 } };
  assert.equal(validateCheckpoint(fresh, now)?.stageId, 'stage_3');
  assert.equal(validateCheckpoint({ ...fresh, savedAt: new Date(now - CHECKPOINT_MAX_AGE_MS - 1000).toISOString() }, now), undefined, '2시간 지난 저장은 무시');
  assert.equal(validateCheckpoint({ ...fresh, savedAt: 'yesterday' }, now), undefined);
  assert.equal(validateCheckpoint({ ...fresh, stageId: 'stage_9' }, now), undefined);
  assert.equal(validateCheckpoint({ ...fresh, language: 'fr' }, now), undefined);
  assert.equal(validateCheckpoint({ ...fresh, state: 'broken' }, now), undefined);
  assert.equal(validateCheckpoint({ ...fresh, state: [1] }, now), undefined);
  assert.equal(validateCheckpoint(null, now), undefined);
  assert.equal(validateCheckpoint({ ...fresh, stageId: 'daily' }, now)?.dailyKind, 'word');
  assert.equal(validateCheckpoint({ ...fresh, stageId: 'daily', dailyKind: 'long', remix: 'yes' }, now)?.dailyKind, 'long');
  assert.equal(validateCheckpoint({ ...fresh, remix: 'yes' }, now)?.remix, undefined);
  assert.equal(validateSave({ ...defaultSave(), checkpoint: fresh }).checkpoint?.done, 2);
  assert.equal(validateSave({ ...defaultSave(), checkpoint: { ...fresh, savedAt: '2020-01-01T00:00:00Z' } }).checkpoint, undefined);
  assert.equal(validateSave({ ...defaultSave(), checkpoint: 'garbage' }).checkpoint, undefined);
  const archived = validateSave({ ...defaultSave(), languageArchives: { en: { ...defaultSave(), checkpoint: fresh } } }).languageArchives!.en as { checkpoint?: unknown };
  assert.equal(archived.checkpoint, undefined, '언어 보관함에는 중간 저장이 없다');
  assert.deepEqual(restoreOrder([{ id: 'a' }, { id: 'b' }, { id: 'c' }], ['c', 'zzz', 'a'], (u) => u.id).map((u) => u.id), ['c', 'a', 'b']);
  assert.deepEqual(restoreOrder([{ id: 'a' }, { id: 'b' }], 'not-a-list', (u) => u.id).map((u) => u.id), ['a', 'b']);
}

console.log('check-checkpoint: all passed (wave/race/letter/telegram/boss/daily resume, stale/malformed checkpoints dropped)');
