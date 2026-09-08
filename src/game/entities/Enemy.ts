import Phaser from 'phaser';
import { registerSheetAnims, anim } from './anims';

/** 몬스터: 오른쪽에서 플레이어를 바라본다 (좌측 방향 프레임 + 필요 시 flipX) */
export class Enemy {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  private scene: Phaser.Scene;
  private sheet: string;
  private bob?: Phaser.Tweens.Tween;
  private baseX: number;
  private baseScale: number;
  dead = false;

  constructor(scene: Phaser.Scene, x: number, y: number, sheet: string, scale = 1) {
    this.scene = scene;
    this.sheet = sheet;
    this.baseX = x;
    this.baseScale = scale;
    registerSheetAnims(scene, sheet);
    this.shadow = scene.add.ellipse(x, y + 6, 170 * scale, 44 * scale, 0x000000, 0.3);
    this.sprite = scene.add.sprite(x, y, sheet, 'idle_left').setOrigin(0.5, 1).setScale(scale);
    this.startBob();
  }

  private startBob() {
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.bob = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: this.baseScale * 1.05,
      scaleX: this.baseScale * 0.97,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  setDepth(d: number) {
    this.sprite.setDepth(d);
    this.shadow.setDepth(d - 1);
  }

  /** 오른쪽 화면 밖에서 걸어 들어오기 */
  enter(onDone?: () => void) {
    this.sprite.setX(this.baseX + 500);
    this.shadow.setX(this.baseX + 500);
    this.sprite.setAlpha(0);
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.play(anim(this.sheet, 'walk_left'));
    this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      x: this.baseX,
      alpha: 1,
      duration: 900,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.idle();
        onDone?.();
      },
    });
  }

  idle() {
    if (this.dead) return;
    this.sprite.anims.stop();
    this.sprite.setFlipX(false);
    this.sprite.setFrame('idle_left');
    this.startBob();
  }

  /** 피격: 흰색 플래시 + 뒤로 밀림 + 흔들림 */
  hit(strong = false) {
    if (this.dead) return;
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.anims.stop();
    this.sprite.setFlipX(false);
    this.sprite.setFrame('hit');
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.sprite.setTint(0xff7070));
    this.scene.time.delayedCall(200, () => this.sprite.clearTint());
    const push = strong ? 70 : 40;
    this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      x: this.baseX + push,
      duration: 90,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        this.sprite.setX(this.baseX);
        this.shadow.setX(this.baseX);
        if (!this.dead) this.idle();
      },
    });
    this.scene.tweens.add({ targets: this.sprite, angle: strong ? 8 : 5, duration: 50, yoyo: true, repeat: 3, onComplete: () => this.sprite.setAngle(0) });
  }

  /** 공격 (오답 시 플레이어를 때림): 왼쪽으로 대시 */
  attack(onHit: () => void) {
    if (this.dead) return;
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.setFlipX(true); // 공격 프레임은 오른쪽을 향하므로 반전
    this.sprite.play(anim(this.sheet, 'attack'));
    this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      x: this.baseX - 120,
      duration: 140,
      ease: 'Quad.easeOut',
      yoyo: true,
      hold: 140,
      onYoyo: () => onHit(),
      onComplete: () => {
        this.sprite.setX(this.baseX);
        this.shadow.setX(this.baseX);
        if (!this.dead) this.idle();
      },
    });
  }

  /** 쓰러짐 → 소멸 */
  defeat(onDone?: () => void) {
    this.dead = true;
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.setFlipX(false);
    this.sprite.play(anim(this.sheet, 'dizzy'));
    this.scene.time.delayedCall(650, () => {
      if (!this.sprite.active) return;
      this.sprite.anims.stop();
      this.sprite.setFrame('victory'); // 몬스터 시트에서 마지막 프레임 = 쓰러짐/소멸
      this.scene.tweens.add({
        targets: [this.sprite, this.shadow],
        alpha: 0,
        y: '+=30',
        duration: 700,
        delay: 350,
        ease: 'Quad.easeIn',
        onComplete: () => onDone?.(),
      });
    });
  }

  destroy() {
    this.bob?.stop();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
