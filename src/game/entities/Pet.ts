import Phaser from 'phaser';
import { registerSheetAnims, anim, placeFeet, playStride, type Dir } from './anims';
import { prefersReducedMotion } from '../scenes/common';

/** Travel is persistent: a celebration never sends a running pet back to idle. */
export class Pet {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  private scene: Phaser.Scene;
  private sheet: string;
  private facing: Dir = 'right';
  private motion: 'idle' | 'walk' | 'run' = 'idle';
  private pace = 1;
  private baseScale: number;
  private celebrateUntil = 0;
  private poseTimer?: Phaser.Time.TimerEvent;
  private finalPose = false;

  constructor(scene: Phaser.Scene, x: number, y: number, sheet: string, scale = 0.55) {
    this.scene = scene; this.sheet = sheet; this.baseScale = scale;
    registerSheetAnims(scene, sheet);
    this.shadow = scene.add.ellipse(x, y + 4, 120 * scale, 34 * scale, 0x000000, 0.25);
    this.sprite = scene.add.sprite(x, y, sheet, 'idle_right').setOrigin(0.5, 1).setScale(scale);
    placeFeet(this.sprite);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.updateMotion, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }
  setSheet(sheet: string) {
    if (sheet === this.sheet) return;
    this.sheet = sheet; registerSheetAnims(this.scene, sheet);
    this.sprite.anims.stop(); this.sprite.setTexture(sheet, `idle_${this.facing}`); this.resume();
  }
  setPosition(x: number, y: number) { this.sprite.setPosition(x, y); this.shadow.setPosition(x, y + 4); }
  setDepth(d: number) { this.sprite.setDepth(d); this.shadow.setDepth(d - 1); }
  idle(dir: Dir = 'right') { this.facing = dir; this.motion = 'idle'; this.resume(); }
  walk(dir: Dir, run = false) { this.facing = dir; this.motion = run ? 'run' : 'walk'; this.resume(); }
  run(dir: Dir = 'right') { this.walk(dir, true); }
  setRunPace(pace: number) { this.pace = Phaser.Math.Clamp(pace, 0.8, 1.45); if (this.motion !== 'idle') this.sprite.anims.timeScale = this.pace; }
  private resume() {
    if (this.finalPose || !this.sprite.active) return;
    this.sprite.setAngle(0).setFlipX(false);
    if (this.motion === 'idle') { this.sprite.anims.stop(); this.sprite.setTexture(this.sheet, `idle_${this.facing}`).setScale(this.baseScale); }
    else { playStride(this.scene, this.sprite, this.sheet, this.facing, this.motion === 'run', this.baseScale); this.sprite.anims.timeScale = this.pace; }
    placeFeet(this.sprite);
  }
  private updateMotion() {
    if (!this.sprite.active) return;
    const reduce = prefersReducedMotion();
    const cheering = !reduce && this.scene.time.now < this.celebrateUntil;
    // The stride contains its own rise and fall. A separate bob made paws float.
    const extra = cheering ? Math.sin((this.celebrateUntil - this.scene.time.now) / 420 * Math.PI) * 5 : 0;
    placeFeet(this.sprite, Math.max(0, extra));
  }
  cheer() {
    if (this.finalPose || this.scene.time.now < this.celebrateUntil) return;
    this.celebrateUntil = this.scene.time.now + 420;
    // Feet keep cycling while the pet follows. Stationary pets can face the player.
    if (this.motion === 'idle') {
      this.sprite.setTexture(this.sheet, 'cheer').setScale(this.baseScale);
      this.sprite.anims.timeScale = 1;
      this.sprite.play(anim(this.sheet, 'cheer'));
      this.poseTimer?.remove();
      this.poseTimer = this.scene.time.delayedCall(420, () => this.resume());
    }
  }
  skill() {
    if (this.finalPose) return;
    this.celebrateUntil = this.scene.time.now + 420;
    this.sprite.setTint(0xfff2b0);
    this.poseTimer?.remove();
    if (this.motion === 'idle') { this.sprite.setTexture(this.sheet, 'cheer').setScale(this.baseScale); this.sprite.anims.timeScale = 1; this.sprite.play(anim(this.sheet, 'cheer')); }
    this.poseTimer = this.scene.time.delayedCall(420, () => { if (this.sprite.active) { this.sprite.clearTint(); this.resume(); } });
  }
  victory() {
    this.finalPose = true; this.motion = 'idle'; this.poseTimer?.remove();
    this.sprite.setTexture(this.sheet, 'victory').setScale(this.baseScale).clearTint().setAngle(0).setFlipX(false);
    this.sprite.anims.timeScale = 1; this.sprite.play(anim(this.sheet, 'victory'));
    this.celebrateUntil = this.scene.time.now + 420;
  }
  sad() {
    this.finalPose = true; this.motion = 'idle'; this.poseTimer?.remove();
    this.celebrateUntil = 0; this.sprite.setTexture(this.sheet, 'hit').setScale(this.baseScale).clearTint().setFlipX(false);
    this.sprite.anims.stop(); this.sprite.setFrame('hit').setAngle(-4).setOrigin(0.5, 1);
  }
  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.updateMotion, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.poseTimer?.remove();
    if (this.sprite.active) this.sprite.destroy();
    if (this.shadow.active) this.shadow.destroy();
  }
}
