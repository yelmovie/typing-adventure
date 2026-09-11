import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = ['brown_boy', 'pink_girl', 'glasses_boy', 'blond_explorer'];
const size = 320, ground = 294, center = 160;
const out = path.join(root, 'public/assets/sprites/char_walk_v2');
const proof = path.join(root, 'tmp/walk-v2-assets');
const report = [], frames = {}, composites = [];
await fs.mkdir(proof, { recursive: true });
const median = values => { const a = [...values].sort((a,b) => a-b); return (a[Math.floor((a.length-1)/2)] + a[Math.ceil((a.length-1)/2)])/2; };

async function source(name) {
  const { data, info } = await sharp(path.join(root, 'assets/character', name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const transparent = data.filter((_, i) => i%4 === 3 && data[i] < 16).length;
  let keyed = 0;
  // Preserve real alpha. Opaque image_gen revisions explicitly use a magenta matte.
  if (transparent < info.width*info.height*.2) {
    const matte=new Uint8Array(info.width*info.height), queue=[];
    // Seed the specified matte, then expand only through connected spill. This
    // keeps authentic pink clothing behind the character's dark outline intact.
    for (let p=0; p<data.length; p+=4) {
      const [r,g,b] = data.subarray(p,p+3);
      if(r>215 && b>215 && g<65) { matte[p/4]=1; queue.push(p/4); }
    }
    for(let i=0;i<queue.length;i++) {
      const n=queue[i], x=n%info.width, y=Math.floor(n/info.width);
      for(const m of [x>0?n-1:-1,x<info.width-1?n+1:-1,y>0?n-info.width:-1,y<info.height-1?n+info.width:-1]) {
        if(m<0 || matte[m]) continue;
        const r=data[m*4],g=data[m*4+1],b=data[m*4+2];
        if(r>85 && b>85 && g<155 && r-g>45 && b-g>45) {matte[m]=1;queue.push(m);}
      }
    }
    keyed=queue.length;
    for(let n=0;n<matte.length;n++) {
      const p=n*4;
      if(matte[n]) {data.fill(0,p,p+4);continue;}
      const x=n%info.width,y=Math.floor(n/info.width);
      const edge=(x>0&&matte[n-1])||(x<info.width-1&&matte[n+1])||(y>0&&matte[n-info.width])||(y<info.height-1&&matte[n+info.width]);
      const [r,g,b]=data.subarray(p,p+3);
      if(edge && r>g+16 && b>g+16) {const spill=Math.min(r-g,b-g)-6;data[p]=r-spill;data[p+2]=b-spill;}
    }
    if(keyed < info.width*info.height*.2) throw new Error(`${name}: real alpha or specified magenta matte required`);
  }
  return { name, info, image: await sharp(data,{raw:info}).png().toBuffer(), keyed };
}

async function cell(src,col,row,cols,rows) {
  const left = Math.round(col*src.info.width/cols), top = Math.round(row*src.info.height/rows);
  const width = Math.round((col+1)*src.info.width/cols)-left, height = Math.round((row+1)*src.info.height/rows)-top;
  const {data,info} = await sharp(src.image).extract({left,top,width,height}).raw().toBuffer({resolveWithObject:true});
  let x0=width,y0=height,x1=0,y1=0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) if(data[(y*width+x)*4+3]>48) {
    x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
  }
  if(x1-x0<40 || y1-y0<80) throw new Error(`${src.name} ${col},${row}: empty sprite`);
  if(Math.min(x0,y0,width-1-x1,height-1-y1)<6) throw new Error(`${src.name} ${col},${row}: drawing touches cell edge`);
  // Track the head rather than alternating feet or a trailing scarf/backpack.
  const headCenters=[];
  for(let y=Math.round(y0+(y1-y0)*.1);y<=Math.round(y0+(y1-y0)*.36);y++) {
    let min=width,max=-1;
    for(let x=x0;x<=x1;x++) if(data[(y*width+x)*4+3]>96) {min=Math.min(min,x);max=Math.max(max,x);}
    if(max>=min) headCenters.push((min+max)/2);
  }
  return { image:await sharp(data,{raw:info}).extract({left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}).png().toBuffer(),
    width:x1-x0+1,height:y1-y0+1,headX:median(headCenters)-x0,sourceBounds:{x0,y0,x1,y1} };
}

const idle = await source('character-idle-side-v2.png');
for(let row=0;row<ids.length;row++) {
  const src = await source(`character-walk-${ids[row]}-v2.png`);
  const cells=[];
  for(let col=0;col<8;col++) cells.push(await cell(src,col%4,Math.floor(col/4),4,2));
  const typicalHeight=median(cells.map(c=>c.height));
  const scale=Math.min(240/typicalHeight,...cells.map(c=>Math.min((ground-24)/c.height,(center-20)/c.headX,(size-center-20)/(c.width-c.headX))));
  const bodyHeight=Math.round(typicalHeight*scale);
  const rest=await cell(idle,row%2,Math.floor(row/2),2,2);
  cells.push(rest);
  const checks=[];
  for(let col=0;col<cells.length;col++) {
    const c=cells[col], factor=col===8?bodyHeight/c.height:scale;
    const width=Math.round(c.width*factor),height=Math.round(c.height*factor);
    const x=Math.round(center-c.headX*factor),y=ground-height;
    if(x<8 || y<8 || x+width>size-8 || y+height>size-8) throw new Error(`${ids[row]} ${col}: normalized sprite outside safety gutter`);
    const png=await sharp({create:{width:size,height:size,channels:4,background:'#00000000'}})
      .composite([{input:await sharp(c.image).resize(width,height,{kernel:'lanczos3'}).png().toBuffer(),left:x,top:y}]).png().toBuffer();
    frames[`c${col}_r${row}`]={frame:{x:col*size,y:row*size,w:size,h:size},rotated:false,trimmed:false,
      spriteSourceSize:{x:0,y:0,w:size,h:size},sourceSize:{w:size,h:size},
      customData:{bodyHeight,foot:{x:center,y:ground}}};
    composites.push({input:png,left:col*size,top:row*size});
    checks.push({col,width,height,x,y,headX:x+c.headX*factor,sourceBounds:c.sourceBounds});
    await fs.writeFile(path.join(proof,`${ids[row]}-${col}.png`),png);
  }
  report.push({id:ids[row],source:src.name,bodyHeight,keyed:src.keyed,frames:checks});
}
const atlas=await sharp({create:{width:size*9,height:size*4,channels:4,background:'#00000000'}}).composite(composites).png().toBuffer();
await sharp(atlas).webp({quality:94,alphaQuality:100}).toFile(`${out}.webp`);
await fs.writeFile(`${out}.json`,JSON.stringify({frames,meta:{app:'typing-adventure authored walk packing',image:'char_walk_v2.webp',size:{w:size*9,h:size*4},scale:'1',walkFrames:8,idleFrame:8}}));
await fs.writeFile(path.join(proof,'atlas.png'),atlas);
await fs.writeFile(path.join(proof,'report.json'),JSON.stringify({frames:36,bytes:(await fs.stat(`${out}.webp`)).size,characters:report},null,2));
console.log(JSON.stringify({atlas:'char_walk_v2',frames:36,bytes:(await fs.stat(`${out}.webp`)).size,characters:report.map(({frames,...r})=>r)},null,2));
