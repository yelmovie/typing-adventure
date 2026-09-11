import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const BASE=process.env.OFFLINE_TEST_URL||'http://127.0.0.1:4177', OUT=process.env.OFFLINE_TEST_OUT||'tmp/offline-ready-check', KEY='typing_adventure_save_v1';
const manifest=JSON.parse(fs.readFileSync((process.env.OFFLINE_TEST_DIST||'tmp/upgrade-infra-build-20260912')+'/classroom-manifest.json'));
const result={startedAt:new Date().toISOString(),manifest:manifest.version,checks:[],requests:[],errors:[]};
fs.mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'allow'});let page;
await context.addInitScript(KEY=>{if(!localStorage.getItem(KEY))localStorage.setItem(KEY,JSON.stringify({version:'2',profile:{name:'Audit fixture',characterId:'glasses_boy',petId:'rabbit',difficulty:'normal'},progress:{unlockedStage:5,clearedStages:['stage_1'],stageStars:{stage_1:3},coins:123,tutorialCompleted:true},settings:{language:'ko',bgm:false,sfx:false,prologueSeen:true,showKeyboardGuide:false}}));},KEY);
let offline=false; const check=(name,evidence)=>{result.checks.push({name,pass:true,evidence});console.log('PASS '+name);};
try {
page=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>result.errors.push(e.message));page.on('request',r=>result.requests.push({url:r.url(),method:r.method(),offline}));
const ready=async selector=>{await page.locator(selector).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#fade.on')&&!document.querySelector('#ui-stage[aria-busy]'));};
const home=async()=>{await page.goto(BASE,{waitUntil:'commit'});await page.locator('.opening-skip').click();await page.locator('.opening-player').waitFor({state:'detached'});await ready('.home-menu');};
await home();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
result.loadedScripts=await page.locator('script[src]').evaluateAll(es=>es.map(e=>e.src));
assert.ok(manifest.assets.filter(a=>/^\.\/assets\/index-.*\.js$/.test(a.url)).every(a=>result.loadedScripts.some(x=>x.endsWith(a.url.slice(2)))));check('fresh browser executes current production bundle',result.loadedScripts);
await page.locator('.screen.home button[title="설정"]').click();await page.locator('.popup-page-next').click();await page.getByRole('button',{name:'수업 준비 · 오프라인',exact:true}).click();
await page.locator('.modal-actions .btn-primary').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.modal-actions .btn-primary').disabled);
const start=Date.now();await page.locator('.modal-actions .btn-primary').click();await page.waitForFunction(()=>document.querySelector('.classroom-status [role="status"]')?.textContent.startsWith('수업 준비 완료!'),null,{timeout:180000});
result.prepared=await page.evaluate(()=>({message:document.querySelector('.classroom-status [role="status"]').textContent,size:document.querySelector('.classroom-size').textContent,progress:document.querySelector('.classroom-progress').value}));result.prepareMs=Date.now()-start;assert.equal(result.prepared.progress,100);
const verified=await page.evaluate(async m=>{const c=await caches.open(m.cacheName);let valid=0;for(const a of m.assets){const r=await c.match(new URL(a.url,document.baseURI));if(r?.ok&&r.headers.get('x-classroom-revision')===a.revision)valid++;}return valid;},manifest);assert.equal(verified,manifest.assets.length);check('real settings download prepares every revision-verified file',{...result.prepared,prepareMs:result.prepareMs,verified});
await page.screenshot({path:OUT+'/classroom-ready.png'});
await page.evaluate(async m=>{const c=await caches.open(m.cacheName);await c.delete(new URL('./assets/backgrounds/bg_train.webp',document.baseURI));},manifest);
await page.getByRole('button',{name:'준비 상태 확인',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.classroom-status [role="status"]')?.textContent.startsWith('1개 자료'));
await page.locator('.modal-actions .btn-primary').click();await page.waitForFunction(()=>document.querySelector('.classroom-status [role="status"]')?.textContent.startsWith('수업 준비 완료!'));check('missing cache entry is detected and resumed');
await page.locator('#modal-root .modal-close').click();const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});offline=true;await context.setOffline(true);await home();result.offlineDocument=await page.evaluate(()=>({readyState:document.readyState,controller:navigator.serviceWorker.controller?.scriptURL,scripts:[...document.querySelectorAll('script[src]')].map(s=>s.src),homeVisible:!!document.querySelector('.home-menu')}));
const cached=await page.evaluate(async m=>{let next=0,valid=0,totalBytes=0,failed=[];await Promise.all(Array.from({length:3},async()=>{while(next<m.assets.length){const a=m.assets[next++];try{const r=await fetch(a.url);const b=await r.arrayBuffer();if(r.ok&&b.byteLength===a.bytes){valid++;totalBytes+=b.byteLength;}else failed.push(a.url);}catch{failed.push(a.url);}}}));return {valid,totalBytes,failed};},manifest);result.cached=cached;assert.deepEqual(cached.failed,[]);assert.equal(cached.valid,manifest.assets.length);assert.equal(cached.totalBytes,manifest.assets.reduce((sum,a)=>sum+a.bytes,0));check('every delivered file including both font licenses works offline',cached);
result.externalRequests=result.requests.filter(r=>new URL(r.url).origin!==new URL(BASE).origin);assert.deepEqual(result.externalRequests,[]);assert.ok(result.requests.every(r=>r.method==='GET'));check('observed game traffic remains same-origin static GET requests',{requests:result.requests.length});assert.deepEqual(result.errors,[]);
} catch(e){result.failure=String(e);console.log('FAIL '+String(e));await page?.screenshot({path:OUT+'/offline-failure.png'}).catch(()=>{});} finally {result.finishedAt=new Date().toISOString();fs.writeFileSync(OUT+'/offline.json',JSON.stringify(result,null,2));await context.close();await browser.close();}
if(result.failure)process.exitCode=1;




