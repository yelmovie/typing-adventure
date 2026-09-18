import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

// Exercise the live locale boundary, not a second copy of the content selector.
const compiled = await build({ stdin: { contents: `
export { allContent, getContentForStage } from './src/game/data/content';
export { setLanguage, installTranslations, t } from './src/game/i18n/Locale';
export { EN, translateDynamic } from './src/game/i18n/en';
export { ENGLISH_CONTENT_META } from './src/game/data/content-en';
export { STUDENT_GUIDE, TEACHER_GUIDE, ABOUT } from './src/game/data/about';
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { allContent, getContentForStage, setLanguage, installTranslations, t, EN, translateDynamic, ENGLISH_CONTENT_META, STUDENT_GUIDE, TEACHER_GUIDE, ABOUT } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const expected = {
  ko: { stage_1: 46, stage_2: 42, stage_3: 12, stage_4: 8, stage_5: 60, daily: 45 },
  en: { stage_1: 30, stage_2: 30, stage_3: 9, stage_4: 5, stage_5: 58, daily: 24 },
};
const hasFinal = text => [...text].some(c => { const n = c.charCodeAt(0) - 0xac00; return n >= 0 && n < 11172 && n % 28 !== 0; });
const hasComplexVowel = text => [...text].some(c => { const n = c.charCodeAt(0) - 0xac00; return n >= 0 && n < 11172 && [3, 7, 9, 10, 11, 14, 15, 16, 19].includes(Math.floor(n / 28) % 21); });
const summary = {};
for (const locale of ['ko', 'en']) {
  setLanguage(locale);
  const all = allContent();
  assert.equal(all.length, Object.values(expected[locale]).reduce((s, n) => s + n, 0));
  assert.equal(new Set(all.map(u => u.id)).size, all.length, `${locale}: unique IDs`);
  summary[locale] = {};
  for (const [stage, count] of Object.entries(expected[locale])) {
    const units = getContentForStage(stage);
    assert.equal(units.length, count, `${locale} ${stage}: content count`);
    assert.ok(units.every(u => u.stage === stage));
    assert.equal(new Set(units.map(u => u.text)).size, units.length, `${locale} ${stage}: varied targets`);
    for (const u of units) {
      assert.equal(u.text, u.text.trim().normalize('NFC'), `${u.id}: NFC/whitespace`);
      assert.ok(!/[\t\r\n]| {2}/.test(u.text), `${u.id}: visible spacing only`);
      assert.ok(Number.isInteger(u.difficulty) && u.difficulty >= 1 && u.difficulty <= 3);
      assert.ok(Array.isArray(u.tags) && u.weight > 0);
      assert.ok(locale === 'ko' ? !/[A-Za-z]/.test(u.text) : !/[가-힣]/.test(u.text), `${u.id}: locale`);
      if (u.type === 'word') {
        assert.match(u.text, locale === 'ko' ? /^[가-힣]+$/ : /^[a-z]+$/);
        const limit = locale === 'ko' ? stage === 'stage_1' ? 4 : 3 : stage === 'stage_1' ? 7 : 6;
        assert.ok([...u.text].length <= limit, `${u.id}: short word budget (${u.text})`);
        if (locale === 'ko' && stage === 'stage_1') {
          if (u.difficulty === 1) assert.ok(!hasFinal(u.text), `${u.id}: no-final-syllable introductory word`);
          if (u.tags.includes('받침')) assert.ok(hasFinal(u.text), `${u.id}: final-syllable tag`);
          if (u.tags.includes('박쥐')) assert.ok(u.text.length >= 3, `${u.id}: bat word length`);
          if (u.tags.includes('대장')) assert.equal(u.text.length, 4, `${u.id}: four-syllable boss word`);
        }
        if (locale === 'ko' && u.tags.includes('이중모음')) assert.ok(hasComplexVowel(u.text), `${u.id}: complex-vowel tag`);
      } else {
        assert.equal(u.type, 'sentence');
        const limit = locale === 'ko' ? stage === 'daily' ? 50 : 32 : stage === 'daily' ? 55 : 40;
        assert.ok(u.text.length <= limit, `${u.id}: readable sentence budget`);
      }
    }
    summary[locale][stage] = { count, minLength: Math.min(...units.map(u => u.text.length)), maxLength: Math.max(...units.map(u => u.text.length)), examples: units.slice(0, 4).map(u => u.text) };
  }
  for (const [stage, tag, count] of [['stage_3', '편지', 9], ['stage_4', '전보', 5]]) {
    const sequence = getContentForStage(stage).filter(u => u.tags.includes(tag));
    assert.equal(sequence.length, count, `${locale}: ${tag} sequence`);
    assert.deepEqual(sequence.map(u => u.tags.find(tag => tag.startsWith('순서'))), Array.from({ length: count }, (_, i) => `순서${i + 1}`));
  }
  // 마지막 장문: 이야기 세트 4개 × 6문장, 역할마다 2문장(순서 1-2 갑옷, 3-4 코어, 5-6 마무리)
  const finals = getContentForStage('stage_5').filter(u => u.tags.includes('최종'));
  assert.equal(finals.length, 24, `${locale}: four final passages of six sentences`);
  const orderOf = u => Number(u.tags.find(t => t.startsWith('순서')).slice(2));
  const sets = [...new Set(finals.map(u => u.tags.find(t => /^이야기[0-9]+$/.test(t))))].sort();
  assert.deepEqual(sets, ['이야기1', '이야기2', '이야기3', '이야기4'], `${locale}: final passage sets`);
  for (const set of sets) {
    const passage = finals.filter(u => u.tags.includes(set)).sort((a, b) => orderOf(a) - orderOf(b));
    assert.deepEqual(passage.map(orderOf), [1, 2, 3, 4, 5, 6], `${locale} ${set}: six ordered sentences`);
    assert.deepEqual(passage.map(u => ['갑옷', '코어', '마무리'].find(role => u.tags.includes(role))), ['갑옷', '갑옷', '코어', '코어', '마무리', '마무리'], `${locale} ${set}: two sentences per role`);
  }
  for (const tag of locale === 'ko' ? ['장문1', '장문2', '장문3'] : ['장문1']) {
    const sequence = getContentForStage('daily').filter(u => u.tags.includes(tag));
    const count = locale === 'ko' ? 10 : 12;
    assert.equal(sequence.length, count);
    assert.deepEqual(sequence.map(u => u.tags.find(tag => tag.startsWith('순서'))), Array.from({ length: count }, (_, i) => `순서${i + 1}`));
  }
}
// 성취기준·학습목표·검수 메타데이터 (A2·A11·A12): 코드/원문/출처 URL/검증 여부, 지역별 학습 목표 1개 이상, 교사 검수 필드.
const meta = JSON.parse(fs.readFileSync('src/game/data/content.json', 'utf8')).meta;
for (const [label, m] of [['ko', meta], ['en', ENGLISH_CONTENT_META]]) {
  assert.ok(Array.isArray(m.standards) && m.standards.length > 0, `${label}: meta.standards`);
  for (const s of m.standards) {
    assert.match(s.code, /^\[\d[가-힣]+\d{2}-\d{2}\]$/, `${label}: standard code ${s.code}`);
    assert.ok(typeof s.text === 'string' && s.text.length > 10, `${label}: standard text ${s.code}`);
    assert.ok(typeof s.subject === 'string' && typeof s.grade === 'string', `${label}: subject/grade ${s.code}`);
    assert.match(s.source, /^https?:\/\//, `${label}: standard source URL ${s.code}`);
    assert.equal(typeof s.verified, 'boolean', `${label}: verified flag ${s.code}`);
  }
  for (const stage of Object.keys(expected.ko)) assert.ok(Array.isArray(m.learningObjectives?.[stage]) && m.learningObjectives[stage].length >= 1, `${label} ${stage}: learning objective`);
  assert.equal(typeof m.review?.needsReview, 'boolean', `${label}: review.needsReview`);
  for (const key of ['reviewer', 'source', 'note']) assert.equal(typeof m.review[key], 'string', `${label}: review.${key}`);
  assert.ok(m.review.reviewedAt === null || typeof m.review.reviewedAt === 'string', `${label}: review.reviewedAt`);
}
for (const line of ABOUT.standards) assert.ok(meta.standards.some(s => line.includes(s.code)) || !/\[\d/.test(line), `Guide standard without meta entry: ${line}`);
installTranslations(EN, translateDynamic);
setLanguage('en');
for (const text of [...STUDENT_GUIDE, ...TEACHER_GUIDE, ...ABOUT.standards, '연습 튜토리얼', '먼저 연습하기', '다시 연습하기']) assert.ok(!/[가-힣]/.test(t(text).replace(/\[\d[가-힣]+\d{2}-\d{2}\]/g, '')), `Untranslated guide: ${text}`);
setLanguage('ko');
assert.equal(allContent().length, 213, 'Switching back restores Korean content');
fs.mkdirSync('tmp/content-refresh', { recursive: true });
fs.writeFileSync('tmp/content-refresh/verification.json', JSON.stringify({ date: new Date().toISOString(), pass: true, checks: ['live allContent/getContentForStage locale boundary', 'unique IDs and within-stage targets', 'NFC/type/weight/difficulty', 'short-word and sentence length budgets', 'Korean syllable/vowel learning tags', 'ordered letter/telegram/finale/daily stories', 'standards/learning objectives/review metadata (ko+en)', 'student/teacher guide translations'], summary }, null, 2));
console.log('PASS content: Korean 213 + English 156; locale, learning tags, length, story order, standards/objectives/review meta, and guide translations.');
console.log(JSON.stringify(summary, null, 2));
