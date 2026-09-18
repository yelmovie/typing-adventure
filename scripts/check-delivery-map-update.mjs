import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Focused follow-up for map CSS and completion-title consistency after the full suite passed.
// Uses new isolated storage and never connects to a user's browser profile.
const BASE = process.env.DELIVERY_TEST_URL || 'http://127.0.0.1:4176';
const DIST = process.env.DELIVERY_DIST || 'dist-v033';
const OUT = process.env.DELIVERY_OUT || 'tmp/delivery-v033-map-final';
fs.mkdirSync(OUT, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(`${DIST}/classroom-manifest.json`, 'utf8'));
for (const asset of manifest.assets) {
  const buffer = fs.readFileSync(`${DIST}/${asset.url}`);
  assert.equal(buffer.length, asset.bytes, asset.url);
  assert.equal(createHash('sha256').update(buffer).digest('hex'), asset.revision, asset.url);
}
const harness = await build({ entryPoints:['src/game/systems/ClassroomReady.ts'], bundle:true, format:'iife', globalName:'ClassroomHarness', write:false });
const result = {
  startedAt:new Date().toISOString(), base:BASE, dist:DIST,
  manifestVersion:manifest.version, cacheName:manifest.cacheName,
  assets:manifest.assets.length, bytes:manifest.assets.reduce((sum,a)=>sum+a.bytes,0),
  shaValidated:manifest.assets.length, bundles:manifest.assets.filter(a=>/^\.\/assets\/index-.*\.(js|css)$/.test(a.url)).map(a=>a.url),
  baseline:'tmp/delivery-v033-final/results.json — 14/14, manifest 6fa2166cbdee11ad',
  scope:'Map CSS and completion-title follow-up: actual final-file SHA, full verified preparation, offline document reload, actual pin bounds, real map → region 4/5 intro → map. Full battle/media suite is preserved in the baseline. No performance measurement.',
  checks:[], performance:[], performanceSkipped:true,
};
const browser = await chromium.launch({channel:process.env.DELIVERY_BROWSER_CHANNEL||'chrome'});
let page;
const errors = [], offlineResponses = [];
let offline = false;
const ready = async selector => {
  await page.locator(selector).waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(()=>!document.querySelector('#fade.on')&&!document.getElementById('ui-stage')?.inert&&!document.getElementById('ui-root')?.inert&&!document.getElementById('ui-stage')?.hasAttribute('aria-busy'));
};
const home = async () => {
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.locator('.opening-skip').click({timeout:60000});
  await page.locator('.opening-player').waitFor({state:'detached'});
  await ready('.home-menu');
};
try {
  const context = await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'allow',reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    const key='typing_adventure_save_v1';
    if(!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify({
      version:'2',profile:{name:'하늘',characterId:'brown_boy',petId:'cat',difficulty:'normal'},
      // 해금은 실제 완료에서 계산된다(SaveValidation): 지역 4·5를 열려면 1~4 완료가 필요하고, 5는 미완료라 제목은 '모험 지도'다.
      progress:{unlockedStage:5,clearedStages:['stage_1','stage_2','stage_3','stage_4'],stageStars:{stage_1:1,stage_2:1,stage_3:1,stage_4:1},coins:0,tutorialCompleted:true},
      settings:{language:'ko',bgm:false,sfx:false,prologueSeen:true},
    }));
  });
  page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{
    if(offline) offlineResponses.push({url:response.url(),status:response.status(),fromServiceWorker:response.fromServiceWorker()});
  });
  await home();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:30000});
  const servedManifest=await page.evaluate(async()=>fetch('./classroom-manifest.json').then(r=>r.json()));
  assert.equal(servedManifest.version,manifest.version,'preview serves the selected final output');
  await page.addScriptTag({content:harness.outputFiles[0].text});
  const prepared=await page.evaluate(()=>window.ClassroomHarness.ClassroomReady.prepare());
  assert.equal(prepared.state,'ready',prepared.message);
  assert.equal(prepared.completed,manifest.assets.length);
  assert.equal(prepared.bytes,result.bytes);
  assert.equal((await page.evaluate(()=>window.ClassroomHarness.ClassroomReady.verify())).state,'ready');
  result.checks.push({label:'Final build: all classroom assets prepared and verified',pass:true,prepared});
  console.log(`PASS final preparation: ${prepared.completed}/${prepared.total}`);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  offline=true;
  await context.setOffline(true);
  await home();
  for(const bundle of result.bundles) assert.ok(offlineResponses.some(r=>r.url===new URL(bundle,BASE).href&&r.status===200&&r.fromServiceWorker),`offline final bundle: ${bundle}`);
  await page.locator('.home-menu > .btn-primary').click();
  await ready('.journey-map');
  assert.equal(await page.locator('.map-node').count(),5);
  assert.equal((await page.locator('.map-title').innerText()).trim(),'모험 지도','unlocked regions do not imply all lights are restored');
  await page.screenshot({path:`${OUT}/offline-map.png`});
  result.checks.push({label:'Offline reload serves final JS/CSS from service worker and opens the map',pass:true});
  for(const index of [4,5]) {
    const node=page.locator('.map-node').nth(index-1);
    const mapState=await node.evaluate(button=>{
      const box=button.getBoundingClientRect(),pin=button.querySelector('.node-pin').getBoundingClientRect(),stage=document.getElementById('ui-stage').getBoundingClientRect();
      const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
      return {label:button.getAttribute('aria-label'),hit:hit===button||button.contains(hit),box:box.toJSON(),pin:pin.toJSON(),stage:stage.toJSON()};
    });
    assert.equal(mapState.hit,true,`region ${index} pin can be clicked`);
    assert.ok(mapState.pin.top>=mapState.stage.top&&mapState.pin.bottom<=mapState.stage.bottom,`region ${index} entire pin stays within the stage vertically`);
    await node.click();
    await ready('.intro-panel');
    assert.equal((await page.locator('.intro-panel > .panel-title').innerText()).trim(),`STAGE ${index}`);
    assert.ok(await page.locator('.intro-actions .btn-primary').isEnabled());
    await page.screenshot({path:`${OUT}/offline-intro-${index}.png`});
    await page.locator('.intro-actions > .btn-gray').click();
    await ready('.journey-map');
    result.checks.push({label:`Offline map → region ${index} intro → map through actual controls`,pass:true,mapState});
    console.log(`PASS offline region ${index} map round trip`);
  }
  assert.deepEqual(errors,[]);
  result.offlineResponses=offlineResponses;
  result.runtimeErrors=errors;
  result.completedAt=new Date().toISOString();
  await context.close();
  console.log(`PASS map update: ${result.checks.length} browser checks, ${result.shaValidated} file hashes`);
} catch(error) {
  result.error=String(error); result.runtimeErrors=errors;
  await page?.screenshot({path:`${OUT}/failure.png`}).catch(()=>{});
  throw error;
} finally {
  fs.writeFileSync(`${OUT}/map-update-results.json`,JSON.stringify(result,null,2));
  await browser.close();
}
