import Phaser from 'phaser';

export type Dir = 'front' | 'back' | 'left' | 'right';

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
    mk(`run_${d}`, [`walk_${d}_0`, `run_${d}`, `walk_${d}_2`, `run_${d}`], 12, -1);
  }
  mk('attack', ['attack_0', 'attack_1', 'attack_1'], 12, 0);
  mk('hit', ['hit', 'hit', 'idle_front'], 8, 0);
  mk('victory', ['victory', 'cheer', 'victory', 'cheer'], 4, -1);
  mk('cheer', ['cheer', 'idle_front'], 3, -1);
  mk('dizzy', ['dash', 'hit', 'dash', 'hit'], 6, -1);
}

export function anim(sheet: string, key: string) {
  return `${sheet}:${key}`;
}
