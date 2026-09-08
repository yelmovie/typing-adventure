import Phaser from 'phaser';
import { ensureParticleTextures, styleText } from './common';
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

const PLAYER_POS = { x: 460, y: 760 }; // 발끝 760: 하단 입력 패널(830~) 위
const SPAWN_X = 1980;
const TOUCH_X = 640; // 몬스터 x=1 지점
const GROUND_Y = 760;

/** 화면 위 몬스터 하나: 스프라이트 + 머리 위 낱말 라벨 */
class Mob {
  readonly enemy: Enemy;
  readonly labelDone: Phaser.GameObjects.Text;
  readonly labelRest: Phaser.GameObjects.Text;
  readonly ring: Phaser.GameObjects.Ellipse;
  targetX: number;
  word: string;
  done = 0;
  dead = false;
  labelLift = 0; // 몬스터가 몰릴 때 라벨이 겹치지 않게 번갈아 높이를 다르게
  constructor(private scene: Phaser.Scene, m: WaveMonster) {
    this.word = m.word.text;
    this.targetX = SPAWN_X;
    this.labelLift = (m.uid % 3) * 58;
    registerSheetAnims(scene, m.sheet);
    const scale = m.big ? 1.05 * 1.8 : m.kind === 'bat' ? 1.0 : 1.05;
    this.enemy = new Enemy(scene, SPAWN_X, GROUND_Y + (m.kind === 'bat' ? -120 : 0), m.sheet, scale);
    if (m.big) this.enemy.sprite.setTint(0xffcf7a);
    this.enemy.setDepth(6);
    this.enemy.sprite.play(anim(m.sheet, 'walk_left'));
    this.ring = scene.add.ellipse(SPAWN_X, GROUND_Y + 8, 190, 50, 0xffd34d, 0).setDepth(4);
    this.labelDone = scene.add.text(0, 0, '', styleText(46, '#63e074')).setOrigin(0, 1).setDepth(12);
    this.labelRest = scene.add.text(0, 0, '', styleText(46, '#ffffff')).setOrigin(0, 1).setDepth(12);
    const v = m.word.variant;
    if (v) this.labelRest.setColor(v === 'treasure' ? '#ffd34d' : v === 'heart' ? '#ff7ab6' : '#ff6b6b');
    this.layout();
  }
  get x() {
    return this.enemy.sprite.x;
  }
  setTargeted(on: boolean) {
    this.ring.setFillStyle(0xffd34d, on ? 0.35 : 0);
    this.labelRest.setFontSize(on ? 56 : 46);
    this.labelDone.setFontSize(on ? 56 : 46);
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
    const top = this.enemy.sprite.y - this.enemy.sprite.displayHeight - 16 - this.labelLift;
    const x0 = this.enemy.sprite.x - w / 2;
    this.labelDone.setPosition(x0, top);
    this.labelRest.setPosition(x0 + this.labelDone.width, top);
    this.ring.setPosition(this.enemy.sprite.x, GROUND_Y + 8);
  }
  /** 매 프레임: 목표 x 로 부드럽게 */
  update() {
    if (this.dead) return;
    const s = this.enemy.sprite;
    const nx = Phaser.Math.Linear(s.x, this.targetX, 0.18);
    s.setX(nx);
    this.enemy.shadow.setX(nx);
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
    this.scene.tweens.add({ targets: [s, this.enemy.shadow], x: s.x - 90, duration: 120, yoyo: true, ease: 'Quad.easeOut', onYoyo: onHit });
  }
  die(onDone: () => void) {
    this.dead = true;
    this.labelDone.destroy();
    this.labelRest.destroy();
    this.ring.destroy();
    this.enemy.defeat(() => {
      this.enemy.destroy();
      onDone();
    });
  }
  destroy() {
    this.labelDone.destroy();
    this.labelRest.destroy();
    this.ring.destroy();
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
  private gate?: Phaser.GameObjects.Image;
  private bgFar?: Phaser.GameObjects.TileSprite;
  private bgNear?: Phaser.GameObjects.TileSprite;
  private duskOverlay?: Phaser.GameObjects.Rectangle;
  private cls = 'brown_boy';
  private lastPerfect = false;
  private curWave = 1;

  constructor() {
    super('Wave');
  }

  create(data: { stageId: StageId }) {
    const stage = getStage(data.stageId);
    // 숲길을 계속 걸어가는 느낌: 배경이 천천히 흘러간다 (원경 느리게 + 발밑 근경 빠르게)
    const src = this.textures.get(stage.bgBattle).getSourceImage() as HTMLImageElement;
    const sc = Math.max(DESIGN_W / src.width, DESIGN_H / src.height);
    this.bgFar = this.add.tileSprite(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W / sc, DESIGN_H / sc, stage.bgBattle).setScale(sc).setDepth(0);
    this.bgNear = this.add.tileSprite(DESIGN_W / 2, DESIGN_H - 70, DESIGN_W / sc, 160 / sc, stage.bgBattle).setScale(sc).setDepth(1).setAlpha(0.3).setTint(0x7fc98a);
    this.bgNear.tilePositionY = (src.height - 160 / sc);
    ensureParticleTextures(this);
    const save = SaveSystem.get();
    this.shakeOn = save.settings.screenShake;
    this.cls = save.profile.characterId;
    this.mobs.clear();

    // 숲의 문: 오른쪽에 닫힌 채. 몬스터는 이 문 뒤에서 나온다
    if (this.textures.exists('fx_gate')) {
      this.gate = this.add.image(1700, GROUND_Y + 10, 'fx_gate', 'c0_r0').setOrigin(0.5, 1).setScale(1.35).setDepth(2);
    }
    const light = this.add.ellipse(960, 810, 1700, 220, 0xffe59a, 0.08);
    this.tweens.add({ targets: light, alpha: 0.14, duration: 2000, yoyo: true, repeat: -1 });
    // 웨이브가 지날수록 낮 → 노을로 (배경 색 온도 변화)
    this.duskOverlay = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0xff7a3d, 0).setDepth(2).setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.player = new Player(this, PLAYER_POS.x, PLAYER_POS.y, getCharacter(save.profile.characterId).sheet, 1.25);
    this.player.walking = true; // 계속 걸어가는 씬
    this.player.idle('right');
    this.player.setDepth(7);
    this.pet = new Pet(this, PLAYER_POS.x - 170, PLAYER_POS.y + 10, getPet(save.profile.petId).sheet, 0.62);
    this.pet.setDepth(6);
    this.pet.walk('right');

    this.hitBurst = this.add.particles(0, 0, 'p_star', {
      lifespan: { min: 300, max: 650 }, speed: { min: 180, max: 420 }, scale: { start: 1.1, end: 0 }, rotate: { min: 0, max: 360 }, gravityY: 500,
      emitting: false, blendMode: Phaser.BlendModes.ADD, tint: [0xffd34d, 0xfff2b0, 0x63e074, 0xffffff],
    }).setDepth(20);
    this.trail = this.add.particles(0, 0, 'p_dot', {
      lifespan: 350, speed: { min: 10, max: 40 }, scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 }, emitting: false, blendMode: Phaser.BlendModes.ADD, tint: [0x8fe0ff, 0xffffff, 0xa78bfa],
    }).setDepth(19);
    this.waveText = this.add.text(960, 400, '', styleText(64, '#fff2b0')).setOrigin(0.5).setDepth(25).setAlpha(0);

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
    this.bind(Events.PLAYER_MOVE, (d: { dir: 'left' | 'right' | 'up' | 'down'; pressed: boolean }) => this.onPlayerMove(d));
    this.bind(Events.HP_HEAL, (d: { amount: number }) => this.onHeal(d));
    this.bind(Events.INPUT_CORRECT, (d: { perfect: boolean; combo: number }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { forgiven: boolean }) => this.onWrong(d));
    this.bind(Events.FEVER_CHANGED, (d: { level: number }) => this.onFever(d.level));
    this.bind(Events.PET_ACTIVE, (d: { level: number }) => this.onPetActive(d));
    this.bind(Events.IDLE_DRAIN, () => { this.player?.hit(); AudioManager.sfx('hurt', { gain: 0.5 }); });
    this.bind(Events.PET_PASSIVE, () => this.pet?.skill());
    this.bind(Events.STAGE_FAILED, () => this.player?.hit());
    this.bind(Events.SETTINGS_CHANGED, (s: { screenShake: boolean }) => (this.shakeOn = s.screenShake));

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

