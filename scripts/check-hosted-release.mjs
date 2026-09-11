import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const BASE=process.env.HOSTED_URL;
if(!BASE)throw Error('HOSTED_URL is required');
const OUT=process.env.HOSTED_OUT||'tmp/hosted-v040';fs.mkdirSync(OUT,{recursive:true});
const proof={base:BASE,checks:[],errors:[]};
const browser=await chromium.launch({channel:'chrome'});
try {
 const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'allow'});
 const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',e=>proof.errors.push(e.message));
 await page.goto(BASE,{waitUntil:'domcontentloaded'});
 await page.locator('.opening-skip').waitFor({state:'visible'});
 await page.waitForFunction(()=>{const v=document.querySelector('.opening-video');return v&&v.currentTime>0&&v.videoWidth>0;});
 await page.locator('.opening-skip').click();await page.locator('.home-menu').waitFor({state:'visible'});
 const meta=await page.evaluate(()=>({og:document.querySelector('meta[property="og:image"]')?.content,url:document.querySelector('meta[property="og:url"]')?.content,canonical:document.querySelector('link[rel="canonical"]')?.href}));
 assert.equal(meta.og,new URL('/icons/social-preview.jpg',BASE).href);assert.equal(meta.url,BASE);assert.equal(meta.canonical,BASE);proof.meta=meta;
 assert.equal(await page.evaluate(()=>typeof window.__game),'undefined');
 await page.getByRole('button',{name:'소리 설정',exact:true}).click();
 await page.locator('.sound-popover.open input[type=range]').first().fill('25');
 await page.keyboard.press('Escape');
 const key='typing_adventure_save_v1';const before=await page.evaluate(key=>localStorage.getItem(key),key);assert.ok(before);
 await page.goto('about:blank');await page.goBack({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('.opening-skip')||document.querySelector('.home-menu')?.getClientRects().length);
 if(await page.locator('.opening-skip').isVisible())await page.locator('.opening-skip').click();
 await page.locator('.home-menu').waitFor({state:'visible'});
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before,'Browser Back preserves saved records');
 proof.checks.push('Actual opening frames and home controls','Browser Back restores app and storage','No production debug hook');
 const request=context.request;
 const og=await request.get(meta.og);assert.equal(og.status(),200);const jpg=await og.body();assert.ok(jpg.equals(fs.readFileSync('public/icons/social-preview.jpg')));proof.ogBytes=jpg.length;
 const manifestResponse=await request.get(new URL('/classroom-manifest.json',BASE).href);assert.equal(manifestResponse.status(),200);const manifest=await manifestResponse.json();proof.manifest=manifest.version;
 let cursor=0;let total=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<manifest.assets.length){const a=manifest.assets[cursor++];const response=await request.get(new URL(a.url,BASE).href);assert.equal(response.status(),200,a.url);const bytes=await response.body();assert.equal(createHash('sha256').update(bytes).digest('hex'),a.revision,a.url);total+=bytes.length;}}));
 proof.assets={count:manifest.assets.length,bytes:total,sha256:'all verified'};
 assert.deepEqual(proof.errors,[]);await page.screenshot({path:OUT+'/home.png'});proof.pass=true;
 console.log('PASS hosted release',JSON.stringify(proof));
}catch(error){proof.pass=false;proof.failure=String(error);throw error;}
finally{fs.writeFileSync(OUT+'/results.json',JSON.stringify(proof,null,2));await browser.close();}
