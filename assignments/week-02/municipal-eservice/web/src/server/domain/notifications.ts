/**
 * Routed SLA notifications (DECISIONS §8 + §18 "ผู้รับแจ้งเตือน" · TEST-DATA §8 · CONTRACT 2.12, 6.3).
 * Only the current level is evaluated (no back-filled `near` when a case is already overdue),
 * and UNIQUE(case_no,recipient,level) makes every (case, level, person) appear once.
 */
import type Database from 'better-sqlite3';
import { RUNNING_STATUSES, SLA_LEVEL_LABELS, slaLevelAt } from './sla.ts';

export type NotificationLevel = 'near' | 'overdue';
export interface NotificationItem {
  id: number;
  caseNo: string;
  level: NotificationLevel;
  text: string;
  createdAt: string;
}
export interface RoutedCase {
  case_no: string;
  status: string;
  owner: string | null;
  first_registry_claimant: string | null;
  current_dept: string | null;
}

/** CONTRACT 2.12 exact text, e.g. `คำขอ EG-2569-000024 ใกล้ครบกำหนด`. */
export function notificationText(caseNo: string, level: NotificationLevel): string {
  return `คำขอ ${caseNo} ${SLA_LEVEL_LABELS[level]}`;
}

function heads(db: Database.Database): string[] {
  return (db.prepare("SELECT id FROM users WHERE role='head' ORDER BY id").all() as { id: string }[]).map((r) => r.id);
}

function departmentOfficers(db: Database.Database, dept: string | null): string[] {
  if (!dept) return [];
  return (db.prepare("SELECT id FROM users WHERE role='officer' AND dept=? ORDER BY id").all(dept) as { id: string }[])
    .map((r) => r.id);
}

/**
 * Recipients for one case at one level:
 * PENDING_APPROVAL → head · APPROVED → issuing registry officer (A-27) · otherwise holder,
 * or every officer of the current department when unclaimed · overdue adds head (deduplicated).
 */
export function notificationRecipients(db: Database.Database, row: RoutedCase, level: NotificationLevel): string[] {
  const recipients = new Set<string>();
  if (row.status === 'PENDING_APPROVAL') {
    heads(db).forEach((id) => recipients.add(id));
  } else if (row.status === 'APPROVED') {
    const issuer = row.first_registry_claimant ?? row.owner;
    if (issuer) recipients.add(issuer);
    else departmentOfficers(db, 'registry').forEach((id) => recipients.add(id));
  } else if (row.owner) {
    recipients.add(row.owner);
  } else {
    departmentOfficers(db, row.current_dept).forEach((id) => recipients.add(id));
  }
  if (level === 'overdue') heads(db).forEach((id) => recipients.add(id));
  return [...recipients];
}

/**
 * Insert notifications for the current level of every running case. Call inside the
 * lifecycle transaction. Returns the number of newly created rows.
 */
export function evaluateSlaNotifications(db: Database.Database, now: string, calendar: ReadonlySet<string>): number {
  const placeholders = RUNNING_STATUSES.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT case_no,due_at,status,owner,first_registry_claimant,current_dept FROM cases WHERE status IN(${placeholders}) ORDER BY due_at,case_no`,
  ).all(...RUNNING_STATUSES) as (RoutedCase & { due_at: string })[];
  const insert = db.prepare('INSERT OR IGNORE INTO notifications(case_no,recipient,level,created_at,text) VALUES(?,?,?,?,?)');
  let created = 0;
  for (const row of rows) {
    const level = slaLevelAt(now, row.due_at, row.status, calendar);
    if (level !== 'near' && level !== 'overdue') continue;
    for (const recipient of notificationRecipients(db, row, level)) {
      created += insert.run(row.case_no, recipient, level, now, notificationText(row.case_no, level)).changes;
    }
  }
  return created;
}

/** A user's own notifications, newest first (CONTRACT 6.3 item shape). */
export function listNotifications(db: Database.Database, userId: string): NotificationItem[] {
  return db.prepare(
    'SELECT id,case_no AS caseNo,level,text,created_at AS createdAt FROM notifications WHERE recipient=? ORDER BY created_at DESC,id DESC',
  ).all(userId) as NotificationItem[];
}

/** `bell-count`: total notifications of the user. */
export function countNotifications(db: Database.Database, userId: string): number {
  return (db.prepare('SELECT count(*) AS n FROM notifications WHERE recipient=?').get(userId) as { n: number }).n;
}
