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
