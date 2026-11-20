import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import { readClock,holidays } from './clock.ts';
import { slaLevel } from './calendar.ts';
export function evaluateLifecycle(db:Database.Database,testMode:boolean,bugs:ReadonlySet<string>){
 const now=readClock(db,testMode);return immediate(db,()=>{
 const expired=db.prepare("SELECT case_no,fix_deadline FROM cases WHERE status='NEED_FIX' AND julianday(fix_deadline)<=julianday(?)").all(now) as {case_no:string;fix_deadline:string}[];
 for(const c of expired){db.prepare("UPDATE cases SET status='CANCELLED',closed_at=?,owner=NULL WHERE case_no=? AND status='NEED_FIX'").run(c.fix_deadline,c.case_no);db.prepare("INSERT INTO timeline(case_no,event,effective_at,from_status,to_status,note) VALUES(?,'AUTO_CANCEL',?,'NEED_FIX','CANCELLED','หมดเวลาแก้ไขแล้ว คำขอถูกยกเลิก')").run(c.case_no,c.fix_deadline);}
 const calendar=holidays(db,bugs),heads=(db.prepare("SELECT id FROM users WHERE role='head'").all() as {id:string}[]).map(r=>r.id);
 const cases=db.prepare("SELECT case_no,due_at,status,owner,first_registry_claimant,current_dept FROM cases WHERE status IN('SUBMITTED','IN_REVIEW','PENDING_APPROVAL','APPROVED')").all() as {case_no:string;due_at:string;status:string;owner:string|null;first_registry_claimant:string|null;current_dept:string}[];
 for(const c of cases){const level=slaLevel(now,c.due_at,c.status,calendar);if(level!=='near'&&level!=='overdue')continue;
 const recipients=new Set<string>();if(c.status==='PENDING_APPROVAL')heads.forEach(r=>recipients.add(r));else if(c.status==='APPROVED'){if(c.first_registry_claimant)recipients.add(c.first_registry_claimant);}else if(c.owner)recipients.add(c.owner);else for(const r of db.prepare("SELECT id FROM users WHERE role='officer' AND dept=?").all(c.current_dept) as {id:string}[])recipients.add(r.id);
 if(level==='overdue')heads.forEach(r=>recipients.add(r));
 for(const recipient of recipients)db.prepare('INSERT OR IGNORE INTO notifications(case_no,recipient,level,created_at,text) VALUES(?,?,?,?,?)').run(c.case_no,recipient,level,now,`${c.case_no} ${level==='near'?'ใกล้ครบกำหนด':'เกินกำหนด'}`);
 }
 });
}
