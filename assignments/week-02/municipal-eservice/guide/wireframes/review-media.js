(async()=>{
 const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms||160)),results=[];
 const check=(name,pass)=>results.push({name,pass:!!pass});
 WF.reset();await wait();
 for(const [path,tab,id,file] of [['/citizen','','1A','1A-municipal-office.mp4'],['/register','','1A','1A-municipal-office.mp4'],['/login','citizen','LOGIN-CITIZEN','auth-citizen-login-v1.mp4'],['/login','staff','LOGIN-STAFF','auth-staff-login-v1.mp4'],['/verify/K7M2Q9XA','','3A','3A-officer-review.mp4']]){
  WF.go(path);await wait();if(tab){q('[data-tab='+tab+']').click();await wait()}
  const v=q('[data-motion-video]');for(let i=0;i<35&&v&&v.readyState<2&&!v.error;i++)await wait(80);
  check('Approved placement '+path+' '+tab,q('[data-motion-scene]')?.dataset.motionScene===id&&v?.currentSrc.endsWith('/'+file));
  check('Decoded muted loop '+path+' '+tab,v?.readyState>=2&&!v.error&&v.muted&&v.loop&&v.playsInline);
 }
 let v=q('[data-motion-video]'),b=q('[data-motion-toggle]');if(v.paused){b.click();await wait(220)}
 b.click();await wait();check('Scene pause works',v.paused);b.click();await wait(220);check('Scene resume works',!v.paused);
 WF.go('/citizen');await wait();check('Leaving a scene pauses its detached video',v.paused&&!v.isConnected);
 const hero=q('.hero'),copy=q('.hero-copy'),before={shadow:getComputedStyle(hero).boxShadow,transform:getComputedStyle(copy,':before').transform};
 hero.dispatchEvent(new PointerEvent('pointermove',{clientX:20,clientY:20,bubbles:true}));hero.dispatchEvent(new MouseEvent('mousemove',{clientX:600,clientY:180,bubbles:true}));await wait();
 check('Pointer movement leaves shadow and fade transform fixed',before.shadow===getComputedStyle(hero).boxShadow&&before.transform===getComputedStyle(copy,':before').transform);
 check('User greeting fade remains at 12px',getComputedStyle(copy,':before').transform==='matrix(1, 0, 0, 1, 0, 12)');
 check('Calendar date frame remains present',!!q('.calendar-day')&&!q('.app-header'));
 const source=[...document.scripts].find(s=>s.textContent.includes('window.CivicMotion =')).textContent;
 for(const scene of ['1A','3A','LOGIN-CITIZEN','LOGIN-STAFF']){
  const frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:0;top:0;width:300px;height:200px;visibility:hidden';document.body.append(frame);
  const win=frame.contentWindow,doc=frame.contentDocument;
  doc.open();doc.write('<!doctype html><html><body><section style="position:relative;height:180px" id="root"></section></body></html>');doc.close();
  win.matchMedia=()=>({matches:true,addEventListener(){}});
  win.eval(source);
  const base=WF.D.motion[scene],asset={...base,src:new URL(base.src,location.href).href,poster:new URL(base.poster,location.href).href};
  doc.querySelector('#root').innerHTML=win.CivicMotion.markup(asset);win.CivicMotion.mount(doc.querySelector('#root'));await wait(120);
  const video=doc.querySelector('video'),button=doc.querySelector('[data-motion-toggle]');
  check('Reduced preference defers source '+scene,!video.getAttribute('src'));
  check('Reduced preference retains poster and explicit play '+scene,!!doc.querySelector('.scene-poster')&&button.getAttribute('aria-label')==='เล่นภาพเคลื่อนไหว');
  button.click();await wait(120);check('Reduced preference allows explicit opt-in '+scene,!!video.getAttribute('src'));
  video.pause();frame.remove();
 }
 const frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:0;top:0;width:300px;height:200px;visibility:hidden';document.body.append(frame);
 const win=frame.contentWindow,doc=frame.contentDocument;doc.open();doc.write('<!doctype html><html><body><section style="position:relative;height:180px" id="root"></section></body></html>');doc.close();
 win.matchMedia=()=>({matches:false,addEventListener(){}});win.eval(source);
 doc.querySelector('#root').innerHTML=win.CivicMotion.markup({scene:'error-test',src:new URL('deliberately-missing-review-video.mp4',location.href).href,poster:new URL(WF.D.motion['1A'].poster,location.href).href});
 win.CivicMotion.mount(doc.querySelector('#root'));await wait(500);
 const button=doc.querySelector('[data-motion-toggle]');
 check('Media error retains a poster and disables playback',!!doc.querySelector('.scene-poster')&&button.disabled&&button.getAttribute('aria-label')==='แสดงภาพนิ่ง');
 frame.remove();WF.reset();await wait();
 return {results,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,reduced_motion_method:'Actual controller in isolated iframe with matchMedia preference stub; not an OS-level emulation'};
})()
