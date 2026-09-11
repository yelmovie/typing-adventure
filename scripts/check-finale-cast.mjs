import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const BASE = process.env.FINALE_TEST_URL || 'http://127.0.0.1:5180';
const OUT = process.env.FINALE_CAST_OUT || 'tmp/finale-cast';
fs.mkdirSync(OUT, { recursive: true });
const heroes = ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'];
const pets = ['cat', 'rabbit', 'dragon', 'squirrel'];
const sizes = [[915, 412], [1024, 768], [1280, 800], [1920, 1080]];
const browser = await chromium.launch({ channel: process.env.FINALE_BROWSER_CHANNEL || 'chrome' });
const results = [];
const app = (page, path, method, ...args) => page.evaluate(async ({ path, method, args }) => {
  const entry = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === path);
  if (!entry) throw new Error(`Missing loaded module: ${path}`);
  const module = await import(entry.name);
  return method === 'setProfile' ? module.SaveSystem.setProfile(...args) : module[method](...args);
}, { path, method, args });
const metrics = (page) => page.evaluate(() => {
  const panel = document.querySelector('.finale-player');
  const scale = panel.getBoundingClientRect().width / panel.offsetWidth;
  const errors = [];
  const text = [];
  const pr = panel.getBoundingClientRect();
  for (const element of panel.querySelectorAll('h2,p,figcaption,button')) {
    if (!element.checkVisibility() || element.classList.contains('finale-sr-only')) continue;
    const r = element.getBoundingClientRect();
    const min = element.tagName === 'H2' ? 30 : element.tagName === 'BUTTON' || element.classList.contains('finale-cast-label') ? 26 : 20;
    const font = parseFloat(getComputedStyle(element).fontSize) * scale;
    text.push({ class: element.className, font, min, text: element.textContent });
    if (font < min - .1) errors.push(`small font ${element.className}: ${font}`);
    if (r.left < pr.left - 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || r.bottom > pr.bottom + 1) errors.push(`outside panel: ${element.className}`);
    const range = document.createRange(); range.selectNodeContents(element);
    for (const tr of range.getClientRects()) if (tr.left < r.left - 2 || tr.right > r.right + 2 || tr.top < r.top - 2 || tr.bottom > r.bottom + 2) errors.push(`text clipped: ${element.className}`);
    if (element.tagName === 'BUTTON') {
      if (r.height < 47.9 || r.width < 47.9) errors.push(`small button: ${r.width}x${r.height}`);
      if (!element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))) errors.push('button blocked');
    }
  }
  for (const selector of ['.finale-player','.finale-celebration','.finale-cast','.finale-footer']) {
    const e = panel.matches(selector) ? panel : panel.querySelector(selector);
    if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) errors.push(`overflow: ${selector} ${e.scrollHeight}/${e.clientHeight}, ${e.scrollWidth}/${e.clientWidth}`);
  }
  const cast = [...panel.querySelectorAll('.finale-cast-sprite')].map(e => {
    const r=e.getBoundingClientRect(); const film=panel.querySelector('.finale-film').getBoundingClientRect();
    if (!r.width || !r.height || r.right > film.left + 1) errors.push(`cast overlaps video: ${e.dataset.sheet}`);
    return { sheet:e.dataset.sheet, frame:e.dataset.frame, width:r.width, height:r.height };
  });
  return { errors, text, cast };
});
try {
  for (const language of ['ko','en']) {
    const context = await browser.newContext({viewport:{width:915,height:412},reducedMotion:'reduce'});
    await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({type:'connected'})); });
    await context.addInitScript(data => localStorage.setItem('typing_adventure_save_v1', JSON.stringify(data)), {
      version:'1', profile:{name:'별빛친구',characterId:'brown_boy',petId:'cat',difficulty:'normal'},
      progress:{unlockedStage:5,clearedStages:heroes.map((_,i)=>`stage_${i+1}`).concat('stage_5'),stageStars:{stage_1:3,stage_2:3,stage_3:3,stage_4:3,stage_5:3},coins:620},
      collection:{petsUnlocked:pets,charactersUnlocked:heroes,badges:['fever_master','letter_perfect']}, settings:{language,bgm:false,sfx:false,prologueSeen:true}
    });
    const page = await context.newPage();
    const pageErrors=[]; page.on('pageerror',e=>pageErrors.push(e.message));
    await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('.opening-skip').click({timeout:60000});
    await page.locator('.opening-player').waitFor({state:'detached'});
    await page.locator('.home-menu').waitFor();
    for (const hero of heroes) for (const pet of pets) { console.log('CHECK',language,hero,pet);
      const name = language === 'ko' ? '반짝이는별빛친구'.repeat(3).slice(0,24) : 'My Bright Adventure Team';
      await app(page,'/src/game/systems/SaveSystem.ts','setProfile',name,hero,pet,'normal');
      const before = await page.evaluate(()=>localStorage.getItem('typing_adventure_save_v1'));
      await app(page,'/src/game/ui/ModalController.ts','certificateModal');
      await page.waitForFunction(()=>document.querySelectorAll('.finale-cast-sprite.is-ready').length===2);
      await page.evaluate(()=>document.fonts.ready);
      assert.match(await page.locator('#finale-title').textContent(),new RegExp(name));
      assert.equal(await page.locator('.finale-cast-hero').getAttribute('data-sheet'),`char_${hero}`);
      assert.equal(await page.locator('.finale-cast-pet').getAttribute('data-sheet'),`pet_${pet}`);
      assert.match(await page.locator('.finale-film-caption').textContent(),language==='ko'?/하늘과 고양이/:/Haneul and Cat/);
      assert.equal(await page.locator('.finale-video').getAttribute('src'),null);
      for (const [width,height] of sizes) {
        await page.setViewportSize({width,height});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const measured = await metrics(page);
        const label = `${language}-${hero}-${pet}-${width}`;
        results.push({label,...measured,pass:measured.errors.length===0});
        if (pet === 'rabbit') await page.screenshot({path:`${OUT}/${label}.png`});
        if (measured.errors.length) {
          await page.screenshot({path:`${OUT}/failure-${label}.png`});
          throw new Error(`${label}: ${measured.errors.join('; ')}`);
        }
      }
      await page.keyboard.press('Escape');
      await page.locator('.cert').waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>localStorage.getItem('typing_adventure_save_v1')),before,'Viewing the finale must preserve the selected profile and saved records');
      console.log(`PASS ${language} ${hero} ${pet}: 4 sizes`);
    }
    assert.deepEqual(pageErrors,[]);
    await context.close();
  }
} finally {
  fs.writeFileSync(`${OUT}/results.json`,JSON.stringify(results,null,2));
  await browser.close();
}

