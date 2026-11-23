import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { createSchema } from '../../src/server/db/schema.ts';
import { seed } from '../../src/server/db/seed.ts';
import { listQueue } from '../../src/server/domain/claims.ts';
import { INITIAL_NOW } from '../../src/server/domain/clock.ts';
import type { Context } from '../../src/server/http/context.ts';
import { errorResponse } from '../../src/server/http/errors.ts';
import { handleQueue } from '../../src/server/http/features/queue.ts';
import { issueSession, readSession, SESSION_COOKIE } from '../../src/server/security/session.ts';
import { ACTORS } from '../fixtures/actors.ts';

const keys = { dataKey: Buffer.alloc(32, 1), lookupKey: Buffer.alloc(32, 2), documentKey: Buffer.alloc(32, 3) };
const queuePath = '/api/officer/queue';
const caseNo = (n: number) => `EG-2569-${String(n).padStart(6, '0')}`;
const registryCases = [20, 22, 24, 23, 25, 26, 13, 15, 27, 28, 29, 30, 16, 18, 19, 12, 21];

function harness(t: TestContext, modes: string[] = []) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  createSchema(db);
  seed(db, keys);
  const ctx: Context = { db, keys, testMode: true, bugModes: new Set(modes) };
  const session = (userId: string) => `${SESSION_COOKIE}=${issueSession(db, userId, false)}`;
  function send(path: string, cookie = '', method = 'GET') {
    const request = new Request(`http://localhost${path}`, { method, headers: { cookie } });
    try {
      return handleQueue(request, ctx, readSession(request, db));
    } catch (error) {
      return errorResponse(error);
    }
  }
  function route(path: string, cookie = '', method = 'GET') {
    const response = send(path, cookie, method);
    assert.ok(response, 'queue adapter handles its own routes');
    return response;
  }
  function claim(n: number, cookie = '') {
    return route(`/api/officer/cases/${caseNo(n)}/claim`, cookie, 'POST');
  }
  function caseState(n: number) {
    return db.prepare('SELECT owner, status, first_registry_claimant FROM cases WHERE case_no=?').get(caseNo(n));
  }
  function view(cookie: string, filter?: string) {
    const request = new Request('http://localhost/officer/queue', { headers: { cookie } });
    return listQueue(ctx, readSession(request, db), filter);
  }
  return { ctx, db, session, send, route, claim, caseState, view };
}

async function expectError(response: Response, status: number, code: string, message: string) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { code, message });
}

async function expectOwner(response: Response, owner: string) {
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { owner });
}

test('queue API returns the ordered department scope, filters and masked allowlist', async t => {
  const h = harness(t);
  const reg1 = h.session('off.reg1');
  const reg2 = h.session('off.reg2');
  const head = h.session('head1');
  const works = h.session('off.works1');
  async function readQueue(cookie: string, filter = 'all') {
    const response = h.route(`${queuePath}?filter=${filter}`, cookie);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.doesNotMatch(text, /\d{13}|\d-\d{4}-\d{5}-\d{2}-\d/);
    const body = JSON.parse(text) as { items: ReturnType<typeof listQueue>['items'] };
    assert.deepEqual(Object.keys(body), ['items']);
    for (const item of body.items) {
      assert.deepEqual(Object.keys(item).sort(), [
        'applicantName', 'caseNo', 'dueAt', 'idMasked', 'owner', 'serviceId', 'slaLevel', 'status', 'step',
      ]);
      assert.match(item.idMasked, /^X-XXXX-XXXXX-\d{2}-\d$/);
    }
    return body.items;
  }

  const items = await readQueue(reg1);
  assert.deepEqual(items.map(item => item.caseNo), registryCases.map(caseNo));
  assert.deepEqual(items.slice(0, 3).map(item => item.slaLevel), ['overdue', 'near', 'near']);
  assert.equal(items.find(item => item.caseNo === caseNo(25))?.idMasked, 'X-XXXX-XXXXX-65-9');
  assert.equal(items.find(item => item.caseNo === caseNo(19))?.owner, null);
  assert.deepEqual((await readQueue(reg1, 'unclaimed')).map(item => item.caseNo), [24, 28, 29, 30].map(caseNo));
  assert.deepEqual((await readQueue(reg1, 'mine')).map(item => item.caseNo), [20, 22, 23].map(caseNo));
  assert.deepEqual((await readQueue(reg2, 'mine')).map(item => item.caseNo), [25, 26, 13, 15, 27, 16, 18, 12, 21].map(caseNo));
  assert.deepEqual((await readQueue(works)).map(item => item.caseNo), [caseNo(10)]);
  assert.deepEqual((await readQueue(head)).map(item => item.caseNo), [20, 22, 24, 10, ...registryCases.slice(3)].map(caseNo));
  assert.deepEqual(await readQueue(head, 'mine'), []);
  assert.equal(h.view(head).workloadCount, null);
});

