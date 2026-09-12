import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const OUT = 'tmp/tutorial-parts';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'] });
const results=[];
try {
  for (const [language, width, height] of [['ko',1280,720], ['ko',915,412], ['en',1280,720]]) {
    if (process.env.TUTORIAL_LANGUAGE && process.env.TUTORIAL_LANGUAGE !== language) continue;
    const page = await browser.newPage({ viewport:{width,height}, reducedMotion:'reduce' });
    page.setDefaultTimeout(60000);
    await page.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({type:'connected'})); });
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(language=>{
      if(sessionStorage.getItem('seeded'))return;
      localStorage.setItem('typing_adventure_save_v1',JSON.stringify({profile:{name:'Player',characterId:'brown_boy',petId:'cat'},progress:{unlockedStage:5},settings:{language,bgm:false,sfx:false,prologueSeen:true}}));
      sessionStorage.setItem('seeded','1');
    },language);
    const settled=()=>page.waitForFunction(()=>!document.querySelector('#ui-stage[aria-busy="true"]'));
    const gameCall=async (method,...args)=>page.evaluate(async ({method,args})=>{
      const entry=performance.getEntriesByType('resource').find(e=>/\/src\/game\/Game\.ts(?:\?|$)/.test(e.name));
      return (await import(entry.name))[method](...args);
    },{method,args});
    const navigate=async(to,stageId)=>{await gameCall('navigate',to,{stageId});await settled();};
    try {
      await page.goto(process.env.TUTORIAL_TEST_URL||'http://127.0.0.1:5180',{waitUntil:'domcontentloaded'});
      await page.locator('.opening-skip').click();await page.locator('.home-tutorial').waitFor();await settled();
      await page.locator('.home-tutorial').click();await page.locator('.tutorial-part-card').first().waitFor();await settled();
      assert.equal(await page.locator('.tutorial-part-card').count(),4);
      await page.locator('[data-part="vowels"]').click();
      assert.equal(await page.locator('.tutorial-item-progress').textContent(),language==='ko'?'1 / 21':'1 / 5','Full practice stays available');
      assert.ok(await page.locator('.tutorial-keyboard .key.hand-left').count() >= 5);
      assert.ok(await page.locator('.tutorial-keyboard .key.hand-right').count() >= 5);
      assert.equal(await page.locator('.tutorial-keyboard .key[data-key="Space"]').getAttribute('data-hand'),'both');
      const handLegend=await page.locator('.tutorial-keyboard .kbd-hand-legend').innerText();
      assert.ok(handLegend.includes(language==='ko'?'왼손':'Left hand'));
      assert.ok(handLegend.includes(language==='ko'?'오른손':'Right hand'));
      const keyboardFit=await page.locator('.tutorial-keyboard').evaluate(el=>({x:el.scrollWidth-el.clientWidth,y:el.scrollHeight-el.clientHeight}));
      assert.ok(keyboardFit.x<=1&&keyboardFit.y<=1,`Keyboard guide overflows: ${JSON.stringify(keyboardFit)}`);
      await page.locator('.tutorial-header button').focus();await page.locator('.tutorial-header button').press('Enter');await settled();
      for(const [stageId,expected] of (width===1280?[['stage_1',3],['stage_2',3],['stage_3',1],['stage_4',2]]:[['stage_4',2]])){
        await navigate('intro',stageId);
        assert.equal(await page.locator('.intro-battle').count(),0);
        await page.locator('.intro-practice').click();await page.locator('#tutorial-input').waitFor();await settled();
        await page.locator('#tutorial-input').fill('wrong');await page.locator('#tutorial-input').press('Enter');
        assert.equal(await page.locator('.tutorial-next').isVisible(),false);
        await page.locator('.tutorial-header button').click();await settled();
        assert.equal(await page.locator('.intro-battle').count(),0,'Leaving incomplete preparation does not unlock battle');
        await navigate('battle',stageId);await page.locator('#tutorial-input').waitFor();
        for(let index=0;index<expected;index++){
          const input=page.locator('#tutorial-input');const target=await page.locator('.tutorial-target').getAttribute('data-target');
          if(index===0){await input.fill(target);await input.dispatchEvent('compositionstart');await input.press('Enter');assert.equal(await page.locator('.tutorial-next').isVisible(),false,'IME commit cannot prematurely submit');await input.dispatchEvent('compositionend');}
          await input.fill(target);await input.press('Enter');
        }
        assert.ok(await page.locator('.tutorial-next').isVisible());
        await page.screenshot({path:`${OUT}/${language}-${width}-${stageId}-complete.png`});
        await page.locator('.tutorial-next').click();await settled();
        assert.equal(await gameCall('currentScreen'),'battle','Finishing warm-up goes straight into battle');
        await navigate('intro',stageId);assert.ok(await page.locator('.intro-battle').isEnabled(),'Retry never repeats preparation');
        results.push({language,width,stageId,targets:expected,pass:true});
      }
      if(width===1280){await navigate('intro','stage_5');assert.ok(await page.locator('.intro-battle').isEnabled(),'Boss reuses the four learned parts');}
      await page.reload({waitUntil:'domcontentloaded'});await page.locator('.opening-skip').click();await page.locator('.home-tutorial').waitFor();await settled();
      await navigate('intro','stage_4');assert.ok(await page.locator('.intro-battle').isEnabled(),'Preparation survives refresh');
      await page.evaluate(async()=>{const {SaveSystem}=await import('/src/game/systems/SaveSystem.ts');const old=SaveSystem.get().settings.language;SaveSystem.setSettings({language:old==='en'?'ko':'en'});const {StagePractice}=await import('/src/game/systems/StagePractice.ts');if(StagePractice.ready('stage_4',old==='en'?'ko':'en'))throw Error('Language preparation leaked');SaveSystem.setSettings({language:old});if(!StagePractice.ready('stage_4',old))throw Error('Language archive lost preparation');});
      assert.deepEqual(errors,[]);console.log('PASS warm-up',language,width,'IME, incomplete guard, direct battle, retry, refresh and language archive');
    }catch(error){await page.screenshot({path:`${OUT}/${language}-${width}-failure.png`});throw error;}finally{await page.close();}
  }
}finally{await browser.close();fs.writeFileSync(`${OUT}/results.json`,JSON.stringify({results},null,2));}
