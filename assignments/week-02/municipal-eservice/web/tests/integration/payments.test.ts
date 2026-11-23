import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { Worker } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { openDatabase } from '../../src/server/db/connection.ts';
import { createSchema } from '../../src/server/db/schema.ts';
import { seed } from '../../src/server/db/seed.ts';
import { setClock } from '../../src/server/domain/clock.ts';
import { createDraft } from '../../src/server/domain/drafts.ts';
import { createPayment, getLatestDraftPayment, pay } from '../../src/server/domain/payments.ts';
import { addDraftFile } from '../../src/server/domain/uploads.ts';
import type { Context } from '../../src/server/http/context.ts';
import { errorResponse } from '../../src/server/http/errors.ts';
import { handlePayments } from '../../src/server/http/features/payments.ts';
import { dispatch } from '../../src/server/http/router.ts';
import type { Principal } from '../../src/server/security/policy.ts';

const keys = {
  dataKey: Buffer.alloc(32, 1),
  lookupKey: Buffer.alloc(32, 2),
  documentKey: Buffer.alloc(32, 3),
};
const noBugs = new Set<string>();
const somchai: Principal = {
  userId: 'citizen-somchai', username: 'citizen-somchai', name: 'สมชาย ใจดี',
  role: 'citizen', dept: null, registrationOnly: false,
};
const somying: Principal = { ...somchai, userId: 'citizen-somying', name: 'สมหญิง รักไทย' };
const paid31 = { status: 'PAID', caseNo: 'EG-2569-000031', receiptNo: 'RC-2569-000031', duplicate: false };

function harness(t: TestContext, db = new Database(':memory:')): Context {
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  createSchema(db);
  seed(db, keys);
  return { db, keys, testMode: true, bugModes: noBugs };
}

function citizenRequest(ctx: Context, path: string, method: string, actor: Principal | null = somchai): Response {
  try {
    const response = handlePayments(new Request(`http://localhost${path}`, { method }), ctx, actor);
    assert.ok(response);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

function callback(ctx: Context, ref: string, amount: unknown) {
  return dispatch(new Request(`http://localhost/api/test/payments/${ref}/pay`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  }), ctx);
}

function storedPayment(db: Database.Database, ref: string) {
  return db.prepare('SELECT status, paid_at, case_no FROM payment_refs WHERE ref = ?').get(ref);
}

function attachedDraft(ctx: Context, actor = somchai) {
  const { draftId } = createDraft(ctx.db, actor, { serviceId: 'SV-01', qty: 1 });
  addDraftFile(ctx.db, actor, draftId, { name: 'id-card.pdf', docKey: 'id-card', bytes: Buffer.from('%PDF') });
  return draftId;
}

test('first QR freezes current fee and each new QR uses the frozen amount', async (t) => {
  const ctx = harness(t);
  const { db } = ctx;
  const path = '/api/drafts/DR-0001/payment';
  const response = citizenRequest(ctx, path, 'POST');
  assert.equal(response.status, 409);
  assert.deepEqual((await response.json()).missing, ['บัตรประชาชน']);
  assert.deepEqual(db.prepare("SELECT status, locked_fee FROM drafts WHERE id = 'DR-0001'").get(),
    { status: 'DRAFT', locked_fee: null });
  assert.equal(getLatestDraftPayment(db, somchai, 'DR-0001', true), null);
  assert.equal(citizenRequest(ctx, path, 'POST', somying).status, 404);

  addDraftFile(db, somchai, 'DR-0001', {
    name: 'id-card.pdf', docKey: 'id-card', bytes: Buffer.from('%PDF'),
  });
  db.prepare("UPDATE services SET fee = 25 WHERE id = 'SV-01'").run();
  const first = citizenRequest(ctx, path, 'POST');
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), {
    ref: 'PP-0002', amount: 50,
    qrCreatedAt: '2026-12-01T09:00:00+07:00', qrExpiresAt: '2026-12-01T09:15:00+07:00',
  });
  db.prepare("UPDATE services SET fee = 30, sla_days = 5 WHERE id = 'SV-01'").run();
  db.prepare("INSERT INTO holidays (date, name) VALUES ('2026-12-02', 'test holiday')").run();
  setClock(db, '2026-12-01T09:15:00+07:00');
  const reissued = citizenRequest(ctx, path, 'POST');
  assert.equal(reissued.status, 201);
  assert.deepEqual(await reissued.json(), {
    ref: 'PP-0003', amount: 50,
    qrCreatedAt: '2026-12-01T09:15:00+07:00', qrExpiresAt: '2026-12-01T09:30:00+07:00',
  });
  assert.equal(getLatestDraftPayment(db, somchai, 'DR-0001', true)?.ref, 'PP-0003');
  for (const amount of [49, 51, 60, '50', 50.5]) {
    const mismatch = await callback(ctx, 'PP-0003', amount);
    assert.equal(mismatch.status, 422);
    assert.equal((await mismatch.json()).code, 'AMOUNT_MISMATCH');
  }
  assert.deepEqual(storedPayment(db, 'PP-0003'), { status: 'PENDING', paid_at: null, case_no: null });
  const paid = await callback(ctx, 'PP-0003', 50);
  assert.equal(paid.status, 200);
  assert.deepEqual(await paid.json(), paid31);
  const caseSnapshot = db.prepare(`
    SELECT locked_fee, sla_days_snapshot, due_at, status, current_dept FROM cases WHERE case_no = ?
  `);
  const snapshot = {
    locked_fee: 50, sla_days_snapshot: 5, due_at: '2026-12-11T16:30:00+07:00',
    status: 'SUBMITTED', current_dept: 'registry',
  };
  assert.deepEqual(caseSnapshot.get(paid31.caseNo), snapshot);
  db.prepare("DELETE FROM holidays WHERE date = '2026-12-02'").run();
  assert.deepEqual(caseSnapshot.get(paid31.caseNo), snapshot);
  assert.equal(citizenRequest(ctx, path, 'POST').status, 409);
});

