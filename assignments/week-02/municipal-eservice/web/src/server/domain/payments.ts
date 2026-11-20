import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import { readClock,holidays } from './clock.ts';
import { calculateDueAt,toBangkokDate } from './calendar.ts';
import { HttpError } from '../http/errors.ts';
export function pay(db:Database.Database,ref:string,amount:unknown,testMode:boolean,bugs:ReadonlySet<string>){
 return immediate(db,()=>{
 const p=db.prepare('SELECT * FROM payment_refs WHERE ref=?').get(ref) as {draft_id:string;amount:number;created_at:string;case_no:string|null}|undefined;if(!p)throw new HttpError('NOT_FOUND');
 if(typeof amount!=='number'||!Number.isInteger(amount)||amount!==p.amount)throw new HttpError('AMOUNT_MISMATCH');
 const existing=db.prepare('SELECT case_no FROM cases WHERE draft_id=?').get(p.draft_id) as {case_no:string}|undefined;if(existing)return {status:'PAID',caseNo:existing.case_no,receiptNo:existing.case_no.replace('EG-','RC-'),duplicate:true};
 const now=readClock(db,testMode),age=Date.parse(now)-Date.parse(p.created_at);if(age<0||age>900000||(age===900000&&!bugs.has('B05')))throw new HttpError('QR_EXPIRED');
 const d=db.prepare('SELECT * FROM drafts WHERE id=?').get(p.draft_id) as {applicant:string;service_id:string;qty:number|null;area_sqm:number|null;locked_fee:number;status:string};if(d.status!=='PENDING_PAYMENT')throw new HttpError('INVALID_STATE');
 const required=[['id-card','บัตรประชาชน'],...(d.service_id==='SV-02'?[['map','แผนที่ตั้ง']]:d.service_id==='SV-03'?[['plan','แบบแปลน'],['deed','โฉนด']]:[])];
 const attached=new Set((db.prepare('SELECT doc_key FROM files WHERE draft_id=?').all(p.draft_id) as {doc_key:string}[]).map(f=>f.doc_key));
 const missing=required.filter(([key])=>!attached.has(key)).map(([,name])=>name);if(missing.length)throw new HttpError('MISSING_DOCS',{missing},`ยังขาดเอกสาร: ${missing.join(', ')}`);
 const service=db.prepare('SELECT sla_days FROM services WHERE id=?').get(d.service_id) as {sla_days:number};const year=Number(toBangkokDate(now).slice(0,4))+543;
 db.prepare("INSERT OR IGNORE INTO counters(kind,year,next_value) VALUES('case',?,1)").run(year);
 const seq=(db.prepare("SELECT next_value FROM counters WHERE kind='case' AND year=?").get(year) as {next_value:number}).next_value;
 db.prepare("UPDATE counters SET next_value=next_value+1 WHERE kind='case' AND year=?").run(year);
 const caseNo=`EG-${year}-${String(seq).padStart(6,'0')}`,receiptNo=caseNo.replace('EG-','RC-'),dueAt=calculateDueAt(now,service.sla_days,holidays(db,bugs));
 db.prepare("INSERT INTO cases(case_no,draft_id,applicant,service_id,qty,area_sqm,locked_fee,paid_at,sla_days_snapshot,due_at,status,step,current_dept) VALUES(?,?,?,?,?,?,?,?,?,?,'SUBMITTED',?,'registry')").run(caseNo,p.draft_id,d.applicant,d.service_id,d.qty,d.area_sqm,p.amount,now,service.sla_days,dueAt,d.service_id==='SV-03'?1:null);
 db.prepare("UPDATE payment_refs SET status='PAID',paid_at=?,case_no=? WHERE ref=?").run(now,caseNo,ref);db.prepare("UPDATE drafts SET status='PAID' WHERE id=?").run(p.draft_id);
 db.prepare('UPDATE files SET case_no=? WHERE draft_id=?').run(caseNo,p.draft_id);db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(receiptNo,caseNo,ref,p.amount,now);
 db.prepare("INSERT INTO case_departments VALUES(?,'registry',?)").run(caseNo,now);db.prepare("INSERT INTO timeline(case_no,event,effective_at,to_status,note) VALUES(?,'PAYMENT',?,'SUBMITTED','')").run(caseNo,now);
 return {status:'PAID',caseNo,receiptNo,duplicate:false};
 });
}
