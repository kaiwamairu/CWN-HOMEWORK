import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import type { Context } from '../http/context.ts';
import { HttpError } from '../http/errors.ts';
import { decrypt, maskIdentity, type EncryptedValue } from '../security/crypto.ts';
import { requireRole, type Principal } from '../security/policy.ts';
import { departmentsEntered, listAttachmentsForCase, staffMayReadAttachments, type AttachmentItem } from '../security/attachment-policy.ts';
import { appendAudit } from './audit.ts';
import { toBangkokIso } from './calendar.ts';
import { readClock } from './clock.ts';
import { slaView, type SlaLevel } from './sla.ts';

type ReviewContext = Pick<Context, 'db' | 'testMode' | 'bugModes'>;
type UnmaskContext = ReviewContext & Pick<Context, 'keys'>;
type Dept = 'registry' | 'works';

export const RETURN_LIMIT = 2;
export const MIN_REASON_LENGTH = 10;
export const FIX_WINDOW_HOURS = 168;
export const MAX_TEXT_LENGTH = 1000;

interface ReviewRow {
  case_no: string;
  service_id: string;
  status: string;
  step: number | null;
  current_dept: Dept | null;
  owner: string | null;
  return_count: number;
}

/** BR-19 / A-44: length counts code points after trimming both ends. */
export function reasonLength(reason: unknown): number {
  return typeof reason === 'string' ? Array.from(reason.trim()).length : 0;
}

/** BUGS B12 is the only path that admits a third return. */
export function returnLimit(ctx: Pick<Context, 'testMode' | 'bugModes'>): number {
  return ctx.testMode && ctx.bugModes.has('B12') ? RETURN_LIMIT + 1 : RETURN_LIMIT;
}

export interface Route {
  status: 'IN_REVIEW' | 'PENDING_APPROVAL';
  step: number | null;
  dept: Dept;
}

/**
 * BR-21 fixed routing. There is no caller-chosen destination.
 * SV-02: registry → head. SV-03: registry (1) → works (2, unowned) → head (3).
 * PENDING_APPROVAL keeps the registry as the department so APPROVED returns to the
 * registry issuance queue, matching the seed rows …000011 and …000014.
 */
export function nextRoute(serviceId: string, step: number | null): Route | null {
  if (serviceId === 'SV-02') return { status: 'PENDING_APPROVAL', step: null, dept: 'registry' };
  if (serviceId === 'SV-03' && step === 1) return { status: 'IN_REVIEW', step: 2, dept: 'works' };
  if (serviceId === 'SV-03' && step === 2) return { status: 'PENDING_APPROVAL', step: 3, dept: 'registry' };
  return null;
}

function readRow(db: Database.Database, caseNo: string): ReviewRow | undefined {
  return db.prepare(`
    SELECT case_no, service_id, status, step, current_dept, owner, return_count
    FROM cases WHERE case_no = ?
  `).get(caseNo) as ReviewRow | undefined;
}

/** A-28: only the officer currently holding the case in its current department. */
function isHolder(user: Principal, row: ReviewRow): boolean {
  return user.role === 'officer' && row.owner === user.userId && !!user.dept && user.dept === row.current_dept;
}

function requireHolder(actor: Principal | null, row: ReviewRow | undefined): { user: Principal; row: ReviewRow } {
  const user = requireRole(actor, ['officer']);
  if (!row) throw new HttpError('NOT_FOUND');
  if (!isHolder(user, row)) throw new HttpError('FORBIDDEN');
  if (row.status !== 'IN_REVIEW') throw new HttpError('INVALID_STATE');
  return { user, row };
}

function optionalText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) throw new HttpError('INVALID_REQUEST');
  return value.trim();
}

function addHours(instant: string, hours: number): string {
  return toBangkokIso(Date.parse(instant) + hours * 3_600_000);
}

