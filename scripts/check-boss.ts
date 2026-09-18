// BossSystem(어둠의 성채) 셀프체크. 실행: npm run check
import assert from 'node:assert/strict';
import { BossSystem, BOSS } from '../src/game/systems/BossSystem';
import type { ContentUnit, PetDef, StageDef } from '../src/game/types';
import { getContentForStage } from '../src/game/data/content';
import { setLanguage } from '../src/game/i18n/Locale';

const stage = { id: 'stage_5', index: 5, mode: 'boss', targets: 20, timeLimitSec: 360 } as StageDef;
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

type Hit = { damage: number; hp: number; weak?: boolean; phase?: number; hits?: number };
const make = (pool = words) => {
  const emitted: [string, any][] = [];
  const mode = new BossSystem(stage, 'normal', pet, pool, '', (ev, data) => emitted.push([ev, data]), { random: () => 0.37 });
  mode.start();
  return { mode, emitted };
};
const reachRush = (mode: BossSystem) => {
  while (mode.phase === 1) mode.submit(mode.run.current!.text, false);
  while (!mode.run.current && !mode.finished) mode.tick(0.1);
  assert.equal(mode.phase, 2);
};
const reachFinal = (mode: BossSystem) => {
  let turns = 0;
  while (mode.phase !== 3 && !mode.finished && turns++ < 1000) {
    if (mode.run.current) mode.submit(mode.run.current.text, false);
    mode.tick(0.1);
  }
  assert.equal(mode.phase, 3);
};

// 오답은 새 문장을 주지 않는다. 실제 오타 교정이 끝나야 같은 목표가 성공한다.
{
  const { mode, emitted } = make();
  const target = mode.run.current!.text, score = mode.score, left = mode.crystals.length;
  mode.submit('틀린 답', false);
  assert.equal(mode.run.current!.text, target);
  assert.equal(mode.score, score);
  assert.equal(mode.crystals.filter((c) => !c.broken).length, left);
  assert.equal(emitted.filter(([ev]) => ev === 'BOSS_CRYSTAL_BREAK').length, 0);
  mode.submit(target, true);
  assert.equal(mode.run.correctedCount, 1);
  assert.equal(mode.crystals.filter((c) => !c.broken).length, left - 1);
}

// 마지막 결정에서 효과 없는 점프를 차감하지 않는다.
{
  const { mode } = make();
  for (let i = 0; i < 4; i++) mode.submit(mode.run.current!.text, false);
  const target = mode.run.current!.text, skips = mode.run.skipsLeft;
  assert.equal(mode.skip(), false);
  assert.equal(mode.run.skipsLeft, skips);
  assert.equal(mode.run.current!.text, target);
  assert.equal(mode.phase, 1);
  mode.submit(target, false);
  assert.equal(mode.phase, 2);
}

// 큐가 하나여도 점프는 다른 낱말로 전환한다. 미완료 낱말은 뒤에 남고 점수·피해는 없다.
{
  const { mode } = make(); reachRush(mode);
  assert.equal(mode.queue.length, 1);
  const original = mode.run.current!.text, score = mode.score, done = mode.run.wordsDone;
  assert.ok(mode.skip());
  assert.notEqual(mode.run.current!.text, original);
  assert.equal(mode.queue[1].text, original);
  assert.equal(mode.run.skippedCount, 1);
  assert.equal(mode.run.wordsDone, done);
  assert.equal(mode.score, score);
  assert.equal(mode.bossHp, BOSS.hp);
  mode.submit(mode.run.current!.text, false);
  assert.equal(mode.run.current!.text, original);
}

// 후보가 하나뿐인 호환 풀은 같은 큐 항목을 복제하지 않고 효과 없는 점프를 거절한다.
{
  const { mode } = make({ ...words, rush: [w('유일한낱말'), w('유일한낱말')] }); reachRush(mode);
  assert.equal(mode.skip(), false);
  assert.equal(mode.run.skipsLeft, 3);
  mode.tick(3);
  assert.equal(mode.queue.length, 1);
}

// P2/P3 접두어 타격은 연출 이벤트만: 같은 접두어 삭제/재입력으로 피해·점수를 얻지 않는다.
for (const phase of [2, 3] as const) {
  const pool = { ...words, rush: ['반짝별', '마법문', '친구들', '달빛길', '빛나는용기', '새로운힘', '따뜻한마음'].map((text) => w(text)) };
  const { mode, emitted } = make(pool);
  if (phase === 2) reachRush(mode); else reachFinal(mode);
  const target = mode.run.current!.text, hp = mode.bossHp, score = mode.score;
  const beforeHits = emitted.filter(([ev]) => ev === 'BOSS_HIT').length;
  mode.commit(target.slice(0, 1));
  const firstHits = emitted.filter(([ev]) => ev === 'BOSS_HIT');
  assert.equal(firstHits.length, beforeHits + 1);
  assert.deepEqual({ damage: firstHits[firstHits.length - 1][1].damage, weak: firstHits[firstHits.length - 1][1].weak, phase: firstHits[firstHits.length - 1][1].phase }, { damage: 0, weak: true, phase });
  mode.commit(''); mode.commit(target.slice(0, 1)); mode.commit('!틀림');
  assert.equal(emitted.filter(([ev]) => ev === 'BOSS_HIT').length, beforeHits + 1);
  assert.equal(mode.bossHp, hp);
  assert.equal(mode.score, score);
  mode.submit(target, true);
  const hits = emitted.filter(([ev]) => ev === 'BOSS_HIT');
  assert.ok(hits[hits.length - 1][1].damage > 0);
  assert.equal(hits[hits.length - 1][1].weak, false);
}

