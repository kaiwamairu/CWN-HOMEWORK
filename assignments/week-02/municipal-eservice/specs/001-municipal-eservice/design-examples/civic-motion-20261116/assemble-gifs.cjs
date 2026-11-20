/* Package ChatGPT's six-cell animation keyframes as looping GIFs.
 * Node built-ins only. No alternate image/video generation provider is used.
 * The first keyframe is held outside feathered motion regions to prevent drift.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const DIR=__dirname,PREVIEW=process.argv.includes('--preview'),W=PREVIEW?192:448,H=PREVIEW?240:560,STEPS=PREVIEW?4:6,DELAY=PREVIEW?15:10,OUTDIR=PREVIEW?path.join(DIR,'previews'):DIR;
fs.mkdirSync(OUTDIR,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function pngRead(file){
 const b=fs.readFileSync(file);if(b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('PNG required');
 let pos=8,w,h,depth,type,interlace,parts=[];
 while(pos<b.length){const n=b.readUInt32BE(pos),kind=b.toString('ascii',pos+4,pos+8),data=b.subarray(pos+8,pos+8+n);if(kind==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);depth=data[8];type=data[9];interlace=data[12]}if(kind==='IDAT')parts.push(data);pos+=n+12;if(kind==='IEND')break}
 if(depth!==8||![2,6].includes(type)||interlace!==0)throw Error('Use noninterlaced RGB/RGBA 8-bit PNG');
 const channels=type===6?4:3,stride=w*channels,raw=zlib.inflateSync(Buffer.concat(parts)),out=Buffer.alloc(h*stride);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c};
 for(let y=0;y<h;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const a=x>=channels?out[y*stride+x-channels]:0,u=y?out[(y-1)*stride+x]:0,c=y&&x>=channels?out[(y-1)*stride+x-channels]:0,v=raw[y*(stride+1)+1+x];out[y*stride+x]=(v+(filter===0?0:filter===1?a:filter===2?u:filter===3?Math.floor((a+u)/2):filter===4?paeth(a,u,c):NaN))&255}}
 const rgb=new Uint8Array(w*h*3);for(let i=0;i<w*h;i++){rgb[i*3]=out[i*channels];rgb[i*3+1]=out[i*channels+1];rgb[i*3+2]=out[i*channels+2]}
 return {w,h,rgb};
}
const crcTable=Array.from({length:256},(_,i)=>{let n=i;for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function chunk(name,data){const kind=Buffer.from(name),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);let crc=0xffffffff;for(const v of Buffer.concat([kind,data]))crc=crcTable[(crc^v)&255]^(crc>>>8);c.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([n,kind,data,c])}
function pngWrite(file,rgb){const info=Buffer.alloc(13);info.writeUInt32BE(W,0);info.writeUInt32BE(H,4);info[8]=8;info[9]=2;const raw=Buffer.alloc(H*(W*3+1));for(let y=0;y<H;y++){raw[y*(W*3+1)]=0;Buffer.from(rgb.buffer,rgb.byteOffset+y*W*3,W*3).copy(raw,y*(W*3+1)+1)}fs.writeFileSync(file,Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',info),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]))}
function cell(image,index){
 const col=index%3,row=Math.floor(index/3),x0=col*image.w/3+2,y0=row*image.h/2+2,cw=image.w/3-4,ch=image.h/2-4,rgb=new Uint8Array(W*H*3);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const sx=x0+(x+.5)*cw/W-.5,sy=y0+(y+.5)*ch/H-.5,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;for(let c=0;c<3;c++){const a=image.rgb[(iy*image.w+ix)*3+c],b=image.rgb[(iy*image.w+ix+1)*3+c],d=image.rgb[((iy+1)*image.w+ix)*3+c],e=image.rgb[((iy+1)*image.w+ix+1)*3+c];rgb[(y*W+x)*3+c]=Math.round((a*(1-fx)+b*fx)*(1-fy)+(d*(1-fx)+e*fx)*fy)}}return rgb;
}
const REGIONS={
 '1A':[[.13,.25,.26,.16],[.94,.46,.22,.18],[.72,.36,.075,.07]],
 '2A':[[.41,.80,.17,.10]],
 '3A':[[.44,.70,.14,.09],[.69,.65,.18,.10]]
};
function maskFor(key){const m=new Float32Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let a=0;for(const [cx,cy,rx,ry] of REGIONS[key]){const d=Math.sqrt(((x/W-cx)/rx)**2+((y/H-cy)/ry)**2),t=Math.max(0,Math.min(1,(1-d)/.25));a=Math.max(a,t*t*(3-2*t))}m[y*W+x]=a}return m}
function stabilize(frames,mask){const base=frames[0];return frames.map((frame,k)=>{if(k===0)return frame;const out=new Uint8Array(frame.length);for(let p=0;p<W*H;p++){const a=mask[p];for(let c=0;c<3;c++)out[p*3+c]=Math.round(base[p*3+c]*(1-a)+frame[p*3+c]*a)}return out})}
function paletteFor(frames){
 const count=new Uint32Array(32768),sumR=new Float64Array(32768),sumG=new Float64Array(32768),sumB=new Float64Array(32768);
 for(const rgb of frames)for(let i=0;i<rgb.length;i+=3){const k=(rgb[i]>>3)<<10|(rgb[i+1]>>3)<<5|rgb[i+2]>>3;count[k]++;sumR[k]+=rgb[i];sumG[k]+=rgb[i+1];sumB[k]+=rgb[i+2]}
 const coords=k=>[k>>10,(k>>5)&31,k&31],stats=ids=>{const lo=[31,31,31],hi=[0,0,0];let mass=0;for(const k of ids){const c=coords(k);mass+=count[k];for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],c[a]);hi[a]=Math.max(hi[a],c[a])}}let axis=0;for(let a=1;a<3;a++)if(hi[a]-lo[a]>hi[axis]-lo[axis])axis=a;return {ids,mass,axis,score:ids.length>1?(hi[axis]-lo[axis])*Math.pow(mass,.3):0}};
 const boxes=[stats(Array.from(count.keys()).filter(k=>count[k]))];
 while(boxes.length<255){let index=0;for(let i=1;i<boxes.length;i++)if(boxes[i].score>boxes[index].score)index=i;const box=boxes[index];if(!box.score)break;box.ids.sort((a,b)=>coords(a)[box.axis]-coords(b)[box.axis]);let mass=0,split=1;for(let i=0;i<box.ids.length-1;i++){mass+=count[box.ids[i]];if(mass>=box.mass/2){split=i+1;break}}boxes.splice(index,1,stats(box.ids.slice(0,split)),stats(box.ids.slice(split)))}
 const pal=boxes.map(b=>{let r=0,g=0,v=0;for(const k of b.ids){r+=sumR[k];g+=sumG[k];v+=sumB[k]}return [Math.round(r/b.mass),Math.round(g/b.mass),Math.round(v/b.mass)]});while(pal.length<256)pal.push(pal[0]);
 const lut=new Uint8Array(32768);for(let k=0;k<32768;k++){const r=(k>>10)*8+4,g=((k>>5)&31)*8+4,b=(k&31)*8+4;let best=Infinity,index=0;for(let i=0;i<255;i++){const c=pal[i],d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;if(d<best){best=d;index=i}}lut[k]=index}return {pal,lut};
}
function quantize(rgb,lut){const out=new Uint8Array(W*H);for(let p=0;p<out.length;p++){const i=p*3;out[p]=lut[(rgb[i]>>3)<<10|(rgb[i+1]>>3)<<5|rgb[i+2]>>3]}return out}
// Deliberately clear the LZW dictionary before the 9-bit boundary. This keeps
// encoding deterministic and independent of code-width transition quirks.
function lzw(pixels){const bytes=[];let acc=0,n=0;const emit=code=>{acc|=code<<n;n+=9;while(n>=8){bytes.push(acc&255);acc>>>=8;n-=8}};let dict=new Map(),next=258,prev=pixels[0];emit(256);for(let i=1;i<pixels.length;i++){const c=pixels[i],key=prev*256+c;if(dict.has(key))prev=dict.get(key);else{emit(prev);dict.set(key,next++);if(next>=500){emit(256);dict=new Map();next=258}prev=c}}emit(prev);emit(257);if(n)bytes.push(acc&255);const blocks=[Buffer.from([8])];for(let i=0;i<bytes.length;i+=255){const p=bytes.slice(i,i+255);blocks.push(Buffer.from([p.length]),Buffer.from(p))}blocks.push(Buffer.from([0]));return Buffer.concat(blocks)}
const u16=n=>Buffer.from([n&255,n>>8&255]);
function gifWrite(file,frames,palette){
 const parts=[Buffer.from('GIF89a'),u16(W),u16(H),Buffer.from([0xf7,0,0]),Buffer.from(palette.flat()),Buffer.from([0x21,0xff,11]),Buffer.from('NETSCAPE2.0'),Buffer.from([3,1,0,0,0])];let previous=null,totalChanged=0;
 for(const current of frames){let left=0,top=0,right=W-1,bottom=H-1,changed=W*H;if(previous){left=W;top=H;right=-1;bottom=-1;changed=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x;if(previous[p]!==current[p]){changed++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}if(!changed){left=0;right=0;top=0;bottom=0}}totalChanged+=changed;const w=right-left+1,h=bottom-top+1,pixels=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y+top)*W+x+left;pixels[y*w+x]=previous&&previous[p]===current[p]?255:current[p]}parts.push(Buffer.from([0x21,0xf9,4,previous?5:4]),u16(DELAY),Buffer.from([255,0]),Buffer.from([0x2c]),u16(left),u16(top),u16(w),u16(h),Buffer.from([0]),lzw(pixels));previous=current}
 parts.push(Buffer.from([0x3b]));fs.writeFileSync(file,Buffer.concat(parts));return totalChanged;
}
const names={'1A':'municipal-office-1A.gif','2A':'citizen-writing-2A.gif','3A':'officer-review-3A.gif'},report=[];
for(const key of ['1A','2A','3A']){
 const image=pngRead(path.join(DIR,key+'-sheet.png')),mask=maskFor(key),raw=Array.from({length:6},(_,i)=>cell(image,i)),frames=stabilize(raw,mask),{pal,lut}=paletteFor(frames),timeline=[];
 for(let i=0;i<6;i++)for(let j=0;j<STEPS;j++){const t=(1-Math.cos(Math.PI*j/STEPS))/2,a=frames[i],b=frames[(i+1)%6],rgb=new Uint8Array(a.length);for(let k=0;k<rgb.length;k++)rgb[k]=Math.round(a[k]*(1-t)+b[k]*t);timeline.push(quantize(rgb,lut))}
 let outsideChanges=0,motionPixels=0;for(let p=0;p<W*H;p++){if(mask[p]>0)motionPixels++;for(let i=1;i<timeline.length;i++)if(!mask[p]&&timeline[i][p]!==timeline[0][p])outsideChanges++}
 if(outsideChanges)throw Error('Unexpected motion outside mask');pngWrite(path.join(OUTDIR,key+'-poster.png'),frames[0]);
 const dest=path.join(OUTDIR,names[key]),changes=gifWrite(dest,timeline,pal),bytes=fs.readFileSync(dest);
 report.push({selected:key,file:names[key],width:W,height:H,keyframes:6,frames:timeline.length,frame_ms:DELAY*10,duration_ms:timeline.length*DELAY*10,loop:0,bytes:bytes.length,sha256:sha(bytes),frame_source_sha256:sha(fs.readFileSync(path.join(DIR,key+'-sheet.png'))),approved_source_sha256:sha(fs.readFileSync(path.join(DIR,key+'-approved.png'))),stationary_region_changed_pixels:outsideChanges,motion_region_pixels:motionPixels,changed_pixels_encoded:changes});
 console.log(JSON.stringify(report.at(-1)));
}
fs.writeFileSync(path.join(OUTDIR,'build-manifest.json'),JSON.stringify({generator:'ChatGPT image_gen keyframes; local Node.js GIF assembly',source_preservation:'Approved still files retained without overwriting; rendered keyframes used for motion preview',scope:'GIF review assets, not yet integrated into the wireframe UI',animations:report},null,2)+'\n');
