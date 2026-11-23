import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import { HttpError } from '../http/errors.ts';
import { requireRole, type Principal } from '../security/policy.ts';
import { calculateFee, type FeeInput, type ServiceFeeRates, type ServiceId } from './fees.ts';

type DraftStatus = 'DRAFT' | 'PENDING_PAYMENT' | 'PAID';

export interface DraftSummary {
  draftId: string;
  serviceId: ServiceId;
  status: DraftStatus;
  fee: number;
}

interface DraftFile {
  fileId: string;
  name: string;
  docKey: string;
  size: number;
}

export type DraftDetail = DraftSummary & {
  qty?: number;
  areaSqm?: number;
  files: DraftFile[];
};

interface DraftRow extends ServiceFeeRates {
  draft_id: string;
  qty: number | null;
  area_sqm: number | null;
  status: DraftStatus;
  locked_fee: number | null;
}

const DRAFTS = `
  SELECT d.id AS draft_id, d.qty, d.area_sqm, d.status, d.locked_fee,
         s.id, s.fee, s.fee_base, s.fee_per_sqm
  FROM drafts AS d
  JOIN services AS s ON s.id = d.service_id
`;

function ownedDraft(db: Database.Database, draftId: string, applicant: string): DraftRow {
  const draft = db.prepare<[string, string], DraftRow>(`
    ${DRAFTS} WHERE d.id = ? AND d.applicant = ?
  `).get(draftId, applicant);
  if (!draft) throw new HttpError('NOT_FOUND');
  return draft;
}

function draftInput(value: unknown): FeeInput & { serviceId?: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError('INVALID_REQUEST');
  }
  return value;
}

function summarize(draft: DraftRow, bugs?: ReadonlySet<string>): DraftSummary {
  const fee = draft.locked_fee ?? calculateFee(draft, { qty: draft.qty, areaSqm: draft.area_sqm }, bugs).fee;
  return { draftId: draft.draft_id, serviceId: draft.id, status: draft.status, fee };
}

function detail(db: Database.Database, draft: DraftRow, summary: DraftSummary): DraftDetail {
  const files = db.prepare<[string], DraftFile>(`
    SELECT id AS fileId, name, doc_key AS docKey, size
    FROM files WHERE draft_id = ? ORDER BY id
  `).all(draft.draft_id);
  return {
    ...summary,
    ...(draft.qty !== null ? { qty: draft.qty } : {}),
    ...(draft.area_sqm !== null ? { areaSqm: draft.area_sqm } : {}),
    files,
  };
}

export function createDraft(db: Database.Database, actor: Principal | null, body: unknown, bugs?: ReadonlySet<string>) {
  const citizen = requireRole(actor, ['citizen']);
  const input = draftInput(body);
  if (typeof input.serviceId !== 'string') throw new HttpError('INVALID_REQUEST');
  const { serviceId } = input;

  return immediate(db, () => {
    const service = db.prepare<[string], ServiceFeeRates>(`
      SELECT id, fee, fee_base, fee_per_sqm FROM services WHERE id = ?
    `).get(serviceId);
    if (!service) throw new HttpError('INVALID_REQUEST');
    const { fee, qty, areaSqm } = calculateFee(service, input, bugs);

    const counter = db.prepare<[], { ordinal: number }>(`
      UPDATE counters SET next_value = next_value + 1
      WHERE kind = 'draft' AND year = 0
      RETURNING next_value - 1 AS ordinal
    `).get();
    if (!counter) throw new Error('Draft counter is missing');
    const draftId = `DR-${String(counter.ordinal).padStart(4, '0')}`;
    db.prepare(`
      INSERT INTO drafts (id, applicant, service_id, qty, area_sqm, status, fee, locked_fee)
      VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, NULL)
    `).run(draftId, citizen.userId, service.id, qty, areaSqm, fee);
    return { draftId, fee };
  });
}

export function listDrafts(db: Database.Database, actor: Principal | null, bugs?: ReadonlySet<string>): DraftSummary[] {
  const citizen = requireRole(actor, ['citizen']);
  return db.prepare<[string], DraftRow>(`
    ${DRAFTS} WHERE d.applicant = ? AND d.status IN ('DRAFT', 'PENDING_PAYMENT') ORDER BY d.rowid DESC
  `).all(citizen.userId).map(draft => summarize(draft, bugs));
}

export function getDraft(db: Database.Database, actor: Principal | null, draftId: string, bugs?: ReadonlySet<string>): DraftDetail {
  const citizen = requireRole(actor, ['citizen']);
  return db.transaction(() => {
    const draft = ownedDraft(db, draftId, citizen.userId);
    return detail(db, draft, summarize(draft, bugs));
  })();
}

export function updateDraft(db: Database.Database, actor: Principal | null, draftId: string, body: unknown, bugs?: ReadonlySet<string>): DraftDetail {
  const citizen = requireRole(actor, ['citizen']);
  return immediate(db, () => {
    const draft = ownedDraft(db, draftId, citizen.userId);
    if (draft.status !== 'DRAFT') throw new HttpError('INVALID_STATE');
    const { qty = draft.qty, areaSqm = draft.area_sqm } = draftInput(body);
    const quote = calculateFee(draft, { qty, areaSqm }, bugs);

    db.prepare('UPDATE drafts SET qty = ?, area_sqm = ?, fee = ? WHERE id = ?')
      .run(quote.qty, quote.areaSqm, quote.fee, draftId);
    const summary = { draftId, serviceId: draft.id, status: draft.status, fee: quote.fee };
    return detail(db, { ...draft, qty: quote.qty, area_sqm: quote.areaSqm }, summary);
  });
}

export function deleteDraft(db: Database.Database, actor: Principal | null, draftId: string): void {
  const citizen = requireRole(actor, ['citizen']);
  immediate(db, () => {
    const draft = ownedDraft(db, draftId, citizen.userId);
    if (draft.status === 'PAID') throw new HttpError('INVALID_STATE');

    db.prepare('DELETE FROM payment_refs WHERE draft_id = ?').run(draftId);
    db.prepare('DELETE FROM files WHERE draft_id = ?').run(draftId);
    db.prepare('DELETE FROM drafts WHERE id = ?').run(draftId);
  });
}
