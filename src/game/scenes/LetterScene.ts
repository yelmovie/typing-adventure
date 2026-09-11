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
import type { BattleSnapshot } from '../systems/BattleState';
import { LETTER } from '../systems/LetterSystem';

// 콤보(y≤290) 아래 · 룬 줄(≈746)까지 하단 패널(830) 위.
// x=840 인 이유: compact 에서 좌측 패널이 340px 로 넓어져 오른쪽 끝이 370 이라, 폭을 유지한 채 양피지를 오른쪽으로 밀어 겹침을 피한다(양피지 400~1280).
const PAPER = { x: 840, y: 500, w: 880, h: 360 };
const GATE = { x: 1570, y: 470 };

/**
 * 사막 유적 편지 복원 연출. 가운데 양피지에 완성된 문장이 쌓이고, 어절 룬이 켜지고, 오른쪽 황금문의 자물쇠가 하나씩 열린다.
 */
export class LetterScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private currentLine?: Phaser.GameObjects.Text;
  private restoredLine?: Phaser.GameObjects.Text;
  private progressText?: Phaser.GameObjects.Text;
  private english = false;
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
    this.english = save.settings.language === 'en';
    this.runes = [];
    this.locks = [];

    // 종이 위에 현재 문장과 직전에 복원한 문장만 크게 읽힌다.
    // 완료하지 않은 줄을 점으로 채우거나, 긴 영문을 여섯 줄에 억지로 축소하지 않는다.
    const font = Math.max(30, Math.ceil(16 * DESIGN_W / Math.max(320, this.game.canvas.getBoundingClientRect().width)));
    const left = PAPER.x - PAPER.w / 2;
    const top = PAPER.y - PAPER.h / 2;
    const g = this.add.graphics().setDepth(4);
    g.fillStyle(0x251d22, 0.9).fillRoundedRect(left + 8, top + 10, PAPER.w, PAPER.h, 12);
    g.fillStyle(0xf3e5c0).fillRoundedRect(left, top, PAPER.w, PAPER.h, 12);
    g.lineStyle(5, 0x8a6a3a).strokeRoundedRect(left, top, PAPER.w, PAPER.h, 12);
    g.lineStyle(2, 0xc8b586).strokeRoundedRect(left + 14, top + 14, PAPER.w - 28, PAPER.h - 28, 4);
    g.fillStyle(0xdcc795).fillRect(left + 32, top + 85, PAPER.w - 64, 2);
    for (let y = top + 10; y < top + PAPER.h - 10; y += 8) {
      g.lineStyle(1, 0x7a5320, 0.025).lineBetween(left + 20, y, left + PAPER.w - 20, y);
    }
    const paperStyle = { ...styleText(font, '#493518', '#f3e5c0'), fontFamily: 'Noto Sans KR', strokeThickness: 0, shadow: undefined, wordWrap: { width: PAPER.w - 100 } };
    this.add.text(left + 42, top + 24, this.english ? 'THE LOST LETTER' : '잊힌 탐험가의 편지', { ...paperStyle, fontStyle: 'bold' }).setDepth(5);
    this.progressText = this.add.text(left + 42, top + 106, this.english ? 'Restore each sentence to open the seals.' : '문장을 완성해 편지와 봉인을 되찾아요.', { ...paperStyle, color: '#6b5739', fontSize: font }).setDepth(5);
    this.currentLine = this.add.text(left + 42, top + 156, '', { ...paperStyle, fontStyle: 'bold', color: '#203c49', fontSize: font + 4, maxLines: 2 }).setDepth(5);
    this.restoredLine = this.add.text(left + 42, top + 286, this.english ? 'Your restored words will appear here.' : '되찾은 문장이 여기 남아요.', { ...paperStyle, fontSize: font, color: '#66543a', maxLines: 1 }).setDepth(5);
    this.runeRow = this.add.container(PAPER.x, PAPER.y + PAPER.h / 2 + 46).setDepth(6);

    // 배경의 석조 황금문은 그대로 보존하고 작은 봉인 3개만 켠다.
    const door = this.add.graphics().setDepth(3);
    door.fillStyle(0x19223b, 0.96).fillRoundedRect(GATE.x - 245, GATE.y - 150, 490, 260, 12);
    door.lineStyle(5, 0x96784e).strokeRoundedRect(GATE.x - 245, GATE.y - 150, 490, 260, 12);
    this.add.text(GATE.x, GATE.y - 116, this.english ? 'THREE ANCIENT SEALS' : '황금문의 봉인', { ...styleText(font + 4, '#ffe59a'), strokeThickness: 0 }).setOrigin(0.5).setDepth(5);
    this.add.text(GATE.x, GATE.y + 74, this.english ? '2 sentences = 1 seal' : '문장 2개마다 하나씩 열려요', { ...styleText(font, '#fff8e6'), strokeThickness: 0 }).setOrigin(0.5).setDepth(5);
    this.gateGlow = this.add.ellipse(GATE.x, GATE.y, 460, 300, 0xfff2b0, 0).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < LETTER.locks; i++) {
      const x = GATE.x - 145 + i * 145;
      door.fillStyle(0x0d1429).fillRoundedRect(x - 58, GATE.y - 64, 116, 108, 8);
      door.lineStyle(2, 0x687698).strokeRoundedRect(x - 58, GATE.y - 64, 116, 108, 8);
      const l = this.add.image(x, GATE.y - 10, 'ui_lock').setDisplaySize(72, 72).setDepth(5);
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
    this.bind(Events.LETTER_IDLE, (d: { idle: boolean }) => this.tweens.add({ targets: this.hourglass, alpha: d.idle ? 0.5 : 0, duration: 300 }));
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
    this.progressText?.setText(this.english ? `${info.lines.length} / ${LETTER.sentences} sentences restored` : `되찾은 문장 ${info.lines.length} / ${LETTER.sentences}`);
    this.currentLine?.setText(info.current ?? (this.english ? 'The letter is whole again.' : '편지를 모두 되찾았어요.'));
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
    const t = this.restoredLine;
    if (!t) return;
    t.setText(`${d.wrong ? '↻' : '✓'} ${d.text}`).setColor(d.wrong ? '#8d3c36' : '#315b3a').setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 400, ease: 'Sine.easeOut' });
    this.sparkle?.explode(d.perfect ? 30 : 14, t.x + 200, t.y);
  }

  private openLock(i: number) {
    const l = this.locks[i];
    if (!l) return;
    AudioManager.sfx('coin', { rate: 0.8 + i * 0.15 });
    this.tweens.add({ targets: l, scale: l.scale * 1.4, angle: -15, duration: 200, yoyo: true, onYoyo: () => l.setTexture('ui_unlock') });
    this.sparkle?.explode(40, l.x, l.y);
    if (SaveSystem.get().settings.screenShake && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.cameras.main.shake(120, 0.003);
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
