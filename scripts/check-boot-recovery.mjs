import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE=process.env.BOOT_TEST_URL||'http://127.0.0.1:5180';
const OUT=process.env.BOOT_TEST_OUT||'tmp/boot-recovery';
fs.mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),results=[];
try {
 for(const language of ['ko','en']) {
  const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(language=>{const key='typing_adventure_save_v1';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:'2',profile:{name:'Recovery',characterId:'brown_boy',petId:'cat'},progress:{coins:123,clearedStages:['stage_1'],unlockedStage:2},settings:{language,bgm:false,sfx:false,prologueSeen:true}}));},language);
  let fail=true;
  await context.route('**/assets/backgrounds/bg_main_gate.webp',route=>fail?route.fulfill({status:503,contentType:'text/plain',body:'Test fixture: asset temporarily unavailable'}):route.continue());
  const page=await context.newPage();
  try {
   await page.goto(BASE,{waitUntil:'domcontentloaded'});
   await page.locator('.opening-skip').click({timeout:60000});
   const retry=page.getByRole('button',{name:language==='en'?'Try again':'다시 받기',exact:true});
   await retry.waitFor({timeout:60000});
   const message=await page.locator('#loading-text').innerText();
   assert.match(message,language==='en'?/local server/:/로컬 서버/);
   assert.doesNotMatch(message,/인터넷을 확인|check (your |the )internet/i);
   await page.screenshot({path:`${OUT}/${language}-failure-message.png`});
   fail=false;
   await retry.click();
   await page.locator('.opening-skip').click({timeout:60000});
   await page.waitForFunction(()=>!document.querySelector('.opening-player')&&!document.querySelector('#fade.on')&&!document.getElementById('ui-stage').inert);
   await page.locator('.home-menu').waitFor({state:'visible'});
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('typing_adventure_save_v1')));
   assert.equal(saved.progress.coins,123);assert.equal(saved.profile.name,'Recovery');assert.ok(saved.progress.clearedStages.includes('stage_1'));
   results.push({language,pass:true,message,retryRestoresHome:true,savePreserved:true});
   console.log(`PASS ${language}: missing asset → accurate local preview message → retry → home with save preserved`);
  }catch(error){results.push({language,pass:false,error:error.message});throw error;}
  finally{await context.close();}
 }
}finally{fs.writeFileSync(`${OUT}/results.json`,JSON.stringify({base:BASE,checkedAt:new Date().toISOString(),results},null,2));await browser.close();}
