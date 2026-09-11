import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

// Exercise the live locale boundary, not a second copy of the content selector.
const compiled = await build({ stdin: { contents: `
export { allContent, getContentForStage } from './src/game/data/content';
export { setLanguage, installTranslations, t } from './src/game/i18n/Locale';
export { EN, translateDynamic } from './src/game/i18n/en';
export { STUDENT_GUIDE, TEACHER_GUIDE } from './src/game/data/about';
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { allContent, getContentForStage, setLanguage, installTranslations, t, EN, translateDynamic, STUDENT_GUIDE, TEACHER_GUIDE } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const expected = {
  ko: { stage_1: 46, stage_2: 42, stage_3: 9, stage_4: 6, stage_5: 48, daily: 45 },
  en: { stage_1: 30, stage_2: 30, stage_3: 6, stage_4: 3, stage_5: 46, daily: 24 },
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
  for (const [stage, tag, count] of [['stage_3', '편지', 6], ['stage_4', '전보', 3]]) {
    const sequence = getContentForStage(stage).filter(u => u.tags.includes(tag));
    assert.equal(sequence.length, count, `${locale}: ${tag} sequence`);
    assert.deepEqual(sequence.map(u => u.tags.find(tag => tag.startsWith('순서'))), Array.from({ length: count }, (_, i) => `순서${i + 1}`));
  }
  const finals = getContentForStage('stage_5').filter(u => u.tags.includes('최종'));
  assert.equal(finals.length, 12, `${locale}: twelve final sentence choices`);
  for (const [i, role] of ['갑옷', '코어', '마무리'].entries()) {
    const choices = finals.filter(u => u.tags.includes(role));
    assert.equal(choices.length, 4, `${locale}: alternatives for ${role}`);
    assert.ok(choices.every(u => u.tags.includes(`순서${i + 1}`)), `${locale}: final role order`);
  }
  for (const tag of locale === 'ko' ? ['장문1', '장문2', '장문3'] : ['장문1']) {
    const sequence = getContentForStage('daily').filter(u => u.tags.includes(tag));
    const count = locale === 'ko' ? 10 : 12;
    assert.equal(sequence.length, count);
    assert.deepEqual(sequence.map(u => u.tags.find(tag => tag.startsWith('순서'))), Array.from({ length: count }, (_, i) => `순서${i + 1}`));
  }
}
installTranslations(EN, translateDynamic);
setLanguage('en');
for (const text of [...STUDENT_GUIDE, ...TEACHER_GUIDE, '연습 튜토리얼', '먼저 연습하기', '다시 연습하기']) assert.ok(!/[가-힣]/.test(t(text)), `Untranslated guide: ${text}`);
setLanguage('ko');
assert.equal(allContent().length, 196, 'Switching back restores Korean content');
fs.mkdirSync('tmp/content-refresh', { recursive: true });
fs.writeFileSync('tmp/content-refresh/verification.json', JSON.stringify({ date: new Date().toISOString(), pass: true, checks: ['live allContent/getContentForStage locale boundary', 'unique IDs and within-stage targets', 'NFC/type/weight/difficulty', 'short-word and sentence length budgets', 'Korean syllable/vowel learning tags', 'ordered letter/telegram/finale/daily stories', 'student/teacher guide translations'], summary }, null, 2));
console.log('PASS content: Korean 196 + English 139; locale, learning tags, length, story order, and guide translations.');
console.log(JSON.stringify(summary, null, 2));
