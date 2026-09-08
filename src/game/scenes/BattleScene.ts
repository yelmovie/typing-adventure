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
import type { StageId, ContentUnit } from '../types';
import type { EnemyState } from '../systems/BattleSystem';
import { playClassFx } from './ClassFx';

const PLAYER_POS = { x: 560, y: 790 };
const ENEMY_POS = { x: 1370, y: 770 };

/**
 * 전투 연출 씬. 로직은 BattleSystem(UI 쪽)이 담당하고, 이 씬은 EventBus 이벤트에 반응해
 * 공격/피격/처치/파티클을 그린다.
 */
export class BattleScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private enemy?: Enemy;
  private hitBurst?: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail?: Phaser.GameObjects.Particles.ParticleEmitter;
  private shakeOn = true;
  private cls = 'brown_boy';

  private handlers: [string, (...args: never[]) => void][] = [];

  constructor() {
    super('Battle');
  }

  create(data: { stageId: StageId }) {
    const stage = getStage(data.stageId);
    addBackground(this, stage.bgBattle);
    ensureParticleTextures(this);
    const save = SaveSystem.get();
    this.shakeOn = save.settings.screenShake;
    this.cls = save.profile.characterId;

    // 바닥 라이트
    const light = this.add.ellipse(960, 800, 1500, 220, 0xffe59a, 0.08);
    this.tweens.add({ targets: light, alpha: 0.14, duration: 2000, yoyo: true, repeat: -1 });

    this.player = new Player(this, PLAYER_POS.x, PLAYER_POS.y, getCharacter(save.profile.characterId).sheet, 1.25);
    this.player.idle('right');
    this.player.setDepth(5);
    this.pet = new Pet(this, PLAYER_POS.x - 170, PLAYER_POS.y + 10, getPet(save.profile.petId).sheet, 0.62);
    this.pet.setDepth(4);

    this.hitBurst = this.add.particles(0, 0, 'p_star', {
      lifespan: { min: 300, max: 650 },
      speed: { min: 180, max: 420 },
      scale: { start: 1.1, end: 0 },
      rotate: { min: 0, max: 360 },
      gravityY: 500,
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
      tint: [0xffd34d, 0xfff2b0, 0x4fc3f7, 0xffffff],
    });
    this.hitBurst.setDepth(20);
    this.trail = this.add.particles(0, 0, 'p_dot', {
      lifespan: 350,
      speed: { min: 10, max: 40 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.9, end: 0 },
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
      tint: [0x8fe0ff, 0xffffff, 0xa78bfa],
    });
    this.trail.setDepth(19);

    this.bind(Events.ENEMY_SPAWN, (d: { enemy: EnemyState }) => this.spawnEnemy(d.enemy, true));
    this.bind(Events.INPUT_CORRECT, (d: { target: ContentUnit; perfect: boolean; damage: number; combo: number }) => this.onCorrect(d));
    this.bind(Events.INPUT_WRONG, (d: { hpLoss: number; forgiven: boolean }) => this.onWrong(d));
    this.bind(Events.ENEMY_HIT, (d: { enemy: EnemyState; damage: number; combo: number; weak?: boolean; fire?: boolean }) => {
      if (d.weak) this.onWeakHit(d.damage, d.combo);
      else if (d.fire) this.onFire(d.damage);
    });
    this.bind(Events.FEVER_CHANGED, (d: { level: number }) => this.onFever(d.level));
    this.bind(Events.ENEMY_DEFEATED, () => this.onEnemyDefeated());
    this.bind(Events.STAGE_CLEAR, () => this.onClear());
    this.bind(Events.STAGE_FAILED, () => this.onFail());
    this.bind(Events.BATTLE_START, (snap: { enemy: EnemyState | null }) => {
      if (snap.enemy && !this.enemy) this.spawnEnemy(snap.enemy, false);
    });
    this.bind(Events.SETTINGS_CHANGED, (s: { screenShake: boolean }) => (this.shakeOn = s.screenShake));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [ev, fn] of this.handlers) EventBus.off(ev, fn);
      this.handlers = [];
    });

    // UI가 BattleSystem을 만들기 전에 씬이 먼저 뜨는 경우: 초기 몬스터를 미리 보여준다
    const first = getEnemy(stage.enemies[0]);
    this.spawnEnemy({ id: first.id, name: first.name, sheet: first.sheet, hp: 1, maxHp: 1, scale: first.scale }, false);
    void AudioManager.bgm(STAGE_BGM[stage.id] ?? 'battle');
  }

  private bind<T>(ev: string, fn: (d: T) => void) {
    EventBus.on(ev, fn);
    this.handlers.push([ev, fn as (...args: never[]) => void]);
  }

  private pendingSpawn?: () => void;

  private spawnEnemy(state: EnemyState, walkIn: boolean) {
    if (this.enemy) {
      if (this.enemy.dead) {
        // 처치 연출이 끝난 뒤 등장
        this.pendingSpawn = () => this.spawnEnemy(state, walkIn);
        return;
      }
      if (this.enemy.sprite.texture.key === state.sheet) return;
      this.enemy.destroy();
    }
    const def = state.scale || 1;
    this.enemy = new Enemy(this, ENEMY_POS.x, ENEMY_POS.y, state.sheet, 1.25 * def);
    this.enemy.setDepth(5);
    if (walkIn) this.enemy.enter();
  }

  /** 정답: 캐릭터 공격 → 글자 탄환 → 몬스터 피격 */
  private onCorrect(d: { target: ContentUnit; perfect: boolean; damage: number; combo: number }) {
    const player = this.player!;
    const enemy = this.enemy;
    AudioManager.sfx(d.perfect ? 'perfect' : 'hit', { rate: AudioManager.comboRate(d.combo) });
    if (d.combo > 0 && d.combo % 5 === 0) AudioManager.sfx('combo', { rate: AudioManager.comboRate(d.combo) });
    this.pet?.cheer();
    player.attack(() => {
      this.fireWordBullet(d.target.text, d.perfect, () => {
        if (!enemy || enemy.dead) return;
        enemy.hit(d.perfect);
        playClassFx(this, this.cls, d.perfect ? 'perfect' : 'strong', { x: player.x, y: player.y }, { x: enemy.sprite.x - 20, y: enemy.sprite.y - 140 });
        this.hitBurst?.explode(d.perfect ? 34 : 18, enemy.sprite.x - 20, enemy.sprite.y - 120);
        this.floatDamage(enemy.sprite.x, enemy.sprite.y - 250, d.damage, d.perfect);
        if (this.shakeOn) this.cameras.main.shake(d.perfect ? 160 : 90, d.perfect ? 0.006 : 0.003);
      });
    });
  }

  /** 한글 글자 탄환: 단어가 빛나며 몬스터로 날아간다 */
  private fireWordBullet(word: string, perfect: boolean, onArrive: () => void) {
    const from = { x: this.player!.x + 80, y: this.player!.y - 130 };
    const to = { x: this.enemy ? this.enemy.sprite.x - 40 : ENEMY_POS.x, y: this.enemy ? this.enemy.sprite.y - 130 : ENEMY_POS.y - 130 };
    const color = perfect ? '#ff7ab6' : '#8fe0ff';
    const t = this.add.text(from.x, from.y, word, styleText(perfect ? 64 : 54, color)).setOrigin(0.5).setDepth(21).setScale(0.4);
    const glow = this.add.ellipse(from.x, from.y, 140, 90, perfect ? 0xff7ab6 : 0x4fc3f7, 0.35).setDepth(20).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: t, scale: 1, duration: 90 });
    this.tweens.add({
      targets: [t, glow],
      x: to.x,
      y: to.y,
      duration: 230,
      ease: 'Quad.easeIn',
      onUpdate: () => this.trail?.emitParticleAt(t.x, t.y, 2),
      onComplete: () => {
        onArrive();
        this.tweens.add({ targets: [t, glow], scale: 1.6, alpha: 0, duration: 180, onComplete: () => { t.destroy(); glow.destroy(); } });
      },
    });
  }

  /** 음절 약공격: 캐릭터 대시 없이 몬스터가 살짝 튕기고 작은 숫자 */
  private onWeakHit(dmg: number, combo: number) {
    const e = this.enemy;
    if (!e || e.dead) return;
    AudioManager.sfx('tap', { rate: AudioManager.comboRate(combo) * (1 + Math.random() * 0.06) });
    e.hit(false);
    playClassFx(this, this.cls, 'weak', { x: this.player!.x, y: this.player!.y }, { x: e.sprite.x - 20, y: e.sprite.y - 140 });
    this.hitBurst?.explode(6, e.sprite.x - 20, e.sprite.y - 120);
    const txt = this.add.text(e.sprite.x + Phaser.Math.Between(-40, 40), e.sprite.y - 200, `-${dmg}`, styleText(34, '#cfe9ff')).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: txt, y: txt.y - 60, alpha: 0, duration: 550, ease: 'Quad.easeOut', onComplete: () => txt.destroy() });
  }

  /** 드래곤 액티브: 화염 광역 */
  private onFire(dmg: number) {
    const e = this.enemy;
    if (!e || e.dead) return;
    AudioManager.sfx('bomb', { rate: 1.4, gain: 0.7 });
    this.hitBurst?.explode(50, e.sprite.x, e.sprite.y - 140);
    e.hit(true);
    this.floatDamage(e.sprite.x, e.sprite.y - 300, dmg, true);
    if (this.shakeOn) this.cameras.main.shake(220, 0.008);
    const flash = this.add.rectangle(960, 540, 1920, 1080, 0xff7a3d, 0.35).setDepth(30);
    this.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() });
  }

  /** FEVER: 화면 번쩍 + 펫 환호 */
  private onFever(level: number) {
    if (level < 2) return;
    this.pet?.cheer();
    const flash = this.add.rectangle(960, 540, 1920, 1080, 0xffffff, 0.5).setDepth(30);
    this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });
    this.hitBurst?.explode(60, this.player!.x, this.player!.y - 200);
  }

  private floatDamage(x: number, y: number, dmg: number, perfect: boolean) {
    const txt = this.add.text(x, y, `-${dmg}`, styleText(perfect ? 60 : 48, perfect ? '#ffd34d' : '#ffffff')).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: txt, y: y - 90, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => txt.destroy() });
    this.tweens.add({ targets: txt, scale: { from: 1.4, to: 1 }, duration: 200 });
  }

  /** 오답: HP 손실이 있으면 몬스터가 반격 */
  private onWrong(d: { hpLoss: number; forgiven: boolean }) {
    if (d.forgiven) return;
    AudioManager.sfx('miss');
    if (d.hpLoss > 0 && this.enemy && !this.enemy.dead) {
      this.enemy.attack(() => {
        this.player?.hit();
        AudioManager.sfx('hurt');
        if (this.shakeOn) this.cameras.main.shake(120, 0.004);
        this.floatDamageOnPlayer(d.hpLoss);
      });
    } else {
      // 기초 난이도: 캐릭터가 살짝 갸우뚱
      const s = this.player?.sprite;
      if (s) this.tweens.add({ targets: s, angle: -6, duration: 70, yoyo: true, repeat: 1, onComplete: () => s.setAngle(0) });
    }
  }

  private floatDamageOnPlayer(hp: number) {
    const p = this.player!;
    const txt = this.add.text(p.x, p.y - 240, `-${hp}`, styleText(44, '#ff6b6b')).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: txt, y: p.y - 320, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
  }

  private onEnemyDefeated() {
    AudioManager.sfx('defeat');
    const e = this.enemy;
    if (!e) return;
    this.hitBurst?.explode(40, e.sprite.x, e.sprite.y - 120);
    e.defeat(() => {
      if (this.enemy === e) {
        e.destroy();
        this.enemy = undefined;
      }
      const next = this.pendingSpawn;
      this.pendingSpawn = undefined;
      next?.();
    });
  }

  private onClear() {
    this.time.delayedCall(400, () => {
      this.player?.victory();
      this.pet?.victory();
      AudioManager.sfx('clear');
      this.hitBurst?.explode(60, this.player!.x, this.player!.y - 200);
    });
  }

  private onFail() {
    this.player?.hit();
    this.time.delayedCall(700, () => this.player?.idle('front'));
  }
}
