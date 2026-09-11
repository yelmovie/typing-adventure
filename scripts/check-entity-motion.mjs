import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Isolated Phaser scene imports the actual entities; it does not mutate game saves.
const BASE = process.env.MOTION_TEST_URL || 'http://127.0.0.1:5180';
const OUT = process.env.MOTION_TEST_OUT || 'tmp/entity-motion-check';
const reduceOnly = process.env.MOTION_REDUCE_ONLY === '1';
fs.mkdirSync(OUT, { recursive: true });
const sheets = ['char_brown_boy', 'char_pink_girl', 'char_glasses_boy', 'char_blond_explorer', 'pet_cat', 'pet_rabbit', 'pet_dragon', 'pet_squirrel', 'mon_boss_slime', 'char_poses'];
const generated = ['char_attack_ko_v1', 'char_walk_v1', 'char_walk_v2', 'pet_walk_v1'].filter(key => fs.existsSync(`public/assets/sprites/${key}.json`));
fs.writeFileSync(`${OUT}/harness.html`, `<!doctype html><html><body style="margin:0;background:#142440"><script type="module">
import Phaser from 'phaser';
import { Player } from '/src/game/entities/Player.ts';
import { Pet } from '/src/game/entities/Pet.ts';
import { Enemy } from '/src/game/entities/Enemy.ts';
import { setLanguage } from '/src/game/i18n/Locale.ts';
window.motion = { Player, Pet, Enemy, setLanguage };
new Phaser.Game({ type: Phaser.CANVAS, width:1280, height:700, backgroundColor:'#142440', audio:{noAudio:true}, scene:{
preload() { for(const key of ${JSON.stringify([...sheets, ...generated])}) this.load.atlas(key, '/assets/sprites/'+key+'.webp','/assets/sprites/'+key+'.json'); },
create() { window.motion.scene=this; this.add.rectangle(640,526,1280,2,0x8ed5b6); window.motion.ready=true; }
}});
</script></body></html>`);
const browser = await chromium.launch({ channel: process.env.MOTION_BROWSER_CHANNEL || 'chrome' });
const results = [];
try {
  for (const reduce of (reduceOnly ? [true] : [false, true])) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 700 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
    // Keep this source snapshot stable while other agents create QA HTML files.
    await context.routeWebSocket('**', socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ type: 'connected' })); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${BASE}/${OUT}/harness.html`);
    await page.waitForFunction(() => window.motion?.ready, undefined, { timeout: 60000 });
    const outcome = await page.evaluate(async ({ reduce, generated }) => {
      const { Player, Pet, Enemy, scene, setLanguage } = window.motion;
      const walkAtlas = generated.includes('char_walk_v2') ? 'char_walk_v2' : 'char_walk_v1';
      const wait = ms => new Promise(resolve => scene.time.delayedCall(ms, resolve));
      const checks = [];
      const check = (name, ok, data) => checks.push({ name, ok, data });
      const contact = sprite => {
        const f = sprite.frame, foot = (f.customData?.customData ?? f.customData)?.foot;
        return sprite.y + ((foot?.y ?? f.y + f.height) - sprite.displayOriginY) * sprite.scaleY;
      };
      let hits = 0, done = 0;
      const p = new Player(scene, 400, 520, 'char_brown_boy', 1.2);
      p.idle('right'); p.jab(); await wait(40);
      p.attack(() => hits++, () => done++);
      await wait(60); p.setPosition(440, 520); await wait(500);
      const idleV2 = walkAtlas==='char_walk_v2' && scene.textures.get(walkAtlas).has('c8_r0');
      const sideHeight = idleV2 ? Number((p.sprite.frame.customData?.customData ?? p.sprite.frame.customData).bodyHeight) : p.sprite.frame.height;
      const targetSideHeight = scene.textures.getFrame('char_brown_boy','idle_right').height*1.2;
      check('jab → attack restores sheet, scale, new scene position, and callbacks once', hits === 1 && done === 1 && !p.busy && p.sprite.texture.key === (idleV2?'char_walk_v2':'char_brown_boy') && p.sprite.frame.name === (idleV2?'c8_r0':'idle_right') && p.x === 440 && p.y === 520 && Math.abs(sideHeight*p.sprite.scaleX-targetSideHeight)<.001 && p.sprite.angle === 0, { hits, done, x:p.x, frame:p.sprite.frame.name, scale:p.sprite.scaleX });
      p.nudge(18); await wait(40); p.setPosition(470, 520); await wait(400);
      check('nudge cannot undo a scene position change', p.x === 470 && p.shadow.x === 470, { x:p.x, shadow:p.shadow.x });
      p.walking = true; p.walk('right', true); p.setRunPace(1.15);
      const pet = new Pet(scene, 260, 520, 'pet_cat', .7); pet.run();
      const walkFrames = new Set(), petFrames = new Set(), contacts = [];
      const sample = () => { walkFrames.add(String(p.sprite.frame.name)); petFrames.add(String(pet.sprite.frame.name)); contacts.push(contact(p.sprite)); };
      scene.events.on('postupdate', sample);
      p.attack(() => hits++); p.hit(); pet.cheer(); pet.skill(); await wait(600);
      scene.events.off('postupdate', sample);
      check('typing/hit/cheer preserve player and pet running cycles', p.sprite.anims.isPlaying && pet.sprite.anims.isPlaying && walkFrames.size >= 4 && petFrames.size >= 4 && !pet.sprite.isTinted, { walkFrames:[...walkFrames], petFrames:[...petFrames], tint:pet.sprite.isTinted });
      check('ground contact is stable without unrelated bob', Math.max(...contacts) <= 520.001 && Math.min(...contacts) >= (reduce ? 519.999 : 517.999), { min:Math.min(...contacts), max:Math.max(...contacts) });
      if (walkAtlas==='char_walk_v2') {
        p.setRunPace(1);
        const cycleTimes=[];
        const timeCycle=()=>{ if(p.sprite.frame.name==='c0_r0') cycleTimes.push(scene.time.now); };
        p.sprite.on('animationupdate',timeCycle); await wait(1400); p.sprite.off('animationupdate',timeCycle);
        const intervals=cycleTimes.slice(1).map((time,index)=>time-cycleTimes[index]);
        check('authored contact timing gives a 600 ms full stride without a double-contact pause', intervals.length>=1 && intervals.every(interval=>interval>=565 && interval<=635), { cycleTimes, intervals });
        p.setRunPace(1.15);
      }
      p.jump(); await wait(120); p.crouch(true); await wait(500);
      check('jump lands into held crouch on the same scene ground', !p.jumping && p.crouching && p.y === 520 && Math.abs(contact(p.sprite)-520)<.01, { frame:p.sprite.frame.name, y:p.y, contact:contact(p.sprite) });
      p.crouch(false); await wait(200);
      check('release crouch restores running sheet and cadence', !p.crouching && p.sprite.anims.isPlaying && Math.abs(p.sprite.anims.timeScale-1.15)<.001, { texture:p.sprite.texture.key, rate:p.sprite.anims.timeScale });
      p.walking = false; p.idle('right'); p.attack(() => hits++); p.victory(); pet.skill(); pet.victory(); await wait(900);
      check('victory cancels transient actions and clears pet skill tint', p.sprite.frame.name === 'victory' && p.y === 520 && p.sprite.angle === 0 && !pet.sprite.isTinted && pet.sprite.frame.name === 'victory', { playerFrame:p.sprite.frame.name, y:p.y, petTint:pet.sprite.isTinted });
      p.destroy(); pet.destroy();
      const doomed = new Player(scene, 300, 520, 'char_brown_boy'); let stale = 0;
      doomed.attack(() => stale++); doomed.destroy(); await wait(450);
      check('destroy removes delayed action callbacks', stale === 0, { stale });
      const e = new Enemy(scene, 870, 520, 'mon_boss_slime', .8);
      for(let i=0; i<8; i++) { e.hit(i%2===0); await wait(35); }
      await wait(400);
      check('rapid weak/strong hits settle once at enemy origin', e.sprite.x === 870 && e.shadow.x === 870 && e.sprite.angle === 0 && !e.sprite.isTinted, { x:e.sprite.x, sx:e.shadow.x, angle:e.sprite.angle });
      let peak = 870; const track = () => { peak=Math.max(peak,e.sprite.x); }; scene.events.on('postupdate',track);
      e.hit(true); await wait(300); scene.events.off('postupdate',track);
      check('strong feedback has one bounded knockback and reduce motion has none', reduce ? peak === 870 : peak >= 905 && peak <= 910.001, { peak, reduce });
      let enemyImpact=0, defeated=0; e.attack(()=>enemyImpact++); await wait(50); e.defeat(()=>defeated++); await wait(1800);
      check('defeat interrupts stale attack and finishes once', enemyImpact === 0 && defeated === 1, { enemyImpact, defeated }); e.destroy();
      if (['char_attack_ko_v1', 'char_walk_v1', 'pet_walk_v1'].every(key => generated.includes(key))) {
        const chars=['char_brown_boy','char_pink_girl','char_glasses_boy','char_blond_explorer'];
        const pets=['pet_cat','pet_rabbit','pet_dragon','pet_squirrel'];
        for(let row=0; row<4; row++) {
          setLanguage('ko'); const actor = new Player(scene, 300+row*150, 520, chars[row]);
          const frames=new Set(); const take=()=>frames.add(actor.sprite.texture.key+':'+actor.sprite.frame.name); scene.events.on('postupdate',take);
          actor.jab(); await wait(270); scene.events.off('postupdate',take);
          check('Korean typing row '+row+' uses all four replacement frames', [0,1,2,3].every(col=>frames.has('char_attack_ko_v1:c'+col+'_r'+row)) && ![...frames].some(f=>f.endsWith(':attack_0')||f.endsWith(':attack_1')), { frames:[...frames] });
          actor.walk('left',true); await wait(450);
          check('player row '+row+' uses left-mirrored walk atlas', actor.sprite.texture.key===walkAtlas && actor.sprite.flipX && Math.abs(contact(actor.sprite)-520)<.01, { texture:actor.sprite.texture.key, flip:actor.sprite.flipX });
          actor.walking=true;
          const cycleFrames=new Set(), wrongTextures=new Set();
          const keepWalking=()=>{ actor.idle('right'); cycleFrames.add(actor.sprite.frame.name); if(actor.sprite.texture.key!==walkAtlas) wrongTextures.add(actor.sprite.texture.key); };
          scene.events.on('postupdate',keepWalking); await wait(720); scene.events.off('postupdate',keepWalking);
          check('player row '+row+' repeats travel requests without reverting texture or restarting the stride', wrongTextures.size===0 && cycleFrames.size===(walkAtlas==='char_walk_v2'?8:4), { frames:[...cycleFrames], wrongTextures:[...wrongTextures] });
          actor.walking=false;
          if(walkAtlas==='char_walk_v2') {
            actor.idle('left');
            check('player row '+row+' rests in the matching side-view model with stable feet', actor.sprite.texture.key===walkAtlas && actor.sprite.frame.name===`c8_r${row}` && actor.sprite.flipX && Math.abs(contact(actor.sprite)-520)<.01 && !actor.sprite.anims.isPlaying, { texture:actor.sprite.texture.key, frame:actor.sprite.frame.name, contact:contact(actor.sprite) });
            actor.walk('right',false); await wait(180);
            const current=actor.sprite.frame.name, elapsed=actor.sprite.anims.accumulator;
            actor.walk('left',true);
            check('player row '+row+' changes speed and direction without resetting its step', actor.sprite.frame.name===current && actor.sprite.anims.accumulator===elapsed && actor.sprite.flipX && actor.sprite.anims.timeScale===1, { before:current, after:actor.sprite.frame.name, elapsed, afterElapsed:actor.sprite.anims.accumulator });
            const stepBeforeCrouch=actor.sprite.frame.name;
            actor.crouch(true); actor.crouch(false);
            check('player row '+row+' resumes the same step after crouch', actor.sprite.frame.name===stepBeforeCrouch && actor.sprite.texture.key===walkAtlas, { before:stepBeforeCrouch, after:actor.sprite.frame.name });
          }
          actor.idle('right'); setLanguage('en'); actor.jab(); await wait(70);
          check('English attack retains original letter artwork row '+row, actor.sprite.texture.key===chars[row], {texture:actor.sprite.texture.key}); await wait(250); actor.destroy();
          const companion = new Pet(scene,300,520,pets[row]); companion.walk('left'); await wait(450);
          check('pet row '+row+' uses mirrored walk atlas and returns to original idle', companion.sprite.texture.key==='pet_walk_v1' && companion.sprite.flipX && Math.abs(contact(companion.sprite)-520)<.01, { texture:companion.sprite.texture.key }); companion.idle();
          check('pet idle body scale restored row '+row, companion.sprite.texture.key===pets[row] && companion.sprite.scaleX===.55, { texture:companion.sprite.texture.key, scale:companion.sprite.scaleX }); companion.destroy();
        }
      }
      return checks;
    }, { reduce, generated });
    assert.deepEqual(errors, [], 'no browser runtime errors');
    for (const row of outcome) { results.push({ reduce, ...row }); console.log(`${row.ok?'PASS':'FAIL'} ${reduce?'reduce':'standard'} ${row.name} ${row.ok?'':JSON.stringify(row.data)}`); }
    fs.writeFileSync(`${OUT}/results-${reduce?'reduce':'standard'}.json`, JSON.stringify({ generated, checkedAt:new Date().toISOString(), results:outcome }, null, 2));
    await page.screenshot({ path: `${OUT}/${reduce?'reduce':'standard'}-final.png` });
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(`${OUT}/${reduceOnly?'reduce-recheck':'results'}.json`, JSON.stringify({ generated, checkedAt:new Date().toISOString(), results }, null, 2));
assert.ok(results.every(row => row.ok), 'all entity motion checks pass');
console.log(`${results.length} motion checks passed; generated atlases present: ${generated.join(', ') || 'none (fallback coverage only)'}`);
