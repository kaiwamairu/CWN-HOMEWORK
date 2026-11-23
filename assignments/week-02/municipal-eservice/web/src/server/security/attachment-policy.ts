import type Database from 'better-sqlite3';
import { HttpError } from '../http/errors.ts';
import { authorizeAttachment, authorizeDraft, requireRole, type Principal } from './policy.ts';

/**
 * Attachment adapter for B14 (CONTRACT 6.2, DECISIONS §18, BR-29). It composes the shared
 * policy.ts guards without changing them:
 *   anonymous → 401 · executive/auditor/admin → 403 · foreign citizen or unknown case/file → 404
 *   officer outside the current or past departments → 403 · head → every department.
 */

export const FILE_READER_ROLES = ['citizen', 'officer', 'head'] as const;

export interface AttachmentItem {
  fileId: string;
  name: string;
  docKey: string;
  size: number;
}

export interface AttachmentContent {
  name: string;
  contentType: string;
  bytes: Buffer;
}

interface CaseScope {
  case_no: string;
  applicant: string;
  current_dept: string | null;
}

interface FileRow {
  id: string;
  draft_id: string | null;
  case_no: string | null;
  name: string;
  mime: string;
  bytes: Buffer;
}

/** Departments the case is in now or has passed through (seeded and written by forward). */
export function departmentsEntered(db: Database.Database, caseNo: string): string[] {
  return (db.prepare('SELECT dept FROM case_departments WHERE case_no = ?').all(caseNo) as { dept: string }[])
    .map(row => row.dept);
}

/** Staff need-to-know scope, also used for UNMASK and the officer page. */
export function staffMayReadAttachments(user: Principal, entered: readonly string[]): boolean {
  return user.role === 'head' || (user.role === 'officer' && !!user.dept && entered.includes(user.dept));
}

function readCaseScope(db: Database.Database, caseNo: string): CaseScope | undefined {
  return db.prepare('SELECT case_no, applicant, current_dept FROM cases WHERE case_no = ?').get(caseNo) as CaseScope | undefined;
}

/** Role first (401/403), then existence and ownership (404), then department scope (403). */
export function authorizeCaseAttachments(db: Database.Database, actor: Principal | null, caseNo: string): Principal {
  requireRole(actor, FILE_READER_ROLES);
  const scope = readCaseScope(db, caseNo);
  return authorizeAttachment(actor, scope, scope ? departmentsEntered(db, scope.case_no) : []);
}

/** Metadata only; bytes never leave through the list. */
export function listAttachmentsForCase(db: Database.Database, caseNo: string): AttachmentItem[] {
  return db.prepare(`
    SELECT id AS fileId, name, doc_key AS docKey, size
    FROM files WHERE case_no = ? ORDER BY id
  `).all(caseNo) as AttachmentItem[];
}

/** `GET /api/cases/:caseNo/files` */
export function listCaseAttachments(db: Database.Database, actor: Principal | null, caseNo: string) {
  authorizeCaseAttachments(db, actor, caseNo);
  return { items: listAttachmentsForCase(db, caseNo) };
}

/** Content type from the stored bytes (PDF / JPEG / PNG magic), falling back to the persisted MIME. */
export function detectContentType(bytes: Uint8Array, stored: string): string {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return stored;
}

/**
 * `GET /api/files/:fileId`. The role check runs before the lookup so anonymous and
 * wrong-role callers cannot probe file IDs. Case files follow the case rule; files still
 * attached only to a draft belong to the draft's citizen.
 */
export function readAttachment(db: Database.Database, actor: Principal | null, fileId: string): AttachmentContent {
  requireRole(actor, FILE_READER_ROLES);
  const file = db.prepare('SELECT id, draft_id, case_no, name, mime, bytes FROM files WHERE id = ?').get(fileId) as FileRow | undefined;
  if (!file) throw new HttpError('NOT_FOUND');
  if (file.case_no) {
    authorizeCaseAttachments(db, actor, file.case_no);
  } else {
    authorizeDraft(actor, db.prepare('SELECT applicant FROM drafts WHERE id = ?').get(file.draft_id) as { applicant: string } | undefined);
  }
  return { name: file.name, contentType: detectContentType(file.bytes, file.mime), bytes: file.bytes };
}
