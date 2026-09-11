import Phaser from 'phaser';
import { addBackground, addAmbientSparkles, prefersReducedMotion } from './common';
import { Player } from '../entities/Player';
import { hasKoreanAttackFrames, KOREAN_ATTACK_ATLAS } from '../entities/anims';
import { Pet } from '../entities/Pet';
import { Enemy } from '../entities/Enemy';
import { SaveSystem } from '../systems/SaveSystem';
import { CHARACTERS, PETS, getCharacter, getPet } from '../data/characters';
import { homeSheet } from '../data/homeAssets';
import { getStage } from '../data/stages';
import { getEnemy } from '../data/enemies';
import type { ScreenName, StageId } from '../types';
import { AudioManager, STAGE_BGM } from '../systems/AudioManager';
import { EventBus, Events } from '../EventBus';
// Keep both attack languages ready once the adventure opens. Switching language
// cannot race with a locale-dependent lazy-loading queue.
const motionAtlases = () => ['char_walk_v2', 'pet_walk_v1', KOREAN_ATTACK_ATLAS];
const hasAtlas = (scene: Phaser.Scene, key: string) => key === KOREAN_ATTACK_ATLAS
  ? hasKoreanAttackFrames(scene) : scene.textures.exists(key);
function queueAtlas(scene: Phaser.Scene, key: string) {
  if (hasAtlas(scene, key)) return;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.load.atlas(key, `./assets/sprites/${key}.webp`, `./assets/sprites/${key}.json`);
}

const CLASS_FX: Record<string, string> = { brown_boy: 'fx_warrior', pink_girl: 'fx_mage', glasses_boy: 'fx_scholar', blond_explorer: 'fx_archer' };
const MODE_ATLAS: Record<string, string[]> = {
  wave: ['fx_gate', 'mon_boss_slime', 'fx_items', 'fx_pickup'],
  telegram: ['fx_train_props'],
  boss: ['fx_crystals'],
  race: ['mon_shadow_chaser'],
};
const MODE_BG: Record<string, string[]> = { boss: ['bg_bright_castle'] };

/** 스테이지 하나에 필요한 배경·몬스터·이펙트를 로더 큐에 넣는다 (이미 있으면 건너뜀). Boot 의 ?go=battle 바로가기도 같이 쓴다 */
export function queueStageAssets(scene: Phaser.Scene, stageId: StageId) {
  const stage = getStage(stageId);
  const cls = CLASS_FX[SaveSystem.get().profile.characterId] ?? 'fx_warrior';
  const bgs = [stage.bgIntro, stage.bgBattle, ...(MODE_BG[stage.mode] ?? [])];
  const atlases = [...stage.enemies.map((id) => getEnemy(id).sheet), ...(MODE_ATLAS[stage.mode] ?? []), cls, 'char_poses', ...motionAtlases()];
  for (const bg of new Set(bgs)) if (!scene.textures.exists(bg)) scene.load.image(bg, `./assets/backgrounds/${bg}.webp`);
  for (const a of new Set(atlases)) queueAtlas(scene, a);
}

/** Load before leaving the current screen. A failed atlas never enters sprite constructors. */
export async function ensureScreenAssets(scene: Phaser.Scene, screen: ScreenName, data: Record<string, unknown> = {}): Promise<void> {
  const profile = SaveSystem.get().profile;
  const selected = [getCharacter(profile.characterId).sheet, getPet(profile.petId).sheet];
  const atlases = screen === 'setup'
    ? [...CHARACTERS.map((c) => c.sheet), ...PETS.map((p) => p.sheet)]
    : screen === 'home' ? selected.map(homeSheet) : selected;
  if (screen !== 'home') atlases.push(...motionAtlases());
  const backgrounds: Record<string, string[]> = {
    home: ['bg_main_gate'], setup: ['bg_adventure_room', 'bg_story_prologue'],
    worldmap: ['bg_world_map'], tutorial: ['bg_practice_forest'],
  };
  const required = [...atlases, ...(backgrounds[screen] ?? [])];
  if ((screen === 'intro' || screen === 'battle') && typeof data.stageId === 'string') {
    const stage = getStage(data.stageId as StageId);
    required.push(stage.bgIntro, stage.bgBattle, ...(MODE_BG[stage.mode] ?? []), 'char_poses',
      ...stage.enemies.map((id) => getEnemy(id).sheet), ...(MODE_ATLAS[stage.mode] ?? []),
      CLASS_FX[profile.characterId] ?? 'fx_warrior');
  }
  const missing = () => [...new Set(required)].filter((key) => !hasAtlas(scene, key));
  if (!missing().length) return;
  for (const a of atlases) queueAtlas(scene, a);
  for (const bg of backgrounds[screen] ?? []) if (!scene.textures.exists(bg)) scene.load.image(bg, `./assets/backgrounds/${bg}.webp`);
  if ((screen === 'intro' || screen === 'battle') && typeof data.stageId === 'string') queueStageAssets(scene, data.stageId as StageId);
  await new Promise<void>((resolve, reject) => {
    const done = () => {
      window.clearTimeout(timer);
      const absent = missing();
      if (absent.length) reject(new Error(`모험 자료를 받지 못했어 (${absent.length}개). 인터넷을 확인하고 다시 눌러 줘.`));
      else resolve();
    };
    const timer = window.setTimeout(() => {
      scene.load.off('complete', done);
      scene.load.reset();
      reject(new Error('자료 받기가 오래 걸리고 있어. 인터넷을 확인한 뒤 다시 눌러 줘.'));
    }, 20000);
    scene.load.once('complete', done);
    scene.load.start();
  });
}

