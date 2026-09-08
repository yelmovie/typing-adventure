import Phaser from 'phaser';
import { addBackground, ensureParticleTextures, styleText } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { Enemy } from '../entities/Enemy';
import { SaveSystem } from '../systems/SaveSystem';
import { getCharacter, getPet } from '../data/characters';
import { getStage } from '../data/stages';
import { getEnemy } from '../data/enemies';
import { EventBus, Events } from '../EventBus';
import { AudioManager, STAGE_BGM } from '../systems/AudioManager';
import { DESIGN_W, DESIGN_H } from '../Game';
import type { StageId } from '../types';
import type { BossInfo, BossCrystal } from '../systems/BossSystem';
import { playClassFx } from './ClassFx';

const PLAYER_POS = { x: 520, y: 800 };
const BOSS_POS = { x: 1380, y: 790 };
const CRYSTAL_COLORS = [0xffd34d, 0x4fc3f7, 0xa78bfa, 0x63e074, 0xff7ab6];

/**
 * 최종 보스 연출. P1 결정 5개가 보스 주위를 떠다니고, P2 낱말 큐가 어둠과 함께 밀려오고, P3 갑옷·코어·빛 폭발·밝은 성.
 */
export class BossScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private boss?: Enemy;
  private bg?: Phaser.GameObjects.Image;
  private crystals: { c: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; gem: Phaser.GameObjects.Image }[] = [];
  private queueTexts: Phaser.GameObjects.Text[] = [];
  private dark?: Phaser.GameObjects.Rectangle;
  private core?: Phaser.GameObjects.Ellipse;
  private phaseText?: Phaser.GameObjects.Text;
  private burst?: Phaser.GameObjects.Particles.ParticleEmitter;
  private shakeOn = true;
  private cls = 'brown_boy';
  private handlers: [string, (...args: never[]) => void][] = [];

  constructor() {
    super('Boss');
  }

  create(data: { stageId: StageId }) {
    const stage = getStage(data.stageId);
    this.bg = addBackground(this, stage.bgBattle);
    ensureParticleTextures(this);
    const save = SaveSystem.get();
    this.shakeOn = save.settings.screenShake;
    this.cls = save.profile.characterId;
    this.crystals = [];
    this.queueTexts = [];

    this.player = new Player(this, PLAYER_POS.x, PLAYER_POS.y, getCharacter(save.profile.characterId).sheet, 1.25);
    this.player.idle('right');
    this.player.setDepth(7);
    this.pet = new Pet(this, PLAYER_POS.x - 170, PLAYER_POS.y + 10, getPet(save.profile.petId).sheet, 0.62);
    this.pet.setDepth(6);
    const def = getEnemy(stage.enemies[0]);
    this.boss = new Enemy(this, BOSS_POS.x, BOSS_POS.y, def.sheet, 1.25 * def.scale);
    this.boss.setDepth(5);
    this.boss.sprite.setTint(0x9a8ad0); // 어둠에 물든 보스

    this.dark = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x0a0420, 0).setDepth(15);
    this.core = this.add.ellipse(BOSS_POS.x, BOSS_POS.y - 300, 90, 90, 0xfff2b0, 0).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.phaseText = this.add.text(DESIGN_W / 2, 150, '', styleText(60, '#a78bfa')).setOrigin(0.5).setDepth(25).setAlpha(0);
    this.burst = this.add.particles(0, 0, 'p_star', {
      lifespan: { min: 300, max: 800 }, speed: { min: 150, max: 450 }, scale: { start: 1.2, end: 0 }, rotate: { min: 0, max: 360 }, gravityY: 300,
      emitting: false, blendMode: Phaser.BlendModes.ADD, tint: [0xffd34d, 0xfff2b0, 0xa78bfa, 0xffffff],
    }).setDepth(20);

    this.bind(Events.BOSS_TICK, (b: BossInfo) => this.onTick(b));
    this.bind(Events.BOSS_PHASE, (d: { phase: number }) => this.onPhase(d.phase));
    this.bind(Events.BOSS_CRYSTAL_HIT, (d: { index: number }) => this.hitCrystal(d.index));
    this.bind(Events.BOSS_CRYSTAL_BREAK, (d: { index: number }) => this.breakCrystal(d.index));
    this.bind(Events.BOSS_QUEUE, (d: { queue: string[]; added?: string; bomb?: boolean; cleared?: boolean }) => this.renderQueue(d));
    this.bind(Events.BOSS_HIT, (d: { damage: number; perfect?: boolean; weak?: boolean }) => this.onBossHit(d));
    this.bind(Events.BOSS_DARK, (d: { hpLoss: number }) => this.onDark(d));
    this.bind(Events.BOSS_ARMOR, () => this.onArmor());
    this.bind(Events.BOSS_CORE, () => this.onCore());
    this.bind(Events.BOSS_FINAL, () => this.onFinal());
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { forgiven: boolean }) => this.onWrong(d));
    this.bind(Events.FEVER_CHANGED, (d: { level: number }) => { if (d.level >= 2) this.flash(d.level === 3 ? 0xffd34d : 0xffffff, 0.6); });
    this.bind(Events.STAGE_FAILED, () => this.player?.hit());
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

  private onTick(b: BossInfo) {
    this.dark?.setFillStyle(0x0a0420, b.darkness * 0.55);
    if (b.phase === 1 && this.crystals.length === 0) this.buildCrystals(b.crystals);
    if (b.phase === 1) {
      const cur = b.crystals.findIndex((c) => !c.broken);
      this.crystals.forEach((x, i) => x.label.setColor(i === cur ? '#ffd34d' : '#ffffff'));
    }
  }

  private buildCrystals(list: BossCrystal[]) {
    list.forEach((cr, i) => {
      const a = -Math.PI * 0.95 + (i / (list.length - 1)) * Math.PI * 0.9;
      const x = BOSS_POS.x + Math.cos(a) * 420;
      const y = BOSS_POS.y - 330 + Math.sin(a) * 170;
      const gem = this.add.image(0, 0, 'fx_crystals', `c${i}_r0`).setScale(0.62);
      const glow = this.add.ellipse(0, 0, 150, 190, CRYSTAL_COLORS[i % 5], 0.2).setBlendMode(Phaser.BlendModes.ADD);
      const label = this.add.text(0, -120, cr.word.text, styleText(46, '#ffffff')).setOrigin(0.5);
      const c = this.add.container(x, y, [glow, gem, label]).setDepth(10);
      this.tweens.add({ targets: c, y: y - 18, duration: 1200 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: glow, scale: 1.15, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });
      this.crystals.push({ c, label, gem });
    });
  }

  private hitCrystal(i: number) {
    const x = this.crystals[i];
    if (!x) return;
    AudioManager.sfx('tap', { rate: 1.3 });
    this.tweens.add({ targets: x.gem, scale: 0.5, duration: 60, yoyo: true });
    x.gem.setFrame(`c${i}_r1`); // 균열
    x.gem.setTintFill(0xffffff);
    playClassFx(this, this.cls, 'weak', PLAYER_POS, { x: x.c.x, y: x.c.y });
    this.time.delayedCall(80, () => x.gem.clearTint());
    this.burst?.explode(6, x.c.x, x.c.y);
  }

  private breakCrystal(i: number) {
    const x = this.crystals[i];
    if (!x) return;
    AudioManager.sfx('defeat', { rate: 1.4 });
    playClassFx(this, this.cls, 'strong', PLAYER_POS, { x: x.c.x, y: x.c.y });
    this.burst?.explode(40, x.c.x, x.c.y);
    if (this.shakeOn) this.cameras.main.shake(120, 0.005);
    x.gem.setFrame(`c${i}_r2`); // 산산조각
    x.label.setVisible(false);
    this.time.delayedCall(140, () => x.gem.setFrame(`c${i}_r3`)); // 폭발 빛
    this.tweens.add({ targets: x.c, scale: 1.6, alpha: 0, duration: 420, delay: 120, onComplete: () => x.c.setVisible(false) });
  }

  private onPhase(phase: number) {
    const txt = phase === 1 ? 'PHASE 1 · 결정을 부숴라' : phase === 2 ? 'PHASE 2 · 멈추지 마!' : 'PHASE 3 · 별빛의 문장';
    this.phaseText?.setText(txt).setAlpha(0).setScale(0.6);
    this.tweens.add({ targets: this.phaseText, alpha: 1, scale: 1, duration: 300, yoyo: true, hold: 1400 });
    AudioManager.sfx('fever', { rate: phase === 3 ? 0.8 : 1 });
    if (phase >= 2) {
      this.boss?.sprite.clearTint();
      this.boss?.sprite.setTint(phase === 3 ? 0xffffff : 0xc0b0e0);
      for (const x of this.crystals) x.c.setVisible(false);
    }
    if (phase === 3) {
      for (const t of this.queueTexts) t.destroy();
      this.queueTexts = [];
    }
  }

  private renderQueue(d: { queue: string[]; added?: string; bomb?: boolean; cleared?: boolean }) {
    for (const t of this.queueTexts) t.destroy();
    this.queueTexts = d.queue.map((w, i) => {
      const t = this.add.text(960, 300 + i * 78, w, styleText(i === 0 ? 62 : 46, i === 0 ? '#ffd34d' : '#d9d0ff')).setOrigin(0.5).setDepth(12);
      if (d.bomb && i === d.queue.length - 1) t.setColor('#ff6b6b').setText(`💣 ${w}`);
      if (d.added === w && i === d.queue.length - 1) {
        t.setX(1500).setAlpha(0);
        this.tweens.add({ targets: t, x: 960, alpha: 1, duration: 250, ease: 'Quad.easeOut' });
      }
      return t;
    });
    if (d.cleared) this.flash(0xffd34d, 0.6);
  }

  private onBossHit(d: { damage: number; perfect?: boolean; weak?: boolean }) {
    const b = this.boss;
    if (!b || b.dead) return;
    if (d.weak) {
      b.hit(false);
      return;
    }
    b.hit(!!d.perfect);
    playClassFx(this, this.cls, d.perfect ? 'perfect' : 'strong', PLAYER_POS, { x: b.sprite.x - 40, y: b.sprite.y - 280 });
    this.burst?.explode(d.perfect ? 34 : 18, b.sprite.x - 40, b.sprite.y - 260);
    const txt = this.add.text(b.sprite.x, b.sprite.y - 460, `-${d.damage}`, styleText(60, d.perfect ? '#ffd34d' : '#ffffff')).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: txt, y: txt.y - 90, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
    if (this.shakeOn) this.cameras.main.shake(140, 0.005);
  }

  private onDark(d: { hpLoss: number }) {
    AudioManager.sfx('hurt');
    this.boss?.attack(() => {
      this.player?.hit();
      if (this.shakeOn) this.cameras.main.shake(200, 0.008);
      if (d.hpLoss > 0) {
        const txt = this.add.text(PLAYER_POS.x, PLAYER_POS.y - 240, `-${d.hpLoss}`, styleText(44, '#ff6b6b')).setOrigin(0.5).setDepth(22);
        this.tweens.add({ targets: txt, y: PLAYER_POS.y - 320, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
      }
    });
  }

  private onCorrect(d: { perfect: boolean; combo: number }) {
    AudioManager.sfx(d.perfect ? 'perfect' : 'hit', { rate: AudioManager.comboRate(d.combo) });
    if (d.combo > 0 && d.combo % 5 === 0) AudioManager.sfx('combo', { rate: AudioManager.comboRate(d.combo) });
    this.player?.attack(() => {});
    this.pet?.cheer();
  }

  private onWrong(d: { forgiven: boolean }) {
    if (d.forgiven) return;
    AudioManager.sfx('miss');
    const s = this.player?.sprite;
    if (s) this.tweens.add({ targets: s, angle: -6, duration: 70, yoyo: true, repeat: 1, onComplete: () => s.setAngle(0) });
  }

  private flash(color: number, alpha: number) {
    const f = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, color, alpha).setDepth(30);
    this.tweens.add({ targets: f, alpha: 0, duration: 500, onComplete: () => f.destroy() });
  }

  /** 문장 1: 갑옷 파괴 */
  private onArmor() {
    AudioManager.sfx('bomb', { rate: 1.3 });
    this.boss?.hit(true);
    this.burst?.explode(80, BOSS_POS.x, BOSS_POS.y - 300);
    this.boss?.sprite.setTint(0x808090);
    if (this.shakeOn) this.cameras.main.shake(400, 0.012);
    this.core?.setFillStyle(0xfff2b0, 0.5);
    this.tweens.add({ targets: this.core, scale: 1.4, duration: 500, yoyo: true, repeat: -1 });
  }

  private onCore() {
    this.core?.setFillStyle(0xffffff, 0.9);
  }

  /** 마지막 Enter: 0.5초 정지 → PERFECT TYPE → 빛 폭발 → 밝은 성 */
  private onFinal() {
    this.tweens.pauseAll();
    this.time.delayedCall(500, () => {
      this.tweens.resumeAll();
      const txt = this.add.text(DESIGN_W / 2, 420, 'PERFECT TYPE!', styleText(110, '#fff2b0')).setOrigin(0.5).setDepth(35).setScale(0.3);
      this.tweens.add({ targets: txt, scale: 1, duration: 250, ease: 'Back.easeOut' });
      AudioManager.sfx('fever', { rate: 1.2 });
      this.time.delayedCall(400, () => {
        const white = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0xffffff, 0).setDepth(34);
        this.tweens.add({ targets: white, fillAlpha: 1, duration: 500, onComplete: () => {
          // 밝은 성: 배경을 밝게(이미지 오면 교체), 보스 소멸, 어둠 제거
          if (this.textures.exists('bg_bright_castle')) this.bg?.setTexture('bg_bright_castle');
          else this.bg?.setTint(0xfff2d0);
          this.dark?.setFillStyle(0x0a0420, 0);
          this.core?.setFillStyle(0xffffff, 0);
          this.boss?.defeat();
          this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0xfff2b0, 0.28).setDepth(14).setBlendMode(Phaser.BlendModes.ADD);
          this.add.particles(0, 0, 'p_star', { x: { min: 0, max: DESIGN_W }, y: { min: 0, max: DESIGN_H }, lifespan: 3000, speedY: { min: -60, max: -20 }, scale: { start: 0, end: 1 }, alpha: { start: 0, end: 0.9 }, tint: [0xfff2b0, 0xffd34d, 0xffffff], frequency: 40, blendMode: Phaser.BlendModes.ADD }).setDepth(16);
          this.player?.victory();
          this.pet?.victory();
          AudioManager.sfx('clear');
          this.tweens.add({ targets: white, fillAlpha: 0, duration: 900, onComplete: () => white.destroy() });
          this.tweens.add({ targets: txt, alpha: 0, duration: 600, delay: 600 });
        } });
      });
    });
  }
}
