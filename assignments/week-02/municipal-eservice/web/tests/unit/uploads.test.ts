import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { immediate } from '../../src/server/db/connection.ts';
import { createSchema } from '../../src/server/db/schema.ts';
import { seed } from '../../src/server/db/seed.ts';
import { assertRequiredDraftDocuments } from '../../src/server/domain/uploads.ts';
import type { Context } from '../../src/server/http/context.ts';
import { errorResponse } from '../../src/server/http/errors.ts';
import { handleUploads } from '../../src/server/http/features/uploads.ts';
import type { Principal } from '../../src/server/security/policy.ts';
import { createJpeg, createPdf, createPng } from '../fixtures/files.ts';

const owner: Principal = {
  userId: 'citizen-somchai', username: '', name: '', role: 'citizen', dept: null, registrationOnly: false,
};
const other = { ...owner, userId: 'citizen-somying' };
const admin = { ...owner, userId: 'admin1', role: 'admin' };
const draft = '/api/drafts/DR-0001/files';
const pending = '/api/drafts/DR-0002/files';
const construction = '/api/drafts/DR-0003/files';
const pdf = createPdf(1024);

function setup(t: TestContext): Context {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  createSchema(db);
  const keys = { dataKey: Buffer.alloc(32, 1), lookupKey: Buffer.alloc(32, 2), documentKey: Buffer.alloc(32, 3) };
  seed(db, keys);
  db.prepare(`
    INSERT INTO drafts VALUES ('DR-0003', ?, 'SV-03', NULL, 100, 'DRAFT', 1000, NULL)
  `).run(owner.userId);
  return { db, keys, testMode: true, bugModes: new Set() };
}

async function request(ctx: Context, method: string, path: string, body?: BodyInit, actor: Principal | null = owner) {
  const req = new Request(`http://localhost${path}`, { method, body });
  try {
    return await handleUploads(req, ctx, actor);
  } catch (error) {
    return errorResponse(error);
  }
}

function upload(
  ctx: Context,
  path = draft,
  docKey = 'id-card',
  bytes = pdf,
  name = `${docKey}.pdf`,
  mime = 'application/pdf',
) {
  const body = new FormData();
  body.set('file', new File([new Uint8Array(bytes)], name, { type: mime }));
  body.set('docKey', docKey);
  return request(ctx, 'POST', path, body);
}

async function expectError(response: Response | null, status: number, code: string, message?: string) {
  assert.ok(response);
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.code, code);
  if (message) assert.equal(body.message, message);
}

test('BR-07: multipart accepts 5,242,880 bytes inclusive and reaches domain validation beyond 6 MB', async t => {
  const ctx = setup(t);
  for (const size of [5_242_879, 5_242_880]) {
    const name = `size-${size}.pdf`;
    const response = await upload(ctx, draft, 'id-card', createPdf(size), name);
    assert.equal(response?.status, 201);
    const { fileId, ...metadata } = await response!.json();
    assert.deepEqual(metadata, { name, docKey: 'id-card', size });
    assert.equal((await request(ctx, 'DELETE', `${draft}/${fileId}`))?.status, 204);
  }
  for (const size of [5_242_881, 6 * 1024 * 1024]) {
    await expectError(await upload(ctx, draft, 'id-card', createPdf(size)), 400, 'FILE_TOO_LARGE', 'ไฟล์ใหญ่เกิน 5 MB');
  }
  assert.deepEqual(ctx.db.prepare("SELECT id FROM files WHERE draft_id = 'DR-0001'").all(), []);
});

test('B02 rejects only the exact maximum additionally, and is enabled only in test mode', async t => {
  const ctx = setup(t);
  ctx.bugModes = new Set(['B02']);
  const below = createPdf(5_242_879);
  const exact = createPdf(5_242_880);
  const above = createPdf(5_242_881);
  assert.equal((await upload(ctx, draft, 'id-card', below))?.status, 201);
  await expectError(await upload(ctx, draft, 'id-card', exact), 400, 'FILE_TOO_LARGE');
  await expectError(await upload(ctx, draft, 'id-card', above), 400, 'FILE_TOO_LARGE');
  assert.equal((await upload({ ...ctx, testMode: false }, draft, 'id-card', exact))?.status, 201);
});

test('BR-06: stored bytes and MIME come from actual content independently of the name and declared MIME', async t => {
  const ctx = setup(t);
  const attachments = [
    { bytes: pdf, name: 'document.png', mime: 'application/pdf' },
    { bytes: createJpeg(), name: 'document.pdf', mime: 'image/jpeg' },
    { bytes: createPng(), name: 'document.txt', mime: 'image/png' },
  ];
  for (const { bytes, name, mime } of attachments) {
    const response = await upload(ctx, draft, 'id-card', bytes, name, 'text/plain');
    assert.equal(response?.status, 201);
    const { fileId } = await response!.json();
    const stored = ctx.db.prepare('SELECT name, mime, bytes FROM files WHERE id = ?').get(fileId);
    assert.deepEqual(stored, { name, mime, bytes });
  }
  for (const bytes of [Buffer.from('hello'), Buffer.from('MZ'), Buffer.from('%PD'), Buffer.alloc(0)]) {
    await expectError(await upload(ctx, draft, 'id-card', bytes), 400, 'FILE_TYPE', 'รองรับเฉพาะไฟล์ PDF, JPG, PNG');
  }
  assert.equal(ctx.db.prepare("SELECT id FROM files WHERE draft_id = 'DR-0001'").all().length, 3);
});