const roles = ['갑옷', '코어', '마무리'];
function rolePool(prefix: string) {
  return {
    crystals: Array.from({ length: 8 }, (_, i) => w(`${prefix} crystal ${i}`)),
    rush: Array.from({ length: 24 }, (_, i) => w(`${prefix} rush ${i}`)),
    final: roles.flatMap((role, step) => Array.from({ length: 4 }, (_, i) => ({ ...w(`${prefix} final ${step} option ${i}.`, 'sentence'), tags: ['최종', role] }))),
  };
}
function finishSentences(mode: BossSystem): string[] {
  const targets: string[] = [];
  while (!mode.finished) {
    targets.push(mode.run.current!.text);
    assert.equal(mode.snapshot().boss!.finalStep, targets.length);
    mode.submit(mode.run.current!.text, false);
  }
  return targets;
}

// 상수 RNG여도 직전 같은 후보 세트를 재사용하지 않는다. 언어 후보 이력은 서로 간섭하지 않는다.
const ko = rolePool('한글'), en = rolePool('English');
const firstKo = make(ko), firstEn = make(en);
reachFinal(firstKo.mode); reachFinal(firstEn.mode);
const chosenKo = finishSentences(firstKo.mode), chosenEn = finishSentences(firstEn.mode);
for (const [pool, previous] of [[ko, chosenKo], [en, chosenEn]] as const) {
  const { mode, emitted } = make(pool); reachFinal(mode);
  const chosen = finishSentences(mode);
  assert.equal(new Set(chosen).size, 3);
  assert.notDeepEqual([...chosen].sort(), [...previous].sort());
  chosen.forEach((text, i) => assert.ok(pool.final.find((u) => u.text === text)!.tags.includes(roles[i])));
  const strongHits = emitted.filter(([ev, hit]) => ev === 'BOSS_HIT' && !hit.weak).map(([, hit]) => hit as Hit);
  assert.equal(strongHits.filter((hit) => hit.phase === 2).reduce((sum, hit) => sum + hit.damage, 0), 70, 'P2 표시 피해 합계도 실제 100→30과 같다');
  assert.equal(strongHits.filter((hit) => hit.phase === 3).reduce((sum, hit) => sum + hit.damage, 0), 30, '마지막 문장 타격을 포함해 실제 30→0을 표시한다');
  assert.equal(emitted.filter(([ev]) => ev === 'BOSS_CORE').length, 1);
  assert.equal(emitted.filter(([ev]) => ev === 'BOSS_FINAL').length, 1);
}

// 최종 점프는 역할과 진도를 유지하며 새 문장으로 바뀐다. 3회 점프·오답만으로 갑옷이 열리지 않는다.
{
  const { mode, emitted } = make(rolePool('교정')); reachFinal(mode);
  const seen = new Set([mode.run.current!.text]);
  const done = mode.run.wordsDone;
  for (let i = 0; i < 3; i++) {
    assert.ok(mode.skip());
    assert.ok(!seen.has(mode.run.current!.text));
    seen.add(mode.run.current!.text);
    assert.equal(mode.snapshot().boss!.finalRole, 'armor');
    assert.equal(mode.snapshot().boss!.finalStep, 1);
    mode.submit('오답', false);
  }
  assert.equal(mode.run.wordsDone, done);
  assert.equal(mode.bossHp, 30);
  assert.equal(mode.armorBroken, false);
  assert.equal(emitted.filter(([ev]) => ev === 'STAGE_CLEAR').length, 0);
  mode.submit(mode.run.current!.text, true);
  assert.equal(mode.snapshot().boss!.finalRole, 'core');
  assert.equal(mode.bossHp, 20);
  mode.submit(mode.run.current!.text, false);
  assert.ok(mode.coreExposed && !mode.finalDone);
  assert.equal(mode.snapshot().boss!.finalRole, 'finale');
  mode.submit(mode.run.current!.text, false);
  assert.ok(mode.finalDone && mode.finished);
  assert.equal(mode.run.wordsDone, done + 3);
}

// 점프로 대체한 실제 완주 세트를 기억한다. 다음 판은 생성 당시의 오래된 세트와 비교하지 않는다.
{
  const pool = rolePool('점프 뒤 재도전');
  const first = make(pool); reachFinal(first.mode);
  assert.ok(first.mode.skip());
  const completed = finishSentences(first.mode);
  const retry = make(pool); reachFinal(retry.mode);
  const next = finishSentences(retry.mode);
  assert.notDeepEqual([...next].sort(), [...completed].sort(), '상수 RNG에서도 점프 후 실제 완주 세트가 연달아 나오지 않는다');
}

