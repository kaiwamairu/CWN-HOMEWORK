import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import { HttpError } from '../http/errors.ts';
import { requireRole, type Principal } from '../security/policy.ts';
import type { ServiceId } from './fees.ts';

export const MAX_FILE_BYTES = 5_242_880;
export const MAX_DRAFT_FILES = 5;

const documents = {
  'id-card': { key: 'id-card', label: 'บัตรประชาชน', required: true },
  map: { key: 'map', label: 'แผนที่ตั้ง', required: true },
  'site-photo': { key: 'site-photo', label: 'ภาพสถานที่', required: false },
  plan: { key: 'plan', label: 'แบบแปลน', required: true },
  deed: { key: 'deed', label: 'โฉนด', required: true },
  extra: { key: 'extra', label: 'เอกสารเพิ่มเติม', required: false },
} as const;

export type DocKey = keyof typeof documents;
export type UploadSlot = (typeof documents)[DocKey];
export interface UploadFile {
  fileId: string;
  name: string;
  docKey: string;
  size: number;
}

export const UPLOAD_SLOTS = {
  'SV-01': [documents['id-card'], documents.extra],
  'SV-02': [documents['id-card'], documents.map, documents['site-photo'], documents.extra],
  'SV-03': [documents['id-card'], documents.plan, documents.deed, documents.extra],
} as const satisfies Record<ServiceId, readonly UploadSlot[]>;

const signatures = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
] as const;

/** Validate a single file using the CONTRACT byte signatures. */
export function validateUpload(bytes: Uint8Array, docKey: DocKey, bugs?: ReadonlySet<string>) {
  if (bytes.byteLength > MAX_FILE_BYTES || (bytes.byteLength === MAX_FILE_BYTES && bugs?.has('B02'))) {
    throw new HttpError('FILE_TOO_LARGE');
  }
  const signature = signatures.find(({ bytes: prefix }) => prefix.every((value, index) => bytes[index] === value));
  if (!signature) throw new HttpError('FILE_TYPE');
  if (docKey === 'plan' && signature.mime !== 'application/pdf') throw new HttpError('PLAN_NOT_PDF');
  return signature.mime;
}

/** Also used before reading a multipart body. Mutations repeat this check inside the transaction. */
export function requireUnpaidDraft(db: Database.Database, actor: Principal | null, draftId: string): ServiceId {
  const citizen = requireRole(actor, ['citizen']);
  const draft = db.prepare<[string, string], { service_id: ServiceId; status: string }>(`
    SELECT service_id, status FROM drafts WHERE id = ? AND applicant = ?
  `).get(draftId, citizen.userId);
  if (!draft) throw new HttpError('NOT_FOUND');
  if (draft.status === 'PAID') throw new HttpError('INVALID_STATE');
  return draft.service_id;
}

export function addDraftFile(
  db: Database.Database,
  actor: Principal | null,
  draftId: string,
  file: { name: string; docKey: string; bytes: Uint8Array },
  bugs?: ReadonlySet<string>,
): UploadFile {
  return immediate(db, () => {
    const serviceId = requireUnpaidDraft(db, actor, draftId);
    const slot = UPLOAD_SLOTS[serviceId].find(({ key }) => key === file.docKey);
    if (!slot) throw new HttpError('INVALID_REQUEST');
    const { name, bytes } = file;
    const docKey = slot.key;
    const mime = validateUpload(bytes, docKey, bugs);
    const { count } = db.prepare<[string], { count: number }>(
      'SELECT COUNT(*) AS count FROM files WHERE draft_id = ?',
    ).get(draftId)!;
    if (count >= MAX_DRAFT_FILES) throw new HttpError('FILE_COUNT');

    const fileId = `F-${randomUUID()}`;
    const size = bytes.byteLength;
    db.prepare(`
      INSERT INTO files (id, draft_id, doc_key, name, mime, bytes, size)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(fileId, draftId, docKey, name, mime, Buffer.from(bytes), size);
    return { fileId, name, docKey, size };
  });
}

export function removeDraftFile(db: Database.Database, actor: Principal | null, draftId: string, fileId: string): void {
  immediate(db, () => {
    requireUnpaidDraft(db, actor, draftId);
    const removed = db.prepare('DELETE FROM files WHERE draft_id = ? AND id = ? AND case_no IS NULL')
      .run(draftId, fileId);
    if (!removed.changes) throw new HttpError('NOT_FOUND');
  });
}

/** Call after authorization inside the transaction for QR creation or first payment acceptance. */
export function assertRequiredDraftDocuments(db: Database.Database, draftId: string): void {
  if (!db.inTransaction) throw new Error('Checking required draft documents requires a transaction');

  const draft = db.prepare<[string], { service_id: ServiceId }>(
    'SELECT service_id FROM drafts WHERE id = ?',
  ).get(draftId);
  if (!draft) throw new HttpError('NOT_FOUND');
  const files = db.prepare<[string], { doc_key: DocKey }>(
    'SELECT doc_key FROM files WHERE draft_id = ? AND case_no IS NULL',
  ).all(draftId);
  const attached = new Set(files.map(({ doc_key }) => doc_key));
  const missing = UPLOAD_SLOTS[draft.service_id]
    .filter(({ key, required }) => required && !attached.has(key))
    .map(({ label }) => label);
  if (missing.length) {
    throw new HttpError('MISSING_DOCS', { missing }, `ยังขาดเอกสาร: ${missing.join(', ')}`);
  }
}
