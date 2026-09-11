import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Real navigation loads the art; each case uses a disposable browser/save context.
const BASE = process.env.ATTACK_TEST_URL || 'http://127.0.0.1:5180';
const OUT = process.env.ATTACK_TEST_OUT || 'tmp/attack-locales-20260911';
const characters = ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'];
const results = [];
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.MOTION_BROWSER_CHANNEL || 'chrome' });
try {
  for (const language of ['ko', 'en']) for (const [row, characterId] of characters.entries()) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
    await context.addInitScript(({ characterId, language }) => localStorage.setItem('typing_adventure_save_v1', JSON.stringify({
      version: '2', profile: { name: 'Motion check', characterId, petId: 'rabbit', difficulty: 'normal' },
      progress: { unlockedStage: 5, clearedStages: ['stage_1'], stageStars: { stage_1: 3 }, coins: 123 },
      collection: { charactersUnlocked: ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'], petsUnlocked: ['cat', 'rabbit'] },
      settings: { language, bgm: false, sfx: false, prologueSeen: true, showKeyboardGuide: false },
    })), { characterId, language });
    const page = await context.newPage(), errors = [], responses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (/char_attack_ko_v1\.(webp|json)$/.test(response.url())) responses.push({ url: response.url(), status: response.status() }); });
    try {
      await page.goto(`${BASE}/?go=intro&stage=stage_4`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(row => {
        const scene = window.__game?.scene.getScene('StageIntro');
        return scene?.scene.isActive() && scene.player?.sprite.frame.name === `c8_r${row}` && !document.querySelector('#ui-stage[aria-busy]');
      }, row, { timeout: 60000 });
      assert.ok(responses.length >= 2 && responses.every(r => r.status === 200), 'cold navigation loads the complete Korean attack atlas in either language');
      const checks = await page.evaluate(async ({ row, characterId, language }) => {
        const { setLanguage } = await import('/src/game/i18n/Locale.ts');
        const { playClassFx } = await import('/src/game/scenes/ClassFx.ts');
        const { ensureScreenAssets } = await import('/src/game/scenes/StageIntroScene.ts');
        const scene = window.__game.scene.getScene('StageIntro'), actor = scene.player;
        const checks = [], sheet = `char_${characterId}`, koAtlas = 'char_attack_ko_v1';
        const wait = ms => new Promise(resolve => scene.time.delayedCall(ms, resolve));
        const check = (name, pass, evidence) => checks.push({ name, pass, evidence });
        const sample = async (action, duration) => {
          const frames = new Set();
          const take = () => frames.add(actor.sprite.texture.key + ':' + actor.sprite.frame.name);
          scene.events.on('postupdate', take); action(); take(); await wait(duration); scene.events.off('postupdate', take);
          return [...frames];
        };
        const properAttack = (frames, lang) => lang === 'ko'
          ? [0, 1, 2, 3].every(col => frames.includes(`${koAtlas}:c${col}_r${row}`)) && !frames.some(f => /:attack_[01]$/.test(f))
          : frames.some(f => f === `${sheet}:attack_0`) && frames.some(f => f === `${sheet}:attack_1`) && !frames.some(f => f.startsWith(koAtlas));
        actor.idle('right');
        let frames = await sample(() => actor.jab(), 280);
        check('typing uses the selected character and language', properAttack(frames, language), { frames });
        let hits = 0, done = 0;
        frames = await sample(() => actor.attack(() => hits++, () => done++), 450);
        check('attack uses the selected language and completes each callback once', properAttack(frames, language) && hits === 1 && done === 1 && !actor.busy, { frames, hits, done });
        actor.walking = true; actor.walk('right', true);
        let starts = 0;
        const countStart = () => starts++;
        actor.sprite.on('animationstart', countStart);
        frames = await sample(() => { actor.jab(); actor.attack(() => hits++); actor.idle('right'); }, 720);
        actor.sprite.off('animationstart', countStart);
        check('run → typing/attack → run keeps its stride and never flashes an attack fallback', frames.length === 8 && frames.every(f => f.startsWith('char_walk_v2:')) && starts === 0 && hits === 2, { frames, starts, hits });
        actor.walking = false; actor.idle('right');
        for (const level of ['weak', 'strong', 'perfect', 'fever']) {
          const before = new Set(scene.children.list), textures = new Set(), texts = new Set();
          const take = () => scene.children.list.filter(child => !before.has(child)).forEach(child => {
            if (child.texture?.key) textures.add(child.texture.key);
            if (typeof child.text === 'string') texts.add(child.text);
          });
          scene.events.on('postupdate', take);
          playClassFx(scene, characterId, level, { x: 1150, y: 780 }, { x: 1450, y: 700 });
          take(); await wait(950); scene.events.off('postupdate', take);
          const englishScholar = language === 'en' && characterId === 'glasses_boy';
          check(`${level} spell keeps localized lettering`, englishScholar
            ? !textures.has('fx_scholar') && ![...texts].some(text => /[가-힣]/.test(text)) && (level === 'weak' || texts.size > 0)
            : textures.has({ brown_boy: 'fx_warrior', pink_girl: 'fx_mage', glasses_boy: 'fx_scholar', blond_explorer: 'fx_archer' }[characterId]),
          { textures: [...textures], texts: [...texts] });
        }
        const alternate = language === 'ko' ? 'en' : 'ko';
        setLanguage(alternate);
        frames = await sample(() => actor.jab(), 280);
        check('changing language on the same actor uses the newly selected art', properAttack(frames, alternate), { alternate, frames });
        setLanguage('ko'); actor.idle('right');
        scene.textures.get(koAtlas).remove(`c3_r${row}`);
        frames = await sample(() => actor.attack(() => {}), 450);
        check('a partial Korean atlas never falls back to English keys', !frames.some(f => /:attack_[01]$/.test(f)) && !frames.some(f => f.startsWith(koAtlas)), { frames });
        await ensureScreenAssets(scene, 'intro', { stageId: 'stage_4' });
        frames = await sample(() => actor.jab(), 280);
        check('navigation repairs a partial atlas and replaces stale animation frames', properAttack(frames, 'ko'), { frames });
        actor.idle('right'); scene.textures.remove(koAtlas);
        frames = await sample(() => actor.jab(), 280);
        check('an absent Korean atlas never shows English keys', !frames.some(f => /:attack_[01]$/.test(f)) && !frames.some(f => f.startsWith(koAtlas)), { frames });
        await ensureScreenAssets(scene, 'intro', { stageId: 'stage_4' });
        frames = await sample(() => actor.jab(), 280);
        check('missing atlas recovery restores the four correct Korean frames', properAttack(frames, 'ko'), { frames });
        setLanguage(language); actor.idle('right'); actor.jab(); await wait(90);
        scene.scene.pause();
        return checks;
      }, { row, characterId, language });
      await page.screenshot({ path: `${OUT}/${language}-${characterId}-attack.png` });
      assert.deepEqual(errors, [], 'no browser runtime errors');
      const pass = checks.every(check => check.pass);
      results.push({ language, characterId, pass, checks, responses });
      console.log(`${pass ? 'PASS' : 'FAIL'} ${language} ${characterId}: ${checks.filter(c => c.pass).length}/${checks.length}`);
      for (const failed of checks.filter(check => !check.pass)) console.log(JSON.stringify(failed));
    } catch (error) {
      results.push({ language, characterId, pass: false, error: String(error), errors, responses });
      console.log(`FAIL ${language} ${characterId}: ${String(error)}`);
      await page.screenshot({ path: `${OUT}/failure-${language}-${characterId}.png` });
    } finally {
      fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), results }, null, 2));
      await context.close();
    }
  }
} finally { await browser.close(); }
assert.ok(results.length === 8 && results.every(row => row.pass), 'all eight character/language paths pass');
console.log(`${results.length}/8 attack language cases passed.`);
