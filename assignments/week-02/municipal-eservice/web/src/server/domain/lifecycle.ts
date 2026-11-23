/**
 * Per-request lifecycle (CONTRACT §0 rule 7 · A-30 · A-46): every HTTP request except
 * `/api/test/*` first auto-cancels expired corrections, then evaluates SLA notifications
 * against the current (possibly frozen) clock. One IMMEDIATE transaction, idempotent.
 */
import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import { readClock } from './clock.ts';
import { slaCalendar } from './sla.ts';
import { evaluateSlaNotifications } from './notifications.ts';

export const AUTO_CANCEL_NOTE = 'หมดเวลาแก้ไขแล้ว คำขอถูกยกเลิก';

/** Test hooks never trigger lifecycle work; every other path (pages, assets, APIs) does. */
export function triggersLifecycle(path: string): boolean {
  return !path.startsWith('/api/test/');
}

/** NEED_FIX past its 168-hour fix deadline → CANCELLED, closed at the deadline itself. */
export function autoCancelExpired(db: Database.Database, now: string): string[] {
  const expired = db.prepare(
    "SELECT case_no,fix_deadline FROM cases WHERE status='NEED_FIX' AND fix_deadline IS NOT NULL AND julianday(fix_deadline)<=julianday(?) ORDER BY case_no",
  ).all(now) as { case_no: string; fix_deadline: string }[];
  const cancel = db.prepare("UPDATE cases SET status='CANCELLED',closed_at=?,owner=NULL WHERE case_no=? AND status='NEED_FIX'");
  const timeline = db.prepare(
    "INSERT INTO timeline(case_no,event,effective_at,from_status,to_status,note) VALUES(?,'AUTO_CANCEL',?,'NEED_FIX','CANCELLED',?)",
  );
  const cancelled: string[] = [];
  for (const c of expired) {
    if (cancel.run(c.fix_deadline, c.case_no).changes !== 1) continue;
    timeline.run(c.case_no, c.fix_deadline, AUTO_CANCEL_NOTE);
    cancelled.push(c.case_no);
  }
  return cancelled;
}

export function evaluateLifecycle(db: Database.Database, testMode: boolean, bugs: ReadonlySet<string>) {
  const now = readClock(db, testMode);
  return immediate(db, () => {
    const cancelled = autoCancelExpired(db, now);
    const notified = evaluateSlaNotifications(db, now, slaCalendar(db, bugs));
    return { now, cancelled, notified };
  });
}
