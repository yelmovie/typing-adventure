import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Real UI input in new browser contexts; never connect to a user's saved browser.
// Run only after the journey, remix, scoring and screen changes have been integrated.
const BASE = process.env.JOURNEY_TEST_URL || 'http://127.0.0.1:5180';
const OUT = 'tmp/journey-flow';
const FILTER = process.env.JOURNEY_CASE_FILTER || '';
const STORAGE_KEY = 'typing_adventure_save_v1';
fs.mkdirSync(OUT, { recursive: true });
const cases = [
  { language:'ko', stage:'stage_3', count:9, relic:'황금문의 열쇠', width:1280, height:800 },
  { language:'ko', stage:'stage_4', count:5, relic:'정차 신호', width:1024, height:768 },
  { language:'en', stage:'stage_3', count:9, relic:'Golden Key', width:1280, height:800 },
  { language:'en', stage:'stage_4', count:5, relic:'Stop Signal', width:1024, height:768 },
].filter(test => !FILTER || `${test.language}-${test.stage}`.includes(FILTER));
assert.ok(cases.length, 'JOURNEY_CASE_FILTER must select a case');
// Unlock state is derived from actual clears (SaveValidation), so the regions before the target are cleared; the target itself is new.
const priorStages = stage => Array.from({length:Number(stage.slice(-1))-1},(_,i)=>`stage_${i+1}`);
const seed = (language, stage) => ({
  version:'2',
  profile:{name:language==='en'?'Haneul':'하늘',characterId:'brown_boy',petId:'cat',difficulty:'normal'},
  // S1 cleared exposes the real Home Adventure Plus entry. The target region has never been cleared.
  progress:{unlockedStage:Number(stage.slice(-1)),clearedStages:priorStages(stage),stageStars:Object.fromEntries(priorStages(stage).map(id=>[id,1])),coins:0,tutorialCompleted:true},
  settings:{language,bgm:false,sfx:false,prologueSeen:true,showKeyboardGuide:false},
});
const results = [];
const writeResults = () => fs.writeFileSync(`${OUT}/${FILTER?'filtered-results':'results'}.json`, JSON.stringify({
  checkedAt:new Date().toISOString(),base:BASE,filter:FILTER||null,
  method:'Isolated Chrome contexts with HMR blocked. Real Home/route/intro/result/map controls and DOM input. Two complete story sets per case. Save reads are observational; only initial fixtures are injected. Not physical OS IME, student learning, or performance measurement.',
  results,
},null,2));
const browser = await chromium.launch({channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});

