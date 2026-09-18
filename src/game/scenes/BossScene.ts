import { t as tr, getLanguage } from '../i18n/Locale';
import Phaser from 'phaser';
import { addBackground, ensureParticleTextures, styleText, prefersReducedMotion } from './common';
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
import { BossImpact } from './BossImpact';

const PLAYER_POS = { x: 480, y: 760 }; // 발끝 760: 하단 입력 패널(830~) 위
const BOSS_POS = { x: 1490, y: 750 };
const CRYSTAL_COLORS = [0xffd34d, 0x4fc3f7, 0xa78bfa, 0x63e074, 0xff7ab6];

/**
 * 최종 보스 연출. P1 결정 5개가 보스 주위를 떠다니고, P2 낱말 큐가 어둠과 함께 밀려오고, P3 갑옷·코어·빛 폭발·밝은 성.
 */
export class BossScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private boss?: Enemy;
  private bg?: Phaser.GameObjects.Image;
  private crystals: { c: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; gem: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Ellipse; cracks: Phaser.GameObjects.Graphics; broken: boolean }[] = [];
  private queueTexts: Phaser.GameObjects.Text[] = [];
  private dark?: Phaser.GameObjects.Rectangle;
  private core?: Phaser.GameObjects.Ellipse;
  private phaseText?: Phaser.GameObjects.Text;
  private burst?: Phaser.GameObjects.Particles.ParticleEmitter;
  private shakeOn = true;
  private cls = 'brown_boy';
  private phase = 1;
  private lastGlyph = '✦';
  private impact?: BossImpact;
  private armor?: Phaser.GameObjects.Graphics;
  private finalMarks: Phaser.GameObjects.Rectangle[] = [];
  private finalRole: string | null = null;
  private finalStepShown = 0;
  private finishing = false;
  private handlers: [string, (...args: never[]) => void][] = [];

  constructor() {
    super('Boss');
  }

  create(data: { stageId: StageId }) {
    const stage = getStage(data.stageId);
    this.bg = addBackground(this, stage.bgBattle);
    ensureParticleTextures(this);
    const save = SaveSystem.get();
    this.shakeOn = save.settings.screenShake && !prefersReducedMotion();
    this.cls = save.profile.characterId;
    this.crystals = [];
    this.queueTexts = [];
    this.phase = 1;
    this.finishing = false;
    this.finalRole = null;
    this.finalStepShown = 0;
    this.finalMarks = [];
    this.impact = new BossImpact(this);

    this.player = new Player(this, PLAYER_POS.x, PLAYER_POS.y, getCharacter(save.profile.characterId).sheet, 1.25);
    this.player.idle('right');
    this.player.setDepth(7);
    this.player.setLively(true);
    this.pet = new Pet(this, PLAYER_POS.x - 170, PLAYER_POS.y + 10, getPet(save.profile.petId).sheet, 0.62);
    this.pet.setDepth(6);
    const def = getEnemy(stage.enemies[0]);
    // The attack atlas is taller than idle (265px vs 208px of visible paint).
    // Fit the entire attack, including the keys above its head, below the HUD.
    this.boss = new Enemy(this, BOSS_POS.x, BOSS_POS.y, def.sheet, Math.min(2, def.scale));
    this.boss.setDepth(5);
    this.boss.sprite.setTint(0x9a8ad0); // 어둠에 물든 보스

    this.dark = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x0a0420, 0).setDepth(15);
    this.core = this.add.ellipse(BOSS_POS.x, BOSS_POS.y - 240, 86, 86, 0xfff2b0, 0).setStrokeStyle(5, 0xffdf83, 0).setDepth(9);
    this.armor = this.add.graphics().setDepth(9);
    const followBody = () => {
      const dx = (this.boss?.sprite.x ?? BOSS_POS.x) - BOSS_POS.x;
      this.core?.setX(BOSS_POS.x + dx);
      this.armor?.setX(dx);
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, followBody);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.UPDATE, followBody));
    this.phaseText = this.add.text(DESIGN_W / 2, 640, '', styleText(60, '#a78bfa')).setOrigin(0.5).setDepth(25).setAlpha(0);
    this.burst = this.add.particles(0, 0, 'p_star', {
      lifespan: { min: 300, max: 800 }, speed: { min: 150, max: 450 }, scale: { start: 1.2, end: 0 }, rotate: { min: 0, max: 360 }, gravityY: 300,
      emitting: false, blendMode: Phaser.BlendModes.ADD, tint: [0xffd34d, 0xfff2b0, 0xa78bfa, 0xffffff],
    }).setDepth(20);

    this.bind(Events.BOSS_TICK, (b: BossInfo) => this.onTick(b));
    this.bind(Events.BOSS_PHASE, (d: { phase: number }) => this.onPhase(d.phase));
    this.bind(Events.BOSS_CRYSTAL_HIT, (d: { index: number; hp?: number; maxHp?: number }) => this.hitCrystal(d.index, d.hp, d.maxHp));
    this.bind(Events.BOSS_CRYSTAL_BREAK, (d: { index: number }) => this.breakCrystal(d.index));
    this.bind(Events.BOSS_QUEUE, (d: { queue: string[]; added?: string; bomb?: boolean; cleared?: boolean }) => this.renderQueue(d));
    this.bind(Events.BOSS_HIT, (d: { damage: number; perfect?: boolean; weak?: boolean; phase?: number }) => this.onBossHit(d));
    this.bind(Events.BOSS_DARK, (d: { hpLoss: number }) => this.onDark(d));
    this.bind(Events.BOSS_ARMOR, () => this.onArmor());
    this.bind(Events.BOSS_CORE, () => this.onCore());
    this.bind(Events.BOSS_FINAL, () => this.onFinal());
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { forgiven: boolean }) => this.onWrong(d));
    this.bind(Events.FEVER_CHANGED, (d: { level: number }) => { if (d.level >= 2) this.flash(0xffd34d, 0.28); });
    this.bind(Events.PET_ACTIVE, () => this.pet?.skill());
    this.bind(Events.IDLE_DRAIN, () => { this.player?.hit(); AudioManager.sfx('hurt', { gain: 0.5 }); });
    this.bind(Events.PET_PASSIVE, () => this.pet?.skill());
    this.bind(Events.SYLLABLE_HIT, (d: { index: number; target: { text: string } }) => {
      this.lastGlyph = [...d.target.text][d.index] ?? '✦';
    });
    this.bind(Events.STAGE_FAILED, () => this.player?.hit());
    this.bind(Events.PLAYER_MOVE, (d: { dir: 'left' | 'right' | 'up' | 'down'; pressed: boolean }) => {
      if (!this.player) return;
      if (d.dir === 'up' && d.pressed) this.player.jump();
      else if (d.dir === 'down') this.player.crouch(d.pressed);
      else if (d.pressed) this.player.nudge(d.dir === 'right' ? 22 : -22);
    });
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

  private onTick(b: BossInfo) {
    this.dark?.setFillStyle(0x0a0420, b.darkness * 0.55);
    if (b.phase === 1 && this.crystals.length === 0) this.buildCrystals(b.crystals);
    if (b.phase === 1) {
      const cur = b.currentCrystalIndex;
      this.crystals.forEach((x, i) => x.label.setColor(i === cur ? '#ffd34d' : '#ffffff'));
    }
    if (b.phase === 3) this.renderFinalState(b);
  }

  private buildCrystals(list: BossCrystal[]) {
    list.forEach((cr, i) => {
      const progress = list.length > 1 ? i / (list.length - 1) : 0.5;
      // Leave a clear column for the player / boss HUD at the left edge.
      const x = 970 + progress * 800;
      const y = 445 - Math.sin(progress * Math.PI) * 55;
      const gem = this.add.image(0, 0, 'fx_crystals', `c${i}_r0`).setScale(0.5);
      const glow = this.add.ellipse(0, 0, 118, 152, CRYSTAL_COLORS[i % 5], 0.16).setBlendMode(Phaser.BlendModes.ADD);
      const label = this.add.text(0, -88, cr.word.text, { ...styleText(40, '#ffffff'), align: 'center', wordWrap: { width: 196, useAdvancedWrap: true } }).setOrigin(0.5, 1);
      const cracks = this.add.graphics();
      const c = this.add.container(x, y, [glow, gem, cracks, label]).setDepth(10);
      if (cr.broken) {
        // Resumed battle: crystals broken before the reload stay broken.
        glow.setVisible(false); gem.setVisible(false);
        label.setText('✓').setColor('#ffdf83');
      } else if (!prefersReducedMotion()) {
        this.tweens.add({ targets: c, y: y - 8, duration: 1200 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, scale: 1.15, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });
      }
      this.crystals.push({ c, label, gem, glow, cracks, broken: cr.broken });
    });
  }

  private hitCrystal(i: number, hp = 1, maxHp = 2) {
    const x = this.crystals[i];
    if (!x || x.broken) return;
    this.impact?.launch(this.muzzle(), { x: x.c.x, y: x.c.y }, 'weak', this.lastGlyph, () => {
      if (!x.c.active || x.broken) return;
      AudioManager.sfx('tap', { rate: 1.2 });
      x.gem.setFrame(`c${i}_r1`);
      x.cracks.clear().lineStyle(4, 0xfff3c4, 0.95);
      x.cracks.beginPath().moveTo(0, -42).lineTo(-12, -10).lineTo(8, 10).lineTo(-7, 40).strokePath();
      if (hp / Math.max(1, maxHp) < 0.55) x.cracks.beginPath().moveTo(-28, -8).lineTo(-8, 0).lineTo(25, -18).moveTo(6, 12).lineTo(28, 32).strokePath();
    });
  }

  private breakCrystal(i: number) {
    const x = this.crystals[i];
    if (!x || x.broken) return;
    x.broken = true;
    this.impact?.launch(this.muzzle(), { x: x.c.x, y: x.c.y }, 'strong', getLanguage() === 'en' ? 'OK' : '완', () => {
      if (!x.c.active) return;
      AudioManager.sfx('defeat', { rate: 1.3 });
      this.tweens.killTweensOf([x.c, x.glow, x.gem]);
      x.cracks.setVisible(false); x.glow.setVisible(false);
      x.gem.setFrame(`c${i}_r2`);
      x.label.setText('✓').setColor('#ffdf83');
      if (!prefersReducedMotion()) {
        this.burst?.explode(14, x.c.x, x.c.y);
        this.tweens.add({ targets: x.gem, y: 30, alpha: 0, duration: 320 });
      } else x.gem.setVisible(false);
      if (this.shakeOn) this.cameras.main.shake(85, 0.0025);
    });
  }

  private onPhase(phase: number) {
    this.phase = phase;
    const txt = phase === 1 ? 'PHASE 1 · 결정을 부숴라' : phase === 2 ? 'PHASE 2 · 멈추지 마!' : 'PHASE 3 · 별빛의 장문';
    // Later phases already have a DOM transition banner in BattleScreen.
    this.phaseText?.setText(tr(txt)).setAlpha(phase === 1 ? 1 : 0).setScale(1);
    this.time.delayedCall(1400, () => this.phaseText?.setAlpha(0));
    AudioManager.sfx('fever', { rate: phase === 3 ? 0.8 : 1 });
    if (phase >= 2) {
      this.boss?.sprite.clearTint();
      this.boss?.sprite.setTint(phase === 3 ? 0xffffff : 0xc0b0e0);
      // Keep the last crystal on screen until its projectile has hit and it breaks.
      this.time.delayedCall(650, () => { for (const x of this.crystals) x.c.setVisible(false); });
    }
    if (phase === 3) {
      for (const t of this.queueTexts) t.destroy();
      this.queueTexts = [];
    }
  }

  private renderQueue(d: { queue: string[]; added?: string; bomb?: boolean; cleared?: boolean }) {
    for (const t of this.queueTexts) t.destroy();
    this.queueTexts = d.queue.map((w, i) => {
      const t = this.add.text(880, 330 + i * 75, w, { ...styleText(i === 0 ? 52 : 40, i === 0 ? '#ffd34d' : '#d9d0ff'), align: 'center', wordWrap: { width: 420, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(12);
      if (d.bomb && i === d.queue.length - 1) t.setColor('#ff6b6b').setText(w);
      if (d.added === w && i === d.queue.length - 1 && !prefersReducedMotion()) {
        t.setX(1400).setAlpha(0);
        this.tweens.add({ targets: t, x: 880, alpha: 1, duration: 250, ease: 'Quad.easeOut' });
      }
      return t;
    });
    if (d.cleared) this.flash(0xffd34d, 0.28);
  }

  private muzzle() { return { x: (this.player?.x ?? PLAYER_POS.x) + 70, y: PLAYER_POS.y - 155 }; }

  private onBossHit(d: { damage: number; perfect?: boolean; weak?: boolean; phase?: number }) {
    const b = this.boss;
    if (!b || b.dead) return;
    const level = d.weak ? 'weak' : d.perfect ? 'perfect' : 'strong';
    const target = { x: BOSS_POS.x - 35, y: BOSS_POS.y - 235 };
    this.impact?.launch(this.muzzle(), target, level, d.weak ? this.lastGlyph : getLanguage() === 'en' ? 'OK' : '완', () => {
      if (b.dead || !b.sprite.active) return;
      b.hit(!d.weak);
      AudioManager.sfx(d.weak ? 'tap' : d.perfect ? 'perfect' : 'hit', { rate: d.weak ? 1.15 : 0.9 });
      if (!d.weak) {
        playClassFx(this, this.cls, d.perfect ? 'perfect' : 'strong', PLAYER_POS, target);
        this.impact?.damage(target, d.damage, d.perfect);
        if (this.shakeOn) this.cameras.main.shake(110, 0.0035);
      }
    });
  }

  private onDark(d: { hpLoss: number }) {
    AudioManager.sfx('hurt');
    this.boss?.attack(() => {
      this.player?.hit();
      if (this.shakeOn) this.cameras.main.shake(200, 0.008);
      if (d.hpLoss > 0) {
        const txt = this.add.text(PLAYER_POS.x, PLAYER_POS.y - 240, `-${d.hpLoss}`, styleText(44, '#ff6b6b')).setOrigin(0.5).setDepth(22);
        if (prefersReducedMotion()) this.time.delayedCall(600, () => txt.destroy());
        else this.tweens.add({ targets: txt, y: PLAYER_POS.y - 320, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
      }
    });
  }

  private onCorrect(d: { perfect: boolean; combo: number }) {
    if (d.combo > 0 && d.combo % 5 === 0) AudioManager.sfx('combo', { rate: AudioManager.comboRate(d.combo) });
    this.player?.attack(() => {});
    this.pet?.cheer();
  }

  private onWrong(d: { forgiven: boolean }) {
    if (d.forgiven) return;
    AudioManager.sfx('miss');
    this.player?.hit();
  }

  private flash(color: number, alpha: number) {
    if (prefersReducedMotion()) return;
    const f = this.add.ellipse(BOSS_POS.x - 30, BOSS_POS.y - 220, 210, 160, color, alpha).setDepth(8);
    this.tweens.add({ targets: f, alpha: 0, duration: 320, onComplete: () => f.destroy() });
  }

  private renderFinalState(b: BossInfo) {
    const role = b.finalRole ?? (b.coreExposed ? 'finale' : b.armorBroken ? 'core' : 'armor');
    const total = b.finalTotal ?? 3, step = b.finalStep ?? 1;
    if (role === this.finalRole && step === this.finalStepShown) return;
    this.finalRole = role;
    this.finalStepShown = step;
    for (const mark of this.finalMarks) mark.destroy();
    this.finalMarks = [];
    // 장문(6문장)도 보스 발치에 들어가게 간격을 줄인다.
    const gap = total > 3 ? 44 : 64, size = total > 3 ? 24 : 30;
    for (let i = 0; i < total; i++) {
      this.finalMarks.push(this.add.rectangle(BOSS_POS.x - 260 - (total - 1) * (gap / 2) + i * gap, BOSS_POS.y - 62, size, size,
        i < step - 1 ? 0xffd879 : 0x172644, 0.95).setAngle(45).setStrokeStyle(4, i === step - 1 ? 0xfff0b2 : 0x7593b2).setDepth(11).setName(`boss-final-seal-${i + 1}`));
    }
    this.armor?.clear();
    if (role === 'armor') {
      this.armor?.lineStyle(8, 0x97b9dc, 0.8).strokeRoundedRect(BOSS_POS.x - 68, BOSS_POS.y - 306, 136, 128, 18);
      this.armor?.lineStyle(8, 0x7095c0, 0.9).lineBetween(BOSS_POS.x - 56, BOSS_POS.y - 240, BOSS_POS.x + 56, BOSS_POS.y - 240);
      this.core?.setFillStyle(0x6ea7da, 0.2).setStrokeStyle(4, 0x9ac3ed, 0.75);
    } else {
      this.core?.setFillStyle(role === 'core' ? 0xffd879 : 0xfff0b2, role === 'core' ? 0.45 : 0.85).setStrokeStyle(role === 'core' ? 5 : 8, 0xffe6a4, 1);
    }
  }

  /** 문장 1: 갑옷 파괴 */
  private onArmor() {
    this.time.delayedCall(prefersReducedMotion() ? 0 : 280, () => {
      AudioManager.sfx('bomb', { rate: 0.9, gain: 0.65 });
      this.armor?.clear();
      if (!prefersReducedMotion()) {
        for (const dx of [-62, 62]) {
          const plate = this.add.rectangle(BOSS_POS.x + dx, BOSS_POS.y - 235, 46, 88, 0x7999bb).setStrokeStyle(4, 0xc0d4e8).setDepth(12);
          this.tweens.add({ targets: plate, x: plate.x + dx, y: plate.y + 130, angle: dx, alpha: 0, duration: 470, onComplete: () => plate.destroy() });
        }
      }
      this.core?.setFillStyle(0xffdf83, 0.5);
    });
  }

  private onCore() {
    this.time.delayedCall(prefersReducedMotion() ? 0 : 280, () => this.core?.setFillStyle(0xffefb1, 0.85));
  }

  /** The last impact resolves first. No global tween pause or input/time freeze. */
  private onFinal() {
    if (this.finishing || this.phase !== 3) return;
    this.finishing = true;
    this.time.delayedCall(450, () => {
      const txt = this.add.text(DESIGN_W / 2, 440, 'PERFECT TYPE!', styleText(88, '#fff2b0')).setOrigin(0.5).setDepth(35);
      this.phaseText?.setAlpha(0);
      this.armor?.clear();
      this.finalMarks.forEach(mark => mark.setFillStyle(0xffdf83));
      this.dark?.setFillStyle(0x0a0420, 0);
      this.core?.setFillStyle(0xffefb1, 0).setStrokeStyle(0);
      this.boss?.defeat();
      if (this.textures.exists('bg_bright_castle')) this.bg?.setTexture('bg_bright_castle');
      else this.bg?.setTint(0xfff2d0);
      if (!prefersReducedMotion()) this.burst?.explode(28, BOSS_POS.x, BOSS_POS.y - 220);
      this.player?.victory(); this.pet?.victory();
      AudioManager.sfx('clear');
      this.time.delayedCall(2000, () => txt.destroy());
    });
  }
}
