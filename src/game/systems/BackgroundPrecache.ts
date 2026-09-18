import { ClassroomReady } from './ClassroomReady';
import { currentScreen } from '../Game';

/**
 * Opportunistic offline preparation. After the first screens settle it downloads the rest
 * of the classroom manifest into the same cache the service worker serves from, so a
 * later offline visit reaches every region without the explicit "prepare" step.
 * Production only; skipped on save-data connections; never blocks input; errors are swallowed.
 */
const SETTLE_DELAY_MS = 3000;
const POLL_MS = 500;
// Menus only. A battle keeps the CPU for its own frames.
const IDLE_SCREENS = new Set(['home', 'worldmap', 'setup', 'result']);
let scheduled = false;

const supported = () => 'caches' in window && 'serviceWorker' in navigator;
const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
const idle = () => IDLE_SCREENS.has(currentScreen() ?? '') && !document.querySelector('.opening-player, #ui-stage[aria-busy="true"]');
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const whenIdle = () => new Promise<void>((resolve) => {
  const idleCallback = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idleCallback) idleCallback(() => resolve(), { timeout: 10000 });
  else window.setTimeout(resolve, 1000);
});
const untilIdleScreen = async () => { while (!idle()) await wait(POLL_MS); };

async function run(): Promise<void> {
  try {
    await untilIdleScreen();
    await wait(SETTLE_DELAY_MS);
    await whenIdle();
    await untilIdleScreen();
    if (!navigator.onLine) { window.addEventListener('online', () => { void run(); }, { once: true }); return; }
    // ClassroomReady keeps three transfers in flight and verifies every file's hash.
    await ClassroomReady.prepare();
  } catch { /* background work must never surface */ }
}

export function scheduleBackgroundPrecache(): void {
  if (scheduled || import.meta.env.DEV || !supported() || saveData()) return;
  scheduled = true;
  void run();
}
