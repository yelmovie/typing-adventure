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
import type { RaceInfo } from '../systems/RaceSystem';
import type { BattleSnapshot } from '../systems/BattleState';

const PLAYER_X = 780;
const GROUND_Y = 770; // 발끝 770: 하단 입력 패널(830~) 위
const PX_PER_M = 7; // 캐릭터 간 거리 표현 배율

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
  private wordText?: Phaser.GameObjects.Text;
  private speedLines?: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst?: Phaser.GameObjects.Particles.ParticleEmitter;
  private speed = 5;
  private targets = { chaserX: 400, ghostX: -400 };
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
    this.threat = 0;
    this.finished = false;
    this.caughtUntil = 0;
    this.targets = { chaserX: 400, ghostX: -400 };

    // 배경: 같은 그림을 두 겹으로 다른 속도로 흘려 원근감
    const tex = this.textures.get(stage.bgBattle).getSourceImage() as HTMLImageElement;
    const s = DESIGN_H / tex.height;
    this.bgFar = this.add.tileSprite(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W / s, DESIGN_H / s, stage.bgBattle).setScale(s).setDepth(0);
    this.bgNear = this.add.tileSprite(DESIGN_W / 2, DESIGN_H - 120, DESIGN_W / s, 260 / s, stage.bgBattle).setScale(s).setDepth(2).setAlpha(0.55).setTint(0x8fa8ff);
    this.add.rectangle(DESIGN_W / 2, DESIGN_H - 110, DESIGN_W, 220, 0x0b0f2a, 0.35).setDepth(3);
    const lane = this.add.rectangle(DESIGN_W / 2, GROUND_Y + 14, DESIGN_W, 6, 0x8fe0ff, 0.5).setDepth(3);
    if (!prefersReducedMotion()) this.tweens.add({ targets: lane, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });

    const chSheet = getCharacter(save.profile.characterId).sheet;
    this.player = new Player(this, PLAYER_X, GROUND_Y, chSheet, 1.2);
    this.player.walking = true;
    this.player.walk('right', true);
    this.player.setDepth(8);
    this.pet = new Pet(this, PLAYER_X - 150, GROUND_Y + 8, getPet(save.profile.petId).sheet, 0.6);
    this.pet.run('right');
    this.pet.setDepth(9);

    // 어제의 나 (고스트)
    this.ghost = this.add.sprite(-400, GROUND_Y, chSheet, 'run_right').setOrigin(0.5, 1).setScale(1.15).setAlpha(0.42).setTint(0x8fe0ff).setDepth(6);
    playStride(this, this.ghost, chSheet, 'right', true, 1.15);
    this.ghostLabel = this.add.text(-400, GROUND_Y - 300, tr('어제의 나'), styleText(28, '#8fe0ff')).setOrigin(0.5).setAlpha(0.8).setDepth(6);
    this.ghost.setVisible(false);
    this.ghostLabel.setVisible(false);

    // 추격자 (그림자 시트가 오기 전엔 스테이지 첫 몬스터로 대체)
    const chaserDef = getEnemy(stage.enemies[0]);
    registerSheetAnims(this, chaserDef.sheet);
    this.pressure = this.add.ellipse(280, GROUND_Y - 170, 590, 390, 0x572858, 0.12).setDepth(4);
    this.chaserShadow = this.add.ellipse(400, GROUND_Y + 6, 250, 54, 0x000000, 0.35).setDepth(4);
    this.chaser = this.add.sprite(400, GROUND_Y, chaserDef.sheet, 'walk_right_0').setOrigin(0.5, 1).setScale(2.15).setDepth(5);
    if (chaserDef.id !== 'shadow_chaser') this.chaser.setTint(0x3a2a6a);
    this.chaser.play(anim(chaserDef.sheet, 'run_right'));

    this.wordText = this.add.text(PLAYER_X + 360, GROUND_Y - 330, '', styleText(72, '#ffffff')).setOrigin(0.5).setDepth(12);
    if (!prefersReducedMotion()) this.tweens.add({ targets: this.wordText, y: GROUND_Y - 345, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.speedLines = this.add.particles(0, 0, 'p_spark', {
      x: { min: DESIGN_W - 100, max: DESIGN_W + 50 }, y: { min: 200, max: 900 }, lifespan: 500, speedX: { min: -1800, max: -1200 }, scaleX: { min: 2, max: 5 }, scaleY: 0.4,
      alpha: { start: 0.5, end: 0 }, tint: [0x8fe0ff, 0xffffff, 0xff7ab6], frequency: 40, emitting: false, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(9);
    this.burst = this.add.particles(0, 0, 'p_star', {
      lifespan: { min: 300, max: 600 }, speed: { min: 150, max: 380 }, scale: { start: 1, end: 0 }, gravityY: 400, emitting: false, blendMode: Phaser.BlendModes.ADD, tint: [0x8fe0ff, 0xff7ab6, 0xffd34d, 0xffffff],
    }).setDepth(20);

    this.bind(Events.RACE_TICK, (r: RaceInfo) => this.onTick(r));
    this.bind(Events.TARGET_CHANGED, (s: BattleSnapshot) => this.setWord(s.target));
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { forgiven: boolean }) => this.onWrong(d));
    this.bind(Events.RACE_CAUGHT, (d: { hpLoss: number }) => this.onCaught(d));
    this.bind(Events.RACE_TURBO, () => { this.player?.dash(900); this.pet?.cheer(); this.flash(0xffd34d, 0.25); });
    this.bind(Events.PET_ACTIVE, () => this.pet?.skill());
    this.bind(Events.IDLE_DRAIN, () => { this.player?.hit(); AudioManager.sfx('hurt', { gain: 0.5 }); });
    this.bind(Events.PET_PASSIVE, () => this.pet?.skill());
    this.bind(Events.SYLLABLE_HIT, () => this.player?.strideFeedback());
    this.bind(Events.FEVER_CHANGED, (d: { level: number }) => { if (d.level >= 2 && !prefersReducedMotion()) this.burst?.explode(10, PLAYER_X + 20, GROUND_Y - 120); });
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
    const px = this.speed > 0 ? strideGroundSpeed(this.speed / 7) * dt : 0;
    if (this.bgFar && !prefersReducedMotion()) this.bgFar.tilePositionX += px / this.bgFar.scaleX;
    if (this.bgNear && !prefersReducedMotion()) this.bgNear.tilePositionX += px * 1.4 / this.bgNear.scaleX;
    const lerp = (a: number, b: number) => Phaser.Math.Linear(a, b, 1 - Math.exp(-5 * dt));
    if (this.chaser && this.chaserShadow) {
      const contact = this.time.now < this.caughtUntil;
      const x = lerp(this.chaser.x, contact ? PLAYER_X - 135 : this.targets.chaserX);
      const scale = lerp(this.chaser.scaleX, 2.15 + this.threat * 0.25);
      this.chaser.setX(x).setScale(scale);
      this.chaser.setOrigin(0.5, 1 + (prefersReducedMotion() ? 0 : (1 - Math.cos(_t * 0.026 * this.chaserPace)) * 2) / this.chaser.displayHeight);
      this.chaserShadow.setX(x);
      this.pressure?.setX(x - 70).setFillStyle(this.threat > 0.65 ? 0x9d304f : 0x572858, 0.1 + this.threat * 0.14);
    }
    if (this.ghost && this.ghostLabel) {
      const x = lerp(this.ghost.x, this.targets.ghostX);
      this.ghost.setX(x);
      this.ghostLabel.setX(x);
      placeFeet(this.ghost);
    }
    this.speedLines?.setVisible(this.speed >= 9 && !prefersReducedMotion());
    if (this.speedLines) this.speedLines.emitting = this.speed >= 9 && !prefersReducedMotion();
  }

  private onTick(r: RaceInfo) {
    this.speed = r.speed;
    // Keep the pursuer fully on stage. Real metres drive the gap continuously;
    // recovery slows the pursuer rather than teleporting it out of view.
    this.threat = r.threat;
    this.targets.chaserX = Phaser.Math.Clamp(PLAYER_X - 150 - r.gap * 6, 170, PLAYER_X - 150);
    this.chaserPace = Phaser.Math.Clamp(r.chaserSpeed / 6.5, 0.8, 1.35);
    if (this.chaser) this.chaser.anims.timeScale = this.chaserPace;
    this.player?.setRunPace(r.speed / 7);
    if (this.ghost) this.ghost.anims.timeScale = Phaser.Math.Clamp(r.speed / 7, 0.75, 1.35);
    this.pet?.setRunPace(r.speed / 6.6);
    if (r.ghost != null) {
      this.ghost?.setVisible(true);
      this.ghostLabel?.setVisible(true);
      this.targets.ghostX = Phaser.Math.Clamp(PLAYER_X + (r.ghost - r.player) * PX_PER_M, -300, DESIGN_W + 200);
      this.ghostLabel?.setText(tr(r.ghostAhead ? '어제의 나' : '어제의 나 (추월!)'));
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
    if (!prefersReducedMotion()) this.burst?.explode(d.perfect ? 12 : 6, PLAYER_X + 40, GROUND_Y - 140);
    this.player?.strideFeedback();
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
      const txt = this.add.text(PLAYER_X, GROUND_Y - 260, `-${d.hpLoss}`, styleText(48, '#ff6b6b')).setOrigin(0.5).setDepth(22);
      this.tweens.add({ targets: txt, y: GROUND_Y - 340, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
    }
  }

  private flash(color: number, alpha: number) {
    if (prefersReducedMotion()) return;
    const f = this.add.ellipse(PLAYER_X + 70, GROUND_Y - 110, 100, 44, color, alpha).setDepth(10);
    this.tweens.add({ targets: f, alpha: 0, duration: 300, onComplete: () => f.destroy() });
    this.burst?.explode(8, PLAYER_X + 60, GROUND_Y - 100);
  }

  /** 도착: 오른쪽에서 게이트 빛이 열리고 캐릭터가 달려 들어간다 */
  private onFinish() {
    this.speed = 12;
    if (this.finished) return;
    this.finished = true;
    const beam = this.add.rectangle(DESIGN_W - 300, DESIGN_H / 2, 300, DESIGN_H, 0xfff2b0, 0).setDepth(28).setBlendMode(Phaser.BlendModes.ADD);
    if (!prefersReducedMotion()) this.tweens.add({ targets: beam, fillAlpha: 0.5, scaleX: 1.5, duration: 900, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: [this.player!.sprite, this.player!.shadow], x: DESIGN_W + 200, duration: 1400, delay: 300, ease: 'Quad.easeIn' });
    this.tweens.add({ targets: [this.pet!.sprite, this.pet!.shadow], x: DESIGN_W + 100, duration: 1400, delay: 400, ease: 'Quad.easeIn' });
    this.wordText?.setVisible(false);
    this.time.delayedCall(600, () => AudioManager.sfx('clear'));
  }
}
