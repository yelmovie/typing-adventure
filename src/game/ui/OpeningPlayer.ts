import { h } from '../util/dom';
import { getLanguage } from '../i18n/Locale';

const VIDEO_URL = './assets/video/intro-v1.mp4';
const POSTER_URL = './assets/video/intro-poster-v1.webp';
const BUFFER_TIMEOUT_MS = 15_000;

/** Page-opening film. Its only destination is the home already underneath it. */
export function createOpeningPlayer(onFinished: () => void) {
  const english = getLanguage() === 'en';
  const text = (ko: string, en: string) => english ? en : ko;
  const events = new AbortController();
  let disposed = false;
  let started = false;
  let finished = false;
  let failed = false;
  let bufferTimer: number | undefined;
  let background: HTMLElement | null = null;
  let previousInert = false;

  const video = h('video', {
    class: 'finale-video opening-video', poster: POSTER_URL, preload: 'none',
    playsinline: true, muted: true, 'aria-hidden': 'true',
  });
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  const status = h('p', { class: 'opening-status', role: 'status' }, text('8초 인트로 · 소리 없이 재생돼요.', '8-second intro · plays without sound.'));
  const playback = h('button', { class: 'btn btn-sky btn-md opening-playback', type: 'button' }, text('영상 재생', 'Play intro'));
  const skip = h('button', { class: 'btn btn-gold btn-lg opening-skip', type: 'button' }, text('건너뛰기', 'Skip intro'));
  const panel = h('section', {
    class: 'finale-player opening-player', role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': 'opening-title', 'aria-describedby': 'opening-description',
    'data-no-translate': 'true',
  }, video,
    h('p', { id: 'opening-description', class: 'finale-sr-only' }, text('타이핑 어드벤처의 8초 인트로 영상이에요. 끝나거나 건너뛰면 홈 화면으로 돌아가요.', 'An eight-second introduction to Typing Adventure. When it ends, or you skip it, the home screen appears.')),
    h('div', { class: 'opening-controls' },
      h('div', { class: 'opening-message' }, h('h2', { id: 'opening-title' }, text('모험이 시작돼요', 'Your adventure begins')), status),
      h('div', { class: 'opening-actions' }, playback, skip)),
  );
  const clearBufferTimer = () => { window.clearTimeout(bufferTimer); bufferTimer = undefined; };
  const finish = () => {
    if (disposed || finished) return;
    finished = true;
    clearBufferTimer();
    onFinished();
  };
  const unavailable = () => {
    if (disposed || finished) return;
    failed = true;
    clearBufferTimer();
    video.pause();
    playback.textContent = text('다시 재생', 'Try again');
    status.textContent = text('영상을 불러오지 못했어요. 다시 재생하거나 건너뛸 수 있어요.', 'The video could not load. Try again or skip to home.');
  };
  const waitForVideo = () => {
    clearBufferTimer();
    bufferTimer = window.setTimeout(unavailable, BUFFER_TIMEOUT_MS);
  };
  const play = async () => {
    if (disposed || finished) return;
    const retry = failed;
    failed = false;
    if (!video.getAttribute('src') || video.error || retry) {
      video.preload = 'auto';
      video.src = VIDEO_URL;
      video.load();
    }
    status.textContent = text('모험의 첫 장면을 준비하고 있어요…', 'Preparing the opening scene…');
    waitForVideo();
    try { await video.play(); }
    catch (error) {
      if (disposed || finished) return;
      clearBufferTimer();
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        playback.textContent = text('영상 재생', 'Play intro');
        status.textContent = text('영상 재생을 누르거나 바로 건너뛸 수 있어요.', 'Press Play intro, or skip straight to home.');
      } else if (!(error instanceof DOMException && error.name === 'AbortError')) unavailable();
    }
  };
  const listen = <K extends keyof HTMLMediaElementEventMap>(type: K, callback: () => void) => {
    video.addEventListener(type, callback, { signal: events.signal });
  };
  listen('playing', () => {
    if (disposed || finished) return;
    failed = false;
    clearBufferTimer();
    playback.textContent = text('일시정지', 'Pause');
    status.textContent = text('8초 인트로 · 소리 없이 재생돼요.', '8-second intro · plays without sound.');
  });
  listen('pause', () => {
    clearBufferTimer();
    if (disposed || finished || failed || video.ended) return;
    playback.textContent = text('이어서 재생', 'Resume');
    status.textContent = text('잠시 멈췄어요. 준비되면 이어서 볼 수 있어요.', 'Paused. Continue when you are ready.');
  });
  listen('waiting', () => { if (!video.paused && !failed) waitForVideo(); });
  listen('ended', finish);
  listen('error', unavailable);
  playback.addEventListener('click', () => { if (video.paused) void play(); else video.pause(); }, { signal: events.signal });
  skip.addEventListener('click', finish, { signal: events.signal });
  document.addEventListener('keydown', event => {
    if (disposed || !panel.isConnected) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
    else if (event.key === 'Tab') {
      if (!panel.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? skip : playback).focus(); }
      else if (event.shiftKey && document.activeElement === playback) { event.preventDefault(); skip.focus(); }
      else if (!event.shiftKey && document.activeElement === skip) { event.preventDefault(); playback.focus(); }
    }
  }, { signal: events.signal, capture: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !video.paused) video.pause(); }, { signal: events.signal });

  return {
    panel,
    start() {
      if (disposed || started) return;
      started = true;
      background = document.getElementById('ui-root');
      previousInert = background?.inert ?? false;
      if (background) background.inert = true;
      skip.focus();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
        status.textContent = text('원하면 영상을 재생하거나 바로 건너뛸 수 있어요.', 'Play the intro if you like, or skip straight to home.');
      } else void play();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      events.abort();
      clearBufferTimer();
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (background) background.inert = previousInert;
    },
  };
}