test('BR-07: five files across slots are allowed, and deleting a file frees one slot', async t => {
  const ctx = setup(t);
  assert.equal((await upload(ctx))?.status, 201);
  const extras = await Promise.all(Array.from({ length: 5 }, (_, index) =>
    upload(ctx, draft, 'extra', pdf, `extra-${index + 1}.pdf`),
  ));
  assert.deepEqual(extras.map(response => response?.status).sort(), [201, 201, 201, 201, 400]);
  await expectError(extras.find(response => response?.status === 400)!, 400, 'FILE_COUNT', 'แนบได้สูงสุด 5 ไฟล์ต่อคำขอ');
  const { fileId } = await extras.find(response => response?.status === 201)!.json();
  assert.equal((await request(ctx, 'DELETE', `${draft}/${fileId}`))?.status, 204);
  assert.equal(ctx.db.prepare('SELECT * FROM files WHERE id = ?').get(fileId), undefined);
  assert.equal((await upload(ctx, draft, 'extra'))?.status, 201);
  assert.equal(ctx.db.prepare("SELECT id FROM files WHERE draft_id = 'DR-0001'").all().length, 5);
});

test('BR-08: missing labels follow service order and a non-PDF blueprint leaves its slot missing', async t => {
  const ctx = setup(t);
  const check = (draftId: string) => immediate(ctx.db, () => assertRequiredDraftDocuments(ctx.db, draftId));
  assert.throws(() => check('DR-0001'), { code: 'MISSING_DOCS', extra: { missing: ['บัตรประชาชน'] } });
  assert.equal((await upload(ctx))?.status, 201);
  assert.doesNotThrow(() => check('DR-0001'));
  assert.doesNotThrow(() => check('DR-0002'));

  assert.equal((await upload(ctx, construction))?.status, 201);
  assert.throws(() => check('DR-0003'), {
    status: 409, code: 'MISSING_DOCS',
    message: 'ยังขาดเอกสาร: แบบแปลน, โฉนด', extra: { missing: ['แบบแปลน', 'โฉนด'] },
  });
  await expectError(await upload(ctx, construction, 'plan', createJpeg()), 400, 'PLAN_NOT_PDF', 'แบบแปลนต้องเป็นไฟล์ PDF เท่านั้น');
  assert.equal((await upload(ctx, construction, 'deed'))?.status, 201);
  assert.throws(() => check('DR-0003'), {
    status: 409, code: 'MISSING_DOCS', message: 'ยังขาดเอกสาร: แบบแปลน', extra: { missing: ['แบบแปลน'] },
  });
  assert.equal((await upload(ctx, construction, 'plan', pdf, 'blueprint.jpg', 'image/jpeg'))?.status, 201);
  assert.doesNotThrow(() => check('DR-0003'));
});

test('ADI-02: deleting a required file from a pending draft makes the payment guard reject until restored', async t => {
  const ctx = setup(t);
  const check = () => immediate(ctx.db, () => assertRequiredDraftDocuments(ctx.db, 'DR-0002'));
  assert.doesNotThrow(check);
  assert.equal((await request(ctx, 'DELETE', `${pending}/DR-0002-map`))?.status, 204);
  assert.equal(ctx.db.prepare("SELECT * FROM files WHERE id = 'DR-0002-map'").get(), undefined);
  assert.throws(check, {
    status: 409, code: 'MISSING_DOCS', message: 'ยังขาดเอกสาร: แผนที่ตั้ง', extra: { missing: ['แผนที่ตั้ง'] },
  });
  assert.deepEqual(ctx.db.prepare("SELECT status FROM payment_refs WHERE ref = 'PP-0001'").get(), { status: 'PENDING' });
  assert.equal((await upload(ctx, pending, 'map'))?.status, 201);
  assert.doesNotThrow(check);
});

test('Draft file writes reject malformed uploads, foreign owners, paid drafts and mismatched file IDs', async t => {
  const ctx = setup(t);
  const file = `${pending}/DR-0002-map`;
  for (const [actor, status, code] of [
    [null, 401, 'UNAUTHENTICATED'], [admin, 403, 'FORBIDDEN'], [other, 404, 'NOT_FOUND'],
  ] as const) {
    await expectError(await request(ctx, 'POST', pending, 'malformed', actor), status, code);
    await expectError(await request(ctx, 'DELETE', file, undefined, actor), status, code);
  }
  await expectError(await request(ctx, 'POST', pending, 'malformed'), 400, 'INVALID_REQUEST');
  await expectError(await upload(ctx, draft, 'plan'), 400, 'INVALID_REQUEST');
  await expectError(await request(ctx, 'DELETE', `${draft}/DR-0002-map`), 404, 'NOT_FOUND');
  await expectError(await upload(ctx, '/api/drafts/missing/files'), 404, 'NOT_FOUND');
  ctx.db.prepare("UPDATE drafts SET status = 'PAID' WHERE id = 'DR-0002'").run();
  await expectError(await upload(ctx, pending, 'map'), 409, 'INVALID_STATE');
  await expectError(await request(ctx, 'DELETE', file), 409, 'INVALID_STATE');
  assert.equal(await request(ctx, 'POST', '/api/drafts/DR-0002/payment'), null);
  assert.equal(ctx.db.prepare("SELECT id FROM files WHERE draft_id = 'DR-0002'").all().length, 2);
});
