import { t as tr } from '../i18n/Locale';
import Phaser from 'phaser';
import { ensureParticleTextures, styleText, prefersReducedMotion } from './common';
import { DESIGN_W, DESIGN_H } from '../Game';
import { Player } from '../entities/Player';
import { Pet } from '../entities/Pet';
import { Enemy } from '../entities/Enemy';
import { registerSheetAnims, anim } from '../entities/anims';
import { SaveSystem } from '../systems/SaveSystem';
import { getCharacter, getPet } from '../data/characters';
import { getStage } from '../data/stages';
import { EventBus, Events } from '../EventBus';
import { AudioManager, STAGE_BGM } from '../systems/AudioManager';
import type { StageId } from '../types';
import type { WaveMonster } from '../systems/WaveSystem';
import { playClassFx } from './ClassFx';

/**
 * 푸른 숲은 화면 중앙을 지키는 8방향 로그라이트 전투다. WaveSystem 의 x(0→1)는
 * 진행률로 그대로 두고, 씬에서만 타원형 진입로의 바깥→안쪽 좌표로 바꾼다.
 * 로직과 연출 좌표를 분리해 난이도·저장·점수 규칙은 기존 검증을 그대로 사용한다.
 */
const PLAYER_POS = { x: 960, y: 520 };
const ARENA_OUTER = { x: 830, y: 345 };
const ARENA_TOUCH = { x: 125, y: 58 };
const LANE_ORDER = [0, 4, 2, 6, 1, 5, 3, 7]; // 같은 쪽만 연달아 나오지 않게 반대편을 번갈아 배치

function laneAngle(uid: number) {
  return -Math.PI / 2 + LANE_ORDER[(uid - 1) % LANE_ORDER.length] * Math.PI / 4;
}

function lanePoint(angle: number, progress: number) {
  const rx = Phaser.Math.Linear(ARENA_OUTER.x, ARENA_TOUCH.x, progress);
  const ry = Phaser.Math.Linear(ARENA_OUTER.y, ARENA_TOUCH.y, progress);
  return { x: PLAYER_POS.x + Math.cos(angle) * rx, y: PLAYER_POS.y + Math.sin(angle) * ry };
}

function approachDirection(angle: number): 'front' | 'back' | 'left' | 'right' {
  const dx = -Math.cos(angle), dy = -Math.sin(angle);
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'back' : 'front';
}

