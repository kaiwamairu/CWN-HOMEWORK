import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import { HttpError } from '../http/errors.ts';
import { authorizeDraft, type Principal } from '../security/policy.ts';
import { readClock } from './clock.ts';
import { lockDraftFee, type ServiceId } from './fees.ts';
import { initialDueAt, toBangkokDate, toBangkokIso } from './sla.ts';
import { assertRequiredDraftDocuments, requireUnpaidDraft } from './uploads.ts';

const QR_LIFETIME_MS = 900_000;

type PaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED';

interface PaymentRow {
  ref: string;
  draft_id: string;
  amount: number;
  created_at: string;
  expires_at: string;
  status: PaymentStatus;
  applicant: string;
  service_id: ServiceId;
  qty: number | null;
  area_sqm: number | null;
  draft_status: 'DRAFT' | 'PENDING_PAYMENT' | 'PAID';
  locked_fee: number | null;
  sla_days: number;
  case_no: string | null;
  receipt_no: string | null;
  paid_at: string | null;
}

const PAYMENTS = `
  SELECT p.ref, p.draft_id, p.amount, p.created_at, p.expires_at, p.status,
         d.applicant, d.service_id, d.qty, d.area_sqm, d.status AS draft_status,
         d.locked_fee, s.sla_days, r.case_no, r.receipt_no, r.paid_at
  FROM payment_refs AS p
  JOIN drafts AS d ON d.id = p.draft_id
  JOIN services AS s ON s.id = d.service_id
  LEFT JOIN cases AS c ON c.draft_id = d.id
  LEFT JOIN receipts AS r ON r.case_no = c.case_no
`;

function paymentByRef(db: Database.Database, ref: string): PaymentRow | undefined {
  return db.prepare<[string], PaymentRow>(`${PAYMENTS} WHERE p.ref = ?`).get(ref);
}

function qrIsExpired(payment: PaymentRow, now: string, allowAtDeadline = false): boolean {
  const instant = Date.parse(now);
  const expiry = Date.parse(payment.expires_at);
  return payment.status === 'EXPIRED' || instant < Date.parse(payment.created_at)
    || instant > expiry || (instant === expiry && !allowAtDeadline);
}

function paymentStatus(payment: PaymentRow, now: string) {
  const status: PaymentStatus = payment.case_no ? 'PAID' : qrIsExpired(payment, now) ? 'EXPIRED' : 'PENDING';
  return {
    ref: payment.ref,
    amount: payment.amount,
    status,
    qrCreatedAt: payment.created_at,
    qrExpiresAt: payment.expires_at,
    caseNo: payment.case_no,
    receiptNo: payment.receipt_no,
  };
}

export function createPayment(
  db: Database.Database,
  actor: Principal | null,
  draftId: string,
  testMode: boolean,
  bugs: ReadonlySet<string>,
) {
  return immediate(db, () => {
    requireUnpaidDraft(db, actor, draftId);
    assertRequiredDraftDocuments(db, draftId);
    const amount = lockDraftFee(db, actor, draftId, testMode ? bugs : undefined);
    const qrCreatedAt = readClock(db, testMode);
    const qrExpiresAt = toBangkokIso(Date.parse(qrCreatedAt) + QR_LIFETIME_MS);
    const counter = db.prepare<[], { ordinal: number }>(`
      UPDATE counters SET next_value = next_value + 1
      WHERE kind = 'payment' AND year = 0
      RETURNING next_value - 1 AS ordinal
    `).get();
    if (!counter) throw new Error('Payment counter is missing');
    const ref = `PP-${String(counter.ordinal).padStart(4, '0')}`;
    db.prepare(`
      INSERT INTO payment_refs (ref, draft_id, amount, created_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `).run(ref, draftId, amount, qrCreatedAt, qrExpiresAt);
    return { ref, amount, qrCreatedAt, qrExpiresAt };
  });
}

export function getPayment(db: Database.Database, actor: Principal | null, ref: string, testMode: boolean) {
  const payment = paymentByRef(db, ref);
  authorizeDraft(actor, payment);
  if (!payment) throw new HttpError('NOT_FOUND');
  return paymentStatus(payment, readClock(db, testMode));
}