/** 스테이지 소개: 캐릭터가 걸어 들어오고, 몬스터들이 저 멀리서 기다린다 */
export class StageIntroScene extends Phaser.Scene {
  private player?: Player;
  private pet?: Pet;
  private enemies: Enemy[] = [];
  private stageId: StageId = 'stage_1';

  constructor() {
    super('StageIntro');
  }

  // Phaser 는 init/create 에만 data 를 넘기고 preload 에는 안 넘긴다
  init(data: { stageId: StageId }) {
    this.stageId = data.stageId;
  }

  preload() {
    queueStageAssets(this, this.stageId);
  }

  create(data: { stageId: StageId }) {
    const stage = getStage(data.stageId);
    addBackground(this, stage.bgIntro, { zoom: true });
    addAmbientSparkles(this, 0xbfffc8, 0.7);
    const save = SaveSystem.get();
    const unique = [...new Set(stage.enemies)];
    void AudioManager.bgm(STAGE_BGM[stage.id] ?? 'battle');

    // 걸어 들어와 멈추는 자리를 미리 정해 둔다 — 트윈이 중간에 끊겨도 여기서 끝난다
    const compact = document.getElementById('ui-stage')?.classList.contains('small-display') ?? false;
    const PLAYER_END = compact ? 1340 : 1200;
    const PET_END = compact ? 1510 : 1370;
    const playerY = compact ? 1020 : 960, petY = compact ? 1030 : 970;
    const entry = prefersReducedMotion() ? 0 : 54;
    this.enemies = [];
    this.player = new Player(this, PLAYER_END - entry, playerY, getCharacter(save.profile.characterId).sheet, 1.35);
    this.player.setDepth(7);
    this.player.walk('right', false);
    this.pet = new Pet(this, PET_END - entry, petY, getPet(save.profile.petId).sheet, 0.65);
    this.pet.setDepth(6);
    this.pet.walk('right');
    this.tweens.add({
      targets: [this.player.sprite, this.player.shadow, this.pet.sprite, this.pet.shadow],
      x: `+=${entry}`,
      duration: entry ? 850 : 0,
      ease: 'Sine.easeOut',
    });
    // 트윈의 onComplete 에 기대지 않는다 — 씬이 다시 만들어지면 트윈이 죽어 콜백이 영영 안 온다
    // (실제로 캐릭터가 중간에 멈추고 말풍선이 안 떴다). 타이머는 씬 수명과 함께 가므로 안전하다.
    this.time.delayedCall(entry ? 900 : 0, () => {
      this.player?.setPosition(PLAYER_END, playerY);
      this.player?.idle('right');
      this.pet?.setPosition(PET_END, petY);
      this.pet?.idle('right');
      this.emitAnchors(unique);
    });

    unique.forEach((id, i) => {
      const def = getEnemy(id);
      const e = new Enemy(this, compact ? 1660 : 1610 + i * 160, (compact ? 710 : 780) - i * 240, def.sheet, 1.05 * def.scale);
      const bounds = e.sprite.getBounds();
      if (bounds.right > 1890) {
        // Intro enemies stay still; move the footprint with the painted sprite.
        const x = e.sprite.x - (bounds.right - 1890);
        e.sprite.setX(x); e.shadow.setX(x);
      }
      e.setDepth(4 - i);
      e.sprite.setAlpha(0.95);
      this.enemies.push(e);
    });
  }

  /**
   * 말풍선이 붙을 자리를 DOM 쪽에 알려준다. 좌표를 IntroScreen 에 그대로 적어 두면
   * 여기 배치를 바꿀 때마다 말풍선이 엉뚱한 데 뜬다 — 실제 스프라이트에서 재서 보낸다.
   */
  private emitAnchors(enemyIds: string[]) {
    const head = (s: Phaser.GameObjects.Sprite) => Math.round(s.getBounds().top);
    const cx = (s: Phaser.GameObjects.Sprite) => Math.round(s.getBounds().centerX);
    const anchors: { who: string; x: number; y: number }[] = [];
    if (this.player) anchors.push({ who: 'player', x: cx(this.player.sprite), y: head(this.player.sprite) });
    if (this.pet) anchors.push({ who: 'pet', x: cx(this.pet.sprite), y: head(this.pet.sprite) });
    this.enemies.forEach((e, i) => {
      if (enemyIds[i]) anchors.push({ who: enemyIds[i], x: cx(e.sprite), y: head(e.sprite) });
    });
    EventBus.emit(Events.INTRO_ANCHORS, { anchors });
  }
}
