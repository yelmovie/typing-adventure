import Phaser from 'phaser';

export type Dir = 'front' | 'back' | 'left' | 'right';
export const KOREAN_ATTACK_ATLAS = 'char_attack_ko_v1';

/** Never accept a partially loaded replacement and silently fall back to letter keys. */
export function hasKoreanAttackFrames(scene: Phaser.Scene, row?: number) {
  if (!scene.textures.exists(KOREAN_ATTACK_ATLAS)) return false;
  const texture = scene.textures.get(KOREAN_ATTACK_ATLAS);
  return (row === undefined ? [0, 1, 2, 3] : [row]).every(r =>
    [0, 1, 2, 3].every(col => texture.has(`c${col}_r${r}`)));
}

/** The visible ground follows the same bounded pace as the character's stride. */
export function strideGroundSpeed(pace = 1) {
  return 120 * Phaser.Math.Clamp(pace, 0.75, 1.35);
}

const WALK_ROWS: Record<string, number> = {
  char_brown_boy: 0, char_pink_girl: 1, char_glasses_boy: 2, char_blond_explorer: 3,
  pet_cat: 0, pet_rabbit: 1, pet_dragon: 2, pet_squirrel: 3,
};

type MotionMetadata = { bodyHeight?: number; foot?: { x: number; y: number } };
/** Phaser retains the entire JSON frame entry inside Frame.customData. */
export function motionMetadata(frame: Phaser.Textures.Frame): MotionMetadata {
  const data = frame.customData as MotionMetadata & { customData?: MotionMetadata };
  return data?.customData ?? data ?? {};
}

/** The resting side view is from the same model sheet as the eight travel poses. */
export function placeSideIdle(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, sheet: string, dir: Dir, scale: number): boolean {
  const row = WALK_ROWS[sheet];
  if (!sheet.startsWith('char_') || (dir !== 'right' && dir !== 'left') || row === undefined || !scene.textures.exists('char_walk_v2')) return false;
  const texture = scene.textures.get('char_walk_v2');
  const frameName = `c8_r${row}`;
  if (!texture.has(frameName)) return false;
  const frame = texture.get(frameName);
  const height = Number(motionMetadata(frame).bodyHeight) || frame.height;
  const reference = scene.textures.getFrame(sheet, 'idle_right');
  sprite.setTexture('char_walk_v2', frameName).setScale(scale * reference.height / height).setFlipX(dir === 'left');
  placeFeet(sprite);
  return true;
}

/** A full stride is shared by walk/run so changes of speed never restart a step. */
export function playStride(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, sheet: string, dir: Dir, run: boolean, scale: number) {
  const row = WALK_ROWS[sheet];
  if (sheet.startsWith('char_') && (dir === 'right' || dir === 'left') && row !== undefined && scene.textures.exists('char_walk_v2')) {
    const atlas = 'char_walk_v2';
    const first = scene.textures.getFrame(atlas, `c0_r${row}`);
    const height = Number(motionMetadata(first).bodyHeight) || first.height;
    const reference = scene.textures.getFrame(sheet, 'idle_right');
    const key = `${atlas}:${row}:stride`;
    if (!scene.anims.exists(key)) scene.anims.create({ key,
      // Frames 3/7 lead into a similar contact pose. Pass through those briefly
      // instead of holding two wide stances; one full left/right cycle is 600 ms.
      frames: [75, 100, 100, 25, 75, 100, 100, 25].map((duration, col) => ({ key: atlas, frame: `c${col}_r${row}`, duration })),
      frameRate: 40, repeat: -1,
    });
    sprite.setScale(scale * reference.height / height).setFlipX(dir === 'left').play(key, true);
    placeFeet(sprite);
    return run ? 1 : 0.75;
  }
  const atlas = sheet.startsWith('char_') ? 'char_walk_v1' : 'pet_walk_v1';
  const motion = run ? 'run' : 'walk';
  if ((dir === 'right' || dir === 'left') && row !== undefined && scene.textures.exists(atlas)) {
    const first = scene.textures.getFrame(atlas, `c0_r${row}`);
    const height = Number(motionMetadata(first).bodyHeight) || first.height;
    const reference = scene.textures.getFrame(sheet, 'idle_right');
    const key = `${atlas}:${row}:${motion}`;
    if (!scene.anims.exists(key)) scene.anims.create({ key,
      frames: [0, 1, 2, 3].map(col => ({ key: atlas, frame: `c${col}_r${row}` })),
      frameRate: run ? 10 : 7, repeat: -1,
    });
    sprite.setScale(scale * reference.height / height).setFlipX(dir === 'left').play(key, true);
  } else {
    sprite.setScale(scale).setFlipX(false).play(anim(sheet, `${motion}_${dir}`), true);
  }
  placeFeet(sprite);
  return 1;
}

/** Use the visible ground contact, not unequal transparent atlas padding. */
export function placeFeet(sprite: Phaser.GameObjects.Sprite, lift = 0, lean = 0) {
  const frame = sprite.frame;
  const foot = motionMetadata(frame).foot;
  const contactX = foot?.x ?? frame.realWidth / 2;
  const x = sprite.flipX ? frame.realWidth - contactX : contactX;
  const y = foot?.y ?? frame.y + frame.height;
  sprite.setOrigin(
    x / frame.realWidth - lean / Math.max(1, sprite.displayWidth),
    y / frame.realHeight + lift / Math.max(1, sprite.displayHeight),
  );
}

/** 시트 하나에 대한 애니메이션을 한 번만 등록 */
export function registerSheetAnims(scene: Phaser.Scene, sheet: string) {
  const a = scene.anims;
  const mk = (key: string, frames: string[], frameRate: number, repeat: number) => {
    const full = `${sheet}:${key}`;
    if (a.exists(full)) return;
    a.create({
      key: full,
      frames: frames.map((f) => ({ key: sheet, frame: f })),
      frameRate,
      repeat,
    });
  };
  for (const d of ['front', 'back', 'left', 'right'] as Dir[]) {
    mk(`walk_${d}`, [0, 1, 2, 3].map((i) => `walk_${d}_${i}`), 8, -1);
    // run_* is one illustrated action pose (often including a painted speed trail),
    // not an in-between. Mixing it into each stride changes silhouette twice a step.
    mk(`run_${d}`, [0, 1, 2, 3].map(i => `walk_${d}_${i}`), 12, -1);
  }
  mk('attack', ['attack_0', 'attack_1', 'attack_1'], 16, 0);
  mk('hit', ['hit', 'hit', 'idle_front'], 8, 0);
  // Hold the expression: alternating unrelated poses looks like a flicker.
  mk('victory', ['victory'], 1, -1);
  mk('cheer', ['cheer'], 1, 0);
  mk('dizzy', ['dash', 'hit', 'dash', 'hit'], 6, -1);
}

export function anim(sheet: string, key: string) {
  return `${sheet}:${key}`;
}
