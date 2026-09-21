import { t as tr } from '../i18n/Locale';
import Phaser from 'phaser';
import { ensureParticleTextures, styleText, prefersReducedMotion } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { registerSheetAnims, anim, placeFeet, playStride, strideGroundSpeed } from '../entities/anims';
import { SaveSystem } from '../systems/SaveSystem';
import { getCharacter, getPet } from '../data/characters';
import { getStage } from '../data/stages';
import { getEnemy } from '../data/enemies';
import { EventBus, Events } from '../EventBus';
import { AudioManager, STAGE_BGM } from '../systems/AudioManager';
import { DESIGN_W, DESIGN_H } from '../Game';
import type { StageId, ContentUnit } from '../types';
import { RACE, type RaceInfo } from '../systems/RaceSystem';
import type { BattleSnapshot } from '../systems/BattleState';

/** 플레이어를 화면 오른쪽 전방에 두어 뒤쪽 추격 공간을 넉넉하게 확보한다. */
export const RACE_PLAYER_X = 1240;
const GROUND_Y = 770; // 발끝 770: 하단 입력 패널(830~) 위
const PX_PER_M = 7; // 캐릭터 간 거리 표현 배율
const CHASER_MIN_SEPARATION = 125;
// 가장 멀리 벌어져도 큰 추격자의 몸 전체가 왼쪽 화면 안에 남는다.
const CHASER_MIN_SCREEN_X = 310;
const CHASER_EDGE_PADDING = 18;
const CHASER_MAX_SEPARATION = RACE_PLAYER_X - CHASER_MIN_SCREEN_X;
const CHASER_VISUAL_GAP_M = 50;
const CHASER_APPROACH_CURVE = 0.82;
const FRONT_AMBUSH_METRES = [190, 405, 625] as const;
const FRONT_AMBUSH_SCALE = 0.78;

/** 실제 미터 간격을 화면 거리로 변환한다. 가까운 구간일수록 접근이 더 크게 읽히는 곡선이다. */
export function raceChaserScreenX(gap: number) {
  const ratio = Phaser.Math.Clamp(gap / CHASER_VISUAL_GAP_M, 0, 1);
  const separation = CHASER_MIN_SEPARATION + Math.pow(ratio, CHASER_APPROACH_CURVE) * (CHASER_MAX_SEPARATION - CHASER_MIN_SEPARATION);
  return RACE_PLAYER_X - separation;
}

/**
 * Running cadence (stride timeScale) for a race speed in m/s: a jog while stalled,
 * a clear sprint (1.7×, ≈350 ms per full stride) at the base 4.5 m/s, up to 2.3×
 * with BOOST/TURBO/FEVER. The road scrolls at strideGroundSpeed() of the same pace.
 */
export function racePace(speed: number) {
  const pace = speed <= RACE.baseSpeed ? 1 + 0.7 * (speed / RACE.baseSpeed) : 1.7 + (speed - RACE.baseSpeed) * 0.06;
  return Phaser.Math.Clamp(pace, 0.75, 2.3);
}
/** 0 at base speed → 1 at the race's top speed, for effect intensity. */
function surgeRatio(speed: number) {
  return Phaser.Math.Clamp((speed - RACE.baseSpeed) / (RACE.maxSpeed - RACE.baseSpeed), 0, 1);
}

/**
 * 네온 시티 레이스 연출. 배경이 속도에 맞춰 흐르고, 추격자·고스트가 거리 차만큼 떨어져 달린다.
 */
export class RaceScene extends Phaser.Scene {
  private bgFar?: Phaser.GameObjects.TileSprite;
  private bgNear?: Phaser.GameObjects.TileSprite;
  private player?: Player;
  private pet?: Pet;
  private ghost?: Phaser.GameObjects.Sprite;
  private ghostLabel?: Phaser.GameObjects.Text;
  private chaser?: Phaser.GameObjects.Sprite;
  private chaserShadow?: Phaser.GameObjects.Ellipse;
  private pressure?: Phaser.GameObjects.Ellipse;
  private frontAmbush?: Phaser.GameObjects.Sprite;
  private chaserSheet = '';
  private nextAmbush = 0;
  private wordText?: Phaser.GameObjects.Text;
  private speedLines?: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst?: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter;
  private lane?: Phaser.GameObjects.TileSprite;
  private streaks?: Phaser.GameObjects.TileSprite;
  private turbo = false;
  private fever = false;
  private speed = 5;
  private targets = { chaserX: raceChaserScreenX(40), ghostX: -400 };
  private threat = 0;
  private chaserPace = 1;
  private caughtUntil = 0;
  private finished = false;
  private shakeOn = true;
  private handlers: [string, (...args: never[]) => void][] = [];