/** CONTRACT 6.3 return: holder-only, IN_REVIEW, limit 2 (B12: 3), trimmed reason ≥ 10. */
export function returnCase(ctx: ReviewContext, actor: Principal | null, caseNo: string, reason: unknown) {
  const { db, testMode } = ctx;
  return immediate(db, () => {
    const { user, row } = requireHolder(actor, readRow(db, caseNo));
    if (row.return_count >= returnLimit(ctx)) throw new HttpError('RETURN_LIMIT');
    if (typeof reason === 'string' && reason.length > MAX_TEXT_LENGTH) throw new HttpError('INVALID_REQUEST');
    if (reasonLength(reason) < MIN_REASON_LENGTH) throw new HttpError('REASON_TOO_SHORT');
    const text = (reason as string).trim();
    const now = readClock(db, testMode);
    const returnCount = row.return_count + 1;

    // The holder stays recorded so the citizen's resubmission restores them (DECISIONS §18).
    const updated = db.prepare(`
      UPDATE cases
      SET status = 'NEED_FIX', return_count = @returnCount, returned_at = @now,
          fix_deadline = @deadline, previous_holder = owner
      WHERE case_no = @caseNo AND status = 'IN_REVIEW' AND owner = @userId AND return_count = @before
    `).run({ returnCount, now, deadline: addHours(now, FIX_WINDOW_HOURS), caseNo, userId: user.userId, before: row.return_count });
    if (updated.changes !== 1) throw new HttpError('INVALID_STATE');

    db.prepare(`
      INSERT INTO timeline(case_no, event, actor, effective_at, from_status, to_status, note)
      VALUES (?, 'RETURN', ?, ?, 'IN_REVIEW', 'NEED_FIX', ?)
    `).run(caseNo, user.userId, now, text);
    appendAudit(db, {
      time: now, username: user.username, role: user.role, event: 'RETURN',
      caseNo, fromStatus: 'IN_REVIEW', toStatus: 'NEED_FIX', detail: text,
    });
    return { status: 'NEED_FIX' as const, returnCount };
  });
}

/** CONTRACT 6.3 forward: holder-only, automatic destination, optional note in FORWARD audit. */
export function forwardCase(ctx: ReviewContext, actor: Principal | null, caseNo: string, note: unknown) {
  const { db, testMode } = ctx;
  return immediate(db, () => {
    const { user, row } = requireHolder(actor, readRow(db, caseNo));
    const route = nextRoute(row.service_id, row.step);
    if (!route) throw new HttpError('INVALID_STATE');
    const text = optionalText(note);
    const now = readClock(db, testMode);

    const updated = db.prepare(`
      UPDATE cases
      SET status = @status, step = @step, current_dept = @dept, owner = NULL
      WHERE case_no = @caseNo AND status = 'IN_REVIEW' AND owner = @userId
    `).run({ status: route.status, step: route.step, dept: route.dept, caseNo, userId: user.userId });
    if (updated.changes !== 1) throw new HttpError('INVALID_STATE');
    if (route.status === 'IN_REVIEW') {
      db.prepare('INSERT OR IGNORE INTO case_departments(case_no, dept, entered_at) VALUES (?, ?, ?)')
        .run(caseNo, route.dept, now);
    }

    db.prepare(`
      INSERT INTO timeline(case_no, event, actor, effective_at, from_status, to_status, note)
      VALUES (?, 'FORWARD', ?, ?, 'IN_REVIEW', ?, ?)
    `).run(caseNo, user.userId, now, route.status, text);
    appendAudit(db, {
      time: now, username: user.username, role: user.role, event: 'FORWARD',
      caseNo, fromStatus: 'IN_REVIEW', toStatus: route.status, detail: text,
    });
    return route.status === 'IN_REVIEW'
      ? { status: 'IN_REVIEW' as const, step: route.step }
      : { status: 'PENDING_APPROVAL' as const };
  });
}

/**
 * CONTRACT 6.3 unmask. The UNMASK audit row is committed before the identity is decrypted
 * and returned, so a failed write never reveals the number. BUGS B11 skips only that row.
 */
export function unmaskIdentity(ctx: UnmaskContext, actor: Principal | null, caseNo: string, reason: unknown) {
  const { db, testMode, bugModes, keys } = ctx;
  const user = requireRole(actor, ['officer', 'head']);
  const identity = immediate(db, () => {
    const row = db.prepare(`
      SELECT u.id_cipher AS ciphertext, u.id_iv AS iv, u.id_tag AS tag
      FROM cases AS c JOIN users AS u ON u.id = c.applicant WHERE c.case_no = ?
    `).get(caseNo) as EncryptedValue | undefined;
    if (!row) throw new HttpError('NOT_FOUND');
    // Same need-to-know scope as attachments: current or past department, head for all.
    if (!staffMayReadAttachments(user, departmentsEntered(db, caseNo))) throw new HttpError('FORBIDDEN');
    if (typeof reason === 'string' && reason.length > MAX_TEXT_LENGTH) throw new HttpError('INVALID_REQUEST');
    if (reasonLength(reason) === 0) throw new HttpError('REASON_REQUIRED');
    if (!(testMode && bugModes.has('B11'))) {
      appendAudit(db, {
        time: readClock(db, testMode), username: user.username, role: user.role, event: 'UNMASK',
        caseNo, detail: (reason as string).trim(),
      });
    }
    return { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag };
  });
  return { idNo: decrypt(identity, keys.dataKey) };
}

