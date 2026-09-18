import Phaser from 'phaser';
import { ensureParticleTextures, styleText } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { SaveSystem } from '../systems/SaveSystem';
import { getCharacter, getPet } from '../data/characters';
import { getStage } from '../data/stages';
import { EventBus, Events } from '../EventBus';
import { AudioManager, STAGE_BGM } from '../systems/AudioManager';
import { DESIGN_W, DESIGN_H } from '../Game';
import type { StageId } from '../types';
import { TELE, type TelegramInfo } from '../systems/TelegramSystem';

const DECK_Y = 780; // 발끝 760: 하단 입력 패널(830~) 위

/**
 * 폭주 열차 연출. 배경이 속도에 맞춰 흐르고, 위험 지점(끊어진 다리)이 가까워질수록 흔들림·붉은 경고가 커진다.
 */
export class TrainScene extends Phaser.Scene {
  private bg?: Phaser.GameObjects.TileSprite;
  private rails?: Phaser.GameObjects.TileSprite;
  private player?: Player;
  private pet?: Pet;
  private distText?: Phaser.GameObjects.Text;
  private warn?: Phaser.GameObjects.Rectangle;
  private noise?: Phaser.GameObjects.Rectangle;
  private bridge?: Phaser.GameObjects.Container;
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter;
  private telegraph?: Phaser.GameObjects.Image;
  private gauge?: Phaser.GameObjects.Image;
  private lever?: Phaser.GameObjects.Image;
  private speed = 2;
  private dist = 280;
  private stopped = false;
  private shakeOn = true;
  private reducedMotion = false;
  private english = false;
  private shakeAcc = 0;
  private handlers: [string, (...args: never[]) => void][] = [];

  constructor() {
    super('Train');
  }

  create(data: { stageId: StageId }) {
    const stage = getStage(data.stageId);
    ensureParticleTextures(this);
    const save = SaveSystem.get();
    this.shakeOn = save.settings.screenShake;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.english = save.settings.language === 'en';
    this.stopped = false;

    const tex = this.textures.get(stage.bgBattle).getSourceImage() as HTMLImageElement;
    const s = DESIGN_H / tex.height;
    this.bg = this.add.tileSprite(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W / s, DESIGN_H / s, stage.bgBattle).setScale(s).setDepth(0);
    // 선로 (그래픽 텍스처)
    if (!this.textures.exists('rail_tile')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x2a1a10, 1); g.fillRect(0, 0, 120, 60);
      g.fillStyle(0x6a4a2a, 1); g.fillRect(10, 0, 24, 60);
      g.fillStyle(0xc9c9d9, 1); g.fillRect(0, 12, 120, 8); g.fillRect(0, 40, 120, 8);
      g.generateTexture('rail_tile', 120, 60);
      g.destroy();
    }
    this.rails = this.add.tileSprite(DESIGN_W / 2, DECK_Y + 40, DESIGN_W, 60, 'rail_tile').setDepth(2).setScale(1, 1.4);
    // 열차 갑판
    const deck = this.add.graphics().setDepth(3);
    deck.fillStyle(0x111b2a, 1); deck.fillRoundedRect(60, DECK_Y - 22, 940, 74, 8);
    deck.fillStyle(0x4a5261, 1); deck.fillRect(70, DECK_Y - 20, 920, 22);
    deck.fillStyle(0x9b8151, 1); deck.fillRect(70, DECK_Y - 20, 920, 5);
    deck.lineStyle(3, 0x788599, 0.7);
    for (let x = 90; x < 960; x += 100) {
      deck.lineBetween(x, DECK_Y - 16, x, DECK_Y + 34);
      deck.fillStyle(0x9aacc1).fillRect(x + 16, DECK_Y + 20, 5, 5);
    }
    // 전신기·계기판·레버 (소품 시트)
    if (this.textures.exists('fx_train_props')) {
      this.telegraph = this.add.image(760, DECK_Y - 20, 'fx_train_props', 'c0_r0').setOrigin(0.5, 1).setScale(0.5).setDepth(4);
      this.gauge = this.add.image(600, DECK_Y - 60, 'fx_train_props', 'c0_r1').setOrigin(0.5, 1).setScale(0.42).setDepth(4);
      this.lever = this.add.image(900, DECK_Y - 20, 'fx_train_props', 'c0_r2').setOrigin(0.5, 1).setScale(0.45).setDepth(4);
      this.add.text(760, DECK_Y - 200, this.english ? 'TELEGRAPH' : '전신기', styleText(32, '#fff2b0')).setOrigin(0.5).setDepth(5);
    } else {
      const tg = this.add.graphics().setDepth(4);
      tg.fillStyle(0x5a3a1a, 1); tg.fillRoundedRect(760, DECK_Y - 110, 160, 90, 10);
      tg.fillStyle(0xd9a52a, 1); tg.fillCircle(840, DECK_Y - 65, 22);
    }

