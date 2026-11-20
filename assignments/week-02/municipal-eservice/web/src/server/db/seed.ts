import type Database from 'better-sqlite3';
import { createHmac } from 'node:crypto';
import cases from './seed-cases.json' with {type:'json'};
import { encrypt,lookupIdentity,retainLast3 } from '../security/crypto.ts';
import type { Keys } from '../config.ts';
import { immediate } from './connection.ts';
import { TABLES,createSchema } from './schema.ts';
import { INITIAL_NOW } from '../domain/clock.ts';
import { simplePdf } from '../output/pdf.ts';
export function seed(db:Database.Database,keys:Keys){
 return immediate(db,()=>{
 const generation=((db.prepare('SELECT session_generation FROM runtime_control WHERE id=1').get() as {session_generation:number}|undefined)?.session_generation??0)+1;
 // Reset is the sole privileged truncate operation; triggers are restored in this transaction.
 db.exec('DROP TRIGGER IF EXISTS audit_no_delete');for(const table of TABLES)db.exec(`DELETE FROM ${table}`);db.exec('DELETE FROM sqlite_sequence');createSchema(db);
 const citizens=[['citizen-somchai','สมชาย ใจดี','1101700123456','0812345678'],['citizen-somying','สมหญิง รักไทย','3100600987659','0823456789'],['citizen-mana','มานะ ตั้งใจ','5500400111221',''],['citizen-piti','ปิติ มีสุข','1909900555015','0834567890']];
 const user=db.prepare('INSERT INTO users(id,name,role,id_lookup,id_cipher,id_iv,id_tag,id_last3,mobile_cipher,mobile_iv,mobile_tag,registered,consent_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const byName=new Map<string,string>();
 for(const [id,name,idNo,mobile] of citizens){const encrypted=encrypt(idNo,keys.dataKey),phone=mobile?encrypt(mobile,keys.dataKey):null;user.run(id,name,'citizen',lookupIdentity(idNo,keys.lookupKey),encrypted.ciphertext,encrypted.iv,encrypted.tag,retainLast3(idNo),phone?.ciphertext??null,phone?.iv??null,phone?.tag??null,mobile?1:0,mobile?'2026-10-01T09:00:00+07:00':null);byName.set(name,id);}
 const staff=[['off.reg1','เจ้าหน้าที่ทะเบียน 1','officer','registry'],['off.reg2','เจ้าหน้าที่ทะเบียน 2','officer','registry'],['off.works1','เจ้าหน้าที่โยธา 1','officer','works'],['head1','หัวหน้าฝ่าย','head',null],['exec1','ผู้บริหาร','executive',null],['audit1','ผู้ตรวจสอบภายใน','auditor',null],['admin1','ผู้ดูแลระบบ','admin',null]];
 for(const [id,name,role,dept] of staff)db.prepare('INSERT INTO users(id,username,name,role,dept,registered) VALUES(?,?,?,?,?,1)').run(id,id,name,role,dept);
 for(const row of [['SV-01','ขอหนังสือรับรอง',20,0,0,3],['SV-02','ขออนุญาตประกอบกิจการ',500,0,0,10],['SV-03','ขออนุญาตก่อสร้าง/ต่อเติมอาคาร',0,1000,10,15]])db.prepare('INSERT INTO services VALUES(?,?,?,?,?,?)').run(...row);
 for(const row of [['2026-12-07','ชดเชยวันหยุดทดสอบ (สมมติ)'],['2026-12-10','วันรัฐธรรมนูญทดสอบ (สมมติ)'],['2026-12-31','วันสิ้นปีทดสอบ (สมมติ)'],['2027-01-01','วันขึ้นปีใหม่ทดสอบ (สมมติ)']])db.prepare('INSERT INTO holidays VALUES(?,?)').run(...row);
 db.prepare("INSERT INTO drafts VALUES('DR-0001','citizen-somchai','SV-01',2,NULL,'DRAFT',40,NULL),('DR-0002','citizen-somchai','SV-02',NULL,NULL,'PENDING_PAYMENT',500,500)").run();
 const insertCase=db.prepare('INSERT INTO cases(case_no,applicant,service_id,qty,area_sqm,locked_fee,paid_at,sla_days_snapshot,due_at,status,step,current_dept,owner,first_registry_claimant,previous_holder,return_count,returned_at,fix_deadline,approved_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const pdf=simplePdf('Municipal e-Service seed attachment');
 const addFile=(id:string,draft:string|null,caseNo:string|null,key:string)=>db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?,?)').run(id,draft,caseNo,key,`${key}.pdf`,'application/pdf',pdf,pdf.length);
 for(const c of cases){
 const suffix=Number(c.caseNo.slice(-6)),works=suffix===10,head=c.status==='PENDING_APPROVAL';
 const holder=c.holderText.includes('off.reg2')?'off.reg2':c.holderText.includes('off.reg1')?'off.reg1':head?'head1':null;
 const first=holder==='off.reg2'?'off.reg2':([5,10,11,14,17,19,20,22,23].includes(suffix)?'off.reg1':null);
 const returned=suffix===17?'2026-11-27T14:00:00+07:00':suffix===23?'2026-11-30T14:00:00+07:00':null;
 insertCase.run(c.caseNo,byName.get(c.applicant),c.serviceId,c.quantity,c.areaSqm,c.fee,c.paidAt,c.serviceId==='SV-01'?3:c.serviceId==='SV-02'?10:15,c.dueAt,c.status,c.serviceId==='SV-03'?(works?2:head||c.status==='COMPLETED'?3:1):null,works?'works':'registry',c.status==='APPROVED'?null:holder,first,[17,23].includes(suffix)?'off.reg1':null,[17,23].includes(suffix)?2:0,returned,suffix===17?'2026-12-04T14:00:00+07:00':null,suffix===19?'head1':suffix===5?'off.reg1':null,c.closedAt);
 db.prepare('INSERT INTO case_departments VALUES(?,?,?)').run(c.caseNo,'registry',c.paidAt);if(c.serviceId==='SV-03'&&(works||head||c.status==='COMPLETED'))db.prepare('INSERT INTO case_departments VALUES(?,?,?)').run(c.caseNo,'works',c.paidAt);
 db.prepare('INSERT INTO timeline(case_no,event,effective_at,to_status,note) VALUES(?,?,?,?,?)').run(c.caseNo,'PAYMENT',c.paidAt,'SUBMITTED','');
 if(c.closedAt)db.prepare('INSERT INTO timeline(case_no,event,effective_at,from_status,to_status,note) VALUES(?,?,?,?,?,?)').run(c.caseNo,c.status,c.closedAt,'IN_REVIEW',c.status,'');
 if(suffix===19)db.prepare("INSERT INTO timeline(case_no,event,actor,effective_at,from_status,to_status,note) VALUES(?,'APPROVE','head1','2026-11-30T15:00:00+07:00','PENDING_APPROVAL','APPROVED','')").run(c.caseNo);
 db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(c.caseNo.replace('EG-','RC-'),c.caseNo,null,c.fee,c.paidAt);
 for(const key of ['id-card',...(c.serviceId==='SV-02'?['map']:c.serviceId==='SV-03'?['plan','deed']:[])])addFile(`${c.caseNo}-${key}`,null,c.caseNo,key);
 }
 const history=[['000017','2026-11-24T11:00:00+07:00','2026-11-25T10:00:00+07:00','ภาพบัตรประชาชนไม่ชัด กรุณาถ่ายใหม่'],['000017','2026-11-27T14:00:00+07:00',null,'ชื่อในเอกสารไม่ตรงกับบัตร กรุณาแก้ไข'],['000023','2026-11-27T10:00:00+07:00','2026-11-30T10:00:00+07:00','ภาพเอกสารเบลอ อ่านเลขไม่ได้'],['000023','2026-11-30T14:00:00+07:00','2026-12-01T08:30:00+07:00','ข้อมูลในแบบฟอร์มไม่ครบถ้วน']];
 for(const [suffix,returned,resubmitted,note] of history){db.prepare("INSERT INTO timeline(case_no,event,actor,effective_at,from_status,to_status,note) VALUES(?,'RETURN','off.reg1',?,'IN_REVIEW','NEED_FIX',?)").run(`EG-2569-${suffix}`,returned,note);if(resubmitted)db.prepare("INSERT INTO timeline(case_no,event,effective_at,from_status,to_status,note) VALUES(?,'RESUBMIT',?,'NEED_FIX','IN_REVIEW','')").run(`EG-2569-${suffix}`,resubmitted);}
 addFile('DR-0002-id-card','DR-0002',null,'id-card');addFile('DR-0002-map','DR-0002',null,'map');
 db.prepare("INSERT INTO payment_refs VALUES('PP-0001','DR-0002',500,'2026-12-01T08:55:00+07:00','2026-12-01T09:10:00+07:00',NULL,NULL,'PENDING')").run();
 for(const row of [['case',2569,31],['document',2569,2],['draft',0,3],['payment',0,2]])db.prepare('INSERT INTO counters VALUES(?,?,?)').run(...row);
 const fields=['DOC-2569-000001','EG-2569-000005','สมชาย ใจดี','SV-01','2026-11-05T10:00:00+07:00','2027-02-02','เจ้าหน้าที่ทะเบียน 1'];
 const signature=createHmac('sha256',keys.documentKey).update(fields.join('|')).digest('hex');
 db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(fields[0],fields[1],'K7M2Q9XA',...fields.slice(2),'off.reg1',signature,simplePdf('DOC-2569-000001'));
 db.prepare('INSERT INTO runtime_control VALUES(1,?,?,1,1)').run(INITIAL_NOW,generation);
 return {ok:true,now:INITIAL_NOW};
 });
}