test('queue and claim apply session role and department snapshots', async t => {
  const h = harness(t);
  const registry = h.session('off.reg1');
  h.db.prepare("UPDATE users SET dept='works' WHERE id='off.reg1'").run();
  const works = h.session('off.reg1');
  h.db.prepare("UPDATE users SET role='auditor', dept=NULL WHERE id='off.reg1'").run();
  const auditor = h.session('off.reg1');
  const head = h.session('head1');

  await expectError(h.route(queuePath), 401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ');
  await expectError(h.route(queuePath, auditor), 403, 'FORBIDDEN', 'ไม่มีสิทธิ์ทำรายการนี้');
  await expectError(h.claim(20, head), 403, 'FORBIDDEN', 'ไม่มีสิทธิ์ทำรายการนี้');
  await expectError(h.claim(20, works), 403, 'FORBIDDEN', 'ไม่มีสิทธิ์ทำรายการนี้');
  await expectError(h.claim(99, head), 403, 'FORBIDDEN', 'ไม่มีสิทธิ์ทำรายการนี้');
  await expectError(h.claim(99, registry), 404, 'NOT_FOUND', 'ไม่พบคำขอ');
  assert.equal(h.view(registry).items.length, 17);
  assert.deepEqual(h.view(works).items.map(item => item.caseNo), [caseNo(10)]);
  await expectOwner(h.claim(28, registry), 'off.reg1');
  assert.equal(h.route(queuePath, registry, 'POST').headers.get('Allow'), 'GET');
  assert.equal(h.send(`/api/officer/cases/${caseNo(28)}/return`, registry, 'POST'), null);
});

test('first claim wins, including when the second claimant is at the workload limit', async t => {
  const h = harness(t);
  const reg1 = h.session('off.reg1');
  const reg2 = h.session('off.reg2');
  await expectOwner(h.claim(24, reg2), 'off.reg2');
  assert.equal(h.view(reg2).workloadCount, 10);
  await expectOwner(h.claim(29, reg1), 'off.reg1');

  for (const claimant of [reg2, reg1]) {
    await expectError(h.claim(29, claimant), 409, 'ALREADY_CLAIMED', 'มีเจ้าหน้าที่รับเรื่องนี้แล้ว');
  }
  assert.deepEqual(h.caseState(29), { owner: 'off.reg1', status: 'IN_REVIEW', first_registry_claimant: 'off.reg1' });
  const audit = h.db.prepare('SELECT username, role, time, from_status, to_status FROM audit WHERE event=? AND case_no=?');
  assert.deepEqual(audit.all('CLAIM', caseNo(29)), [
    { username: 'off.reg1', role: 'officer', time: INITIAL_NOW, from_status: 'SUBMITTED', to_status: 'IN_REVIEW' },
  ]);
  const timeline = h.db.prepare('SELECT actor, effective_at FROM timeline WHERE event=? AND case_no=?');
  assert.deepEqual(timeline.all('CLAIM', caseNo(29)), [{ actor: 'off.reg1', effective_at: INITIAL_NOW }]);
});

test('owned IN_REVIEW cases alone count toward the 9 → 10 boundary', async t => {
  const h = harness(t);
  const reg2 = h.session('off.reg2');
  assert.equal(h.view(reg2).workloadCount, 9);
  await expectOwner(h.claim(28, reg2), 'off.reg2');
  assert.equal(h.view(reg2, 'unclaimed').workloadCount, 10);
  await expectError(h.claim(29, reg2), 409, 'WORKLOAD_LIMIT', 'รับงานได้สูงสุด 10 เรื่อง');
  assert.deepEqual(h.caseState(29), { owner: null, status: 'SUBMITTED', first_registry_claimant: null });

  const setStatus = h.db.prepare('UPDATE cases SET status=? WHERE case_no=?');
  setStatus.run('NEED_FIX', caseNo(25));
  assert.equal(h.view(reg2).workloadCount, 9);
  await expectOwner(h.claim(29, reg2), 'off.reg2');
  setStatus.run('IN_REVIEW', caseNo(25));
  assert.equal(h.view(reg2).workloadCount, 11);
  await expectError(h.claim(30, reg2), 409, 'WORKLOAD_LIMIT', 'รับงานได้สูงสุด 10 เรื่อง');
});

test('claiming an unowned works-stage case preserves its original registry claimant', async t => {
  const h = harness(t);
  await expectOwner(h.claim(10, h.session('off.works1')), 'off.works1');
  assert.deepEqual(h.caseState(10), { owner: 'off.works1', status: 'IN_REVIEW', first_registry_claimant: 'off.reg1' });
});

test('a failed CLAIM audit rolls back the owner, first claimant and timeline', async t => {
  const h = harness(t);
  h.db.exec(`
    CREATE TRIGGER fail_claim_audit BEFORE INSERT ON audit WHEN NEW.event = 'CLAIM'
    BEGIN SELECT RAISE(ABORT, 'injected failure'); END
  `);
  await expectError(h.claim(29, h.session('off.reg1')), 500, 'INTERNAL_ERROR', 'Internal server error');
  assert.deepEqual(h.caseState(29), { owner: null, status: 'SUBMITTED', first_registry_claimant: null });
  assert.equal(h.db.prepare("SELECT 1 FROM timeline WHERE event='CLAIM' AND case_no=?").get(caseNo(29)), undefined);
});

test('B08 changes the current holder on a second claim while preserving the first claimant', async t => {
  const h = harness(t, ['B08']);
  await expectOwner(h.claim(29, h.session('off.reg1')), 'off.reg1');
  await expectOwner(h.claim(29, h.session('off.reg2')), 'off.reg2');
  assert.deepEqual(h.caseState(29), { owner: 'off.reg2', status: 'IN_REVIEW', first_registry_claimant: 'off.reg1' });
});

test('B09 adds a full seed identity only to authorized queue JSON in test mode', async t => {
  const h = harness(t, ['B09']);
  const reg1 = h.session('off.reg1');
  const json = await h.route(queuePath, reg1).json();
  const row = json.items.find((item: { caseNo: string }) => item.caseNo === caseNo(25));
  assert.equal(row.idNo, ACTORS.somying.idNo);
  assert.equal(row.idMasked, 'X-XXXX-XXXXX-65-9');
  assert.ok(h.view(reg1).items.every(item => !('idNo' in item)));
  await expectError(h.route(queuePath), 401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ');
  h.ctx.testMode = false;
  assert.doesNotMatch(await h.route(queuePath, reg1).text(), /"idNo"|\d{13}/);
});