  update(_t: number, dtMs: number) {
    for (const m of this.mobs.values()) m.update();
    const px = (dtMs / 1000) * 70; // 느긋한 걸음 속도
    if (this.bgFar) this.bgFar.tilePositionX += px * 0.35;
    if (this.bgNear) this.bgNear.tilePositionX += px * 1.3;
  }

  /** 5콤보 소탕: 화면 번쩍 + 문구 */
  private onSweep(d: { combo: number; count: number }) {
    AudioManager.sfx('fever', { rate: 1.2 });
    this.cameras.main.flash(220, 255, 240, 160);
    if (this.shakeOn) this.cameras.main.shake(220, 0.008);
    this.player?.dash(400);
    const t = this.add.text(960, 420, `${d.combo}콤보 소탕!`, styleText(84, '#ffd34d')).setOrigin(0.5).setDepth(30).setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: 1.1, duration: 220, ease: 'Back.easeOut', yoyo: true, hold: 700, onComplete: () => t.destroy() });
  }

  /** 아이템 드롭: 몬스터 자리에서 튀어오른 뒤 캐릭터에게 날아가 점수·효과로 */
  private onDrop(d: { uid: number; item: string; score: number }) {
    const mob = this.mobs.get(d.uid);
    const x = mob?.x ?? 1200;
    const y = (mob?.enemy.sprite.y ?? GROUND_Y) - 90;
    const ICONS: Record<string, string> = { coin: '🪙', gem: '💎', star: '⭐', heart: '❤', shield: '🛡', bolt: '⚡' };
    const icon = ICONS[d.item] ?? '🪙';
    const it = this.add.text(x, y, icon, { fontSize: '56px' }).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: it, y: y - 120, x: x - 40, duration: 320, ease: 'Quad.easeOut', onComplete: () => {
      this.tweens.add({ targets: it, x: PLAYER_POS.x, y: PLAYER_POS.y - 120, scale: 0.6, duration: 380, ease: 'Quad.easeIn', delay: 120, onComplete: () => {
        it.destroy();
        AudioManager.sfx(d.item === 'coin' ? 'coin' : 'star', { rate: d.item === 'star' ? 1.2 : 1 });
        this.player?.hop();
        this.hitBurst?.explode(14, PLAYER_POS.x, PLAYER_POS.y - 120);
        const label = d.score > 0 ? `+${d.score}` : d.item === 'heart' ? '+HP' : d.item === 'shield' ? '방패!' : '느려짐!';
        const color = d.item === 'coin' ? '#ffd34d' : d.item === 'gem' ? '#8fe0ff' : d.item === 'star' ? '#ff7ab6' : d.item === 'heart' ? '#63e074' : d.item === 'shield' ? '#8fb4ff' : '#fff2b0';
        const s = this.add.text(PLAYER_POS.x, PLAYER_POS.y - 170, label, styleText(44, color)).setOrigin(0.5).setDepth(23);
        this.tweens.add({ targets: s, y: s.y - 90, alpha: 0, duration: 650, onComplete: () => s.destroy() });
      } });
    } });
  }

  /** 점프/앉기로 몬스터 접촉을 회피 */
  private onDodge(d: { uid: number; kind: string }) {
    AudioManager.sfx('combo', { rate: 1.4 });
    const mob = this.mobs.get(d.uid);
    mob?.flash();
    const x = mob?.x ?? PLAYER_POS.x + 260;
    const y = (mob?.enemy.sprite.y ?? GROUND_Y) - 170;
    const t = this.add.text(x, y, '회피!', styleText(52, '#8fe0ff')).setOrigin(0.5).setDepth(24).setScale(0.6).setAlpha(0);
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
      mob.targetX = SPAWN_X - m.x * (SPAWN_X - TOUCH_X);
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
    const from = { x: this.player!.x + 80, y: this.player!.y - 130 };
    const t = this.add.ellipse(from.x, from.y, strong ? 70 : 40, strong ? 46 : 28, strong ? 0xff7ab6 : 0x8fe0ff, 0.9).setDepth(21).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: t, x: mob.x - 30, y: mob.enemy.sprite.y - 110, duration: strong ? 200 : 150, ease: 'Quad.easeIn',
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
    if (this.shakeOn) this.cameras.main.shake(d.perfect ? 140 : 80, d.perfect ? 0.005 : 0.003);
  }

  private onDefeat(d: { uid: number; aoe: boolean; fled?: boolean }) {
    const mob = this.mobs.get(d.uid);
    if (!mob || mob.dead) return;
    if (d.fled) {
      // 오답: 몬스터가 오른쪽으로 도망 (점수 없음)
      mob.dead = true;
      this.tweens.add({ targets: [mob.enemy.sprite, mob.enemy.shadow], x: '+=700', alpha: 0, duration: 500, ease: 'Quad.easeIn', onComplete: () => { mob.destroy(); this.mobs.delete(d.uid); } });
      return;
    }
    const go = () => {
      AudioManager.sfx('defeat', { rate: 1 + Math.random() * 0.1 });
      this.hitBurst?.explode(d.aoe ? 26 : 40, mob.x, mob.enemy.sprite.y - 110);
      mob.die(() => this.mobs.delete(d.uid));
    };
    if (d.aoe) {
      this.time.delayedCall(Phaser.Math.Between(0, 250), () => { playClassFx(this, this.cls, 'fever', { x: this.player!.x, y: this.player!.y }, { x: mob.x, y: mob.enemy.sprite.y - 110 }); go(); });
    } else this.fireBullet(mob, true, () => { playClassFx(this, this.cls, this.lastPerfect ? 'perfect' : 'strong', { x: this.player!.x, y: this.player!.y }, { x: mob.x, y: mob.enemy.sprite.y - 110 }); go(); });
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
    this.tweens.add({ targets: this.cameras.main, zoom: 1.045, duration: 150, yoyo: true, ease: 'Quad.easeOut' });
    const flash = this.add.rectangle(960, 540, 1920, 1080, 0xa78bfa, 0.32).setDepth(29);
    this.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });
    const t = this.add.text(960, 360, '펫 스킬 발동!', styleText(58, '#a78bfa')).setOrigin(0.5).setDepth(30).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 200, ease: 'Back.easeOut', yoyo: true, hold: 600, onComplete: () => t.destroy() });
  }

  /** 20(+) 콤보 FEVER: 백색 플래시 + 주황 문구 + 강한 흔들림·줌 — 소탕·펫 스킬과 뚜렷이 다르게 */
  private onFever(level: number) {
    if (level < 2) return;
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

  /** 20마리째: 오른쪽에서 숲의 문이 빛나며 열린다 */
  private onGate() {
    if (this.gate) {
      this.gate.setFrame('c0_r1');
      this.time.delayedCall(450, () => this.gate?.setFrame('c0_r2'));
      this.tweens.add({ targets: this.gate, scale: 1.45, duration: 900, ease: 'Sine.easeOut' });
    }
    const beam = this.add.rectangle(1700, 540, 260, 1080, 0xfff2b0, 0).setDepth(28).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: beam, fillAlpha: 0.75, scaleX: 2.2, duration: 900, ease: 'Sine.easeOut', yoyo: true, hold: 600, onComplete: () => beam.destroy() });
    this.add.particles(1700, 1000, 'p_star', {
      lifespan: 2200, speedY: { min: -420, max: -200 }, speedX: { min: -140, max: 140 }, scale: { start: 1.2, end: 0 }, quantity: 3, frequency: 30, duration: 1800,
      tint: [0xfff2b0, 0xffd34d, 0x63e074, 0xffffff], blendMode: Phaser.BlendModes.ADD,
    }).setDepth(27);
    this.time.delayedCall(500, () => {
      this.player?.victory();
      this.pet?.victory();
      AudioManager.sfx('clear');
    });
  }
}
