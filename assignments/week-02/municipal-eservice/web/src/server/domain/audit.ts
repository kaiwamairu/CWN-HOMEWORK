import type Database from 'better-sqlite3';
export const AUDIT_EVENTS=['STAFF_LOGIN','CLAIM','RETURN','FORWARD','APPROVE','REJECT','ISSUE','UNMASK','EXPORT','ADMIN_CHANGE'] as const;
export interface AuditEvent{time:string;username:string;role:string;event:typeof AUDIT_EVENTS[number];caseNo?:string|null;fromStatus?:string|null;toStatus?:string|null;detail:string}
export function appendAudit(db:Database.Database,event:AuditEvent){
 if(!db.inTransaction)throw new Error('Audit must join the action transaction');
 if(!AUDIT_EVENTS.includes(event.event))throw new Error('Unknown audit event');
 return db.prepare('INSERT INTO audit(time,username,role,event,case_no,from_status,to_status,detail) VALUES(?,?,?,?,?,?,?,?)').run(event.time,event.username,event.role,event.event,event.caseNo??null,event.fromStatus??null,event.toStatus??null,event.detail).lastInsertRowid;
}
