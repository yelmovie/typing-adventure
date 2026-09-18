import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.DIALOG_TEST_URL || 'http://127.0.0.1:5180';
const OUT = process.env.DIALOG_TEST_OUT || 'tmp/detail-dialogs';
const KEY = 'typing_adventure_save_v1';
const results = [];
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const viewports = process.env.DIALOG_SMOKE ? [[1024, 768], [915, 412]] : [[1920,1080], [1280,720], [1024,768], [981,542], [915,412]];
function fixture(language) {
  const en = language === 'en', date = new Date(), at = date.toISOString();
  const today = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const target = en ? 'Read the whole sentence, check the spaces, and help your companion find the way home.' : '문장 전체를 읽고 띄어쓰기를 확인해서 길을 잃은 친구가 집으로 돌아갈 수 있게 도와주자.';
  return {
    version:'2', profile:{name:en?'Adventure Tester':'성장하는 모험가',characterId:'brown_boy',petId:'cat',difficulty:'normal',canDo:en?'correct my mistakes':'틀린 글자를 찾아 정확하게 고칠'},
    progress:{unlockedStage:5,clearedStages:['stage_1','stage_2','stage_3','stage_4'],stageStars:{stage_1:3,stage_2:3,stage_3:3,stage_4:3},coins:620,tutorialCompleted:true},
    records:{bestCpm:180,bestAccuracy:98,bestCombo:24,daily:Object.fromEntries(['',':sentence',':long'].map(s=>[today+s,{cpm:160,accuracy:97,score:2400}])),learning:{patterns:{spacing:{mistakes:3,corrections:1,newSuccesses:0,delayedSuccesses:0,lastTarget:target,lastTyped:target.replace(' ',''),lastErrorAt:at,pendingTargets:[target]}},recent:[{at,stageId:'stage_3',source:'game',accuracy:90,cpm:100,correct:6,corrected:1,skipped:0,newSuccesses:1},{at,stageId:'stage_4',source:'game',accuracy:98,cpm:150,correct:3,corrected:1,skipped:0,newSuccesses:2}],seen:[]}},
    collection:{badges:['first_clear','fever_master'],petsUnlocked:['cat','rabbit','dragon','squirrel'],charactersUnlocked:['brown_boy','pink_girl','glasses_boy','blond_explorer'],enemiesSeen:['green_slime']},
    settings:{language,bgm:false,sfx:false,prologueSeen:true},stats:{totalWords:456,totalClears:4,totalPlaySec:650},
  };
}
async function settle(page) {
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all(document.querySelector('.modal')?.getAnimations().map(a=>a.finished.catch(()=>{}))||[]);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  });
}
// Certificate and collection are paged windows (.popup-paged): nothing scrolls, every page must fit.
async function frame(page) {
  const m = await page.locator('.detail-modal').evaluate(panel=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const body=panel.querySelector('.detail-modal-body');
    const close=panel.querySelector('.modal-close'), cr=close.getBoundingClientRect(),hit=document.elementFromPoint(cr.x+cr.width/2,cr.y+cr.height/2);
    const page=panel.querySelector('.popup-page:not([hidden])');
    return {panel:rect(panel),stage:rect(document.getElementById('ui-stage')),body:rect(body),children:[...panel.children].map(rect),horizontalOverflow:body.scrollWidth-body.clientWidth,scrollable:body.scrollHeight>body.clientHeight+1,backdropOverflow:panel.parentElement.scrollHeight-panel.parentElement.clientHeight,closeHit:hit===close||close.contains(hit),closeHeight:cr.height,paged:panel.classList.contains('popup-paged'),page:page?.dataset.page,pageCount:panel.querySelector('.popup-page-count')?.textContent.trim()};
  });
  const contains=(outer,inner)=>inner.left>=outer.left-1&&inner.right<=outer.right+1&&inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;
  assert.ok(contains(m.stage,m.panel),`dialog fits game frame: ${JSON.stringify(m)}`);
  assert.ok(m.children.every(r=>contains(m.panel,r)),`header, content and actions fit dialog: ${JSON.stringify(m)}`);
  assert.ok(m.paged,'detail window uses pages');
  assert.ok(m.horizontalOverflow<=1&&m.backdropOverflow<=1&&!m.scrollable,`paged content fits without scrolling: ${JSON.stringify(m)}`);
  assert.ok(m.closeHit&&m.closeHeight>=47.9,'close remains reachable and 48px high');
  return m;
}
async function visibleInBody(locator) {
  return locator.evaluate(el=>{
    const r=el.getBoundingClientRect(),b=el.closest('.detail-modal-body').getBoundingClientRect();
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return r.top>=b.top-1&&r.bottom<=b.bottom+1&&(hit===el||el.contains(hit));
  });
}
// Page forward/back inside the open detail window until the control's page is shown.
async function reveal(page, locator) {
  for (let step=0; step<40; step++) {
    if (await locator.isVisible()) return;
    const destination=await locator.evaluate(el=>Number(el.closest('.popup-page')?.dataset.page??0));
    const current=await page.locator('.detail-modal .popup-page:not([hidden])').first().getAttribute('data-page');
    assert.ok(destination&&current,'hidden control belongs to a content page');
    const button=page.locator(`.detail-modal ${destination<Number(current)?'.popup-page-prev':'.popup-page-next'}`).filter({visible:true}).first();
    assert.equal(await button.isDisabled(),false,'required page remains reachable');
    await button.click(); await settle(page);
  }
  throw new Error('control page did not become visible');
}
// Visit every page of the open detail window, checking the frame on each one.
async function walkPages(page, label) {
  const frames=[];
  for (let step=0; step<40; step++) {
    frames.push(await frame(page));
    const next=page.locator('.detail-modal .popup-page-next').filter({visible:true});
    if (!await next.count()||await next.first().isDisabled()) return frames;
    await next.first().click(); await settle(page);
  }
  throw new Error(`${label}: pagination must end`);
}
try {
 for(const language of ['ko','en']) for(const [width,height] of viewports) {
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  await context.addInitScript(({key,data})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));},{key:KEY,data:fixture(language)});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
   await page.goto(BASE,{waitUntil:'domcontentloaded'});
   await page.locator('.opening-skip').click({timeout:60000});
   // Home navigates only after the opening closes; wait for the finished transition, not just a quiet frame.
   await page.waitForFunction(()=>document.querySelector('.home-menu')&&!document.querySelector('.opening-player')&&!document.querySelector('#fade.on')&&!document.getElementById('ui-stage').inert&&!document.getElementById('ui-stage').hasAttribute('aria-busy'));
   // The extra home actions live in a small menu window; it closes itself before the chosen dialog opens.
   const more=page.locator('.home-more > summary');
   const openFromMenu=async name=>{ await more.click(); await page.getByRole('button',{name,exact:true}).click(); };
   await openFromMenu(language==='en'?'Certificate':'인증서');
   await page.locator('.cert').waitFor(); await settle(page);
   const certificate=await frame(page);
   assert.ok(Number(certificate.pageCount?.split('/')[1])>=2,'long growth and daily records are split into pages');
   const footer=page.locator('.certificate-modal .modal-actions button');
   assert.ok(await footer.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);}), 'confirm button visible on every page');
   if([1024,915].includes(width))await page.screenshot({path:`${OUT}/${language}-${width}-certificate-top.png`});
   const certificatePages=await walkPages(page,'certificate');
   const chosen=page.locator('.c-cando-chips button').first();
   await reveal(page,chosen); await chosen.click();
   const input=page.locator('.c-cando-input');
   await reveal(page,input);
   assert.ok(await visibleInBody(input),'growth input is shown inside the window on its page');
   assert.ok(await input.inputValue(),'growth chip still fills the input');
   await input.fill(language==='en'?'I can fix my mistakes':'나는 틀린 글자를 고칠 수 있어');
   await input.press('Tab');
   const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
   assert.equal(stored.profile.canDo,language==='en'?'I can fix my mistakes':'나는 틀린 글자를 고칠 수 있어');
   await frame(page);
   if([1024,915].includes(width))await page.screenshot({path:`${OUT}/${language}-${width}-certificate-bottom.png`});
   await footer.click();
   await page.locator('.cert').waitFor({state:'detached'});
   assert.ok(await more.evaluate(el=>document.activeElement===el),'certificate restores focus to the home menu opener');
   await openFromMenu(language==='en'?'Certificate':'인증서'); await page.locator('.cert').waitFor(); await settle(page);
   await page.keyboard.press('Escape'); await page.locator('.cert').waitFor({state:'detached'});
   await openFromMenu(language==='en'?'Collection':'도감'); await page.locator('.collection-modal').waitFor(); await settle(page);
   const tabs=[];
   for(const tab of ['monsters','badges','pets','items','titles']) {
    await page.locator(`[data-tab="${tab}"]`).click(); await settle(page);
    const metrics=await frame(page);
    const cards=await page.locator('.coll-item').evaluateAll(items=>items.map(item=>{
      const r=item.getBoundingClientRect();
      return [...item.children].every(child=>{const c=child.getBoundingClientRect();return c.top>=r.top-1&&c.bottom<=r.bottom+1&&c.left>=r.left-1&&c.right<=r.right+1;});
    }));
    assert.ok(cards.every(Boolean),`${tab}: inner content fits every card`);
    const pages=await walkPages(page,tab);
    const lastDetail=page.locator('.coll-item').last().locator(tab==='pets'?'.coll-equip':'.coll-desc');
    await reveal(page,lastDetail);
    assert.ok(await visibleInBody(lastDetail),`${tab}: last card details reachable by paging`);
    await frame(page);
    tabs.push({tab,cards:cards.length,pages:pages.length,...metrics});
    if(tab==='pets') {
      if([1024,915].includes(width))await page.screenshot({path:`${OUT}/${language}-${width}-collection.png`});
      await page.locator('.coll-equip').last().click();
      assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).profile.petId,KEY),'squirrel');
    }
   }
   await page.locator('.modal-close').click();
   await page.waitForFunction(()=>!document.getElementById('ui-root').inert&&!document.getElementById('ui-stage').inert&&!document.querySelector('#fade.on'));
   assert.deepEqual(errors,[]);
   results.push({language,width,height,pass:true,certificate:{...certificate,pages:certificatePages.length},tabs});
   console.log(`PASS ${language} ${width}x${height}: paged certificate (${certificatePages.length} pages), five collection tabs, saved controls, focus`);
  } catch(error) {
   results.push({language,width,height,pass:false,error:error.message,errors});
   await page.screenshot({path:`${OUT}/failure-${language}-${width}.png`}); throw error;
  }finally{await context.close();}
 }
}finally{fs.writeFileSync(`${OUT}/results.json`,JSON.stringify({base:BASE,checkedAt:new Date().toISOString(),results},null,2));await browser.close();}
