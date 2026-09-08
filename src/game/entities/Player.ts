import Phaser from 'phaser';
import { registerSheetAnims, anim, type Dir } from './anims';

/** 플레이어 캐릭터 (Phaser 스프라이트 래퍼). origin (0.5, 1) = 발 위치 */
export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  private scene: Phaser.Scene;
  private sheet: string;
  private bob?: Phaser.Tweens.Tween;
  private baseY: number;
  private baseScale: number;
  facing: Dir = 'front';
  busy = false;

  constructor(scene: Phaser.Scene, x: number, y: number, sheet: string, scale = 1) {
    this.scene = scene;
    this.sheet = sheet;
    this.baseY = y;
    this.baseScale = scale;
    registerSheetAnims(scene, sheet);
    this.shadow = scene.add.ellipse(x, y + 6, 150 * scale, 40 * scale, 0x000000, 0.28);
    this.sprite = scene.add.sprite(x, y, sheet, 'idle_front').setOrigin(0.5, 1).setScale(scale);
    this.startBob();
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }

  setSheet(sheet: string) {
    if (sheet === this.sheet) return;
    this.sheet = sheet;
    registerSheetAnims(this.scene, sheet);
    this.sprite.setTexture(sheet, `idle_${this.facing}`);
    this.sprite.anims.stop();
  }

  setPosition(x: number, y: number) {
    this.sprite.setPosition(x, y);
    this.shadow.setPosition(x, y + 6);
    this.baseY = y;
  }

  setDepth(d: number) {
    this.sprite.setDepth(d);
    this.shadow.setDepth(d - 1);
  }

  private startBob() {
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.bob = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: this.baseScale * 1.025,
      scaleX: this.baseScale * 0.985,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  idle(dir: Dir = this.facing) {
    this.facing = dir;
    this.sprite.anims.stop();
    this.sprite.setFrame(`idle_${dir}`);
    this.sprite.setFlipX(false);
    this.startBob();
  }

  walk(dir: Dir, run = false) {
    this.facing = dir;
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.setFlipX(false);
    this.sprite.play(anim(this.sheet, `${run ? 'run' : 'walk'}_${dir}`), true);
  }

  /** 공격: 앞으로 살짝 대시 + 공격 프레임. onHit 시점에 콜백 */
  attack(onHit: () => void, onDone?: () => void) {
    if (this.busy) {
      onHit();
      onDone?.();
      return;
    }
    this.busy = true;
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    const startX = this.sprite.x;
    const startSX = this.shadow.x;
    this.sprite.setFlipX(false);
    this.sprite.play(anim(this.sheet, 'attack'));
    this.scene.tweens.add({
      targets: [this.sprite],
      x: startX + 90,
      duration: 110,
      ease: 'Quad.easeOut',
      yoyo: true,
      hold: 160,
      onYoyo: () => onHit(),
      onComplete: () => {
        this.sprite.setX(startX);
        this.shadow.setX(startSX);
        this.busy = false;
        this.idle('right');
        onDone?.();
      },
    });
    this.scene.tweens.add({ targets: this.shadow, x: startSX + 90, duration: 110, yoyo: true, hold: 160 });
  }

  hit() {
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.play(anim(this.sheet, 'hit'));
    this.sprite.setTint(0xff6b6b);
    const x0 = this.sprite.x;
    this.scene.tweens.add({
      targets: this.sprite,
      x: x0 - 22,
      duration: 60,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.sprite.setX(x0);
        this.sprite.clearTint();
        if (!this.busy) this.idle('right');
      },
    });
  }

  victory() {
    this.busy = true;
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.setFlipX(false);
    this.sprite.play(anim(this.sheet, 'victory'));
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.baseY - 40,
      duration: 260,
      yoyo: true,
      repeat: 3,
      ease: 'Quad.easeOut',
    });
  }

  cheer() {
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.play(anim(this.sheet, 'cheer'));
  }

  destroy() {
    this.bob?.stop();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
