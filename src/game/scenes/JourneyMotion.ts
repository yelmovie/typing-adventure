import Phaser from 'phaser';
import { DESIGN_H, DESIGN_W } from '../Game';
import type { Player } from '../entities/Player';
import type { Pet } from '../entities/Pet';
import { prefersReducedMotion } from './common';

type JourneyMood = 'desert' | 'citadel';

const COLORS: Record<JourneyMood, { trail: number; particles: number[] }> = {
  desert: { trail: 0xe4b56a, particles: [0xd7a85f, 0xf1d59a, 0xb87942] },
  citadel: { trail: 0x9f7aea, particles: [0x8d64d8, 0xc7a8ff, 0x6f4fc7] },
};

/**
 * Adds a restrained moving-camera illusion to a single painted background.
 * The scene artwork stays legible while a separate ground strip and atmosphere
 * move at different speeds to establish depth.
 */
export function addJourneyMotion(
  scene: Phaser.Scene,
  background: Phaser.GameObjects.Image,
  mood: JourneyMood,
  floorY = 760,
) {
  const reduced = prefersReducedMotion();
  const palette = COLORS[mood];
  const baseScale = background.scaleX;
  background.setScale(baseScale * (reduced ? 1.015 : 1.055));

  if (!reduced) {
    background.setPosition(DESIGN_W / 2 + 18, DESIGN_H / 2 + 4);
    scene.tweens.add({
      targets: background,
      x: DESIGN_W / 2 - 24,
      y: DESIGN_H / 2 - 3,
      scaleX: baseScale * 1.075,
      scaleY: baseScale * 1.075,
      duration: mood === 'desert' ? 10500 : 8800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  const trailKey = `journey_floor_${mood}`;
  if (!scene.textures.exists(trailKey)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(3, palette.trail, 0.9);
    g.lineBetween(8, 24, 62, 24);
    g.lineBetween(92, 10, 146, 10);
    g.lineStyle(2, palette.trail, 0.5);
    g.lineBetween(40, 39, 112, 39);
    g.generateTexture(trailKey, 160, 48);
    g.destroy();
  }

  const trail = scene.add.tileSprite(DESIGN_W / 2, floorY, DESIGN_W, 112, trailKey)
    .setDepth(1)
    .setAlpha(reduced ? 0.035 : mood === 'desert' ? 0.13 : 0.1)
    .setTint(palette.trail);

  const atmosphere = scene.add.particles(0, 0, mood === 'desert' ? 'p_dot' : 'p_star', {
    x: { min: DESIGN_W + 20, max: DESIGN_W + 180 },
    y: mood === 'desert' ? { min: 500, max: 800 } : { min: 150, max: 790 },
    lifespan: mood === 'desert' ? { min: 2200, max: 4200 } : { min: 3000, max: 5200 },
    speedX: mood === 'desert' ? { min: -270, max: -125 } : { min: -115, max: -45 },
    speedY: mood === 'desert' ? { min: -34, max: 20 } : { min: -25, max: 18 },
    scale: mood === 'desert' ? { start: 0.75, end: 0.12 } : { start: 0.34, end: 0.04 },
    alpha: { start: mood === 'desert' ? 0.3 : 0.42, end: 0 },
    rotate: { min: -25, max: 25 },
    tint: palette.particles,
    frequency: mood === 'desert' ? 105 : 155,
    emitting: !reduced,
    blendMode: mood === 'citadel' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
  }).setDepth(mood === 'desert' ? 2 : 1);

  if (reduced) return;
  const update = (_time: number, delta: number) => {
    trail.tilePositionX += delta * (mood === 'desert' ? 0.1 : 0.075);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    atmosphere.stop();
  });
}

/** Keep the party advancing in place while the scenery passes behind them. */
export function startJourneyStride(player: Player, pet: Pet, pace = 0.84) {
  if (prefersReducedMotion()) return;
  player.walking = true;
  player.walk('right', true);
  player.setRunPace(pace);
  player.setRunLean(2);
  pet.run('right');
  pet.setRunPace(Math.max(0.8, pace * 0.92));
}
