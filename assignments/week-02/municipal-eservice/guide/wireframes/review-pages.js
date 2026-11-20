(async()=>{
 const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],tick=()=>new Promise(r=>setTimeout(r,70)),pages=[],states=[],extras=[];
 const set=(selector,value)=>{const e=q(selector);e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}))};
 WF.reset();await tick();
 for(const route of WF.D.routes){
  set('#screen-picker',route.key);await tick();
  const app=q('#app');
  const fields=qa('#app input:not([type=hidden]),#app select,#app textarea').filter(e=>e.getClientRects().length);
  const unlabeled=fields.filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).map(e=>e.id||e.name||e.tagName);
  const unnamed=qa('#app button').filter(e=>e.getClientRects().length&&!e.textContent.trim()&&!e.getAttribute('aria-label')&&!e.title).map(e=>e.dataset.action||e.outerHTML.slice(0,100));
  pages.push({key:window.__WIREFRAMES__.current,expected:route.key,width:innerWidth,no_overflow:document.documentElement.scrollWidth<=innerWidth+1,title:document.title,readable_thai:!/[?]{3,}/.test(app.innerText),content:app.innerText.length>30,unlabeled_fields:unlabeled,unnamed_buttons:unnamed,no_app_header:!q('#app .app-header')});
  if(innerWidth===1280){
   for(const state of ['loading','empty','error','forbidden','missing']){
    set('#state-picker',state);await tick();
    const text=q('#app').innerText;
    const visible=state==='loading'?!!q('.loading'):state==='empty'?text.includes('ไม่มี')||text.includes('ยังไม่มีข้อมูล'):state==='error'?text.includes('ไม่สามารถดำเนินการได้'):state==='forbidden'?!!q('[data-testid=forbidden-msg]'):!!q('[data-testid=not-found-msg]');
    states.push({page:route.key,state,visible,no_overflow:document.documentElement.scrollWidth<=innerWidth+1,readable_thai:!/[?]{3,}/.test(text)});
   }
   set('#state-picker','normal');await tick();
  }
 }
 set('#screen-picker','citizen');await tick();
 if(innerWidth===375){
  const button=q('[data-action=toggle-profile]');button.click();await tick();const r=q('#profile-menu').getBoundingClientRect(),b=button.getBoundingClientRect();
  extras.push({name:'mobile profile menu stays within viewport',pass:r.left>=0&&r.right<=innerWidth&&r.top>=0});
  extras.push({name:'mobile profile trigger meets 44px',pass:b.width>=44&&b.height>=44});
  button.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 }
 WF.reset();await tick();
 return {pages,states,extras};
})()