/** 화면 위 몬스터 하나: 스프라이트 + 머리 위 낱말 라벨 */
class Mob {
  readonly enemy: Enemy;
  readonly labelDone: Phaser.GameObjects.Text;
  readonly labelRest: Phaser.GameObjects.Text;
  readonly ring: Phaser.GameObjects.Ellipse;
  readonly path: Phaser.GameObjects.Graphics;
  targetX: number;
  targetY: number;
  readonly angle: number;
  word: string;
  done = 0;
  dead = false;
  danger = false;
  targeted = false;
  private restColor = '#ffffff'; // 변화구 색 — 위험 표시가 끝나면 이 색으로 되돌린다
  constructor(private scene: Phaser.Scene, m: WaveMonster) {
    this.word = m.word.text;
    this.angle = laneAngle(m.uid);
    const spawn = lanePoint(this.angle, 0);
    this.targetX = spawn.x;
    this.targetY = spawn.y;
    // 대장 전용 시트가 없으면 초록 슬라임을 키워 쓰던 예전 방식으로 폴백
    const sheet = scene.textures.exists(m.sheet) ? m.sheet : 'mon_green_slime';
    const ownSheet = sheet === m.sheet;
    registerSheetAnims(scene, sheet);
    // 전용 대장 시트는 그림 자체가 크고 왕관이 있으니 덜 키우고 틴트도 안 입힌다
    const scale = m.big ? 1.05 * (ownSheet ? 1.25 : 1.8) : m.kind === 'bat' ? 1.0 : 1.05;
    this.enemy = new Enemy(scene, spawn.x, spawn.y, sheet, scale);
    if (m.big && !ownSheet) this.enemy.sprite.setTint(0xffcf7a);
    this.enemy.setDepth(8);
    this.enemy.sprite.play(anim(sheet, `walk_${approachDirection(this.angle)}`));
    this.path = scene.add.graphics().setDepth(3);
    this.ring = scene.add.ellipse(spawn.x, spawn.y + 8, 174, 52, 0xffd34d, 0).setDepth(5);
    this.labelDone = scene.add.text(0, 0, '', styleText(43, '#6dff9c')).setOrigin(0, 1).setDepth(18);
    this.labelRest = scene.add.text(0, 0, '', styleText(43, '#ffffff')).setOrigin(0, 1).setDepth(18);
    const v = m.word.variant;
    if (v) this.restColor = v === 'treasure' ? '#ffd34d' : v === 'heart' ? '#ff7ab6' : '#ff6b6b';
    this.labelRest.setColor(this.restColor);
    this.layout();
  }
  get x() {
    return this.enemy.sprite.x;
  }
  get y() {
    return this.enemy.sprite.y;
  }
  setTargeted(on: boolean) {
    this.targeted = on;
    this.ring.setFillStyle(this.danger ? 0xff5a5a : 0xffd34d, on || this.danger ? 0.35 : 0);
    this.applyLabelSize();
  }
  /** 곧 닿는다 — 낱말을 빨갛게 키우고 발밑 고리를 켜서 "이건 위험해" 를 눈으로 알린다 */
  setDanger(on: boolean) {
    if (this.danger === on) return;
    this.danger = on;
    this.labelRest.setColor(on ? '#ff5a5a' : this.restColor);
    this.ring.setFillStyle(on ? 0xff5a5a : 0xffd34d, on || this.targeted ? 0.35 : 0);
    this.applyLabelSize();
    if (on && !prefersReducedMotion()) this.scene.tweens.add({ targets: [this.labelRest, this.labelDone], scaleX: 1.12, scaleY: 1.12, duration: 220, yoyo: true, repeat: 2 });
  }
  private applyLabelSize() {
    const size = this.danger ? 60 : this.targeted ? 56 : 46;
    this.labelRest.setFontSize(size);
    this.labelDone.setFontSize(size);
    this.layout();
  }
  setDone(n: number) {
    this.done = n;
    this.layout();
  }
  layout() {
    const chars = [...this.word];
    this.labelDone.setText(chars.slice(0, this.done).join(''));
    this.labelRest.setText(chars.slice(this.done).join(''));
    const w = this.labelDone.width + this.labelRest.width;
    // 글자 상자는 origin(0,1) 이라 이 값이 글자의 아래끝이다. 머리 끝에 살짝 겹치게 붙인다.
    const top = this.enemy.sprite.y - this.enemy.sprite.displayHeight + 12;
    const x0 = this.enemy.sprite.x - w / 2;
    this.labelDone.setPosition(x0, top);
    this.labelRest.setPosition(x0 + this.labelDone.width, top);
    this.ring.setPosition(this.enemy.sprite.x, this.enemy.sprite.y + 8);
    this.drawPath();
  }
  setProgress(progress: number) {
    const p = lanePoint(this.angle, Phaser.Math.Clamp(progress, 0, 1));
    this.targetX = p.x;
    this.targetY = p.y;
  }
  private drawPath() {
    this.path.clear();
    if (!this.targeted && !this.danger) return;
    const color = this.danger ? 0xff5a5a : 0xffd34d;
    const alpha = this.danger ? 0.58 : 0.42;
    this.path.lineStyle(this.danger ? 8 : 5, color, alpha);
    this.path.beginPath();
    this.path.moveTo(PLAYER_POS.x, PLAYER_POS.y);
    this.path.lineTo(this.x, this.y);
    this.path.strokePath();
    if (this.danger) {
      const dx = PLAYER_POS.x - this.x, dy = PLAYER_POS.y - this.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / len, uy = dy / len, px = -uy * 32, py = ux * 32;
      const tipX = PLAYER_POS.x - ux * 76, tipY = PLAYER_POS.y - uy * 76;
      const baseX = tipX - ux * 110, baseY = tipY - uy * 110;
      this.path.fillStyle(0xff5a5a, 0.24);
      this.path.fillTriangle(tipX, tipY, baseX + px, baseY + py, baseX - px, baseY - py);
    }
  }
  /** 매 프레임: 방사형 진입로의 목표 좌표로 부드럽게 */
  update() {
    if (this.dead) return;
    const s = this.enemy.sprite;
    const nx = Phaser.Math.Linear(s.x, this.targetX, 0.18);
    const ny = Phaser.Math.Linear(s.y, this.targetY, 0.18);
    s.setPosition(nx, ny);
    this.enemy.shadow.setPosition(nx, ny + 6);
    const depth = 7 + Math.round((ny / DESIGN_H) * 5);
    this.enemy.setDepth(depth);
    this.layout();
  }
  flash() {
    const s = this.enemy.sprite;
    s.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => s.setTint(0xff9090));
    this.scene.time.delayedCall(160, () => s.clearTint());
    this.scene.tweens.add({ targets: s, scaleX: s.scaleX * 1.12, scaleY: s.scaleY * 0.9, duration: 70, yoyo: true });
  }
  lunge(onHit: () => void) {
    const s = this.enemy.sprite;
    const dx = PLAYER_POS.x - s.x, dy = PLAYER_POS.y - s.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    this.scene.tweens.add({ targets: [s, this.enemy.shadow], x: s.x + dx / len * 78, y: s.y + dy / len * 78, duration: 120, yoyo: true, ease: 'Quad.easeOut', onYoyo: onHit });
  }
  pushOut(distance = 170) {
    const dx = this.x - PLAYER_POS.x, dy = this.y - PLAYER_POS.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    this.scene.tweens.add({ targets: [this.enemy.sprite, this.enemy.shadow], x: this.x + dx / len * distance, y: this.y + dy / len * distance, duration: 260, ease: 'Quad.easeOut' });
  }
  flee(onDone: () => void) {
    this.dead = true;
    this.path.clear();
    this.labelDone.destroy();
    this.labelRest.destroy();
    this.ring.destroy();
    const dx = Math.cos(this.angle) * 520, dy = Math.sin(this.angle) * 300;
    this.scene.tweens.add({ targets: [this.enemy.sprite, this.enemy.shadow], x: `+=${dx}`, y: `+=${dy}`, alpha: 0, duration: 520, ease: 'Quad.easeIn', onComplete: () => { this.enemy.destroy(); this.path.destroy(); onDone(); } });
  }
  die(onDone: () => void) {
    this.dead = true;
    this.labelDone.destroy();
    this.labelRest.destroy();
    this.ring.destroy();
    this.path.destroy();
    this.enemy.defeat(() => {
      this.enemy.destroy();
      onDone();
    });
  }
  destroy() {
    this.labelDone.destroy();
    this.labelRest.destroy();
    this.ring.destroy();
    this.path.destroy();
    this.enemy.destroy();
  }
}

