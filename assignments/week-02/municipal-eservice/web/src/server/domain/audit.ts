import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import { HttpError } from '../http/errors.ts';
import { renderAuditCsv } from '../output/csv.ts';
import { requireRole, type Principal } from '../security/policy.ts';
import { toBangkokIso } from './calendar.ts';
import { readClock } from './clock.ts';

export const AUDIT_EVENTS=['STAFF_LOGIN','CLAIM','RETURN','FORWARD','APPROVE','REJECT','ISSUE','UNMASK','EXPORT','ADMIN_CHANGE'] as const;
export interface AuditEvent{time:string;username:string;role:string;event:typeof AUDIT_EVENTS[number];caseNo?:string|null;fromStatus?:string|null;toStatus?:string|null;detail:string}
export function appendAudit(db:Database.Database,event:AuditEvent){
 if(!db.inTransaction)throw new Error('Audit must join the action transaction');
 if(!AUDIT_EVENTS.includes(event.event))throw new Error('Unknown audit event');
 return db.prepare('INSERT INTO audit(time,username,role,event,case_no,from_status,to_status,detail) VALUES(?,?,?,?,?,?,?,?)').run(event.time,event.username,event.role,event.event,event.caseNo??null,event.fromStatus??null,event.toStatus??null,event.detail).lastInsertRowid;
}

export interface AuditFilters {
  actor?: string;
  event?: string;
  from?: string;
  to?: string;
}

export interface AuditItem extends AuditEvent {
  id: number;
  caseNo: string | null;
  fromStatus: string | null;
  toStatus: string | null;
}

function bangkokMidnight(date: string): string {
  try {
    return toBangkokIso(`${date}T00:00:00+07:00`);
  } catch (error) {
    if (error instanceof RangeError) throw new HttpError('INVALID_REQUEST');
    throw error;
  }
}

function readAuditItems(db: Database.Database, filters: AuditFilters): AuditItem[] {
  const clauses: string[] = [];
  const values: string[] = [];
  if (filters.actor) {
    clauses.push('username = ?');
    values.push(filters.actor);
  }
  if (filters.event) {
    clauses.push('event = ?');
    values.push(filters.event);
  }
  // Compare instants so offsets and optional milliseconds share one ordering.
  if (filters.from) {
    clauses.push('julianday(time) >= julianday(?)');
    values.push(bangkokMidnight(filters.from));
  }
  if (filters.to) {
    clauses.push("julianday(time) < julianday(?, '+1 day')");
    values.push(bangkokMidnight(filters.to));
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const items = db.prepare<string[], AuditItem>(`
    SELECT id, time, username, role, event, case_no AS caseNo,
           from_status AS fromStatus, to_status AS toStatus, detail
    FROM audit
    ${where}
    ORDER BY julianday(time) DESC, id DESC
  `).all(...values);
  return items.map(item => ({ ...item, time: toBangkokIso(item.time) }));
}

/** Contract §6.4. Each list item includes its transition and detail. */
export function listAudit(db: Database.Database, actor: Principal | null, filters: AuditFilters = {}) {
  requireRole(actor, ['auditor']);
  const items = readAuditItems(db, filters);
  return { count: items.length, items };
}

/** Generate the filtered CSV before recording its successful export. */
export function exportAuditCsv(
  db: Database.Database,
  actor: Principal | null,
  testMode: boolean,
  filters: AuditFilters = {},
): string {
  const auditor = requireRole(actor, ['auditor']);
  return immediate(db, () => {
    const csv = renderAuditCsv(readAuditItems(db, filters));
    appendAudit(db, {
      time: readClock(db, testMode),
      username: auditor.username,
      role: auditor.role,
      event: 'EXPORT',
      detail: 'audit-csv',
    });
    return csv;
  });
}
