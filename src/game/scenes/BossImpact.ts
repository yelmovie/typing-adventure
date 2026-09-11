import Phaser from 'phaser';
import { prefersReducedMotion, styleText } from './common';

type Point = { x: number; y: number };
type HitLevel = 'weak' | 'strong' | 'perfect';

/** Visual-only attacks: never pauses the scene clock, input, or game simulation. */
export class BossImpact {
  private disposed = false;
  private lastWeak = -1000;
  private flights = new Set<Phaser.GameObjects.Container>();
  constructor(private scene: Phaser.Scene) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.disposed = true; this.flights.clear(); });
  }

  launch(from: Point, to: Point, level: HitLevel, glyph: string, onImpact: () => void) {
    if (this.disposed) return;
    const weak = level === 'weak';
    if (weak && this.scene.time.now - this.lastWeak < 65) return;
    if (weak) this.lastWeak = this.scene.time.now;
    const color = level === 'perfect' ? 0xffdc73 : weak ? 0x9aeaff : 0x79d9ff;
    if (prefersReducedMotion()) {
      this.impact(to, level, color);
      onImpact();
      return;
    }
    const radius = weak ? 23 : 35;
    const trail = this.scene.add.line(0, 0, -radius - (weak ? 75 : 130), 0, -radius, 0, color, 0.65).setOrigin(0).setLineWidth(weak ? 4 : 8);
    const key = this.scene.add.rectangle(0, 0, radius * 2, radius * 2, 0x17334d, 0.96).setStrokeStyle(weak ? 4 : 6, color);
    const letter = this.scene.add.text(0, -1, glyph || '✦', styleText(weak ? 34 : 44, '#fff8dc')).setOrigin(0.5);
    const shot = this.scene.add.container(from.x, from.y, [trail, key, letter]).setDepth(26).setName(`boss-shot-${weak ? 'weak' : 'strong'}`);
    const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
    shot.setRotation(angle); letter.setRotation(-angle);
    this.flights.add(shot);
    const travel = { progress: 0 };
    this.scene.tweens.add({ targets: travel, progress: 1, duration: weak ? 180 : 260, ease: 'Sine.easeIn',
      onUpdate: () => {
        const p = travel.progress;
        shot.setPosition(Phaser.Math.Linear(from.x, to.x, p), Phaser.Math.Linear(from.y, to.y, p) - Math.sin(p * Math.PI) * (weak ? 24 : 48));
      },
      onComplete: () => {
        this.flights.delete(shot); shot.destroy();
        if (this.disposed) return;
        this.impact(to, level, color);
        onImpact();
      },
    });
  }

  private impact(at: Point, level: HitLevel, color: number) {
    const weak = level === 'weak', reduced = prefersReducedMotion();
    const ring = this.scene.add.circle(0, 0, weak ? 30 : 62, 0x10263e, 0.16).setStrokeStyle(weak ? 5 : 9, color, 0.95);
    const slashA = this.scene.add.rectangle(0, 0, weak ? 66 : 140, weak ? 7 : 12, color).setAngle(-28);
    const slashB = this.scene.add.rectangle(0, 0, weak ? 40 : 105, weak ? 5 : 8, 0xfff4cf).setAngle(28);
    const impact = this.scene.add.container(at.x, at.y, [ring, slashA, slashB]).setDepth(27).setName(`boss-impact-${weak ? 'weak' : 'strong'}`);
    if (reduced) { this.scene.time.delayedCall(weak ? 140 : 260, () => impact.destroy()); return; }
    // Hold the collision mark, not the scene: typing and timers continue throughout.
    this.scene.tweens.add({ targets: impact, scale: weak ? 1.25 : 1.5, alpha: 0, delay: weak ? 35 : 80, duration: weak ? 150 : 240, onComplete: () => impact.destroy() });
    for (let i = 0; i < (weak ? 4 : 8); i++) {
      const angle = (i / (weak ? 4 : 8)) * Math.PI * 2;
      const fragment = this.scene.add.rectangle(at.x, at.y, weak ? 7 : 13, weak ? 7 : 13, color).setAngle(45).setDepth(26);
      this.scene.tweens.add({ targets: fragment, x: at.x + Math.cos(angle) * (weak ? 54 : 105), y: at.y + Math.sin(angle) * (weak ? 42 : 80), alpha: 0, angle: 100, duration: weak ? 210 : 350, onComplete: () => fragment.destroy() });
    }
  }

  damage(at: Point, damage: number, perfect = false) {
    if (damage <= 0 || this.disposed) return;
    const label = this.scene.add.text(at.x + 30, at.y - 80, `−${damage}`, styleText(perfect ? 76 : 64, perfect ? '#ffdf7b' : '#fff8e6')).setOrigin(0.5).setDepth(28).setName('boss-damage-number');
    if (prefersReducedMotion()) this.scene.time.delayedCall(550, () => label.destroy());
    else this.scene.tweens.add({ targets: label, y: label.y - 48, alpha: 0, duration: 580, delay: 120, ease: 'Sine.easeOut', onComplete: () => label.destroy() });
  }
}
