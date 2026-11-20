import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../../src/server/db/connection.ts';
import {seed} from '../../src/server/db/seed.ts';
import {decidePage} from '../../src/server/http/page-access.ts';
import type {Principal} from '../../src/server/security/policy.ts';
test('HTML role matrix rejects before rendering; first registration and ownership retain their contracts',()=>{
 const dir=mkdtempSync(join(tmpdir(),'civic-page-')),db=openDatabase(join(dir,'db.sqlite'));
 const ctx={db,keys:{dataKey:Buffer.alloc(32,1),lookupKey:Buffer.alloc(32,2),documentKey:Buffer.alloc(32,3)},testMode:true,bugModes:new Set<string>()};
 try{seed(db,ctx.keys);
 const actor=(role:string):Principal=>({userId:role==='citizen'?'citizen-somchai':'off.reg1',username:'',name:'test',role,dept:role==='officer'?'registry':null,registrationOnly:false});
 const rules:[string,string[]][]=[['/citizen',['citizen']],['/officer/queue',['officer','head']],['/head/approvals',['head']],['/dashboard',['executive']],['/audit',['auditor']],['/admin/services',['admin']],['/admin/holidays',['admin']],['/admin/users',['admin']],['/notifications',['officer','head']]];
 for(const [path,allowed] of rules){assert.equal(decidePage(ctx,path,null).kind,'redirect');for(const role of ['citizen','officer','head','executive','auditor','admin'])assert.equal(decidePage(ctx,path,actor(role)).kind,allowed.includes(role)?'allow':'forbidden',`${path} ${role}`);}
 assert.deepEqual(decidePage(ctx,'/',null),{kind:'redirect',location:'/login'});assert.deepEqual(decidePage(ctx,'/',actor('head')),{kind:'redirect',location:'/head/approvals'});
 const mana={...actor('citizen'),userId:'citizen-mana',registrationOnly:true};assert.deepEqual(decidePage(ctx,'/citizen',mana),{kind:'redirect',location:'/register'});assert.equal(decidePage(ctx,'/register',mana).kind,'allow');assert.equal(decidePage(ctx,'/register',actor('citizen')).kind,'redirect');
 for(const path of ['/citizen/cases/EG-2569-000025','/citizen/cases/missing'])assert.equal(decidePage(ctx,path,actor('citizen')).kind,'not-found');assert.equal(decidePage(ctx,'/citizen/cases/EG-2569-000005',actor('citizen')).kind,'allow');
 assert.equal(decidePage(ctx,'/verify/K7M2Q9XA',null).kind,'allow');assert.equal(decidePage(ctx,'/verify/UNKNOWN1',null).kind,'document-not-found');assert.equal(decidePage(ctx,'/_next/static/chunk.js',null).kind,'allow');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
