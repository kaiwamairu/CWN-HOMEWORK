import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../../src/server/db/connection.ts';
import {seed} from '../../src/server/db/seed.ts';
import {tokenDigest,SESSION_COOKIE,readSession} from '../../src/server/security/session.ts';
import {dispatch} from '../../src/server/http/router.ts';
import {setClock} from '../../src/server/domain/clock.ts';
test('stored login snapshots persist role/dept changes; reset revokes every old cookie',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'civic-reset-')),db=openDatabase(join(dir,'db.sqlite')),keys={dataKey:Buffer.alloc(32,1),lookupKey:Buffer.alloc(32,2),documentKey:Buffer.alloc(32,3)};
 try{seed(db,keys);const ctx={db,keys,testMode:true,bugModes:new Set<string>()};
 const add=(token:string,user:string,role:string,dept:string|null)=>db.prepare('INSERT INTO sessions VALUES(?,?,?,?,0,(SELECT session_generation FROM runtime_control))').run(tokenDigest(token),user,role,dept);
 const tokens=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64),'d'.repeat(64)];add(tokens[0],'off.reg2','officer','registry');add(tokens[1],'citizen-somchai','citizen',null);add(tokens[2],'off.works1','officer','works');add(tokens[3],'exec1','executive',null);
 const request=(path:string,index:number,method='GET')=>new Request('http://localhost'+path,{method,headers:{cookie:`${SESSION_COOKIE}=${tokens[index]}`}});
 db.prepare("UPDATE users SET role='auditor',dept=NULL WHERE id='off.reg2'").run();assert.equal(readSession(request('/api/me',0),db)?.role,'officer');assert.equal(readSession(request('/api/me',0),db)?.dept,'registry');
 assert.equal((await dispatch(request('/api/cases/EG-2569-000025',1),ctx)).status,404);assert.equal((await dispatch(request('/api/cases/EG-2569-000025',3),ctx)).status,403);
 const detail=await dispatch(request('/api/cases/EG-2569-000025',0),ctx);assert.equal(detail.status,200);const body=await detail.json();assert.equal(body.idMasked,'X-XXXX-XXXXX-65-9');assert.equal('idNo' in body,false);
 const own=await dispatch(request('/api/cases/EG-2569-000005',1),ctx);assert.equal((await own.json()).idNo,'1101700123456');
 assert.equal((await dispatch(request('/api/cases/EG-2569-000025/files',2),ctx)).status,403);assert.equal((await dispatch(request('/api/cases/EG-2569-000010/files',2),ctx)).status,200);
 await dispatch(new Request('http://localhost/api/test/reset',{method:'POST'}),ctx);for(let i=0;i<tokens.length;i++)assert.equal((await dispatch(request('/api/me',i),ctx)).status,401);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('seed document signature is real; tampering beats expiry; hooks do not modify audit',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'civic-doc-')),db=openDatabase(join(dir,'db.sqlite')),keys={dataKey:Buffer.alloc(32,1),lookupKey:Buffer.alloc(32,2),documentKey:Buffer.alloc(32,3)};
 try{seed(db,keys);const ctx={db,keys,testMode:true,bugModes:new Set<string>()};const verify=()=>dispatch(new Request('http://localhost/api/verify/K7M2Q9XA'),ctx);
 assert.equal((await (await verify()).json()).result,'VALID');setClock(db,'2027-02-02T23:59:59+07:00');assert.equal((await (await verify()).json()).result,'VALID');setClock(db,'2027-02-03T00:00:00+07:00');assert.equal((await (await verify()).json()).result,'EXPIRED');
 const tamper=await dispatch(new Request('http://localhost/api/test/documents/DOC-2569-000001/tamper',{method:'POST'}),ctx);assert.deepEqual(await tamper.json(),{ok:true});assert.deepEqual(await (await verify()).json(),{result:'TAMPERED'});
 assert.equal((db.prepare('SELECT count(*) n FROM audit').get() as {n:number}).n,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