    this.player = new Player(this, 520, DECK_Y - 20, getCharacter(save.profile.characterId).sheet, 1.15); // 좌측 전보 패널(x≤490) 오른쪽
    this.player.idle('right');
    this.player.setDepth(6);
    this.player.setLively(true);
    this.pet = new Pet(this, 230, DECK_Y - 12, getPet(save.profile.petId).sheet, 0.55);
    this.pet.setDepth(5);

    // 끊어진 다리 (멀리서 다가옴)
    const br = this.add.graphics();
    br.fillStyle(0x1a1020, 1); br.fillRect(-60, -20, 120, 260);
    br.fillStyle(0xff4a4a, 1); br.fillTriangle(-40, -60, 40, -60, 0, -130);
    br.fillStyle(0xffffff, 1); br.fillRect(-6, -110, 12, 30); br.fillRect(-6, -75, 12, 10);
    this.bridge = this.add.container(DESIGN_W + 300, 640, [br]).setDepth(1).setScale(0.4);

    this.distText = this.add.text(DESIGN_W / 2, 400, '', styleText(54, '#ff7a76')).setOrigin(0.5).setDepth(12);
    this.warn = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0xff2a2a, 0).setDepth(25);
    this.noise = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0xffffff, 0).setDepth(26).setBlendMode(Phaser.BlendModes.ADD);

    this.sparks = this.add.particles(0, 0, 'p_spark', {
      x: { min: 60, max: 960 }, y: DECK_Y + 60, lifespan: 400, speedX: { min: -900, max: -500 }, speedY: { min: -80, max: 40 }, scale: { start: 0.8, end: 0 }, tint: [0xffd34d, 0xff7a3d, 0xffffff], frequency: 90, emitting: !this.reducedMotion, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(7);
    this.add.particles(1000, DECK_Y - 120, 'p_dot', {
      lifespan: 1400, speedX: { min: -260, max: -160 }, speedY: { min: -60, max: -20 }, scale: { start: 1.5, end: 4 }, alpha: { start: 0.35, end: 0 }, tint: 0xdddddd, frequency: 90, emitting: !this.reducedMotion,
    }).setDepth(1);

    this.bind(Events.TELE_TICK, (t: TelegramInfo) => this.onTick(t));
    this.bind(Events.TELE_WORD, () => this.pulseTelegraph()); // 어절마다 전신기만 깜빡인다. 캐릭터는 문장 완성 때만 움직인다
    this.bind(Events.PET_ACTIVE, () => this.pet?.skill());
    this.bind(Events.IDLE_DRAIN, () => { this.player?.hit(); AudioManager.sfx('hurt', { gain: 0.5 }); });
    this.bind(Events.PET_PASSIVE, () => this.pet?.skill());
    this.bind(Events.TELE_OUTAGE, (d: { on: boolean }) => this.setOutage(d.on));
    this.bind(Events.TELE_BRAKE, (d: { stage: number }) => this.onBrake(d.stage));
    this.bind(Events.TELE_STOP, () => this.onStop());
    this.bind(Events.TELE_CRASH, () => this.onCrash());
    // 문장 완성: 진짜 공격 자세 + 깡충. 어절·글자 단위로는 캐릭터가 움직이지 않는다
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number }) => { AudioManager.sfx(d.perfect ? 'perfect' : 'hit', { rate: AudioManager.comboRate(d.combo) }); this.pet?.cheer(); this.player?.hop(); this.player?.attack(() => {}); });
    this.bind(Events.INPUT_WRONG, (d: { forgiven: boolean }) => { if (!d.forgiven) AudioManager.sfx('miss'); });
    this.bind(Events.PLAYER_MOVE, (d: { dir: 'left' | 'right' | 'up' | 'down'; pressed: boolean }) => {
      if (!this.player) return;
      if (d.dir === 'up' && d.pressed) this.player.jump();
      else if (d.dir === 'down') this.player.crouch(d.pressed);
      else if (d.pressed) this.player.nudge(d.dir === 'right' ? 22 : -22);
    });
    this.bind(Events.SETTINGS_CHANGED, (s: { screenShake: boolean }) => (this.shakeOn = s.screenShake));
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
    const px = this.speed * 140 * dt; // 시각적 속도
    if (this.bg && !this.reducedMotion) this.bg.tilePositionX += px * 0.5;
    if (this.rails && !this.reducedMotion) this.rails.tilePositionX += px * 2.2;
    if (this.sparks) this.sparks.emitting = !this.reducedMotion && this.speed > 0.2;
    // 가까울수록 자주 흔들림
    if (this.shakeOn && !this.reducedMotion && !this.stopped && this.speed > 0) {
      this.shakeAcc += dt;
      const period = Phaser.Math.Clamp(this.dist / TELE.dist, 0.15, 1) * 1.2;
      if (this.shakeAcc >= period) {
        this.shakeAcc = 0;
        this.cameras.main.shake(120, 0.002 + (1 - this.dist / TELE.dist) * 0.006);
      }
    }
    if (this.bridge) {
      const p = 1 - this.dist / TELE.dist; // 0 → 멀리, 1 → 눈앞
      this.bridge.setX(DESIGN_W + 300 - p * 1100).setScale(0.4 + p * 0.9);
    }
  }

  private onTick(t: TelegramInfo) {
    this.speed = t.speed;
    this.dist = t.dist;
    this.distText?.setText(this.english ? `${Math.ceil(t.dist)}m to the broken bridge` : `위험 지점까지 ${Math.ceil(t.dist)}m`);
    this.gauge?.setFrame(t.speed > 1.2 ? 'c1_r1' : 'c0_r1');
    this.distText?.setColor(t.dist < 60 ? '#ff4a4a' : t.dist < 140 ? '#ffb347' : '#fff2b0');
    this.warn?.setFillStyle(0xff2a2a, t.dist < 60 && !t.stopped ? this.reducedMotion ? 0.08 : 0.12 + 0.05 * Math.abs(Math.sin(this.time.now / 400)) : 0);
  }

  private pulseTelegraph() {
    AudioManager.sfx('tap', { rate: 1.6 });
    if (this.telegraph) {
      this.telegraph.setFrame('c1_r0');
      this.time.delayedCall(120, () => this.telegraph?.setFrame('c0_r0'));
    }
    // 전신기 이미지를 쓸 때 링 중심은 전신기 키 본체(x≈763, y≈630) 위. 840,715 는 코드 그래픽 폴백 시절 좌표라 레버 쪽에 떴다.
    const ring = this.add.ellipse(this.telegraph ? 763 : 840, DECK_Y - (this.telegraph ? 150 : 65), 40, 40, 0xfff2b0, 0.9).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
  }

  private setOutage(on: boolean) {
    if (on) {
      AudioManager.sfx('bomb', { rate: 2.2, gain: 0.35 });
      // 빠른 전체 화면 섬광 대신 짧고 낮은 불투명도의 통신 표시를 사용한다.
      if (!this.reducedMotion) {
        this.noise?.setFillStyle(0xffffff, 0.06);
        this.tweens.add({ targets: this.noise, fillAlpha: 0, duration: 500 });
      }
      const t = this.add.text(DESIGN_W / 2, 620, this.english ? 'Signal interrupted…' : '통신 끊김…', styleText(48, '#ff6b6b')).setOrigin(0.5).setDepth(27);
      this.tweens.add({ targets: t, alpha: 0, duration: 300, delay: 1200, onComplete: () => t.destroy() });
    }
  }

  private onBrake(stage: number) {
    AudioManager.sfx('hurt', { rate: 0.6, gain: 0.7 });
    if (this.lever) {
      this.lever.setFrame('c1_r2');
      this.time.delayedCall(700, () => { if (!this.stopped) this.lever?.setFrame('c0_r2'); });
    }
    if (this.shakeOn && !this.reducedMotion) this.cameras.main.shake(300, 0.01);
    const t = this.add.text(DESIGN_W / 2, 520, this.english ? `Brake ${stage} engaged!` : `브레이크 ${stage}단!`, styleText(56, '#ffd34d')).setOrigin(0.5).setDepth(27).setScale(this.reducedMotion ? 1 : 0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: 480, duration: 500, delay: 900, onComplete: () => t.destroy() });
    if (!this.reducedMotion) this.sparks?.explode(40, 500, DECK_Y + 60);
  }

  private onStop() {
    this.stopped = true;
    this.lever?.setFrame('c1_r2');
    this.gauge?.setFrame('c0_r1');
    this.speed = 0;
    if (this.sparks) this.sparks.emitting = false;
    AudioManager.sfx('clear');
    const t = this.add.text(DESIGN_W / 2, 520, this.english ? 'Train stopped safely!' : '열차 정지 완료!', styleText(72, '#63e074')).setOrigin(0.5).setDepth(27).setScale(this.reducedMotion ? 1 : 0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.time.delayedCall(400, () => { this.player?.victory(); this.pet?.victory(); });
  }

  private onCrash() {
    this.speed = 0;
    if (this.shakeOn && !this.reducedMotion) this.cameras.main.shake(700, 0.02);
    this.warn?.setFillStyle(0xff2a2a, 0.35);
    const t = this.add.text(DESIGN_W / 2, 520, this.english ? 'Try the brakes again…' : '급정지 실패…', styleText(64, '#ff6b6b')).setOrigin(0.5).setDepth(27);
    this.tweens.add({ targets: t, y: 500, duration: 400 });
    this.player?.hit();
  }
}
