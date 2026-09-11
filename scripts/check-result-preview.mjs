import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

// Production UI route and real typing, always using a disposable browser profile.
const BASE=process.env.RESULT_PREVIEW_URL||'http://127.0.0.1:4176';
const DIST=process.env.RESULT_PREVIEW_DIST||'dist-preview-20260911-result-fit';
const OUT=process.env.RESULT_PREVIEW_OUT||'tmp/result-preview-final';
const KEY='typing_adventure_save_v1';
fs.mkdirSync(OUT,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(`${DIST}/classroom-manifest.json`,'utf8'));
for(const a of manifest.assets){const b=fs.readFileSync(`${DIST}/${a.url}`);assert.equal(b.length,a.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),a.revision);}
assert.equal((await fetch(`${BASE}/classroom-manifest.json`).then(r=>r.json())).version,manifest.version);
const results=[],browser=await chromium.launch({channel:'chrome'});
try {
  for(const language of ['ko','en']) {
    const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'allow'});
    await context.addInitScript(({KEY,language})=>localStorage.setItem(KEY,JSON.stringify({version:'2',profile:{name:'Result check',characterId:'glasses_boy',petId:'rabbit',difficulty:'normal'},progress:{unlockedStage:5,clearedStages:['stage_1'],stageStars:{stage_1:3},coins:123,tutorialCompleted:true},settings:{language,bgm:false,sfx:false,prologueSeen:true,showKeyboardGuide:false}})),{KEY,language});
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);
    page.on('pageerror',e=>errors.push(e.message));
    const ready=async selector=>{await page.locator(selector).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#fade.on')&&!document.querySelector('#ui-stage[aria-busy]'));};
    try {
      await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.locator('.opening-skip').click();await page.locator('.opening-player').waitFor({state:'detached'});
      await ready('.home-menu');await page.locator('.home-menu > .btn-primary').click();await ready('.journey-map');
      await page.locator('.map-node').nth(2).click();await ready('.intro-panel');await page.locator('.intro-battle').click();await ready('.bb-input');
      let completed=0;
      while(!await page.locator('.result-panel').count()) {
        await page.waitForFunction(()=>document.querySelector('.result-panel')||document.querySelector('.bb-input')&&!document.querySelector('.bb-input').disabled);
        if(await page.locator('.result-panel').count()) break;
        const target=await page.locator('.bb-target').innerText();assert.ok(target.trim());
        await page.locator('.bb-input').fill(target);completed++;
        await page.waitForFunction(previous=>document.querySelector('.result-panel')||document.querySelector('.bb-target')?.textContent!==previous,target);
        assert.ok(completed<=20,'normal letter stage has a bounded completion');
      }
      await ready('.result-panel');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1400);
      assert.ok(completed>=6);assert.equal(await page.evaluate(()=>typeof window.__game),'undefined');
      const before=await page.evaluate(KEY=>localStorage.getItem(KEY),KEY);
      const screens=[];
      for(const [width,height] of [[1280,800],[915,412]]) {
        await page.setViewportSize({width,height});
        for(let i=0;i<3;i++) {
          await page.locator('.result-tabs button').nth(i).click();
          await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
          const state=await page.evaluate(()=>{
            const els=[...document.querySelectorAll('.result-panel,.result-body,.result-pane:not([hidden]),.result-page-content')].filter(e=>e.getClientRects().length);
            return els.map(e=>({class:e.className,x:e.scrollWidth-e.clientWidth,y:e.scrollHeight-e.clientHeight}));
          });
          assert.ok(state.every(e=>e.x<=1&&e.y<=1),JSON.stringify(state));
          screens.push({width,height,tab:i,state});await page.screenshot({path:`${OUT}/${language}-${width}-tab${i}.png`});
        }
      }
      assert.equal(await page.evaluate(KEY=>localStorage.getItem(KEY),KEY),before,'reading and switching tabs preserve saved result');
      await page.locator('.result-actions button').last().click();await ready('.journey-map');
      assert.deepEqual(errors,[]);results.push({language,pass:true,completed,screens});console.log(`PASS production ${language}: actual stage3 clear, result tabs fit, saved records preserved, return to map`);
    } catch(error) {await page.screenshot({path:`${OUT}/failure-${language}.png`});results.push({language,pass:false,error:String(error),errors});throw error;}
    finally {await context.close();}
  }
} finally {
  await browser.close();fs.writeFileSync(`${OUT}/results.json`,JSON.stringify({dist:DIST,manifest:manifest.version,assets:manifest.assets.length,bytes:manifest.assets.reduce((s,a)=>s+a.bytes,0),results},null,2));
}
