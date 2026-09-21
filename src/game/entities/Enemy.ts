import Phaser from 'phaser';
import { registerSheetAnims, anim, placeFeet } from './anims';
import { prefersReducedMotion } from '../scenes/common';

/** 몬스터: 오른쪽에서 플레이어를 바라본다 (좌측 방향 프레임 + 필요 시 flipX) */
export class Enemy {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  private scene: Phaser.Scene;
  private sheet: string;
  private bob?: Phaser.Tweens.Tween;
  private movement?: Phaser.Tweens.Tween;
  private tilt?: Phaser.Tweens.Tween;
  private timers = new Set<Phaser.Time.TimerEvent>();
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
    this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.alignFeet, this);
    this.startBob();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private startBob() {
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    placeFeet(this.sprite);
    if (prefersReducedMotion()) return;
    this.bob = this.scene.tweens.add({
      targets: this.sprite,
      originY: this.sprite.originY + 0.006,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private alignFeet() { if (this.sprite.active) placeFeet(this.sprite); }

  setDepth(d: number) {
    this.sprite.setDepth(d);
    this.shadow.setDepth(d - 1);
  }

  /** 오른쪽 화면 밖에서 걸어 들어오기 */
  enter(onDone?: () => void) {
    if (this.dead || !this.sprite.active) return;
    this.stopAction();
    this.sprite.setX(this.baseX + 500);
    this.shadow.setX(this.baseX + 500);
    this.sprite.setAlpha(0);
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.play(anim(this.sheet, 'walk_left'));
    this.movement = this.scene.tweens.add({
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
    if (this.dead || !this.sprite.active) return;
    this.sprite.anims.stop();
    this.sprite.setFlipX(false).setAngle(0);
    this.sprite.setFrame('idle_left');
    this.startBob();
  }

  /** 피격: 흰색 플래시 + 뒤로 밀림 + 흔들림 */
  hit(strong = false) {
    if (this.dead || !this.sprite.active) return;
    this.stopAction();
    this.sprite.setScale(this.baseScale);
    this.sprite.anims.stop();
    this.sprite.setFlipX(false);
    this.sprite.setFrame('hit');
    placeFeet(this.sprite);
    if (prefersReducedMotion()) this.sprite.setTint(0xffb1b1);
    else this.sprite.setTintFill(0xffffff);
    this.later(70, () => this.sprite.setTint(0xffb1b1));
    this.later(250, () => this.sprite.clearTint());
    const push = prefersReducedMotion() ? 0 : strong ? 40 : 18;
    this.movement = this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      x: this.baseX + push,
      duration: strong ? 110 : 85,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        this.sprite.setX(this.baseX);
        this.shadow.setX(this.baseX);
        if (!this.dead) this.idle();
      },
    });
    if (!prefersReducedMotion()) this.tilt = this.scene.tweens.add({ targets: this.sprite, angle: strong ? 3 : 1, duration: strong ? 110 : 85, yoyo: true, onComplete: () => this.sprite.setAngle(0) });
  }

  /** 공격 (오답 시 플레이어를 때림): 왼쪽으로 대시 */
  attack(onHit: () => void) {
    if (this.dead || !this.sprite.active) return;
    this.stopAction();
    this.sprite.setScale(this.baseScale);
    this.sprite.setFlipX(true); // 공격 프레임은 오른쪽을 향하므로 반전
    this.sprite.play(anim(this.sheet, 'attack'));
    this.movement = this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      x: this.baseX - (prefersReducedMotion() ? 0 : 65),
      duration: 140,
      ease: 'Quad.easeOut',
      yoyo: true,
      hold: 140,
      onYoyo: () => { if (!this.dead && this.sprite.active) onHit(); },
      onComplete: () => {
        this.sprite.setX(this.baseX);
        this.shadow.setX(this.baseX);
        if (!this.dead) this.idle();
      },
    });
  }

  /** 쓰러짐 → 소멸. 최종 보스는 전용 단계 시트를 선택적으로 사용한다. */
  defeat(onDone?: () => void, defeatAtlas?: string) {
    if (this.dead || !this.sprite.active) return;
    this.stopAction();
    this.dead = true;
    if (defeatAtlas && this.scene.textures.exists(defeatAtlas)) {
      this.playDefeatAtlas(defeatAtlas, onDone);
      return;
    }
    this.sprite.setScale(this.baseScale);
    this.sprite.setFlipX(false);
    this.sprite.anims.stop(); this.sprite.setFrame('hit');
    placeFeet(this.sprite);
    this.later(650, () => {
      if (!this.sprite.active) return;
      this.sprite.anims.stop();
      this.sprite.setFrame('victory'); // 몬스터 시트에서 마지막 프레임 = 쓰러짐/소멸
      this.movement = this.scene.tweens.add({
        targets: [this.sprite, this.shadow],
        alpha: 0,
        y: prefersReducedMotion() ? '+=0' : '+=20',
        duration: 700,
        delay: 350,
        ease: 'Quad.easeIn',
        onComplete: () => onDone?.(),
      });
    });
  }

  private playDefeatAtlas(atlas: string, onDone?: () => void) {
    const first = this.scene.textures.getFrame(atlas, 'defeat_0');
    const reference = this.scene.textures.getFrame(this.sheet, 'idle_left');
    if (!first || !reference) return;
    const scale = this.baseScale * reference.realHeight / Math.max(1, first.realHeight) * 0.9;
    const fadeOut = () => {
      if (!this.sprite.active) return;
      this.movement = this.scene.tweens.add({
        targets: [this.sprite, this.shadow],
        alpha: 0,
        duration: prefersReducedMotion() ? 220 : 360,
        ease: 'Sine.easeOut',
        onComplete: () => onDone?.(),
      });
    };
    this.sprite.anims.stop();
    this.sprite.setTexture(atlas, 'defeat_0').setOrigin(0.5, 1).setScale(scale).setFlipX(false).setAlpha(1);
    this.shadow.setAlpha(0.2);
    if (prefersReducedMotion()) {
      this.sprite.setFrame('defeat_5');
      this.later(520, fadeOut);
      return;
    }
    const key = `${atlas}:collapse`;
    if (!this.scene.anims.exists(key)) this.scene.anims.create({
      key,
      frames: [110, 150, 210, 180, 220, 360].map((duration, index) => ({ key: atlas, frame: `defeat_${index}`, duration })),
      frameRate: 12,
      repeat: 0,
    });
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, fadeOut);
    this.sprite.play(key);
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.stopAction();
    if (this.sprite.active) this.sprite.destroy();
    if (this.shadow.active) this.shadow.destroy();
  }

  private later(ms: number, callback: () => void) {
    const timer = this.scene.time.delayedCall(ms, () => {
      this.timers.delete(timer);
      if (this.sprite.active) callback();
    });
    this.timers.add(timer);
  }

  private stopAction() {
    this.bob?.stop(); this.movement?.stop(); this.tilt?.stop();
    for (const timer of this.timers) timer.remove();
    this.timers.clear();
    if (this.sprite.active) this.sprite.setX(this.baseX).setAngle(0).clearTint();
    if (this.shadow.active) this.shadow.setX(this.baseX);
  }
}
