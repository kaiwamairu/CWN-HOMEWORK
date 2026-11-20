// PNG/GIF packaging helpers retained from the previous local encoder.
'use strict';
const fs=require('node:fs'),zlib=require('node:zlib');
module.exports=({W,H,DELAY})=>{
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

return {pngRead,pngWrite,paletteFor,gifWrite};
};
