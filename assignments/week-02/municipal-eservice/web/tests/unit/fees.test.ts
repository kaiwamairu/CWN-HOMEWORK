import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { immediate } from '../../src/server/db/connection.ts';
import { createSchema } from '../../src/server/db/schema.ts';
import { seed } from '../../src/server/db/seed.ts';
import { calculateFee, lockDraftFee, type ServiceFeeRates } from '../../src/server/domain/fees.ts';
import type { Context } from '../../src/server/http/context.ts';
import { HttpError, errorResponse } from '../../src/server/http/errors.ts';
import { handleDrafts } from '../../src/server/http/features/drafts.ts';
import type { Principal } from '../../src/server/security/policy.ts';

const sv01: ServiceFeeRates = { id: 'SV-01', fee: 20, fee_base: 0, fee_per_sqm: 0 };
const sv02: ServiceFeeRates = { id: 'SV-02', fee: 500, fee_base: 0, fee_per_sqm: 0 };
const sv03: ServiceFeeRates = { id: 'SV-03', fee: 0, fee_base: 1_000, fee_per_sqm: 10 };
const b01 = new Set(['B01']);

test('BR-04: SV-01 defaults to one copy and accepts integer quantities 1–5', () => {
  assert.deepEqual(calculateFee(sv01), { fee: 20, qty: 1, areaSqm: null });
  for (const [qty, fee] of [[1, 20], [2, 40], [3, 60], [4, 80], [5, 100]]) {
    assert.deepEqual(calculateFee(sv01, { qty }), { fee, qty, areaSqm: null });
  }
  for (const qty of [-1, 0, 6, 1.5, '2', null, NaN]) {
    assert.throws(() => calculateFee(sv01, { qty }), { code: 'INVALID_QTY', status: 400 });
  }
});

test('BR-05: SV-02 uses the fixed current rate, with no fee inputs', () => {
  assert.deepEqual(calculateFee(sv02), { fee: 500, qty: null, areaSqm: null });
  assert.deepEqual(calculateFee({ ...sv02, fee: 600 }, { qty: 5, areaSqm: 101 }, b01), {
    fee: 600, qty: null, areaSqm: null,
  });
});

test('TC-FEE-01: SV-03 validates integer areas and applies the rate above 100 sqm', () => {
  for (const [areaSqm, fee] of [[1, 1_000], [100, 1_000], [101, 1_010], [102, 1_020],
    [250, 2_500], [300, 3_000], [499, 4_990], [500, 5_000]]) {
    assert.deepEqual(calculateFee(sv03, { areaSqm }), { fee, qty: null, areaSqm });
  }
  for (const areaSqm of [-1, 0, 1.5, '101', null, undefined, NaN]) {
    assert.throws(() => calculateFee(sv03, { areaSqm }), { code: 'INVALID_AREA', status: 400 });
  }
  assert.throws(() => calculateFee(sv03, { areaSqm: 501 }), { code: 'AREA_TOO_LARGE', status: 400 });
});

test('B01 changes only the 101 sqm quote', () => {
  for (let areaSqm = 1; areaSqm <= 500; areaSqm++) {
    const baseline = calculateFee(sv03, { areaSqm });
    const expected = areaSqm === 101 ? { ...baseline, fee: 1_000 } : baseline;
    assert.deepEqual(calculateFee(sv03, { areaSqm }, b01), expected, `area ${areaSqm}`);
  }
  assert.deepEqual(calculateFee(sv01, { qty: 2 }, b01), calculateFee(sv01, { qty: 2 }));
  assert.deepEqual(calculateFee(sv02, {}, b01), calculateFee(sv02));
});

const owner: Principal = {
  userId: 'citizen-somchai', username: '', name: '', role: 'citizen', dept: null, registrationOnly: false,
};
const other = { ...owner, userId: 'citizen-somying' };
const admin = { ...owner, userId: 'admin1', role: 'admin' };

function setup(t: TestContext): Context {
  const db = new Database(':memory:');
  t.after(() => { db.close(); });
  db.pragma('foreign_keys = ON');
  createSchema(db);
  const keys = { dataKey: Buffer.alloc(32, 1), lookupKey: Buffer.alloc(32, 2), documentKey: Buffer.alloc(32, 3) };
  seed(db, keys);
  return { db, keys, testMode: true, bugModes: new Set() };
}

