import Phaser from 'phaser';
import { addBackground, addAmbientSparkles } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { Enemy } from '../entities/Enemy';
import { SaveSystem } from '../systems/SaveSystem';
import { getCharacter, getPet } from '../data/characters';
import { getStage } from '../data/stages';
import { getEnemy } from '../data/enemies';
import type { StageId } from '../types';
import { AudioManager, STAGE_BGM } from '../systems/AudioManager';

const CLASS_FX: Record<string, string> = { brown_boy: 'fx_warrior', pink_girl: 'fx_mage', glasses_boy: 'fx_scholar', blond_explorer: 'fx_archer' };
const MODE_ATLAS: Record<string, string[]> = { wave: ['fx_gate'], telegram: ['fx_train_props'], boss: ['fx_crystals'], race: ['mon_shadow_chaser'] };
const MODE_BG: Record<string, string[]> = { boss: ['bg_bright_castle'] };

/** 스테이지 하나에 필요한 배경·몬스터·이펙트를 로더 큐에 넣는다 (이미 있으면 건너뜀). Boot 의 ?go=battle 바로가기도 같이 쓴다 */
export function queueStageAssets(scene: Phaser.Scene, stageId: StageId) {
  const stage = getStage(stageId);
  const cls = CLASS_FX[SaveSystem.get().profile.characterId] ?? 'fx_warrior';
  const bgs = [stage.bgIntro, stage.bgBattle, ...(MODE_BG[stage.mode] ?? [])];
  const atlases = [...stage.enemies.map((id) => getEnemy(id).sheet), ...(MODE_ATLAS[stage.mode] ?? []), cls];
  for (const bg of new Set(bgs)) if (!scene.textures.exists(bg)) scene.load.image(bg, `./assets/backgrounds/${bg}.webp`);
  for (const a of new Set(atlases)) if (!scene.textures.exists(a)) scene.load.atlas(a, `./assets/sprites/${a}.webp`, `./assets/sprites/${a}.json`);
}

/** 스테이지 소개: 캐릭터가 걸어 들어오고, 몬스터들이 저 멀리서 기다린다 */
export class StageIntroScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private enemies: Enemy[] = [];
  private stageId: StageId = 'stage_1';

  constructor() {
    super('StageIntro');
  }

  // Phaser 는 init/create 에만 data 를 넘기고 preload 에는 안 넘긴다
  init(data: { stageId: StageId }) {
    this.stageId = data.stageId;
  }

  preload() {
    queueStageAssets(this, this.stageId);
  }

  create(data: { stageId: StageId }) {
    const stage = getStage(data.stageId);
    addBackground(this, stage.bgIntro, { zoom: true });
    addAmbientSparkles(this, 0xbfffc8, 0.7);
    const save = SaveSystem.get();
    void AudioManager.bgm(STAGE_BGM[stage.id] ?? 'battle');

    this.player = new Player(this, 900, 900, getCharacter(save.profile.characterId).sheet, 1.35);
    this.player.walk('right', false);
    this.pet = new Pet(this, 1060, 910, getPet(save.profile.petId).sheet, 0.65);
    this.pet.walk('right');
    this.tweens.add({
      targets: [this.player.sprite, this.player.shadow, this.pet.sprite, this.pet.shadow],
      x: '+=260',
      duration: 1400,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.player?.setPosition(this.player.x, 900);
        this.player?.idle('right');
        this.pet?.setPosition(this.pet.sprite.x, 910);
        this.pet?.idle('right');
      },
    });

    // 몬스터 미리보기
    const unique = [...new Set(stage.enemies)];
    unique.forEach((id, i) => {
      const def = getEnemy(id);
      const e = new Enemy(this, 1500 + i * 220, 860 - i * 90, def.sheet, 1.05 * def.scale);
      e.sprite.setAlpha(0.95);
      this.enemies.push(e);
    });
  }
}
