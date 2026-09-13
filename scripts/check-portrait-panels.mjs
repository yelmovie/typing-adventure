import fs from 'node:fs';
import { chromium } from 'playwright';

// Portrait regression uses the rendered transform instead of a 1920px assumption.
// Content may scroll vertically; fixed headers/actions and all text must fit horizontally.
const BASE = process.env.PORTRAIT_URL || 'http://127.0.0.1:5180';
const OUT = process.env.PORTRAIT_OUT || 'tmp/portrait-panels-20260914';
const ONLY = process.env.PORTRAIT_SIZE || '';
const LANGUAGE = process.env.PORTRAIT_LANGUAGE || 'ko';
const SCOPES = new Set((process.env.PORTRAIT_SCOPES || 'home,setup,settings,guide,collection').split(','));
const COLLECTION_TABS = new Set((process.env.PORTRAIT_COLLECTION_TABS || 'monsters,badges,pets,items,titles').split(','));
const PAGE_LIMIT = Number(process.env.PORTRAIT_PAGE_LIMIT || Infinity);
const KEY = 'typing_adventure_save_v1';
const sizes = [[375, 812], [768, 1024]].filter(size => !ONLY || size.join('x') === ONLY);
const fixture = {
  version: '2', profile: { name: '도전', characterId: 'pink_girl', petId: 'rabbit', difficulty: 'normal' },
  progress: { clearedStages: ['stage_1', 'stage_2', 'stage_3', 'stage_4'], coins: 620, tutorialCompleted: true },
  collection: { charactersUnlocked: ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'], petsUnlocked: ['cat', 'rabbit', 'dragon', 'squirrel'] },
  records: { bestCpm: 245, bestAccuracy: 99.2, bestCombo: 120 },
  settings: { language: LANGUAGE, bgm: false, sfx: false, prologueSeen: true },
};
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const flush = () => fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

async function settle(page, scope) {
  await page.locator(scope).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#fade.on') && !document.querySelector('#ui-stage[aria-busy]'));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function record(page, label, scope, screenshot = false) {
  await settle(page, scope);
  const result = await page.locator(scope).evaluate(root => {
    const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[hidden],.finale-sr-only');
    const box = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const selector = element => element.tagName.toLowerCase() + (element.id ? `#${element.id}` : '') + (typeof element.className === 'string' && element.className ? `.${element.className.trim().replace(/\s+/g, '.')}` : '');
    const stageElement = document.querySelector('#ui-stage');
    const stage = box(stageElement);
    const scale = stage.width / stageElement.offsetWidth;
    const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const contains = (outer, inner) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
    const issues = [];
    const panel = box(root);
    if (!contains(viewport, panel)) issues.push({ type: 'panel-outside-viewport', selector: selector(root), box: panel });
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push({ type: 'document-horizontal-overflow', pixels: document.documentElement.scrollWidth - innerWidth });
    const scrollRegions = [root, ...root.querySelectorAll('*')].filter(visible).filter(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1).map(element => ({ selector: selector(element), height: element.clientHeight, contentHeight: element.scrollHeight }));
    if (root.matches('.collection-modal')) {
      const grid = [...root.querySelectorAll('.popup-card-grid')].find(visible);
      const columns = grid && getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      if (grid && columns !== 2) issues.push({ type: 'portrait-collection-columns', selector: selector(grid), expected: 2, actual: columns });
    }
    const controls = [...root.querySelectorAll('button,summary,select,input')].filter(visible).map(element => {
      const r = box(element);
      const name = element.textContent.trim() || element.getAttribute('aria-label') || selector(element);
      if (r.width < 47.9 || r.height < 47.9) issues.push({ type: 'small-control', selector: selector(element), name, width: r.width, height: r.height });
      if (r.left < panel.left - 1 || r.right > panel.right + 1) issues.push({ type: 'horizontal-control-overflow', selector: selector(element), name, box: r });
      return { selector: selector(element), name, disabled: element.disabled, ...r };
    });
    const fixedSelectors = root.matches('.home') ? '.home-language,.topbar-common' : root.matches('.setup-panel') ? '.setup-heading,.setup-steps,.setup-footer' : '.detail-modal-header,.modal-close,:scope > .panel-title,:scope > .modal-actions,.coll-tabs';
    const fixed = [...root.querySelectorAll(fixedSelectors)].filter(visible).map(element => ({ selector: selector(element), ...box(element) }));
    for (const item of fixed) if (!contains(viewport, item)) issues.push({ type: 'fixed-action-or-header-outside-viewport', ...item });
    const textIssues = [];
    const textSizes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const element = node.parentElement;
      const value = node.textContent.trim();
      if (!value || !visible(element) || element.closest('option')) continue;
      textSizes.push({ text: value, selector: selector(element), px: Number((parseFloat(getComputedStyle(element).fontSize) * scale).toFixed(2)) });
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (!r.width || !r.height) continue;
        if (r.left < panel.left - 1 || r.right > panel.right + 1) textIssues.push({ text: value, selector: selector(element), clippedBy: selector(root), direction: 'horizontal' });
        for (let ancestor = element; ancestor && root.contains(ancestor); ancestor = ancestor.parentElement) {
          const css = getComputedStyle(ancestor), bounds = box(ancestor);
          if (['auto', 'scroll', 'hidden', 'clip'].includes(css.overflowX) && (r.left < bounds.left - 1 || r.right > bounds.right + 1)) {
            textIssues.push({ text: value, selector: selector(element), clippedBy: selector(ancestor), direction: 'horizontal' });
            break;
          }
          // A scrolling ancestor provides intentional access to off-screen rows.
          if (['auto', 'scroll'].includes(css.overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 1) break;
          if (['hidden', 'clip'].includes(css.overflowY) && (r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1)) {
            textIssues.push({ text: value, selector: selector(element), clippedBy: selector(ancestor), direction: 'vertical-hidden' });
            break;
          }
        }
      }
    }
    const uniqueTextIssues = [...new Map(textIssues.map(issue => [JSON.stringify(issue), issue])).values()];
    issues.push(...uniqueTextIssues.map(issue => ({ type: 'clipped-text', ...issue })));
    const isModal = root.matches('.modal');
    if (isModal && (!document.querySelector('#ui-root').inert || !root.contains(document.activeElement))) issues.push({ type: 'modal-focus-containment', inert: document.querySelector('#ui-root').inert, activeElement: document.activeElement?.outerHTML.slice(0, 160) });
    return { panel, stage, scale, stageClass: stageElement.className, scrollRegions, controls, fixed, textSizes, issues };
  });
  const controls = page.locator(scope).locator('button:visible,summary:visible,select:visible,input:visible');
  for (let index = 0; index < await controls.count(); index++) {
    const control = controls.nth(index);
    if (await control.isDisabled()) continue;
    await control.scrollIntoViewIfNeeded();
    const reachable = await control.evaluate(element => {
      const r = element.getBoundingClientRect();
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return { name: element.textContent.trim() || element.getAttribute('aria-label'), reachable: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 && (element === hit || element.contains(hit)), hit: hit?.tagName + '.' + hit?.className };
    });
    if (!reachable.reachable) result.issues.push({ type: 'unreachable-control', ...reachable });
  }
  await page.locator(scope).evaluate(root => {
    for (const element of [root, ...root.querySelectorAll('*')]) if (['auto', 'scroll'].includes(getComputedStyle(element).overflowY)) element.scrollTop = 0;
  });
  if (screenshot || result.issues.length) await page.screenshot({ path: `${OUT}/${label}.png` });
  results.push({ label, ...result, pass: result.issues.length === 0 });
  flush();
  console.log(`${result.issues.length ? 'FAIL' : 'PASS'} ${label}${result.issues.length ? ` (${result.issues.length} issues)` : ''}`);
}

