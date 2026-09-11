import Phaser from 'phaser';
import { addBackground, addAmbientSparkles, prefersReducedMotion } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { SaveSystem } from '../systems/SaveSystem';
import { getCharacter, getPet } from '../data/characters';
import { AudioManager } from '../systems/AudioManager';
import { homeSheet } from '../data/homeAssets';

export class HomeScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;

  constructor() {
    super('Home');
  }

  create() {
    addBackground(this, 'bg_main_gate', { zoom: true });
    addAmbientSparkles(this, 0xffe59a, 1.4);

    const save = SaveSystem.get();
    const ch = getCharacter(save.profile.characterId);
    const pet = getPet(save.profile.petId);

    // 메인 캐릭터: 화면 중앙보다 약간 왼쪽, 문 앞
    this.player = new Player(this, 760, 985, homeSheet(ch.sheet), 1.75);
    this.player.idle('front');
    this.pet = new Pet(this, 950, 990, homeSheet(pet.sheet), 0.85);

    // 가끔 응원 동작
    if (prefersReducedMotion()) {
      this.player.sprite.anims.stop();
      this.pet.sprite.anims.stop();
    } else this.time.addEvent({
      delay: 4200,
      loop: true,
      callback: () => {
        this.player?.cheer();
        this.pet?.cheer();
        this.time.delayedCall(1600, () => this.player?.idle('front'));
      },
    });

    void AudioManager.bgm('home');
  }
}
