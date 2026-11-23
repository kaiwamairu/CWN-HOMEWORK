/**
 * Citizen case tracking, cancellation and correction (T034 · T035 · T036).
 *
 * Sources: CONTRACT §1, §2.4–2.6, §5, §6.2, §6.7 · REQUIREMENTS FR-09..FR-11, BR-13, BR-20, BR-22 ·
 * DECISIONS §8 and §18 · TEST-PLAN SUBMIT-01/03, WORKFLOW-06, SLA-02, QUEUE-03, RBAC-01 · BUGS B04/B06.
 *
 * - Foreign and missing cases raise the same `NOT_FOUND`, so the response never reveals that a number exists.
 * - Cancellation and claim (B07) both use conditional writes inside IMMEDIATE transactions, so exactly one wins.
 * - Correction restores the previous holder without a workload check (the cap applies only at claim time).
 * - B06 widens only the citizen read scope (detail API and page). Cancel, resubmit, files and PDFs keep owner checks.
 * - B04 lives in `resubmissionDueAt` (B09) and skips only the pause extension.
 */
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import type { Context } from '../http/context.ts';
import { HttpError } from '../http/errors.ts';
import { decrypt, maskIdentity } from '../security/crypto.ts';
import { requireRole, type Principal } from '../security/policy.ts';
import { readClock } from './clock.ts';
import type { ServiceFeeRates, ServiceId } from './fees.ts';
import { getDraft, type DraftDetail } from './drafts.ts';
import { autoCancelExpired } from './lifecycle.ts';
import { getLatestDraftPayment } from './payments.ts';
import { resubmissionDueAt, slaView, type SlaLevel } from './sla.ts';
import { MAX_DRAFT_FILES, UPLOAD_SLOTS, validateUpload, type UploadFile, type UploadSlot } from './uploads.ts';

type CasesContext = Pick<Context, 'db' | 'testMode' | 'bugModes'>;
type KeyedContext = CasesContext & Pick<Context, 'keys'>;

const NO_BUGS: ReadonlySet<string> = new Set();
const CLOSED_STATUSES = new Set(['COMPLETED', 'REJECTED', 'CANCELLED']);
export const SERVICE_IDS = ['SV-01', 'SV-02', 'SV-03'] as const satisfies readonly ServiceId[];
export const NO_REFUND_TEXT = 'ค่าธรรมเนียมที่ชำระแล้วไม่คืน';
export const MAX_FILE_NAME_LENGTH = 200;

/** CONTRACT §2.6 `case-step` text, SV-03 only (A-40). */
export const STEP_LABELS: Readonly<Record<number, string>> = {
  1: 'ขั้นตอน 1/3 · ฝ่ายทะเบียน',
  2: 'ขั้นตอน 2/3 · ฝ่ายโยธา',
  3: 'ขั้นตอน 3/3 · หัวหน้าฝ่าย',
};

function bugsOf(ctx: CasesContext): ReadonlySet<string> {
  return ctx.testMode ? ctx.bugModes : NO_BUGS;
}

/** BUGS B06: a citizen may read another citizen's case through the URL or detail API. Nothing else changes. */
function readScopeBypass(ctx: CasesContext): boolean {
  return bugsOf(ctx).has('B06');
}

export function isServiceId(value: unknown): value is ServiceId {
  return typeof value === 'string' && (SERVICE_IDS as readonly string[]).includes(value);
}

