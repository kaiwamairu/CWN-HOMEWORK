import{test}from'node:test';
import assert from'node:assert/strict';
import{mkdtempSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{openDatabase}from'../../src/server/db/connection.ts';
import{seed}from'../../src/server/db/seed.ts';
import{pay}from'../../src/server/domain/payments.ts';
test('payment callback rejects incomplete files atomically after pending-file removal',()=>{
 const dir=mkdtempSync(join(tmpdir(),'civic-payment-')),db=openDatabase(join(dir,'db.sqlite')),keys={dataKey:Buffer.alloc(32,1),lookupKey:Buffer.alloc(32,2),documentKey:Buffer.alloc(32,3)};
 try{seed(db,keys);db.prepare("DELETE FROM files WHERE draft_id='DR-0002' AND doc_key='map'").run();
 assert.throws(()=>pay(db,'PP-0001',500,true,new Set()),e=>{const error=e as {code:string;message:string;extra:{missing:string[]}};assert.equal(error.code,'MISSING_DOCS');assert.equal(error.message,'ยังขาดเอกสาร: แผนที่ตั้ง');assert.deepEqual(error.extra.missing,['แผนที่ตั้ง']);return true;});
 assert.equal((db.prepare('SELECT count(*) n FROM cases').get()as{n:number}).n,30);assert.equal((db.prepare("SELECT next_value FROM counters WHERE kind='case' AND year=2569").get()as{next_value:number}).next_value,31);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
