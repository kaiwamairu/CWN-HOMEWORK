'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {TAU,prepare,offset}=require('./motion.cjs');
const DIR=__dirname,PREVIEW=process.argv.includes('--preview'),W=PREVIEW?160:448,H=PREVIEW?200:560,N=PREVIEW?100:125,DELAY=PREVIEW?5:4,SCALE=W/448*1.8,OUT=PREVIEW?path.join(DIR,'previews'):DIR;
fs.mkdirSync(OUT,{recursive:true});
const {pngRead,pngWrite,paletteFor,gifWrite}=require('./codec.cjs')({W,H,DELAY});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function sample(rgb,width,height,x,y,c){x=Math.max(0,Math.min(width-1.000001,x));y=Math.max(0,Math.min(height-1.000001,y));const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=(iy*width+ix)*3+c,b=a+3,d=a+width*3,e=d+3;return Math.round((rgb[a]*(1-fx)+rgb[b]*fx)*(1-fy)+(rgb[d]*(1-fx)+rgb[e]*fx)*fy)}
function resize(image){const out=new Uint8Array(W*H*3);for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<3;c++)out[(y*W+x)*3+c]=sample(image.rgb,image.w,image.h,(x+.5)*image.w/W-.5,(y+.5)*image.h/H-.5,c);return out}
function render(base,key,points,phase){const out=base.slice();for(const point of points){const [dx,dy]=offset(key,point,phase,SCALE);for(let c=0;c<3;c++)out[point.p*3+c]=sample(base,W,H,point.x+dx,point.y+dy,c)}return out}
function nearestPalette(palette){const cache=new Map();return (r,g,b)=>{const key=(r<<16)|(g<<8)|b;let found=cache.get(key);if(found!==undefined)return found;let best=Infinity;found=0;for(let i=0;i<255;i++){const c=palette[i],d=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;if(d<best){best=d;found=i}}cache.set(key,found);return found}}
const names={'1A':'municipal-office-1A-smooth-v2.gif','2A':'citizen-writing-2A-smooth-v2.gif','3A':'officer-review-3A-smooth-v2.gif'},report=[];
for(const key of ['1A','2A','3A']){
 const source=path.join(DIR,key+'-approved.png'),image=pngRead(source),base=resize(image),points=prepare(key,W,H),reference=Array.from({length:6},(_,i)=>render(base,key,points,i*TAU/6)),{pal}=paletteFor(reference),nearest=nearestPalette(pal),baseIndices=new Uint8Array(W*H),timeline=[];
 for(let p=0;p<baseIndices.length;p++)baseIndices[p]=nearest(base[p*3],base[p*3+1],base[p*3+2]);
 let maxStep=0,maxDisplacement=0,endpointError=0,stationaryChanges=0;
 for(const point of points){const first=offset(key,point,0,SCALE),end=offset(key,point,TAU,SCALE);endpointError=Math.max(endpointError,Math.hypot(first[0]-end[0],first[1]-end[1]));let previous=offset(key,point,-TAU/N,SCALE);for(let i=0;i<N;i++){const current=offset(key,point,TAU*i/N,SCALE);maxStep=Math.max(maxStep,Math.hypot(current[0]-previous[0],current[1]-previous[1]));maxDisplacement=Math.max(maxDisplacement,Math.hypot(...current));previous=current}}
 for(let i=0;i<N;i++){const phase=TAU*i/N,indices=baseIndices.slice();for(const point of points){const [dx,dy]=offset(key,point,phase,SCALE),x=point.x+dx,y=point.y+dy;indices[point.p]=nearest(sample(base,W,H,x,y,0),sample(base,W,H,x,y,1),sample(base,W,H,x,y,2))}timeline.push(indices)}
 const active=new Set(points.map(p=>p.p));for(let p=0;p<W*H;p++)if(!active.has(p))for(let i=1;i<N;i++)if(timeline[i][p]!==timeline[0][p])stationaryChanges++;
 const end=render(base,key,points,TAU);if(!Buffer.from(end).equals(Buffer.from(base)))throw Error('Loop endpoint differs from approved still');
 if(maxStep>.25||endpointError>1e-8||stationaryChanges)throw Error('Motion continuity verification failed');
 pngWrite(path.join(OUT,key+'-poster.png'),base);const file=path.join(OUT,names[key]),changes=gifWrite(file,timeline,pal),bytes=fs.readFileSync(file);
 const row={selected:key,file:names[key],width:W,height:H,fps:100/(DELAY),frames:N,frame_ms:DELAY*10,duration_ms:N*DELAY*10,loop:0,bytes:bytes.length,sha256:sha(bytes),source_sha256:sha(fs.readFileSync(source)),method:'Single approved still; continuous periodic local displacement; no AI frame switching or crossfade',max_sampling_offset_px:Number(maxDisplacement.toFixed(6)),max_sampling_step_px:Number(maxStep.toFixed(6)),loop_endpoint_error_px:endpointError,stationary_region_changed_pixels:stationaryChanges,changed_pixels_encoded:changes};
 report.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(OUT,'build-manifest.json'),JSON.stringify({version:2,scope:'Motion asset correction; application UI unchanged',source:'User-approved ChatGPT stills 1A / 2A / 3A',method:'Code animation of a single still per scene; no generated intermediate scene drawings',animations:report},null,2)+'\n');
