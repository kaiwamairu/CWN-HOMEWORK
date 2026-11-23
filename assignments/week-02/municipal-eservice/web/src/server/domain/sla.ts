/**
 * Business-day SLA facade (DECISIONS §0, §8, §18 · CONTRACT 4.2 · BUGS B03/B04).
 *
 * Pure arithmetic lives in calendar.ts so a single business-day function serves the
 * initial due date, the pause extension and the remaining-day level (B03 affects all three).
 * This module adds the DB-aware calendar, bug switches, labels and Bangkok display format.
 * It must never import payments/workflow writers: they import it.
 */
import type Database from 'better-sqlite3';
import {
  calculateDueAt,
  countBusinessDates,
  extendDueAt,
  slaLevel as levelAt,
  toBangkokDate,
  toBangkokIso,
  type SlaLevel,
} from './calendar.ts';
import { holidays, readClock } from './clock.ts';

export { addBusinessDays, countBusinessDates, isBusinessDay, toBangkokDate, toBangkokIso } from './calendar.ts';
export type { SlaLevel } from './calendar.ts';

export const SLA_CUTOFF = '16:30:00';
export const SLA_LEVELS = ['normal', 'near', 'overdue', 'paused', 'closed'] as const satisfies readonly SlaLevel[];
/** CONTRACT 4.2 exact Thai text per `data-level`. */
export const SLA_LEVEL_LABELS: Readonly<Record<SlaLevel, string>> = {
  normal: 'ปกติ',
  near: 'ใกล้ครบกำหนด',
  overdue: 'เกินกำหนด',
  paused: 'หยุดนับ',
  closed: 'ปิดแล้ว',
};
/** CONTRACT 4.1 exact Thai text per `data-status`. */
export const CASE_STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: 'ร่าง',
  PENDING_PAYMENT: 'รอชำระเงิน',
  SUBMITTED: 'ส่งคำขอแล้ว',
  IN_REVIEW: 'กำลังตรวจสอบ',
  NEED_FIX: 'รอแก้ไขเอกสาร',
  PENDING_APPROVAL: 'รออนุมัติ',
  APPROVED: 'อนุมัติ',
  COMPLETED: 'เสร็จสิ้น',
  REJECTED: 'ไม่อนุมัติ',
  CANCELLED: 'ยกเลิก',
};
/** Statuses whose SLA is still running (not closed, not paused) and therefore notify. */
export const RUNNING_STATUSES = ['SUBMITTED', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED'] as const;

export function isSlaLevel(value: unknown): value is SlaLevel {
  return typeof value === 'string' && (SLA_LEVELS as readonly string[]).includes(value);
}

/**
 * Holiday calendar for SLA work. B03 drops the configured table (weekends only) for every
 * caller at once: initial due date, pause extension and remaining days.
 */
export function slaCalendar(db: Database.Database, bugs: ReadonlySet<string>): ReadonlySet<string> {
  return holidays(db, bugs);
}

/** D0 rule + N business days at 16:30, computed once at payment (A-42: never recomputed). */
export function initialDueAt(
  db: Database.Database,
  paidAt: string,
  slaDays: number,
  bugs: ReadonlySet<string>,
): string {
  return calculateDueAt(paidAt, slaDays, slaCalendar(db, bugs));
}

/**
 * New due date when a NEED_FIX case is resubmitted: stored due + business dates in
 * (return date, resubmit date], using the holiday table at resubmission time (A-42).
 * B04 skips the pause and keeps the stored value.
 */
export function resubmissionDueAt(
  db: Database.Database,
  pause: { dueAt: string; returnedAt: string; resubmittedAt: string },
  bugs: ReadonlySet<string>,
): string {
  if (bugs.has('B04')) return pause.dueAt;
  return extendDueAt(pause.dueAt, pause.returnedAt, pause.resubmittedAt, slaCalendar(db, bugs));
}

/** Business days after today up to and including the due date; null once overdue. */
export function remainingBusinessDays(now: string, dueAt: string, calendar: ReadonlySet<string>): number | null {
  if (Date.parse(now) > Date.parse(dueAt)) return null;
  return countBusinessDates(toBangkokDate(now), toBangkokDate(dueAt), calendar);
}

/** CONTRACT 4.2 level at an explicit instant (pure). */
export function slaLevelAt(now: string, dueAt: string, status: string, calendar: ReadonlySet<string>): SlaLevel {
  return levelAt(now, dueAt, status, calendar);
}

export interface SlaView {
  now: string;
  calendar: ReadonlySet<string>;
  level(row: { due_at: string; status: string }): SlaLevel;
}

/** Read the clock and calendar once, then classify many rows (queue, approvals, detail). */
export function slaView(db: Database.Database, testMode: boolean, bugs: ReadonlySet<string>): SlaView {
  const now = readClock(db, testMode);
  const calendar = slaCalendar(db, bugs);
  return { now, calendar, level: (row) => levelAt(now, row.due_at, row.status, calendar) };
}

/** DECISIONS §18: on time ⇔ closed_at ≤ due (16:30:00 inclusive); only COMPLETED/REJECTED close. */
export function closedOnTime(status: string, closedAt: string | null, dueAt: string): boolean | null {
  if ((status !== 'COMPLETED' && status !== 'REJECTED') || !closedAt) return null;
  return Date.parse(closedAt) <= Date.parse(dueAt);
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** `2027-02-02` → `2 ก.พ. 2570` (A-04), independent of host ICU data. */
export function formatThaiDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError('Expected YYYY-MM-DD');
  return `${Number(match[3])} ${THAI_MONTHS[Number(match[2]) - 1]} ${Number(match[1]) + 543}`;
}

/** Any explicit-offset instant → Bangkok `4 ธ.ค. 2569 16:30` (A-04). */
export function formatThaiDateTime(instant: string): string {
  const local = toBangkokIso(instant);
  return `${formatThaiDate(local.slice(0, 10))} ${local.slice(11, 16)}`;
}
