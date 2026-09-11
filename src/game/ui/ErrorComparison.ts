import type { LearningPattern, SaveData } from '../types';
import { h } from '../util/dom';
import { getLanguage } from '../i18n/Locale';
import { errorPattern, learningOf, PATTERN_INFO } from '../systems/LearningSystem';
import { SaveSystem } from '../systems/SaveSystem';

/** Compare a real previous attempt before practising. Recognition earns no game points. */
export function createErrorComparison(save: SaveData, pattern: LearningPattern, onContinue: () => void): HTMLElement | null {
  const focus = learningOf(save).patterns[pattern];
  if (!focus || !focus.lastTyped || focus.lastTyped === focus.lastTarget || focus.comparedTargets?.includes(focus.lastTarget)) return null;
  const en = getLanguage() === 'en';
  const copy = (ko: string, english: string) => en ? english : ko;
  const answer = errorPattern(focus.lastTarget, focus.lastTyped);
  const names: Record<LearningPattern, string> = en ? { letters: 'Letter order', batchim: 'Final consonant', vowel: 'Vowel', spacing: 'Spaces', punctuation: 'Punctuation' } : { letters: '글자 순서', batchim: '받침', vowel: '모음', spacing: '띄어쓰기', punctuation: '문장부호' };
  const hints: Record<LearningPattern, string> = en ? { letters: 'Read one letter at a time, in the same order.', batchim: 'Check the consonant at the bottom of each syllable.', vowel: 'Compare the vowel shapes carefully.', spacing: 'A space separates words. Press Space once.', punctuation: 'Check the full stop, question mark or exclamation mark.' } : Object.fromEntries(Object.entries(PATTERN_INFO).map(([key, value]) => [key, value.hint])) as Record<LearningPattern, string>;
  const firstDiff = [...focus.lastTarget].findIndex((char, index) => char !== [...focus.lastTyped][index]);
  const offset = Math.max(0, (firstDiff < 0 ? focus.lastTarget.length : firstDiff) - 12);
  const excerpt = (text: string) => `${offset ? '…' : ''}${[...text].slice(offset, offset + 40).join('').replace(/ /g, '·')}${[...text].length > offset + 40 ? '…' : ''}`;
  const feedback = h('p', { class: 'practice-feedback', role: 'status', 'aria-live': 'polite' }, copy('· 표시는 빈칸이에요. 무엇을 고치면 될까요?', 'A dot · marks a space. What needs fixing?'));
  let answered = false;
  const choices = [...new Set([answer, 'spacing', 'punctuation', 'letters'] as LearningPattern[])].slice(0, 3).sort();
  const buttons = h('div', { class: 'practice-reason-choices' });
  const proceed = h('button', { class: 'btn btn-primary', hidden: true, onclick: onContinue }, copy('이제 고쳐 써 보기 →', 'Now fix it →'));
  for (const choice of choices) buttons.append(h('button', { class: 'btn btn-sky', 'data-pattern': choice, onclick: () => {
    if (answered) return;
    answered = true;
    for (const button of buttons.querySelectorAll('button')) button.disabled = true;
    feedback.textContent = `${choice === answer ? copy('차이를 찾았어요! ', 'You spotted it! ') : copy('이 글에서는 ', 'In this example, check ')}${names[answer]}. ${hints[answer]}`;
    focus.comparedTargets = [...new Set([...(focus.comparedTargets ?? []), focus.lastTarget])].slice(-10);
    SaveSystem.save();
    proceed.hidden = false;
    proceed.focus();
  } }, names[choice]));
  return h('div', { class: 'practice-reflection', 'data-no-translate': '' },
    h('h3', {}, copy('어디가 달라졌을까?', 'What changed?')),
    h('div', { class: 'practice-comparison' },
      h('div', {}, h('b', {}, copy('목표 글', 'Target')), h('p', {}, excerpt(focus.lastTarget))),
      h('div', {}, h('b', {}, copy('내가 썼던 글', 'My earlier attempt')), h('p', {}, excerpt(focus.lastTyped)))),
    feedback, buttons, proceed,
    h('button', { class: 'btn btn-gray', onclick: onContinue }, copy('바로 연습할래요', 'Go straight to practice')));
}
