import Phaser from 'phaser';
import type { ScreenName } from './types';
import { BootScene } from './scenes/BootScene';
import { HomeScene } from './scenes/HomeScene';
import { SetupScene } from './scenes/SetupScene';
import { WorldMapScene } from './scenes/WorldMapScene';
import { StageIntroScene, ensureScreenAssets } from './scenes/StageIntroScene';
import { ResultScene } from './scenes/ResultScene';
import { TutorialScene } from './scenes/TutorialScene';
import { WaveScene } from './scenes/WaveScene';
import { RaceScene } from './scenes/RaceScene';
import { LetterScene } from './scenes/LetterScene';
import { TrainScene } from './scenes/TrainScene';
import { BossScene } from './scenes/BossScene';
import { DailyScene } from './scenes/DailyScene';
import { getStage } from './data/stages';
import type { StageId, StageMode } from './types';
import { UIRoot } from './ui/UIRoot';
import { AudioManager } from './systems/AudioManager';
import { toast } from './ui/ModalController';
import { StagePractice } from './systems/StagePractice';
import { getLanguage } from './i18n/Locale';
import { assetFailureMessage } from './ui/assetFailureMessage';

import { DESIGN_W, DESIGN_H, setupUiScale } from './ui/Viewport';
export { DESIGN_W, DESIGN_H } from './ui/Viewport';

const SCENE_KEY: Record<ScreenName, string> = {
  home: 'Home',
  setup: 'Setup',
  tutorial: 'Tutorial',
  worldmap: 'WorldMap',
  intro: 'StageIntro',
  battle: 'Wave',
  result: 'Result',
};

const MODE_SCENE: Record<StageMode, string> = { wave: 'Wave', race: 'Race', letter: 'Letter', telegram: 'Train', boss: 'Boss', daily: 'Daily' };

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
    scene: [BootScene, HomeScene, SetupScene, TutorialScene, WorldMapScene, StageIntroScene, WaveScene, RaceScene, LetterScene, TrainScene, BossScene, DailyScene, ResultScene],
  });
  ui = new UIRoot();
  setupUiScale(() => game.scale.refresh());
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
  if (to === 'battle' && typeof data.stageId === 'string' && !StagePractice.ready(data.stageId as StageId, getLanguage(), !!data.remix)) {
    to = 'tutorial';
  }
  navigating = true;
  const firstScreen = current === null;
  // 새 화면이 보이기 시작해도 전환이 끝나기 전의 클릭은 받지 않는다.
  // 지도에서 이미 서 있는 지역을 누르면 이동 콜백이 동기 실행되기 때문이다.
  const stage = document.getElementById('ui-stage')!;
  stage.inert = !firstScreen || !document.querySelector('.opening-startup');
  stage.setAttribute('aria-busy', 'true');
  // Boot is not a user gesture. Start audio resources on the first real input.
  if (!firstScreen) AudioManager.unlock();
  try {
    try {
      await ensureScreenAssets(game.scene.getScene(currentKey || 'Boot'), to, data);
    } catch {
      toast(assetFailureMessage());
      return;
    }
    if (!firstScreen) await fade(true);
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
      key = MODE_SCENE[mode];
    }
    currentKey = key;
    game.scene.start(key, data);
    ui.show(to, data);
    await new Promise((r) => window.setTimeout(r, 60));
    if (!firstScreen) await fade(false);
  } finally {
    navigating = false;
    stage.inert = false;
    stage.removeAttribute('aria-busy');
  }
}
