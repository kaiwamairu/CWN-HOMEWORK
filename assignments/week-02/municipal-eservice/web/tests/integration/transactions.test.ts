import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase,immediate} from '../../src/server/db/connection.ts';
import {seed} from '../../src/server/db/seed.ts';
test('storage rejects orphan/duplicate/malformed rows; return-count maximum remains a domain rule',()=>{
 const dir=mkdtempSync(join(tmpdir(),'civic-constraints-')),db=openDatabase(join(dir,'db.sqlite')),keys={dataKey:Buffer.alloc(32,1),lookupKey:Buffer.alloc(32,2),documentKey:Buffer.alloc(32,3)};
 try{seed(db,keys);
 assert.throws(()=>db.prepare("INSERT INTO sessions VALUES('x','missing','citizen',NULL,0,1)").run(),/FOREIGN KEY/);
 assert.throws(()=>db.prepare("INSERT INTO users(id,name,role,id_lookup,id_cipher,id_last3) VALUES('bad','test','citizen','h',x'11','123')").run(),/CHECK|NOT NULL/);
 assert.throws(()=>db.prepare("UPDATE drafts SET qty=NULL WHERE id='DR-0001'").run(),/CHECK/);assert.throws(()=>db.prepare("UPDATE cases SET area_sqm=NULL WHERE case_no='EG-2569-000010'").run(),/CHECK/);assert.throws(()=>db.prepare("UPDATE drafts SET locked_fee=NULL WHERE id='DR-0002'").run(),/CHECK/);
 immediate(db,()=>{db.prepare("UPDATE cases SET return_count=3 WHERE case_no='EG-2569-000023'").run();});assert.equal((db.prepare("SELECT return_count FROM cases WHERE case_no='EG-2569-000023'").get() as {return_count:number}).return_count,3);
 assert.throws(()=>db.prepare("INSERT INTO case_departments VALUES('EG-2569-000030','registry','2026-12-01T09:00:00+07:00')").run(),/UNIQUE/);
 db.prepare("INSERT INTO notifications(case_no,recipient,level,created_at,text) VALUES('EG-2569-000030','off.reg1','near','2026-12-01T09:00:00+07:00','x')").run();assert.throws(()=>db.prepare("INSERT INTO notifications(case_no,recipient,level,created_at,text) VALUES('EG-2569-000030','off.reg1','near','2026-12-01T09:00:00+07:00','x')").run(),/UNIQUE/);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

// ---- B14 integration: the assembled router (all feature adapters) over one file-backed DB ----
import Database from 'better-sqlite3';
import {dispatch,ROUTES} from '../../src/server/http/router.ts';
import type {Context} from '../../src/server/http/context.ts';
const keys14={dataKey:Buffer.alloc(32,1),lookupKey:Buffer.alloc(32,2),documentKey:Buffer.alloc(32,3)};
function routerHarness(modes:string[]=[]){
 const dir=mkdtempSync(join(tmpdir(),'civic-router-')),path=join(dir,'db.sqlite'),db=openDatabase(path);seed(db,keys14);
 const ctx:Context={db,keys:keys14,testMode:true,bugModes:new Set(modes)};
 const call=async(c:Context,method:string,url:string,cookie='',body?:unknown)=>{const r=await dispatch(new Request('http://127.0.0.1'+url,{method,headers:{cookie,...(body!==undefined?{'content-type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined}),c);const text=await r.text();return {status:r.status,body:text?(()=>{try{return JSON.parse(text);}catch{return text;}})():null};};
 const staff=async(username:string,c=ctx)=>{const r=await dispatch(new Request('http://127.0.0.1/api/auth/staff/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password:'Test@1234'})}),c);assert.equal(r.status,200);return r.headers.get('set-cookie')!.split(';')[0]!;};
 const citizen=async(idNo:string,c=ctx)=>{assert.equal((await call(c,'POST','/api/auth/thaid/start','',{idNo})).status,200);const r=await dispatch(new Request('http://127.0.0.1/api/auth/thaid/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idNo,otp:'123456'})}),c);assert.equal(r.status,200);return r.headers.get('set-cookie')!.split(';')[0]!;};
 const second=()=>{const other=new Database(path);other.pragma('foreign_keys = ON');other.pragma('busy_timeout = 5000');return {...ctx,db:other} as Context;};
 return {db,ctx,call,staff,citizen,second,close:()=>{db.close();rmSync(dir,{recursive:true,force:true});}};
}
const SAMPLE:Record<string,string>={'/api/auth/thaid/(start|verify)':'/api/auth/thaid/start'};
function samplePath(pattern:RegExp):string{
 const source=pattern.source.replace(/^\^|\$$/g,'').replace(/\\\//g,'/').replace(/\\\./g,'.');
 return SAMPLE[source]??source.replace(/\[\^\/\]\+/g,'EG-2569-000025').replace(/SV-0\[123\]/,'SV-01').replace(/\((\w+)\|[^)]*\)/g,'$1');
}
test('B14 router: every registered route is wired to a feature (no 501 NOT_IMPLEMENTED for an authorized caller)',async()=>{
 const h=routerHarness();
 try{
  const cookies:Record<string,string>={citizen:await h.citizen('3100600987659'),officer:await h.staff('off.reg2'),head:await h.staff('head1'),executive:await h.staff('exec1'),auditor:await h.staff('audit1'),admin:await h.staff('admin1')};
  for(const route of ROUTES)for(const method of route.methods){
   const path=samplePath(route.path);assert.ok(route.path.test(path),`sample ${path} matches ${route.path}`);
   if(path==='/api/auth/logout')continue;
   const role=route.roles?.[0];const r=await h.call(h.ctx,method,path,role?cookies[role]:'',method==='GET'||method==='DELETE'?undefined:{});
   assert.notEqual(r.status,501,`${method} ${path} → ${JSON.stringify(r.body)}`);assert.notEqual(r.status,500,`${method} ${path} → 500`);
  }
 }finally{h.close();}
});
test('B14 router: cancel vs claim on one SUBMITTED case over two SQLite connections → exactly one winner',async()=>{
 for(const order of ['claim-first','cancel-first']){
  const h=routerHarness(),other=h.second();
  try{
   const piti=await h.citizen('1909900555015'),reg1=await h.staff('off.reg1',other);
   const claim=()=>h.call(other,'POST','/api/officer/cases/EG-2569-000029/claim',reg1,{});const cancel=()=>h.call(h.ctx,'POST','/api/cases/EG-2569-000029/cancel',piti,{});
   const [a,b]=order==='claim-first'?[await claim(),await cancel()]:[await cancel(),await claim()];
   const statuses=[a.status,b.status].sort();assert.deepEqual(statuses,[200,409],order);
   const row=h.db.prepare("SELECT status,owner FROM cases WHERE case_no='EG-2569-000029'").get() as {status:string;owner:string|null};
   assert.equal(row.status,order==='claim-first'?'IN_REVIEW':'CANCELLED');
   assert.equal((h.db.prepare("SELECT count(*) n FROM audit WHERE event='CLAIM' AND case_no='EG-2569-000029'").get() as {n:number}).n,order==='claim-first'?1:0);
  }finally{other.db.close();h.close();}
 }
});
test('B14 router: concurrent duplicate claims from two connections give one 200 and one ALREADY_CLAIMED, one audit row',async()=>{
 const h=routerHarness(),other=h.second();
 try{
  const reg1=await h.staff('off.reg1'),reg2=await h.staff('off.reg2',other);
  const [a,b]=await Promise.all([h.call(h.ctx,'POST','/api/officer/cases/EG-2569-000029/claim',reg1,{}),h.call(other,'POST','/api/officer/cases/EG-2569-000029/claim',reg2,{})]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);assert.equal([a,b].find(r=>r.status===409)!.body.code,'ALREADY_CLAIMED');
  assert.equal((h.db.prepare("SELECT count(*) n FROM audit WHERE event='CLAIM' AND case_no='EG-2569-000029'").get() as {n:number}).n,1);
 }finally{other.db.close();h.close();}
});
test('B14 router: approve → issue allocates one DOC number; a second issue is 409 and allocates nothing',async()=>{
 const h=routerHarness();
 try{
  const reg2=await h.staff('off.reg2');
  assert.equal((await h.call(h.ctx,'POST','/api/cases/EG-2569-000025/approve',reg2,{})).status,200);
  const first=await h.call(h.ctx,'POST','/api/officer/cases/EG-2569-000025/issue',reg2,{});assert.equal(first.status,200);assert.equal(first.body.docNo,'DOC-2569-000002');
  const again=await h.call(h.ctx,'POST','/api/officer/cases/EG-2569-000025/issue',reg2,{});assert.equal(again.status,409);
  assert.equal((h.db.prepare("SELECT count(*) n FROM documents").get() as {n:number}).n,2);
  const verify=await h.call(h.ctx,'GET',`/api/verify/${first.body.verifyCode}`);assert.equal(verify.body.result,'VALID');
 }finally{h.close();}
});
