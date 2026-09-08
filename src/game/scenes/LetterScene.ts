import Phaser from 'phaser';
import { addBackground, ensureParticleTextures, styleText } from './common';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { SaveSystem } from '../systems/SaveSystem';
import { getCharacter, getPet } from '../data/characters';
import { getStage } from '../data/stages';
import { EventBus, Events } from '../EventBus';
import { AudioManager, STAGE_BGM } from '../systems/AudioManager';
import { DESIGN_W, DESIGN_H } from '../Game';
import type { StageId } from '../types';
import type { BattleSnapshot } from '../systems/BattleSystem';
import { LETTER } from '../systems/LetterSystem';

const PAPER = { x: 800, y: 520, w: 880, h: 360 }; // 콤보(y≤290) 아래 · 좌측 패널(x≤330)/캐릭터(x≤260) 오른쪽 · 룬 줄(≈746)까지 하단 패널(830) 위
const GATE = { x: 1560, y: 470 };

/**
 * 사막 유적 편지 복원 연출. 가운데 양피지에 완성된 문장이 쌓이고, 어절 룬이 켜지고, 오른쪽 황금문의 자물쇠가 하나씩 열린다.
 */
export class LetterScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private lineTexts: Phaser.GameObjects.Text[] = [];
  private runes: Phaser.GameObjects.Container[] = [];
  private runeRow?: Phaser.GameObjects.Container;
  private locks: Phaser.GameObjects.Image[] = [];
  private gateGlow?: Phaser.GameObjects.Ellipse;
  private hourglass?: Phaser.GameObjects.Image;
  private sparkle?: Phaser.GameObjects.Particles.ParticleEmitter;
  private handlers: [string, (...args: never[]) => void][] = [];

  constructor() {
    super('Letter');
  }

  preload() {
    this.load.image('ui_lock', './assets/ui/icon_lock.webp');
    this.load.image('ui_unlock', './assets/ui/icon_unlock.webp');
    this.load.image('ui_clock', './assets/ui/icon_clock.webp');
  }

  create(data: { stageId: StageId }) {
    const stage = getStage(data.stageId);
    addBackground(this, stage.bgBattle);
    ensureParticleTextures(this);
    const save = SaveSystem.get();
    this.lineTexts = [];
    this.runes = [];
    this.locks = [];

    // 양피지
    const g = this.add.graphics().setDepth(4);
    g.fillStyle(0x1a1f4a, 0.9);
    g.fillRoundedRect(PAPER.x - PAPER.w / 2 + 8, PAPER.y - PAPER.h / 2 + 10, PAPER.w, PAPER.h, 22);
    g.fillStyle(0xf3e5c0, 1);
    g.fillRoundedRect(PAPER.x - PAPER.w / 2, PAPER.y - PAPER.h / 2, PAPER.w, PAPER.h, 22);
    g.lineStyle(6, 0x8a6a3a, 1);
    g.strokeRoundedRect(PAPER.x - PAPER.w / 2, PAPER.y - PAPER.h / 2, PAPER.w, PAPER.h, 22);
    this.add.text(PAPER.x, PAPER.y - PAPER.h / 2 + 34, '잊힌 탐험가의 편지', { ...styleText(30, '#5a3a10', '#f3e5c0'), strokeThickness: 2, shadow: undefined }).setOrigin(0.5).setDepth(5);
    for (let i = 0; i < LETTER.sentences; i++) {
      const t = this.add.text(PAPER.x - PAPER.w / 2 + 50, PAPER.y - PAPER.h / 2 + 86 + i * 44, '· · · · · · · · · · · ·', { ...styleText(28, '#b9a888', '#f3e5c0'), strokeThickness: 0, shadow: undefined }).setOrigin(0, 0.5).setDepth(5);
      this.lineTexts.push(t);
    }
    this.runeRow = this.add.container(PAPER.x, PAPER.y + PAPER.h / 2 + 46).setDepth(6);

    // 황금문 + 자물쇠 3개
    const door = this.add.graphics().setDepth(3);
    door.fillStyle(0x3a2a10, 1);
    door.fillRoundedRect(GATE.x - 150, GATE.y - 260, 300, 520, { tl: 150, tr: 150, bl: 10, br: 10 });
    door.fillStyle(0xd9a52a, 1);
    door.fillRoundedRect(GATE.x - 130, GATE.y - 240, 260, 480, { tl: 130, tr: 130, bl: 8, br: 8 });
    door.lineStyle(8, 0x7a4a00, 1);
    door.strokeRoundedRect(GATE.x - 130, GATE.y - 240, 260, 480, { tl: 130, tr: 130, bl: 8, br: 8 });
    this.gateGlow = this.add.ellipse(GATE.x, GATE.y, 340, 560, 0xfff2b0, 0).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < LETTER.locks; i++) {
      const l = this.add.image(GATE.x, GATE.y - 120 + i * 130, 'ui_lock').setDisplaySize(84, 84).setDepth(5);
      this.locks.push(l);
    }

    this.player = new Player(this, 150, 760, getCharacter(save.profile.characterId).sheet, 1.05);
    this.player.idle('right');
    this.player.setDepth(7);
    this.player.setLively(true);
    this.pet = new Pet(this, 275, 770, getPet(save.profile.petId).sheet, 0.5);
    this.pet.setDepth(6);

    this.hourglass = this.add.image(PAPER.x + PAPER.w / 2 - 50, PAPER.y - PAPER.h / 2 + 34, 'ui_clock').setDisplaySize(40, 40).setDepth(6).setAlpha(0);
    this.sparkle = this.add.particles(0, 0, 'p_star', {
      lifespan: { min: 400, max: 900 }, speed: { min: 60, max: 220 }, scale: { start: 0.9, end: 0 }, gravityY: 200, emitting: false, blendMode: Phaser.BlendModes.ADD, tint: [0xffd34d, 0xfff2b0, 0xffffff, 0x63e074],
    }).setDepth(20);

    this.bind(Events.TARGET_CHANGED, (s: BattleSnapshot) => this.buildRunes(s));
    this.bind(Events.LETTER_RUNE, (d: { index: number }) => this.lightRune(d.index));
    this.bind(Events.LETTER_CRACK, (d: { index: number }) => this.crackRune(d.index, true));
    this.bind(Events.LETTER_RESTORE, (d: { index: number }) => this.crackRune(d.index, false));
    this.bind(Events.LETTER_GLOW, () => this.glowAll());
    this.bind(Events.LETTER_LINE, (d: { index: number; text: string; perfect: boolean; wrong?: boolean }) => this.writeLine(d));
    this.bind(Events.LETTER_LOCK, (d: { lock: number }) => this.openLock(d.lock - 1));
    this.bind(Events.SYLLABLE_HIT, () => { if (Math.random() < 0.5) this.player?.jab(); });
    this.bind(Events.PET_ACTIVE, () => this.pet?.skill());
    this.bind(Events.IDLE_DRAIN, () => { this.player?.hit(); AudioManager.sfx('hurt', { gain: 0.5 }); });
    this.bind(Events.PET_PASSIVE, () => this.pet?.skill());
    this.bind(Events.LETTER_IDLE, (d: { idle: boolean }) => this.tweens.add({ targets: this.hourglass, alpha: d.idle ? 1 : 0, duration: 300 }));
    this.bind(Events.LETTER_GATE, () => this.openGate());
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { forgiven: boolean }) => { if (!d.forgiven) AudioManager.sfx('miss'); });
    this.bind(Events.PLAYER_MOVE, (d: { dir: 'left' | 'right' | 'up' | 'down'; pressed: boolean }) => {
      if (!this.player) return;
      if (d.dir === 'up' && d.pressed) this.player.jump();
      else if (d.dir === 'down') this.player.crouch(d.pressed);
      else if (d.pressed) this.player.nudge(d.dir === 'right' ? 22 : -22);
    });
    this.bind(Events.STAGE_FAILED, () => this.player?.hit());
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

  /** 현재 문장의 어절 수만큼 룬 */
  private buildRunes(s: BattleSnapshot) {
    const info = s.letter;
    if (!this.runeRow || !info) return;
    this.runeRow.removeAll(true);
    this.runes = [];
    const n = info.runes.length;
    const gap = Math.min(90, 800 / Math.max(1, n));
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * gap;
      const back = this.add.ellipse(0, 0, 44, 44, 0x2a1a08, 0.8);
      const gem = this.add.star(0, 0, 4, 8, 20, 0x7a6a4a, 1);
      const c = this.add.container(x, 0, [back, gem]);
      c.setData('gem', gem);
      this.runeRow.add(c);
      this.runes.push(c);
      if (info.runes[i] === 'on') this.lightRune(i, true);
    }
  }

  private lightRune(i: number, silent = false) {
    const c = this.runes[i];
    if (!c) return;
    const gem = c.getData('gem') as Phaser.GameObjects.Star;
    gem.setFillStyle(0xffd34d, 1);
    if (silent) return;
    AudioManager.sfx('tap', { rate: 1.2 + i * 0.05 });
    this.player?.jab();
    this.tweens.add({ targets: c, scale: 1.5, duration: 120, yoyo: true });
    this.sparkle?.explode(8, this.runeRow!.x + c.x, this.runeRow!.y);
  }

  private crackRune(i: number, crack: boolean) {
    const c = this.runes[i];
    if (!c) return;
    const gem = c.getData('gem') as Phaser.GameObjects.Star;
    gem.setFillStyle(crack ? 0xff6b6b : 0x7a6a4a, 1);
    if (crack) this.tweens.add({ targets: c, x: c.x + 6, duration: 50, yoyo: true, repeat: 3 });
  }

  private glowAll() {
    AudioManager.sfx('combo', { rate: 1.3 });
    for (const c of this.runes) this.tweens.add({ targets: c, scale: 1.3, duration: 200, yoyo: true, repeat: 1 });
    this.sparkle?.explode(30, PAPER.x, PAPER.y + PAPER.h / 2 + 46);
  }

  private writeLine(d: { index: number; text: string; perfect: boolean; wrong?: boolean }) {
    const t = this.lineTexts[d.index];
    if (!t) return;
    t.setText(d.text).setColor(d.wrong ? '#b56a6a' : d.perfect ? '#b8600a' : '#3a2a10').setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, x: t.x + 6, duration: 400, ease: 'Sine.easeOut' });
    this.sparkle?.explode(d.perfect ? 30 : 14, t.x + 200, t.y);
  }

  private openLock(i: number) {
    const l = this.locks[i];
    if (!l) return;
    AudioManager.sfx('coin', { rate: 0.8 + i * 0.15 });
    this.tweens.add({ targets: l, scale: l.scale * 1.4, angle: -15, duration: 200, yoyo: true, onYoyo: () => l.setTexture('ui_unlock') });
    this.sparkle?.explode(40, l.x, l.y);
    this.cameras.main.shake(120, 0.003);
  }

  private onCorrect(d: { perfect: boolean; combo: number }) {
    AudioManager.sfx(d.perfect ? 'perfect' : 'hit', { rate: AudioManager.comboRate(d.combo) });
    this.pet?.cheer();
    this.player?.hop();
    this.player?.cheer();
    this.time.delayedCall(900, () => this.player?.idle('right'));
  }

  /** 마지막 글자: 문이 열리며 빛이 쏟아진다 */
  private openGate() {
    AudioManager.sfx('clear');
    this.tweens.add({ targets: this.gateGlow, fillAlpha: 0.9, scale: 1.4, duration: 1200, ease: 'Sine.easeOut' });
    const beam = this.add.rectangle(GATE.x, DESIGN_H / 2, 200, DESIGN_H, 0xfff2b0, 0).setDepth(28).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: beam, fillAlpha: 0.8, scaleX: 4, duration: 1000, delay: 300 });
    this.add.particles(GATE.x, GATE.y, 'p_star', {
      lifespan: 2000, speed: { min: 200, max: 600 }, scale: { start: 1.3, end: 0 }, quantity: 4, frequency: 25, duration: 1800, tint: [0xfff2b0, 0xffd34d, 0xffffff], blendMode: Phaser.BlendModes.ADD,
    }).setDepth(27);
    this.time.delayedCall(500, () => { this.player?.victory(); this.pet?.victory(); });
    void DESIGN_W;
  }
}
