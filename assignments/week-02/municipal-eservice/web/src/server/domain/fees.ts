import type Database from 'better-sqlite3';
import { HttpError } from '../http/errors.ts';
import { requireRole, type Principal } from '../security/policy.ts';

export type ServiceId = 'SV-01' | 'SV-02' | 'SV-03';

export interface ServiceFeeRates {
  id: ServiceId;
  fee: number;
  fee_base: number;
  fee_per_sqm: number;
}

export interface FeeInput {
  qty?: unknown;
  areaSqm?: unknown;
}

export interface FeeQuote {
  fee: number;
  qty: number | null;
  areaSqm: number | null;
}

/**
 * Quote from the current services row using the test flags filtered by readConfig.
 */
export function calculateFee(
  service: ServiceFeeRates,
  input: FeeInput = {},
  bugs?: ReadonlySet<string>,
): FeeQuote {
  switch (service.id) {
    case 'SV-01': {
      const { qty = 1 } = input;
      if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 5) {
        throw new HttpError('INVALID_QTY');
      }
      return { fee: service.fee * qty, qty, areaSqm: null };
    }
    case 'SV-02':
      return { fee: service.fee, qty: null, areaSqm: null };
    case 'SV-03': {
      const { areaSqm } = input;
      if (typeof areaSqm !== 'number' || !Number.isInteger(areaSqm) || areaSqm < 1) {
        throw new HttpError('INVALID_AREA');
      }
      if (areaSqm > 500) {
        throw new HttpError('AREA_TOO_LARGE');
      }

      const billableArea = areaSqm === 101 && bugs?.has('B01') ? 0 : Math.max(0, areaSqm - 100);
      return { fee: service.fee_base + service.fee_per_sqm * billableArea, qty: null, areaSqm };
    }
  }
}

type DraftFeeRow = ServiceFeeRates & {
  qty: number | null;
  area_sqm: number | null;
} & (
  | { status: 'DRAFT'; locked_fee: null }
  | { status: 'PENDING_PAYMENT' | 'PAID'; locked_fee: number }
);

/** Call inside the QR creation transaction after validating required documents. */
export function lockDraftFee(
  db: Database.Database,
  actor: Principal | null,
  draftId: string,
  bugs?: ReadonlySet<string>,
): number {
  const citizen = requireRole(actor, ['citizen']);
  if (!db.inTransaction) {
    throw new Error('Locking a draft fee requires a transaction');
  }

  const draft = db.prepare<[string, string], DraftFeeRow>(`
    SELECT s.id, s.fee, s.fee_base, s.fee_per_sqm,
           d.qty, d.area_sqm, d.status, d.locked_fee
    FROM drafts AS d
    JOIN services AS s ON s.id = d.service_id
    WHERE d.id = ? AND d.applicant = ?
  `).get(draftId, citizen.userId);

  if (!draft) throw new HttpError('NOT_FOUND');
  if (draft.status === 'PAID') throw new HttpError('INVALID_STATE');
  if (draft.status === 'PENDING_PAYMENT') return draft.locked_fee;

  const { fee } = calculateFee(draft, { qty: draft.qty, areaSqm: draft.area_sqm }, bugs);
  db.prepare(`
    UPDATE drafts
    SET status = 'PENDING_PAYMENT', fee = ?, locked_fee = ?
    WHERE id = ?
  `).run(fee, fee, draftId);
  return fee;
}
