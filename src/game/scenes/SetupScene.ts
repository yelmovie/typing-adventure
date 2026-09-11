import Phaser from 'phaser';
import { AudioManager } from '../systems/AudioManager';
import { addBackground, addAmbientSparkles, prefersReducedMotion } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { EventBus, Events } from '../EventBus';
import { getCharacter, getPet } from '../data/characters';
import { SaveSystem } from '../systems/SaveSystem';

/** 모험 준비 화면: 오른쪽에 선택한 캐릭터/펫 미리보기 */
export class SetupScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private partyGlow?: Phaser.GameObjects.Ellipse;
  private layoutPreview = () => {
    // On a short display, the name card sits above the party rather than its feet.
    const short = (window.visualViewport?.height ?? window.innerHeight) < 500;
    this.player?.setPosition(1560, short ? 900 : 810);
    this.pet?.setPosition(1760, short ? 920 : 825);
    this.partyGlow?.setPosition(1600, short ? 912 : 820);
  };
  private onPreview = (d: { characterId?: string; petId?: string }) => {
    if (d.characterId && this.player) {
      this.player.setSheet(getCharacter(d.characterId).sheet);
      this.player.idle('front');
      if (!prefersReducedMotion()) this.tweens.add({ targets: this.player.sprite, scaleX: 1.9, scaleY: 1.6, duration: 120, yoyo: true });
    }
    if (d.petId && this.pet) {
      this.pet.setSheet(getPet(d.petId).sheet);
      this.pet.idle('left');
      this.pet.cheer();
    }
  };

  constructor() {
    super('Setup');
  }

  create() {
    void AudioManager.bgm('home');
    addBackground(this, 'bg_adventure_room', { zoom: true });
    addAmbientSparkles(this, 0x8fe0ff, 0.8);
    const save = SaveSystem.get();
    this.player = new Player(this, 1560, 810, getCharacter(save.profile.characterId).sheet, 1.75);
    this.player.idle('front');
    this.pet = new Pet(this, 1760, 825, getPet(save.profile.petId).sheet, 0.85);
    this.pet.idle('left');
    // 바닥 글로우
    const glow = this.add.ellipse(1600, 820, 520, 120, 0xffe59a, 0.18);
    this.partyGlow = glow;
    if (!prefersReducedMotion()) this.tweens.add({ targets: glow, alpha: 0.32, duration: 1500, yoyo: true, repeat: -1 });
    glow.setDepth(-1);
    this.layoutPreview();
    window.addEventListener('resize', this.layoutPreview);
    window.visualViewport?.addEventListener('resize', this.layoutPreview);

    EventBus.on(Events.PREVIEW_CHANGED, this.onPreview);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off(Events.PREVIEW_CHANGED, this.onPreview);
      window.removeEventListener('resize', this.layoutPreview);
      window.visualViewport?.removeEventListener('resize', this.layoutPreview);
    });
  }
}
