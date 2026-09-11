import type { BattleResult, LearningAttempt } from '../types';
import { h } from '../util/dom';
import { SaveSystem } from '../systems/SaveSystem';
import { learningOf, PATTERN_INFO, practicePlan, recordLearning, strongestFocus, needsCorrection } from '../systems/LearningSystem';
import { allContent } from '../data/content';
import { getLanguage } from '../i18n/Locale';
import { createErrorComparison } from './ErrorComparison';
const copy = (ko: string, en: string) => getLanguage() === 'en' ? en : ko;

export function learningSummary(result?: BattleResult, onPractice?: () => void): HTMLElement {
  const save = SaveSystem.get(), learning = learningOf(save), focus = strongestFocus(save);
  const sessions = learning.recent.filter((s) => s.source === 'game');
  const first = sessions[0], latest = sessions[sessions.length - 1];
  const corrected = result?.correctedCount ?? learning.recent.reduce((sum, s) => sum + s.corrected, 0);
  const novel = learning.recent.reduce((sum, s) => sum + s.newSuccesses, 0);
  const body = h('section', { class: 'learning-summary', 'aria-label': '나의 성장 기록' },
    h('h3', {}, result ? '이번에 해낸 것' : '기록으로 보는 나의 성장'),
    h('div', { class: 'learning-counts' },
      h('span', {}, h('b', {}, String(result?.wordsDone ?? save.stats.totalWords)), '개 정확히 완성'),
      h('span', {}, h('b', {}, String(corrected)), '개 고쳐서 성공'),
      result ? h('span', {}, h('b', {}, String(result.skippedCount ?? 0)), '회 나중에 도전') : h('span', {}, h('b', {}, String(novel)), '개 새 글에 적용')),
    first && latest && sessions.length > 1 ? h('p', { class: 'learning-history' }, `첫 기록 정확도 ${first.accuracy.toFixed(1)}% · 최근 ${latest.accuracy.toFixed(1)}%`, h('small', {}, '서로 다른 난이도일 수 있어요. 같은 도전으로 비교해 보세요.')) : h('p', { class: 'learning-history' }, '한 판씩 쌓인 나의 기록으로 다음 연습을 정해요.'),
    focus ? h('div', { class: 'learning-pattern' }, h('b', {}, `다음 연습 · ${PATTERN_INFO[focus[0]].name}`), h('p', {}, PATTERN_INFO[focus[0]].hint), h('p', { class: 'learning-example' }, focus[1].pendingTargets?.[0] ?? copy('고친 부분을 다른 글 2개에서도 확인해요.', 'Check the corrected pattern in two other examples.'))) : h('p', {}, Object.values(learning.patterns).some((f) => f?.resolvedAt) ? copy('고친 부분을 다른 글에서도 확인했어요! 다음 낱말로 나아가요.', 'You used the corrected pattern in other examples! Explore the next words.') : result?.wordsDone ? '다음에는 처음 보는 낱말에도 도전해 보세요.' : '첫 글자를 완성하면 성장 기록이 시작돼요.'),
  );
  if (onPractice) body.append(h('button', { class: 'btn btn-sky btn-md', onclick: onPractice }, focus ? '고쳐서 다시 해보기 · 3개' : '새 낱말 도전 · 3개'));
  return body;
}

