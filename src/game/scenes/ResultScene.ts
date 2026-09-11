import Phaser from 'phaser';
import { addBackground, ensureParticleTextures, prefersReducedMotion } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { SaveSystem } from '../systems/SaveSystem';
import { getCharacter, getPet } from '../data/characters';
import { getStage } from '../data/stages';
import type { BattleResult } from '../types';
import { DESIGN_W } from '../Game';
import { AudioManager } from '../systems/AudioManager';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: { result: BattleResult }) {
    const stage = getStage(data.result.stageId);
    addBackground(this, stage.bgBattle, { dim: 0.32 });
    const save = SaveSystem.get();
    // The DOM result panel starts at x=560. Keep the whole cast in the left alcove.
    const player = new Player(this, 240, 858, getCharacter(save.profile.characterId).sheet, 1.5);
    const pet = new Pet(this, 445, 870, getPet(save.profile.petId).sheet, 0.65);
    void AudioManager.bgm(data.result.cleared ? 'result' : 'map');
    if (data.result.cleared) {
      player.victory();
      pet.victory();
      ensureParticleTextures(this);
      // 색종이
      this.add.particles(0, -20, 'p_spark', {
        x: { min: 0, max: DESIGN_W },
        lifespan: 4200,
        speedY: { min: 120, max: 260 },
        speedX: { min: -40, max: 40 },
        rotate: { start: 0, end: 720 },
        scale: { min: 0.6, max: 1.3 },
        tint: [0xffd34d, 0x63e074, 0x4fc3f7, 0xff7ab6, 0xa78bfa, 0xffffff],
        frequency: 45,
        emitting: !prefersReducedMotion(),
        quantity: 1,
        gravityY: 60,
      });
    } else {
      player.hit();
      this.time.delayedCall(700, () => { player.sad(); pet.sad(); });
    }
  }
}
