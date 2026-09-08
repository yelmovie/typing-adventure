import Phaser from 'phaser';
import { styleText } from './common';

/**
 * 직업별 공격 연출 (판정·피해는 동일, 보이는 것만 다르다). 이펙트 시트가 오기 전까지 코드 그래픽으로.
 *  하늘(전사) 검격 / 보라(마법사) 룬·마법진 / 지호(학자) 책장·글자 / 루카(궁수) 화살
 */
export type FxLevel = 'weak' | 'strong' | 'perfect' | 'fever';
export type ClassId = 'brown_boy' | 'pink_girl' | 'glasses_boy' | 'blond_explorer';

const HANGUL = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

const FX_SHEET: Record<ClassId, string> = { brown_boy: 'fx_warrior', pink_girl: 'fx_mage', glasses_boy: 'fx_scholar', blond_explorer: 'fx_archer' };
const ROW: Record<FxLevel, number> = { weak: 0, strong: 1, perfect: 2, fever: 3 };

/** 시트가 있으면 시트 애니메이션(5프레임), 없으면 코드 그래픽 */
export function playClassFx(scene: Phaser.Scene, cls: string, level: FxLevel, from: { x: number; y: number }, to: { x: number; y: number }) {
  const sheet = FX_SHEET[cls as ClassId] ?? 'fx_warrior';
  if (scene.textures.exists(sheet)) return playSheetFx(scene, sheet, cls as ClassId, level, from, to);
  switch (cls as ClassId) {
    case 'pink_girl':
      return mage(scene, level, from, to);
    case 'glasses_boy':
      return scholar(scene, level, from, to);
    case 'blond_explorer':
      return archer(scene, level, from, to);
    default:
      return warrior(scene, level, from, to);
  }
}

function playSheetFx(scene: Phaser.Scene, sheet: string, cls: ClassId, level: FxLevel, from: { x: number; y: number }, to: { x: number; y: number }) {
  const key = `${sheet}_${level}`;
  if (!scene.anims.exists(key)) {
    scene.anims.create({ key, frames: Array.from({ length: 5 }, (_, i) => ({ key: sheet, frame: `c${i}_r${ROW[level]}` })), frameRate: level === 'weak' ? 18 : 14, repeat: 0 });
  }
  const scale = level === 'weak' ? 0.55 : level === 'strong' ? 0.8 : level === 'perfect' ? 1.0 : 1.35;
  const isArcher = cls === 'blond_explorer';
  // 궁수는 화살이 플레이어 쪽에서 목표로 날아가고, 나머지는 목표 지점에서 터진다
  const sx = isArcher && level !== 'fever' ? from.x + 80 : to.x;
  const sy = isArcher && level !== 'fever' ? from.y - 130 : to.y;
  const s = scene.add.sprite(sx, sy, sheet, `c0_r${ROW[level]}`).setScale(scale).setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
  if (isArcher && level !== 'fever') {
    s.setRotation(Phaser.Math.Angle.Between(sx, sy, to.x, to.y));
    scene.tweens.add({ targets: s, x: to.x, y: to.y, duration: level === 'weak' ? 140 : 220, ease: 'Quad.easeIn' });
  }
  if (level === 'fever') s.setY(to.y - 40);
  s.play(key);
  s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => scene.tweens.add({ targets: s, alpha: 0, duration: 120, onComplete: () => s.destroy() }));
}

const fade = (scene: Phaser.Scene, obj: Phaser.GameObjects.GameObject, ms: number, extra: Record<string, unknown> = {}) =>
  scene.tweens.add({ targets: obj, alpha: 0, duration: ms, ...extra, onComplete: () => obj.destroy() });

/** 전사: 검격 호(弧). strong = 큰 베기 2줄, perfect = 대검 세로 베기, fever = 검광 파동 */
function warrior(scene: Phaser.Scene, level: FxLevel, _from: { x: number; y: number }, to: { x: number; y: number }) {
  const g = scene.add.graphics().setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
  const color = level === 'perfect' ? 0xffd34d : 0x8fe0ff;
  const r = level === 'weak' ? 70 : level === 'strong' ? 120 : 170;
  g.lineStyle(level === 'weak' ? 8 : 14, color, 0.95);
  g.beginPath();
  g.arc(to.x, to.y, r, Phaser.Math.DegToRad(-120), Phaser.Math.DegToRad(30), false);
  g.strokePath();
  if (level !== 'weak') {
    g.lineStyle(8, 0xffffff, 0.8);
    g.beginPath();
    g.arc(to.x + 20, to.y - 10, r * 0.7, Phaser.Math.DegToRad(-140), Phaser.Math.DegToRad(10), false);
    g.strokePath();
  }
  if (level === 'perfect' || level === 'fever') {
    const blade = scene.add.rectangle(to.x, to.y - 220, 26, 420, 0xffd34d, 0.9).setDepth(23).setBlendMode(Phaser.BlendModes.ADD).setAngle(-12);
    scene.tweens.add({ targets: blade, y: to.y + 40, angle: 12, duration: 180, ease: 'Quad.easeIn', onComplete: () => fade(scene, blade, 250, { scaleX: 3 }) });
  }
  if (level === 'fever') {
    const wave = scene.add.ellipse(to.x, to.y, 60, 60, 0xffd34d, 0.5).setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: wave, scale: 12, alpha: 0, duration: 500, onComplete: () => wave.destroy() });
  }
  g.setAlpha(0);
  scene.tweens.add({ targets: g, alpha: 1, duration: 60, yoyo: true, hold: level === 'weak' ? 80 : 160, onComplete: () => g.destroy() });
}

