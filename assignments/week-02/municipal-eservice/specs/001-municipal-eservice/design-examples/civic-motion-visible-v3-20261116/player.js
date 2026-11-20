/* Display the actual GIF's decoded frames, with observable playback state. */
(()=>{
const cards=[...document.querySelectorAll('.card')],players=[],reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const now=()=>performance.now();
async function setup(card){
 const img=card.querySelector('img'),canvas=card.querySelector('canvas'),status=card.querySelector('.status'),button=card.querySelector('[data-toggle]');
 const p={card,img,canvas,status,button,playing:!reduced,ready:false,frame:0,framesDrawn:0,frameCount:0,start:now(),pausedAt:0,busy:false,decoder:null,mode:'native-gif'};players.push(p);
 function toggle(){if(p.playing)pause(p);else play(p)}button.onclick=toggle;
 try{
  if(typeof ImageDecoder!=='function'||!await ImageDecoder.isTypeSupported('image/gif'))throw Error('Native GIF fallback');
  const bytes=Uint8Array.from(atob(img.src.split(',')[1]),c=>c.charCodeAt(0));
  p.decoder=new ImageDecoder({data:bytes,type:'image/gif',preferAnimation:true});await p.decoder.tracks.ready;await p.decoder.completed;
  p.frameCount=p.decoder.tracks.selectedTrack.frameCount;p.stepMs=5000/p.frameCount;p.mode='decoded-gif';
  const result=await p.decoder.decode({frameIndex:0,completeFramesOnly:true}),frame=result.image;
  canvas.width=frame.displayWidth;canvas.height=frame.displayHeight;p.ctx=canvas.getContext('2d');p.ctx.drawImage(frame,0,0);frame.close();
  p.frame=0;p.framesDrawn=1;p.ready=true;img.hidden=true;canvas.hidden=false;p.start=now();update(p);
 }catch(error){
  p.ready=true;p.error=String(error);p.frameCount=Number(card.dataset.frames);p.stepMs=5000/p.frameCount;
  if(reduced){if(img.complete&&img.naturalWidth)freezeNative(p);else img.addEventListener('load',()=>freezeNative(p),{once:true})}
  update(p);
 }
}
function update(p){p.card.dataset.playing=String(p.playing);p.card.dataset.mode=p.mode;p.button.textContent=p.playing?'หยุด':'เล่นตัวอย่าง';p.status.textContent=p.playing?(p.mode==='decoded-gif'?'กำลังเล่น · เฟรม '+(p.frame+1)+' / '+p.frameCount:'กำลังเล่น GIF'):'หยุดอยู่ · กดเล่นตัวอย่าง';}
function freezeNative(p){if(!p.img.naturalWidth)return;p.canvas.width=p.img.naturalWidth;p.canvas.height=p.img.naturalHeight;p.canvas.getContext('2d').drawImage(p.img,0,0);p.img.hidden=true;p.canvas.hidden=false;}
function pause(p){p.pausedAt=(now()-p.start)%5000;p.playing=false;if(p.mode==='native-gif')freezeNative(p);update(p)}
function play(p){p.start=now()-p.pausedAt;p.playing=true;if(p.mode==='native-gif'){p.img.hidden=false;p.canvas.hidden=true}update(p)}
async function draw(p,index){if(p.busy||!p.decoder)return;p.busy=true;try{const result=await p.decoder.decode({frameIndex:index,completeFramesOnly:true});if(p.playing){p.ctx.drawImage(result.image,0,0);p.frame=index;p.framesDrawn++;update(p)}result.image.close()}catch(error){p.error=String(error)}finally{p.busy=false}}
let active=true;
function tick(){if(!active)return;const time=now();for(const p of players){if(!p.ready||!p.playing||p.mode!=='decoded-gif'||p.card.hidden)continue;const index=Math.floor(((time-p.start)%5000)/p.stepMs)%p.frameCount;if(index!==p.frame)draw(p,index)}requestAnimationFrame(tick)}
document.querySelector('#play-all').onclick=()=>players.forEach(play);document.querySelector('#pause-all').onclick=()=>players.forEach(pause);
function showScene(key,autoplay=true){for(const p of players){const selected=key==='all'||p.card.dataset.scene===key;p.card.hidden=!selected;if(selected&&p.ready&&autoplay)play(p)}document.querySelectorAll('[data-scene-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sceneTab===key)))}
document.querySelectorAll('[data-scene-tab]').forEach(b=>b.onclick=()=>showScene(b.dataset.sceneTab));
window.__CIVIC_MOTION_V3__={players,showScene,pause,play,version:3};
Promise.all(cards.map(setup)).then(()=>{if(document.body.dataset.inline==='true')showScene('1A',!reduced);requestAnimationFrame(tick)});
addEventListener('pagehide',()=>{active=false;for(const p of players)p.decoder?.close()},{once:true});
})();