async function more(page) { await page.locator('.home-more summary').click(); await settle(page, '.home-menu-dialog'); }
async function home(page) { await page.locator('.topbar-common > button').first().click(); await settle(page, '.home-menu'); }
async function settings(page) { await page.locator('.topbar-common > button').last().click(); await settle(page, '.settings-panel'); }
async function pages(page, prefix, scope) {
  let pageNumber = 1;
  while (true) {
    await record(page, `${prefix}-${pageNumber}`, scope, pageNumber === 1);
    const next = page.locator(`${scope} .popup-page-next`);
    if (pageNumber >= PAGE_LIMIT || !await next.isVisible() || await next.isDisabled()) break;
    await next.click();
    pageNumber++;
  }
}

try {
  for (const [width, height] of sizes) {
    const label = `${LANGUAGE}-${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: KEY, value: fixture });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [], consoleErrors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('.opening-skip').click({ timeout: 60000 });
      await settle(page, '.home-menu');
      if (SCOPES.has('home')) {
        await record(page, `${label}-home`, '.home', true);
        await more(page);
        await record(page, `${label}-more`, '.home-menu-dialog', true);
        await page.locator('.home-menu-dialog .modal-close').click();
      }
      if (SCOPES.has('setup')) {
        await more(page);
        await page.locator('.home-profile').click();
        await settle(page, '.setup-panel');
        for (let index = 0; index < 3; index++) { await page.locator('.setup-step').nth(index).click(); await record(page, `${label}-setup-${index + 1}`, '.setup-panel', true); }
        await home(page);
      }
      if (SCOPES.has('settings')) {
        await settings(page);
        await pages(page, `${label}-settings`, '.settings-panel');
        await page.locator('.settings-panel .modal-close').click();
      }
      if (SCOPES.has('guide')) for (const audience of [0, 1]) {
        await settings(page);
        await page.locator('.settings-panel .popup-page-next').click();
        await page.locator('.settings-panel .setting-links button:visible').nth(audience).click();
        await settle(page, '.guide-panel');
        const select = page.locator('.guide-panel .popup-contents-select');
        const values = await select.locator('option').evaluateAll(options => options.map(option => option.value));
        for (const value of values) {
          await select.selectOption(value);
          const shown = await page.locator('.guide-panel .popup-page:not([hidden])').getAttribute('data-page');
          if (Number(shown) !== Number(value) + 1) throw new Error(`Guide topic ${value} selected page ${shown}`);
        }
        await select.selectOption(values[0]);
        await pages(page, `${label}-guide-${audience}`, '.guide-panel');
        await page.locator('.guide-panel .modal-close').click();
      }
      if (SCOPES.has('collection')) {
        await more(page);
        await page.locator('.home-extra-grid button').filter({ has: page.locator('img[src*="icon_book"]') }).click();
        await settle(page, '.collection-modal');
        const tabs = await page.locator('.coll-tabs button').evaluateAll(buttons => buttons.map(button => button.dataset.tab));
        for (const tab of tabs.filter(tab => COLLECTION_TABS.has(tab))) { await page.locator(`.coll-tabs [data-tab="${tab}"]`).click(); await pages(page, `${label}-collection-${tab}`, '.collection-modal'); }
      }
    } catch (error) {
      results.push({ label, pass: false, error: String(error) });
      console.error(`FAIL ${label}: ${error.message}`);
      await page.screenshot({ path: `${OUT}/${label}-flow-failure.png` }).catch(() => {});
    } finally {
      results.push({ label: `${label}-console`, pass: errors.length === 0 && consoleErrors.length === 0, errors, consoleErrors });
      await context.close();
      flush();
    }
  }
} finally { await browser.close(); }
const failed = results.filter(result => !result.pass);
console.log(`${results.length - failed.length}/${results.length} checks PASS`);
if (failed.length) process.exitCode = 1;
