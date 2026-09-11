// 실제 납품 콘텐츠로 성취 우회·수정 회복·활동 시간 계약을 검증한다.
import assert from 'node:assert/strict';
import { allContent, getContentForStage } from '../src/game/data/content';
import { getStage, DAILY_STAGE } from '../src/game/data/stages';
import { getPet } from '../src/game/data/characters';
import { WaveSystem, WAVE } from '../src/game/systems/WaveSystem';
import { RaceSystem } from '../src/game/systems/RaceSystem';
import { LetterSystem } from '../src/game/systems/LetterSystem';
import { TelegramSystem } from '../src/game/systems/TelegramSystem';
import { BossSystem } from '../src/game/systems/BossSystem';
import { DailySystem, pickDailyWords } from '../src/game/systems/DailySystem';
import { TypingRun } from '../src/game/systems/TypingRun';
import { countStrokes } from '../src/game/util/hangul';
import { getLanguage, setLanguage } from '../src/game/i18n/Locale';
import { defaultSave } from '../src/game/systems/SaveValidation';
import { awardReplay } from '../src/game/systems/ReplaySystem';
import type { ContentUnit } from '../src/game/types';
import type { TypingMode } from '../src/game/systems/BattleState';

const originalRandom = Math.random;
Math.random = () => 0.5; // 보너스/드롭에 기대지 않는 정상 경로
const pet = getPet('cat');
const wrong = '※';
const byOrder = (a: ContentUnit, b: ContentUnit) => {
  const n = (u: ContentUnit) => +(u.tags.find((t) => t.startsWith('순서')) ?? '순서0').slice(2);
  return n(a) - n(b);
};
const events: string[] = [];
const emit = (event: string) => events.push(event);
const resetEvents = () => { events.length = 0; };
const count = (event: string) => events.filter((e) => e === event).length;
function wave() {
  const pool = getContentForStage('stage_1').filter((u) => u.type === 'word');
  const boundary = getLanguage() === 'en' ? 4 : 2;
  return new WaveSystem(getStage('stage_1'), 'normal', pet, {
    slime: pool.filter((u) => [...u.text].length <= boundary),
    bat: pool.filter((u) => [...u.text].length > boundary),
  }, emit);
}
function race() {
  return new RaceSystem(getStage('stage_2'), 'normal', pet, getContentForStage('stage_2').filter((u) => u.type === 'word'), null, '', emit);
}
function letter(selectedPet = pet) {
  return new LetterSystem(getStage('stage_3'), 'normal', selectedPet, getContentForStage('stage_3').filter((u) => u.tags.includes('편지')).sort(byOrder), emit);
}
function telegram() {
  return new TelegramSystem(getStage('stage_4'), 'normal', pet, getContentForStage('stage_4').filter((u) => u.tags.includes('전보')).sort(byOrder), emit);
}
function boss() {
  const pool = getContentForStage('stage_5');
  const tagged = (tag: string) => pool.filter((u) => u.tags.includes(tag)).sort(byOrder);
  return new BossSystem(getStage('stage_5'), 'normal', pet, { crystals: tagged('결정'), rush: tagged('러시'), final: tagged('최종') }, '', emit);
}
function daily(selectedPet = pet) {
  return new DailySystem(DAILY_STAGE, 'normal', selectedPet, pickDailyWords(allContent().filter((u) => u.type === 'word'), 20, 'delivery-regression'), emit);
}
function solve(mode: TypingMode, limit = 4000) {
  let turns = 0;
  while (!mode.finished && turns++ < limit) {
    mode.tick(0.25);
    if (mode.run.current) mode.submit(mode.run.current.text, false);
  }
  assert.ok(mode.finished, '정답으로 끝까지 완료할 수 있어야 한다');
  assert.equal(count('STAGE_CLEAR'), 1, '정상 완료 이벤트는 정확히 한 번');
  assert.equal(count('STAGE_FAILED'), 0, '수정해서 회복한 정상 입력이 실패하면 안 된다');
}

// S1: 오답 20번과 점프는 숲의 문을 열지 않는다. 이후 정답으로 회복 가능하다.
{
  resetEvents();
  const m = wave(); m.start();
  for (let i = 0; i < 20; i++) m.submit(wrong, false);
  for (let i = 0; i < 3; i++) assert.ok(m.skip());
  assert.equal(m.defeated, 0);
  assert.equal(m.run.wordsDone, 0);
  assert.equal(count('STAGE_CLEAR'), 0);
  solve(m);
  assert.equal(m.defeated, WAVE.total);
}

// S2: 오답은 새 낱말/가속을 주지 않는다. 실제 정답을 이어 가면 완주한다.
{
  resetEvents();
  const m = race(); m.start();
  const target = m.run.current!.id;
  m.submit(wrong, false);
  assert.equal(m.run.current!.id, target);
  assert.equal(m.run.wordsDone, 0);
  solve(m);
}

