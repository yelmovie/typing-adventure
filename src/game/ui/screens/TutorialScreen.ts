import { Screen } from '../Screen';
import { h } from '../../util/dom';
import { TutorialSystem, tutorialSteps } from '../../systems/TutorialSystem';
import { getLanguage } from '../../i18n/Locale';
import { SaveSystem } from '../../systems/SaveSystem';
import { AudioManager } from '../../systems/AudioManager';
import { navigate } from '../../Game';
import { EventBus } from '../../EventBus';
import { TUTORIAL_FEEDBACK, TUTORIAL_STEP } from '../../scenes/TutorialScene';
import { diffChars } from '../../util/hangul';
import { KeyboardGuide } from '../KeyboardGuide';
import type { StageId } from '../../types';
import { StagePractice, stagePracticeParts, practicedParts, PRACTICE_PARTS, PART_LABELS, type PracticePart } from '../../systems/StagePractice';

interface TutorialData { stageId?: StageId; next?: 'home' | 'worldmap'; remix?: boolean; full?: boolean }
const copy = (ko: string, en: string) => getLanguage() === 'en' ? en : ko;

export class TutorialScreen extends Screen<TutorialData> {
  private model!: TutorialSystem;
  private data: TutorialData = {};
  private focusTimer?: number;
  private completedParts = new Set<PracticePart>();
  constructor() { super('tutorial'); }
  protected render(data: TutorialData) {
    this.data = data;
    this.completedParts = new Set(practicedParts(SaveSystem.get().progress));
    this.el.setAttribute('data-no-translate', 'true');
    if (data.stageId && data.stageId !== 'daily') {
      const parts = stagePracticeParts(data.stageId).filter(part => data.full || !this.completedParts.has(part));
      this.model = new TutorialSystem(getLanguage(), parts.length ? parts : stagePracticeParts(data.stageId), !data.full);
      this.draw();
    } else this.drawMenu();
  }
  private drawMenu() {
    window.clearTimeout(this.focusTimer);
    const lessons = tutorialSteps(getLanguage());
    this.el.replaceChildren(
      this.header(),
      h('section', { class: 'tutorial-panel tutorial-menu' },
        h('h1', {}, copy('네 가지 타자 연습', 'Four typing practice parts')),
        h('p', { class: 'tutorial-instruction' }, copy('연습할 파트를 골라요. 틀려도 천천히 고치면 돼요.', 'Choose a part. Take your time and fix any mistakes.')),
        h('div', { class: 'tutorial-part-grid' }, lessons.map((lesson, i) => h('button', {
          class: 'btn btn-sky tutorial-part-card', 'data-part': lesson.part, onclick: () => {
            this.model = new TutorialSystem(getLanguage(), [lesson.part]); this.draw();
          },
        }, h('strong', {}, `${i + 1}. ${PART_LABELS[lesson.part][getLanguage() === 'en' ? 1 : 0]}`),
        h('span', {}, lesson.part === 'story' ? copy('짧은 글 1편 · 4문장', '1 story · 4 sentences') : `${lesson.targets.length}${copy('개', ' targets')}`),
        h('small', {}, this.completedParts.has(lesson.part) ? copy('연습 완료 · 다시 연습', 'Complete · Practice again') : lesson.part === 'vowels' ? copy('이중모음 포함', 'All vowels') : lesson.part === 'consonants' ? copy('쌍자음 포함', 'All consonants') : copy('띄어쓰기와 문장부호까지', 'Spaces and punctuation'))))),
        h('p', { class: 'tutorial-hint' }, copy('연습한 내용은 기억해 둬요. 다음 도전은 바로 시작할 수 있어요.', 'We remember completed practice. Your next attempt can start right away.'))));
  }
  private leave() {
    if (this.data.stageId) void navigate('intro', { stageId: this.data.stageId, remix: this.data.remix });
    else void navigate(this.data.next ?? 'home');
  }
  private skipWarmup() {
    const stageId = this.data.stageId;
    if (!stageId || stageId === 'daily') return;
    StagePractice.skip(stageId, getLanguage(), !!this.data.remix);
    AudioManager.sfx('go');
    void navigate('battle', { stageId, remix: this.data.remix });
  }
  private header() {
    const canSkip = !!this.data.stageId && this.data.stageId !== 'daily' && !this.data.full;
    return h('header', { class: 'tutorial-header' },
      h('span', {}, copy('연습 튜토리얼', 'Practice tutorial')),
      h('div', { class: 'tutorial-header-actions' },
        canSkip ? h('button', { type: 'button', class: 'btn btn-sky tutorial-skip', onclick: () => this.skipWarmup() }, copy('건너뛰고 시작', 'Skip & start')) : null,
        h('button', { type: 'button', class: 'btn btn-gray tutorial-leave', onclick: () => this.leave() }, copy('나가기', 'Leave'))));
  }
  private draw() {
    window.clearTimeout(this.focusTimer);
    const m = this.model, s = m.step;
    const partIndex = PRACTICE_PARTS.indexOf(s.part);
    const keyboard = new KeyboardGuide({ embedded: true });
    const progress = h('span', { class: 'tutorial-item-progress' });
    EventBus.emit(TUTORIAL_STEP, partIndex);
    const title = h('h1', { id: 'tutorial-title' }, s.title);
    const target = h('div', { class: 'tutorial-target', 'aria-label': copy('입력할 글자', 'Text to type'), 'data-target': m.target }, m.target);
    const input = h('input', { id: 'tutorial-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-labelledby': 'tutorial-title', 'aria-describedby': 'tutorial-hint tutorial-feedback', maxlength: 80, value: s.prefill ?? '', lang: getLanguage() }) as HTMLInputElement;
    const feedback = h('p', { id: 'tutorial-feedback', class: 'tutorial-feedback', role: 'status', 'aria-live': 'polite' }, copy('천천히 해도 괜찮아요. 시간제한은 없어요.', 'Take your time. There is no timer.'));
    const send = h('button', { class: 'btn btn-primary', type: 'submit' }, copy('보내기', 'Send'), h('kbd', {}, 'Enter'));
    const next = h('button', { class: 'btn btn-primary tutorial-next', type: 'button', hidden: true, onclick: () => {
      if (m.complete) {
        if (this.data.stageId) void navigate('battle', { stageId: this.data.stageId, remix: this.data.remix });
        else this.drawMenu();
      } else if (m.next()) this.draw();
    } }, copy('다음 파트 연습 →', 'Next practice part →'));
    let composing = false;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; paint(); });
    const paint = () => {
      target.replaceChildren(...diffChars(m.target, input.value.normalize('NFC')).map(p => h('span', { class: p.state }, p.ch)));
      keyboard.update(m.target, input.value);
      progress.textContent = `${m.targetIndex + 1} / ${s.targets.length}`;
    };
    input.addEventListener('input', paint);
    input.addEventListener('keydown', e => {
      keyboard.setPressed(e.code, true);
      if (e.key === 'Enter' && (e.isComposing || composing || e.keyCode === 229)) e.preventDefault();
    });
    input.addEventListener('keyup', e => keyboard.setPressed(e.code, false));
    input.addEventListener('blur', () => keyboard.clearPressed());
    const form = h('form', { class: 'tutorial-form' }, h('label', { for: 'tutorial-input' }, copy('여기에 입력해요', 'Type here')), input, send);
    form.addEventListener('submit', e => {
      e.preventDefault(); if (composing) return;
      const outcome = m.submit(input.value);
      if (outcome === 'ignored') return;
      if (outcome === 'wrong') {
        target.dataset.target = m.target; paint();
        feedback.textContent = s.resetOnMistake
          ? copy('괜찮아요! 첫 낱말부터 다시 두 번 이어서 성공해 봐요.', 'That is okay! Start with the first word and try two correct words in a row.')
          : copy('아직 조금 달라요. 위 글자를 보고 Backspace로 고쳐 봐요.', 'Almost! Check the target and use Backspace to fix it.');
        input.setAttribute('aria-invalid', 'true'); input.focus(); return;
      }
      input.removeAttribute('aria-invalid');
      AudioManager.sfx('perfect');
      EventBus.emit(TUTORIAL_FEEDBACK, { step: partIndex, completed: m.stepComplete });
      if (outcome === 'correct') {
        input.value = ''; target.dataset.target = m.target; paint(); input.focus();
        feedback.textContent = copy(`좋아요! ${m.targetIndex}개 성공. 다음도 써 볼까요?`, 'One down! Send the next word.');
      } else {
        input.disabled = true; send.disabled = true; next.hidden = false;
        feedback.textContent = s.success;
        this.el.querySelector(`[data-step="${m.stepIndex}"]`)?.classList.add('done');
        this.completedParts.add(s.part);
        StagePractice.completePart(s.part, getLanguage());
        if (m.complete) {
          if (this.data.stageId && this.data.stageId !== 'daily') StagePractice.complete(this.data.stageId, getLanguage(), !!this.data.remix);
          (this.el.querySelector('.tutorial-skip') as HTMLButtonElement | null)?.setAttribute('hidden', '');
          next.textContent = this.data.stageId ? copy('준비 끝! 모험 시작 →', 'Ready! Start adventure →') : copy('다른 파트 고르기 →', 'Choose another part →');
          feedback.textContent += copy(' 모험 중에는 Esc로 잠깐 쉴 수 있어요.', ' In the adventure, press Esc to take a break.');
        }
        next.focus();
      }
    });
    const panel = h('section', { class: 'tutorial-panel', 'aria-labelledby': 'tutorial-title' },
      h('div', { class: 'tutorial-eyebrow' }, this.data.stageId ? this.data.full ? copy('다시 익혀 보기', 'PRACTICE AGAIN') : copy('처음 한 번, 짧게 준비', 'FIRST-TIME WARM-UP') : copy('자유 연습', 'FREE PRACTICE'), h('span', {}, `${m.stepIndex + 1} / ${m.steps.length}`)),
      h('ol', { class: 'tutorial-steps', 'aria-label': copy('연습 파트', 'Practice parts') }, m.steps.map((step, i) => h('li', { class: i < m.stepIndex ? 'done' : i === m.stepIndex ? 'active' : '', 'data-step': i, 'aria-current': i === m.stepIndex ? 'step' : 'false', title: step.title }, String(PRACTICE_PARTS.indexOf(step.part) + 1)))),
      title, h('p', { class: 'tutorial-instruction' }, s.instruction),
      h('div', { class: `tutorial-target-wrap${partIndex >= 2 ? ' tutorial-prose' : ''}` }, target, progress),
      h('p', { id: 'tutorial-hint', class: 'tutorial-hint' }, s.hint), form, feedback,
      h('div', { class: 'tutorial-keyboard', 'aria-label': copy('자판 안내', 'Keyboard guide') },
        h('div', { class: 'tutorial-keyboard-legend' }, copy('노랑: 다음 키 · 민트: 누른 키', 'Yellow: next key · Mint: pressed key')), keyboard.el), next);
    this.el.replaceChildren(
      this.header(),
      h('div', { class: 'tutorial-scene-caption' }, h('strong', {}, copy('한 글자씩, 차근차근!', 'One letter at a time!')), h('span', {}, copy('틀려도 괜찮아. 같이 해보자!', 'We can try again, together.'))), panel);
    paint();
    this.focusTimer = window.setTimeout(() => { if (input.isConnected && !input.disabled) input.focus(); }, 750);
  }
  protected onHide() { window.clearTimeout(this.focusTimer); }
}
