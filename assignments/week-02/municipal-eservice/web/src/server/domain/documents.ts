import type Database from 'better-sqlite3';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { immediate } from '../db/connection.ts';
import type { Context } from '../http/context.ts';
import { HttpError } from '../http/errors.ts';
import { renderDocumentPdf } from '../output/document-pdf.ts';
import { authorizeDocument, requireRole, type Principal } from '../security/policy.ts';
import { maskName } from '../security/serializers.ts';
import { issuerOf, readDecisionRow } from './approvals.ts';
import { appendAudit } from './audit.ts';
import { documentValidUntil, toBangkokDate } from './calendar.ts';
import { readClock } from './clock.ts';

type DocumentContext = Pick<Context, 'db' | 'testMode' | 'keys'>;

export const VERIFY_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const VERIFY_CODE_PATTERN = /^[A-Z0-9]{8}$/;
export const DOC_NO_PATTERN = /^DOC-\d{4}-\d{6}$/;
export type VerifyResult = 'VALID' | 'EXPIRED' | 'TAMPERED';

export const VERIFY_LABELS: Readonly<Record<VerifyResult | 'NOT_FOUND', string>> = {
  VALID: 'เอกสารถูกต้อง',
  EXPIRED: 'เอกสารหมดอายุ',
  TAMPERED: 'ลายเซ็นไม่ถูกต้อง',
  NOT_FOUND: 'ไม่พบเอกสาร',
};

/** The seven signed fields in CONTRACT §3 order (A-22). */
export interface SignedFields {
  docNo: string;
  caseNo: string;
  applicant: string;
  serviceId: string;
  issuedAt: string;
  validUntil: string;
  signer: string;
}

export function signingPayload(fields: SignedFields): string {
  return [fields.docNo, fields.caseNo, fields.applicant, fields.serviceId, fields.issuedAt, fields.validUntil, fields.signer].join('|');
}

/** Simulated signature: hex HMAC-SHA256 with the test document key. */
export function signDocument(key: Buffer, fields: SignedFields): string {
  return createHmac('sha256', key).update(signingPayload(fields)).digest('hex');
}

export function signatureMatches(key: Buffer, fields: SignedFields, signature: string): boolean {
  const expected = createHmac('sha256', key).update(signingPayload(fields)).digest();
  const stored = /^[0-9a-f]{64}$/i.test(signature) ? Buffer.from(signature, 'hex') : Buffer.alloc(0);
  return stored.length === expected.length && timingSafeEqual(stored, expected);
}

/**
 * BR-23 / A-43 inclusive last valid day: SV-01 issue + 89 days · SV-02/03 next anniversary − 1 day,
 * with 28 Feb as the anniversary of a 29 Feb issue in a common year.
 */
export function validUntilFor(issuedAt: string, serviceId: string): string {
  return documentValidUntil(issuedAt, serviceId);
}

/** Valid through the whole last day; expired from 00:00 Bangkok of the following day. */
export function isExpired(now: string, validUntil: string): boolean {
  return toBangkokDate(now) > validUntil;
}

/** A-43: a signature mismatch wins over expiry. */
export function verifyOutcome(signatureOk: boolean, now: string, validUntil: string): VerifyResult {
  if (!signatureOk) return 'TAMPERED';
  return isExpired(now, validUntil) ? 'EXPIRED' : 'VALID';
}

/** A-54 / A-58: `สมชาย ใจดี` → `สมชาย ใ***` · no surname → `มานะ ***`. */
export function maskApplicant(name: string): string {
  return maskName(name);
}

export function randomVerifyCode(pick: (max: number) => number = randomInt): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += VERIFY_CODE_ALPHABET[pick(VERIFY_CODE_ALPHABET.length)];
  return code;
}

/** Unique `[A-Z0-9]{8}` code; the UNIQUE column remains the final guard. */
export function uniqueVerifyCode(db: Database.Database, pick?: (max: number) => number): string {
  const taken = db.prepare('SELECT 1 FROM documents WHERE verify_code = ?');
  for (let attempt = 0; attempt < 32; attempt++) {
    const code = randomVerifyCode(pick);
    if (!taken.get(code)) return code;
  }
  throw new Error('Could not allocate a unique verification code');
}

/** Buddhist-era year of a Bangkok instant (2026-12-01 → 2569, 2028-02-29 → 2571). */
export function buddhistYear(instant: string): number {
  return Number(toBangkokDate(instant).slice(0, 4)) + 543;
}

