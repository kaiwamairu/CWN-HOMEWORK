'use strict';
// Continuous, periodic sampling offsets over ONE approved still.
// Coordinates are normalized; motion amplitudes are pixels at 448 px width.
const TAU=2*Math.PI;
const regions={
 '1A':[[.15,.255,.19,.14],[.26,.37,.105,.105],[.94,.455,.135,.16],[.726,.38,.065,.06]],
 '2A':[[.385,.846,.105,.058],[.39,.805,.067,.075]],
 '3A':[[.45,.725,.105,.075],[.69,.665,.17,.10]]
};
function weight(x,y,r){const d=Math.hypot((x-r[0])/r[2],(y-r[1])/r[3]);const t=Math.max(0,Math.min(1,(1-d)/.35));return t*t*(3-2*t)}
function prepare(key,width,height){const points=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++){const nx=x/width,ny=y/height,w=regions[key].map(r=>weight(nx,ny,r));if(w.some(v=>v>0))points.push({p:y*width+x,x,y,nx,ny,w})}return points}
function offset(key,point,phase,scale){
 const {nx:x,ny:y,w}=point,s=Math.sin(phase),s2=Math.sin(2*phase);let dx=0,dy=0;
 if(key==='1A'){
  const leaf=Math.max(w[0],w[1],w[2]);dx=leaf*(.9*s+.18*s2);dy=leaf*(.28*s+.12*s2);
  const flag=w[3]*Math.max(0,Math.min(1,(.775-x)/.095)),wave=(x-.68)*12+(y-.33)*6;
  dx+=flag*.42*s;dy+=flag*1.1*(Math.sin(phase+wave)-Math.sin(wave));
 }else if(key==='2A'){
  const hand=Math.max(...w),lever=Math.max(.1,Math.min(1,(x-.305)/.15));
  dx=hand*lever*(1.0*s+.15*s2);dy=hand*lever*.30*s2;
 }else{
  dx=w[0]*(.82*s+.12*s2)+w[1]*.24*s;
  dy=w[0]*.30*s2+w[1]*.78*s;
 }
 return [dx*scale,dy*scale];
}
module.exports={TAU,regions,prepare,offset};
