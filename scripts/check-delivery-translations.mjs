import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
const load = async (entry) => {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [{ EN, translateDynamic }, { installTranslations, setLanguage, t }] = await Promise.all([load('src/game/i18n/en.ts'), load('src/game/i18n/Locale.ts')]);
installTranslations(EN, translateDynamic);
const cases = [];
for (const [index, name] of ['푸른 숲', '네온 시티', '사막 유적', '폭주 열차', '어둠의 성채'].entries()) {
  for (const prefix of ['', '모험 플러스 · ']) for (const suffix of ['', ' · 시간이 다 됐어요', ' · 다시 준비해 볼까요?']) cases.push(`${prefix}STAGE ${index + 1} · ${name}${suffix}`);
}
for (const daily of ['오늘의 도전', '오늘의 문장', '오늘의 긴 글']) for (const status of ['오늘 정확도 기록 갱신!', '오늘도 한 걸음 연습했어요']) cases.push(`${daily} · ${status}`);
cases.push(
  '처음이라면 기초부터. 익숙해지면 더 어려운 도전으로 바꿔 봐요.',
  '하늘 모험가, 해냈어요!', '모험가, 해냈어요!', 'Lv.5 별빛 타자', '최고 150', '1 / 20 마리',
  '전송률 50% (5/10 어절)', '450 m · 10.5 m/s 감속', '폭탄 낱말 1.3초', '2:40 · 보스 3페이즈',
  '하늘 · Lv.2', '하늘 · 빨간 스카프 고양이 ·', '· 다음 칭호까지 30코인', '24 · 최고', '123.5타/분', '· 도감 65% · 도전 카드 7/15', '이야기 2/5', '도전 카드 7/15',
  'v0.3.0 · 기록은 이 기기에만 저장돼요 · © 2026 옐샘',
  '루카 · 별 6개 모으면 합류', '하늘 & 빨간 스카프 고양이',
  '새로 합류: 캐릭터 루카, 펫 아기 드래곤', '칭호 획득: 칭호 「글자의 수호자」, 홈 장식 별 별빛 조각',
  '별빛 인장 +2 · 차근차근 정확하게 · 실수를 나의 힘으로',
  '1. 푸른 숲 · 완료, 별 3개', '2. 네온 시티 · 이전 지역을 완료하면 열려요',
  '2 / 3 · 새로운 글에 적용', '첫 기록 정확도 70.0% · 최근 95.0%',
  '3개 완성 · 1개 고쳐서 성공 · 새로운 글 2개에 적용했어요.',
  '418/418개 · 47.3 / 47.3MB · 완주 영상 포함', '0m 뒤',
  'P1 결정 파괴', 'P2 속도 러시', 'P3 마지막 장문', '편지 9문장 · 시간제한 없음', '전보 5문장 · 360m (약 3:00)',
  '2문장 연속 성공 · 5초 동안 오답 콤보·HP 보호',
  '빨간 스카프 고양이가 첫 오답의 콤보·HP 보호!', '아기 드래곤이 강공격 +10%!',
  '이 언어의 모험 기록을 새로 시작해요.\n다른 언어의 모험 기록은 유지돼요. 계속할까요?',
);
setLanguage('en');
const results = cases.map((source) => ({ source, translated: t(source) }));
for (const { source, translated } of results) assert.ok(!/[가-힣]/.test(translated), `Untranslated compound UI: ${source} => ${translated}`);
assert.equal(t('STAGE 1 · 푸른 숲 · 시간이 다 됐어요'), 'STAGE 1 · Blue Forest · Time is up');
assert.equal(t('전송률 50% (5/10 어절)'), 'Sent 50% (5/10 words)');
assert.ok(t('처음이라면 기초부터. 익숙해지면 더 어려운 도전으로 바꿔 봐요.').includes(t('기초')), 'Setup guidance names the actual difficulty button');
assert.equal(t('처음 보는 연습 문장은 그대로'), '처음 보는 연습 문장은 그대로', 'Unknown exercise prose is not guessed');
setLanguage('ko');
for (const source of cases) assert.equal(t(source), source, 'Korean UI stays unchanged');
fs.mkdirSync('tmp/delivery-check', { recursive: true });
fs.writeFileSync('tmp/delivery-check/translations.json', JSON.stringify({ count: cases.length, passed: true, results }, null, 2));
console.log(`PASS ${cases.length} compound UI translations; Korean retained and unknown exercise prose untouched`);
