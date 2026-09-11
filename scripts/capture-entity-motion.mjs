import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.MOTION_TEST_URL || 'http://127.0.0.1:5180';
const OUT = 'tmp/entity-motion-check';
if (!fs.existsSync(`${OUT}/harness.html`)) throw new Error('Run check-entity-motion.mjs first.');
const browser = await chromium.launch({ channel: process.env.MOTION_BROWSER_CHANNEL || 'chrome' });
try {
  for (const kind of ['walk', 'attack', 'pet']) {
    const page = await browser.newPage({ viewport: { width:1280, height:700 } });
    await page.goto(`${BASE}/${OUT}/harness.html`);
    await page.waitForFunction(()=>window.motion?.ready);
    await page.evaluate(async kind => {
      const { scene, Player, Pet, setLanguage } = window.motion;
      const { placeFeet } = await import('/src/game/entities/anims.ts');
      setLanguage('ko');
      scene.children.removeAll(true);
      const names = kind === 'pet' ? ['pet_cat','pet_rabbit','pet_dragon','pet_squirrel'] : ['char_brown_boy','char_pink_girl','char_glasses_boy','char_blond_explorer'];
      scene.add.text(30,20,kind==='attack'?'Korean typing: four phases':'Original idle (left) / new stride (right)',{font:'24px sans-serif',color:'#eaf2ff'});
      for(let row=0;row<4;row++) {
        const y=kind==='attack'?160+row*170:row<2?300:625;
        const x=kind==='attack'?0:(row%2)*630;
        scene.add.text(kind==='attack'?20:x+40,kind==='attack'?y-65:y-230,names[row],{font:'17px sans-serif',color:'#b9d0ef'});
        if(kind==='attack') for(let col=0;col<4;col++) {
          const actor=new Player(scene,320+col*270,y,names[row],.58);
          actor.jab(); actor.sprite.anims.stop(); actor.sprite.setFrame(`c${col}_r${row}`); placeFeet(actor.sprite);
        } else {
          const Entity=kind==='pet'?Pet:Player, scale=kind==='pet'?1:.85;
          const idle=new Entity(scene,x+210,y,names[row],scale); idle.idle('right');
          const walk=new Entity(scene,x+450,y,names[row],scale); walk.walk('right',true); walk.sprite.anims.stop(); walk.sprite.setFrame(`c2_r${row}`); placeFeet(walk.sprite);
          scene.add.rectangle(x+320,y+2,550,2,0x8ed5b6);
        }
      }
      scene.scene.pause();
    },kind);
    await page.screenshot({path:`${OUT}/comparison-${kind}.png`});
    await page.close();
  }
} finally {await browser.close();}
console.log('Captured actual Phaser idle/stride/attack comparisons.');
