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
  private footGlow?: Phaser.GameObjects.Ellipse;
  private onFocus = (d: { index: number; then?: () => void }) => this.walkTo(d.index, d.then);

  constructor() {
    super('WorldMap');
  }

  create(data: { focusIndex?: number }) {
    addBackground(this, 'bg_world_map', { zoom: true });
    addAmbientSparkles(this, 0xffe59a, 0.8);
    this.drawPath(); // 점선 길: 캐릭터보다 아래(depth 1) 에 그린다
    this.drawVignette();
    const save = SaveSystem.get();
    const idx = Math.min(save.progress.unlockedStage, 5);
    const st = getStageByIndex(data.focusIndex ?? idx)!;
    this.player = new Player(this, st.map.x + 190, st.map.y + 50, getCharacter(save.profile.characterId).sheet, 0.75);
    this.player.idle('front');
    this.pet = new Pet(this, st.map.x + 270, st.map.y + 50, getPet(save.profile.petId).sheet, 0.4);
    this.player.setDepth(10);
    this.pet.setDepth(10);
    // 발밑 빛무리: 배경에 캐릭터가 묻히지 않게
    this.footGlow = this.add.ellipse(this.player.x, this.player.y + 6, 150, 46, 0xffe59a, 0.5).setDepth(9);
    this.tweens.add({ targets: this.footGlow, scaleX: 1.18, scaleY: 1.18, alpha: 0.32, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    EventBus.on(Events.MAP_FOCUS, this.onFocus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => EventBus.off(Events.MAP_FOCUS, this.onFocus));
    void AudioManager.bgm('map');
  }

  /** 스테이지 노드를 잇는 점선 길. DOM SVG 로 그리면 캐릭터를 덮어서 Phaser 로 그린다 */
  private drawPath() {
    const path = new Phaser.Curves.Path(STAGES[0].map.x + 60, STAGES[0].map.y + 30);
    for (let i = 1; i < STAGES.length; i++) {
      const p = STAGES[i - 1];
      const s = STAGES[i];
      path.quadraticBezierTo(s.map.x + 60, s.map.y + 30, (p.map.x + s.map.x) / 2 + 60, Math.min(p.map.y, s.map.y) - 30);
    }
    const pts = path.getPoints(220);
    const g = this.add.graphics().setDepth(1);
    // 은은한 바탕 빛 → 점 → 점 테두리 순으로
    g.lineStyle(24, 0xffe59a, 0.16);
    g.strokePoints(pts, false);
    for (let i = 0; i < pts.length; i += 5) {
      g.fillStyle(0x1a1f4a, 0.45);
      g.fillCircle(pts[i].x, pts[i].y, 6.5);
      g.fillStyle(0xfff2b0, 0.85);
      g.fillCircle(pts[i].x, pts[i].y, 4.5);
    }
  }

  /** 가장자리 비네트: 가운데 지도에 눈이 모이게 */
  private drawVignette() {
    const { width: w, height: hgt } = this.scale;
    const g = this.add.graphics().setDepth(2);
    const band = 150;
    for (let i = 0; i < band; i += 6) {
      const a = 0.5 * (1 - i / band) * 0.55;
      g.fillStyle(0x0b0e23, a);
      g.fillRect(0, i, w, 6);
      g.fillRect(0, hgt - i - 6, w, 6);
      g.fillRect(i, 0, 6, hgt);
      g.fillRect(w - i - 6, 0, 6, hgt);
    }
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
