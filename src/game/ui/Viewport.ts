/** Shared 1920×1080 layout, available before the game engine downloads. */
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;
let installed = false;
let refreshCanvas: (() => void) | undefined;
let layoutWidth = 0;
let layoutHeight = 0;
let portraitLayout = false;
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
    // A keyboard can shrink either the visual viewport or the layout viewport.
    // Preserve orientation while editing when only height changes.
    const editing = document.activeElement?.matches('input:not([type=range]), textarea, [contenteditable=true]');
    const keyboardResize = !!editing && layoutWidth === window.innerWidth && layoutHeight - hgt > 150;
    if (!keyboardResize) {
      layoutWidth = window.innerWidth;
      layoutHeight = window.innerHeight;
      portraitLayout = layoutHeight > layoutWidth;
    }
    const portrait = portraitLayout;
    const s = portrait ? w / Math.min(960, Math.max(750, w)) : Math.min(w / DESIGN_W, hgt / DESIGN_H);
    // 가로 화면이 16:9가 아니면(4:3 태블릿·폴드는 위아래, 화면 키보드는 양옆) 캔버스는 가운데 16:9 띠로 남는다.
    // UI 층은 남는 공간까지 넓히고, 띠 위치(--band-*)를 알려 기본 화면은 캔버스와 맞춰 둔다.
    const layoutW = portrait ? w / s : Math.max(DESIGN_W, w / s);
    const layoutH = portrait ? hgt / s : Math.max(DESIGN_H, hgt / s);
    const left = (w - layoutW * s) / 2;
    const top = (hgt - layoutH * s) / 2;
    stage.style.width = layoutW + 'px';
    stage.style.height = layoutH + 'px';
    stage.style.left = '0'; stage.style.top = '0';
    stage.style.transform = 'translate(' + left + 'px, ' + top + 'px) scale(' + s + ')';
    stage.style.setProperty('--ui-scale', String(s));
    stage.style.setProperty('--ui-unit', (1 / s) + 'px');
    stage.style.setProperty('--band-left', portrait ? '0px' : (layoutW - DESIGN_W) / 2 + 'px');
    stage.style.setProperty('--band-top', portrait ? '0px' : (layoutH - DESIGN_H) / 2 + 'px');
    stage.classList.toggle('portrait-display', portrait);
    stage.classList.toggle('narrow-display', w < 600);
    stage.classList.toggle('keyboard-display', keyboardResize || (!!vv && window.innerHeight - hgt > 150));
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