/** Restore the most recently issued QR and its receipt time when opening a saved wizard. */
export function getLatestDraftPayment(db: Database.Database, actor: Principal | null, draftId: string, testMode: boolean) {
  return db.transaction(() => {
    const draft = db.prepare<[string], { applicant: string }>('SELECT applicant FROM drafts WHERE id = ?').get(draftId);
    authorizeDraft(actor, draft);
    const payment = db.prepare<[string], PaymentRow>(`
      ${PAYMENTS} WHERE p.draft_id = ? ORDER BY p.rowid DESC LIMIT 1
    `).get(draftId);
    return payment ? { ...paymentStatus(payment, readClock(db, testMode)), paidAt: payment.paid_at } : null;
  })();
}

export function pay(
  db: Database.Database,
  ref: string,
  amount: unknown,
  testMode: boolean,
  bugs: ReadonlySet<string>,
) {
  return immediate(db, () => {
    const payment = paymentByRef(db, ref);
    if (!payment) throw new HttpError('NOT_FOUND');
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount !== payment.amount
        || amount !== payment.locked_fee) {
      throw new HttpError('AMOUNT_MISMATCH');
    }
    if (payment.case_no && payment.receipt_no) {
      return { status: 'PAID' as const, caseNo: payment.case_no, receiptNo: payment.receipt_no, duplicate: true };
    }
    const now = readClock(db, testMode);
    if (qrIsExpired(payment, now, testMode && bugs.has('B05'))) throw new HttpError('QR_EXPIRED');
    if (payment.draft_status !== 'PENDING_PAYMENT') throw new HttpError('INVALID_STATE');
    assertRequiredDraftDocuments(db, payment.draft_id);

    const dueAt = initialDueAt(db, now, payment.sla_days, testMode ? bugs : new Set());
    const year = Number(toBangkokDate(now).slice(0, 4)) + 543;
    db.prepare("INSERT INTO counters (kind, year, next_value) VALUES ('case', ?, 1) ON CONFLICT DO NOTHING")
      .run(year);
    const { ordinal } = db.prepare<[number], { ordinal: number }>(`
      UPDATE counters SET next_value = next_value + 1
      WHERE kind = 'case' AND year = ?
      RETURNING next_value - 1 AS ordinal
    `).get(year)!;
    if (ordinal > 999_999) throw new Error('Annual case number sequence is exhausted');
    const suffix = `${year}-${String(ordinal).padStart(6, '0')}`;
    const caseNo = `EG-${suffix}`;
    const receiptNo = `RC-${suffix}`;
    const step = payment.service_id === 'SV-03' ? 1 : null;

    db.prepare(`
      INSERT INTO cases (
        case_no, draft_id, applicant, service_id, qty, area_sqm,
        locked_fee, paid_at, sla_days_snapshot, due_at, status, step, current_dept
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, 'registry')
    `).run(caseNo, payment.draft_id, payment.applicant, payment.service_id, payment.qty,
      payment.area_sqm, amount, now, payment.sla_days, dueAt, step);
    db.prepare("UPDATE payment_refs SET status = 'PAID', paid_at = ?, case_no = ? WHERE ref = ?")
      .run(now, caseNo, ref);
    db.prepare("UPDATE drafts SET status = 'PAID' WHERE id = ?").run(payment.draft_id);
    db.prepare('UPDATE files SET case_no = ? WHERE draft_id = ? AND case_no IS NULL').run(caseNo, payment.draft_id);
    db.prepare('INSERT INTO receipts (receipt_no, case_no, ref, amount, paid_at) VALUES (?, ?, ?, ?, ?)')
      .run(receiptNo, caseNo, ref, amount, now);
    db.prepare("INSERT INTO case_departments (case_no, dept, entered_at) VALUES (?, 'registry', ?)")
      .run(caseNo, now);
    db.prepare(`
      INSERT INTO timeline (case_no, event, effective_at, from_status, to_status)
      VALUES (?, 'PAYMENT', ?, 'PENDING_PAYMENT', 'SUBMITTED')
    `).run(caseNo, now);
    return { status: 'PAID' as const, caseNo, receiptNo, duplicate: false };
  });
}
