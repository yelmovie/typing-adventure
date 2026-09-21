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
import { anim, registerSheetAnims } from '../entities/anims';

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
  /** 계기판은 소스 시트가 윗부분을 잘라 놓아(칸 넘침) 이미지를 쓰지 않고 그래픽으로 그린다 */
  private gaugeNeedle?: Phaser.GameObjects.Graphics;
  private gaugeRatio = 1;
  private lever?: Phaser.GameObjects.Image;
  private speed = 2;
  private dist = 280;
  private stopped = false;
  private shakeOn = true;
  private reducedMotion = false;
  private english = false;
  private shakeAcc = 0;
  private bats: Phaser.GameObjects.Container[] = [];
  private batBases: { x: number; y: number }[] = [];
  private batTimerText?: Phaser.GameObjects.Text;
  private batTimerBar?: Phaser.GameObjects.Graphics;
  private activeBat = -1;
  private ambushStartedAt = 0;
  private handlers: [string, (...args: never[]) => void][] = [];

  constructor() {
    super('Train');
  }

  preload() {
    if (!this.textures.exists('mon_letter_bat')) {
      this.load.atlas('mon_letter_bat', './assets/sprites/mon_letter_bat.webp', './assets/sprites/mon_letter_bat.json');
    }
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
      // 시트의 전신기 칸 아래에는 다음 칸(계기판)의 윗부분이 딸려 들어와 있다 → 전신기 바닥(소스 y 336)까지만 보이게 자른다.
      this.telegraph = this.add.image(760, DECK_Y - 20, 'fx_train_props', 'c0_r0').setOrigin(0.5, 1).setScale(0.5).setDepth(4);
      this.cropTelegraph();
      // 레버는 손잡이가 잘리지 않은 프레임(c1_r2)만 쓰고, 당김은 기울기 트윈으로 표현한다.
      this.lever = this.add.image(900, DECK_Y - 20, 'fx_train_props', 'c1_r2').setOrigin(0.5, 1).setScale(0.45).setDepth(4);
      this.drawGauge(600, DECK_Y - 130);
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
    this.bind(Events.TELE_AMBUSH_START, (d: { words: string[] }) => this.startBatAmbush(d.words));
    this.bind(Events.TELE_BAT_TARGET, (d: { index: number; word: string }) => this.setBatTarget(d.index, d.word));
    this.bind(Events.TELE_BAT_TICK, (d: NonNullable<TelegramInfo['bat']>) => this.updateBatTimer(d));
    this.bind(Events.TELE_BAT_HIT, (d: { index: number }) => this.hitBat(d.index));
    this.bind(Events.TELE_BAT_MISSED, (d: { index: number }) => this.missBat(d.index));
    this.bind(Events.TELE_AMBUSH_END, () => this.endBatAmbush());
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
      this.clearBats();
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
    this.updateGauge(t.speed);
    this.distText?.setColor(t.dist < 60 ? '#ff4a4a' : t.dist < 140 ? '#ffb347' : '#fff2b0');
    this.warn?.setFillStyle(0xff2a2a, t.dist < 60 && !t.stopped ? this.reducedMotion ? 0.08 : 0.12 + 0.05 * Math.abs(Math.sin(this.time.now / 400)) : 0);
  }

  private pulseTelegraph() {
    AudioManager.sfx('tap', { rate: 1.6 });
    if (this.telegraph) {
      this.telegraph.setFrame('c1_r0'); this.cropTelegraph();
      this.time.delayedCall(120, () => { this.telegraph?.setFrame('c0_r0'); this.cropTelegraph(); });
    }
    // 전신기 이미지를 쓸 때 링 중심은 전신기 키 본체(x≈763, y≈630) 위. 840,715 는 코드 그래픽 폴백 시절 좌표라 레버 쪽에 떴다.
    const ring = this.add.ellipse(this.telegraph ? 763 : 840, DECK_Y - (this.telegraph ? 150 : 65), 40, 40, 0xfff2b0, 0.9).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
  }

  private cropTelegraph() {
    const f = this.telegraph?.frame;
    if (!f || !this.telegraph) return;
    this.telegraph.setCrop(0, 0, f.width, Math.max(1, 338 - f.y));
  }

  /** 압력 계기판: 놋쇠 테·크림색 문자판·빨간 위험 구간·바늘. 바늘은 속도(기본 2m/s = 1.0)에 따라 돈다 */
  private drawGauge(cx: number, cy: number) {
    const g = this.add.graphics().setDepth(4);
    g.fillStyle(0x3a2a1a, 1).fillRoundedRect(cx - 14, cy + 40, 28, 70, 6); // 받침 기둥
    g.fillStyle(0xb8862e, 1).fillRoundedRect(cx - 26, cy + 42, 52, 16, 5);
    g.fillStyle(0x2b2320, 1).fillCircle(cx, cy, 64);
    g.fillStyle(0xd7a648, 1).fillCircle(cx, cy, 60);
    g.fillStyle(0xf3e5c0, 1).fillCircle(cx, cy, 48);
    g.lineStyle(9, 0xe0473f, 1).beginPath().arc(cx, cy, 40, Phaser.Math.DegToRad(-20), Phaser.Math.DegToRad(50), false).strokePath(); // 위험 구간
    g.lineStyle(3, 0x3a2a1a, 1);
    for (let i = 0; i <= 8; i++) { const a = Phaser.Math.DegToRad(-220 + i * 33.75); g.lineBetween(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40, cx + Math.cos(a) * 33, cy + Math.sin(a) * 33); }
    for (let i = 0; i < 6; i++) { const a = Phaser.Math.DegToRad(i * 60); g.fillStyle(0x8d6a2c, 1).fillCircle(cx + Math.cos(a) * 55, cy + Math.sin(a) * 55, 4); }
    this.gaugeNeedle = this.add.graphics().setDepth(5);
    this.gaugeNeedle.setPosition(cx, cy);
    this.gaugeNeedle.fillStyle(0x2b2320, 1).fillTriangle(-4, 4, 4, 4, 0, -36).fillCircle(0, 0, 6);
    this.gaugeNeedle.fillStyle(0xd7a648, 1).fillCircle(0, 0, 3);
    this.updateGauge(this.speed);
  }

  private updateGauge(speed: number) {
    if (!this.gaugeNeedle) return;
    const ratio = Phaser.Math.Clamp(speed / 2, 0, 1.4);
    if (Math.abs(ratio - this.gaugeRatio) < 0.01 && this.gaugeNeedle.angle !== 0) return;
    this.gaugeRatio = ratio;
    // 0 → -130°, 기본 속도(1.0) → +20°(위험 구간 시작), 최대 → +60°
    const target = -130 + ratio * 150;
    if (this.reducedMotion) this.gaugeNeedle.setAngle(target);
    else { this.tweens.killTweensOf(this.gaugeNeedle); this.tweens.add({ targets: this.gaugeNeedle, angle: target, duration: 400, ease: 'Sine.easeOut' }); }
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
      this.tweens.killTweensOf(this.lever);
      this.lever.setAngle(0);
      if (!this.reducedMotion) this.tweens.add({ targets: this.lever, angle: -14, duration: 160, yoyo: true, hold: 380, ease: 'Sine.easeInOut', onComplete: () => this.lever?.setAngle(0) });
    }
    if (this.shakeOn && !this.reducedMotion) this.cameras.main.shake(300, 0.01);
    const t = this.add.text(DESIGN_W / 2, 520, this.english ? `Brake ${stage} engaged!` : `브레이크 ${stage}단!`, styleText(56, '#ffd34d')).setOrigin(0.5).setDepth(27).setScale(this.reducedMotion ? 1 : 0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: 480, duration: 500, delay: 900, onComplete: () => t.destroy() });
    if (!this.reducedMotion) this.sparks?.explode(40, 500, DECK_Y + 60);
  }

  /** 앞쪽에서 네 마리가 동시에 들이닥치고, 현재 입력 대상만 플레이어 쪽으로 파고든다. */
  private startBatAmbush(words: string[]) {
    this.clearBats();
    registerSheetAnims(this, 'mon_letter_bat');
    this.ambushStartedAt = this.time.now;
    this.activeBat = -1;
    const positions = [
      { x: 1040, y: 370 }, { x: 1270, y: 510 }, { x: 1510, y: 345 }, { x: 1735, y: 555 },
    ];
    this.batBases = positions;
    this.bats = positions.map((pos, i) => {
      const shadow = this.add.ellipse(0, 66, 150, 28, 0x060713, 0.35);
      const sprite = this.add.sprite(0, 54, 'mon_letter_bat', 'idle_left').setOrigin(0.5, 1).setScale(0.72);
      sprite.play(anim('mon_letter_bat', 'walk_left'));
      const label = this.add.text(0, -86, words[i] ?? '', styleText(34, '#fff2b0')).setOrigin(0.5).setVisible(false)
        .setStroke('#251339', 8).setShadow(0, 5, '#000000', 8, true, true);
      const bat = this.add.container(this.reducedMotion ? pos.x : DESIGN_W + 260 + i * 90, pos.y, [shadow, sprite, label]).setDepth(18);
      bat.setScale(this.reducedMotion ? 1 : 0.28).setAlpha(this.reducedMotion ? 1 : 0.2);
      if (!this.reducedMotion) this.tweens.add({
        targets: bat, x: pos.x, scale: 1, alpha: 1, duration: 520 + i * 70, ease: 'Back.easeOut',
      });
      return bat;
    });
    this.batTimerText = this.add.text(DESIGN_W / 2, 205, '', styleText(48, '#fff2b0')).setOrigin(0.5).setDepth(27)
      .setStroke('#30132c', 10).setShadow(0, 5, '#000000', 10, true, true);
    this.batTimerBar = this.add.graphics().setDepth(27);
    const alert = this.add.text(DESIGN_W / 2, 300, this.english ? '⚠ BAT AMBUSH!' : '⚠ 박쥐 기습!', styleText(78, '#ff8278')).setOrigin(0.5).setDepth(28);
    if (this.reducedMotion) this.time.delayedCall(700, () => alert.destroy());
    else {
      alert.setScale(0.35);
      this.tweens.add({ targets: alert, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: alert, alpha: 0, y: 270, duration: 350, delay: 750, onComplete: () => alert.destroy() });
      if (this.shakeOn) this.cameras.main.shake(320, 0.012);
    }
  }

  private setBatTarget(index: number, word: string) {
    this.activeBat = index;
    for (let i = 0; i < this.bats.length; i++) {
      const bat = this.bats[i];
      const sprite = bat.getAt(1) as Phaser.GameObjects.Sprite | undefined;
      const label = bat.getAt(2) as Phaser.GameObjects.Text | undefined;
      label?.setText(i === index ? word : '').setVisible(i === index);
      sprite?.setTint(i === index ? 0xffd45f : 0xb7a7d8);
    }
    AudioManager.sfx('go', { rate: 1.65, gain: 0.45 });
  }

  private updateBatTimer(info: TelegramInfo['bat']) {
    if (!info.active || this.activeBat < 0) return;
    this.batTimerText?.setText(this.english
      ? `BAT ${info.index + 1}/${info.total}  ·  ${info.timeLeft.toFixed(1)}s`
      : `박쥐 ${info.index + 1}/${info.total}  ·  ${info.timeLeft.toFixed(1)}초`);
    const ratio = Phaser.Math.Clamp(info.timeLeft / info.timeLimit, 0, 1);
    this.batTimerBar?.clear();
    this.batTimerBar?.fillStyle(0x160e25, 0.9).fillRoundedRect(DESIGN_W / 2 - 230, 242, 460, 20, 10);
    this.batTimerBar?.fillStyle(ratio < 0.35 ? 0xff4f59 : 0xffd34d, 1).fillRoundedRect(DESIGN_W / 2 - 226, 246, 452 * ratio, 12, 6);
    const bat = this.bats[this.activeBat];
    const base = this.batBases[this.activeBat];
    if (!bat || !base || this.reducedMotion || this.time.now - this.ambushStartedAt < 560) return;
    const danger = 1 - ratio;
    bat.setX(Phaser.Math.Linear(base.x, 660, danger)).setY(base.y + Math.sin(this.time.now / 80) * 10).setScale(1 + danger * 0.42);
  }

  private hitBat(index: number) {
    const bat = this.bats[index];
    if (!bat?.active) return;
    const sprite = bat.getAt(1) as Phaser.GameObjects.Sprite | undefined;
    sprite?.clearTint().setFrame('hit');
    AudioManager.sfx('hit', { rate: 1.5, gain: 0.65 });
    this.player?.attack(() => {});
    if (this.reducedMotion) bat.setVisible(false);
    else this.tweens.add({ targets: bat, x: bat.x + 170, y: bat.y - 80, angle: 22, scale: 0.45, alpha: 0, duration: 300, ease: 'Quad.easeIn', onComplete: () => bat.setVisible(false) });
  }

  private missBat(index: number) {
    const bat = this.bats[index];
    if (!bat?.active) return;
    AudioManager.sfx('hurt', { gain: 0.7 });
    this.player?.hit();
    if (this.reducedMotion) bat.setVisible(false);
    else this.tweens.add({
      targets: bat, x: 570, y: DECK_Y - 160, scale: 1.45, alpha: 0, duration: 220, ease: 'Quad.easeIn',
      onComplete: () => bat.setVisible(false),
    });
    this.warn?.setFillStyle(0xff2a2a, 0.22);
    this.time.delayedCall(160, () => this.warn?.setFillStyle(0xff2a2a, 0));
  }

  private endBatAmbush() {
    this.activeBat = -1;
    this.batTimerText?.setText(this.english ? 'Ambush cleared — resume transmission!' : '기습 종료 — 전보를 계속 보내자!').setColor('#7ff0a0');
    this.batTimerBar?.clear();
    this.time.delayedCall(800, () => this.clearBats());
  }

  private clearBats() {
    for (const bat of this.bats) {
      this.tweens.killTweensOf(bat);
      if (bat.active) bat.destroy(true);
    }
    this.bats = [];
    this.batBases = [];
    this.batTimerText?.destroy();
    this.batTimerText = undefined;
    this.batTimerBar?.destroy();
    this.batTimerBar = undefined;
    this.activeBat = -1;
  }

  private onStop() {
    this.stopped = true;
    this.tweens.killTweensOf(this.lever ?? {});
    this.lever?.setAngle(-14);
    this.updateGauge(0);
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