async function screenReady(page, selector) {
  await page.locator(selector).waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(() => !document.querySelector('#ui-stage[aria-busy]') && !document.querySelector('#fade.on') && !document.querySelector('#ui-root[inert]'), undefined, {timeout:60000});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function homeReady(page, firstVisit = false) {
  await page.locator('.home-menu').waitFor({state:'visible',timeout:60000});
  if (firstVisit) {
    await page.locator('.opening-skip').waitFor({state:'visible',timeout:60000});
    await page.locator('.opening-skip').click();
    await page.locator('.opening-player').waitFor({state:'detached'});
  }
  await screenReady(page,'.home-menu');
}
const readSave = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const snapshot = page => page.evaluate(() => window.__battle.snapshot());

async function routeIntoBattle(page, test) {
  await homeReady(page);
  await page.locator('.home-replay').click();
  await page.locator('.replay-routes').waitFor({state:'visible'});
  assert.equal(await page.locator('.replay-route').count(),5,'all five regions are available as route cards');
  const route = page.locator('.replay-route').nth(Number(test.stage.slice(-1))-1);
  assert.equal(await route.isDisabled(),false,'unlocked target route is actionable');
  const card = await route.innerText();
  await route.click();
  await screenReady(page,'.intro-panel');
  assert.equal((await page.locator('.intro-panel > .panel-title').innerText()).trim(),`STAGE ${test.stage.slice(-1)}`);
  assert.ok((await page.locator('.journey-relic').innerText()).includes(test.relic),'intro names the region reward');
  const mission = await page.locator('.intro-mission').innerText();
  assert.ok(mission.trim(),'route passes through a visible mission intro');
  await page.locator('.intro-actions .btn-primary').click();
  await page.waitForFunction(stage => {
    const input=document.querySelector('.bb-input');
    return window.__battle?.stage.id===stage && input && !input.disabled && window.__battle.snapshot().target;
  },test.stage,{timeout:60000});
  return {card,mission};
}

async function completeStory(page, test) {
  const targets = [];
  for (let index=0;index<test.count;index++) {
    await page.waitForFunction(expected => {
      const input=document.querySelector('.bb-input'), s=window.__battle?.snapshot();
      return input && !input.disabled && s?.wordsDone===expected && s.target;
    },index,{timeout:30000});
    const before = await snapshot(page);
    const target = before.target;
    assert.equal(before.targetTotal,test.count,'complete connected story has the promised size');
    assert.equal(target.stage,test.stage);
    assert.equal(target.type,'sentence');
    assert.ok(target.id.startsWith(`remix-${test.language}-${test.stage}-`),'real battle uses a remix story');
    assert.ok(target.tags.includes(`순서${index+1}`),'runtime order tag matches the presented sentence');
    assert.ok(target.tags.includes(test.stage==='stage_3'?'편지':'전보'));
    assert.equal((await page.locator('.bb-target').innerText()).normalize('NFC'),target.text);
    assert.equal(test.language==='en'?/[가-힣]/.test(target.text):/[A-Za-z]/.test(target.text),false,'typing corpus matches selected language');
    targets.push({id:target.id,text:target.text,tags:target.tags});
    // InputAdapter receives the actual DOM input event, then its normal exact-match submit.
    await page.locator('.bb-input').fill(target.text);
    await page.waitForFunction(done => window.__battle?.snapshot().wordsDone>=done, index+1, {timeout:15000});
  }
  const final = await snapshot(page);
  assert.equal(final.wordsDone,test.count);
  assert.equal(final.accuracy,100);
  assert.ok(final.playerHp>0);
  if(test.stage==='stage_3') assert.equal(final.letter.locks,3);
  else { assert.equal(final.telegram.brake,5); assert.equal(final.telegram.stopped,true); }
  const options = await page.evaluate(async ({language,stage}) => {
    const {REMIX_STORIES}=await import('/src/game/data/remixStories.ts');
    return REMIX_STORIES[language][stage];
  },test);
  const selectedStory=options.findIndex(story=>JSON.stringify(story)===JSON.stringify(targets.map(t=>t.text)));
  assert.ok(selectedStory>=0,'all displayed targets form one complete authored story in its original order');
  assert.equal(new Set(targets.map(t=>t.tags.find(tag=>/^이야기\d+$/.test(tag)))).size,1,'one story family throughout');
  await screenReady(page,'.result-panel');
  assert.ok((await page.locator('.result-sub').innerText()).includes(test.language==='en'?'Adventure Plus':'모험 플러스'),'remix reaches the result screen');
  assert.ok((await page.locator('.journey-result-story').innerText()).includes(test.relic),'result shows the recovered relic');
  const summary=await page.locator('.journey-result-highlights').innerText();
  assert.ok(summary.includes('100%'));
  assert.ok(summary.includes(String(test.count)));
  const saved=await readSave(page), session=saved.records.learning.recent.at(-1);
  assert.equal(session.stageId,test.stage);
  assert.equal(session.correct,test.count);
  assert.equal(session.skipped,0);
  assert.equal(session.corrected,0);
  assert.equal(session.accuracy,100);
  assert.ok(saved.progress.clearedStages.includes(test.stage));
  assert.ok(saved.progress.stageStars[test.stage]>=1);
  return {targets,selectedStory,session,final,replay:structuredClone(saved.records.replay),summary};
}

async function assertRestoredMap(page,test) {
  await screenReady(page,'.journey-map');
  const relic=page.locator('.journey-light').nth(Number(test.stage.slice(-1))-1);
  assert.ok((await relic.getAttribute('class')).split(' ').includes('restored'));
  const label=await relic.getAttribute('aria-label');
  assert.ok(label.includes(test.relic));
  assert.ok(label.includes(test.language==='en'?'restored':'되찾았어'));
  const restoredCount=Number(test.stage.slice(-1));
  assert.equal(await page.locator('.journey-light.restored').count(),restoredCount,'only the fixture prerequisites and the newly completed region are restored');
  assert.ok((await page.locator('.journey-map .mp-title').innerText()).includes(`${restoredCount}/5`));
  return label;
}

try {
  for (const test of cases) {
    const label=`${test.language}-${test.stage}`,context=await browser.newContext({viewport:{width:test.width,height:test.height},reducedMotion:'reduce'});
    await context.routeWebSocket('**',socket=>{socket.onMessage(()=>{});socket.send(JSON.stringify({type:'connected'}));});
    await context.addInitScript(({data,key})=>{
      if(!sessionStorage.getItem('journey-flow-seeded')) {
        localStorage.setItem(key,JSON.stringify(data)); sessionStorage.setItem('journey-flow-seeded','1');
      }
    },{data:seed(test.language,test.stage),key:STORAGE_KEY});
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const evidence={case:label,viewport:{width:test.width,height:test.height},pass:false,runs:[]};
    try {
      await page.goto(BASE,{waitUntil:'domcontentloaded'});
      await homeReady(page,true);
      const before=await readSave(page);
      assert.equal(before.settings.language,test.language);
      assert.equal(before.progress.clearedStages.includes(test.stage),false);
      assert.equal(before.progress.stageStars[test.stage]??0,0);
      for(let run=0;run<2;run++) {
        const entry=await routeIntoBattle(page,test);
        const result=await completeStory(page,test);
        assert.deepEqual([...result.replay.completed].sort(),['remix','steady'],'accurate whole short story earns steady + remix, never repair');
        assert.equal(result.replay.stamps,2,'same-day replay does not duplicate either stamp');
        if(run===0) {
          await page.locator('.result-tabs [role="tab"]').nth(2).click();
          let rewardText='';
          for(let pageIndex=0;pageIndex<50;pageIndex++) {
            const pane=page.locator('[role="tabpanel"]:not([hidden])');
            rewardText+=await pane.innerText();
            const more=pane.locator('[data-result-page-next]');
            if(!await more.isVisible()||await more.isDisabled()) break;
            await more.click();
          }
          assert.ok(rewardText.includes(test.language==='en'?'Steady and accurate':'차근차근 정확하게'),'steady reward is reachable in paged result rewards');
          assert.ok(rewardText.includes(test.language==='en'?'Discover a new path':'새로운 길의 발견'));
          await page.screenshot({path:`${OUT}/${label}-result.png`});
        } else {
          assert.notEqual(result.selectedStory,evidence.runs[0].selectedStory,'same region remix changes the connected story set');
          assert.notDeepEqual(result.targets.map(t=>t.text),evidence.runs[0].targets.map(t=>t.text));
        }
        await page.locator('.result-actions button').last().click();
        const restoredLabel=await assertRestoredMap(page,test);
        evidence.runs.push({...entry,...result,restoredLabel});
        await page.screenshot({path:`${OUT}/${label}-map-${run+1}.png`});
        if(run===0) { await page.locator('.topbar-common > button').first().click(); await homeReady(page); }
      }
      // Reload the same isolated storage, then use Home Continue to reach the map.
      await page.reload({waitUntil:'domcontentloaded'}); await homeReady(page,true);
      await page.locator('.home-menu > button.btn-primary').click(); await assertRestoredMap(page,test);
      const after=await readSave(page);
      assert.equal(after.records.replay.stamps,2);
      assert.ok(after.records.replay.completed.includes('steady'));
      assert.equal(after.records.learning.recent.filter(s=>s.stageId===test.stage&&s.source==='game').length,2);
      assert.deepEqual(errors,[],'no runtime errors across routes, stories, result, map, and reload');
      evidence.persisted={replay:after.records.replay,clearedStages:after.progress.clearedStages,stars:after.progress.stageStars[test.stage]};
      evidence.pass=true; results.push(evidence); writeResults();
      console.log(`PASS ${label}: two ordered stories, steady/remix once, recovered relic, saved reload`);
    } catch(error) {
      evidence.error=String(error); evidence.runtimeErrors=errors; results.push(evidence); writeResults();
      await page.screenshot({path:`${OUT}/${label}-failure.png`}).catch(()=>{});
      throw error;
    } finally {await context.close();}
  }
} finally {await browser.close();}
assert.equal(results.filter(r=>r.pass).length,cases.length);
console.log(`Journey UI flow: ${results.length}/${cases.length} cases passed (two real story completions per case).`);
