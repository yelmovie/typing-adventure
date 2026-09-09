import Phaser from 'phaser';
import { registerSheetAnims, anim, type Dir } from './anims';

/** char_poses(4×4) 행 = 캐릭터, 열 = 0 준비 · 1 공중 · 2 앉기 · 3 착지 */
const POSE_ROW: Record<string, number> = {
  char_brown_boy: 0,
  char_pink_girl: 1,
  char_glasses_boy: 2,
  char_blond_explorer: 3,
};
/** 포즈 시트는 셀이 313px 로 캐릭터 시트(223px)보다 커서, 같은 키로 보이게 줄인다 */
const POSE_SCALE = 0.8;

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
  /** true 면 동작이 끝난 뒤 idle 대신 걷기 애니로 돌아간다 (S1 처럼 계속 걸어가는 씬) */
  walking = false;
  /** 방향키 상태(연출용). char_poses 시트가 있으면 전용 프레임, 없으면 트윈 스쿼시로 표현 */
  jumping = false;
  crouching = false;
  private idleTimer?: Phaser.Time.TimerEvent;
  /** char_poses 안에서 이 캐릭터의 행. -1 이면 전용 포즈 없음(트윈 폴백) */
  private poseRow = -1;

  constructor(scene: Phaser.Scene, x: number, y: number, sheet: string, scale = 1) {
    this.scene = scene;
    this.sheet = sheet;
    this.baseY = y;
    this.baseScale = scale;
    registerSheetAnims(scene, sheet);
    this.poseRow = POSE_ROW[sheet] ?? -1;
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
    this.poseRow = POSE_ROW[sheet] ?? -1;
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
      scaleY: this.baseScale * 1.04,
      scaleX: this.baseScale * 0.975,
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  idle(dir: Dir = this.facing) {
    this.ensureSheet();
    this.facing = dir;
    if (this.walking) {
      this.walk(dir, false);
      return;
    }
    this.sprite.anims.stop();
    this.sprite.setFrame(`idle_${dir}`);
    this.sprite.setFlipX(false);
    this.startBob();
  }

  /** 전투 대기 중 살아있는 느낌: 2.5~4.5초마다 두리번·응원·제자리 뛰기 중 하나 */
  setLively(on: boolean) {
    this.idleTimer?.remove();
    if (!on) return;
    const schedule = () => {
      this.idleTimer = this.scene.time.delayedCall(2500 + Math.random() * 2000, () => {
        if (!this.sprite.active) return;
        // 점프·앉기 포즈 중이면 건드리지 않는다(포즈 시트에는 idle 프레임이 없다)
        if (!this.busy && !this.jumping && !this.crouching) {
          const r = Math.random();
          if (r < 0.35) {
            // 두리번: 잠깐 정면/뒤 보고 다시 오른쪽
            const look: Dir = Math.random() < 0.5 ? 'front' : 'left';
            this.sprite.setFrame(`idle_${look}`);
            this.scene.time.delayedCall(450, () => { if (!this.busy && this.sprite.active) this.sprite.setFrame(`idle_${this.facing}`); });
          } else if (r < 0.65) {
            this.cheer();
            this.scene.time.delayedCall(700, () => { if (!this.busy && this.sprite.active) this.idle(this.facing); });
          } else {
            this.hop();
          }
        }
        schedule();
      });
    };
    schedule();
  }

  /** 대시 프레임(TURBO·FEVER 진입 등) */
  dash(ms = 600) {
    this.ensureSheet();
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.setFrame('dash');
    this.scene.tweens.add({ targets: this.sprite, x: this.sprite.x + 24, duration: 90, yoyo: true, repeat: 2 });
    this.scene.time.delayedCall(ms, () => { if (!this.busy && this.sprite.active) this.idle(this.facing); });
  }

  /** 실패 화면: 풀 죽은 포즈(피격 프레임 유지 + 고개 숙임) */
  sad() {
    this.ensureSheet();
    this.busy = true;
    this.bob?.stop();
    this.sprite.anims.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.setFrame('hit');
    this.sprite.setAngle(-6);
    this.scene.tweens.add({ targets: this.sprite, y: this.baseY + 6, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  walk(dir: Dir, run = false) {
    this.ensureSheet();
    this.facing = dir;
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.setFlipX(false);
    this.sprite.play(anim(this.sheet, `${run ? 'run' : 'walk'}_${dir}`), true);
  }

  /** 공격: 앞으로 살짝 대시 + 공격 프레임. onHit 시점에 콜백 */
  attack(onHit: () => void, onDone?: () => void) {
    this.ensureSheet();
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
    this.ensureSheet();
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
    this.ensureSheet();
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

  /** 글자 하나 맞을 때: 짧은 찌르기(공격 프레임 + 앞으로 톡) — busy 중이면 살짝 흔들리기만 */
  jab() {
    this.ensureSheet();
    if (this.busy) {
      this.scene.tweens.add({ targets: this.sprite, scaleX: this.baseScale * 1.06, duration: 50, yoyo: true });
      return;
    }
    this.busy = true;
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.setFlipX(false);
    this.sprite.play(anim(this.sheet, 'attack'));
    const x0 = this.sprite.x;
    this.scene.tweens.add({ targets: [this.sprite, this.shadow], x: x0 + 34, duration: 70, yoyo: true, ease: 'Quad.easeOut', onComplete: () => { this.sprite.setX(x0); this.shadow.setX(x0); this.busy = false; this.idle('right'); } });
  }

  /** 방향키 좌우: 전용 프레임 없이 짧게 앞뒤로 톡 (전진·후진 연출) */
  nudge(dx: number) {
    if (this.jumping || this.crouching) return;
    const x0 = this.sprite.x;
    this.scene.tweens.add({ targets: [this.sprite, this.shadow], x: x0 + dx, duration: 130, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** char_poses 전용 프레임으로 교체. 시트나 행이 없으면 false → 호출부가 트윈 폴백 */
  private setPose(col: 0 | 1 | 2 | 3): boolean {
    if (this.poseRow < 0 || !this.scene.textures.exists('char_poses')) return false;
    this.bob?.stop();
    this.sprite.anims.stop();
    this.sprite.setTexture('char_poses', `c${col}_r${this.poseRow}`);
    this.sprite.setFlipX(false);
    this.sprite.setScale(this.baseScale * POSE_SCALE);
    return true;
  }

  /**
   * 포즈 프레임이 떠 있으면 원래 시트로 되돌린다.
   * 점프·앉기 도중에 피격·걷기 같은 다른 동작이 끼어들 수 있는데,
   * 그때 setFrame('idle_front') 을 하면 char_poses 에는 그 프레임이 없어 그림이 깨진다.
   */
  private ensureSheet() {
    if (this.sprite.texture.key === this.sheet) return;
    this.sprite.setTexture(this.sheet, `idle_${this.facing}`);
    this.sprite.setScale(this.baseScale);
  }

  /** 포즈 해제 → 원래 시트의 idle(또는 걷기)로 */
  private clearPose() {
    this.ensureSheet();
    if (!this.busy) this.idle(this.facing);
  }

  /** 방향키 위: 점프. 전용 포즈가 있으면 준비 → 공중 → 착지 프레임, 없으면 스쿼시 트윈 */
  jump(ms = 420) {
    if (this.jumping) return;
    this.jumping = true;
    const y0 = this.baseY;
    this.bob?.stop();
    const posed = this.setPose(1);
    if (!posed) {
      this.scene.tweens.add({ targets: this.sprite, scaleY: this.baseScale * 0.82, scaleX: this.baseScale * 1.15, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    }
    this.scene.tweens.add({
      targets: this.sprite,
      y: y0 - 130,
      duration: ms / 2,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.sprite.setY(y0);
        this.jumping = false;
        if (posed) {
          // 착지 프레임을 잠깐 보여주고 원복 (앉기 중이면 앉기 포즈를 유지)
          if (this.crouching) { this.setPose(2); return; }
          this.setPose(3);
          this.scene.time.delayedCall(130, () => {
            if (!this.sprite.active || this.jumping || this.crouching) return;
            this.clearPose();
          });
          return;
        }
        if (!this.busy) this.startBob();
      },
    });
  }

  /** 방향키 아래: 앉기. 전용 포즈가 있으면 그 프레임, 없으면 scaleY 스쿼시 */
  crouch(on: boolean) {
    if (this.crouching === on) return;
    this.crouching = on;
    this.bob?.stop();
    const y0 = this.baseY;
    if (this.poseRow >= 0 && this.scene.textures.exists('char_poses')) {
      if (on) this.setPose(2);
      else if (!this.jumping) this.clearPose();
      this.sprite.setY(y0);
      return;
    }
    if (on) {
      this.scene.tweens.add({ targets: this.sprite, scaleY: this.baseScale * 0.62, scaleX: this.baseScale * 1.08, y: y0 + 24 * this.baseScale, duration: 110, ease: 'Quad.easeOut' });
    } else {
      this.scene.tweens.add({
        targets: this.sprite,
        scaleY: this.baseScale,
        scaleX: this.baseScale,
        y: y0,
        duration: 110,
        ease: 'Quad.easeOut',
        onComplete: () => { if (!this.busy) this.startBob(); },
      });
    }
  }

  /** 정답: 폴짝 */
  hop() {
    const y0 = this.baseY;
    this.scene.tweens.add({ targets: this.sprite, y: y0 - 46, duration: 130, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.sprite.setY(y0) });
  }

  cheer() {
    this.ensureSheet();
    this.bob?.stop();
    this.sprite.setScale(this.baseScale);
    this.sprite.play(anim(this.sheet, 'cheer'));
  }

  destroy() {
    this.bob?.stop();
    this.idleTimer?.remove();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
