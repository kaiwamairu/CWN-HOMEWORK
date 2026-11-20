import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeCase,authorizeAttachment,authorizeDraft,authorizeDocument,requireRole } from '../../src/server/security/policy.ts';
import { serializeCase,maskName } from '../../src/server/security/serializers.ts';
const c={case_no:'EG-2569-000030',applicant:'citizen-somchai',service_id:'SV-03',status:'IN_REVIEW',current_dept:'registry',step:1,locked_fee:1010,paid_at:'2026-12-01T09:00:00+07:00',due_at:'2026-12-24T16:30:00+07:00',owner:null,return_count:0,closed_at:null,fix_deadline:null};
test('resource-specific policies distinguish 401/403/404 and past vs future departments',()=>{
 const citizen={userId:'citizen-somchai',username:'',name:'สมชาย ใจดี',role:'citizen',dept:null,registrationOnly:false};
 const works={...citizen,userId:'off.works1',username:'off.works1',role:'officer',dept:'works'};
 const registry={...works,userId:'off.reg1',username:'off.reg1',dept:'registry'};
 assert.throws(()=>requireRole(null,['citizen']),e=>(e as {status:number}).status===401);
 assert.throws(()=>authorizeCase({...citizen,userId:'another'},c),e=>(e as {status:number}).status===404);
 assert.throws(()=>authorizeCase({...citizen,role:'executive'},c),e=>(e as {status:number}).status===403);
 assert.doesNotThrow(()=>authorizeCase(works,c)); // Case detail is broader than attachment scope.
 assert.throws(()=>authorizeAttachment(works,c,['registry']),e=>(e as {status:number}).status===403);
 assert.doesNotThrow(()=>authorizeAttachment(registry,c,['registry']));assert.doesNotThrow(()=>authorizeAttachment(works,c,['registry','works']));
 assert.doesNotThrow(()=>authorizeAttachment({...works,role:'head',dept:null},c,[]));
 assert.throws(()=>authorizeDraft(citizen,{applicant:'another'}),e=>(e as {status:number}).status===404);
 assert.throws(()=>authorizeCase({...citizen,registrationOnly:true},c),e=>(e as {status:number}).status===403);
 for(const role of ['executive','auditor','admin'])assert.throws(()=>authorizeDocument({...citizen,role},c),e=>(e as {status:number}).status===404);
});
test('staff serializers allowlist fields, omit raw identity/ciphertext; public names use source mask',()=>{
 const staff={userId:'off.reg1',username:'off.reg1',name:'เจ้าหน้าที่ทะเบียน 1',role:'officer',dept:'registry',registrationOnly:false};
 const applicant={name:'สมชาย ใจดี',id_last3:'456',id_cipher:Buffer.from('sensitive')};
 const output=serializeCase(staff,c,applicant,{slaLevel:'normal',idNo:'1101700123456',internalSecret:'bad'} as never);
 assert.ok('idMasked' in output);assert.equal(output.idMasked,'X-XXXX-XXXXX-45-6');for(const key of ['idNo','id_cipher','internalSecret'])assert.equal(key in output,false);
 assert.equal(maskName('สมชาย ใจดี'),'สมชาย ใ***');assert.equal(maskName('ชื่อเดียว'),'ชื่อเดียว ***');
});
