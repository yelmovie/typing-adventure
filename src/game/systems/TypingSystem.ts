/**
 * 한글 IME 입력 처리.
 *  - 실제 DOM <input> 사용. 게임 코드는 자모를 조합하지 않는다.
 *  - compositionstart/update 동안은 판정을 보류한다.
 *  - compositionend 이후 확정 문자열(NFC 정규화)로만 정답/오답을 판정한다.
 *  - Enter(문장/낱말) 또는 Space(낱말 모드)로 제출. 확정 문자열이 목표와 같으면 자동 제출.
 */
export interface TypingCallbacks {
  onChange?: (value: string, composing: boolean) => void;
  onSubmit: (value: string, meta: { usedBackspace: boolean }) => void;
  /** Tab 키: 어려운 낱말 점프 */
  onSkip?: () => void;
  /** Escape: 입력창에서 벗어나 잠시 멈추기 */
  onPause?: () => void;
  /** 방향키: 캐릭터 이동/점프/앉기 (left·right·up·down) */
  onMove?: (dir: 'left' | 'right' | 'up' | 'down', pressed: boolean) => void;
}

export class TypingSystem {
  readonly input: HTMLInputElement;
  private composing = false;
  private pendingSubmit = false;
  private usedBackspace = false;
  private target = '';
  private mode: 'word' | 'sentence' = 'word';
  private enabled = false;
  private cb: TypingCallbacks;
  private disposers: (() => void)[] = [];

  constructor(input: HTMLInputElement, cb: TypingCallbacks) {
    this.input = input;
    this.cb = cb;
    this.bind();
  }

  private bind() {
    const i = this.input;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      i.addEventListener(type, fn as EventListener);
      this.disposers.push(() => i.removeEventListener(type, fn as EventListener));
    };

    on('compositionstart', () => {
      this.composing = true;
    });
    on('compositionupdate', () => {
      this.composing = true;
      this.cb.onChange?.(this.value(), true);
    });
    on('compositionend', () => {
      this.composing = false;
      this.cb.onChange?.(this.value(), false);
      // Enter가 조합 중에 눌렸다면 조합 종료 후 제출
      if (this.pendingSubmit) {
        this.pendingSubmit = false;
        this.submit();
        return;
      }
      this.autoSubmitIfMatch();
    });
    on('input', (e) => {
      const ie = e as InputEvent;
      if (ie.inputType === 'deleteContentBackward' || ie.inputType === 'deleteContentForward') this.usedBackspace = true;
      const composing = this.composing || ie.isComposing === true;
      this.cb.onChange?.(this.value(), composing);
      if (!composing) this.autoSubmitIfMatch();
    });
    on('keydown', (e) => {
      if (!this.enabled) return;
      const ke = e as KeyboardEvent;
      const isComposingKey = ke.isComposing || ke.keyCode === 229;
      if (ke.key === 'Escape' && !isComposingKey && !this.composing) {
        ke.preventDefault();
        this.cb.onPause?.();
        return;
      }
      if (ke.key === 'Backspace') this.usedBackspace = true;
      if (ke.key.startsWith('Arrow')) {
        ke.preventDefault();
        this.cb.onMove?.(ke.key.slice(5).toLowerCase() as 'left' | 'right' | 'up' | 'down', true);
        return;
      }
      if (ke.key === 'Tab') {
        if (ke.shiftKey) return; // Shift+Tab은 일반 키보드 탐색으로 입력창에서 나갈 수 있다.
        ke.preventDefault();
        this.cb.onSkip?.();
        return;
      }
      if (ke.key === 'Enter' || (ke.key === ' ' && this.mode === 'word')) {
        ke.preventDefault();
        if (isComposingKey || this.composing) {
          // 조합 확정을 기다렸다가 compositionend에서 제출
          this.pendingSubmit = true;
          // 일부 브라우저는 Enter로 조합이 끝나도 compositionend를 늦게 보내므로 안전망
          window.setTimeout(() => {
            if (this.pendingSubmit && !this.composing) {
              this.pendingSubmit = false;
              this.submit();
            }
          }, 60);
        } else {
          this.submit();
        }
      }
    });
    on('keyup', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key.startsWith('Arrow')) {
        this.cb.onMove?.(ke.key.slice(5).toLowerCase() as 'left' | 'right' | 'up' | 'down', false);
      }
    });
    // 캔버스 클릭은 입력으로 돌아오되, 버튼·모달의 키보드 포커스를 빼앗지 않는다.
    on('blur', () => {
      if (this.enabled) window.setTimeout(() => {
        if (document.activeElement === document.body || document.activeElement?.tagName === 'CANVAS') this.focus();
      }, 10);
    });
  }

  /** 현재 입력 문자열 (NFC 정규화, 표시용) */
  value(): string {
    return this.input.value.normalize('NFC');
  }

  /** 판정용 문자열: 낱말 모드는 앞뒤 공백 제거, 문장 모드는 끝 공백만 제거 (IME가 남긴 공백 대비) */
  private committed(): string {
    const v = this.value();
    return this.mode === 'word' ? v.trim() : v.replace(/\s+$/, '');
  }

  setTarget(target: string, mode: 'word' | 'sentence') {
    this.target = target.normalize('NFC');
    this.mode = mode;
    this.input.value = '';
    this.composing = false;
    this.pendingSubmit = false;
    this.usedBackspace = false;
    this.cb.onChange?.('', false);
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    this.input.disabled = !v;
    if (v) this.focus();
  }

  focus() {
    if (!this.enabled || this.input.disabled || this.input.closest('[inert]')) return;
    if (document.activeElement !== this.input) this.input.focus({ preventScroll: true });
  }

  private autoSubmitIfMatch() {
    if (!this.enabled || this.composing) return;
    const v = this.committed();
    if (v.length > 0 && v === this.target) this.submit();
  }

  private submit() {
    if (!this.enabled) return;
    const v = this.committed();
    if (v.length === 0) return;
    const meta = { usedBackspace: this.usedBackspace };
    this.input.value = '';
    this.usedBackspace = false;
    this.cb.onSubmit(v, meta);
  }

  destroy() {
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}
