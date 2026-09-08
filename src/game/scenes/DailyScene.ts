import Phaser from 'phaser';
import { addBackground, ensureParticleTextures, addAmbientSparkles, styleText } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { SaveSystem } from '../systems/SaveSystem';
import { getCharacter, getPet } from '../data/characters';
import { EventBus, Events } from '../EventBus';
import { AudioManager } from '../systems/AudioManager';
import { playClassFx } from './ClassFx';
import { DESIGN_W } from '../Game';

/** 오늘의 도전: 도서관에서 낱말 20개. 적 없이 글자가 날아가 빛으로 흩어진다. */
export class DailyScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private burst?: Phaser.GameObjects.Particles.ParticleEmitter;
  private cls = 'brown_boy';
  private handlers: [string, (...args: never[]) => void][] = [];

  constructor() {
    super('Daily');
  }

  create() {
    addBackground(this, 'bg_library', { zoom: true });
    addAmbientSparkles(this, 0xffe59a, 0.6);
    ensureParticleTextures(this);
    const save = SaveSystem.get();
    this.cls = save.profile.characterId;
    this.player = new Player(this, 560, 820, getCharacter(save.profile.characterId).sheet, 1.25);
    this.player.idle('right');
    this.player.setDepth(7);
    this.pet = new Pet(this, 390, 830, getPet(save.profile.petId).sheet, 0.62);
    this.pet.setDepth(6);
    this.add.text(DESIGN_W / 2, 150, '📅 오늘의 도전', styleText(56, '#ffd34d')).setOrigin(0.5).setDepth(10);
    this.burst = this.add.particles(0, 0, 'p_star', {
      lifespan: { min: 300, max: 700 }, speed: { min: 150, max: 400 }, scale: { start: 1.1, end: 0 }, gravityY: 300, emitting: false, blendMode: Phaser.BlendModes.ADD, tint: [0xffd34d, 0xfff2b0, 0x8fe0ff, 0xffffff],
    }).setDepth(20);
    this.bind(Events.SYLLABLE_HIT, () => { AudioManager.sfx('tap'); playClassFx(this, this.cls, 'weak', { x: 560, y: 820 }, { x: 1250, y: 620 }); });
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number; target: { text: string } }) => {
      AudioManager.sfx(d.perfect ? 'perfect' : 'hit', { rate: AudioManager.comboRate(d.combo) });
      this.player?.attack(() => {});
      this.pet?.cheer();
      playClassFx(this, this.cls, d.perfect ? 'perfect' : 'strong', { x: 560, y: 820 }, { x: 1250, y: 620 });
      const t = this.add.text(1250, 620, d.target.text, styleText(64, d.perfect ? '#ff7ab6' : '#fff2b0')).setOrigin(0.5).setDepth(21);
      this.tweens.add({ targets: t, y: 480, alpha: 0, scale: 1.4, duration: 700, onComplete: () => t.destroy() });
      this.burst?.explode(d.perfect ? 30 : 16, 1250, 620);
    });
    this.bind(Events.INPUT_WRONG, (d: { forgiven: boolean }) => { if (!d.forgiven) AudioManager.sfx('miss'); });
    this.bind(Events.STAGE_CLEAR, () => { this.player?.victory(); this.pet?.victory(); AudioManager.sfx('clear'); this.burst?.explode(60, 560, 620); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [ev, fn] of this.handlers) EventBus.off(ev, fn);
      this.handlers = [];
    });
    void AudioManager.bgm('map');
  }

  private bind<T>(ev: string, fn: (d: T) => void) {
    EventBus.on(ev, fn);
    this.handlers.push([ev, fn as (...args: never[]) => void]);
  }
}
