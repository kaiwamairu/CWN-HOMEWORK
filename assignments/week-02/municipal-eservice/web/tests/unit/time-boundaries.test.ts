// B14 · time boundaries across integrated features, driven only through the assembled router and
// the TEST_MODE clock hook (never the host clock). Each boundary is checked at both sides.
// Sources: BR-10 (QR 900 s), A-44/BR-13 (fix window 168 h), CONTRACT 4.2 (16:30:00 on time /
// 16:30:01 overdue), BR-23 (document valid through its last day), AUTH lock 15 min.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { createSchema } from '../../src/server/db/schema.ts';
import { seed } from '../../src/server/db/seed.ts';
import type { Context } from '../../src/server/http/context.ts';
import { dispatch } from '../../src/server/http/router.ts';
import { evaluateLifecycle } from '../../src/server/domain/lifecycle.ts';

const keys = { dataKey: Buffer.alloc(32, 1), lookupKey: Buffer.alloc(32, 2), documentKey: Buffer.alloc(32, 3) };

function harness(modes: string[] = []) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  seed(db, keys);
  const ctx: Context = { db, keys, testMode: true, bugModes: new Set(modes) };
  /** Same order as the custom server: lifecycle first (except /api/test/*), then dispatch. */
  async function call(method: string, path: string, cookie = '', body?: unknown) {
    if (!path.startsWith('/api/test/')) evaluateLifecycle(db, true, ctx.bugModes);
    const response = await dispatch(new Request(`http://127.0.0.1${path}`, {
      method, headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), ctx);
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  }
  const clock = async (now: string) => assert.equal((await call('PUT', '/api/test/clock', '', { now })).status, 200);
  async function citizen(idNo: string) {
    await call('POST', '/api/auth/thaid/start', '', { idNo });
    const r = await call('POST', '/api/auth/thaid/verify', '', { idNo, otp: '123456' });
    assert.equal(r.status, 200);
    return r.headers.get('set-cookie')!.split(';')[0]!;
  }
  async function staff(username: string) {
    const r = await call('POST', '/api/auth/staff/login', '', { username, password: 'Test@1234' });
    assert.equal(r.status, 200);
    return r.headers.get('set-cookie')!.split(';')[0]!;
  }
  return { db, call, clock, citizen, staff, close: () => db.close() };
}

test('BR-10: PP-0001 (created 08:55:00) pays at 09:09:59 but is 410 QR_EXPIRED at exactly 09:10:00', async () => {
  const before = harness();
  try {
    await before.clock('2026-12-01T09:09:59+07:00');
    const paid = await before.call('POST', '/api/test/payments/PP-0001/pay', '', { amount: 500 });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.status, 'PAID');
  } finally { before.close(); }
  const at = harness();
  try {
    await at.clock('2026-12-01T09:10:00+07:00');
    const expired = await at.call('POST', '/api/test/payments/PP-0001/pay', '', { amount: 500 });
    assert.equal(expired.status, 410);
    assert.equal(expired.body.code, 'QR_EXPIRED');
  } finally { at.close(); }
});

test('BUGS B05: with the mutant the 09:10:00 edge is accepted, 09:10:01 is still 410', async () => {
  const edge = harness(['B05']);
  try {
    await edge.clock('2026-12-01T09:10:00+07:00');
    assert.equal((await edge.call('POST', '/api/test/payments/PP-0001/pay', '', { amount: 500 })).status, 200);
  } finally { edge.close(); }
  const after = harness(['B05']);
  try {
    await after.clock('2026-12-01T09:10:01+07:00');
    assert.equal((await after.call('POST', '/api/test/payments/PP-0001/pay', '', { amount: 500 })).status, 410);
  } finally { after.close(); }
});

