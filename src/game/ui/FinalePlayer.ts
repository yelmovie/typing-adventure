import { h } from '../util/dom';
import { getLanguage } from '../i18n/Locale';
import { SaveSystem } from '../systems/SaveSystem';
import { characterName, getCharacter, getPet } from '../data/characters';
import { finaleSprite } from './FinaleCast';

const VIDEO_URL = './assets/video/finale-v1.mp4';
const POSTER_URL = './assets/video/finale-poster-v1.webp';
const BUFFER_TIMEOUT_MS = 15_000;

/** 완주 축하 영상. 완료·건너뛰기는 인증서로, 외부 닫기는 자원 정리만 한다. */
export function createFinalePlayer(name: string, onFinished: () => void) {
  const events = new AbortController();
  const language = getLanguage();
  const copy = (ko: string, en: string) => language === 'en' ? en : ko;
  const profile = SaveSystem.get().profile;
  const hero = getCharacter(profile.characterId);
  const pet = getPet(profile.petId);
  const heroName = characterName(hero.id, language);
  const petName = language === 'en'
    ? ({ cat: 'Cat', rabbit: 'Rabbit', dragon: 'Baby Dragon', squirrel: 'Squirrel' }[pet.id] ?? 'Companion')
    : ({ cat: '고양이', rabbit: '토끼', dragon: '아기 드래곤', squirrel: '다람쥐' }[pet.id] ?? pet.name);
  let disposed = false;
  let finished = false;
  let bufferTimer: number | undefined;
  let previousInert = false;
  let background: HTMLElement | null = null;

  const video = h('video', {
    class: 'finale-video', poster: POSTER_URL, preload: 'none',
    playsinline: true, muted: true, 'aria-hidden': 'true',
  });
  video.muted = true;
  video.playsInline = true;

  const status = h('p', { class: 'finale-status', role: 'status' }, copy('영상이 끝나면 나의 인증서가 열려요.', 'Your certificate opens after the video.'));
  const playback = h('button', { class: 'btn btn-sky btn-md', type: 'button' }, copy('영상 재생', 'Play video'));
  const skip = h('button', { class: 'btn btn-gold btn-lg', type: 'button' }, copy('인증서 바로 보기', 'See certificate'));
  const panel = h('section', {
    class: 'finale-player', role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': 'finale-title', 'aria-describedby': 'finale-description',
    'data-no-translate': 'true',
  },
  h('p', { id: 'finale-description', class: 'finale-sr-only' },
    copy(`${heroName}, ${petName}와 함께 모험을 마쳤어요. 하늘과 고양이가 보내는 8초 축하 영상 뒤 인증서로 이동해요.`,
      `You finished the adventure with ${heroName} and ${petName}. Haneul and Cat send an eight-second celebration video before your certificate.`)),
  h('header', { class: 'finale-heading' },
    h('p', { class: 'finale-eyebrow' }, copy('다섯 지역을 밝힌 나의 모험', 'MY FIVE-REGION ADVENTURE')),
    h('h2', { id: 'finale-title' }, copy(`${name || '모험가'}, 해냈어요!`, `${name || 'Adventurer'}, you did it!`))),
  h('div', { class: 'finale-celebration' },
    h('div', { class: 'finale-cast' },
      h('div', { class: 'finale-cast-actors' },
        finaleSprite(hero.sheet, heroName, 'hero', events.signal),
        finaleSprite(pet.sheet, petName, 'pet', events.signal)),
      h('p', { class: 'finale-cast-label' }, `${heroName} & ${petName}`)),
    h('figure', { class: 'finale-film' }, video,
      h('figcaption', { class: 'finale-film-caption' }, copy('하늘과 고양이가 보내는 축하 영상', 'A celebration from Haneul and Cat')))),
  h('div', { class: 'finale-footer' },
    status,
    h('div', { class: 'finale-actions' }, playback, skip)),
  );

  const clearBufferTimer = () => {
    window.clearTimeout(bufferTimer);
    bufferTimer = undefined;
  };
  const finish = () => {
    if (disposed || finished) return;
    finished = true;
    clearBufferTimer();
    onFinished();
  };
  const waitForVideo = () => {
    clearBufferTimer();
    bufferTimer = window.setTimeout(finish, BUFFER_TIMEOUT_MS);
  };
  const play = async () => {
    if (disposed || finished) return;
    if (!video.getAttribute('src')) {
      video.preload = 'auto';
      video.src = VIDEO_URL;
    }
    status.textContent = copy('마지막 모험의 순간을 준비하고 있어요…', 'Getting your celebration ready…');
    waitForVideo();
    try {
      await video.play();
    } catch (error) {
      if (disposed || finished) return;
      clearBufferTimer();
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        playback.textContent = copy('영상 재생', 'Play video');
        status.textContent = copy('영상 재생을 누르거나 인증서를 바로 볼 수 있어요.', 'Play the video or see your certificate now.');
      } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
        finish();
      }
    }
  };
  const listen = <K extends keyof HTMLMediaElementEventMap>(type: K, callback: () => void) => {
    video.addEventListener(type, callback, { signal: events.signal });
  };
  listen('playing', () => {
    clearBufferTimer();
    panel.classList.remove('is-paused');
    playback.textContent = copy('일시정지', 'Pause');
    status.textContent = copy('영상이 끝나면 나의 인증서가 열려요.', 'Your certificate opens after the video.');
  });
  listen('pause', () => {
    clearBufferTimer();
    panel.classList.add('is-paused');
    playback.textContent = copy('이어서 재생', 'Resume');
    status.textContent = copy('잠시 멈췄어요. 준비되면 이어서 볼 수 있어요.', 'Paused. Continue when you are ready.');
  });
  listen('waiting', waitForVideo);
  listen('ended', finish);
  listen('error', finish);
  playback.addEventListener('click', () => {
    if (video.paused) void play();
    else video.pause();
  }, { signal: events.signal });
  skip.addEventListener('click', finish, { signal: events.signal });
  document.addEventListener('keydown', (event) => {
    if (disposed || !panel.isConnected) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish();
    } else if (event.key === 'Tab') {
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? skip : playback).focus();
      } else if (event.shiftKey && document.activeElement === playback) {
        event.preventDefault();
        skip.focus();
      } else if (!event.shiftKey && document.activeElement === skip) {
        event.preventDefault();
        playback.focus();
      }
    }
  }, { signal: events.signal, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !video.paused) video.pause();
  }, { signal: events.signal });

  return {
    panel,
    start() {
      background = document.getElementById('ui-root');
      previousInert = background?.inert ?? false;
      if (background) background.inert = true;
      skip.focus();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        status.textContent = copy('원하면 영상을 재생하거나 인증서를 바로 볼 수 있어요.', 'Play the video or see your certificate now.');
      } else {
        void play();
      }
    },
    dispose() {
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