/** Separate annual `DOC-<พ.ศ.>-<6 digits>` counter by the issue year (A-48). Call inside a transaction. */
export function nextDocumentNo(db: Database.Database, issuedAt: string): string {
  const year = buddhistYear(issuedAt);
  db.prepare("INSERT INTO counters(kind, year, next_value) VALUES ('document', ?, 1) ON CONFLICT(kind, year) DO NOTHING").run(year);
  const { next_value: value } = db.prepare("SELECT next_value FROM counters WHERE kind = 'document' AND year = ?").get(year) as { next_value: number };
  db.prepare("UPDATE counters SET next_value = next_value + 1 WHERE kind = 'document' AND year = ?").run(year);
  return `DOC-${year}-${String(value).padStart(6, '0')}`;
}

/** Public origin for QR/verify links: the request's own host (CONTRACT `doc-qr` `<BASE_URL>`). */
export function publicOrigin(headers: Pick<Headers, 'get'>, fallback = 'http://127.0.0.1:3000'): string {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').split(',')[0]!.trim();
  if (!/^[A-Za-z0-9.\-]+(?::\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](?::\d{1,5})?$/.test(host)) return fallback;
  const proto = (headers.get('x-forwarded-proto') ?? 'http').split(',')[0]!.trim();
  return `${proto === 'https' ? 'https' : 'http'}://${host}`;
}