test('payment status is owner-only and the real test hook is gated', async (t) => {
  const ctx = harness(t);
  const path = '/api/payments/PP-0001';
  assert.equal(citizenRequest(ctx, path, 'GET', null).status, 401);
  assert.equal(citizenRequest(ctx, path, 'GET', { ...somchai, registrationOnly: true }).status, 403);
  assert.equal(citizenRequest(ctx, path, 'GET', somying).status, 404);
  assert.equal(citizenRequest(ctx, '/api/payments/PP-9999', 'GET').status, 404);
  assert.equal(citizenRequest(ctx, path, 'POST').status, 405);
  assert.deepEqual(await citizenRequest(ctx, path, 'GET').json(), {
    ref: 'PP-0001', amount: 500, status: 'PENDING',
    qrCreatedAt: '2026-12-01T08:55:00+07:00', qrExpiresAt: '2026-12-01T09:10:00+07:00',
    caseNo: null, receiptNo: null,
  });
  const disabled = await callback({ ...ctx, testMode: false }, 'PP-0001', 500);
  assert.equal(disabled.status, 404);
  assert.equal((await disabled.json()).code, 'NOT_FOUND');
  assert.equal((await callback(ctx, 'PP-9999', 500)).status, 404);
  assert.deepEqual(storedPayment(ctx.db, 'PP-0001'), { status: 'PENDING', paid_at: null, case_no: null });
});

test('QR expires at exactly 900 seconds and B05 changes only that callback instant', async (t) => {
  const ctx = harness(t);
  for (const [time, baseline, mutant] of [
    ['09:09:59', 200, 200],
    ['09:09:59.999', 200, 200],
    ['09:10:00', 410, 200],
    ['09:10:00.001', 410, 410],
    ['09:10:01', 410, 410],
  ] as const) {
    for (const [mode, expected] of [[noBugs, baseline], [new Set(['B05']), mutant]] as const) {
      seed(ctx.db, keys);
      setClock(ctx.db, `2026-12-01T${time}+07:00`);
      const response = await callback({ ...ctx, bugModes: mode }, 'PP-0001', 500);
      assert.equal(response.status, expected, `${time} with B05=${mode.has('B05')}`);
      const status = await citizenRequest(ctx, '/api/payments/PP-0001', 'GET').json();
      if (expected === 200) {
        assert.deepEqual(await response.json(), paid31);
        assert.equal(status.status, 'PAID');
      } else {
        assert.equal((await response.json()).code, 'QR_EXPIRED');
        assert.equal(status.status, 'EXPIRED');
        assert.equal(status.caseNo, null);
        assert.deepEqual(storedPayment(ctx.db, 'PP-0001'), { status: 'PENDING', paid_at: null, case_no: null });
        assert.deepEqual(ctx.db.prepare("SELECT next_value FROM counters WHERE kind = 'case' AND year = 2569").get(),
          { next_value: 31 });
      }
    }
  }
});