// 중복된 콘텐츠 입력도 결정/문장/대기 큐로 복제되지 않고 미출제 러시부터 나온다.
{
  const base = rolePool('다양성');
  const pool = { crystals: [...base.crystals, base.crystals[0]], rush: [...base.crystals, ...base.rush, base.rush[0]], final: [...base.final, base.final[0]] };
  const { mode, emitted } = make(pool); reachRush(mode);
  for (let i = 0; i < 80; i++) mode.tick(0.1);
  assert.equal(new Set(mode.crystals.map((c) => c.word.text)).size, 5);
  assert.equal(new Set(mode.queue.map((u) => u.text)).size, mode.queue.length);
  reachFinal(mode);
  const presented = emitted.filter(([ev, data]) => ev === 'BOSS_QUEUE' && data.added).map(([, data]) => data.added as string);
  assert.equal(new Set(presented).size, presented.length, '미출제 후보가 남아 있는 동안 러시 재출제 없음');
  assert.ok(presented.every((text) => !mode.crystals.some((c) => c.word.text === text)), '결정에서 이미 본 낱말보다 새 낱말 우선');
}

// 실제 한국어/영어 콘텐츠: 마지막 장문은 역할마다 같은 이야기 세트의 2문장씩(총 6문장)이고, 갑옷은 2문장 뒤·코어는 4문장 뒤에 드러난다.
for (const language of ['ko', 'en'] as const) {
  setLanguage(language);
  const content = getContentForStage('stage_5');
  const pool = { crystals: content.filter((u) => u.tags.includes('결정')), rush: content.filter((u) => u.tags.includes('러시')), final: content.filter((u) => u.tags.includes('최종')) };
  const { mode, emitted } = make(pool); reachFinal(mode);
  const setOf = (text: string) => pool.final.find((u) => u.text === text)!.tags.find((t) => t.startsWith('이야기'));
  const chosen: string[] = [];
  const rolesSeen: string[] = [];
  while (!mode.finished) {
    const text = mode.run.current!.text;
    chosen.push(text);
    rolesSeen.push(mode.snapshot().boss!.finalRole!);
    assert.equal(mode.snapshot().boss!.finalStep, chosen.length);
    assert.equal(mode.snapshot().boss!.finalTotal, 6);
    mode.submit(text, false);
    if (chosen.length === 1) assert.equal(mode.armorBroken, false, '갑옷 문장 하나로는 갑옷이 안 깨진다');
    if (chosen.length === 2) assert.ok(mode.armorBroken && !mode.coreExposed, '갑옷 2문장 → 갑옷 파괴');
    if (chosen.length === 4) assert.ok(mode.coreExposed && !mode.finalDone, '코어 2문장 → 코어 노출');
  }
  assert.equal(chosen.length, 6);
  assert.equal(new Set(chosen).size, 6);
  assert.deepEqual(rolesSeen, ['armor', 'armor', 'core', 'core', 'finale', 'finale']);
  for (const pair of [[0, 1], [2, 3], [4, 5]]) assert.equal(setOf(chosen[pair[0]]), setOf(chosen[pair[1]]), '같은 역할의 두 문장은 같은 이야기 세트에서 온다');
  assert.ok(mode.finalDone);
  const strongHits = emitted.filter(([ev, hit]) => ev === 'BOSS_HIT' && !hit.weak && hit.phase === 3).map(([, hit]) => hit as Hit);
  assert.equal(strongHits.reduce((sum, hit) => sum + hit.damage, 0), 30, '장문 6문장이 30→0을 나눠 깎는다');
  console.log(`check-boss: ${language} actual content, ${pool.final.length} final candidates, 6-sentence passage in role order, clear passed`);
}
setLanguage('ko');
console.log('check-boss: all passed');

// P1 조작 다양성: ←→ 로 깰 결정을 고른다. 다른 페이즈에서는 목표가 바뀌지 않는다.
{
  const { mode, emitted } = make();
  const first = mode.run.current!.text;
  mode.move('right', true);
  const second = mode.run.current!.text;
  assert.notEqual(second, first, '→ 는 다음 결정으로');
  assert.equal(emitted.filter(([ev]) => ev === 'BOSS_CRYSTAL_SELECT').length, 1);
  mode.move('left', true);
  assert.equal(mode.run.current!.text, first, '← 는 이전 결정으로');
  mode.move('up', true);
  assert.equal(mode.run.current!.text, first, '↑↓ 는 결정을 바꾸지 않는다');
  mode.submit(first, false);
  assert.equal(mode.crystals.filter((c) => c.broken).length, 1);
  reachRush(mode);
  const rushTarget = mode.run.current!.text;
  mode.move('right', true);
  assert.equal(mode.run.current!.text, rushTarget, 'P2 에서는 방향키가 목표를 바꾸지 않는다');
}
console.log('check-boss: crystal selection passed');
