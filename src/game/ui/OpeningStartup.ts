import { getLanguage } from '../i18n/Locale';
import { h } from '../util/dom';
import { createOpeningPlayer } from './OpeningPlayer';
import { markOpeningOffered } from './OpeningSession';

type RuntimeStarter = () => Promise<void>;

function showRuntimeFailure() {
  const loading = document.getElementById('loading');
  const message = document.getElementById('loading-text');
  loading?.classList.remove('hide');
  if (!message) return;
  const english = getLanguage() === 'en';
  const retry = h('button', {
    type: 'button',
    class: 'loading-retry',
    onclick: () => location.reload(),
  }, english ? 'Try again' : '다시 준비');
  message.replaceChildren(
    document.createTextNode(english ? 'The adventure could not start. Please try again. ' : '모험을 시작하지 못했어. 다시 준비해 줘. '),
    retry,
  );
}

/** Shows the lightweight opening before the Phaser runtime is downloaded. */
export function startOpening(startRuntime: RuntimeStarter) {
  markOpeningOffered();
  const root = document.getElementById('modal-root')!;
  const stage = document.getElementById('ui-stage')!;
  stage.classList.add('opening-active');
  let runtimeStarted = false;
  let player: ReturnType<typeof createOpeningPlayer>;
  let backdrop: HTMLElement;
  const beginRuntime = () => {
    if (runtimeStarted) return;
    runtimeStarted = true;
    void startRuntime().catch(() => {
      runtimeStarted = false;
      showRuntimeFailure();
    });
  };
  const finish = () => {
    beginRuntime();
    player.dispose();
    backdrop.remove();
    stage.classList.remove('opening-active');
  };
  player = createOpeningPlayer(finish);
  player.panel.classList.add('opening-startup');
  backdrop = h('div', { class: 'modal-backdrop finale-backdrop opening-backdrop' }, player.panel);
  root.append(backdrop);

  const video = player.panel.querySelector<HTMLVideoElement>('.opening-video')!;
  const frameVideo = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
  };
  video.addEventListener('playing', () => {
    if (frameVideo.requestVideoFrameCallback) frameVideo.requestVideoFrameCallback(() => beginRuntime());
    else video.addEventListener('timeupdate', beginRuntime, { once: true });
  }, { once: true });
  player.start();
  // 포스터를 보는 동안 게임 엔진과 홈 필수 에셋을 뒤에서 먼저 준비한다.
  // 인트로 영상은 사용자가 재생을 고를 때만 내려받는다.
  beginRuntime();
}
