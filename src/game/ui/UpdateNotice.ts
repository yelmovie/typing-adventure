import { getLanguage } from '../i18n/Locale';
import { h } from '../util/dom';

let registrationPromise: Promise<ServiceWorkerRegistration | undefined> | undefined;

/** Classroom preparation can register immediately without waiting for the opening. */
export function ensureUpdateRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return Promise.resolve(undefined);
  if (!registrationPromise) {
    const base = new URL(import.meta.env.BASE_URL, document.baseURI);
    registrationPromise = navigator.serviceWorker.register(new URL('sw.js', base).href, { scope: base.pathname, updateViaCache: 'none' })
      .catch(() => { registrationPromise = undefined; return undefined; });
  }
  return registrationPromise;
}

/** Never reload another tab or take focus away from a game or a text field. */
export function installUpdateNotice(options: { canOffer: () => boolean; save: () => boolean }) {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  let registration: ServiceWorkerRegistration | undefined;
  let pending = false;
  let applying = false;
  let deferred = false;
  let wasSafe = false;
  let hadController = !!navigator.serviceWorker.controller;
  let lastCheck = 0;
  let scheduled = false;
  let saveFailed = false;
  let applyTimeout: number | undefined;
  const message = h('span', { class: 'update-notice-message' });
  const apply = h('button', { type: 'button', class: 'update-apply', onclick: () => {
    if (!options.canOffer() || applying) return;
    if (!options.save()) { saveFailed = true; render(); return; }
    saveFailed = false;
    applying = true;
    render();
    const worker = registration?.waiting;
    if (worker) {
      worker.postMessage({ type: 'SKIP_WAITING' });
      // Failed activation leaves the game usable; never refresh on a timer.
      applyTimeout = window.setTimeout(() => { applying = false; render(); }, 15000);
    } else location.reload();
  } });
  const later = h('button', { type: 'button', class: 'update-later', onclick: () => { deferred = true; render(); } });
  const notice = h('aside', { class: 'update-notice', role: 'status', 'aria-live': 'polite', hidden: true, 'data-no-translate': 'true' }, message, apply, later);
  document.body.append(notice);

  function render() {
    const safe = options.canOffer();
    if (safe && !wasSafe) deferred = false;
    wasSafe = safe;
    notice.hidden = !pending || !safe || deferred;
    const en = getLanguage() === 'en';
    const text = saveFailed
      ? (en ? 'Save your records first. Use the save notice before updating.' : '기록을 먼저 저장해야 해. 저장 안내에서 다시 저장해 줘.')
      : (en ? 'A new version is ready. Your saved adventure stays with you.' : '새 버전이 준비됐어. 모험 기록은 그대로야.');
    if (message.textContent !== text) message.textContent = text;
    const label = applying ? (en ? 'Opening…' : '새로 여는 중…') : (en ? 'Open new version' : '새 버전 열기');
    if (apply.textContent !== label) apply.textContent = label;
    const laterLabel = en ? 'Later' : '나중에';
    if (later.textContent !== laterLabel) later.textContent = laterLabel;
    apply.disabled = applying;
    later.disabled = applying;
  }
  function watch(worker: ServiceWorker | null) {
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) { pending = true; deferred = false; render(); }
    });
  }
  async function start() {
    registration = await ensureUpdateRegistration();
    if (!registration) return;
    lastCheck = Date.now();
    pending = !!registration.waiting;
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration?.installing ?? null));
    render();
  }
  let started = false;
  function refresh() {
    scheduled = false;
    render();
    // Keep first-visit JS, fonts, and intro video ahead of Workbox's shell download.
    if (!started && options.canOffer()) { started = true; void start(); }
  }
  const observer = new MutationObserver(() => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(refresh); }
  });
  observer.observe(document.getElementById('viewport') ?? document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert', 'aria-busy'] });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) { clearTimeout(applyTimeout); location.reload(); return; }
    // Another tab can apply an update. This tab keeps its running game intact.
    if (hadController) { pending = true; deferred = false; render(); }
    hadController = true;
  });
  const check = () => {
    if (document.hidden || !navigator.onLine || !registration || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    void registration.update().catch(() => undefined);
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('online', check);
  window.setInterval(check, 5 * 60 * 1000);
  refresh();
}
