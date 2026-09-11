import { h } from '../util/dom';
import { portraitUrl } from '../data/characters';

interface Atlas {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  meta: { size: { w: number; h: number } };
}

/** Render a home atlas frame without duplicating generated art or loading a game scene. */
export function finaleSprite(sheet: string, label: string, kind: 'hero' | 'pet', signal: AbortSignal) {
  const fallback = h('img', { class: 'finale-portrait', src: portraitUrl(sheet), alt: '', draggable: false });
  const frame = h('span', { class: 'finale-sprite-frame' });
  const sprite = h('span', {
    class: `finale-cast-sprite finale-cast-${kind}`, role: 'img', 'aria-label': label,
    'data-sheet': sheet, 'data-frame': 'portrait',
  }, fallback, frame);
  const ready = async () => {
    try {
      const response = await fetch(`./assets/sprites/${sheet}_home.json`, { signal });
      if (!response.ok) return;
      const atlas = await response.json() as Atlas;
      const frameName = kind === 'hero' ? 'idle_front' : 'cheer';
      const rect = atlas.frames[frameName]?.frame;
      if (!rect?.w || !rect.h || !atlas.meta.size.w || !atlas.meta.size.h) return;
      const image = h('img', { src: `./assets/sprites/${sheet}_home.webp`, alt: '', draggable: false });
      await image.decode();
      if (signal.aborted) return;
      Object.assign(frame.style, { aspectRatio: `${rect.w} / ${rect.h}` });
      Object.assign(image.style, {
        width: `${atlas.meta.size.w / rect.w * 100}%`,
        height: `${atlas.meta.size.h / rect.h * 100}%`,
        left: `${-rect.x / rect.w * 100}%`, top: `${-rect.y / rect.h * 100}%`,
      });
      frame.append(image);
      sprite.dataset.frame = frameName;
      sprite.classList.add('is-ready');
    } catch {
      // The chosen character's portrait remains visible if the small atlas cannot load.
    }
  };
  void ready();
  return sprite;
}
