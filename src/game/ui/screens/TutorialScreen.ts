import { Screen } from '../Screen';
import { h } from '../../util/dom';
import { characterStoryStep, practiceAccuracy, practiceCpmFromStrokes, practiceInputStats, TutorialSystem, tutorialSteps } from '../../systems/TutorialSystem';
import { getLanguage } from '../../i18n/Locale';
import { SaveSystem } from '../../systems/SaveSystem';
import { AudioManager } from '../../systems/AudioManager';
import { navigate } from '../../Game';
import { EventBus } from '../../EventBus';
import { TUTORIAL_FEEDBACK, TUTORIAL_STEP } from '../../scenes/TutorialScene';
import { countStrokes, diffChars } from '../../util/hangul';
import { KeyboardGuide } from '../KeyboardGuide';
import { StagePractice, practicedParts, PRACTICE_PARTS, PART_LABELS, type PracticePart } from '../../systems/StagePractice';
import { characterPracticeStories } from '../../data/practiceSentences';
import { getCharacter, portraitUrl } from '../../data/characters';

interface TutorialData { next?: 'home' | 'worldmap' }
const copy = (ko: string, en: string) => getLanguage() === 'en' ? en : ko;

export class TutorialScreen extends Screen<TutorialData> {
  private model!: TutorialSystem;
  private data: TutorialData = {};
  private focusTimer?: number;
  private speedTimer?: number;
  private paintFrame?: number;
  private speedStartedAt = 0;
  private completedStrokes = 0;
  private wrongStrokes = 0;
  private currentTargetErrors = 0;
  private completedParts = new Set<PracticePart>();
  private selectedStoryIndex?: number;
  constructor() { super('tutorial'); }
  protected render(data: TutorialData) {
    this.data = data;
    this.completedParts = new Set(practicedParts(SaveSystem.get().progress));
    this.el.setAttribute('data-no-translate', 'true');
    this.drawMenu();
  }
  private drawMenu() {
    window.clearTimeout(this.focusTimer);
    this.stopPaint();
    this.stopSpeed();
    this.el.classList.remove('practice-active');
    const lessons = tutorialSteps(getLanguage());
    this.el.replaceChildren(
      this.header(),
      h('section', { class: 'tutorial-panel tutorial-menu' },
        h('h1', {}, copy('타이핑 연습 선택', 'Choose typing practice')),
        h('p', { class: 'tutorial-instruction' }, copy('모험 입장과 관계없이 원하는 연습만 골라요.', 'Choose any practice you want. Practice is optional and never blocks the adventure.')),
        h('div', { class: 'tutorial-part-grid' }, lessons.map((lesson, i) => h('button', {
          class: 'btn btn-sky tutorial-part-card', 'data-part': lesson.part, onclick: () => lesson.part === 'story' ? this.drawStoryMenu() : this.startLesson(lesson.part),
        }, h('strong', {}, `${i + 1}. ${PART_LABELS[lesson.part][getLanguage() === 'en' ? 1 : 0]}`),
        h('span', {}, lesson.part === 'story'
          ? getLanguage() === 'ko' ? '긴 글 4편 · 각 1,000자 내외' : '4 character stories'
          : `${lesson.targets.length}${copy('개', ' targets')}`),
        h('small', {}, lesson.part === 'story'
          ? copy(`${StagePractice.completedStories(getLanguage()).length}/4편 완성 · 골라서 연습`, `${StagePractice.completedStories(getLanguage()).length}/4 complete · Choose one`)
          : this.completedParts.has(lesson.part) ? copy('연습 완료 · 다시 연습', 'Complete · Practice again') : lesson.part === 'vowels' ? copy('이중모음 포함', 'All vowels') : lesson.part === 'consonants' ? copy('쌍자음 포함', 'All consonants') : copy('띄어쓰기와 문장부호까지', 'Spaces and punctuation'))))),
        h('p', { class: 'tutorial-hint' }, copy('연습 기록은 저장되지만, 모험 스테이지는 언제든 바로 시작할 수 있어요.', 'Practice progress is saved, but every available adventure stage starts right away.'))));
  }
  private startLesson(part: PracticePart, storyIndex?: number) {
    this.speedStartedAt = 0;
    this.completedStrokes = 0;
    this.wrongStrokes = 0;
    this.currentTargetErrors = 0;
    this.selectedStoryIndex = storyIndex;
    const language = getLanguage();
    const source = storyIndex == null ? tutorialSteps(language) : [characterStoryStep(language, storyIndex)];
    this.model = new TutorialSystem(language, [part], false, source);
    this.draw();
  }
  private drawStoryMenu() {
    window.clearTimeout(this.focusTimer);
    this.stopPaint();
    this.stopSpeed();
    this.el.classList.remove('practice-active');
    const language = getLanguage();
    const completed = new Set(StagePractice.completedStories(language));
    const stories = characterPracticeStories(language);
    this.el.replaceChildren(
      this.header(),
      h('section', { class: 'tutorial-panel tutorial-menu tutorial-story-menu' },
        h('button', { type: 'button', class: 'btn btn-gray btn-sm tutorial-story-back', onclick: () => this.drawMenu() }, copy('← 연습 목록', '← Practice list')),
        h('h1', {}, copy('어떤 일기를 써 볼까요?', 'Choose a diary to write')),
        h('p', { class: 'tutorial-instruction' }, copy('한 편을 고르면 두 줄 정도씩 보여 줘요. 완성한 일기는 그림 일기장으로 다시 볼 수 있어요.', 'Choose one story. You will type about two lines at a time, then unlock the finished diary page.')),
        h('div', { class: 'tutorial-story-grid' }, stories.map((story, index) => {
          const done = completed.has(index);
          const character = getCharacter(story.characterId);
          return h('article', { class: `tutorial-story-card${done ? ' complete' : ''}`, 'data-story': story.id },
            h('img', { src: portraitUrl(character.sheet), alt: '', class: 'tutorial-story-portrait' }),
            h('div', { class: 'tutorial-story-copy' },
              h('span', { class: 'tutorial-story-state' }, done ? copy('✓ 일기 완성', '✓ Diary complete') : copy('아직 쓰는 중', 'Ready to write')),
              h('h2', {}, story.title),
              h('p', {}, story.summary)),
            h('div', { class: 'tutorial-story-actions' },
              h('button', { type: 'button', class: 'btn btn-sky tutorial-story-start', onclick: () => this.startLesson('story', index) }, done ? copy('다시 쓰기', 'Write again') : copy('이 일기 쓰기', 'Write this diary')),
              done ? h('button', { type: 'button', class: 'btn btn-gray tutorial-story-open', onclick: () => this.showDiary(index) }, copy('일기장 보기', 'View diary')) : null));
        })),
      ),
    );
  }
  private showDiary(storyIndex: number, justCompleted = false) {
    this.stopPaint();
    this.stopSpeed();
    this.selectedStoryIndex = storyIndex;
    this.el.classList.add('practice-active');
    const story = characterPracticeStories(getLanguage())[storyIndex];
    this.el.replaceChildren(
      this.header(),
      h('section', { class: 'tutorial-panel tutorial-diary-view' },
        h('div', { class: 'tutorial-diary-heading' },
          h('span', { class: 'tutorial-story-state' }, justCompleted ? copy('새 일기 완성!', 'New diary complete!') : copy('완성한 일기', 'Completed diary')),
          h('h1', {}, story.title),
          h('p', {}, copy('내가 정확히 입력한 글이 한 장의 일기장이 되었어요.', 'The story you typed is now a finished diary page.'))),
        h('img', { class: 'tutorial-diary-image', src: story.diaryImage, alt: story.title }),
        h('div', { class: 'tutorial-diary-actions' },
          h('button', { type: 'button', class: 'btn btn-gray', onclick: () => this.drawStoryMenu() }, copy('다른 일기 고르기', 'Choose another diary')),
          h('button', { type: 'button', class: 'btn btn-sky', onclick: () => this.startLesson('story', storyIndex) }, copy('다시 써 보기', 'Write it again')))),
    );
  }
  private leave() {
    void navigate(this.data.next ?? 'home');
  }
  private header() {
    return h('header', { class: 'tutorial-header' },
      h('span', {}, copy('타이핑 연습', 'Typing practice')),
      h('div', { class: 'tutorial-header-actions' },
        h('button', { type: 'button', class: 'btn btn-gray tutorial-leave', onclick: () => this.leave() }, copy('나가기', 'Leave'))));
  }
  private draw() {
    window.clearTimeout(this.focusTimer);
    this.stopPaint();
    this.el.classList.add('practice-active');
    const m = this.model, s = m.step;
    const partIndex = PRACTICE_PARTS.indexOf(s.part);
    const keyboard = new KeyboardGuide({ embedded: true });
    const progress = h('span', { class: 'tutorial-item-progress' });
    const speedValue = h('strong', { class: 'tutorial-speed-value', 'aria-live': 'polite' }, '0');
    const elapsedValue = h('strong', { class: 'tutorial-metric-value' }, '00:00');
    const accuracyValue = h('strong', { class: 'tutorial-metric-value' }, '100%');
    const speed = h('div', { class: 'tutorial-metrics', role: 'status', 'aria-label': copy('나의 타자 통계', 'My typing statistics') },
      h('div', { class: 'tutorial-speed' },
        h('span', { class: 'tutorial-speed-label' }, copy('나의 타수', 'MY SPEED')),
        h('span', { class: 'tutorial-speed-number' }, speedValue, h('small', {}, copy('타/분', 'keys/min')))),
      h('div', { class: 'tutorial-metric' }, h('span', {}, copy('진행 시간', 'TIME')), elapsedValue),
      h('div', { class: 'tutorial-metric' }, h('span', {}, copy('정확도', 'ACCURACY')), accuracyValue));
    EventBus.emit(TUTORIAL_STEP, partIndex);
    const title = h('h1', { id: 'tutorial-title' }, s.title);
    const target = h('div', { class: 'tutorial-target', 'aria-label': copy('입력할 글자', 'Text to type'), 'data-target': m.target });
    let targetNodes: HTMLElement[] = [];
    const bindTarget = () => {
      target.dataset.target = m.target;
      targetNodes = [...m.target].map(ch => h('span', { class: 'todo' }, ch));
      target.replaceChildren(...targetNodes);
    };
    bindTarget();
    const longForm = s.part === 'story';
    const input = h(longForm ? 'textarea' : 'input', { id: 'tutorial-input', type: longForm ? undefined : 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-labelledby': 'tutorial-title', 'aria-describedby': 'tutorial-hint tutorial-feedback', maxlength: longForm ? 1600 : 100, value: s.prefill ?? '', lang: getLanguage(), rows: longForm ? 5 : undefined }) as HTMLInputElement | HTMLTextAreaElement;
    const feedback = h('p', { id: 'tutorial-feedback', class: 'tutorial-feedback', role: 'status', 'aria-live': 'polite' });
    const send = h('button', { class: 'btn btn-primary', type: 'submit' }, copy('보내기', 'Send'), h('kbd', {}, 'Enter'));
    const next = h('button', { class: 'btn btn-primary tutorial-next', type: 'button', hidden: true, onclick: () => {
      if (m.complete) {
        this.drawMenu();
      } else if (m.next()) this.draw();
    } }, copy('다음 파트 연습 →', 'Next practice part →'));
    let composing = false;
    let liveCorrectStrokes = 0;
    let liveErrorStrokes = 0;
    const updateSpeed = () => {
      const elapsedMs = this.speedStartedAt ? performance.now() - this.speedStartedAt : 0;
      speedValue.textContent = this.speedStartedAt
        ? String(practiceCpmFromStrokes(this.completedStrokes + liveCorrectStrokes, elapsedMs)) : '0';
      const elapsedSec = Math.floor(elapsedMs / 1000);
      elapsedValue.textContent = `${String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:${String(elapsedSec % 60).padStart(2, '0')}`;
      const correct = this.completedStrokes + liveCorrectStrokes;
      accuracyValue.textContent = `${practiceAccuracy(correct, this.wrongStrokes + Math.max(this.currentTargetErrors, liveErrorStrokes)).toFixed(1)}%`;
    };
    const beginSpeed = () => {
      if (this.speedStartedAt || !input.value.normalize('NFC')) return;
      this.speedStartedAt = performance.now();
      window.clearInterval(this.speedTimer);
      this.speedTimer = window.setInterval(updateSpeed, 250);
    };
    const paint = () => {
      const normalized = input.value.normalize('NFC');
      if (target.dataset.target !== m.target) bindTarget();
      const stats = practiceInputStats(m.target, normalized);
      liveCorrectStrokes = stats.correctStrokes;
      liveErrorStrokes = stats.errorStrokes;
      if (!composing) this.currentTargetErrors = Math.max(this.currentTargetErrors, liveErrorStrokes);
      const parts = diffChars(m.target, normalized);
      for (let index = 0; index < targetNodes.length; index++) {
        const state = parts[index]?.state ?? 'todo';
        if (targetNodes[index].className !== state) targetNodes[index].className = state;
      }
      keyboard.update(m.target, normalized);
      progress.textContent = `${m.targetIndex + 1} / ${s.targets.length}`;
    };
    const schedulePaint = () => {
      if (this.paintFrame) return;
      this.paintFrame = window.requestAnimationFrame(() => {
        this.paintFrame = undefined;
        if (!input.isConnected) return;
        paint();
        updateSpeed();
      });
    };
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; beginSpeed(); schedulePaint(); });
    input.addEventListener('input', () => { beginSpeed(); schedulePaint(); });
    input.addEventListener('keydown', e => {
      const keyEvent = e as KeyboardEvent;
      keyboard.setPressed(keyEvent.code, true);
      if (keyEvent.key === 'Enter' && (keyEvent.isComposing || composing || keyEvent.keyCode === 229)) keyEvent.preventDefault();
      else if (longForm && keyEvent.key === 'Enter') { keyEvent.preventDefault(); form.requestSubmit(); }
    });
    input.addEventListener('keyup', e => keyboard.setPressed((e as KeyboardEvent).code, false));
    input.addEventListener('blur', () => keyboard.clearPressed());
    const form = h('form', { class: 'tutorial-form' }, h('label', { for: 'tutorial-input' }, copy('여기에 입력해요', 'Type here')), input, send);
    form.addEventListener('submit', e => {
      e.preventDefault(); if (composing) return;
      const submittedTarget = m.target;
      paint();
      const outcome = m.submit(input.value);
      if (outcome === 'ignored') return;
      if (outcome === 'wrong') {
        this.currentTargetErrors = Math.max(1, this.currentTargetErrors);
        target.dataset.target = m.target; paint();
        feedback.textContent = s.resetOnMistake
          ? copy('괜찮아요! 첫 낱말부터 다시 두 번 이어서 성공해 봐요.', 'That is okay! Start with the first word and try two correct words in a row.')
          : copy('아직 조금 달라요. 위 글자를 보고 Backspace로 고쳐 봐요.', 'Almost! Check the target and use Backspace to fix it.');
        input.setAttribute('aria-invalid', 'true'); input.focus(); return;
      }
      input.removeAttribute('aria-invalid');
      this.completedStrokes += countStrokes(submittedTarget);
      this.wrongStrokes += this.currentTargetErrors;
      this.currentTargetErrors = 0;
      AudioManager.sfx('perfect');
      EventBus.emit(TUTORIAL_FEEDBACK, { step: partIndex, completed: m.stepComplete });
      if (outcome === 'correct') {
        input.value = ''; target.dataset.target = m.target; paint(); input.focus();
        feedback.textContent = s.part === 'story'
          ? copy(`좋아요! ${m.targetIndex}쪽까지 썼어요. 다음 두 줄도 이어 가요.`, `Great! ${m.targetIndex} sections done. Keep the diary going.`)
          : copy(`좋아요! ${m.targetIndex}개 성공. 다음도 써 볼까요?`, 'One down! Send the next word.');
      } else {
        input.value = '';
        input.disabled = true; send.disabled = true; next.hidden = false;
        updateSpeed();
        window.clearInterval(this.speedTimer);
        this.speedTimer = undefined;
        feedback.textContent = s.success;
        this.el.querySelector(`[data-step="${m.stepIndex}"]`)?.classList.add('done');
        if (s.part === 'story' && this.selectedStoryIndex != null) {
          StagePractice.completeStory(this.selectedStoryIndex, getLanguage());
          this.completedParts = new Set(practicedParts(SaveSystem.get().progress));
          this.showDiary(this.selectedStoryIndex, true);
          return;
        }
        this.completedParts.add(s.part);
        StagePractice.completePart(s.part, getLanguage());
        if (m.complete) {
          next.textContent = copy('다른 파트 고르기 →', 'Choose another part →');
          feedback.textContent += copy(' 원하는 연습을 더 고르거나 홈으로 돌아갈 수 있어요.', ' Choose another practice or return home.');
        }
        next.focus();
      }
    });
    const panel = h('section', { class: `tutorial-panel tutorial-practice${longForm ? ' tutorial-longform' : ''}`, 'aria-labelledby': 'tutorial-title' },
      h('div', { class: 'tutorial-status-row' },
        h('div', { class: 'tutorial-eyebrow' }, copy('자유 연습', 'FREE PRACTICE'), h('span', {}, `${m.stepIndex + 1} / ${m.steps.length}`)), speed),
      m.steps.length > 1 ? h('ol', { class: 'tutorial-steps', 'aria-label': copy('연습 파트', 'Practice parts') }, m.steps.map((step, i) => h('li', { class: i < m.stepIndex ? 'done' : i === m.stepIndex ? 'active' : '', 'data-step': i, 'aria-current': i === m.stepIndex ? 'step' : 'false', title: step.title }, String(PRACTICE_PARTS.indexOf(step.part) + 1)))) : null,
      title, h('p', { class: 'tutorial-instruction' }, s.instruction),
      h('div', { class: `tutorial-target-wrap${partIndex >= 2 ? ' tutorial-prose' : ''}` }, target, progress),
      h('p', { id: 'tutorial-hint', class: 'tutorial-hint' }, s.hint), form, feedback,
      h('div', { class: 'tutorial-keyboard', 'aria-label': copy('자판 안내', 'Keyboard guide') },
        h('div', { class: 'tutorial-keyboard-legend' }, copy('노랑: 다음 키 · 민트: 누른 키', 'Yellow: next key · Mint: pressed key')), keyboard.el), next);
    this.el.replaceChildren(
      this.header(),
      h('div', { class: 'tutorial-scene-caption' }, h('strong', {}, copy('한 글자씩, 차근차근!', 'One letter at a time!')), h('span', {}, copy('빛의 문자를 함께 되찾아 보자!', 'Let us recover the letters of light!'))), panel);
    paint();
    this.focusTimer = window.setTimeout(() => { if (input.isConnected && !input.disabled) input.focus(); }, 750);
  }
  private stopSpeed() {
    window.clearInterval(this.speedTimer);
    this.speedTimer = undefined;
    this.speedStartedAt = 0;
    this.completedStrokes = 0;
    this.wrongStrokes = 0;
    this.currentTargetErrors = 0;
  }
  private stopPaint() {
    if (this.paintFrame) window.cancelAnimationFrame(this.paintFrame);
    this.paintFrame = undefined;
  }
  protected onHide() { window.clearTimeout(this.focusTimer); this.stopPaint(); this.stopSpeed(); }
}