// S3: 오답 6개 + 점프 3개가 편지·자물쇠를 채우지 않는다.
{
  resetEvents();
  const m = letter(); m.start();
  for (let i = 0; i < 6; i++) m.submit(wrong, false);
  for (let i = 0; i < 3; i++) assert.ok(m.skip());
  assert.equal(m.lines.length, 0);
  assert.equal(m.locksOpen, 0);
  assert.equal(count('STAGE_CLEAR'), 0);
  solve(m);
  assert.equal(m.lines.length, 6);
  assert.equal(m.locksOpen, 3);
}

// S4: 점프만 3번 / 오답만 3번으로 정지하지 않는다. 전송률도 부풀리지 않는다.
for (const action of ['skip', 'wrong'] as const) {
  resetEvents();
  const m = telegram(); m.start();
  for (let i = 0; i < 3; i++) {
    if (action === 'skip') assert.ok(m.skip());
    else { m.submit(wrong, false); for (let t = 0; t < 16; t++) m.tick(0.1); }
  }
  assert.equal(m.brake, 0);
  assert.equal(m.lines.length, 0);
  assert.equal(m.transfer(), 0);
  assert.equal(m.run.stats.accuracy(), 0);
  assert.equal(count('STAGE_CLEAR'), 0);
  solve(m);
  assert.equal(m.brake, 3);
  assert.equal(m.transfer(), 1);
}

// S5: 오답으로 결정이 깨지지 않고, 최종 문장 점프로 인증서 조건을 채울 수 없다.
{
  resetEvents();
  const m = boss(); m.start();
  for (let i = 0; i < 5; i++) m.submit(wrong, false);
  assert.equal(m.phase, 1);
  assert.equal(m.crystals.filter((c) => c.broken).length, 0);
  let guard = 0;
  while (m.phase !== 3 && !m.finished && guard++ < 500) {
    m.tick(0.25);
    if (m.run.current) m.submit(m.run.current.text, false);
  }
  assert.equal(m.phase, 3);
  for (let i = 0; i < 3; i++) assert.ok(m.skip());
  assert.equal(m.finalDone, false);
  assert.equal(m.armorBroken, false);
  assert.equal(count('STAGE_CLEAR'), 0);
  solve(m);
  assert.equal(m.finalDone, true);
}

// 결정 건너뛰기는 선택만 이동하고, 모든 미완료 결정은 결국 직접 완성한다.
{
  resetEvents();
  const m = boss(); m.start();
  const first = m.snapshot().boss!.currentCrystalIndex;
  assert.ok(m.skip());
  assert.notEqual(m.snapshot().boss!.currentCrystalIndex, first);
  assert.equal(m.crystals.filter((c) => c.broken).length, 0);
  solve(m);
  assert.equal(m.crystals.filter((c) => c.broken).length, 5);
}

// 오늘의 도전: 전부 틀려도 기록 완료가 아니며, 고쳐 제출한 정확한 20개가 필요하다.
{
  resetEvents();
  const m = daily(); m.start();
  for (let i = 0; i < 20; i++) m.submit(wrong, false);
  for (let i = 0; i < 3; i++) assert.ok(m.skip());
  assert.equal(m.snapshot().targetIndex, 0);
  assert.equal(m.run.wordsDone, 0);
  assert.equal(count('STAGE_CLEAR'), 0);
  solve(m);
  assert.equal(m.run.wordsDone, 20);
  assert.equal(m.run.stats.submissions, 40);
  assert.equal(m.run.skippedCount, 3);
  assert.ok(m.run.correctedCount >= 1);
}

// 모든 실제 모드에서 120초 일시정지를 타수·별 평가 시간에 넣지 않는다.
for (const make of [wave, race, letter, telegram, boss, daily]) {
  const m = make(); m.start();
  const text = m.run.current!.text;
  m.tick(1);
  m.pause();
  m.tick(120);
  assert.equal(m.run.stats.elapsedSec(), 1);
  m.resume(); m.tick(1); m.submit(text, false);
  assert.equal(m.run.stats.elapsedSec(), 2);
  assert.equal(m.run.stats.cpm(), countStrokes(text) * 30);
}

// 목표 등장 대기와 통계 종료 이후 시간은 입력 속도를 바꾸지 않는다.
{
  let current: ContentUnit | null = null;
  const run = new TypingRun({ stage: DAILY_STAGE, difficulty: 'normal', pet, next: () => current, emit, now: () => 0 });
  run.start(); run.tick(60);
  assert.equal(run.stats.accuracy(), 0, '입력 전은 100%가 아니다');
  assert.equal(run.stats.elapsedSec(), 0);
  current = allContent().find((u) => u.type === 'word')!;
  assert.ok(current);
  run.advance(); run.tick(2); run.submit(current.text, false);
  assert.equal(run.stats.cpm(), countStrokes(current.text) * 30);
  run.stats.stop(); run.tick(120);
  assert.equal(run.stats.elapsedSec(), 2);
}

