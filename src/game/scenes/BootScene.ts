import Phaser from 'phaser';
import { CHARACTERS, PETS } from '../data/characters';
import { navigate } from '../Game';
import { SaveSystem } from '../systems/SaveSystem';
import { queueStageAssets } from './StageIntroScene';
import type { StageId } from '../types';

// 첫 화면~지도까지 쓰는 배경만. 스테이지 배경·몬스터·이펙트는 StageIntroScene.preload 에서 스테이지별로 지연 로딩.
const BACKGROUNDS = ['bg_main_gate', 'bg_adventure_room', 'bg_world_map', 'bg_library', 'bg_story_prologue', 'bg_story_ending'];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const fill = document.getElementById('loading-fill');
    const text = document.getElementById('loading-text');
    this.load.on('progress', (p: number) => {
      if (fill) fill.style.width = `${Math.round(p * 100)}%`;
      if (text) text.textContent = `모험 준비 중... ${Math.round(p * 100)}%`;
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn('[Boot] load error', file.key, file.url);
    });

    for (const bg of BACKGROUNDS) this.load.image(bg, `./assets/backgrounds/${bg}.webp`);
    for (const c of CHARACTERS) this.load.atlas(c.sheet, `./assets/sprites/${c.sheet}.webp`, `./assets/sprites/${c.sheet}.json`);
    for (const p of PETS) this.load.atlas(p.sheet, `./assets/sprites/${p.sheet}.webp`, `./assets/sprites/${p.sheet}.json`);
    // 점프·앉기 포즈는 모든 전투 씬이 방향키를 받으므로 여기서 한 번만 받는다
    this.load.atlas('char_poses', './assets/sprites/char_poses.webp', './assets/sprites/char_poses.json');
  }

  create() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('hide');
    // 개발용 바로가기: ?go=battle&stage=stage_1 / ?go=worldmap / ?go=intro&stage=stage_2
    const q = new URLSearchParams(location.search);
    const go = q.get('go');
    const stageId = (q.get('stage') ?? 'stage_1') as StageId;
    if (import.meta.env.DEV && go && SaveSystem.hasSave()) {
      if (go === 'battle') {
        // StageIntro 를 건너뛰므로 스테이지 에셋을 여기서 먼저 받는다
        queueStageAssets(this, stageId);
        this.load.once('complete', () => void navigate('battle', { stageId }));
        this.load.start();
        return;
      }
      if (go === 'intro') {
        void navigate(go, { stageId });
        return;
      }
      if (go === 'worldmap' || go === 'setup') {
        void navigate(go);
        return;
      }
    }
    void navigate('home');
  }
}