async function request(ctx: Context, method: string, path: string, body?: unknown, actor: Principal | null = owner) {
  const input = new Request(`http://localhost${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
  try {
    const response = await handleDrafts(input, ctx, actor);
    assert.ok(response);
    return response;
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    throw error;
  }
}

test('CONTRACT §6.2 and ADI-01/03: create, list, reopen and edit saved drafts without issuing a case number', async t => {
  const ctx = setup(t);
  const collection = '/api/drafts';
  const invalid = await request(ctx, 'POST', collection, { serviceId: 'SV-01', qty: 0 });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { code: 'INVALID_QTY', message: 'จำนวนฉบับต้อง 1–5 ฉบับ' });

  const created = await request(ctx, 'POST', collection, { serviceId: 'SV-01', qty: 3, fee: 0 });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { draftId: 'DR-0003', fee: 60 });
  const list = await request(ctx, 'GET', collection);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), { items: [
    { draftId: 'DR-0003', serviceId: 'SV-01', status: 'DRAFT', fee: 60 },
    { draftId: 'DR-0002', serviceId: 'SV-02', status: 'PENDING_PAYMENT', fee: 500 },
    { draftId: 'DR-0001', serviceId: 'SV-01', status: 'DRAFT', fee: 40 },
  ] });

  const edited = await request(ctx, 'PATCH', `${collection}/DR-0003`, {
    qty: 5, serviceId: 'SV-02', applicant: other.userId, locked_fee: 0,
  });
  assert.equal(edited.status, 200);
  const expected = { draftId: 'DR-0003', serviceId: 'SV-01', status: 'DRAFT', fee: 100, qty: 5, files: [] };
  assert.deepEqual(await edited.json(), expected);
  const failedEdit = await request(ctx, 'PATCH', `${collection}/DR-0003`, { qty: 6 });
  assert.equal(failedEdit.status, 400);
  assert.deepEqual(await (await request(ctx, 'GET', `${collection}/DR-0003`)).json(), expected);
  assert.deepEqual(ctx.db.prepare('SELECT COUNT(*) AS count FROM cases').get(), { count: 30 });
  assert.deepEqual(ctx.db.prepare("SELECT next_value FROM counters WHERE kind = 'case' AND year = 2569").get(), { next_value: 31 });
});

test('BR-22: draft access is owner-only and wrong-role requests cannot create drafts', async t => {
  const ctx = setup(t);
  assert.equal((await request(ctx, 'POST', '/api/drafts', { serviceId: 'SV-01' }, null)).status, 401);
  assert.equal((await request(ctx, 'POST', '/api/drafts', { serviceId: 'SV-01' }, admin)).status, 403);
  assert.deepEqual(await (await request(ctx, 'GET', '/api/drafts', undefined, other)).json(), { items: [] });
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    for (const id of ['DR-0001', 'DR-9999']) {
      const result = await request(ctx, method, `/api/drafts/${id}`, method === 'PATCH' ? { qty: 3 } : undefined, other);
      assert.equal(result.status, 404);
      assert.deepEqual(await result.json(), { code: 'NOT_FOUND', message: 'ไม่พบคำขอ' });
    }
  }
  assert.equal(await handleDrafts(new Request('http://localhost/api/drafts/DR-0001/payment', { method: 'POST' }), ctx, owner), null);
});

test('BR-11: first QR locks current rates and later QR requests keep the stored amount', async t => {
  const ctx = setup(t);
  const { db } = ctx;
  const draft = '/api/drafts/DR-0001';
  db.prepare("UPDATE services SET fee = 25 WHERE id = 'SV-01'").run();
  db.prepare("UPDATE services SET fee = 600 WHERE id = 'SV-02'").run();
  assert.equal((await (await request(ctx, 'GET', draft)).json()).fee, 50);
  assert.throws(() => immediate(db, () => lockDraftFee(db, other, 'DR-0001')), { code: 'NOT_FOUND' });
  assert.throws(() => immediate(db, () => {
    assert.equal(lockDraftFee(db, owner, 'DR-0001'), 50);
    throw new Error('Could not create QR');
  }), /Could not create QR/);
  assert.deepEqual(db.prepare("SELECT status, locked_fee FROM drafts WHERE id = 'DR-0001'").get(), {
    status: 'DRAFT', locked_fee: null,
  });

  assert.equal(immediate(db, () => lockDraftFee(db, owner, 'DR-0001')), 50);
  db.prepare("UPDATE services SET fee = 30 WHERE id = 'SV-01'").run();
  assert.equal(immediate(db, () => lockDraftFee(db, owner, 'DR-0001')), 50);
  assert.equal(immediate(db, () => lockDraftFee(db, owner, 'DR-0002')), 500);
  const edit = await request(ctx, 'PATCH', draft, { qty: 3 });
  assert.equal(edit.status, 409);
  assert.equal((await edit.json()).code, 'INVALID_STATE');
  assert.deepEqual(await (await request(ctx, 'GET', draft)).json(), {
    draftId: 'DR-0001', serviceId: 'SV-01', status: 'PENDING_PAYMENT', fee: 50, qty: 2, files: [],
  });
});

test('B01 applies consistently to draft creation and first fee lock in test mode', async t => {
  const ctx = setup(t);
  ctx.bugModes = b01;
  const body = { serviceId: 'SV-03', areaSqm: 101 };
  const mutated = await request(ctx, 'POST', '/api/drafts', body);
  assert.deepEqual(await mutated.json(), { draftId: 'DR-0003', fee: 1_000 });
  assert.equal(immediate(ctx.db, () => lockDraftFee(ctx.db, owner, 'DR-0003', b01)), 1_000);
  const production = await request({ ...ctx, testMode: false }, 'POST', '/api/drafts', body);
  assert.deepEqual(await production.json(), { draftId: 'DR-0004', fee: 1_010 });
});

test('TC-SUBMIT-03: deleting an unpaid draft removes every ref and attachment without reusing its ID', async t => {
  const ctx = setup(t);
  const { db } = ctx;
  const pending = '/api/drafts/DR-0002';
  const detail = await (await request(ctx, 'GET', pending)).json();
  assert.deepEqual(detail.files.map(({ docKey }: { docKey: string }) => docKey), ['id-card', 'map']);
  assert.ok(detail.files.every((file: object) => Object.keys(file).sort().join() === 'docKey,fileId,name,size'));
  db.prepare(`INSERT INTO payment_refs (ref,draft_id,amount,created_at,expires_at,status)
    SELECT 'PP-0002',draft_id,amount,created_at,expires_at,'EXPIRED' FROM payment_refs WHERE ref = 'PP-0001'`).run();

  assert.equal((await request(ctx, 'DELETE', '/api/drafts/DR-0001')).status, 204);
  assert.equal((await request(ctx, 'DELETE', pending)).status, 204);
  assert.equal((await request(ctx, 'GET', pending)).status, 404);
  assert.deepEqual(db.prepare("SELECT ref FROM payment_refs WHERE draft_id = 'DR-0002'").all(), []);
  assert.deepEqual(db.prepare("SELECT id FROM files WHERE draft_id = 'DR-0002'").all(), []);
  assert.deepEqual(db.prepare('SELECT COUNT(*) AS count FROM cases').get(), { count: 30 });

  const created = await request(ctx, 'POST', '/api/drafts', { serviceId: 'SV-01' });
  assert.deepEqual(await created.json(), { draftId: 'DR-0003', fee: 20 });
  assert.equal((await request(ctx, 'DELETE', '/api/drafts/DR-0003')).status, 204);
  const next = await request(ctx, 'POST', '/api/drafts', { serviceId: 'SV-02' });
  assert.deepEqual(await next.json(), { draftId: 'DR-0004', fee: 500 });
});

test('Paid draft records stay out of the saved-draft list and reject mutation', async t => {
  const ctx = setup(t);
  ctx.db.prepare("UPDATE drafts SET status = 'PAID' WHERE id = 'DR-0002'").run();
  const list = await request(ctx, 'GET', '/api/drafts');
  assert.deepEqual(await list.json(), { items: [{ draftId: 'DR-0001', serviceId: 'SV-01', status: 'DRAFT', fee: 40 }] });
  for (const [method, body] of [['DELETE', undefined], ['PATCH', {}]] as const) {
    const result = await request(ctx, method, '/api/drafts/DR-0002', body);
    assert.equal(result.status, 409);
    assert.equal((await result.json()).code, 'INVALID_STATE');
  }
});
