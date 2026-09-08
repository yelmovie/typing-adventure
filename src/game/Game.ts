import Phaser from 'phaser';
import type { ScreenName } from './types';
import { BootScene } from './scenes/BootScene';
import { HomeScene } from './scenes/HomeScene';
import { SetupScene } from './scenes/SetupScene';
import { WorldMapScene } from './scenes/WorldMapScene';
import { StageIntroScene } from './scenes/StageIntroScene';
import { BattleScene } from './scenes/BattleScene';
import { ResultScene } from './scenes/ResultScene';
import { WaveScene } from './scenes/WaveScene';
import { RaceScene } from './scenes/RaceScene';
import { LetterScene } from './scenes/LetterScene';
import { TrainScene } from './scenes/TrainScene';
import { BossScene } from './scenes/BossScene';
import { DailyScene } from './scenes/DailyScene';
import { getStage } from './data/stages';
import type { StageId } from './types';
import { UIRoot } from './ui/UIRoot';
import { AudioManager } from './systems/AudioManager';

export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

const SCENE_KEY: Record<ScreenName, string> = {
  home: 'Home',
  setup: 'Setup',
  worldmap: 'WorldMap',
  intro: 'StageIntro',
  battle: 'Battle',
  result: 'Result',
};

let game: Phaser.Game;
let ui: UIRoot;
let current: ScreenName | null = null;
let currentKey = '';
let navigating = false;

export function createGame(): Phaser.Game {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: DESIGN_W,
    height: DESIGN_H,
    backgroundColor: '#0e1233',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DESIGN_W,
      height: DESIGN_H,
    },
    render: { antialias: true, pixelArt: false, roundPixels: false },
    audio: { noAudio: true },
    // ?st=1 이면 RAF 대신 setTimeout 루프 (숨김 패널에서의 자동 테스트용)
    fps: { forceSetTimeOut: new URLSearchParams(location.search).has('st'), target: 60 },
    scene: [BootScene, HomeScene, SetupScene, WorldMapScene, StageIntroScene, BattleScene, WaveScene, RaceScene, LetterScene, TrainScene, BossScene, DailyScene, ResultScene],
  });
  ui = new UIRoot();
  setupUiScale();
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
  return game;
}

export function getGame() {
  return game;
}
export function getUI() {
  return ui;
}
export function currentScreen() {
  return current;
}

/** DOM UI 스테이지를 Phaser FIT 스케일과 동일하게 맞춘다 */
function setupUiScale() {
  const stage = document.getElementById('ui-stage')!;
  const viewport = document.getElementById('viewport')!;
  const apply = () => {
    // 소프트 키보드가 올라오면 visualViewport 가 줄어든다 → 남은 영역에 게임 전체를 맞춘다
    const vv = window.visualViewport;
    const w = vv?.width ?? window.innerWidth;
    const hgt = vv?.height ?? window.innerHeight;
    viewport.style.width = `${w}px`;
    viewport.style.height = `${hgt}px`;
    viewport.style.left = `${vv?.offsetLeft ?? 0}px`;
    viewport.style.top = `${vv?.offsetTop ?? 0}px`;
    const s = Math.min(w / DESIGN_W, hgt / DESIGN_H);
    const left = (w - DESIGN_W * s) / 2;
    const top = (hgt - DESIGN_H * s) / 2;
    stage.style.left = '0';
    stage.style.top = '0';
    stage.style.transform = `translate(${left}px, ${top}px) scale(${s})`;
    // 작은 태블릿(아이패드 1024px 등)에선 잔글씨가 8px 대로 줄어 → compact(배율 0.72 미만, 1280×800 포함) 로 잔글씨·터치 요소를 키운다
    stage.classList.toggle('compact', s < 0.72);
    game?.scale.refresh();
  };
  apply();
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 50));
}

const fadeEl = () => document.getElementById('fade')!;

function fade(on: boolean): Promise<void> {
  return new Promise((resolve) => {
    const el = fadeEl();
    el.classList.toggle('on', on);
    window.setTimeout(resolve, 300);
  });
}

/** 화면 전환: Phaser 씬 + DOM 스크린 동시 교체 */
export async function navigate(to: ScreenName, data: Record<string, unknown> = {}) {
  if (navigating) return;
  navigating = true;
  AudioManager.unlock();
  await fade(true);
  if (current) {
    ui.hide(current);
    const prev = game.scene.getScene(currentKey);
    if (prev && game.scene.isActive(currentKey)) game.scene.stop(currentKey);
  }
  current = to;
  // 전투 화면은 스테이지 모드마다 Phaser 씬이 다르다 (DOM 스크린은 공통 BattleScreen)
  let key = SCENE_KEY[to];
  if (to === 'battle' && typeof data.stageId === 'string') {
    const mode = getStage(data.stageId as StageId).mode;
    if (mode === 'wave') key = 'Wave';
    else if (mode === 'race') key = 'Race';
    else if (mode === 'letter') key = 'Letter';
    else if (mode === 'telegram') key = 'Train';
    else if (mode === 'boss') key = 'Boss';
    else if (mode === 'daily') key = 'Daily';
  }
  currentKey = key;
  game.scene.start(key, data);
  ui.show(to, data);
  await new Promise((r) => window.setTimeout(r, 60));
  await fade(false);
  navigating = false;
}