/** `3100600987659` → `3-1006-00987-65-9` (CONTRACT §2.6 `case-id-full`). */
export function formatIdentity(idNo: string): string {
  return /^\d{13}$/.test(idNo)
    ? `${idNo[0]}-${idNo.slice(1, 5)}-${idNo.slice(5, 10)}-${idNo.slice(10, 12)}-${idNo[12]}`
    : idNo;
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

interface CaseRecord {
  case_no: string;
  applicant: string;
  service_id: ServiceId;
  status: string;
  step: number | null;
  locked_fee: number;
  paid_at: string;
  due_at: string;
  owner_username: string | null;
  return_count: number;
  closed_at: string | null;
  fix_deadline: string | null;
  applicant_name: string;
  id_last3: string;
  id_cipher: Buffer;
  id_iv: Buffer;
  id_tag: Buffer;
  doc_no: string | null;
  verify_code: string | null;
}

function readCaseRecord(db: Database.Database, caseNo: string): CaseRecord | undefined {
  return db.prepare<[string], CaseRecord>(`
    SELECT c.case_no, c.applicant, c.service_id, c.status, c.step, c.locked_fee, c.paid_at, c.due_at,
           holder.username AS owner_username, c.return_count, c.closed_at, c.fix_deadline,
           applicant.name AS applicant_name, applicant.id_last3, applicant.id_cipher, applicant.id_iv, applicant.id_tag,
           doc.doc_no, doc.verify_code
    FROM cases AS c
    JOIN users AS applicant ON applicant.id = c.applicant
    LEFT JOIN users AS holder ON holder.id = c.owner
    LEFT JOIN documents AS doc ON doc.case_no = c.case_no
    WHERE c.case_no = ?
  `).get(caseNo);
}

/**
 * The single visibility rule for case reads. Missing and foreign numbers both raise NOT_FOUND.
 * Officers and heads keep the existing T001–T020 read scope (masked JSON only).
 */
function visibleCase(ctx: CasesContext, actor: Principal | null, caseNo: string): { user: Principal; row: CaseRecord; own: boolean } {
  const user = requireRole(actor, ['citizen', 'officer', 'head']);
  const row = readCaseRecord(ctx.db, caseNo);
  if (!row) throw new HttpError('NOT_FOUND');
  const own = user.role === 'citizen' && row.applicant === user.userId;
  if (user.role === 'citizen' && !own && !readScopeBypass(ctx)) throw new HttpError('NOT_FOUND');
  return { user, row, own };
}

/** For page access (B14 `decidePage`): same rule as the detail API, including B06. */
export function citizenCaseVisible(ctx: CasesContext, actor: Principal | null, caseNo: string): boolean {
  if (!actor || actor.role !== 'citizen' || actor.registrationOnly) return false;
  try {
    visibleCase(ctx, actor, caseNo);
    return true;
  } catch (error) {
    if (error instanceof HttpError) return false;
    throw error;
  }
}

export interface CaseListItem {
  caseNo: string;
  serviceId: ServiceId;
  status: string;
  dueAt: string;
  slaLevel: SlaLevel;
}

/** `GET /api/cases`: the citizen's numbered cases only, case number descending (CONTRACT §2.4, §6.2). */
export function listOwnCases(ctx: CasesContext, actor: Principal | null): CaseListItem[] {
  const citizen = requireRole(actor, ['citizen']);
  return ctx.db.transaction(() => {
    const sla = slaView(ctx.db, ctx.testMode, bugsOf(ctx));
    const rows = ctx.db.prepare<[string], { case_no: string; service_id: ServiceId; status: string; due_at: string }>(`
      SELECT case_no, service_id, status, due_at FROM cases WHERE applicant = ? ORDER BY case_no DESC
    `).all(citizen.userId);
    return rows.map(row => ({
      caseNo: row.case_no,
      serviceId: row.service_id,
      status: row.status,
      dueAt: row.due_at,
      slaLevel: sla.level(row),
    }));
  })();
}

export interface CaseDetailJson {
  caseNo: string;
  serviceId: ServiceId;
  status: string;
  step: number | null;
  fee: number;
  paidAt: string;
  dueAt: string;
  slaLevel: SlaLevel;
  owner: string | null;
  returnCount: number;
  closedAt: string | null;
  applicantName: string;
  idNo?: string;
  idMasked?: string;
  fixDeadline: string | null;
  docNo: string | null;
  verifyCode: string | null;
}

function serialize(ctx: KeyedContext, row: CaseRecord, own: boolean, level: SlaLevel): CaseDetailJson {
  // Only the owning citizen receives the full number; staff and B06 foreign reads stay masked.
  const identity = own
    ? { idNo: decrypt({ ciphertext: row.id_cipher, iv: row.id_iv, tag: row.id_tag }, ctx.keys.dataKey) }
    : { idMasked: maskIdentity(row.id_last3) };
  return {
    caseNo: row.case_no,
    serviceId: row.service_id,
    status: row.status,
    step: row.step,
    fee: row.locked_fee,
    paidAt: row.paid_at,
    dueAt: row.due_at,
    slaLevel: level,
    owner: row.owner_username,
    returnCount: row.return_count,
    closedAt: row.closed_at,
    applicantName: row.applicant_name,
    ...identity,
    fixDeadline: row.status === 'NEED_FIX' ? row.fix_deadline : null,
    docNo: row.doc_no,
    verifyCode: row.verify_code,
  };
}

/** `GET /api/cases/:caseNo` in the CONTRACT §6.7 shape for the owning citizen, officers and heads. */
export function readCaseDetail(ctx: KeyedContext, actor: Principal | null, caseNo: string): CaseDetailJson {
  return ctx.db.transaction(() => {
    const { row, own } = visibleCase(ctx, actor, caseNo);
    return serialize(ctx, row, own, slaView(ctx.db, ctx.testMode, bugsOf(ctx)).level(row));
  })();
}

export interface TimelineEntry {
  id: number;
  event: string;
  at: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string;
  /** Staff display name, or null for citizen and system events. */
  actorName: string | null;
}

function readTimeline(db: Database.Database, caseNo: string): TimelineEntry[] {
  return db.prepare<[string], TimelineEntry>(`
    SELECT t.id, t.event, t.effective_at AS at, t.from_status AS fromStatus, t.to_status AS toStatus, t.note,
           CASE WHEN u.role IN ('officer', 'head') THEN u.name END AS actorName
    FROM timeline AS t
    LEFT JOIN users AS u ON u.id = t.actor
    WHERE t.case_no = ?
    ORDER BY julianday(t.effective_at), t.id
  `).all(caseNo);
}

export interface CitizenCaseView {
  detail: CaseDetailJson;
  own: boolean;
  now: string;
  stepLabel: string | null;
  idFull: string | null;
  timeline: TimelineEntry[];
  files: UploadFile[];
  returnReason: string | null;
  can: { cancel: boolean; resubmit: boolean };
}

/**
 * Everything `/citizen/cases/:caseNo` renders. Returns null for a missing or foreign case so the
 * page renders the shared 404. Actions are only offered on the citizen's own case.
 */
export function readCitizenCaseView(ctx: KeyedContext, actor: Principal | null, caseNo: string): CitizenCaseView | null {
  const citizen = requireRole(actor, ['citizen']);
  return ctx.db.transaction(() => {
    let visible: ReturnType<typeof visibleCase>;
    try {
      visible = visibleCase(ctx, citizen, caseNo);
    } catch (error) {
      if (error instanceof HttpError && error.code === 'NOT_FOUND') return null;
      throw error;
    }
    const { row, own } = visible;
    const sla = slaView(ctx.db, ctx.testMode, bugsOf(ctx));
    const detail = serialize(ctx, row, own, sla.level(row));
    const timeline = readTimeline(ctx.db, row.case_no);
    const lastReturn = [...timeline].reverse().find(entry => entry.event === 'RETURN');
    const files = ctx.db.prepare<[string], UploadFile>(`
      SELECT id AS fileId, name, doc_key AS docKey, size FROM files WHERE case_no = ? ORDER BY rowid
    `).all(row.case_no);
    const resubmitOpen = row.status === 'NEED_FIX' && !!row.fix_deadline && Date.parse(sla.now) < Date.parse(row.fix_deadline);
    return {
      detail,
      own,
      now: sla.now,
      stepLabel: row.service_id === 'SV-03' && row.step ? STEP_LABELS[row.step] ?? null : null,
      idFull: detail.idNo ? formatIdentity(detail.idNo) : null,
      timeline,
      files,
      returnReason: row.status === 'NEED_FIX' ? lastReturn?.note ?? null : null,
      can: {
        cancel: own && row.status === 'SUBMITTED' && row.owner_username === null,
        resubmit: own && resubmitOpen,
      },
    };
  })();
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

interface CommandRow {
  applicant: string;
  status: string;
  owner: string | null;
  due_at: string;
  returned_at: string | null;
  fix_deadline: string | null;
}

/** Owner check shared by cancel and resubmit. B06 does not apply: foreign and missing both raise 404. */
function ownedCommandRow(db: Database.Database, citizen: Principal, caseNo: string): CommandRow {
  const row = db.prepare<[string], CommandRow>(`
    SELECT applicant, status, owner, due_at, returned_at, fix_deadline FROM cases WHERE case_no = ?
  `).get(caseNo);
  if (!row || row.applicant !== citizen.userId) throw new HttpError('NOT_FOUND');
  return row;
}

/** Cheap pre-check so a multipart body is read only for the owning citizen. */
export function assertOwnCase(ctx: CasesContext, actor: Principal | null, caseNo: string): void {
  ownedCommandRow(ctx.db, requireRole(actor, ['citizen']), caseNo);
}

/**
 * `POST /api/cases/:caseNo/cancel` (FR-10, BR-22, A-47). Only an unowned SUBMITTED case may be cancelled.
 * The conditional UPDATE and B07's conditional claim run in IMMEDIATE transactions, so a concurrent
 * cancel and claim produce exactly one success: the loser sees CANNOT_CANCEL or INVALID_STATE.
 */
export function cancelCase(ctx: CasesContext, actor: Principal | null, caseNo: string) {
  const citizen = requireRole(actor, ['citizen']);
  const { db } = ctx;
  return immediate(db, () => {
    const row = ownedCommandRow(db, citizen, caseNo);
    if (CLOSED_STATUSES.has(row.status)) throw new HttpError('INVALID_STATE');
    if (row.status !== 'SUBMITTED' || row.owner !== null) throw new HttpError('CANNOT_CANCEL');

    const now = readClock(db, ctx.testMode);
    const updated = db.prepare(`
      UPDATE cases SET status = 'CANCELLED', closed_at = ?, owner = NULL
      WHERE case_no = ? AND applicant = ? AND status = 'SUBMITTED' AND owner IS NULL
    `).run(now, caseNo, citizen.userId);
    if (updated.changes !== 1) throw new HttpError('CANNOT_CANCEL');

    db.prepare(`
      INSERT INTO timeline (case_no, event, actor, effective_at, from_status, to_status, note)
      VALUES (?, 'CANCEL', ?, ?, 'SUBMITTED', 'CANCELLED', ?)
    `).run(caseNo, citizen.userId, now, NO_REFUND_TEXT);
    return { status: 'CANCELLED' as const };
  });
}

export interface CorrectionFile {
  name: string;
  bytes: Uint8Array;
}

function safeFileName(name: string): string {
  const trimmed = Array.from(name.replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim()).slice(0, MAX_FILE_NAME_LENGTH).join('');
  return trimmed || 'เอกสารเพิ่มเติม';
}

function wasAutoCancelled(db: Database.Database, caseNo: string): boolean {
  return !!db.prepare("SELECT 1 FROM timeline WHERE case_no = ? AND event = 'AUTO_CANCEL' LIMIT 1").get(caseNo);
}

/**
 * `POST /api/cases/:caseNo/resubmit` (FR-11, BR-13, BR-20, A-46).
 * - Allowed while now < fixDeadline (167:59 succeeds, 168:00 is expired).
 * - The expired path commits the automatic cancellation before returning FIX_WINDOW_EXPIRED.
 * - The previous holder is restored even above ten owned cases (TC-QUEUE-03 step 9).
 * - dueAt = stored due + business dates in (return date, resubmit date] with the current holidays (B04 skips it).
 */
export function resubmitCase(ctx: CasesContext, actor: Principal | null, caseNo: string, files: readonly CorrectionFile[] = []) {
  const citizen = requireRole(actor, ['citizen']);
  const { db } = ctx;
  const bugs = bugsOf(ctx);
  const outcome = immediate(db, () => {
    const row = ownedCommandRow(db, citizen, caseNo);
    const now = readClock(db, ctx.testMode);

    if (row.status === 'NEED_FIX' && row.fix_deadline && Date.parse(now) >= Date.parse(row.fix_deadline)) {
      autoCancelExpired(db, now);
      return { expired: true as const };
    }
    if (row.status !== 'NEED_FIX') {
      if (row.status === 'CANCELLED' && wasAutoCancelled(db, caseNo)) throw new HttpError('FIX_WINDOW_EXPIRED');
      throw new HttpError('INVALID_STATE');
    }

    const accepted = files.map(file => ({ name: safeFileName(file.name), bytes: file.bytes, mime: validateUpload(file.bytes, 'extra', bugs) }));
    if (accepted.length) {
      const { count } = db.prepare<[string], { count: number }>('SELECT COUNT(*) AS count FROM files WHERE case_no = ?').get(caseNo)!;
      if (count + accepted.length > MAX_DRAFT_FILES) throw new HttpError('FILE_COUNT');
    }

    const dueAt = resubmissionDueAt(db, { dueAt: row.due_at, returnedAt: row.returned_at ?? now, resubmittedAt: now }, bugs);
    const updated = db.prepare(`
      UPDATE cases
      SET status = 'IN_REVIEW', owner = COALESCE(previous_holder, owner), previous_holder = NULL,
          fix_deadline = NULL, due_at = ?
      WHERE case_no = ? AND applicant = ? AND status = 'NEED_FIX'
    `).run(dueAt, caseNo, citizen.userId);
    if (updated.changes !== 1) throw new HttpError('INVALID_STATE');

    const insertFile = db.prepare(`
      INSERT INTO files (id, draft_id, case_no, doc_key, name, mime, bytes, size)
      VALUES (?, NULL, ?, 'extra', ?, ?, ?, ?)
    `);
    for (const file of accepted) {
      insertFile.run(`F-${randomUUID()}`, caseNo, file.name, file.mime, Buffer.from(file.bytes), file.bytes.byteLength);
    }
    db.prepare(`
      INSERT INTO timeline (case_no, event, actor, effective_at, from_status, to_status, note)
      VALUES (?, 'RESUBMIT', ?, ?, 'NEED_FIX', 'IN_REVIEW', ?)
    `).run(caseNo, citizen.userId, now, accepted.length ? `แนบไฟล์ใหม่ ${accepted.length} ไฟล์` : '');
    return { expired: false as const, dueAt };
  });
  if (outcome.expired) throw new HttpError('FIX_WINDOW_EXPIRED');
  return { status: 'IN_REVIEW' as const, dueAt: outcome.dueAt };
}

// ---------------------------------------------------------------------------------------------
// Service wizard loader (`/citizen/new/:service`)
// ---------------------------------------------------------------------------------------------

export interface WizardPayment {
  ref: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  qrCreatedAt: string;
  qrExpiresAt: string;
  caseNo: string | null;
  receiptNo: string | null;
}

export interface WizardReceipt {
  caseNo: string;
  receiptNo: string;
  amount: number;
  paidAt: string;
}

export interface ServiceWizardState {
  service: { id: ServiceId; name: string; rates: ServiceFeeRates };
  slots: readonly UploadSlot[];
  /** Only the fee-relevant test flag reaches the browser so the preview matches the API quote. */
  feeBugs: string[];
  draft: DraftDetail | null;
  payment: WizardPayment | null;
  receipt: WizardReceipt | null;
}

/**
 * Server-side state for the three-step wizard. Returns null when `?draft=` is missing, foreign
 * or belongs to another service, so the page renders 404 without revealing the draft.
 */
export function loadServiceWizard(ctx: CasesContext, actor: Principal | null, serviceId: string, draftId?: string): ServiceWizardState | null {
  const citizen = requireRole(actor, ['citizen']);
  if (!isServiceId(serviceId)) return null;
  const { db } = ctx;
  const bugs = bugsOf(ctx);
  return db.transaction(() => {
    const service = db.prepare<[string], ServiceFeeRates & { name: string }>(`
      SELECT id, name, fee, fee_base, fee_per_sqm FROM services WHERE id = ?
    `).get(serviceId);
    if (!service) return null;
    const { name, ...rates } = service;
    const state: ServiceWizardState = {
      service: { id: serviceId, name, rates },
      slots: UPLOAD_SLOTS[serviceId],
      feeBugs: bugs.has('B01') ? ['B01'] : [],
      draft: null,
      payment: null,
      receipt: null,
    };
    if (draftId === undefined) return state;

    let draft: DraftDetail;
    try {
      draft = getDraft(db, citizen, draftId, bugs);
    } catch (error) {
      if (error instanceof HttpError && error.code === 'NOT_FOUND') return null;
      throw error;
    }
    if (draft.serviceId !== serviceId) return null;
    const latest = getLatestDraftPayment(db, citizen, draftId, ctx.testMode);
    const receipt = db.prepare<[string], WizardReceipt>(`
      SELECT r.case_no AS caseNo, r.receipt_no AS receiptNo, r.amount, r.paid_at AS paidAt
      FROM cases AS c JOIN receipts AS r ON r.case_no = c.case_no
      WHERE c.draft_id = ?
    `).get(draftId);
    return {
      ...state,
      draft,
      payment: latest && {
        ref: latest.ref,
        amount: latest.amount,
        status: latest.status,
        qrCreatedAt: latest.qrCreatedAt,
        qrExpiresAt: latest.qrExpiresAt,
        caseNo: latest.caseNo,
        receiptNo: latest.receiptNo,
      },
      receipt: receipt ?? null,
    };
  })();
}


export interface PendingCorrection {
  caseNo: string;
  serviceId: ServiceId;
  fixDeadline: string;
}

/** NEED_FIX cases still inside the 168-hour window, earliest deadline first (citizen home alert). */
export function listPendingCorrections(ctx: CasesContext, actor: Principal | null): PendingCorrection[] {
  const citizen = requireRole(actor, ['citizen']);
  const now = readClock(ctx.db, ctx.testMode);
  return ctx.db.prepare<[string], PendingCorrection>(`
    SELECT case_no AS caseNo, service_id AS serviceId, fix_deadline AS fixDeadline
    FROM cases WHERE applicant = ? AND status = 'NEED_FIX' AND fix_deadline IS NOT NULL
    ORDER BY julianday(fix_deadline), case_no
  `).all(citizen.userId).filter(item => Date.parse(now) < Date.parse(item.fixDeadline));
}
