import Phaser from 'phaser';
import { DESIGN_W, DESIGN_H } from '../Game';

/** 16:9 배경을 화면에 cover 로 깔기 */
export function addBackground(scene: Phaser.Scene, key: string, opts: { dim?: number; zoom?: boolean } = {}) {
  const img = scene.add.image(DESIGN_W / 2, DESIGN_H / 2, key);
  const s = Math.max(DESIGN_W / img.width, DESIGN_H / img.height);
  img.setScale(s);
  if (opts.zoom) {
    scene.tweens.add({ targets: img, scale: s * 1.04, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  if (opts.dim) {
    scene.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x0a0e2a, opts.dim);
  }
  return img;
}

/** 파티클용 작은 원/별 텍스처 생성 (한 번만) */
export function ensureParticleTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists('p_dot')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('p_dot', 16, 16);
    g.destroy();
  }
  if (!scene.textures.exists('p_star')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 12 : 5;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(new Phaser.Math.Vector2(12 + Math.cos(a) * r, 12 + Math.sin(a) * r));
    }
    g.fillPoints(pts, true);
    g.generateTexture('p_star', 24, 24);
    g.destroy();
  }
  if (!scene.textures.exists('p_spark')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 6, 24, 4);
    g.fillRect(10, 0, 4, 16);
    g.generateTexture('p_spark', 24, 16);
    g.destroy();
  }
}

/** 떠다니는 반짝이 (홈/맵 분위기용) */
export function addAmbientSparkles(scene: Phaser.Scene, tint = 0xffe59a, quantity = 1) {
  ensureParticleTextures(scene);
  return scene.add.particles(0, 0, 'p_star', {
    x: { min: 0, max: DESIGN_W },
    y: { min: 0, max: DESIGN_H },
    lifespan: { min: 2500, max: 5000 },
    speedY: { min: -18, max: -6 },
    speedX: { min: -8, max: 8 },
    scale: { start: 0.0, end: 0.7 },
    alpha: { start: 0, end: 0.9, ease: 'Sine.easeInOut' },
    rotate: { min: 0, max: 360 },
    tint,
    frequency: 380 / quantity,
    blendMode: Phaser.BlendModes.ADD,
  });
}

export function styleText(size: number, color = '#ffffff', stroke = '#1a1f4a'): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: "'Jua', 'Noto Sans KR', sans-serif",
    fontSize: `${size}px`,
    color,
    stroke,
    strokeThickness: Math.max(4, size / 8),
    shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 6, fill: true },
  };
}
