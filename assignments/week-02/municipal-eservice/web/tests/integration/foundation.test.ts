import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, immediate } from '../../src/server/db/connection.ts';
import { seed } from '../../src/server/db/seed.ts';
import { readClock, setClock } from '../../src/server/domain/clock.ts';
import { evaluateLifecycle } from '../../src/server/domain/lifecycle.ts';
import { appendAudit } from '../../src/server/domain/audit.ts';
import { parseBugModes } from '../../src/server/testing/bug-modes.ts';
import { dispatch } from '../../src/server/http/router.ts';
import { readConfig } from '../../src/server/config.ts';

const keys={dataKey:Buffer.alloc(32,11),lookupKey:Buffer.alloc(32,22),documentKey:Buffer.alloc(32,33)};
function harness(){const dir=mkdtempSync(join(tmpdir(),'civic-foundation-'));const path=join(dir,'db.sqlite');const db=openDatabase(path);return {db,path,close(){db.close();rmSync(dir,{recursive:true,force:true});}};}
const count=(db:ReturnType<typeof openDatabase>,table:string)=> (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}).n;

test('seed is exact, encrypted at rest, fresh across reset and independent of mutations',()=>{
 const h=harness();try{seed(h.db,keys);assert.equal(count(h.db,'cases'),30);assert.equal(count(h.db,'drafts'),2);assert.equal(count(h.db,'documents'),1);assert.equal(count(h.db,'audit'),0);assert.equal(count(h.db,'notifications'),0);
 assert.equal(readClock(h.db,true),'2026-12-01T09:00:00+07:00');
 const first=h.db.prepare('SELECT id_cipher FROM users WHERE id=?').get('citizen-somchai') as {id_cipher:Buffer};
 const generation=(h.db.prepare('SELECT session_generation FROM runtime_control').get() as {session_generation:number}).session_generation;
 h.db.prepare("INSERT INTO sessions(token_digest,user_id,role,dept,registration_only,generation) VALUES('old','citizen-somchai','citizen',NULL,0,?)").run(generation);
 seed(h.db,keys);assert.equal(count(h.db,'sessions'),0);assert.equal((h.db.prepare('SELECT session_generation FROM runtime_control').get() as {session_generation:number}).session_generation,generation+1);
 assert.notDeepEqual((h.db.prepare('SELECT id_cipher FROM users WHERE id=?').get('citizen-somchai') as {id_cipher:Buffer}).id_cipher,first.id_cipher);
 const bytes=readFileSync(h.path);for(const sensitive of ['1101700123456','3100600987659','0812345678','0823456789'])assert.equal(bytes.includes(Buffer.from(sensitive)),false);
 assert.equal(h.db.pragma('foreign_keys',{simple:true}),1);assert.equal(h.db.pragma('journal_mode',{simple:true}),'delete');assert.equal(h.db.pragma('busy_timeout',{simple:true}),5000);
 }finally{h.close();}
});
test('immediate transactions rollback counters, audit and state together; reject async callbacks',()=>{
 const h=harness();try{seed(h.db,keys);assert.throws(()=>immediate(h.db,()=>{h.db.prepare("UPDATE counters SET next_value=999 WHERE kind='case'").run();appendAudit(h.db,{time:readClock(h.db,true),username:'off.reg1',role:'officer',event:'CLAIM',caseNo:'EG-2569-000030',fromStatus:'SUBMITTED',toStatus:'IN_REVIEW',detail:''});throw new Error('injected failure');}));assert.equal(count(h.db,'audit'),0);assert.equal((h.db.prepare("SELECT next_value FROM counters WHERE kind='case' AND year=2569").get() as {next_value:number}).next_value,31);
 assert.throws(()=>immediate(h.db,(()=>Promise.resolve()) as never),/synchronous/);
 assert.throws(()=>appendAudit(h.db,{time:readClock(h.db,true),username:'off.reg1',role:'officer',event:'CLAIM',detail:''}),/transaction/);
 immediate(h.db,()=>appendAudit(h.db,{time:readClock(h.db,true),username:'off.reg1',role:'officer',event:'STAFF_LOGIN',detail:''}));
 assert.throws(()=>h.db.prepare("UPDATE audit SET detail='modified'").run(),/append.only/i);assert.throws(()=>h.db.prepare('DELETE FROM audit').run(),/append.only/i);
 }finally{h.close();}
});
test('lifecycle alerts are idempotent, clock hooks do not trigger lifecycle; cancellation uses deadline',()=>{
 const h=harness();try{seed(h.db,keys);evaluateLifecycle(h.db,true,new Set());evaluateLifecycle(h.db,true,new Set());
 const counts=h.db.prepare('SELECT recipient,count(*) AS n FROM notifications GROUP BY recipient ORDER BY recipient').all();assert.deepEqual(counts,[{recipient:'head1',n:1},{recipient:'off.reg1',n:3},{recipient:'off.reg2',n:1}]);
 setClock(h.db,'2026-12-04T13:59:59+07:00');evaluateLifecycle(h.db,true,new Set());assert.equal((h.db.prepare("SELECT status FROM cases WHERE case_no='EG-2569-000017'").get() as {status:string}).status,'NEED_FIX');
 setClock(h.db,'2026-12-06T12:00:00+07:00');assert.equal((h.db.prepare("SELECT status FROM cases WHERE case_no='EG-2569-000017'").get() as {status:string}).status,'NEED_FIX');evaluateLifecycle(h.db,true,new Set());
 assert.deepEqual(h.db.prepare("SELECT status,closed_at FROM cases WHERE case_no='EG-2569-000017'").get(),{status:'CANCELLED',closed_at:'2026-12-04T14:00:00+07:00'});
 assert.equal((h.db.prepare("SELECT effective_at FROM timeline WHERE event='AUTO_CANCEL'").get() as {effective_at:string}).effective_at,'2026-12-04T14:00:00+07:00');assert.equal(count(h.db,'audit'),0);
 }finally{h.close();}
});
test('test hooks gate every method/path; health is exact; duplicate payment is atomic',async()=>{
 const h=harness();try{seed(h.db,keys);const ctx={db:h.db,keys,testMode:true,bugModes:new Set<string>()};
 for(const method of ['GET','POST','PUT','PATCH','DELETE']){const res=await dispatch(new Request('http://localhost/api/test/clock',{method,body:['POST','PUT','PATCH'].includes(method)?'{}':undefined}),{...ctx,testMode:false});assert.equal(res.status,404);}
 const health=await dispatch(new Request('http://localhost/api/health'),ctx);assert.deepEqual(await health.json(),{status:'ok'});assert.match(health.headers.get('cache-control')??'',/no-store/);
 for(const method of ['PUT','PATCH','DELETE'])for(const p of ['/api/audit','/api/audit/arbitrary']){const r=await dispatch(new Request('http://localhost'+p,{method}),ctx);assert.equal(r.status,405);assert.equal((await r.json()).code,'METHOD_NOT_ALLOWED');}
 const pay=()=>dispatch(new Request('http://localhost/api/test/payments/PP-0001/pay',{method:'POST',body:JSON.stringify({amount:500})}),ctx);
 const results=await Promise.all(Array.from({length:6},pay));const bodies=await Promise.all(results.map(r=>r.json()));assert.ok(results.every(r=>r.status===200));assert.equal(bodies.filter(r=>r.duplicate===false).length,1);assert.ok(bodies.every(r=>r.caseNo==='EG-2569-000031'));assert.equal(count(h.db,'cases'),31);assert.equal(count(h.db,'receipts'),31);
 const reset=await dispatch(new Request('http://localhost/api/test/reset',{method:'POST'}),ctx);assert.deepEqual(await reset.json(),{ok:true,now:'2026-12-01T09:00:00+07:00'});
 setClock(h.db,'2026-12-01T09:10:00+07:00');const expired=await pay();assert.equal(expired.status,410);assert.equal((await expired.json()).code,'QR_EXPIRED');assert.equal(count(h.db,'cases'),30);
 }finally{h.close();}
});
test('config validates absolute paths, secret separation and bug tokens without logging values',()=>{
 assert.throws(()=>openDatabase('relative.sqlite'),/absolute/);
 const env={DB_PATH:join(tmpdir(),'config.sqlite'),DATA_KEY_HEX:'11'.repeat(32),ID_LOOKUP_KEY_HEX:'22'.repeat(32),DOC_HMAC_KEY_HEX:'33'.repeat(32)};
 assert.equal(readConfig(env).testMode,false);assert.throws(()=>readConfig({...env,ID_LOOKUP_KEY_HEX:env.DATA_KEY_HEX}),/distinct/);
 assert.deepEqual([...parseBugModes(' B03, B07,B03 ')],['B03','B07']);assert.throws(()=>parseBugModes('B13'),/BUG_MODE/);
});
test('jumping clock directly to Dec 5 emits only current levels and exact source recipients',()=>{
 const h=harness();try{seed(h.db,keys);setClock(h.db,'2026-12-05T10:00:00+07:00');evaluateLifecycle(h.db,true,new Set());
 assert.deepEqual(h.db.prepare('SELECT recipient,count(*) n FROM notifications GROUP BY recipient ORDER BY recipient').all(),[{recipient:'head1',n:15},{recipient:'off.reg1',n:7},{recipient:'off.reg2',n:10},{recipient:'off.works1',n:1}]);
 assert.equal((h.db.prepare("SELECT count(*) n FROM notifications WHERE case_no='EG-2569-000024' AND level='near'").get() as {n:number}).n,0);
 }finally{h.close();}
});
