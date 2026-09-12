/** Shared 1920×1080 layout, available before the game engine downloads. */
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;
let installed = false;
let refreshCanvas: (() => void) | undefined;
export function setupUiScale(refresh?: () => void) {
  if (refresh) refreshCanvas = refresh;
  const stage = document.getElementById('ui-stage')!;
  const viewport = document.getElementById('viewport')!;
  const apply = () => {
    const vv = window.visualViewport;
    const w = vv?.width ?? window.innerWidth;
    const hgt = vv?.height ?? window.innerHeight;
    viewport.style.width = w + 'px';
    viewport.style.height = hgt + 'px';
    viewport.style.left = (vv?.offsetLeft ?? 0) + 'px';
    viewport.style.top = (vv?.offsetTop ?? 0) + 'px';
    const s = Math.min(w / DESIGN_W, hgt / DESIGN_H);
    const left = (w - DESIGN_W * s) / 2;
    const top = (hgt - DESIGN_H * s) / 2;
    stage.style.left = '0'; stage.style.top = '0';
    stage.style.transform = 'translate(' + left + 'px, ' + top + 'px) scale(' + s + ')';
    stage.style.setProperty('--ui-scale', String(s));
    stage.style.setProperty('--ui-unit', (1 / s) + 'px');
    stage.classList.toggle('small-display', s < 0.56);
    stage.classList.toggle('short-display', hgt < 500);
    stage.classList.toggle('compact', s < 0.72);
    refreshCanvas?.();
  };
  apply();
  if (installed) return;
  installed = true;
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 50));
}