/** `3100600987659` → `3-1006-00987-65-9` for the transient on-screen reveal. */
export function formatIdentity(idNo: string): string {
  return /^\d{13}$/.test(idNo)
    ? `${idNo[0]}-${idNo.slice(1, 5)}-${idNo.slice(5, 10)}-${idNo.slice(10, 12)}-${idNo[12]}`
    : idNo;
}

export const STEP_LABELS: Readonly<Record<number, string>> = {
  1: 'ขั้นตอน 1/3 · ฝ่ายทะเบียน',
  2: 'ขั้นตอน 2/3 · ฝ่ายโยธา',
  3: 'ขั้นตอน 3/3 · หัวหน้าฝ่าย',
};

export interface TimelineEntry {
  id: number;
  event: string;
  actor: string | null;
  at: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string;
}

export interface ReviewPermissions {
  claim: boolean;
  return: boolean;
  forward: boolean;
  unmask: boolean;
  files: boolean;
}

export interface OfficerCaseView {
  caseNo: string;
  serviceId: string;
  status: string;
  step: number | null;
  stepLabel: string | null;
  fee: number;
  paidAt: string;
  dueAt: string;
  closedAt: string | null;
  slaLevel: SlaLevel;
  applicantName: string;
  idMasked: string;
  owner: string | null;
  returnCount: number;
  returnLimit: number;
  timeline: TimelineEntry[];
  files: AttachmentItem[];
  can: ReviewPermissions;
}

/**
 * Masked server view for `/officer/cases/:caseNo` (officer and head only).
 * It never selects identity ciphertext, so the HTML cannot carry the full number.
 */
export function readOfficerCase(ctx: ReviewContext, actor: Principal | null, caseNo: string): OfficerCaseView | null {
  const user = requireRole(actor, ['officer', 'head']);
  const { db, testMode, bugModes } = ctx;
  return db.transaction(() => {
    const row = db.prepare(`
      SELECT c.case_no, c.service_id, c.status, c.step, c.current_dept, c.owner, c.return_count,
             c.locked_fee, c.paid_at, c.due_at, c.closed_at,
             applicant.name AS applicant_name, applicant.id_last3, holder.username AS owner_username
      FROM cases AS c
      JOIN users AS applicant ON applicant.id = c.applicant
      LEFT JOIN users AS holder ON holder.id = c.owner
      WHERE c.case_no = ?
    `).get(caseNo) as (ReviewRow & {
      locked_fee: number; paid_at: string; due_at: string; closed_at: string | null;
      applicant_name: string; id_last3: string; owner_username: string | null;
    }) | undefined;
    if (!row) return null;

    const entered = departmentsEntered(db, caseNo);
    const limit = returnLimit(ctx);
    const holder = isHolder(user, row) && row.status === 'IN_REVIEW';
    const mayReadFiles = staffMayReadAttachments(user, entered);
    const timeline = (db.prepare(`
      SELECT t.id, t.event, COALESCE(u.username, t.actor) AS actor, t.effective_at AS at,
             t.from_status AS fromStatus, t.to_status AS toStatus, t.note
      FROM timeline AS t LEFT JOIN users AS u ON u.id = t.actor
      WHERE t.case_no = ? ORDER BY julianday(t.effective_at), t.id
    `).all(caseNo) as TimelineEntry[]).map(entry => ({ ...entry, at: toBangkokIso(entry.at) }));

    return {
      caseNo: row.case_no,
      serviceId: row.service_id,
      status: row.status,
      step: row.step,
      stepLabel: row.service_id === 'SV-03' && row.step ? STEP_LABELS[row.step] ?? null : null,
      fee: row.locked_fee,
      paidAt: row.paid_at,
      dueAt: row.due_at,
      closedAt: row.status === 'COMPLETED' || row.status === 'REJECTED' ? row.closed_at : null,
      slaLevel: slaView(db, testMode, bugModes).level(row),
      applicantName: row.applicant_name,
      idMasked: maskIdentity(row.id_last3),
      owner: row.owner_username,
      returnCount: row.return_count,
      returnLimit: limit,
      timeline,
      files: mayReadFiles ? listAttachmentsForCase(db, caseNo) : [],
      can: {
        // Same rule as the B07 queue button; the API still decides WORKLOAD_LIMIT.
        claim: user.role === 'officer' && !!user.dept && user.dept === row.current_dept && row.owner === null
          && (row.status === 'SUBMITTED' || row.status === 'IN_REVIEW'),
        return: holder && row.return_count < limit,
        forward: holder && nextRoute(row.service_id, row.step) !== null,
        unmask: mayReadFiles,
        files: mayReadFiles,
      },
    };
  })();
}
