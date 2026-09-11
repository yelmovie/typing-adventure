import Phaser from 'phaser';
import { addBackground, ensureParticleTextures, prefersReducedMotion } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { getCharacter, getPet } from '../data/characters';
import { SaveSystem } from '../systems/SaveSystem';
import { EventBus } from '../EventBus';
import { AudioManager } from '../systems/AudioManager';

export const TUTORIAL_FEEDBACK = 'TUTORIAL_FEEDBACK';
export const TUTORIAL_STEP = 'TUTORIAL_STEP';
export class TutorialScene extends Phaser.Scene {
  constructor() { super('Tutorial'); }
  create() {
    addBackground(this, 'bg_practice_forest', { dim: 0.3 });
    ensureParticleTextures(this);
    const { profile } = SaveSystem.get();
    const player = new Player(this, 335, 790, getCharacter(profile.characterId).sheet, 1.45);
    const pet = new Pet(this, 555, 800, getPet(profile.petId).sheet, 0.76);
    player.idle('right'); pet.idle('right');
    const stars = Array.from({ length: 4 }, (_, i) => this.add.image(200 + i * 140, 405, 'p_star').setScale(2.3).setTint(0xa9bedc).setAlpha(0.38));
    const feedback = ({ step, completed }: { step: number; completed: boolean }) => {
      if (completed) stars[step]?.setTint(0xffdf82).setAlpha(1);
      pet.cheer();
      if (!prefersReducedMotion()) {
        const spark = this.add.image(player.x + 60, 660, 'p_star').setScale(1.5).setTint(0xffe59a);
        this.tweens.add({ targets: spark, x: stars[step].x, y: 405, scale: 0.4, duration: 450, ease: 'Sine.easeOut', onComplete: () => spark.destroy() });
      }
    };
    EventBus.on(TUTORIAL_FEEDBACK, feedback);
    const stepChanged = (step: number) => {
      if (step === 3) { player.walk('right', true); pet.walk('right', true); }
      else { player.idle('right'); pet.idle('right'); }
    };
    EventBus.on(TUTORIAL_STEP, stepChanged);
    this.events.once('shutdown', () => { EventBus.off(TUTORIAL_FEEDBACK, feedback); EventBus.off(TUTORIAL_STEP, stepChanged); });
    void AudioManager.bgm('home');
  }
}
