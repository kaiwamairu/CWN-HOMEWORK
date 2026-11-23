import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { immediate } from '../../src/server/db/connection.ts';
import { createSchema } from '../../src/server/db/schema.ts';
import { seed } from '../../src/server/db/seed.ts';
import { decisionPermissions, issuerOf, listPendingApprovals } from '../../src/server/domain/approvals.ts';
import { claimCase } from '../../src/server/domain/claims.ts';
import { setClock } from '../../src/server/domain/clock.ts';
import {
  buddhistYear, isExpired, maskApplicant, nextDocumentNo, publicOrigin, randomVerifyCode, signDocument,
  signatureMatches, signingPayload, tamperDocument, uniqueVerifyCode, validUntilFor, verifyOutcome, type SignedFields,
} from '../../src/server/domain/documents.ts';
import { forwardCase } from '../../src/server/domain/review.ts';
import type { Context } from '../../src/server/http/context.ts';
import { errorResponse } from '../../src/server/http/errors.ts';
import { handleDecisionsDocuments } from '../../src/server/http/features/decisions-documents.ts';
import { documentMachineLine } from '../../src/server/output/document-pdf.ts';
import { issueSession, readSession, SESSION_COOKIE } from '../../src/server/security/session.ts';

const keys = { dataKey: Buffer.alloc(32, 1), lookupKey: Buffer.alloc(32, 2), documentKey: Buffer.alloc(32, 3) };
const no = (n: number) => `EG-2569-${String(n).padStart(6, '0')}`;
const SOMCHAI = 'citizen-somchai';
const SOMYING = 'citizen-somying';