  constructor() {
    super('Race');
  }

  create(data: { stageId: StageId }) {
    const stage = getStage(data.stageId);
    ensureParticleTextures(this);
    const save = SaveSystem.get();
    this.shakeOn = save.settings.screenShake && !prefersReducedMotion();
    this.speed = 5;
    this.turbo = false;
    this.fever = false;
    this.threat = 0;
    this.finished = false;
    this.caughtUntil = 0;
    this.nextAmbush = 0;
    this.frontAmbush = undefined;
    this.targets = { chaserX: raceChaserScreenX(40), ghostX: -400 };

    // 배경: 같은 그림을 두 겹으로 다른 속도로 흘려 원근감
    const tex = this.textures.get(stage.bgBattle).getSourceImage() as HTMLImageElement;
    const s = DESIGN_H / tex.height;
    this.bgFar = this.add.tileSprite(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W / s, DESIGN_H / s, stage.bgBattle).setScale(s).setDepth(0);
    this.bgNear = this.add.tileSprite(DESIGN_W / 2, DESIGN_H - 120, DESIGN_W / s, 260 / s, stage.bgBattle).setScale(s).setDepth(2).setAlpha(0.55).setTint(0x8fa8ff);
    this.add.rectangle(DESIGN_W / 2, DESIGN_H - 110, DESIGN_W, 220, 0x0b0f2a, 0.35).setDepth(3);
    // 발밑 차선 점선과 그 앞의 빠른 줄무늬: 길이 실제로 흐르는 게 보이게 한다
    this.ensureRoadTextures();
    const lane = this.add.tileSprite(DESIGN_W / 2, GROUND_Y + 14, DESIGN_W, 6, 'race_lane').setTint(0x8fe0ff).setAlpha(0.5).setDepth(3);
    this.lane = lane;
    this.streaks = this.add.tileSprite(DESIGN_W / 2, GROUND_Y + 46, DESIGN_W, 3, 'race_streak').setTint(0xcfe9ff).setAlpha(0.22).setDepth(3);
    if (!prefersReducedMotion()) this.tweens.add({ targets: lane, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });

    const chSheet = getCharacter(save.profile.characterId).sheet;
    this.player = new Player(this, RACE_PLAYER_X, GROUND_Y, chSheet, 1.2);
    this.player.walking = true;
    this.player.walk('right', true);
    this.player.setRunPace(racePace(this.speed));
    this.player.setRunLean(prefersReducedMotion() ? 0 : 4);
    this.player.setDepth(8);
    this.pet = new Pet(this, RACE_PLAYER_X - 145, GROUND_Y + 8, getPet(save.profile.petId).sheet, 0.6);
    this.pet.run('right');
    this.pet.setRunPace(racePace(this.speed) * 0.85);
    this.pet.setDepth(9);

    // 어제의 나 (고스트)
    this.ghost = this.add.sprite(-400, GROUND_Y, chSheet, 'run_right').setOrigin(0.5, 1).setScale(1.15).setAlpha(0.42).setTint(0x8fe0ff).setDepth(6);
    playStride(this, this.ghost, chSheet, 'right', true, 1.15);
    this.ghost.anims.timeScale = racePace(this.speed);
    this.ghostLabel = this.add.text(-400, GROUND_Y - 300, tr('어제의 나'), styleText(28, '#8fe0ff')).setOrigin(0.5).setAlpha(0.8).setDepth(6);
    this.ghost.setVisible(false);
    this.ghostLabel.setVisible(false);

    // 추격자 (그림자 시트가 오기 전엔 스테이지 첫 몬스터로 대체)
    const chaserDef = getEnemy(stage.enemies[0]);
    this.chaserSheet = chaserDef.sheet;
    registerSheetAnims(this, chaserDef.sheet);
    const chaserStartX = raceChaserScreenX(40);
    this.pressure = this.add.ellipse(chaserStartX - 70, GROUND_Y - 170, 590, 390, 0x572858, 0.12).setDepth(4);
    this.chaserShadow = this.add.ellipse(chaserStartX, GROUND_Y + 6, 250, 54, 0x000000, 0.35).setDepth(4);
    this.chaser = this.add.sprite(chaserStartX, GROUND_Y, chaserDef.sheet, 'walk_right_0').setOrigin(0.5, 1).setScale(2.05).setDepth(5);
    if (chaserDef.id !== 'shadow_chaser') this.chaser.setTint(0x3a2a6a);
    this.chaser.play(anim(chaserDef.sheet, 'run_right'));

    this.wordText = this.add.text(RACE_PLAYER_X + 300, GROUND_Y - 330, '', styleText(72, '#ffffff')).setOrigin(0.5).setDepth(12);
    if (!prefersReducedMotion()) this.tweens.add({ targets: this.wordText, y: GROUND_Y - 345, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.speedLines = this.add.particles(0, 0, 'p_spark', {
      x: { min: DESIGN_W - 100, max: DESIGN_W + 50 }, y: { min: 200, max: 900 }, lifespan: 500, speedX: { min: -1800, max: -1200 }, scaleX: { min: 2, max: 5 }, scaleY: 0.4,
      alpha: { start: 0.5, end: 0 }, tint: [0x8fe0ff, 0xffffff, 0xff7ab6], frequency: 40, emitting: false, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(9);
    this.burst = this.add.particles(0, 0, 'p_star', {
      lifespan: { min: 300, max: 600 }, speed: { min: 150, max: 380 }, scale: { start: 1, end: 0 }, gravityY: 400, emitting: false, blendMode: Phaser.BlendModes.ADD, tint: [0x8fe0ff, 0xff7ab6, 0xffd34d, 0xffffff],
    }).setDepth(20);
    // 발뒤꿈치 먼지: 속도·TURBO·FEVER 에 따라 잦아진다 (update 에서 frequency 조절)
    this.dust = this.add.particles(RACE_PLAYER_X - 34, GROUND_Y - 4, 'p_dot', {
      lifespan: { min: 260, max: 520 }, speedX: { min: -300, max: -150 }, speedY: { min: -110, max: -20 }, scale: { start: 0.75, end: 0.1 }, alpha: { start: 0.55, end: 0 },
      gravityY: -30, tint: [0x8fe0ff, 0xcfe9ff, 0xffffff], frequency: 110, emitting: false, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(7);

    this.bind(Events.RACE_TICK, (r: RaceInfo) => this.onTick(r));
    this.bind(Events.TARGET_CHANGED, (s: BattleSnapshot) => this.setWord(s.target));
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { forgiven: boolean }) => this.onWrong(d));
    this.bind(Events.RACE_CAUGHT, (d: { hpLoss: number }) => this.onCaught(d));
    this.bind(Events.RACE_GHOST_CAUGHT, (d: { hpLoss: number }) => this.onGhostCaught(d));
    // TURBO: 대시 자세를 길게 잡고 먼지를 크게 터뜨린다
    this.bind(Events.RACE_TURBO, () => { this.player?.burst(420); this.pet?.cheer(); this.flash(0xffd34d, 0.25); if (!prefersReducedMotion()) this.dust?.explode(18, RACE_PLAYER_X - 30, GROUND_Y - 6); });
    this.bind(Events.PET_ACTIVE, () => this.pet?.skill());
    this.bind(Events.IDLE_DRAIN, () => { this.player?.hit(); AudioManager.sfx('hurt', { gain: 0.5 }); });
    this.bind(Events.PET_PASSIVE, () => this.pet?.skill());
    // 글자(음절) 입력은 캐릭터를 움직이지 않는다. 낱말 완성(INPUT_CORRECT)에서만 달리기 버스트.
    this.bind(Events.FEVER_CHANGED, (d: { level: number }) => { this.fever = d.level >= 2; if (d.level >= 2 && !prefersReducedMotion()) this.burst?.explode(10, RACE_PLAYER_X + 20, GROUND_Y - 120); });
    this.bind(Events.RACE_FINISH, () => this.onFinish());
    this.bind(Events.PLAYER_MOVE, (d: { dir: 'left' | 'right' | 'up' | 'down'; pressed: boolean }) => {
      if (!this.player) return;
      if (d.dir === 'up' && d.pressed) this.player.jump();
      else if (d.dir === 'down') this.player.crouch(d.pressed);
      else if (d.pressed) this.player.nudge(d.dir === 'right' ? 22 : -22);
    });
    this.bind(Events.STAGE_FAILED, () => { this.player?.hit(); this.speed = 0; });
    this.bind(Events.SETTINGS_CHANGED, (s: { screenShake: boolean }) => (this.shakeOn = s.screenShake && !prefersReducedMotion()));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [ev, fn] of this.handlers) EventBus.off(ev, fn);
      this.handlers = [];
      this.frontAmbush?.destroy();
      this.frontAmbush = undefined;
    });
    void AudioManager.bgm(STAGE_BGM[stage.id] ?? 'battle');
  }

  private bind<T>(ev: string, fn: (d: T) => void) {
    EventBus.on(ev, fn);
    this.handlers.push([ev, fn as (...args: never[]) => void]);
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    // PX_PER_M places racers relative to each other; it is too small for the
    // visible road. Use the player's same bounded step cadence for the road.
    const px = this.speed > 0 ? strideGroundSpeed(racePace(this.speed)) * dt : 0;
    const reduced = prefersReducedMotion();
    if (this.bgFar && !reduced) this.bgFar.tilePositionX += px / this.bgFar.scaleX;
    if (this.bgNear && !reduced) this.bgNear.tilePositionX += px * 1.6 / this.bgNear.scaleX;
    if (this.lane && !reduced) this.lane.tilePositionX += px; // 발밑 점선은 보폭과 같은 속도
    if (this.streaks && !reduced) this.streaks.tilePositionX += px * 2.4; // 카메라 앞 줄무늬는 더 빠르게
    const rush = !reduced && this.speed > 0;
    const surge = this.turbo || this.fever;
    const ratio = surgeRatio(this.speed);
    if (this.speedLines) {
      const on = rush && (this.speed >= RACE.baseSpeed + 1.5 || surge);
      this.speedLines.emitting = on;
      this.speedLines.setVisible(on);
      this.speedLines.frequency = surge ? 14 : Phaser.Math.Linear(70, 24, ratio);
    }
    if (this.dust) {
      this.dust.emitting = rush;
      this.dust.frequency = surge ? 26 : Phaser.Math.Linear(120, 40, ratio);
    }
    const lerp = (a: number, b: number) => Phaser.Math.Linear(a, b, 1 - Math.exp(-5 * dt));
    if (this.chaser && this.chaserShadow) {
      const contact = this.time.now < this.caughtUntil;
      const scale = lerp(this.chaser.scaleX, 2.05 + this.threat * 0.58);
      const wantedX = contact ? RACE_PLAYER_X - 112 : this.targets.chaserX;
      const safeLeft = Math.max(CHASER_MIN_SCREEN_X, this.chaser.frame.realWidth * scale / 2 + CHASER_EDGE_PADDING);
      const x = lerp(this.chaser.x, Math.max(safeLeft, wantedX));
      this.chaser.setX(x).setScale(scale);
      this.chaser.setOrigin(0.5, 1 + (prefersReducedMotion() ? 0 : (1 - Math.cos(_t * 0.026 * this.chaserPace)) * 2) / this.chaser.displayHeight);
      this.chaserShadow.setX(x).setScale(0.88 + this.threat * 0.42, 0.9 + this.threat * 0.2).setAlpha(0.3 + this.threat * 0.28);
      this.pressure?.setX(x - 55).setScale(0.9 + this.threat * 0.38).setFillStyle(this.threat > 0.65 ? 0xb12d4b : 0x572858, 0.08 + this.threat * 0.2);
    }
    if (this.ghost && this.ghostLabel) {
      const x = lerp(this.ghost.x, this.targets.ghostX);
      this.ghost.setX(x);
      this.ghostLabel.setX(x);
      placeFeet(this.ghost);
    }
  }

  private ensureRoadTextures() {
    if (!this.textures.exists('race_lane')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 110, 6);
      g.generateTexture('race_lane', 200, 6);
      g.destroy();
    }
    if (!this.textures.exists('race_streak')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 70, 3);
      g.fillRect(150, 0, 30, 3);
      g.generateTexture('race_streak', 280, 3);
      g.destroy();
    }
  }

  private onTick(r: RaceInfo) {
    this.speed = r.speed;
    // Keep the pursuer fully on stage. Real metres drive the gap continuously;
    // recovery slows the pursuer rather than teleporting it out of view.
    this.threat = r.threat;
    this.targets.chaserX = raceChaserScreenX(r.gap);
    if (!this.finished && !this.frontAmbush && this.nextAmbush < FRONT_AMBUSH_METRES.length && r.player >= FRONT_AMBUSH_METRES[this.nextAmbush]) {
      this.nextAmbush++;
      this.showFrontAmbush();
    }
    this.turbo = r.turboLeft > 0;
    this.chaserPace = Phaser.Math.Clamp(r.chaserSpeed / 5, 0.9, 2);
    if (this.chaser) this.chaser.anims.timeScale = this.chaserPace;
    // 달리기: 기본 1.7×, 속도에 따라 2.3×까지. 앞으로 기울기 4°→9°.
    const pace = racePace(r.speed);
    this.player?.setRunPace(pace);
    this.player?.setRunLean(prefersReducedMotion() ? 0 : Phaser.Math.Linear(4, 9, surgeRatio(r.speed)));
    if (this.ghost) this.ghost.anims.timeScale = pace;
    this.pet?.setRunPace(pace * 0.85);
    if (r.ghost != null) {
      this.ghost?.setVisible(true);
      this.ghostLabel?.setVisible(true);
      this.targets.ghostX = Phaser.Math.Clamp(RACE_PLAYER_X + (r.ghost - r.player) * PX_PER_M, -300, DESIGN_W + 200);
      this.ghostLabel?.setText(tr(r.ghostAhead ? '어제의 나' : '어제의 나 (추월!)'));
    } else {
      this.ghost?.setVisible(false);
      this.ghostLabel?.setVisible(false);
    }
    // 추격자 눈 빛: 가까울수록 붉게
    if (this.chaser?.texture.key === 'mon_shadow_chaser') this.chaser.setTint(r.threat > 0.65 ? 0xffb2b2 : 0xffffff);
    else this.chaser?.setTint(r.threat > 0.65 ? 0x7a2a4a : 0x3a2a6a);
  }

  private setWord(u: ContentUnit | null) {
    if (!this.wordText) return;
    this.wordText.setText(u?.text ?? '');
    const v = u?.variant;
    this.wordText.setColor(v === 'treasure' ? '#ffd34d' : v === 'heart' ? '#ff7ab6' : v === 'bomb' ? '#ff6b6b' : '#ffffff');
    this.wordText.setScale(prefersReducedMotion() ? 1 : 0.6);
    if (!prefersReducedMotion()) this.tweens.add({ targets: this.wordText, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  private onCorrect(d: { perfect: boolean; combo: number }) {
    AudioManager.sfx(d.perfect ? 'perfect' : 'hit', { rate: AudioManager.comboRate(d.combo) });
    if (d.combo > 0 && d.combo % 5 === 0) AudioManager.sfx('combo', { rate: AudioManager.comboRate(d.combo) });
    if (!prefersReducedMotion()) {
      this.burst?.explode(d.perfect ? 12 : 6, RACE_PLAYER_X + 40, GROUND_Y - 140);
      this.dust?.explode(d.perfect ? 14 : 10, RACE_PLAYER_X - 30, GROUND_Y - 6);
    }
    // 낱말 완성 = 눈에 보이는 버스트: 짧은 대시 자세 + 먼지. 글자마다는 아무 동작도 없다.
    this.player?.burst(200);
    this.pet?.cheer();
  }

  private onWrong(d: { forgiven: boolean }) {
    if (d.forgiven) return;
    AudioManager.sfx('miss');
    this.player?.hit();
  }

  private onCaught(d: { hpLoss: number }) {
    AudioManager.sfx('hurt');
    this.caughtUntil = this.time.now + 320;
    this.player?.hit();
    if (this.shakeOn) this.cameras.main.shake(200, 0.008);
    if (d.hpLoss > 0) {
      const txt = this.add.text(RACE_PLAYER_X, GROUND_Y - 260, `-${d.hpLoss}`, styleText(48, '#ff6b6b')).setOrigin(0.5).setDepth(22);
      this.tweens.add({ targets: txt, y: GROUND_Y - 340, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
    }
  }

  private onGhostCaught(d: { hpLoss: number }) {
    const x = this.ghost?.x ?? this.targets.ghostX;
    this.ghost?.setVisible(false);
    this.ghostLabel?.setVisible(false);
    this.targets.ghostX = -400;
    if (!prefersReducedMotion()) this.burst?.explode(16, x, GROUND_Y - 120);
    if (d.hpLoss > 0) this.onCaught(d);
  }

  /** 진행 중 세 번, 같은 추격자의 작은 잔상이 앞에서 튀어나오는 순수 시각 연출. */
  private showFrontAmbush() {
    if (!this.chaserSheet) return;
    const reduced = prefersReducedMotion();
    const targetX = Math.min(DESIGN_W - 120, RACE_PLAYER_X + 315);
    const sprite = this.add.sprite(reduced ? targetX : DESIGN_W + 90, GROUND_Y + 2, this.chaserSheet, 'walk_left_0')
      .setOrigin(0.5, 1)
      .setScale(reduced ? FRONT_AMBUSH_SCALE : 0.22)
      .setAlpha(reduced ? 0.82 : 0)
      .setDepth(10);
    sprite.play(anim(this.chaserSheet, 'run_left'));
    sprite.anims.timeScale = 1.7;
    this.frontAmbush = sprite;
    const remove = () => {
      if (this.frontAmbush === sprite) this.frontAmbush = undefined;
      sprite.destroy();
    };
    if (reduced) {
      this.time.delayedCall(520, remove);
      return;
    }
    this.tweens.add({
      targets: sprite,
      x: targetX,
      scaleX: FRONT_AMBUSH_SCALE,
      scaleY: FRONT_AMBUSH_SCALE,
      alpha: 0.9,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => this.tweens.add({
        targets: sprite,
        x: targetX - 90,
        y: GROUND_Y - 62,
        angle: -7,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        delay: 360,
        duration: 260,
        ease: 'Quad.easeIn',
        onComplete: remove,
      }),
    });
  }

  private flash(color: number, alpha: number) {
    if (prefersReducedMotion()) return;
    const f = this.add.ellipse(RACE_PLAYER_X + 70, GROUND_Y - 110, 100, 44, color, alpha).setDepth(10);
    this.tweens.add({ targets: f, alpha: 0, duration: 300, onComplete: () => f.destroy() });
    this.burst?.explode(8, RACE_PLAYER_X + 60, GROUND_Y - 100);
  }

  /** 도착: 오른쪽에서 게이트 빛이 열리고 캐릭터가 달려 들어간다 */
  private onFinish() {
    this.speed = 12;
    if (this.finished) return;
    this.finished = true;
    this.frontAmbush?.destroy();
    this.frontAmbush = undefined;
    const beam = this.add.rectangle(DESIGN_W - 300, DESIGN_H / 2, 300, DESIGN_H, 0xfff2b0, 0).setDepth(28).setBlendMode(Phaser.BlendModes.ADD);
    if (!prefersReducedMotion()) this.tweens.add({ targets: beam, fillAlpha: 0.5, scaleX: 1.5, duration: 900, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: [this.player!.sprite, this.player!.shadow], x: DESIGN_W + 200, duration: 1400, delay: 300, ease: 'Quad.easeIn' });
    this.tweens.add({ targets: [this.pet!.sprite, this.pet!.shadow], x: DESIGN_W + 100, duration: 1400, delay: 400, ease: 'Quad.easeIn' });
    this.wordText?.setVisible(false);
    this.time.delayedCall(600, () => AudioManager.sfx('clear'));
  }
}
