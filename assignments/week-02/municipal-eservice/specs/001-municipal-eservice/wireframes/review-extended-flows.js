(async()=>{
 const results=[],q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],wait=()=>new Promise(r=>setTimeout(r,110));
 const check=(name,pass,actual)=>results.push({name,pass:!!pass,...(actual!==undefined?{actual}:{})});
 const click=s=>{const e=q(s);if(!e)throw Error('Missing '+s);e.click()};
 const set=(s,value)=>{const e=q(s);if(!e)throw Error('Missing '+s);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))};
 const submit=s=>q(s).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 const nav=async path=>{WF.go(path);await wait()},page=async key=>{set('#screen-picker',key);await wait()},actor=async id=>{set('#actor-picker',id);await wait()},reset=async()=>{WF.reset();await wait()};
 const t=id=>q('[data-testid='+id+']'),group=async(name,fn)=>{try{await reset();await fn()}catch(e){results.push({name:name+' runtime',pass:false,actual:e.stack})}};
 await group('SV03 routing',async()=>{
  await page('queue');await actor('off.reg2');await nav('/officer/cases/EG-2569-000012');
  click('[data-action=forward]');check('SV03 registry forwards to works',WF.caseBy('EG-2569-000012').dept==='works'&&!WF.caseBy('EG-2569-000012').owner);
  await actor('off.works1');click('[data-action=claim]');check('Works officer can claim routed case',t('case-status')?.dataset.status==='IN_REVIEW'&&WF.caseBy('EG-2569-000012').owner==='off.works1');
  click('[data-action=forward]');check('Works forwards to head',t('case-status')?.dataset.status==='PENDING_APPROVAL');
  await actor('head1');await page('approvals');check('Head sees routed case',q('#app').innerText.includes('EG-2569-000012'));
  await nav('/officer/cases/EG-2569-000012');click('[data-action=approve]');check('Head approves routed SV03',t('case-status')?.dataset.status==='APPROVED');
  await actor('off.reg2');click('[data-action=issue]');check('Original issuer issues approved SV03',WF.caseBy('EG-2569-000012').status==='COMPLETED'&&q('#modal').open);
  click('[data-action=close-modal]');await nav('/verify/WF000002');check('Issued SV03 verifies with masked identity',t('verify-doc-no')?.textContent==='DOC-2569-000002'&&t('verify-applicant')?.textContent.includes('***'));
  set('[data-testid=verify-scenario]','EXPIRED');check('Public verification expired state is readable',t('verify-result')?.textContent.includes('หมดอายุ'));
  set('[data-testid=verify-scenario]','TAMPERED');check('Public verification signature failure is readable',t('verify-result')?.textContent.includes('ลายเซ็น'));
  await nav('/verify/UNKNOWN0');check('Unknown verify code shows not found',t('verify-result')?.textContent.includes('ไม่พบ'));
 });
 await group('Head rejection',async()=>{
  await page('queue');await actor('off.reg2');await nav('/officer/cases/EG-2569-000013');click('[data-action=forward]');
  await actor('head1');click('[data-action=reason][data-kind=reject]');set('#reason-input','สั้น');submit('[data-form=reason]');check('Head rejection requires a full reason',!!t('reject-reason-error')?.textContent);
  set('#reason-input','หลักฐานไม่ตรงตามเงื่อนไขบริการ');submit('[data-form=reason]');check('Head rejection ends in rejected status',t('case-status')?.dataset.status==='REJECTED');
  check('Rejected request offers no issue action',!q('[data-action=issue]'));
 });
 await group('Correction round trip',async()=>{
  await page('queue');await actor('off.reg2');await nav('/officer/cases/EG-2569-000026');click('[data-action=reason][data-kind=return]');
  set('#reason-input','กรุณาแก้ไขสำเนาบัตรให้อ่านชัดเจน');submit('[data-form=reason]');check('Officer returns case for correction',t('case-status')?.dataset.status==='NEED_FIX');
  await actor('citizen.1');await nav('/citizen/cases/EG-2569-000026');check('Citizen sees correction action and reason',!!q('[data-action=submit-fix]')&&t('return-reason-display')?.textContent.includes('สำเนาบัตร'));
  click('[data-action=submit-fix]');const confirm=q('[data-action=confirm-submit-fix]');check('Correction dialog offers a working confirmation',!!confirm);
  if(!confirm)return;confirm.click();await wait();
  check('Confirmed correction returns to review',t('case-status')?.dataset.status==='IN_REVIEW');
  check('Correction keeps the previous officer',WF.caseBy('EG-2569-000026').owner==='off.reg2');
  await actor('off.reg2');await nav('/officer/cases/EG-2569-000026');check('Officer can continue the returned case',!!q('[data-action=approve]'));
 });
 await group('Admin saves',async()=>{
  await page('services');set('#svc-fee-SV-01','35');submit('[data-form=service-admin][data-service=SV-01]');check('Admin can save fee example',WF.service('SV-01').fee===35);
  await page('wizard');set('#qty-input','2');check('Updated fee is shown on a new draft',t('fee-total')?.textContent.includes('70'));
  await page('holidays');set('#holiday-date-input','2026-12-15');set('#holiday-name-input','วันหยุดทดสอบหน้าจอ');submit('[data-form=holiday]');check('Admin can add a holiday',q('#app').innerText.includes('วันหยุดทดสอบหน้าจอ'));
  const remove=qa('[data-action=delete-holiday]').find(b=>b.dataset.date==='2026-12-15');if(!remove)throw Error('New holiday delete action missing');remove.click();check('Holiday removal requires confirmation',!!q('[data-action=confirm-holiday]'));click('[data-action=confirm-holiday]');check('Confirmed holiday removal updates list',!q('#app').innerText.includes('วันหยุดทดสอบหน้าจอ'));
  await page('users');const roleControl=qa('[data-role-user]').find(e=>e.dataset.roleUser==='off.reg1');roleControl.value='executive';roleControl.dispatchEvent(new Event('change',{bubbles:true}));qa('[data-action=save-user]').find(e=>e.dataset.user==='off.reg1').click();check('Admin role edit is stored in prototype',WF.S.users.find(u=>u.username==='off.reg1').role==='executive');
  await page('login');click('[data-tab=staff]');set('#staff-username','off.reg1');set('#staff-password','Test@1234');submit('[data-form=staff-login]');await wait();check('Role edit takes effect on next login',window.__WIREFRAMES__.current==='dashboard'&&WF.actor().role==='executive');
 });
 await group('Report and audit exports',async()=>{
  await page('dashboard');set('#period-select','2026-11');click('[data-action=export-dashboard][data-format=pdf]');check('PDF preview follows chosen reporting period',q('#modal').open&&q('#modal').innerText.includes('2026-11')&&q('#modal').innerText.includes('85.7'));click('[data-action=close-modal]');
  click('[data-action=export-dashboard][data-format=xlsx]');check('Excel preview follows chosen reporting period',q('#modal').open&&q('#modal').innerText.includes('2026-11'));click('[data-action=close-modal]');
  await page('audit');let url='',download='';const original=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){if(this.download){url=this.href;download=this.download;return}return original.call(this)};
  try{click('[data-action=export-audit]')}finally{HTMLAnchorElement.prototype.click=original}
  const text=url?await (await fetch(url)).text():'';check('Audit CSV example contains the expected columns',download==='wireframe-audit.csv'&&text.includes('username,role,event,caseNo'));
  check('Audit view has no edit or delete control',!q('[data-action=delete-audit]')&&!q('[data-action=edit-audit]'));
 });
 await group('Notification read state',async()=>{
  await page('notifications');const first=q('[data-noti]'),caseNo=first?.dataset.noti;first.click();await wait();check('Notification opens the related request',location.hash.endsWith('/officer/cases/'+caseNo));
  await page('notifications');check('Opened notification is marked read',qa('[data-testid=noti-item]').find(e=>e.dataset.caseNo===caseNo)?.textContent.includes('อ่านแล้ว'));
  check('Unread sidebar count decreases after reading',t('bell-count')?.textContent==='2',t('bell-count')?.textContent);
  await actor('head1');check('Another actor keeps their unread count',t('bell-count')?.textContent==='1');
 });
 await group('Profile keyboard and logout',async()=>{
  await page('citizen');const button=q('[data-action=toggle-profile]');button.click();check('Profile menu opens and receives first item focus',button.getAttribute('aria-expanded')==='true'&&document.activeElement?.dataset.action==='profile-view');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));check('Profile keyboard reaches logout',document.activeElement?.dataset.action==='logout');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check('Escape returns focus to profile trigger',button.getAttribute('aria-expanded')==='false'&&document.activeElement===button);
  button.click();click('[data-action=profile-view]');check('Account details are read-only',q('#modal').open&&!q('#modal input'));click('[data-action=close-modal]');
  button.click();click('[data-action=logout]');await wait();check('Citizen logout returns to citizen login tab',window.__WIREFRAMES__.current==='login'&&q('[data-tab=citizen]').getAttribute('aria-selected')==='true');
 });
 await reset();await page('citizen');
 return {results,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length};
})()
