import Phaser from 'phaser';
import { registerSheetAnims, anim, type Dir } from './anims';

/** 펫: 플레이어 옆에서 통통 뛰며 응원 */
export class Pet {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  private scene: Phaser.Scene;
  private sheet: string;
  private hop?: Phaser.Tweens.Tween;
  private baseY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, sheet: string, scale = 0.55) {
    this.scene = scene;
    this.sheet = sheet;
    this.baseY = y;
    registerSheetAnims(scene, sheet);
    this.shadow = scene.add.ellipse(x, y + 4, 120 * scale, 34 * scale, 0x000000, 0.25);
    this.sprite = scene.add.sprite(x, y, sheet, 'idle_right').setOrigin(0.5, 1).setScale(scale);
    this.startHop();
  }

  setSheet(sheet: string) {
    if (sheet === this.sheet) return;
    this.sheet = sheet;
    registerSheetAnims(this.scene, sheet);
    this.sprite.anims.stop();
    this.sprite.setTexture(sheet, 'idle_right');
  }

  setPosition(x: number, y: number) {
    this.sprite.setPosition(x, y);
    this.shadow.setPosition(x, y + 4);
    this.baseY = y;
    this.startHop();
  }

  setDepth(d: number) {
    this.sprite.setDepth(d);
    this.shadow.setDepth(d - 1);
  }

  idle(dir: Dir = 'right') {
    this.sprite.anims.stop();
    this.sprite.setFrame(`idle_${dir}`);
  }

  walk(dir: Dir) {
    this.sprite.play(anim(this.sheet, `walk_${dir}`), true);
  }

  private startHop() {
    this.hop?.stop();
    this.sprite.setY(this.baseY);
    this.hop = this.scene.tweens.add({
      targets: this.sprite,
      y: this.baseY - 14,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Quad.easeOut',
      hold: 380,
    });
  }

  cheer() {
    this.sprite.play(anim(this.sheet, 'cheer'));
    this.scene.tweens.add({ targets: this.sprite, y: this.baseY - 40, duration: 220, yoyo: true, repeat: 2 });
    this.scene.time.delayedCall(1500, () => {
      if (this.sprite.active) this.idle('right');
    });
  }

  /** 스킬 발동: 크게 두 번 뛰고 반짝 */
  skill() {
    this.hop?.stop();
    this.sprite.play(anim(this.sheet, 'cheer'));
    this.scene.tweens.add({ targets: this.sprite, y: this.baseY - 90, duration: 200, yoyo: true, repeat: 1, ease: 'Quad.easeOut', onComplete: () => { this.startHop(); this.idle('right'); } });
    this.scene.tweens.add({ targets: this.sprite, scaleX: this.sprite.scaleX * 1.25, scaleY: this.sprite.scaleY * 1.25, duration: 200, yoyo: true, repeat: 1 });
  }

  victory() {
    this.sprite.play(anim(this.sheet, 'victory'));
    this.hop?.stop();
    this.scene.tweens.add({ targets: this.sprite, y: this.baseY - 50, duration: 260, yoyo: true, repeat: -1 });
  }

  /** 실패 화면: 시무룩 */
  sad() {
    this.hop?.stop();
    this.sprite.anims.stop();
    this.sprite.setFrame('hit');
    this.scene.tweens.add({ targets: this.sprite, angle: -8, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  destroy() {
    this.hop?.stop();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