/** No countdown: correction is followed by two different examples of the same pattern. */
export function createPracticePanel(onDone: () => void): { panel: HTMLElement; dispose: () => void } {
  const save = SaveSystem.get(), plan = practicePlan(save, allContent());
  const attempts: LearningAttempt[] = [];
  const abort = new AbortController();
  let index = 0, composing = false, hadError = false, loggedError = false, finished = false;
  const title = h('h2', { class: 'panel-title sky' }, '고쳐서 한 걸음 더');
  const body = h('div', { class: 'practice-body' });
  const panel = h('section', { class: 'panel panel-cream modal modal-md practice-panel popup-practice' }, title,
    h('button', { class: 'modal-close', 'aria-label': '연습 닫기', onclick: onDone }, '✕'), body);
  const finish = () => {
    if (finished) return;
    finished = true;
    const correct = attempts.filter((a) => a.outcome === 'correct').length;
    const wrong = attempts.filter((a) => a.outcome === 'wrong').length;
    const corrected = attempts.filter((a) => a.outcome === 'correct' && a.corrected).length;
    const session = recordLearning(save, attempts, { at: new Date().toISOString(), stageId: 'daily', source: 'practice', accuracy: correct + wrong ? 100 * correct / (correct + wrong) : 0, cpm: 0, correct, corrected, skipped: plan.items.length - index });
    SaveSystem.save();
    const resolved = learningOf(save).patterns[plan.pattern]?.resolvedAt;
    body.replaceChildren(h('div', { class: 'practice-success' }, '한 걸음 더 해냈어요!'), h('p', {}, `${correct}개 완성 · ${session.corrected}개 고쳐서 성공 · 새로운 글 ${session.newSuccesses}개에 적용했어요.`), h('p', {}, resolved ? copy('다른 예시 2개에서도 확인 완료! 다음 연습으로 넘어가요.', 'Confirmed in two other examples! Move on to the next practice.') : '다음 모험에서도 같은 부분을 살펴보세요.'), h('button', { class: 'btn btn-primary', onclick: onDone }, '모험으로 돌아가기'));
    body.querySelector('button')?.focus();
  };
  const render = () => {
    if (index >= plan.items.length) { finish(); return; }
    const item = plan.items[index];
    hadError = false; loggedError = false;
    const progress = h('p', { class: 'practice-progress' }, `${index + 1} / ${plan.items.length} · ${item.novel ? '새로운 글에 적용' : '다시 살펴보기'}`);
    const feedback = h('p', { class: 'practice-feedback', role: 'status', 'aria-live': 'polite' }, PATTERN_INFO[plan.pattern].hint);
    const input = h('input', { class: 'input practice-input', 'aria-label': '연습 글 입력', autocomplete: 'off', spellcheck: 'false', maxlength: '600' });
    const noteError = () => {
      hadError = true;
      if (!loggedError) attempts.push({ targetId: `practice-${index}`, target: item.text, typed: input.value.normalize('NFC'), outcome: 'wrong', corrected: false });
      loggedError = true;
    };
    const submit = () => {
      if (composing || !input.value) return;
      const typed = input.value.normalize('NFC').trimEnd();
      if (typed !== item.text) {
        noteError();
        feedback.textContent = `다시 살펴보세요. ${PATTERN_INFO[plan.pattern].hint}`;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      attempts.push({ targetId: `practice-${index}`, target: item.text, typed, outcome: 'correct', corrected: hadError || needsCorrection(save, item.text) });
      index++;
      render();
    };
    input.addEventListener('compositionstart', () => { composing = true; }, { signal: abort.signal });
    input.addEventListener('compositionend', () => { composing = false; }, { signal: abort.signal });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && !composing) { e.preventDefault(); submit(); } }, { signal: abort.signal });
    input.addEventListener('input', (e) => {
      if (!composing && !(e as InputEvent).isComposing && input.value && !item.text.startsWith(input.value.normalize('NFC'))) noteError();
      input.removeAttribute('aria-invalid');
    }, { signal: abort.signal });
    body.replaceChildren(progress, h('p', { class: 'practice-target' }, item.text), input, feedback,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-primary', onclick: submit }, '확인 · Enter'), h('button', { class: 'btn btn-gray', onclick: onDone }, '나중에 다시')));
    window.queueMicrotask(() => { if (input.isConnected) input.focus(); });
  };
  const comparison = createErrorComparison(save, plan.pattern, render);
  if (comparison) body.replaceChildren(comparison);
  else render();
  return { panel, dispose: () => {
    abort.abort();
    if (finished || !attempts.length) return;
    finished = true;
    const correct = attempts.filter((a) => a.outcome === 'correct').length;
    const wrong = attempts.filter((a) => a.outcome === 'wrong').length;
    recordLearning(save, attempts, { at: new Date().toISOString(), stageId: 'daily', source: 'practice', accuracy: correct + wrong ? 100 * correct / (correct + wrong) : 0, cpm: 0, correct, corrected: attempts.filter((a) => a.outcome === 'correct' && a.corrected).length, skipped: plan.items.length - index });
    SaveSystem.save();
  } };
}
