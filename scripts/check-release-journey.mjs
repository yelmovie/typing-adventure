import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Production-only DOM controls and typing. All save data belongs to isolated test contexts.
const BASE=process.env.RELEASE_URL||'http://127.0.0.1:4180';
const OUT=process.env.RELEASE_OUT||'tmp/release-journey-v040';
const offline=process.env.RELEASE_OFFLINE==='1';
const languages=(process.env.RELEASE_LANGUAGE||'ko,en').split(',');
const KEY='typing_adventure_save_v1';fs.mkdirSync(OUT,{recursive:true});
const results=[];const browser=await chromium.launch({channel:'chrome'});
try {
 for(const language of languages){
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'allow',reducedMotion:'reduce'});
  await context.addInitScript(({language,KEY})=>{if(sessionStorage.getItem('release-seed'))return;localStorage.setItem(KEY,JSON.stringify({version:'2',profile:{name:language==='en'?'Bora':'보라',characterId:'pink_girl',petId:'rabbit',difficulty:'normal'},progress:{unlockedStage:1},settings:{language,bgm:false,sfx:false,prologueSeen:true}}));sessionStorage.setItem('release-seed','1');},{language,KEY});
  const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=async selector=>{await page.locator(selector).waitFor({state:'visible'});await page.waitForFunction(selector=>!document.querySelector('#fade.on,#ui-stage[aria-busy]')&&!document.querySelector(selector)?.closest('[inert]'),selector);};
  const save=()=>page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)),KEY);
  try {
   await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.locator('.opening-skip').click();await ready('.home-menu');
   if(offline){
    await page.evaluate(async()=>{
     await navigator.serviceWorker.ready;
     const manifest=await fetch('./classroom-manifest.json').then(r=>r.json());
     const cache=await caches.open(manifest.cacheName);let index=0;
     await Promise.all(Array.from({length:3},async()=>{while(index<manifest.assets.length){const item=manifest.assets[index++];const url=new URL(item.url,document.baseURI);const download=new URL(url);download.searchParams.set('classroom-download',item.revision);const r=await fetch(download,{cache:'no-cache'});if(!r.ok)throw Error(item.url);const bytes=await r.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==item.revision)throw Error('Hash '+item.url);const headers=new Headers(r.headers);headers.delete('content-encoding');headers.delete('vary');headers.set('content-length',String(bytes.byteLength));headers.set('x-classroom-revision',item.revision);await cache.put(url,new Response(bytes,{status:200,headers}));}}));
    });
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);
    await page.reload({waitUntil:'commit'});await page.locator('.opening-skip').click();await ready('.home-menu');
   }
   await page.locator('.home-menu > .btn-primary').click();await ready('.journey-map');
   const stages=[];
   for(let index=0;index<5;index++){
    await page.locator('.map-node').nth(index).click();await ready('.intro-panel');
    let warmup=0;
    if(await page.locator('.intro-practice').count()){
     await page.locator('.intro-practice').click();await ready('#tutorial-input');
     while(!await page.locator('.tutorial-next').isVisible()){
      await page.locator('#tutorial-input').fill(await page.locator('.tutorial-target').getAttribute('data-target'));
      await page.locator('#tutorial-input').press('Enter');warmup++;assert.ok(warmup<=9);
     }
     await page.locator('.tutorial-next').click();
    }else await page.locator('.intro-battle').click();
    await ready('.bb-input');let inputs=0;
    while(!await page.locator('.result-panel').count()){
     // 편지(stage_3) 「다음 조각 고르기」: production 에는 __battle 이 없어 1·2·3 을 차례로 눌러 정답 조각을 찾는다(오답은 읽기 실수로만 남는다).
     if(index===2){for(let n=0;n<24&&!await page.locator('.result-panel').count()&&await page.locator('.bb-input').isDisabled();n++){await page.keyboard.press(String(n%3+1));await page.waitForTimeout(250);}}
     await page.waitForFunction(()=>document.querySelector('.result-panel')||document.querySelector('.bb-input')&&!document.querySelector('.bb-input').disabled&&document.querySelector('.bb-target')?.textContent?.trim());
     if(await page.locator('.result-panel').count())break;
     await page.waitForTimeout(index===1?1000:180);
     if(await page.locator('.result-panel').count())break;
     const target=await page.locator('.bb-target').innerText();
     assert.ok(target.trim());assert.equal(language==='en'?/[가-힣]/.test(target):/[A-Za-z]/.test(target),false);
     try { await page.locator('.bb-input').fill(target,{timeout:5000}); } catch(error) { if(await page.locator('.result-panel').isVisible()) break; throw error; }
     inputs++;assert.ok(inputs<220,'bounded stage completion');
     await page.waitForFunction(previous=>document.querySelector('.result-panel')||!document.querySelector('.bb-input')?.value||document.querySelector('.bb-target')?.textContent!==previous,target);
    }
    await ready('.result-panel');const data=await save();const stageId=`stage_${index+1}`;
    assert.ok(data.progress.clearedStages.includes(stageId),`${stageId} genuinely cleared`);
    assert.ok(data.progress.stageStars[stageId]>=1);assert.ok(data.records.learning.recent.at(-1).correct>0);
    assert.equal(await page.evaluate(()=>typeof window.__game),'undefined','No production debug game hook');
    const overflow=await page.locator('.result-panel').evaluate(el=>({x:el.scrollWidth-el.clientWidth,y:el.scrollHeight-el.clientHeight}));
    assert.ok(overflow.x<=1&&overflow.y<=1,JSON.stringify(overflow));
    stages.push({stageId,warmup,inputs,correct:data.records.learning.recent.at(-1).correct,stars:data.progress.stageStars[stageId]});
    await page.screenshot({path:`${OUT}/${language}-${stageId}.png`});console.log('PASS stage',language,stageId,inputs,'real inputs',offline?'offline':'online');
    if(index<4){await page.locator('.result-actions button').last().click();await ready('.journey-map');}
   }
   const before=await save();assert.equal(before.progress.clearedStages.length,5);
   await page.locator('.result-actions .result-main').click();await ready('.finale-player');
   assert.ok((await page.locator('.finale-player').innerText()).includes(language==='en'?'Bora':'보라'));
   await page.locator('.finale-actions .btn-sky').click();await page.waitForFunction(()=>{const video=document.querySelector('.finale-video');return video?.videoWidth>0&&video.currentTime>0.2&&!video.paused;});await ready('.certificate-modal');
   await page.keyboard.press('Escape');
   await page.reload({waitUntil:'commit'});await page.locator('.opening-skip').click();await ready('.home-menu');
   assert.deepEqual((await save()).progress,before.progress,'Refresh preserves progress');
   assert.deepEqual(errors,[]);results.push({language,offline,pass:true,stages});
  }catch(error){await page.screenshot({path:`${OUT}/${language}-failure.png`,timeout:15000}).catch(()=>{});results.push({language,offline,pass:false,error:String(error),errors});throw error;}
  finally{await context.close();}
 }
}finally{await browser.close();fs.writeFileSync(`${OUT}/results.json`,JSON.stringify({base:BASE,offline,method:'Isolated production UI, initial profile fixture only, real inputs across all five stages. Offline setup checks every manifest hash and populates the same cache before switching network off.',results},null,2));}


