import Phaser from 'phaser';
import { registerSheetAnims, anim, placeFeet, placeSideIdle, playStride, motionMetadata, hasKoreanAttackFrames, KOREAN_ATTACK_ATLAS, STRIDE_PACE, type Dir } from './anims';
import { prefersReducedMotion } from '../scenes/common';
import { getLanguage } from '../i18n/Locale';

const POSE_ROW: Record<string, number> = { char_brown_boy: 0, char_pink_girl: 1, char_glasses_boy: 2, char_blond_explorer: 3 };
const POSE_SCALE = 0.8;

/** Foot position belongs to the scene; locomotion only offsets the drawn origin. */
export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  private scene: Phaser.Scene;
  private sheet: string;
  private baseY: number;
  private baseScale: number;
  private motion: 'idle' | 'walk' | 'run' = 'idle';
  private cadence = 1;
  private strideRate = 1;
  private suspendedStride?: number;
  private feedbackUntil = 0;
  private feedbackDuration = 180;
  private lean = { x: 0 };
  /** Forward tilt (degrees) while running; rotates about the feet so contact never moves. */
  private runLean = 0;
  /** Stride frame/scale held while the dash pose shows; the stride is paused, never restarted. */
  private burstFrame?: Phaser.Animations.AnimationFrame;
  private burstScale = 1;
  private burstTimer?: Phaser.Time.TimerEvent;
  private finalPose = false;
  private action: 'jab' | 'attack' | undefined;
  private hitTimer?: Phaser.Time.TimerEvent;
  private callbacks = new Set<Phaser.Time.TimerEvent>();
  private idleTimer?: Phaser.Time.TimerEvent;
  private poseTimer?: Phaser.Time.TimerEvent;
  private moveTween?: Phaser.Tweens.Tween;
  private hopTween?: Phaser.Tweens.Tween;
  private poseRow = -1;
  private lastJab = -1000;
  facing: Dir = 'front';
  busy = false;
  /** Continuous-travel scenes restore running after an action. */
  walking = false;
  jumping = false;
  crouching = false;

  constructor(scene: Phaser.Scene, x: number, y: number, sheet: string, scale = 1) {
    this.scene = scene;
    this.sheet = sheet;
    this.baseY = y;
    this.baseScale = scale;
    registerSheetAnims(scene, sheet);
    this.poseRow = POSE_ROW[sheet] ?? -1;
    this.shadow = scene.add.ellipse(x, y + 6, 150 * scale, 40 * scale, 0x000000, 0.28);
    this.sprite = scene.add.sprite(x, y, sheet, 'idle_front').setOrigin(0.5, 1).setScale(scale);
    placeFeet(this.sprite);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.updateMotion, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  setSheet(sheet: string) {
    if (sheet === this.sheet) return;
    this.sheet = sheet;
    this.poseRow = POSE_ROW[sheet] ?? -1;
    registerSheetAnims(this.scene, sheet);
    this.sprite.anims.stop();
    this.sprite.setTexture(sheet, `idle_${this.facing}`);
    if (this.motion !== 'idle') this.walk(this.facing, this.motion === 'run');
    else this.idle();
  }
  setPosition(x: number, y: number) {
    this.sprite.setPosition(x, y);
    this.shadow.setPosition(x, y + 6);
    this.baseY = y;
  }
  setDepth(d: number) { this.sprite.setDepth(d); this.shadow.setDepth(d - 1); }

  /** Authored strides already lift the body; do not add an unrelated bob clock. */
  private updateMotion() {
    if (!this.sprite.active) return;
    const blocked = this.busy || this.jumping || this.crouching || prefersReducedMotion();
    const remaining = Math.max(0, this.feedbackUntil - this.scene.time.now);
    const boost = blocked ? 0 : Math.sin(remaining / this.feedbackDuration * Math.PI) * 2;
    placeFeet(this.sprite, boost, this.lean.x);
  }

  setRunPace(pace: number) {
    this.cadence = Phaser.Math.Clamp(pace, STRIDE_PACE.min, STRIDE_PACE.max);
    if (this.motion !== 'idle') this.sprite.anims.timeScale = this.cadence * this.strideRate;
  }
  /** Running lean in degrees (0 = upright). Applied only while a stride plays. */
  setRunLean(deg: number) {
    this.runLean = Phaser.Math.Clamp(deg, 0, 14);
    if (this.motion === 'run' && !this.busy && !this.jumping && !this.crouching) this.sprite.setAngle(this.leanAngle());
  }
  private leanAngle() {
    return this.motion === 'run' ? (this.facing === 'left' ? -this.runLean : this.runLean) : 0;
  }
  /**
   * Word-completion / TURBO burst while travelling: hold the dash pose for a moment.
   * The stride is paused on its current step and resumed from it, so no cycle restarts.
   */
  burst(ms = 200) {
    if (this.finalPose || !this.sprite.active || this.busy || this.jumping || this.crouching) return;
    if (this.motion === 'idle' && !this.walking) { this.dash(ms); return; }
    if (!this.burstFrame) {
      const current = this.sprite.anims.currentFrame;
      if (!current || !this.sprite.anims.isPlaying) return;
      this.burstFrame = current;
      this.burstScale = this.sprite.scaleX;
      this.sprite.anims.pause();
    }
    this.sprite.setTexture(this.sheet, 'dash').setScale(this.baseScale).setFlipX(this.facing === 'left').setAngle(this.leanAngle());
    placeFeet(this.sprite, 0, this.lean.x);
    this.burstTimer?.remove();
    this.burstTimer = this.scene.time.delayedCall(ms, () => this.endBurst());
  }
  private endBurst() {
    const frame = this.burstFrame;
    if (!frame) return;
    this.burstFrame = undefined;
    this.burstTimer?.remove();
    if (!this.sprite.active) return;
    this.sprite.setScale(this.burstScale);
    this.sprite.anims.resume(frame);
    this.sprite.setAngle(this.leanAngle());
    placeFeet(this.sprite, 0, this.lean.x);
  }
  strideFeedback() {
    if (this.scene.time.now < this.feedbackUntil) return;
    this.feedbackDuration = 180;
    this.feedbackUntil = this.scene.time.now + this.feedbackDuration;
  }

  idle(dir: Dir = this.facing) {
    this.facing = dir;
    if (this.walking) { this.walk(dir, true); return; }
    this.endBurst();
    this.ensureSheet();
    this.motion = 'idle';
    this.suspendedStride = undefined;
    this.sprite.anims.stop();
    this.sprite.setAngle(0);
    if (!placeSideIdle(this.scene, this.sprite, this.sheet, dir, this.baseScale)) {
      this.sprite.setFrame(`idle_${dir}`).setFlipX(false).setScale(this.baseScale);
    }
    placeFeet(this.sprite);
  }

  setLively(on: boolean) {
    this.idleTimer?.remove();
    if (!on || prefersReducedMotion()) return;
    this.idleTimer = this.scene.time.addEvent({ delay: 4300, loop: true, callback: () => {
      if (!this.sprite.active || this.busy || this.jumping || this.crouching || this.motion !== 'idle') return;
      if (this.facing !== 'front') return;
      this.sprite.setFrame('cheer');
      this.later(500, () => { if (!this.busy && !this.jumping && !this.crouching && this.motion === 'idle') this.idle(this.facing); });
    } });
  }

  dash(ms = 600) {
    if (this.motion !== 'idle' || this.walking) { this.burst(Math.min(ms, 420)); return; }
    if (this.busy || this.jumping || this.crouching) return;
    this.ensureSheet();
    this.sprite.anims.stop();
    this.sprite.setFrame('dash');
    this.poseTimer?.remove();
    this.poseTimer = this.scene.time.delayedCall(ms, () => { if (this.sprite.active && !this.busy) this.idle(); });
  }

  sad() {
    this.finishActions(); this.finalPose = true;
    this.ensureSheet(); this.busy = true; this.motion = 'idle';
    this.sprite.anims.stop();
    this.sprite.setScale(this.baseScale).setFrame('hit').setAngle(-4).setOrigin(0.5, 1);
  }

  walk(dir: Dir, run = false) {
    if (this.finalPose || !this.sprite.active) return;
    this.endBurst();
    this.facing = dir;
    this.motion = run || this.walking ? 'run' : 'walk';
    this.strideRate = playStride(this.scene, this.sprite, this.sheet, dir, this.motion === 'run', this.baseScale);
    this.sprite.setAngle(this.leanAngle());
    this.sprite.anims.timeScale = this.cadence * this.strideRate;
    if (this.suspendedStride !== undefined) {
      this.sprite.anims.setProgress(this.suspendedStride);
      this.suspendedStride = undefined;
      placeFeet(this.sprite);
    }
  }

  /** Keep travel cadence intact; combat callbacks retain their impact timing. */
  attack(onHit: () => void, onDone?: () => void) {
    if (this.finalPose || !this.sprite.active) return;
    if (this.action === 'jab') { this.poseTimer?.remove(); this.busy = false; }
    if (this.busy) { this.later(110, onHit); if (onDone) this.later(380, onDone); return; }
    if (this.walking || this.motion !== 'idle' || this.jumping || this.crouching) {
      this.strideFeedback();
      this.later(110, onHit);
      if (onDone) this.later(380, onDone);
      return;
    }
    this.busy = true; this.action = 'attack';
    this.poseTimer?.remove();
    this.playAttack();
    this.moveTween?.stop(); this.lean.x = 0;
    this.moveTween = this.scene.tweens.add({ targets: this.lean, x: prefersReducedMotion() ? 0 : 18, duration: 110, yoyo: true, hold: 160, ease: 'Sine.easeInOut',
      onComplete: () => { this.lean.x = 0; } });
    this.later(110, onHit);
    this.poseTimer = this.scene.time.delayedCall(380, () => {
      if (!this.sprite.active || this.finalPose) return;
      this.busy = false; this.action = undefined; this.idle(); onDone?.();
    });
  }

  hit() {
    if (!this.sprite.active) return;
    this.sprite.setTint(0xffa0a0);
    if (!this.busy && !this.jumping && !this.crouching && this.motion === 'idle' && !this.walking) {
      this.ensureSheet(); this.sprite.play(anim(this.sheet, 'hit'));
    }
    this.hitTimer?.remove();
    this.hitTimer = this.scene.time.delayedCall(240, () => {
      if (!this.sprite.active) return;
      this.sprite.clearTint();
      if (!this.busy && !this.jumping && !this.crouching) {
        if (this.motion === 'idle') this.idle();
        else this.walk(this.facing, this.motion === 'run');
      }
    });
  }

  victory() {
    this.finishActions(); this.finalPose = true;
    this.ensureSheet(); this.busy = true; this.motion = 'idle';
    this.sprite.setScale(this.baseScale).setFlipX(false).setOrigin(0.5, 1);
    this.sprite.anims.timeScale = 1;
    this.sprite.play(anim(this.sheet, 'victory'));
    this.hopTween?.stop();
    if (!prefersReducedMotion()) this.hopTween = this.scene.tweens.add({ targets: this.sprite, y: this.baseY - 16, duration: 220, yoyo: true, ease: 'Sine.easeOut', onComplete: () => this.sprite.setY(this.baseY) });
  }

  jab() {
    if (this.busy || this.jumping || this.crouching || this.scene.time.now - this.lastJab < 180) return;
    this.lastJab = this.scene.time.now;
    if (this.walking || this.motion !== 'idle') { this.strideFeedback(); return; }
    this.busy = true; this.action = 'jab';
    this.playAttack();
    this.poseTimer?.remove();
    this.poseTimer = this.scene.time.delayedCall(210, () => { if (this.sprite.active && !this.finalPose) { this.busy = false; this.action = undefined; this.idle(); } });
  }

  nudge(dx: number) {
    if (this.busy || this.jumping || this.crouching || this.moveTween?.isPlaying() || prefersReducedMotion()) return;
    this.moveTween = this.scene.tweens.add({ targets: this.lean, x: Phaser.Math.Clamp(dx, -12, 12), duration: 130, yoyo: true, ease: 'Sine.easeInOut', onComplete: () => { this.lean.x = 0; } });
  }

  private playAttack() {
    this.ensureSheet();
    const key = KOREAN_ATTACK_ATLAS;
    if (getLanguage() === 'ko' && this.poseRow >= 0 && hasKoreanAttackFrames(this.scene, this.poseRow)) {
      const first = this.scene.textures.getFrame(key, `c0_r${this.poseRow}`);
      const idle = this.scene.textures.getFrame(this.sheet, 'idle_front');
      const bodyHeight = Number(motionMetadata(first).bodyHeight) || first.height;
      const attackKey = `${key}:row${this.poseRow}`;
      const cached = this.scene.anims.get(attackKey);
      if (cached && cached.frames[0]?.frame !== first) this.scene.anims.remove(attackKey);
      if (!this.scene.anims.exists(attackKey)) this.scene.anims.create({ key: attackKey,
        frames: [0, 1, 2, 3].map(col => ({ key, frame: `c${col}_r${this.poseRow}` })), frameRate: 20, repeat: 0 });
      this.sprite.setTexture(key, first.name).setScale(this.baseScale * idle.height / bodyHeight);
      this.sprite.play(attackKey);
    } else if (getLanguage() === 'ko') {
      // Loading normally finishes before this scene opens. A late/missing atlas
      // must never show the original Q/E/A/S/D artwork in a Korean adventure.
      this.sprite.anims.stop();
      this.sprite.setFrame(`idle_${this.facing}`).setScale(this.baseScale);
    } else this.sprite.setScale(this.baseScale).play(anim(this.sheet, 'attack'));
    this.sprite.setFlipX(false).setAngle(0); this.sprite.anims.timeScale = 1;
    placeFeet(this.sprite);
  }

  private later(ms: number, callback: () => void) {
    const timer = this.scene.time.delayedCall(ms, () => {
      this.callbacks.delete(timer);
      if (this.sprite.active && !this.finalPose) callback();
    });
    this.callbacks.add(timer);
  }
  private finishActions() {
    this.endBurst();
    this.poseTimer?.remove(); this.hitTimer?.remove();
    for (const timer of this.callbacks) timer.remove();
    this.callbacks.clear();
    this.moveTween?.stop(); this.hopTween?.stop(); this.lean.x = 0;
    this.jumping = false; this.crouching = false; this.action = undefined;
    this.suspendedStride = undefined;
    if (this.sprite.active) this.sprite.setY(this.baseY).setAngle(0).clearTint();
  }

  private setPose(col: 0 | 1 | 2 | 3): boolean {
    if (this.poseRow < 0 || !this.scene.textures.exists('char_poses')) return false;
    this.endBurst();
    this.sprite.setAngle(0);
    if (this.motion !== 'idle' && this.sprite.anims.isPlaying && this.suspendedStride === undefined) {
      this.suspendedStride = this.sprite.anims.getProgress();
    }
    this.sprite.anims.stop();
    this.sprite.setTexture('char_poses', `c${col}_r${this.poseRow}`).setFlipX(false).setScale(this.baseScale * POSE_SCALE).setOrigin(0.5, 1);
    return true;
  }
  private ensureSheet() {
    if (this.sprite.texture.key === this.sheet) return;
    this.sprite.setTexture(this.sheet, `idle_${this.facing}`).setScale(this.baseScale);
  }
  private clearPose() {
    this.ensureSheet();
    if (!this.busy) {
      if (this.motion === 'idle') this.idle();
      else this.walk(this.facing, this.motion === 'run');
    }
  }

  jump(ms = 420) {
    if (this.jumping || this.busy) return;
    this.jumping = true;
    this.hopTween?.stop();
    this.setPose(1);
    this.hopTween = this.scene.tweens.add({ targets: this.sprite, y: this.baseY - (prefersReducedMotion() ? 28 : 100), duration: ms / 2, yoyo: true, ease: 'Sine.easeOut', onComplete: () => {
      this.sprite.setY(this.baseY); this.jumping = false;
      if (this.crouching) { this.setPose(2); return; }
      this.setPose(3);
      this.poseTimer?.remove();
      this.poseTimer = this.scene.time.delayedCall(100, () => { if (this.sprite.active && !this.jumping && !this.crouching) this.clearPose(); });
    } });
  }
  crouch(on: boolean) {
    if (this.crouching === on || this.busy) return;
    this.crouching = on;
    if (this.jumping) return;
    this.hopTween?.stop(); this.sprite.setY(this.baseY);
    if (on) { if (!this.setPose(2)) this.sprite.setScale(this.baseScale, this.baseScale * 0.72); }
    else this.clearPose();
  }

  hop() {
    if (this.walking || this.motion !== 'idle') { this.strideFeedback(); return; }
    if (this.busy || this.jumping || this.crouching || this.hopTween?.isPlaying() || prefersReducedMotion()) return;
    this.hopTween = this.scene.tweens.add({ targets: this.sprite, y: this.baseY - 18, duration: 150, yoyo: true, ease: 'Sine.easeOut', onComplete: () => this.sprite.setY(this.baseY) });
  }
  cheer() {
    if (this.walking || this.motion !== 'idle') { this.strideFeedback(); return; }
    if (this.busy || this.jumping || this.crouching) return;
    this.ensureSheet(); this.sprite.play(anim(this.sheet, 'cheer'));
    this.poseTimer?.remove();
    this.poseTimer = this.scene.time.delayedCall(650, () => { if (this.sprite.active && !this.busy && !this.jumping && !this.crouching) this.idle(); });
  }
  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.updateMotion, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.idleTimer?.remove(); this.finishActions();
    if (this.sprite.active) this.sprite.destroy();
    if (this.shadow.active) this.shadow.destroy();
  }
}