/**
 * 푸른 숲 웨이브 연출 씬. 로직은 WaveSystem(UI 쪽). 이벤트에 반응해 몬스터 이동·타격·처치·문 개방을 그린다.
 */
export class WaveScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private mobs = new Map<number, Mob>();
  private hitBurst?: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail?: Phaser.GameObjects.Particles.ParticleEmitter;
  private shakeOn = true;
  private handlers: [string, (...args: never[]) => void][] = [];
  private waveText?: Phaser.GameObjects.Text;
  private duskOverlay?: Phaser.GameObjects.Rectangle;
  private cls = 'brown_boy';
  private lastPerfect = false;
  private curWave = 1;
  private petFacing: 'left' | 'right' = 'right';

  constructor() {
    super('Wave');
  }

  create(data: { stageId: StageId }) {
    const stage = getStage(data.stageId);
    // 높은 시점의 전용 배경을 화면에 고정한다. 움직임은 사방에서 모이는 몬스터와 펫의 순찰로 만든다.
    const src = this.textures.get(stage.bgBattle).getSourceImage() as HTMLImageElement;
    const sc = Math.max(DESIGN_W / src.width, DESIGN_H / src.height);
    this.add.image(DESIGN_W / 2, DESIGN_H / 2, stage.bgBattle).setScale(sc).setDepth(0);
    ensureParticleTextures(this);
    const save = SaveSystem.get();
    this.shakeOn = save.settings.screenShake && !prefersReducedMotion();
    this.cls = save.profile.characterId;
    this.mobs.clear();

    const light = this.add.ellipse(PLAYER_POS.x, PLAYER_POS.y + 22, 650, 280, 0xffe59a, 0.08).setDepth(1);
    if (!prefersReducedMotion()) this.tweens.add({ targets: light, alpha: 0.14, duration: 2000, yoyo: true, repeat: -1 });
    // 웨이브가 지날수록 낮 → 노을로 (배경 색 온도 변화)
    this.duskOverlay = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0xff7a3d, 0).setDepth(2).setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.player = new Player(this, PLAYER_POS.x, PLAYER_POS.y, getCharacter(save.profile.characterId).sheet, 1.03);
    this.player.idle('front');
    this.player.setLively(true);
    this.player.setDepth(13);
    this.pet = new Pet(this, PLAYER_POS.x - 118, PLAYER_POS.y + 58, getPet(save.profile.petId).sheet, 0.5);
    this.pet.setDepth(12);
    this.pet.run('right');

    this.hitBurst = this.add.particles(0, 0, 'p_star', {
      lifespan: { min: 300, max: 650 }, speed: { min: 180, max: 420 }, scale: { start: 1.1, end: 0 }, rotate: { min: 0, max: 360 }, gravityY: 500,
      emitting: false, blendMode: Phaser.BlendModes.ADD, tint: [0xffd34d, 0xfff2b0, 0x63e074, 0xffffff],
    }).setDepth(20);
    this.trail = this.add.particles(0, 0, 'p_dot', {
      lifespan: 350, speed: { min: 10, max: 40 }, scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 }, emitting: false, blendMode: Phaser.BlendModes.ADD, tint: [0x8fe0ff, 0xffffff, 0xa78bfa],
    }).setDepth(19);
    this.waveText = this.add.text(960, 282, '', styleText(64, '#fff2b0')).setOrigin(0.5).setDepth(25).setAlpha(0);

    this.bind(Events.WAVE_SPAWN, (d: { monster: WaveMonster; wave: number }) => this.onSpawn(d));
    this.bind(Events.WAVE_TICK, (d: { monsters: WaveMonster[]; targetUid: number }) => this.onTick(d));
    this.bind(Events.WAVE_HIT, (d: { uid: number; hits: number }) => this.onHit(d));
    this.bind(Events.WAVE_DEFEAT, (d: { uid: number; aoe: boolean; fled?: boolean }) => this.onDefeat(d));
    this.bind(Events.WAVE_TOUCH, (d: { uid: number; hpLoss: number }) => this.onTouch(d));
    this.bind(Events.WAVE_PUSH, (d: { uid: number }) => this.mobs.get(d.uid)?.flash());
    this.bind(Events.WAVE_GATE, () => this.onGate());
    this.bind(Events.WAVE_SWEEP, (d: { combo: number; count: number }) => this.onSweep(d));
    this.bind(Events.ITEM_DROP, (d: { uid: number; item: string; score: number }) => this.onDrop(d));
    this.bind(Events.DODGE, (d: { uid: number; kind: string }) => this.onDodge(d));
    this.bind(Events.RALLY, (d: { heal: number }) => this.onRally(d));
    this.bind(Events.PLAYER_MOVE, (d: { dir: 'left' | 'right' | 'up' | 'down'; pressed: boolean }) => this.onPlayerMove(d));
    this.bind(Events.HP_HEAL, (d: { amount: number }) => this.onHeal(d));
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { forgiven: boolean }) => this.onWrong(d));
    this.bind(Events.FEVER_CHANGED, (d: { level: number }) => this.onFever(d.level));
    this.bind(Events.PET_ACTIVE, (d: { level: number }) => this.onPetActive(d));
    this.bind(Events.IDLE_DRAIN, () => { this.player?.hit(); AudioManager.sfx('hurt', { gain: 0.5 }); });
    this.bind(Events.PET_PASSIVE, () => this.pet?.skill());
    this.bind(Events.STAGE_FAILED, () => this.player?.hit());
    this.bind(Events.SETTINGS_CHANGED, (s: { screenShake: boolean }) => (this.shakeOn = s.screenShake && !prefersReducedMotion()));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [ev, fn] of this.handlers) EventBus.off(ev, fn);
      this.handlers = [];
      for (const m of this.mobs.values()) m.destroy();
      this.mobs.clear();
    });
    void AudioManager.bgm(STAGE_BGM[stage.id] ?? 'battle');
  }

  private bind<T>(ev: string, fn: (d: T) => void) {
    EventBus.on(ev, fn);
    this.handlers.push([ev, fn as (...args: never[]) => void]);
  }

  update(_t: number, _dtMs: number) {
    for (const m of this.mobs.values()) m.update();
    // 펫은 중앙의 주인공을 작은 타원으로 순찰한다. 전투 중에도 발걸음이 멈추지 않는다.
    if (this.pet) {
      const phase = this.time.now / 1450;
      const x = PLAYER_POS.x + Math.cos(phase) * 118;
      const y = PLAYER_POS.y + 62 + Math.sin(phase) * 38;
      this.pet.setPosition(x, y);
      this.pet.setDepth(y > PLAYER_POS.y ? 14 : 11);
      const facing = Math.sin(phase) > 0 ? 'left' : 'right';
      if (facing !== this.petFacing) {
        this.petFacing = facing;
        this.pet.run(facing);
      }
    }
  }

  private stillNotice(text: string, color: string) {
    const label = this.add.text(960, 380, tr(text), styleText(58, color)).setOrigin(0.5).setDepth(30);
    this.time.delayedCall(900, () => label.destroy());
  }

  /** 5콤보 소탕: 화면 번쩍 + 문구 */
  private onSweep(d: { combo: number; count: number }) {
    AudioManager.sfx('fever', { rate: 1.2 });
    if (prefersReducedMotion()) { this.stillNotice(`${d.combo}콤보 소탕!`, '#ffd34d'); return; }
    this.cameras.main.flash(220, 255, 240, 160);
    if (this.shakeOn) this.cameras.main.shake(220, 0.008);
    this.player?.dash(400);
    const t = this.add.text(960, 420, tr(`${d.combo}콤보 소탕!`), styleText(84, '#ffd34d')).setOrigin(0.5).setDepth(30).setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: 1.1, duration: 220, ease: 'Back.easeOut', yoyo: true, hold: 700, onComplete: () => t.destroy() });
  }

  /**
   * 기운내기: 적이 전부 뒤로 밀려 멈추고 캐릭터가 빛난다.
   * 소탕(노란 섬광)과 헷갈리지 않게 파란 섬광 + 다른 문구를 쓴다.
   */
  private onRally(d: { heal: number }) {
    AudioManager.sfx('clear', { rate: 0.9 });
    if (!prefersReducedMotion()) {
      this.cameras.main.flash(320, 150, 210, 255);
      this.player?.dash(320);
    }
    for (const mob of this.mobs.values()) {
      if (mob.dead) continue;
      mob.setDanger(false);
      mob.pushOut(180);
    }
    if (prefersReducedMotion()) { this.stillNotice('기운내기!', '#8fe0ff'); return; }
    const t = this.add.text(960, 400, tr('기운내기!'), styleText(88, '#8fe0ff')).setOrigin(0.5).setDepth(30).setScale(0.5).setAlpha(0);
    const s = this.add.text(960, 480, tr(`HP +${d.heal} · 잠깐 숨 돌리자`), styleText(44, '#ffffff')).setOrigin(0.5).setDepth(30).setAlpha(0);
    this.tweens.add({ targets: [t, s], alpha: 1, scale: 1, duration: 240, ease: 'Back.easeOut', yoyo: true, hold: 1100, onComplete: () => { t.destroy(); s.destroy(); } });
  }

  /** 아이템 드롭: 몬스터 자리에서 튀어오른 뒤 캐릭터에게 날아가 점수·효과로 */
  private onDrop(d: { uid: number; item: string; score: number }) {
    const mob = this.mobs.get(d.uid);
    const x = mob?.x ?? 1200;
    const y = (mob?.enemy.sprite.y ?? PLAYER_POS.y) - 90;
    // 아이템 아이콘 시트(fx_items c0~c5_r0 = items.ts 순서)가 있으면 그걸로, 없으면 이모지 폴백
    const ORDER = ['coin', 'gem', 'star', 'heart', 'shield', 'bolt'];
    const col = ORDER.indexOf(d.item);
    const it: Phaser.GameObjects.Image | Phaser.GameObjects.Text =
      col >= 0 && this.textures.exists('fx_items')
        ? this.add.image(x, y, 'fx_items', `c${col}_r0`).setDisplaySize(72, 72).setOrigin(0.5).setDepth(22)
        : this.add.text(x, y, ({ coin: '🪙', gem: '💎', star: '⭐', heart: '❤', shield: '🛡', bolt: '⚡' } as Record<string, string>)[d.item] ?? '🪙', { fontSize: '56px' }).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: it, y: y - 120, x: x - 40, duration: 320, ease: 'Quad.easeOut', onComplete: () => {
      this.tweens.add({ targets: it, x: PLAYER_POS.x, y: PLAYER_POS.y - 120, scale: 0.6, duration: 380, ease: 'Quad.easeIn', delay: 120, onComplete: () => {
        it.destroy();
        AudioManager.sfx(d.item === 'coin' ? 'coin' : 'star', { rate: d.item === 'star' ? 1.2 : 1 });
        this.player?.hop();
        this.playFx(1, PLAYER_POS.x, PLAYER_POS.y - 120, 0.8);
        this.hitBurst?.explode(14, PLAYER_POS.x, PLAYER_POS.y - 120);
        const label = d.score > 0 ? `+${d.score}` : d.item === 'heart' ? '+HP' : d.item === 'shield' ? '방패!' : '느려짐!';
        const color = d.item === 'coin' ? '#ffd34d' : d.item === 'gem' ? '#8fe0ff' : d.item === 'star' ? '#ff7ab6' : d.item === 'heart' ? '#63e074' : d.item === 'shield' ? '#8fb4ff' : '#fff2b0';
        const s = this.add.text(PLAYER_POS.x, PLAYER_POS.y - 170, tr(label), styleText(44, color)).setOrigin(0.5).setDepth(23);
        this.tweens.add({ targets: s, y: s.y - 90, alpha: 0, duration: 650, onComplete: () => s.destroy() });
      } });
    } });
  }

  /** fx_pickup 시트 5프레임 재생 (r0 회피 · r1 획득 · r2 회복). 시트가 없으면 아무것도 안 그린다 */
  private playFx(row: 0 | 1 | 2, x: number, y: number, scale = 1) {
    if (!this.textures.exists('fx_pickup')) return;
    const key = `fx_pickup_r${row}`;
    if (!this.anims.exists(key)) {
      this.anims.create({
        key,
        frames: Array.from({ length: 5 }, (_, c) => ({ key: 'fx_pickup', frame: `c${c}_r${row}` })),
        frameRate: 16,
      });
    }
    const s = this.add.sprite(x, y, 'fx_pickup', `c0_r${row}`).setDepth(24).setScale(scale).setBlendMode(Phaser.BlendModes.ADD);
    s.play(key);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  /** 점프/앉기로 몬스터 접촉을 회피 */
  private onDodge(d: { uid: number; kind: string }) {
    AudioManager.sfx('combo', { rate: 1.4 });
    const mob = this.mobs.get(d.uid);
    mob?.flash();
    const x = mob?.x ?? PLAYER_POS.x + 260;
    const y = (mob?.enemy.sprite.y ?? PLAYER_POS.y) - 170;
    this.playFx(0, (x + PLAYER_POS.x) / 2, y + 80, 0.9);
    const t = this.add.text(x, y, tr('회피!'), styleText(52, '#8fe0ff')).setOrigin(0.5).setDepth(24).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: 1.05, y: y - 40, duration: 260, ease: 'Back.easeOut', yoyo: true, hold: 260, onComplete: () => t.destroy() });
  }

  /** 방향키 연출: 좌우 톡·위 점프·아래 앉기 */
  private onPlayerMove(d: { dir: 'left' | 'right' | 'up' | 'down'; pressed: boolean }) {
    if (!this.player) return;
    if (d.dir === 'up' && d.pressed) this.player.jump();
    else if (d.dir === 'down') this.player.crouch(d.pressed);
    else if (d.pressed) this.player.nudge(d.dir === 'right' ? 26 : -26);
  }

  /** HP 회복(10콤보·PERFECT): 초록 + 표시 */
  private onHeal(d: { amount: number }) {
    if (!this.player) return;
    const p = this.player;
    this.playFx(2, p.x, p.y - 150, 0.8);
    const t = this.add.text(p.x, p.y - 240, `+${d.amount}`, styleText(40, '#63e074')).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: t, y: p.y - 310, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private onSpawn(d: { monster: WaveMonster; wave: number }) {
    this.mobs.set(d.monster.uid, new Mob(this, d.monster));
    if (d.wave !== this.curWave) {
      this.curWave = d.wave;
      if (this.waveText) {
        this.waveText.setText(`WAVE ${d.wave}`).setAlpha(0).setScale(0.6);
        this.tweens.add({ targets: this.waveText, alpha: 1, scale: 1, duration: 250, yoyo: true, hold: 900 });
      }
      // 낮(0) → 노을(웨이브4, 0.32)로 배경 색 온도 변화
      if (this.duskOverlay) this.tweens.add({ targets: this.duskOverlay, fillAlpha: (d.wave - 1) * 0.11, duration: 1600, ease: 'Sine.easeInOut' });
    }
  }

  private onTick(d: { monsters: WaveMonster[]; targetUid: number }) {
    for (const m of d.monsters) {
      const mob = this.mobs.get(m.uid);
      if (!mob || mob.dead) continue;
      mob.setProgress(m.x);
      mob.setDanger(!!m.danger);
      mob.setTargeted(m.uid === d.targetUid);
      mob.setDone(m.maxHp - m.hp);
    }
  }

  /** 음절 타격: 글자 탄환이 목표 몬스터로 */
  private onHit(d: { uid: number; hits: number }) {
    const mob = this.mobs.get(d.uid);
    if (!mob || mob.dead) return;
    AudioManager.sfx('tap', { rate: 1 + Math.random() * 0.08 });
    this.player?.jab();
    this.fireBullet(mob, false, () => {
      mob.flash();
      playClassFx(this, this.cls, 'weak', { x: this.player!.x, y: this.player!.y }, { x: mob.x, y: mob.enemy.sprite.y - 110 });
      this.hitBurst?.explode(8, mob.x, mob.enemy.sprite.y - 100);
    });
  }

  private fireBullet(mob: Mob, strong: boolean, onArrive: () => void) {
    const dx = mob.x - this.player!.x, dy = (mob.y - 92) - (this.player!.y - 105);
    const len = Math.max(1, Math.hypot(dx, dy));
    const from = { x: this.player!.x + dx / len * 54, y: this.player!.y - 105 + dy / len * 28 };
    const target = { x: mob.x - dx / len * 24, y: mob.y - 92 };
    const angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
    const beam = this.add.graphics().setDepth(20).setBlendMode(Phaser.BlendModes.ADD);
    beam.lineStyle(strong ? 18 : 10, strong ? 0xffd34d : 0x8fe0ff, strong ? 0.62 : 0.42);
    beam.lineBetween(from.x, from.y, target.x, target.y);
    this.tweens.add({ targets: beam, alpha: 0, duration: strong ? 260 : 170, onComplete: () => beam.destroy() });
    const t = this.add.ellipse(from.x, from.y, strong ? 78 : 46, strong ? 28 : 18, strong ? 0xffd34d : 0x8fe0ff, 0.96).setAngle(angle).setDepth(21).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: t, x: target.x, y: target.y, duration: strong ? 210 : 150, ease: 'Quad.easeIn',
      onUpdate: () => this.trail?.emitParticleAt(t.x, t.y, 2),
      onComplete: () => { onArrive(); t.destroy(); },
    });
  }

  private onCorrect(d: { perfect: boolean; combo: number }) {
    this.lastPerfect = d.perfect;
    AudioManager.sfx(d.perfect ? 'perfect' : 'hit', { rate: AudioManager.comboRate(d.combo) });
    if (d.combo > 0 && d.combo % 5 === 0) AudioManager.sfx('combo', { rate: AudioManager.comboRate(d.combo) });
    this.pet?.cheer();
    this.player?.attack(() => {});
    this.player?.hop();
    const target = [...this.mobs.values()].find((mob) => mob.targeted && !mob.dead);
    if (target && d.perfect) {
      const stamp = this.add.text(target.x + 58, target.y - 132, tr('완벽!'), styleText(42, '#ffd34d')).setOrigin(0.5).setDepth(28).setScale(0.5).setAngle(-7);
      this.tweens.add({ targets: stamp, scale: 1.12, y: stamp.y - 34, duration: 190, ease: 'Back.easeOut', yoyo: true, hold: 260, onComplete: () => stamp.destroy() });
    }
    if (this.shakeOn) this.cameras.main.shake(d.perfect ? 140 : 80, d.perfect ? 0.005 : 0.003);
  }

  private onDefeat(d: { uid: number; aoe: boolean; fled?: boolean }) {
    const mob = this.mobs.get(d.uid);
    if (!mob || mob.dead) return;
    if (d.fled) {
      // 오답으로 떠나는 적은 자신이 들어왔던 방향으로 물러난다.
      mob.flee(() => this.mobs.delete(d.uid));
      return;
    }
    const go = () => {
      AudioManager.sfx('defeat', { rate: 1 + Math.random() * 0.1 });
      this.hitBurst?.explode(d.aoe ? 26 : 40, mob.x, mob.y - 92);
      mob.die(() => this.mobs.delete(d.uid));
    };
    if (d.aoe) {
      this.time.delayedCall(Phaser.Math.Between(0, 250), () => { playClassFx(this, this.cls, 'fever', { x: this.player!.x, y: this.player!.y }, { x: mob.x, y: mob.y - 92 }); go(); });
    } else this.fireBullet(mob, true, () => { playClassFx(this, this.cls, this.lastPerfect ? 'perfect' : 'strong', { x: this.player!.x, y: this.player!.y }, { x: mob.x, y: mob.y - 92 }); go(); });
  }

  private onTouch(d: { uid: number; hpLoss: number }) {
    const mob = this.mobs.get(d.uid);
    mob?.lunge(() => {
      if (d.hpLoss > 0) {
        this.player?.hit();
        AudioManager.sfx('hurt');
        if (this.shakeOn) this.cameras.main.shake(140, 0.005);
        const p = this.player!;
        const txt = this.add.text(p.x, p.y - 240, `-${d.hpLoss}`, styleText(44, '#ff6b6b')).setOrigin(0.5).setDepth(22);
        this.tweens.add({ targets: txt, y: p.y - 320, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
      }
    });
  }

  private onWrong(d: { forgiven: boolean }) {
    if (d.forgiven) return;
    AudioManager.sfx('miss');
    const s = this.player?.sprite;
    if (s) this.tweens.add({ targets: s, angle: -6, duration: 70, yoyo: true, repeat: 1, onComplete: () => s.setAngle(0) });
  }

  /** 10콤보 POWER: 펫 스킬 발동 — 보라색, FEVER(2+)와 뚜렷이 다르게 */
  private onPetActive(d: { level: number }) {
    this.pet?.skill();
    if (d.level !== 1) return; // FEVER 이상은 onFever가 별도로 다룬다
    AudioManager.sfx('combo', { rate: 1.25 });
    if (prefersReducedMotion()) { this.stillNotice('펫 스킬 발동!', '#a78bfa'); return; }
    this.tweens.add({ targets: this.cameras.main, zoom: 1.045, duration: 150, yoyo: true, ease: 'Quad.easeOut' });
    const flash = this.add.rectangle(960, 540, 1920, 1080, 0xa78bfa, 0.32).setDepth(29);
    this.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });
    const t = this.add.text(960, 360, tr('펫 스킬 발동!'), styleText(58, '#a78bfa')).setOrigin(0.5).setDepth(30).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 200, ease: 'Back.easeOut', yoyo: true, hold: 600, onComplete: () => t.destroy() });
  }

  /** 20(+) 콤보 FEVER: 백색 플래시 + 주황 문구 + 강한 흔들림·줌 — 소탕·펫 스킬과 뚜렷이 다르게 */
  private onFever(level: number) {
    if (level < 2) return;
    if (prefersReducedMotion()) { this.stillNotice(level >= 3 ? 'FINAL FEVER!' : 'FEVER!', '#ffd34d'); return; }
    this.player?.dash(900);
    this.pet?.cheer();
    const flash = this.add.rectangle(960, 540, 1920, 1080, 0xffffff, 0.55).setDepth(30);
    this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });
    this.hitBurst?.explode(60, this.player!.x, this.player!.y - 200);
    if (this.shakeOn) this.cameras.main.shake(320, 0.012);
    this.tweens.add({ targets: this.cameras.main, zoom: 1.08, duration: 220, yoyo: true, ease: 'Quad.easeOut' });
    const label = level >= 3 ? 'FINAL FEVER!' : 'FEVER!';
    const t = this.add.text(960, 300, label, styleText(92, '#ff6b3d')).setOrigin(0.5).setDepth(31).setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: 1.12, duration: 260, ease: 'Back.easeOut', yoyo: true, hold: 800, onComplete: () => t.destroy() });
  }

  /** 20마리째: 전장 위쪽의 숲의 문이 빛나며 열린다 */
  private onGate() {
    const portal = { x: 960, y: 105 };
    const beam = this.add.circle(portal.x, portal.y, 74, 0xfff2b0, 0).setDepth(28).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: beam, fillAlpha: 0.85, scale: 3.4, duration: 900, ease: 'Sine.easeOut', yoyo: true, hold: 600, onComplete: () => beam.destroy() });
    this.add.particles(portal.x, portal.y + 50, 'p_star', {
      lifespan: 2200, speedY: { min: -250, max: -80 }, speedX: { min: -150, max: 150 }, scale: { start: 1.2, end: 0 }, quantity: 3, frequency: 30, duration: 1800,
      tint: [0xfff2b0, 0xffd34d, 0x63e074, 0xffffff], blendMode: Phaser.BlendModes.ADD,
    }).setDepth(27);
    this.time.delayedCall(500, () => {
      this.player?.victory();
      this.pet?.victory();
      AudioManager.sfx('clear');
    });
  }
}