function harness(modes: string[] = []) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  seed(db, keys);
  const ctx: Context = { db, keys, testMode: true, bugModes: new Set(modes) };
  const cookies = new Map<string, string>();
  const cookie = (user: string | null) => {
    if (!user) return '';
    if (!cookies.has(user)) cookies.set(user, `${SESSION_COOKIE}=${issueSession(db, user, false)}`);
    return cookies.get(user)!;
  };
  const actor = (user: string) => readSession(new Request('http://x', { headers: { cookie: cookie(user) } }), db);
  async function call(user: string | null, path: string, method = 'GET', body?: unknown) {
    const request = new Request(`http://127.0.0.1${path}`, {
      method,
      headers: { cookie: cookie(user), 'content-type': 'application/json', host: 'localhost:3000' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    try {
      const response = await handleDecisionsDocuments(request, ctx, readSession(request, db));
      assert.ok(response, `unhandled ${path}`);
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }
  const row = (n: number) => db.prepare('SELECT status, owner, approved_by, closed_at, current_dept FROM cases WHERE case_no=?').get(no(n)) as Record<string, unknown>;
  const audit = (event: string) => db.prepare('SELECT * FROM audit WHERE event=? ORDER BY id').all(event) as Record<string, unknown>[];
  const clock = (iso: string) => setClock(db, iso);
  return { db, ctx, call, actor, row, audit, clock };
}

async function expectError(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal((await response.json() as { code: string }).code, code);
}

async function issue(h: ReturnType<typeof harness>, user: string, n: number) {
  const response = await h.call(user, `/api/officer/cases/${no(n)}/issue`, 'POST');
  assert.equal(response.status, 200);
  return await response.json() as { docNo: string; verifyCode: string; status: string };
}

async function verify(h: ReturnType<typeof harness>, code: string) {
  const response = await h.call(null, `/api/verify/${code}`);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

test('BR-23 validity: SV-01 issue + 89 days, SV-02/03 anniversary − 1 day with the 29 Feb clamp', () => {
  assert.equal(validUntilFor('2026-12-01T09:00:00+07:00', 'SV-01'), '2027-02-28');
  assert.equal(validUntilFor('2026-11-05T10:00:00+07:00', 'SV-01'), '2027-02-02');
  assert.equal(validUntilFor('2028-02-29T10:00:00+07:00', 'SV-01'), '2028-05-28');
  assert.equal(validUntilFor('2026-12-01T09:00:00+07:00', 'SV-02'), '2027-11-30');
  assert.equal(validUntilFor('2026-12-01T09:00:00+07:00', 'SV-03'), '2027-11-30');
  assert.equal(validUntilFor('2028-02-29T10:00:00+07:00', 'SV-02'), '2029-02-27');
  assert.equal(validUntilFor('2028-02-29T10:00:00+07:00', 'SV-03'), '2029-02-27');
  assert.equal(validUntilFor('2027-03-01T00:00:00+07:00', 'SV-02'), '2028-02-29');
  // The Bangkok calendar date decides, not the UTC date of the instant.
  assert.equal(validUntilFor('2026-11-30T17:30:00Z', 'SV-01'), '2027-02-28');
});

test('A-43 expiry is inclusive of the last day and starts at Bangkok midnight', () => {
  assert.equal(isExpired('2027-02-28T23:59:00+07:00', '2027-02-28'), false);
  assert.equal(isExpired('2027-02-28T23:59:59+07:00', '2027-02-28'), false);
  assert.equal(isExpired('2027-03-01T00:00:00+07:00', '2027-02-28'), true);
  assert.equal(isExpired('2027-02-28T17:00:00Z', '2027-02-28'), true);
  assert.equal(verifyOutcome(true, '2027-02-02T23:59:00+07:00', '2027-02-02'), 'VALID');
  assert.equal(verifyOutcome(true, '2027-02-03T00:00:00+07:00', '2027-02-02'), 'EXPIRED');
  assert.equal(verifyOutcome(false, '2026-12-01T09:00:00+07:00', '2027-02-02'), 'TAMPERED');
  assert.equal(verifyOutcome(false, '2027-03-01T00:00:00+07:00', '2027-02-02'), 'TAMPERED');
});

test('A-22 signature: HMAC-SHA256 over the CONTRACT §3 field order joined by pipes', () => {
  const fields: SignedFields = {
    docNo: 'DOC-2569-000001', caseNo: 'EG-2569-000005', applicant: 'สมชาย ใจดี', serviceId: 'SV-01',
    issuedAt: '2026-11-05T10:00:00+07:00', validUntil: '2027-02-02', signer: 'เจ้าหน้าที่ทะเบียน 1',
  };
  assert.equal(signingPayload(fields), 'DOC-2569-000001|EG-2569-000005|สมชาย ใจดี|SV-01|2026-11-05T10:00:00+07:00|2027-02-02|เจ้าหน้าที่ทะเบียน 1');
  const signature = signDocument(keys.documentKey, fields);
  assert.match(signature, /^[0-9a-f]{64}$/);
  assert.equal(signatureMatches(keys.documentKey, fields, signature), true);
  for (const key of Object.keys(fields) as (keyof SignedFields)[]) {
    assert.equal(signatureMatches(keys.documentKey, { ...fields, [key]: `${fields[key]}x` }, signature), false, key);
  }
  assert.equal(signatureMatches(keys.lookupKey, fields, signature), false);
  assert.equal(signatureMatches(keys.documentKey, fields, 'not-hex'), false);
});

test('A-54 / A-58 masked applicant names', () => {
  assert.equal(maskApplicant('สมชาย ใจดี'), 'สมชาย ใ***');
  assert.equal(maskApplicant('สมหญิง รักไทย'), 'สมหญิง ร***');
  assert.equal(maskApplicant('มานะ'), 'มานะ ***');
});

test('verification codes are [A-Z0-9]{8} and unique against stored documents', () => {
  for (let i = 0; i < 200; i++) assert.match(randomVerifyCode(), /^[A-Z0-9]{8}$/);
  const h = harness();
  const picks = [...'K7M2Q9XA', ...'K7M2Q9XB'].map(ch => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.indexOf(ch));
  assert.equal(uniqueVerifyCode(h.db, () => picks.shift()!), 'K7M2Q9XB', 'the seed code K7M2Q9XA is skipped');
});

test('DOC numbers use a separate counter per Buddhist-era issue year', () => {
  const h = harness();
  assert.equal(buddhistYear('2026-12-31T23:59:59+07:00'), 2569);
  assert.equal(buddhistYear('2026-12-31T17:00:00Z'), 2570);
  immediate(h.db, () => {
    assert.equal(nextDocumentNo(h.db, '2026-12-01T09:00:00+07:00'), 'DOC-2569-000002');
    assert.equal(nextDocumentNo(h.db, '2026-12-01T09:00:00+07:00'), 'DOC-2569-000003');
    assert.equal(nextDocumentNo(h.db, '2028-02-29T10:00:00+07:00'), 'DOC-2571-000001');
  });
});

test('public origin comes from the request host and rejects header injection', () => {
  assert.equal(publicOrigin(new Headers({ host: '127.0.0.1:3000' })), 'http://127.0.0.1:3000');
  assert.equal(publicOrigin(new Headers({ host: 'localhost:3100', 'x-forwarded-proto': 'https' })), 'https://localhost:3100');
  assert.equal(publicOrigin(new Headers({ host: 'evil.example/"><script>' }), 'http://fallback'), 'http://fallback');
});

test('seed document K7M2Q9XA verifies VALID with the masked name; unknown codes are 404', async () => {
  const h = harness();
  const found = await verify(h, 'K7M2Q9XA');
  assert.equal(found.status, 200);
  assert.deepEqual(found.body, {
    result: 'VALID', docNo: 'DOC-2569-000001', applicantMasked: 'สมชาย ใ***', serviceId: 'SV-01',
    issuedAt: '2026-11-05T10:00:00+07:00', validUntil: '2027-02-02', signer: 'เจ้าหน้าที่ทะเบียน 1',
  });
  assert.ok(!JSON.stringify(found.body).includes('ใจดี'));
  for (const code of ['ZZZZZZZZ', 'k7m2q9xa', 'K7M2Q9X']) {
    const missing = await verify(h, code);
    assert.equal(missing.status, 404, code);
    assert.deepEqual(missing.body, { result: 'NOT_FOUND' });
  }
  h.clock('2027-02-02T23:59:00+07:00');
  assert.equal((await verify(h, 'K7M2Q9XA')).body.result, 'VALID');
  h.clock('2027-02-03T00:00:00+07:00');
  const expired = await verify(h, 'K7M2Q9XA');
  assert.equal(expired.status, 200);
  assert.equal(expired.body.result, 'EXPIRED');
  assert.equal(expired.body.validUntil, '2027-02-02');
});

test('tamper → TAMPERED with only the result, and it wins over expiry (A-43)', async () => {
  const h = harness();
  assert.equal(tamperDocument(h.db, 'DOC-2569-000404'), false);
  assert.equal(tamperDocument(h.db, 'DOC-2569-000001'), true);
  assert.deepEqual(await verify(h, 'K7M2Q9XA'), { status: 200, body: { result: 'TAMPERED' } });
  h.clock('2027-03-01T00:00:00+07:00');
  assert.deepEqual(await verify(h, 'K7M2Q9XA'), { status: 200, body: { result: 'TAMPERED' } });
});

test('TC-WORKFLOW-01 / DOC-01: SV-01 holder approves, APPROVED stays open, issue signs and closes once', async () => {
  const h = harness();
  assert.deepEqual(decisionPermissions(h.db, h.actor('off.reg2'), no(25)), { approve: true, reject: true, issue: false });
  await expectError(await h.call('off.reg1', `/api/cases/${no(26)}/approve`, 'POST'), 403, 'FORBIDDEN');

  const approved = await h.call('off.reg2', `/api/cases/${no(25)}/approve`, 'POST');
  assert.equal(approved.status, 200);
  assert.deepEqual(await approved.json(), { status: 'APPROVED' });
  assert.deepEqual(h.row(25), { status: 'APPROVED', owner: 'off.reg2', approved_by: 'off.reg2', closed_at: null, current_dept: 'registry' });
  assert.deepEqual(decisionPermissions(h.db, h.actor('off.reg2'), no(25)), { approve: false, reject: false, issue: true });
  await expectError(await h.call('off.reg2', `/api/cases/${no(25)}/approve`, 'POST'), 409, 'INVALID_STATE');
  await expectError(await h.call('off.reg1', `/api/officer/cases/${no(25)}/issue`, 'POST'), 403, 'FORBIDDEN');

  const doc = await issue(h, 'off.reg2', 25);
  assert.equal(doc.docNo, 'DOC-2569-000002');
  assert.equal(doc.status, 'COMPLETED');
  assert.match(doc.verifyCode, /^[A-Z0-9]{8}$/);
  assert.deepEqual(h.row(25), { status: 'COMPLETED', owner: 'off.reg2', approved_by: 'off.reg2', closed_at: '2026-12-01T09:00:00+07:00', current_dept: 'registry' });
  const stored = h.db.prepare('SELECT signer, issuer, applicant, valid_until FROM documents WHERE doc_no=?').get(doc.docNo);
  assert.deepEqual(stored, { signer: 'เจ้าหน้าที่ทะเบียน 2', issuer: 'off.reg2', applicant: 'สมหญิง รักไทย', valid_until: '2027-02-28' });

  const verified = await verify(h, doc.verifyCode);
  assert.deepEqual(verified.body, {
    result: 'VALID', docNo: 'DOC-2569-000002', applicantMasked: 'สมหญิง ร***', serviceId: 'SV-01',
    issuedAt: '2026-12-01T09:00:00+07:00', validUntil: '2027-02-28', signer: 'เจ้าหน้าที่ทะเบียน 2',
  });

  await expectError(await h.call('off.reg2', `/api/officer/cases/${no(25)}/issue`, 'POST'), 409, 'INVALID_STATE');
  assert.equal((h.db.prepare("SELECT next_value FROM counters WHERE kind='document' AND year=2569").get() as { next_value: number }).next_value, 3);
  assert.deepEqual(h.audit('APPROVE').map(a => [a.username, a.case_no, a.from_status, a.to_status, a.detail]), [['off.reg2', no(25), 'IN_REVIEW', 'APPROVED', '']]);
  assert.deepEqual(h.audit('ISSUE').map(a => [a.username, a.role, a.case_no, a.from_status, a.to_status, a.detail]), [['off.reg2', 'officer', no(25), 'APPROVED', 'COMPLETED', 'DOC-2569-000002']]);

  const pdf = await h.call(SOMYING, `/api/documents/${doc.docNo}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.headers.get('content-disposition'), 'attachment; filename="DOC-2569-000002.pdf"');
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  const line = `docNo=DOC-2569-000002 caseNo=EG-2569-000025 verify=${doc.verifyCode} validUntil=2027-02-28`;
  assert.equal(documentMachineLine({ docNo: doc.docNo, caseNo: no(25), verifyCode: doc.verifyCode, validUntil: '2027-02-28' }), line);
  const text = bytes.toString('latin1');
  assert.equal(text.split(line).length - 1, 1, 'exactly one machine-readable line');
  assert.ok(text.includes(`http://localhost:3000/verify/${doc.verifyCode}`));
  assert.ok(!text.includes('3100600987659') && !text.includes('0823456789'), 'no identity or phone number in the PDF');
  await expectError(await h.call(SOMCHAI, `/api/documents/${doc.docNo}/pdf`), 404, 'NOT_FOUND');
  assert.equal((await h.call('off.reg1', `/api/documents/${doc.docNo}/pdf`)).status, 200);
  await expectError(await h.call('exec1', `/api/documents/${doc.docNo}/pdf`), 404, 'NOT_FOUND');
  await expectError(await h.call(SOMYING, '/api/documents/DOC-2569-000001/pdf'), 404, 'NOT_FOUND');
});

test('TC-RBAC-02: officers cannot decide SV-02/03 and the head cannot decide SV-01', async () => {
  const h = harness();
  await expectError(await h.call('off.reg2', `/api/cases/${no(14)}/approve`, 'POST'), 403, 'FORBIDDEN');
  await expectError(await h.call('off.reg2', `/api/cases/${no(13)}/approve`, 'POST'), 403, 'FORBIDDEN');
  await expectError(await h.call('off.reg2', `/api/cases/${no(14)}/reject`, 'POST', { reason: 'xxxxxxxxxx' }), 403, 'FORBIDDEN');
  await expectError(await h.call('off.reg2', `/api/cases/${no(13)}/reject`, 'POST', { reason: 'xxxxxxxxxx' }), 403, 'FORBIDDEN');
  await expectError(await h.call('head1', `/api/cases/${no(25)}/approve`, 'POST'), 403, 'FORBIDDEN');
  await expectError(await h.call('head1', `/api/cases/${no(13)}/approve`, 'POST'), 409, 'INVALID_STATE');
  await expectError(await h.call(null, `/api/cases/${no(14)}/approve`, 'POST'), 401, 'UNAUTHENTICATED');
  await expectError(await h.call(SOMCHAI, `/api/cases/${no(14)}/approve`, 'POST'), 403, 'FORBIDDEN');
  await expectError(await h.call('head1', '/api/cases/EG-2569-999999/approve', 'POST'), 404, 'NOT_FOUND');
  assert.equal(h.row(14).status, 'PENDING_APPROVAL');
  assert.equal(h.row(13).status, 'IN_REVIEW');
  for (const n of [13, 14]) assert.equal(decisionPermissions(h.db, h.actor('off.reg2'), no(n)).approve, false);
  assert.deepEqual(decisionPermissions(h.db, h.actor('head1'), no(25)), { approve: false, reject: false, issue: false });

  const approved = await h.call('head1', `/api/cases/${no(14)}/approve`, 'POST');
  assert.deepEqual([approved.status, await approved.json()], [200, { status: 'APPROVED' }]);
  assert.deepEqual(h.row(14), { status: 'APPROVED', owner: null, approved_by: 'head1', closed_at: null, current_dept: 'registry' });
  assert.deepEqual(h.audit('APPROVE').map(a => a.username), ['head1']);
});

test('BUG_MODE=B07 bypasses only the officer SV-02 approval authority check', async () => {
  const h = harness(['B07']);
  const bugged = await h.call('off.reg2', `/api/cases/${no(14)}/approve`, 'POST');
  assert.deepEqual([bugged.status, await bugged.json()], [200, { status: 'APPROVED' }]);
  assert.equal(h.row(14).approved_by, 'off.reg2');
  // Every other rule still holds: state, SV-01 holder, head on SV-01, reject, SV-03 and the UI.
  await expectError(await h.call('off.reg2', `/api/cases/${no(13)}/approve`, 'POST'), 409, 'INVALID_STATE');
  await expectError(await h.call('off.reg1', `/api/cases/${no(26)}/approve`, 'POST'), 403, 'FORBIDDEN');
  await expectError(await h.call('head1', `/api/cases/${no(25)}/approve`, 'POST'), 403, 'FORBIDDEN');
  await expectError(await h.call('off.reg1', `/api/cases/${no(11)}/approve`, 'POST'), 403, 'FORBIDDEN');
  await expectError(await h.call('off.reg2', `/api/cases/${no(19)}/reject`, 'POST', { reason: 'xxxxxxxxxx' }), 403, 'FORBIDDEN');
  assert.equal(decisionPermissions(h.db, h.actor('off.reg2'), no(13)).approve, false);
  // Without TEST_MODE the mutation never applies.
  const prod = harness(['B07']);
  prod.ctx.testMode = false;
  await expectError(await prod.call('off.reg2', `/api/cases/${no(14)}/approve`, 'POST'), 403, 'FORBIDDEN');
});

test('TC-WORKFLOW-02: SV-02 forward → head approves → only the first registry claimant issues; head signs', async () => {
  const h = harness();
  assert.equal(forwardCase(h.ctx, h.actor('off.reg2'), no(13), '').status, 'PENDING_APPROVAL');
  assert.deepEqual(listPendingApprovals(h.db, h.actor('head1')).map(r => r.caseNo), [no(13), no(14), no(11)]);
  assert.throws(() => listPendingApprovals(h.db, h.actor('off.reg2')), { code: 'FORBIDDEN' });
  assert.deepEqual(decisionPermissions(h.db, h.actor('head1'), no(13)), { approve: true, reject: true, issue: false });
  assert.equal((await h.call('head1', `/api/cases/${no(13)}/approve`, 'POST')).status, 200);
  assert.deepEqual(decisionPermissions(h.db, h.actor('head1'), no(13)), { approve: false, reject: false, issue: false });
  assert.equal(decisionPermissions(h.db, h.actor('off.reg1'), no(13)).issue, false);
  await expectError(await h.call('off.reg1', `/api/officer/cases/${no(13)}/issue`, 'POST'), 403, 'FORBIDDEN');
  assert.equal(decisionPermissions(h.db, h.actor('off.reg2'), no(13)).issue, true);
  const doc = await issue(h, 'off.reg2', 13);
  assert.equal(doc.docNo, 'DOC-2569-000002');
  const verified = await verify(h, doc.verifyCode);
  assert.equal(verified.body.signer, 'หัวหน้าฝ่าย');
  assert.equal(verified.body.validUntil, '2027-11-30');
  assert.equal(h.db.prepare('SELECT issuer FROM documents WHERE doc_no=?').pluck().get(doc.docNo), 'off.reg2');
});

test('seed …000019 (SV-02 APPROVED by head1) is issued by off.reg1 only', async () => {
  const h = harness();
  assert.equal(issuerOf(h.db.prepare('SELECT service_id, owner, first_registry_claimant, approved_by FROM cases WHERE case_no=?').get(no(19)) as never), 'off.reg1');
  await expectError(await h.call('off.reg2', `/api/officer/cases/${no(19)}/issue`, 'POST'), 403, 'FORBIDDEN');
  await expectError(await h.call('head1', `/api/officer/cases/${no(19)}/issue`, 'POST'), 403, 'FORBIDDEN');
  const doc = await issue(h, 'off.reg1', 19);
  assert.equal(doc.docNo, 'DOC-2569-000002');
  assert.equal((await verify(h, doc.verifyCode)).body.signer, 'หัวหน้าฝ่าย');
  h.clock('2027-11-30T23:59:00+07:00');
  assert.equal((await verify(h, doc.verifyCode)).body.result, 'VALID');
  h.clock('2027-12-01T00:00:00+07:00');
  assert.equal((await verify(h, doc.verifyCode)).body.result, 'EXPIRED');
});

test('TC-WORKFLOW-03: SV-03 three steps; works officer cannot issue, the registry claimant can', async () => {
  const h = harness();
  assert.deepEqual(forwardCase(h.ctx, h.actor('off.reg2'), no(12), ''), { status: 'IN_REVIEW', step: 2 });
  claimCase(h.ctx, h.actor('off.works1'), no(12));
  await expectError(await h.call('off.works1', `/api/cases/${no(12)}/approve`, 'POST'), 403, 'FORBIDDEN');
  assert.equal(forwardCase(h.ctx, h.actor('off.works1'), no(12), '').status, 'PENDING_APPROVAL');
  assert.equal((await h.call('head1', `/api/cases/${no(12)}/approve`, 'POST')).status, 200);
  assert.equal(decisionPermissions(h.db, h.actor('off.works1'), no(12)).issue, false);
  await expectError(await h.call('off.works1', `/api/officer/cases/${no(12)}/issue`, 'POST'), 403, 'FORBIDDEN');
  const doc = await issue(h, 'off.reg2', 12);
  assert.equal((await verify(h, doc.verifyCode)).body.signer, 'หัวหน้าฝ่าย');
});

test('TC-WORKFLOW-05: rejection reason is trimmed ≥ 10, closes the case and audits the reason', async () => {
  const h = harness();
  await expectError(await h.call('off.reg2', `/api/cases/${no(26)}/reject`, 'POST', { reason: 'xxxxxxxxx' }), 400, 'REASON_TOO_SHORT');
  await expectError(await h.call('off.reg2', `/api/cases/${no(26)}/reject`, 'POST', { reason: '          ' }), 400, 'REASON_TOO_SHORT');
  await expectError(await h.call('off.reg2', `/api/cases/${no(26)}/reject`, 'POST', {}), 400, 'REASON_TOO_SHORT');
  assert.equal(h.row(26).status, 'IN_REVIEW');
  assert.equal(h.audit('REJECT').length, 0);
  const rejected = await h.call('off.reg2', `/api/cases/${no(26)}/reject`, 'POST', { reason: '  xxxxxxxxxx  ' });
  assert.deepEqual([rejected.status, await rejected.json()], [200, { status: 'REJECTED', closedAt: '2026-12-01T09:00:00+07:00' }]);
  assert.equal(h.row(26).closed_at, '2026-12-01T09:00:00+07:00');
  assert.deepEqual(h.audit('REJECT').map(a => [a.username, a.from_status, a.to_status, a.detail]), [['off.reg2', 'IN_REVIEW', 'REJECTED', 'xxxxxxxxxx']]);
  await expectError(await h.call('off.reg2', `/api/cases/${no(26)}/reject`, 'POST', { reason: 'xxxxxxxxxx' }), 409, 'INVALID_STATE');

  await expectError(await h.call('head1', `/api/cases/${no(11)}/reject`, 'POST', { reason: 'xxxxxxxxx' }), 400, 'REASON_TOO_SHORT');
  const head = await h.call('head1', `/api/cases/${no(11)}/reject`, 'POST', { reason: 'xxxxxxxxxx' });
  assert.equal((await head.json() as { status: string }).status, 'REJECTED');
  assert.deepEqual(h.row(11), { status: 'REJECTED', owner: null, approved_by: null, closed_at: '2026-12-01T09:00:00+07:00', current_dept: 'registry' });
});

test('TC-DOC-03 E: issuing on 29 Feb 2028 starts DOC-2571 and clamps the SV-02 anniversary', async () => {
  const h = harness();
  h.clock('2028-02-29T10:00:00+07:00');
  assert.equal((await h.call('off.reg2', `/api/cases/${no(25)}/approve`, 'POST')).status, 200);
  const sv01 = await issue(h, 'off.reg2', 25);
  const sv02 = await issue(h, 'off.reg1', 19);
  assert.deepEqual([sv01.docNo, sv02.docNo], ['DOC-2571-000001', 'DOC-2571-000002']);
  assert.equal((await verify(h, sv01.verifyCode)).body.validUntil, '2028-05-28');
  assert.equal((await verify(h, sv02.verifyCode)).body.validUntil, '2029-02-27');
  h.clock('2028-05-28T23:59:00+07:00');
  assert.equal((await verify(h, sv01.verifyCode)).body.result, 'VALID');
  h.clock('2028-05-29T00:00:00+07:00');
  assert.equal((await verify(h, sv01.verifyCode)).body.result, 'EXPIRED');
  h.clock('2029-02-27T23:59:00+07:00');
  assert.equal((await verify(h, sv02.verifyCode)).body.result, 'VALID');
  h.clock('2029-02-28T00:00:00+07:00');
  assert.equal((await verify(h, sv02.verifyCode)).body.result, 'EXPIRED');
  assert.equal(h.db.prepare("SELECT next_value FROM counters WHERE kind='document' AND year=2569").pluck().get(), 2);
});

test('a failed issue leaves no document, counter step or ISSUE audit (single transaction)', async () => {
  const h = harness();
  h.db.exec("CREATE TRIGGER fail_issue BEFORE UPDATE OF status ON cases WHEN NEW.status='COMPLETED' BEGIN SELECT RAISE(ABORT,'boom'); END");
  const response = await h.call('off.reg1', `/api/officer/cases/${no(19)}/issue`, 'POST');
  assert.equal(response.status, 500);
  assert.equal(h.db.prepare('SELECT count(*) FROM documents').pluck().get(), 1);
  assert.equal(h.db.prepare("SELECT next_value FROM counters WHERE kind='document' AND year=2569").pluck().get(), 2);
  assert.equal(h.audit('ISSUE').length, 0);
  assert.equal(h.row(19).status, 'APPROVED');
});

test('unsupported methods on B10 paths answer 405', async () => {
  const h = harness();
  assert.equal((await h.call('head1', `/api/cases/${no(14)}/approve`, 'GET')).status, 405);
  assert.equal((await h.call(null, '/api/verify/K7M2Q9XA', 'POST')).status, 405);
  const request = new Request('http://127.0.0.1/api/cases/EG-2569-000014/files');
  assert.equal(await handleDecisionsDocuments(request, h.ctx, null), null);
});
