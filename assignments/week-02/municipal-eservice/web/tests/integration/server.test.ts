import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../src/server/db/connection.ts';
import { seed } from '../../src/server/db/seed.ts';
import { createCivicServer } from '../../src/server/http/server.ts';
test('HTTP boundary accepts >6MB; lifecycle includes assets/health/public paths and excludes all hooks',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'civic-http-'));const db=openDatabase(join(dir,'db.sqlite'));const keys={dataKey:Buffer.alloc(32,1),lookupKey:Buffer.alloc(32,2),documentKey:Buffer.alloc(32,3)};seed(db,keys);
 const server=createCivicServer({db,keys,testMode:true,bugModes:new Set()},(_req,res)=>{res.end('next-page-or-asset');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const addr=server.address() as {port:number},base=`http://127.0.0.1:${addr.port}`;
 const request=(path:string,init?:RequestInit)=>fetch(base+path,init);
 try{
 const reset=()=>request('/api/test/reset',{method:'POST'});await reset();assert.equal((db.prepare('SELECT count(*) n FROM notifications').get() as {n:number}).n,0);
 const large=await request('/api/test/clock',{method:'PUT',body:JSON.stringify({now:'2026-12-01T09:00:00+07:00',padding:'x'.repeat(6*1024*1024)})});assert.equal(large.status,200);assert.equal((db.prepare('SELECT count(*) n FROM notifications').get() as {n:number}).n,0);
 for(const path of ['/api/health','/illustrations/civic-illustrations.svg','/verify/K7M2Q9XA']){await reset();await request(path);assert.equal((db.prepare('SELECT count(*) n FROM notifications').get() as {n:number}).n,5);}
 await reset();await request('/api/test/clock',{method:'PUT',body:JSON.stringify({now:'2026-12-04T14:00:00+07:00'})});await request('/asset.png');assert.equal((db.prepare("SELECT closed_at FROM cases WHERE case_no='EG-2569-000017'").get() as {closed_at:string}).closed_at,'2026-12-04T14:00:00+07:00');
 const health=await request('/api/health');assert.deepEqual(await health.json(),{status:'ok'});
 }finally{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));db.close();rmSync(dir,{recursive:true,force:true});}
});
