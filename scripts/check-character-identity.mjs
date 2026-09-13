import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Character selection is exercised through real buttons in a disposable profile.
// Battle/result fixtures only skip unrelated typing practice and score awards.
const BASE=process.env.IDENTITY_URL||'http://127.0.0.1:5180';
const OUT=process.env.IDENTITY_OUT||'tmp/character-identity';
const FILTER=process.env.IDENTITY_FILTER||'';
const KEY='typing_adventure_save_v1';
const characters=[['brown_boy','하늘','Haneul'],['pink_girl','보라','Bora'],['glasses_boy','지호','Jiho'],['blond_explorer','루카','Luca']];
const browser=await chromium.launch({channel:'chrome'}),results=[];
fs.mkdirSync(OUT,{recursive:true});

function seed(custom=false){
 const snapshot=(language)=>({profile:{name:custom?'도전':language==='ko'?'지호':'Luka',characterId:language==='ko'?'pink_girl':'glasses_boy',petId:'rabbit',difficulty:'normal',canDo:'고쳐서 완성'},progress:{unlockedStage:4,clearedStages:['stage_1','stage_2','stage_3'],stageStars:{stage_1:3,stage_2:3,stage_3:2},coins:543,tutorialCompleted:true,fails:{},assist:{}},records:{bestCpm:178,bestAccuracy:98.5,bestCombo:25,bestScoreByStage:{stage_1:5600},ghosts:{},daily:{},learning:{patterns:{},recent:[],seen:['saved word']}},collection:{badges:['first_clear'],wordsSeen:['별빛'],petsUnlocked:['cat','rabbit'],charactersUnlocked:characters.map(c=>c[0]),enemiesSeen:['green_slime']},stats:{totalClears:3,totalWords:105,totalPlaySec:250}});
 return {version:'2',...snapshot('ko'),settings:{language:'ko',bgm:false,sfx:false,screenShake:false,showKeyboardGuide:false,prologueSeen:true},languageArchives:{en:snapshot('en')}};
}
async function ready(page,selector){await page.locator(selector).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#fade.on')&&!document.querySelector('#ui-stage[aria-busy]'));await page.evaluate(()=>document.fonts.ready);}
async function moduleCall(page,pathname,fn,args){return page.evaluate(async({pathname,fn,args})=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(url=>new URL(url).pathname===pathname)||pathname;const m=await import(url);if(fn==='save')return structuredClone(m.SaveSystem.get());if(fn==='navigate')return m.navigate(...args);if(fn==='battle'){const practice=await import('/src/game/systems/StagePractice.ts');const locale=await import('/src/game/i18n/Locale.ts');practice.StagePractice.complete('stage_1',locale.getLanguage(),false);return m.navigate('battle',{stageId:'stage_1'});}if(fn==='modal')return m.collectionModal();}, {pathname,fn,args});}
const save=page=>moduleCall(page,'/src/game/systems/SaveSystem.ts','save');
const go=(page,to,data={})=>moduleCall(page,'/src/game/Game.ts','navigate',[to,data]);
async function home(page){await go(page,'home');await ready(page,'.home-menu');}
async function stored(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);}
async function setLanguage(page,language){await page.locator(`.language-choice[lang="${language}"]`).click();await ready(page,'.home-menu');await page.waitForFunction(language=>document.documentElement.lang===language,language);}
async function expandHome(page){if(!await page.locator('.home-more').evaluate(e=>e.open))await page.locator('.home-more summary').click();}
async function setupPick(page,id){
 await expandHome(page);await page.locator('.home-profile').click();await ready(page,'.setup-panel');
 await page.locator('.setup-step').nth(0).click();await page.locator(`.setup-grid [data-id="${id}"]`).click();
 assert.equal(await page.locator(`.setup-grid [data-id="${id}"]`).getAttribute('aria-pressed'),'true');
 for(let i=0;i<3;i++)await page.locator('.setup-footer .btn-primary').click();
 await ready(page,'.journey-map');
}
function recordsUnchanged(actual,before){for(const k of ['progress','records','collection','stats'])assert.deepEqual(actual[k],before[k],`character selection preserves ${k}`);assert.equal(actual.profile.canDo,before.profile.canDo);assert.equal(actual.version,before.version);}
async function inspectHome(page,id,display){
 await ready(page,'.home-menu');assert.ok((await page.locator('.pc-name').innerText()).startsWith(display+' · Lv.'),'home name: '+await page.locator('.pc-name').innerText());
 assert.match(await page.locator('.player-card > img').getAttribute('src'),new RegExp(`char_${id}\\.webp$`));
 assert.ok((await page.locator('.home-tip').innerText()).startsWith(display));
}
async function inspectBattleAndResult(page,id,display,charLabel){
 await go(page,'intro',{stageId:'stage_1'});await ready(page,'.intro-panel');
 await moduleCall(page,'/src/game/Game.ts','battle');await ready(page,'.bb-input');
 assert.equal(await page.locator('.pl-name').innerText(),display,'HUD name follows identity');
 assert.match(await page.locator('.pl-portrait').getAttribute('src'),new RegExp(`char_${id}\\.webp$`));
 const actor=await page.evaluate(()=>{const scene=window.__game.scene.getScenes(true).find(s=>s.scene.key==='Wave');return scene?.player?.sheet;});
 assert.equal(actor,`char_${id}`,'the real battle actor uses the chosen character');
 const result={stageId:'stage_1',cleared:false,failReason:'time',score:0,accuracy:0,cpm:0,maxCombo:0,elapsedSec:0,wordsDone:0,wordsTotal:20,perfectCount:0,coins:0,attemptedCount:0,correctedCount:0,skippedCount:0,stars:0,newBadges:[],isNewCpm:false,isNewAccuracy:false,isNewCombo:false,isNewScore:false,newUnlocks:[],mistakes:[],wordsSeen:[]};
 await go(page,'result',{result});await ready(page,'.result-panel');
 assert.ok((await page.locator('.result-cast-label strong').innerText()).startsWith(charLabel+' &'),'result actor label follows character, separate from personal nickname');
}
async function inspectCertificate(page,display){
 await expandHome(page);await page.locator('.home-extra-grid button').filter({has:page.locator('img[src*="icon_trophy"]')}).click();
 await ready(page,'.certificate-modal');const english=await page.locator('html').getAttribute('lang')==='en';assert.equal(await page.locator('.c-name > span').innerText(),english?`Adventurer ${display}`:`${display} 모험가`,'certificate preserves displayed identity');await page.locator('.certificate-modal .modal-close').click();
}
async function run(label,data,fn){
 if(FILTER&&!label.includes(FILTER))return;
 const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.routeWebSocket('**',socket=>{socket.onMessage(()=>{});socket.send(JSON.stringify({type:'connected'}));});
 if(data)await context.addInitScript(({KEY,data})=>{if(!sessionStorage.getItem('identity-seeded')){localStorage.setItem(KEY,JSON.stringify(data));sessionStorage.setItem('identity-seeded','1');}},{KEY,data});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.locator('.opening-skip').click();await page.locator('.opening-player').waitFor({state:'detached'});await ready(page,'.home-menu');
  const details=await fn(page);assert.deepEqual(errors,[],'no browser runtime exceptions');results.push({label,pass:true,details});console.log('PASS '+label);
 }catch(error){await page.screenshot({path:`${OUT}/failure-${label}.png`}).catch(()=>{});results.push({label,pass:false,error:String(error),errors});console.error('FAIL '+label+' '+error.message);}
 finally{await context.close();fs.writeFileSync(`${OUT}/results.json`,JSON.stringify(results,null,2));}
}
try{
 for(const custom of [false,true])await run(custom?'custom-nickname':'automatic-name',seed(custom),async page=>{
  const checkpoints=[];assert.equal((await save(page)).profile.name,custom?'도전':'보라','old Jiho/Bora mismatch recovers on load');
  await inspectHome(page,'pink_girl',custom?'도전':'보라');
  for(const language of ['ko','en']){
   if(language==='en')await setLanguage(page,'en');
   for(const [id,ko,en] of characters){
    const before=await save(page),display=custom?'도전':language==='en'?en:ko;
    await setupPick(page,id);const selected=await save(page);recordsUnchanged(selected,before);
    assert.equal(selected.profile.characterId,id);assert.equal(selected.profile.name,custom?'도전':ko,'saved default name matches selection');
    assert.equal((await stored(page)).profile.name,selected.profile.name,'selection is persisted');
    await home(page);await inspectHome(page,id,display);await inspectCertificate(page,display);
    await inspectBattleAndResult(page,id,display,language==='en'?en:ko);
    recordsUnchanged(await save(page),before);await home(page);checkpoints.push({language,id,display});console.log(`  ${custom?'custom':'auto'} ${language} ${id}: Setup / Home / HUD / Result / Certificate matched`);
   }
  }
  await setLanguage(page,'ko');await inspectHome(page,'blond_explorer',custom?'도전':'루카');
  await setLanguage(page,'en');await inspectHome(page,'blond_explorer',custom?'도전':'Luca');
  // Equip a different character through the collection's paged cards.
  await moduleCall(page,'/src/game/ui/ModalController.ts','modal');await ready(page,'.collection-modal');
  await page.locator('.coll-tabs [data-tab="pets"]').click();
  const equip=page.locator('[data-equipment="pink_girl"] .coll-equip');
  for(let i=0;!await equip.isVisible()&&i<8;i++)await page.locator('.collection-modal .popup-page-next').click();
  await equip.click();assert.equal((await save(page)).profile.name,custom?'도전':'보라');await page.locator('.collection-modal .modal-close').click();
  await inspectHome(page,'pink_girl',custom?'도전':'Bora');
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('.opening-skip').click();await page.locator('.opening-player').waitFor({state:'detached'});await inspectHome(page,'pink_girl',custom?'도전':'Bora');
  await page.screenshot({path:`${OUT}/${custom?'custom':'automatic'}-en-home.png`});return checkpoints;
 });
 for(const language of ['ko','en'])await run(`new-adventure-${language}`,null,async page=>{
  if(language==='en')await setLanguage(page,'en');assert.equal((await save(page)).profile.name,'','changing language must not create an adventure');
  await page.locator('.home-menu > .btn-primary').click();await ready(page,'.setup-panel');
  assert.equal(await page.locator('.setup-grid [data-id="blond_explorer"]').getAttribute('aria-disabled'),'true','Luca remains locked in a new adventure');
  for(const id of ['glasses_boy','brown_boy','pink_girl'])await page.locator(`.setup-grid [data-id="${id}"]`).click();
  for(let i=0;i<3;i++)await page.locator('.setup-footer .btn-primary').click();
  await ready(page,'.story-modal');assert.equal((await save(page)).profile.name,'보라');assert.equal((await stored(page)).profile.characterId,'pink_girl');
  await page.locator('.story-actions button').first().click();await ready(page,'.tutorial-menu');
  await page.locator('.tutorial-leave').click();await ready(page,'.journey-map');await page.locator('.worldmap .topbar-common > button').first().click();await inspectHome(page,'pink_girl',language==='en'?'Bora':'보라');
  return {language,name:(await save(page)).profile.name};
 });
}finally{await browser.close();fs.writeFileSync(`${OUT}/results.json`,JSON.stringify(results,null,2));}
console.log(`${results.filter(r=>r.pass).length}/${results.length} PASS`);if(results.some(r=>!r.pass))process.exitCode=1;
