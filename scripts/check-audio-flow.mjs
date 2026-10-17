import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.AUDIO_TEST_URL || 'http://127.0.0.1:5180';
const out = process.env.AUDIO_TEST_OUT || 'tmp/audio-flow-check';
const filter = process.env.AUDIO_TEST_FILTER;
fs.mkdirSync(out, { recursive: true });
const results = [];
const cases = [
  { name: 'initial-on-pointer', enabled: true, input: 'pointer' },
  { name: 'initial-on-keyboard', enabled: true, input: 'keyboard' },
  { name: 'initial-off-settings', enabled: false, input: 'pointer' },
];
for (const test of cases) {
  if (filter && !test.name.includes(filter)) continue;
  const browser = await chromium.launch({ channel: process.env.AUDIO_BROWSER_CHANNEL || 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type:'connected' })); });
  await context.addInitScript(({ enabled }) => {
    localStorage.setItem('typing_adventure_save_v1', JSON.stringify({ version:'1', profile:{name:'하늘',characterId:'brown_boy',petId:'cat',difficulty:'normal'}, progress:{unlockedStage:2,clearedStages:['stage_1'],stageStars:{stage_1:3}}, settings:{bgm:enabled,sfx:enabled,bgmVolume:0.7,sfxVolume:0.9,prologueSeen:true} }));
    window.__observedAudio = [];
    window.__firstIntroFrame = null;
    window.Audio = new Proxy(window.Audio, { construct(Target,args) {
      const audio = new Target(...args); window.__observedAudio.push(audio); return audio;
    } });
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
      if (this instanceof HTMLVideoElement && this.classList.contains('opening-video') && !this.__audioFrameProbe) {
        this.__audioFrameProbe = true;
        this.requestVideoFrameCallback((now, frame) => {
          window.__firstIntroFrame = { epoch:Date.now(), presentationTime:now, mediaTime:frame.mediaTime, audioElements:window.__observedAudio.length };
        });
      }
      return originalPlay.apply(this,args);
    };
  }, test);
  const page = await context.newPage();
  const errors = [], requests = [], checks = [];
  const result = { name:test.name, initialBgm:test.enabled, activation:test.input, pass:false, checks };
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/assets\/bgm\/bgm_[^/]+\.mp3(?:\?|$)/.test(request.url())) requests.push({url:request.url(),epoch:Date.now()}); });
  const ready = () => page.waitForFunction(() => !document.querySelector('#fade.on') && !document.getElementById('ui-stage')?.inert);
  const musicPlaying = () => page.waitForFunction(() => window.__observedAudio.some(audio => !audio.paused && audio.currentTime > 0.05), null, { timeout:30000 });
  const snapshot = () => page.evaluate(() => window.__observedAudio.map(audio => ({src:audio.src,paused:audio.paused,time:audio.currentTime,volume:audio.volume,loop:audio.loop})));
  try {
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(() => window.__firstIntroFrame !== null, null, {timeout:60000});
    result.firstIntroFrame = await page.evaluate(() => window.__firstIntroFrame);
    assert.equal(result.firstIntroFrame.audioElements,0,'No BGM element is created before the actual first intro video frame');
    assert.deepEqual(requests,[],'No BGM file request before the first user input');
    assert.deepEqual(await snapshot(),[],'Initial screen keeps only the pending track name');
    checks.push('Actual first video frame is presented with zero BGM elements and zero BGM requests');

    if (test.input === 'keyboard') await page.keyboard.press('a');
    else await page.locator('.opening-skip').click();
    if (test.enabled) {
      await musicPlaying();
      const media = await snapshot();
      assert.equal(media.length,1,'First input creates exactly one BGM element');
      assert.equal(media.filter(audio=>!audio.paused).length,1,'Exactly one actual BGM track plays');
      assert.ok(media[0].src.endsWith('bgm_home.mp3'));
      assert.ok(requests.length>0 && requests.every(item=>item.url.endsWith('bgm_home.mp3')));
      assert.ok(Math.abs(media[0].volume-0.47)<0.001);
      checks.push('First trusted input starts one real home BGM track at its saved volume');
    } else {
      assert.deepEqual(await snapshot(),[],'First input respects saved BGM off');
      assert.deepEqual(requests,[]);
      checks.push('First input with saved BGM off creates no audio element and requests no BGM');
    }
    if (await page.locator('.opening-skip').isVisible()) await page.locator('.opening-skip').click();
    await page.locator('.opening-player').waitFor({state:'detached'});
    await ready();
    await page.getByRole('button',{name:'설정',exact:true}).click();
    const bgm = page.getByRole('switch',{name:'배경 음악',exact:true});
    if (!test.enabled) {
      await bgm.click(); await musicPlaying();
      assert.equal((await snapshot()).length,1);
      checks.push('Settings on starts the home track that was deferred while saved BGM was off');
    }
    await bgm.click();
    assert.ok((await snapshot()).every(audio=>audio.paused));
    await bgm.click(); await musicPlaying();
    assert.equal((await snapshot()).length,1,'Off/on resumes the existing element without a duplicate');
    assert.equal((await snapshot()).filter(audio=>!audio.paused).length,1);
    checks.push('Settings off/on pauses and resumes the same media element');

    await page.locator('.settings-body input[type=range]').first().fill('30');
    assert.ok(Math.abs((await snapshot())[0].volume-0.47*0.3/0.7)<0.001);
    checks.push('Home volume applies the selected 30% slider and the home gain');
    await page.getByRole('button',{name:'확인',exact:true}).click();
    await page.getByRole('button',{name:'모험 지도 열기',exact:true}).click();
    await page.locator('.screen.worldmap:not(.hidden)').waitFor();
    await ready(); await musicPlaying();
    let media = await snapshot();
    assert.equal(media.length,2);
    assert.equal(media.filter(audio=>!audio.paused).length,1);
    assert.equal(media[0].paused,true);
    const map = media.find(audio=>!audio.paused);
    assert.ok(map.src.endsWith('bgm_map.mp3'));
    assert.ok(Math.abs(map.volume-0.53*0.3/0.7)<0.001);
    checks.push('Scene change pauses home, plays one map track, and preserves the selected volume');

    await page.getByRole('button',{name:'소리 설정',exact:true}).click();
    // The popover offers one 켜짐/꺼짐 state button per channel (music, effects) instead of a single mute.
    const states = page.locator('.sound-popover.open .sound-state');
    assert.equal(await states.count(),2,'sound popover has separate music and effects toggles');
    const savedSound = () => page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('typing_adventure_save_v1')).settings;return[s.bgm,s.sfx];});
    const stateLabels = () => states.evaluateAll(els=>els.map(el=>[el.textContent.trim(),el.getAttribute('aria-pressed')]));
    for (let i = 0; i < 2; i++) if (await states.nth(i).getAttribute('aria-pressed') === 'true') await states.nth(i).click();
    assert.deepEqual(await stateLabels(),[['꺼짐','false'],['꺼짐','false']]);
    assert.ok((await snapshot()).every(audio=>audio.paused));
    assert.deepEqual(await savedSound(),[false,false]);
    await states.nth(0).click(); await states.nth(1).click(); await musicPlaying();
    assert.deepEqual(await stateLabels(),[['켜짐','true'],['켜짐','true']]);
    assert.deepEqual(await savedSound(),[true,true]);
    media = await snapshot();
    assert.equal(media.length,2);
    assert.equal(media.filter(audio=>!audio.paused).length,1);
    checks.push('Sound popover state buttons switch BGM/SFX off and on and resume the same map element without overlap');
    assert.deepEqual(errors,[]);
    Object.assign(result,{pass:true,media,requests,errors});
    console.log(`PASS audio ${test.name}: ${checks.length} checks`);
  } catch (error) {
    Object.assign(result,{error:String(error),requests,errors});
    await page.screenshot({path:`${out}/failure-${test.name}.png`,timeout:5000}).catch(()=>{});
    throw error;
  } finally {
    results.push(result);
    fs.writeFileSync(`${out}/results.json`,JSON.stringify({date:new Date().toISOString(),base,results,note:'Disposable Chrome profiles. Actual media decoding/playback state; physical-speaker listening is not tested. Service workers blocked to observe network timing without cache interception.'},null,2));
    await context.close(); await browser.close();
  }
}