// 수정 전 입력과 최종 성공을 각각 남긴다. 문장은 읽기 대기로 콤보를 잃지 않는다.
{
  const m = letter(); m.start();
  const target = m.run.current!;
  m.commit(wrong);
  m.commit(target.text);
  m.submit(target.text, true);
  assert.equal(m.run.correctedCount, 1);
  const attempts = m.run.learningAttempts;
  assert.equal(attempts[0].typed, wrong);
  assert.equal(attempts[0].outcome, 'wrong');
  assert.equal(attempts[attempts.length - 1].corrected, true);
  const score = m.score;
  m.tick(60);
  assert.equal(m.score, score);
  assert.equal(m.run.combo, 1);
  m.submit(m.run.current!.text, false);
  assert.equal(m.run.feverLevel, 1, '두 문장 연속 완성 시 친구 기술을 경험한다');
}

// 올바른 접두어를 지운 것과 실제 오타를 고친 것은 서로 다른 수행이다.
for (const madeTypo of [false, true]) {
  const target: ContentUnit = { id: 'correction-evidence', stage: 'daily', type: 'word', text: 'cat', tags: [], difficulty: 1, weight: 1 };
  const run = new TypingRun({ stage: DAILY_STAGE, difficulty: 'normal', pet, next: () => target, emit });
  run.start();
  run.onCommit(madeTypo ? 'car' : 'c');
  run.onCommit(madeTypo ? 'ca' : ''); // 실제 키보드의 Backspace 후 확정 입력
  run.onCommit('cat');
  const result = run.submit('cat', true)!;
  assert.equal(result.perfect, false, 'Backspace 사용은 PERFECT로 기록하지 않는다');
  assert.equal(run.correctedCount, madeTypo ? 1 : 0, '교정 수는 실제 오타 근거가 있어야 증가한다');
  assert.equal(run.learningAttempts.at(-1)!.corrected, madeTypo);
  assert.equal(run.learningAttempts.some((attempt) => attempt.outcome === 'wrong'), madeTypo);
  const rewards = awardReplay(defaultSave(), { wordsDone: run.wordsDone, accuracy: run.stats.accuracy(), correctedCount: run.correctedCount, remix: false, cleared: false });
  assert.deepEqual(rewards, madeTypo ? ['실수를 나의 힘으로'] : [], '실제 오타를 고쳐 완성할 때만 교정 인장');
}

// 시간/적이 없는 모드에서도 네 친구의 도움은 보호 또는 실제 다음 목표 힌트로 작동한다.
for (const id of ['cat', 'rabbit', 'dragon', 'squirrel']) {
  for (const [make, needed] of [[letter, 2], [daily, 10]] as const) {
    const m = make(getPet(id)); m.start();
    for (let i = 0; i < needed; i++) { m.tick(0.1); m.submit(m.run.current!.text, false); }
    if (id === 'cat' || id === 'rabbit') {
      assert.ok(m.run.isShielded(), `${id} 복구 보호가 실제로 활성화된다`);
      const combo = m.run.combo;
      const done = m.run.wordsDone;
      m.submit(wrong, false);
      assert.equal(m.run.combo, combo, '보호막은 콤보를 지킨다');
      assert.equal(m.run.wordsDone, done, '보호는 오답을 정답으로 만들지 않는다');
    }
    if (id !== 'cat') assert.ok(m.snapshot().nextHint, `${id}는 다음에 입력할 실제 내용을 보여 준다`);
  }
}

// 장시간 도전도 원문 입력 근거는 최근 80개만 보관한다.
{
  const pool = allContent().filter((u) => u.type === 'word').slice(0, 100);
  let index = 0;
  const run = new TypingRun({ stage: DAILY_STAGE, difficulty: 'normal', pet, next: () => pool[index++ % pool.length], emit });
  run.start();
  for (let i = 0; i < 100; i++) { run.submit(run.current!.text, false); run.advance(); }
  assert.equal(run.learningAttempts.length, 80);
  assert.equal(run.stats.correctSubmissions, 100);
}

// 같은 핵심 규칙이 실제 영문 콘텐츠 여섯 모드에서도 성립한다.
setLanguage('en');
assert.equal(countStrokes('Hello, world!'), 13, '영문 글자·공백·부호는 각각 1타');
for (const make of [wave, race, letter, telegram, boss, daily]) {
  resetEvents();
  const m = make(); m.start();
  assert.match(m.run.current!.text, /^[\x20-\x7e]+$/);
  m.submit(wrong, false);
  assert.equal(m.run.wordsDone, 0);
  if (m instanceof TelegramSystem) for (let i = 0; i < 16; i++) m.tick(0.1);
  solve(m);
  assert.ok(m.run.learningAttempts.some((attempt) => attempt.outcome === 'correct'));
}
{
  const m = letter(); m.start();
  const text = m.run.current!.text;
  m.submit(text.toLowerCase(), false);
  assert.equal(m.run.wordsDone, 0, '대소문자가 다른 문장은 완료하지 않는다');
  m.submit(text, false);
  assert.equal(m.run.wordsDone, 1);
}
setLanguage('ko');
Math.random = originalRandom;
console.log('check-learning-contracts: actual content, six modes, bypass/recovery/evidence/active time all passed');