test('retry after expiry returns the original receipt and adds no records or numbers', async (t) => {
  const ctx = harness(t);
  const { db } = ctx;
  const regenerated = createPayment(db, somchai, 'DR-0002', true, noBugs);
  assert.deepEqual(await (await callback(ctx, 'PP-0001', 500)).json(), paid31);
  setClock(db, '2026-12-03T10:00:00+07:00');
  for (const ref of ['PP-0001', regenerated.ref]) {
    const response = await callback(ctx, ref, 500);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ...paid31, duplicate: true });
  }
  assert.deepEqual(getLatestDraftPayment(db, somchai, 'DR-0002', true), {
    ...regenerated, status: 'PAID', caseNo: paid31.caseNo,
    receiptNo: paid31.receiptNo, paidAt: '2026-12-01T09:00:00+07:00',
  });
  assert.deepEqual(storedPayment(db, regenerated.ref), { status: 'PENDING', paid_at: null, case_no: null });
  assert.deepEqual(db.prepare('SELECT ref, amount FROM receipts WHERE case_no = ?').all(paid31.caseNo),
    [{ ref: 'PP-0001', amount: 500 }]);
  assert.deepEqual(db.prepare('SELECT event, effective_at, from_status, to_status FROM timeline WHERE case_no = ?')
    .all(paid31.caseNo), [{
    event: 'PAYMENT', effective_at: '2026-12-01T09:00:00+07:00',
    from_status: 'PENDING_PAYMENT', to_status: 'SUBMITTED',
  }]);
  const next = createPayment(db, somchai, attachedDraft(ctx), true, noBugs);
  assert.equal(pay(db, next.ref, next.amount, true, noBugs).caseNo, 'EG-2569-000032');
});

test('a write failure rolls back the fee lock, and a late timeline failure rolls back settlement', (t) => {
  const ctx = harness(t);
  const { db } = ctx;
  const draftId = attachedDraft(ctx);
  db.exec(`CREATE TEMP TRIGGER fail_qr BEFORE INSERT ON payment_refs
    BEGIN SELECT RAISE(ABORT, 'QR write failed'); END;`);
  assert.throws(() => createPayment(db, somchai, draftId, true, noBugs), /QR write failed/);
  assert.deepEqual(db.prepare('SELECT status, locked_fee FROM drafts WHERE id = ?').get(draftId),
    { status: 'DRAFT', locked_fee: null });
  assert.equal(getLatestDraftPayment(db, somchai, draftId, true), null);
  db.exec('DROP TRIGGER fail_qr');
  const qr = createPayment(db, somchai, draftId, true, noBugs);
  assert.equal(qr.ref, 'PP-0002');

  db.exec(`CREATE TEMP TRIGGER fail_timeline BEFORE INSERT ON timeline WHEN NEW.event = 'PAYMENT'
    BEGIN SELECT RAISE(ABORT, 'timeline write failed'); END;`);
  assert.throws(() => pay(db, qr.ref, qr.amount, true, noBugs), /timeline write failed/);
  for (const table of ['cases', 'receipts', 'timeline', 'case_departments']) {
    assert.equal(db.prepare(`SELECT 1 FROM ${table} WHERE case_no = ?`).get(paid31.caseNo), undefined, table);
  }
  assert.deepEqual(storedPayment(db, qr.ref), { status: 'PENDING', paid_at: null, case_no: null });
  assert.deepEqual(db.prepare('SELECT status FROM drafts WHERE id = ?').get(draftId), { status: 'PENDING_PAYMENT' });
  assert.deepEqual(db.prepare('SELECT case_no FROM files WHERE draft_id = ?').get(draftId), { case_no: null });
  db.exec('DROP TRIGGER fail_timeline');
  assert.deepEqual(pay(db, qr.ref, qr.amount, true, noBugs), paid31);
  assert.deepEqual(db.prepare('SELECT case_no FROM files WHERE draft_id = ?').get(draftId), { case_no: paid31.caseNo });
});