export function verifyUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/verify/${code}`;
}

const SERVICE_NAMES: Readonly<Record<string, string>> = {
  'SV-01': 'ขอหนังสือรับรอง',
  'SV-02': 'ขออนุญาตประกอบกิจการ',
  'SV-03': 'ขออนุญาตก่อสร้าง/ต่อเติมอาคาร',
};

/**
 * `POST /api/officer/cases/:caseNo/issue` → `{docNo,verifyCode,status:'COMPLETED'}`.
 * Order: role → 404 → 403 not the A-27 issuer → 409 not APPROVED. The approver signs, the
 * issuer is recorded; DOC number, code, signature, PDF, closedAt, timeline and ISSUE audit
 * commit together, so a repeated issue finds COMPLETED and gets 409 without a new number.
 */
export function issueDocument(ctx: DocumentContext, actor: Principal | null, caseNo: string, origin: string) {
  const { db, testMode, keys } = ctx;
  const user = requireRole(actor, ['officer']);
  return immediate(db, () => {
    const row = readDecisionRow(db, caseNo);
    if (!row) throw new HttpError('NOT_FOUND');
    if (issuerOf(row) !== user.userId) throw new HttpError('FORBIDDEN');
    if (row.status !== 'APPROVED' || !row.approved_by) throw new HttpError('INVALID_STATE');
    if (db.prepare('SELECT 1 FROM documents WHERE case_no = ?').get(caseNo)) throw new HttpError('INVALID_STATE');

    const parties = db.prepare(`
      SELECT applicant.name AS applicant, signer.name AS signer, COALESCE(signer.username, signer.id) AS signer_username
      FROM cases AS c JOIN users AS applicant ON applicant.id = c.applicant JOIN users AS signer ON signer.id = c.approved_by
      WHERE c.case_no = ?
    `).get(caseNo) as { applicant: string; signer: string; signer_username: string };
    const issuedAt = readClock(db, testMode);
    const fields: SignedFields = {
      docNo: nextDocumentNo(db, issuedAt),
      caseNo,
      applicant: parties.applicant,
      serviceId: row.service_id,
      issuedAt,
      validUntil: validUntilFor(issuedAt, row.service_id),
      signer: parties.signer,
    };
    const verifyCode = uniqueVerifyCode(db);
    const signature = signDocument(keys.documentKey, fields);
    const pdf = renderDocumentPdf({
      ...fields, serviceName: SERVICE_NAMES[row.service_id] ?? '', signerUsername: parties.signer_username,
      verifyCode, verifyUrl: verifyUrl(origin, verifyCode), signature,
    });

    db.prepare(`
      INSERT INTO documents(doc_no, case_no, verify_code, applicant, service_id, issued_at, valid_until, signer, issuer, signature, pdf)
      VALUES (@docNo, @caseNo, @verifyCode, @applicant, @serviceId, @issuedAt, @validUntil, @signer, @issuer, @signature, @pdf)
    `).run({ ...fields, verifyCode, issuer: user.userId, signature, pdf });
    const updated = db.prepare("UPDATE cases SET status = 'COMPLETED', closed_at = ? WHERE case_no = ? AND status = 'APPROVED'").run(issuedAt, caseNo);
    if (updated.changes !== 1) throw new HttpError('INVALID_STATE');

    db.prepare(`
      INSERT INTO timeline(case_no, event, actor, effective_at, from_status, to_status, note)
      VALUES (?, 'ISSUE', ?, ?, 'APPROVED', 'COMPLETED', ?)
    `).run(caseNo, user.userId, issuedAt, fields.docNo);
    appendAudit(db, {
      time: issuedAt, username: user.username, role: user.role, event: 'ISSUE',
      caseNo, fromStatus: 'APPROVED', toStatus: 'COMPLETED', detail: fields.docNo,
    });
    return { docNo: fields.docNo, verifyCode, status: 'COMPLETED' as const };
  });
}

interface StoredDocument {
  doc_no: string;
  case_no: string;
  verify_code: string;
  applicant: string;
  service_id: string;
  issued_at: string;
  valid_until: string;
  signer: string;
  signature: string;
}

export type VerifyResponse =
  | { result: 'TAMPERED' }
  | { result: 'VALID' | 'EXPIRED'; docNo: string; applicantMasked: string; serviceId: string; issuedAt: string; validUntil: string; signer: string };

/**
 * Public `/verify/:code` and `GET /api/verify/:code`. `null` = NOT_FOUND (HTTP 404).
 * TAMPERED carries only `result`, so a forged record exposes no name or number.
 */
export function verifyDocument(ctx: DocumentContext, code: string): VerifyResponse | null {
  if (!VERIFY_CODE_PATTERN.test(code)) return null;
  const doc = ctx.db.prepare(`
    SELECT doc_no, case_no, verify_code, applicant, service_id, issued_at, valid_until, signer, signature
    FROM documents WHERE verify_code = ?
  `).get(code) as StoredDocument | undefined;
  if (!doc) return null;
  const fields: SignedFields = {
    docNo: doc.doc_no, caseNo: doc.case_no, applicant: doc.applicant, serviceId: doc.service_id,
    issuedAt: doc.issued_at, validUntil: doc.valid_until, signer: doc.signer,
  };
  const result = verifyOutcome(signatureMatches(ctx.keys.documentKey, fields, doc.signature), readClock(ctx.db, ctx.testMode), doc.valid_until);
  if (result === 'TAMPERED') return { result };
  return {
    result, docNo: doc.doc_no, applicantMasked: maskApplicant(doc.applicant), serviceId: doc.service_id,
    issuedAt: doc.issued_at, validUntil: doc.valid_until, signer: doc.signer,
  };
}

/** `GET /api/documents/:docNo/pdf`: owner citizen, officer or head; everyone else 404. */
export function readDocumentPdf(db: Database.Database, actor: Principal | null, docNo: string): { filename: string; bytes: Buffer } {
  const doc = DOC_NO_PATTERN.test(docNo)
    ? db.prepare('SELECT d.doc_no, d.pdf, c.applicant FROM documents AS d JOIN cases AS c ON c.case_no = d.case_no WHERE d.doc_no = ?')
      .get(docNo) as { doc_no: string; pdf: Buffer; applicant: string } | undefined
    : undefined;
  authorizeDocument(actor, doc ? { applicant: doc.applicant } : undefined);
  if (!doc) throw new HttpError('NOT_FOUND');
  return { filename: `${doc.doc_no}.pdf`, bytes: doc.pdf };
}

export interface CaseDocument {
  docNo: string;
  verifyCode: string;
}

/** `doc-no` / `verify-code` / `doc-qr` source for a case page (after the caller's case guard). */
export function readCaseDocument(db: Database.Database, caseNo: string): CaseDocument | null {
  return (db.prepare('SELECT doc_no AS docNo, verify_code AS verifyCode FROM documents WHERE case_no = ?')
    .get(caseNo) as CaseDocument | undefined) ?? null;
}

/**
 * TEST_MODE tamper (CONTRACT §8): change a signed stored field without re-signing.
 * The B14 test dispatcher owns the route; returns false for an unknown docNo (404).
 */
export function tamperDocument(db: Database.Database, docNo: string): boolean {
  return db.prepare("UPDATE documents SET applicant = applicant || ' (แก้ไข)' WHERE doc_no = ?").run(docNo).changes === 1;
}
