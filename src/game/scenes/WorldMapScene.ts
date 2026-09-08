import Phaser from 'phaser';
import { addBackground, addAmbientSparkles } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { SaveSystem } from '../systems/SaveSystem';
import { getCharacter, getPet } from '../data/characters';
import { STAGES, getStageByIndex } from '../data/stages';
import { EventBus, Events } from '../EventBus';
import { AudioManager } from '../systems/AudioManager';

/** 월드맵: 배경 + 현재 위치에 서 있는 미니 캐릭터. 노드 UI는 DOM. */
export class WorldMapScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private onFocus = (d: { index: number; then?: () => void }) => this.walkTo(d.index, d.then);

  constructor() {
    super('WorldMap');
  }

  create(data: { focusIndex?: number }) {
    addBackground(this, 'bg_world_map', { zoom: true });
    addAmbientSparkles(this, 0xffe59a, 0.8);
    const save = SaveSystem.get();
    const idx = Math.min(save.progress.unlockedStage, 5);
    const st = getStageByIndex(data.focusIndex ?? idx)!;
    this.player = new Player(this, st.map.x + 190, st.map.y + 50, getCharacter(save.profile.characterId).sheet, 0.75);
    this.player.idle('front');
    this.pet = new Pet(this, st.map.x + 270, st.map.y + 50, getPet(save.profile.petId).sheet, 0.4);
    this.player.setDepth(10);
    this.pet.setDepth(10);

    EventBus.on(Events.MAP_FOCUS, this.onFocus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => EventBus.off(Events.MAP_FOCUS, this.onFocus));
    void AudioManager.bgm('map');
  }

  /** 노드 선택 시 캐릭터가 해당 노드로 걸어간다 */
  private walkTo(index: number, then?: () => void) {
    const st = STAGES.find((s) => s.index === index);
    if (!st || !this.player || !this.pet) return;
    const tx = st.map.x + 190;
    const ty = st.map.y + 50;
    const dx = tx - this.player.x;
    const dir = Math.abs(dx) > 40 ? (dx > 0 ? 'right' : 'left') : ty < this.player.y ? 'back' : 'front';
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, tx, ty);
    if (dist < 5) {
      then?.();
      return;
    }
    this.player.walk(dir, true);
    this.pet.walk(dir);
    const dur = Math.min(900, Math.max(250, dist * 1.1));
    this.tweens.add({ targets: [this.player.sprite, this.player.shadow], x: tx, y: ty, duration: dur, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: [this.pet.sprite, this.pet.shadow],
      x: tx + 80,
      y: ty,
      duration: dur,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.player?.setPosition(tx, ty);
        this.player?.idle('front');
        this.pet?.setPosition(tx + 80, ty);
        this.pet?.idle('right');
        then?.();
      },
    });
  }
}