test('numbering uses the Bangkok payment year even when a QR crosses midnight', (t) => {
  const { db } = harness(t);
  setClock(db, '2026-12-31T23:58:00+07:00');
  const first = createPayment(db, somchai, 'DR-0002', true, noBugs);
  const nextDraft = createDraft(db, somchai, { serviceId: 'SV-01' }).draftId;
  addDraftFile(db, somchai, nextDraft, { name: 'id.pdf', docKey: 'id-card', bytes: Buffer.from('%PDF') });
  const next = createPayment(db, somchai, nextDraft, true, noBugs);
  setClock(db, '2026-12-31T23:59:59+07:00');
  assert.deepEqual(pay(db, first.ref, first.amount, true, noBugs), paid31);
  setClock(db, '2026-12-31T17:00:00Z');
  const result = pay(db, next.ref, next.amount, true, noBugs);
  assert.deepEqual(result, {
    status: 'PAID', caseNo: 'EG-2570-000001', receiptNo: 'RC-2570-000001', duplicate: false,
  });
  assert.deepEqual(db.prepare('SELECT paid_at, due_at FROM cases WHERE case_no = ?').get(result.caseNo),
    { paid_at: '2027-01-01T00:00:00+07:00', due_at: '2027-01-07T16:30:00+07:00' });
});

test('parallel SQLite connections issue six matched EG/RC pairs for seven callbacks including a retry', {
  timeout: 30_000,
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'civic-b05-'));
  const dbPath = join(directory, 'payments.sqlite');
  const ctx = harness(t, openDatabase(dbPath));
  const refs = Array.from({ length: 6 }, (_, index) => {
    const actor = index < 3 ? somchai : somying;
    return createPayment(ctx.db, actor, attachedDraft(ctx, actor), true, noBugs).ref;
  });
  refs.push(refs[0]);
  const gate = new Int32Array(new SharedArrayBuffer(4));
  let ready = 0;
  const workers: Worker[] = [];
  t.after(async () => {
    await Promise.all(workers.map((worker) => worker.terminate()));
    rmSync(directory, { recursive: true, force: true });
  });
  const results = await Promise.all(refs.map((ref) => new Promise<ReturnType<typeof pay>>((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        const { openDatabase } = await import(workerData.connectionUrl);
        const { pay } = await import(workerData.paymentsUrl);
        const db = openDatabase(workerData.dbPath);
        try {
          parentPort.postMessage('ready');
          if (Atomics.wait(workerData.gate, 0, 0, 15_000) === 'timed-out') throw new Error('Payment test gate timed out');
          parentPort.postMessage(pay(db, workerData.ref, 20, true, new Set()));
        } finally {
          db.close();
        }
      })().catch(error => { throw error; });
    `, {
      eval: true,
      workerData: {
        dbPath, gate, ref,
        connectionUrl: import.meta.resolve('../../src/server/db/connection.ts'),
        paymentsUrl: import.meta.resolve('../../src/server/domain/payments.ts'),
      },
    });
    workers.push(worker);
    worker.on('message', message => {
      if (message === 'ready') {
        ready++;
        if (ready === refs.length) {
          Atomics.store(gate, 0, 1);
          Atomics.notify(gate, 0);
        }
      } else {
        resolve(message);
      }
    });
    worker.once('error', reject);
    worker.once('exit', code => reject(new Error(`Payment worker exited before returning a result (${code})`)));
  })));
  const expected = Array.from({ length: 6 }, (_, index) => `2569-${String(31 + index).padStart(6, '0')}`);
  const firstCallbacks = results.filter(({ duplicate }) => !duplicate);
  assert.deepEqual(firstCallbacks.map(({ caseNo }) => caseNo).sort(), expected.map((suffix) => `EG-${suffix}`));
  assert.deepEqual(firstCallbacks.map(({ receiptNo }) => receiptNo).sort(), expected.map((suffix) => `RC-${suffix}`));
  for (const { caseNo, receiptNo } of results) assert.equal(caseNo.slice(3), receiptNo.slice(3));
  assert.equal(results[0].caseNo, results[6].caseNo);
  assert.notEqual(results[0].duplicate, results[6].duplicate);
  assert.deepEqual(ctx.db.prepare("SELECT next_value FROM counters WHERE kind = 'case' AND year = 2569").get(),
    { next_value: 37 });
});