/** 마법사: 룬 → 마법탄 → 마법진 → 광역 폭발 */
function mage(scene: Phaser.Scene, level: FxLevel, from: { x: number; y: number }, to: { x: number; y: number }) {
  const color = level === 'perfect' ? 0xff7ab6 : 0xa78bfa;
  const rune = scene.add.star(from.x + 60, from.y - 40, 5, 10, 24, color, 0.9).setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: rune, angle: 180, scale: 1.6, alpha: 0, duration: 300, onComplete: () => rune.destroy() });
  if (level !== 'weak') {
    const ring = scene.add.circle(to.x, to.y, level === 'strong' ? 60 : 110).setStrokeStyle(8, color, 0.9).setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
    const inner = scene.add.star(to.x, to.y, level === 'perfect' ? 6 : 5, (level === 'strong' ? 60 : 110) * 0.5, level === 'strong' ? 60 : 110, color, 0).setStrokeStyle(4, 0xffffff, 0.8).setDepth(23);
    scene.tweens.add({ targets: [ring, inner], angle: 90, scale: 1.5, alpha: 0, duration: 550, onComplete: () => { ring.destroy(); inner.destroy(); } });
  }
  if (level === 'fever') {
    const boom = scene.add.ellipse(to.x, to.y, 80, 80, 0xff7ab6, 0.6).setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: boom, scale: 14, alpha: 0, duration: 600, onComplete: () => boom.destroy() });
  }
}

/** 학자: 날아가는 책장 → 봉인 도장 → 글자 폭풍 */
function scholar(scene: Phaser.Scene, level: FxLevel, from: { x: number; y: number }, to: { x: number; y: number }) {
  const pages = level === 'weak' ? 1 : level === 'strong' ? 3 : 5;
  for (let i = 0; i < pages; i++) {
    const p = scene.add.rectangle(from.x + 40, from.y - 60 - i * 12, 34, 44, 0xfff2b0, 0.95).setStrokeStyle(3, 0x8a6a3a).setDepth(23).setAngle(-20 + i * 15);
    scene.tweens.add({ targets: p, x: to.x + Phaser.Math.Between(-40, 40), y: to.y + Phaser.Math.Between(-60, 20), angle: 360, duration: 220 + i * 40, ease: 'Quad.easeIn', onComplete: () => fade(scene, p, 200, { scale: 0.3 }) });
  }
  if (level !== 'weak') {
    const stamp = scene.add.text(to.x, to.y - 20, level === 'perfect' ? '완' : '봉', styleText(level === 'perfect' ? 96 : 64, '#ff6b6b', '#fff2b0')).setOrigin(0.5).setDepth(24).setScale(2).setAlpha(0);
    scene.tweens.add({ targets: stamp, scale: 1, alpha: 1, duration: 140, ease: 'Quad.easeIn', delay: 200, onComplete: () => fade(scene, stamp, 400, { delay: 250 }) });
  }
  if (level === 'fever') {
    for (let i = 0; i < 16; i++) {
      const ch = scene.add.text(to.x + Phaser.Math.Between(-200, 200), to.y + Phaser.Math.Between(-200, 100), HANGUL[i % HANGUL.length], styleText(40, '#fff2b0')).setOrigin(0.5).setDepth(24).setAlpha(0);
      scene.tweens.add({ targets: ch, alpha: 1, y: ch.y - 120, angle: Phaser.Math.Between(-30, 30), duration: 500, delay: i * 25, yoyo: true, onComplete: () => ch.destroy() });
    }
  }
}

/** 궁수: 화살 1발 → 연사 3발 → 관통 황금 화살 → 화살비 */
function archer(scene: Phaser.Scene, level: FxLevel, from: { x: number; y: number }, to: { x: number; y: number }) {
  const n = level === 'weak' ? 1 : level === 'strong' ? 3 : 1;
  const color = level === 'perfect' || level === 'fever' ? 0xffd34d : 0xe8e8ff;
  for (let i = 0; i < n; i++) {
    const a = scene.add.rectangle(from.x + 60, from.y - 120 + i * 10, level === 'perfect' ? 140 : 90, level === 'perfect' ? 10 : 5, color, 1).setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
    a.setRotation(Phaser.Math.Angle.Between(from.x, from.y - 120, to.x, to.y));
    scene.tweens.add({ targets: a, x: level === 'perfect' ? to.x + 300 : to.x, y: to.y, duration: 140 + i * 50, delay: i * 50, ease: 'Quad.easeIn', onComplete: () => fade(scene, a, 120) });
  }
  if (level === 'fever') {
    for (let i = 0; i < 14; i++) {
      const x = to.x + Phaser.Math.Between(-260, 260);
      const a = scene.add.rectangle(x, -40, 6, 80, 0xffd34d, 1).setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: a, y: to.y + Phaser.Math.Between(-40, 40), duration: 300, delay: i * 40, ease: 'Quad.easeIn', onComplete: () => fade(scene, a, 150) });
    }
  }
}