test('A-44: …000017 resubmits one second before fix_deadline; at the deadline it is FIX_WINDOW_EXPIRED and CANCELLED', async () => {
  const probe = harness();
  const deadline = (probe.db.prepare("SELECT fix_deadline FROM cases WHERE case_no='EG-2569-000017'").get() as { fix_deadline: string }).fix_deadline;
  probe.close();
  const minus1 = new Date(Date.parse(deadline) - 1000).toISOString();
  const early = harness();
  try {
    await early.clock(minus1);
    const somchai = await early.citizen('1101700123456');
    const r = await early.call('POST', '/api/cases/EG-2569-000017/resubmit', somchai, {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, 'IN_REVIEW');
  } finally { early.close(); }
  const late = harness();
  try {
    await late.clock(deadline);
    const somchai = await late.citizen('1101700123456');
    const r = await late.call('POST', '/api/cases/EG-2569-000017/resubmit', somchai, {});
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'FIX_WINDOW_EXPIRED');
    const row = late.db.prepare("SELECT status,closed_at FROM cases WHERE case_no='EG-2569-000017'").get() as { status: string; closed_at: string };
    assert.equal(row.status, 'CANCELLED');
    assert.equal(Date.parse(row.closed_at), Date.parse(deadline));
  } finally { late.close(); }
});

test('CONTRACT 4.2: a case due 16:30 is not overdue at 16:30:00 and is overdue at 16:30:01 (same API, same case)', async () => {
  const h = harness();
  try {
    const due = (h.db.prepare("SELECT due_at FROM cases WHERE case_no='EG-2569-000025'").get() as { due_at: string }).due_at;
    assert.match(due, /T16:30:00\+07:00$/);
    const reg2 = await h.staff('off.reg2');
    await h.clock(due);
    const onTime = await h.call('GET', '/api/cases/EG-2569-000025', reg2);
    assert.notEqual(onTime.body.slaLevel, 'overdue');
    await h.clock(due.replace('16:30:00', '16:30:01'));
    const late = await h.call('GET', '/api/cases/EG-2569-000025', reg2);
    assert.equal(late.body.slaLevel, 'overdue');
  } finally { h.close(); }
});

test('BR-23: seed DOC-2569-000001 is VALID on its last valid day and EXPIRED from 00:00 the next Bangkok day', async () => {
  const h = harness();
  try {
    const first = await h.call('GET', '/api/verify/K7M2Q9XA');
    assert.equal(first.status, 200);
    const last = first.body.validUntil as string;
    await h.clock(`${last}T23:59:59+07:00`);
    assert.equal((await h.call('GET', '/api/verify/K7M2Q9XA')).body.result, 'VALID');
    const next = new Date(Date.parse(`${last}T00:00:00+07:00`) + 86_400_000);
    const nextDay = new Date(next.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    await h.clock(`${nextDay}T00:00:00+07:00`);
    assert.equal((await h.call('GET', '/api/verify/K7M2Q9XA')).body.result, 'EXPIRED');
  } finally { h.close(); }
});

test('AUTH: the third wrong OTP locks for 15 minutes; locked at +14:59, unlocked at +15:00', async () => {
  const h = harness();
  try {
    const idNo = '1101700123456';
    await h.call('POST', '/api/auth/thaid/start', '', { idNo });
    for (let i = 0; i < 2; i++) assert.equal((await h.call('POST', '/api/auth/thaid/verify', '', { idNo, otp: '000000' })).status, 401);
    const locked = await h.call('POST', '/api/auth/thaid/verify', '', { idNo, otp: '000000' });
    assert.equal(locked.status, 423);
    const until = Date.parse(locked.body.lockedUntil as string);
    assert.equal(until - Date.parse('2026-12-01T09:00:00+07:00'), 15 * 60_000);
    await h.clock(new Date(until - 1000).toISOString());
    assert.equal((await h.call('POST', '/api/auth/thaid/start', '', { idNo })).status, 423);
    await h.clock(new Date(until).toISOString());
    assert.equal((await h.call('POST', '/api/auth/thaid/start', '', { idNo })).status, 200);
  } finally { h.close(); }
});
