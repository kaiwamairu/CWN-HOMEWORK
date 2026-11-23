import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { openDatabase } from '../../src/server/db/connection.ts';
import { seed } from '../../src/server/db/seed.ts';
import { setClock } from '../../src/server/domain/clock.ts';
import {
  closedOnTime,
  formatThaiDate,
  formatThaiDateTime,
  initialDueAt,
  remainingBusinessDays,
  resubmissionDueAt,
  SLA_LEVEL_LABELS,
  slaCalendar,
  slaLevelAt,
  slaView,
} from '../../src/server/domain/sla.ts';
import { evaluateLifecycle, triggersLifecycle } from '../../src/server/domain/lifecycle.ts';
import { countNotifications, listNotifications, notificationText } from '../../src/server/domain/notifications.ts';
import { handleNotifications } from '../../src/server/http/features/notifications.ts';
import { createCivicServer } from '../../src/server/http/server.ts';

const keys = { dataKey: Buffer.alloc(32, 11), lookupKey: Buffer.alloc(32, 22), documentKey: Buffer.alloc(32, 33) };
const NONE = new Set<string>();
const B03 = new Set(['B03']);
const B04 = new Set(['B04']);
const at = (local: string) => `${local.replace(' ', 'T')}${local.length === 16 ? ':00' : ''}+07:00`;
const due = (date: string) => `${date}T16:30:00+07:00`;
const no = (n: number) => `EG-2569-${String(n).padStart(6, '0')}`;

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'civic-sla-'));
  const db = openDatabase(join(dir, 'db.sqlite'));
  seed(db, keys);
  return { db, close() { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
type Db = ReturnType<typeof harness>['db'];
function withDb(work: (db: Db) => void) {
  const h = harness();
  try { work(h.db); } finally { h.close(); }
}
function pairsFor(db: Db, user: string): string[] {
  return listNotifications(db, user).map((n) => `${n.caseNo.slice(-6)}:${n.level}`).sort();
}
function caseRow(db: Db, n: number) {
  return db.prepare('SELECT due_at,status FROM cases WHERE case_no=?').get(no(n)) as { due_at: string; status: string };
}

describe('initial due date: D0, 16:30 cutoff and holidays (DECISIONS §8 · TC-SLA-01)', () => {
  const rows: [string, string, number, string][] = [
    ['DEC row 1 / a', '2026-12-01 09:00', 3, '2026-12-04'],
    ['DEC row 2 / b', '2026-12-01 16:29', 3, '2026-12-04'],
    ['16:29:59 is still before cutoff', '2026-12-01 16:29:59', 3, '2026-12-04'],
    ['DEC row 3 / c (16:30:00 → next business day)', '2026-12-01 16:30', 3, '2026-12-08'],
    ['DEC row 4 / d', '2026-12-04 10:00', 3, '2026-12-11'],
    ['DEC row 5 / e (Saturday)', '2026-12-05 10:00', 3, '2026-12-14'],
    ['f SV-02', '2026-12-01 09:00', 10, '2026-12-17'],
    ['g SV-03', '2026-12-01 09:00', 15, '2026-12-24'],
    ['h year boundary', '2026-12-29 10:00', 3, '2027-01-05'],
    ['i 31 Dec 23:59 (holiday, after cutoff)', '2026-12-31 23:59', 3, '2027-01-07'],
    ['holiday Monday morning (D0 = Tue 8)', '2026-12-07 09:00', 3, '2026-12-14'],
    ['seed F01 base', '2026-11-23 10:00', 3, '2026-11-26'],
    ['seed R07 16:29', '2026-11-30 16:29', 3, '2026-12-03'],
    ['seed R06 16:30', '2026-11-30 16:30', 3, '2026-12-04'],
  ];
  for (const [label, paid, days, expected] of rows) {
    it(label, () => withDb((db) => assert.equal(initialDueAt(db, at(paid), days, NONE), due(expected))));
  }
  it('accepts other explicit offsets and normalizes to Bangkok', () => withDb((db) => {
    assert.equal(initialDueAt(db, '2026-12-01T09:29:59Z', 3, NONE), due('2026-12-04'));
    assert.equal(initialDueAt(db, '2026-12-01T09:30:00Z', 3, NONE), due('2026-12-08'));
  }));
  it('every seeded open case due date matches the seeded calendar', () => withDb((db) => {
    const rowsDb = db.prepare("SELECT case_no,paid_at,sla_days_snapshot,due_at FROM cases WHERE case_no NOT IN('EG-2569-000017','EG-2569-000023')").all() as { case_no: string; paid_at: string; sla_days_snapshot: number; due_at: string }[];
    for (const r of rowsDb) assert.equal(initialDueAt(db, r.paid_at, r.sla_days_snapshot, NONE), r.due_at, r.case_no);
  }));
  it('uses the holiday table as stored now (admin additions apply to new payments)', () => withDb((db) => {
    db.prepare("INSERT INTO holidays VALUES('2026-12-02','ทดสอบ')").run();
    assert.equal(initialDueAt(db, at('2026-12-01 09:00'), 3, NONE), due('2026-12-08'));
  }));
});

describe('B03: weekend-only calendar for initial, extension and remaining values (BUGS B03)', () => {
  const rows: [string, number, string][] = [
    ['2026-12-01 16:30', 3, '2026-12-07'],
    ['2026-12-04 10:00', 3, '2026-12-09'],
    ['2026-12-05 10:00', 3, '2026-12-10'],
    ['2026-12-29 10:00', 3, '2027-01-01'],
    ['2026-12-31 23:59', 3, '2027-01-06'],
    ['2026-12-01 09:00', 3, '2026-12-04'],
  ];
  for (const [paid, days, expected] of rows) {
    it(`paid ${paid} → ${expected}`, () => withDb((db) => assert.equal(initialDueAt(db, at(paid), days, B03), due(expected))));
  }
  it('pause row 6 extends to 7 Dec instead of 8 Dec', () => withDb((db) => {
    const pause = { dueAt: due('2026-12-04'), returnedAt: at('2026-12-02 11:00'), resubmittedAt: at('2026-12-03 10:00') };
    assert.equal(resubmissionDueAt(db, pause, B03), due('2026-12-07'));
    assert.equal(resubmissionDueAt(db, pause, NONE), due('2026-12-08'));
  }));
  it('remaining days for …000016 at Fri 4 Dec 09:00: normal under B03, near when correct', () => withDb((db) => {
    const r = caseRow(db, 16);
    assert.equal(slaLevelAt(at('2026-12-04 09:00'), r.due_at, r.status, slaCalendar(db, B03)), 'normal');
    assert.equal(slaLevelAt(at('2026-12-04 09:00'), r.due_at, r.status, slaCalendar(db, NONE)), 'near');
    assert.equal(slaCalendar(db, B03).size, 0);
    assert.equal(slaCalendar(db, NONE).size, 4);
  }));
});

describe('pause extension (B04 · TC-SLA-02 · TEST-DATA 4.4)', () => {
  const rows: [string, string, string, string, string][] = [
    ['part 1 / DEC row 6', '2026-12-04', '2026-12-02 11:00', '2026-12-03 10:00', '2026-12-08'],
    ['part 2 seed F01 resubmitted 1 Dec 09:00', '2026-11-27', '2026-11-27 14:00', '2026-12-01 09:00', '2026-12-01'],
    ['part 3 seed F01 resubmitted 4 Dec 10:00', '2026-11-27', '2026-11-27 14:00', '2026-12-04 10:00', '2026-12-04'],
    ['part 4 same-day return and resubmit', '2026-12-04', '2026-12-02 09:00', '2026-12-02 15:00', '2026-12-04'],
    ['part 5 across weekend+holiday, resubmit after 16:30', '2026-12-04', '2026-12-04 10:00', '2026-12-08 17:00', '2026-12-08'],
    ['F01 first return history', '2026-11-26', '2026-11-24 11:00', '2026-11-25 10:00', '2026-11-27'],
    ['F02 first return history', '2026-12-01', '2026-11-27 10:00', '2026-11-30 10:00', '2026-12-02'],
    ['F02 second return history', '2026-12-02', '2026-11-30 14:00', '2026-12-01 08:30', '2026-12-03'],
  ];
  for (const [label, stored, returned, resubmitted, expected] of rows) {
    it(label, () => withDb((db) => {
      const pause = { dueAt: due(stored), returnedAt: at(returned), resubmittedAt: at(resubmitted) };
      assert.equal(resubmissionDueAt(db, pause, NONE), due(expected));
      assert.equal(resubmissionDueAt(db, pause, B04), due(stored), 'B04 keeps the stored due date');
    }));
  }
  it('levels right after resubmission match TC-SLA-02', () => withDb((db) => {
    const cal = slaCalendar(db, NONE);
    assert.equal(slaLevelAt(at('2026-12-03 10:00'), due('2026-12-08'), 'IN_REVIEW', cal), 'normal');
    assert.equal(slaLevelAt(at('2026-12-01 09:00'), due('2026-12-01'), 'IN_REVIEW', cal), 'near');
    assert.equal(slaLevelAt(at('2026-12-04 10:00'), due('2026-12-04'), 'IN_REVIEW', cal), 'near');
    assert.equal(slaLevelAt(at('2026-12-08 17:00'), due('2026-12-08'), 'IN_REVIEW', cal), 'overdue');
    assert.equal(slaLevelAt(at('2026-12-01 09:00'), due('2026-11-27'), 'IN_REVIEW', cal), 'overdue', 'B04 symptom');
  }));
  it('extension uses the holiday table at resubmission time (A-42)', () => withDb((db) => {
    db.prepare("INSERT INTO holidays VALUES('2026-12-08','ทดสอบ')").run();
    const pause = { dueAt: due('2026-12-04'), returnedAt: at('2026-12-02 11:00'), resubmittedAt: at('2026-12-03 10:00') };
    assert.equal(resubmissionDueAt(db, pause, NONE), due('2026-12-09'));
  }));
});

describe('levels and remaining days (DECISIONS §8 · CONTRACT 4.2 · TC-SLA-03)', () => {
  const partA: [string, number | null, string][] = [
    ['2026-12-01 09:00', 3, 'normal'],
    ['2026-12-02 09:00', 2, 'normal'],
    ['2026-12-03 09:00', 1, 'near'],
    ['2026-12-04 16:30:00', 0, 'near'],
    ['2026-12-04 16:30:01', null, 'overdue'],
    ['2026-12-04 16:31', null, 'overdue'],
    ['2026-12-05 10:00', null, 'overdue'],
  ];
  for (const [now, remaining, level] of partA) {
    it(`part A ${now} → ${level}`, () => withDb((db) => {
      const cal = slaCalendar(db, NONE);
      assert.equal(remainingBusinessDays(at(now), due('2026-12-04'), cal), remaining);
      assert.equal(slaLevelAt(at(now), due('2026-12-04'), 'IN_REVIEW', cal), level);
    }));
  }
  const partB: [string, number | null, string][] = [
    ['2026-12-03 09:00', 2, 'normal'],
    ['2026-12-04 09:00', 1, 'near'],
    ['2026-12-05 10:00', 1, 'near'],
    ['2026-12-08 16:30:00', 0, 'near'],
    ['2026-12-08 16:31', null, 'overdue'],
  ];
  for (const [now, remaining, level] of partB) {
    it(`part B …000016 ${now} → ${level}`, () => withDb((db) => {
      const r = caseRow(db, 16), cal = slaCalendar(db, NONE);
      assert.equal(remainingBusinessDays(at(now), r.due_at, cal), remaining);
      assert.equal(slaLevelAt(at(now), r.due_at, r.status, cal), level);
    }));
  }
  it('part C seed levels at reset clock', () => withDb((db) => {
    const view = slaView(db, true, NONE);
    assert.equal(view.now, '2026-12-01T09:00:00+07:00');
    const expected: [number, string][] = [[20, 'overdue'], [22, 'near'], [24, 'near'], [25, 'normal'], [17, 'paused'], [1, 'closed'], [8, 'closed'], [9, 'closed'], [11, 'normal'], [19, 'normal'], [16, 'normal']];
    for (const [n, level] of expected) assert.equal(view.level(caseRow(db, n)), level, no(n));
    setClock(db, at('2026-12-01 16:30'));
    assert.equal(slaView(db, true, NONE).level(caseRow(db, 22)), 'near');
    setClock(db, at('2026-12-01 16:31'));
    assert.equal(slaView(db, true, NONE).level(caseRow(db, 22)), 'overdue');
  }));
  it('closed/paused precede overdue', () => withDb((db) => {
    const cal = slaCalendar(db, NONE);
    for (const status of ['COMPLETED', 'REJECTED', 'CANCELLED']) assert.equal(slaLevelAt(at('2027-01-30 09:00'), due('2026-12-04'), status, cal), 'closed');
    assert.equal(slaLevelAt(at('2027-01-30 09:00'), due('2026-12-04'), 'NEED_FIX', cal), 'paused');
  }));
  it('labels are the exact CONTRACT 4.2 text', () => {
    assert.deepEqual(SLA_LEVEL_LABELS, { normal: 'ปกติ', near: 'ใกล้ครบกำหนด', overdue: 'เกินกำหนด', paused: 'หยุดนับ', closed: 'ปิดแล้ว' });
  });
});

describe('on-time and display format (DECISIONS §18 · A-04)', () => {
  it('closed_at ≤ due including 16:30:00; CANCELLED/open are not closed', () => {
    assert.equal(closedOnTime('COMPLETED', at('2026-12-04 16:29'), due('2026-12-04')), true);
    assert.equal(closedOnTime('REJECTED', at('2026-12-04 16:30'), due('2026-12-04')), true);
    assert.equal(closedOnTime('COMPLETED', at('2026-12-04 16:31'), due('2026-12-04')), false);
    assert.equal(closedOnTime('CANCELLED', at('2026-12-01 10:00'), due('2026-12-04')), null);
    assert.equal(closedOnTime('IN_REVIEW', null, due('2026-12-04')), null);
  });
  it('Thai Buddhist-era short format without host ICU', () => {
    assert.equal(formatThaiDateTime('2026-12-04T16:30:00+07:00'), '4 ธ.ค. 2569 16:30');
    assert.equal(formatThaiDateTime('2027-01-05T16:30:00+07:00'), '5 ม.ค. 2570 16:30');
    assert.equal(formatThaiDateTime('2026-12-31T17:00:00Z'), '1 ม.ค. 2570 00:00');
    assert.equal(formatThaiDate('2027-02-02'), '2 ก.พ. 2570');
  });
});

describe('routed notifications and deduplication (TEST-DATA §8 · TC-NOTI-01/02)', () => {
  it('first request at reset clock yields exactly the source set, once', () => withDb((db) => {
    evaluateLifecycle(db, true, NONE);
    assert.deepEqual(pairsFor(db, 'off.reg1'), ['000020:overdue', '000022:near', '000024:near']);
    assert.deepEqual(pairsFor(db, 'off.reg2'), ['000024:near']);
    assert.deepEqual(pairsFor(db, 'head1'), ['000020:overdue']);
    assert.deepEqual(pairsFor(db, 'off.works1'), []);
    for (let i = 0; i < 5; i += 1) assert.equal(evaluateLifecycle(db, true, NONE).notified, 0);
    assert.equal(countNotifications(db, 'off.reg1'), 3);
    const item = listNotifications(db, 'off.reg1').find((n) => n.caseNo === no(24))!;
    assert.deepEqual(Object.keys(item).sort(), ['caseNo', 'createdAt', 'id', 'level', 'text']);
    assert.equal(item.text, 'คำขอ EG-2569-000024 ใกล้ครบกำหนด');
    assert.equal(item.createdAt, '2026-12-01T09:00:00+07:00');
    assert.equal(notificationText(no(20), 'overdue'), 'คำขอ EG-2569-000020 เกินกำหนด');
  }));
  it('TC-NOTI-01 continuation at 16:31 adds overdue without removing near', () => withDb((db) => {
    evaluateLifecycle(db, true, NONE);
    setClock(db, at('2026-12-01 16:31'));
    evaluateLifecycle(db, true, NONE);
    evaluateLifecycle(db, true, NONE);
    assert.deepEqual(pairsFor(db, 'off.reg1'), ['000020:overdue', '000022:near', '000022:overdue', '000024:near']);
    assert.deepEqual(pairsFor(db, 'head1'), ['000020:overdue', '000022:overdue']);
    assert.deepEqual(pairsFor(db, 'off.reg2'), ['000024:near']);
  }));
  it('jump to Sat 5 Dec 10:00 evaluates current levels only (TEST-DATA 8.1)', () => withDb((db) => {
    setClock(db, at('2026-12-05 10:00'));
    evaluateLifecycle(db, true, NONE);
    const overdue = (ns: number[]) => ns.map((n) => `${String(n).padStart(6, '0')}:overdue`);
    assert.deepEqual(pairsFor(db, 'off.reg1'), overdue([20, 22, 23, 24, 28, 29, 30]).sort());
    assert.deepEqual(pairsFor(db, 'off.reg2'), [...overdue([13, 15, 24, 25, 26, 27, 28, 29, 30]), '000016:near'].sort());
    assert.deepEqual(pairsFor(db, 'off.works1'), ['000010:overdue']);
    assert.deepEqual(pairsFor(db, 'head1'), [...overdue([10, 13, 14, 15, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30]), '000011:near'].sort());
    assert.equal((db.prepare("SELECT count(*) n FROM notifications WHERE level='near' AND case_no=?").get(no(24)) as { n: number }).n, 0);
  }));
  it('approval and issuing stages route to head and the issuing officer (TEST-DATA 8.2)', () => withDb((db) => {
    const of = (user: string, n: number) => pairsFor(db, user).filter((p) => p.startsWith(String(n).padStart(6, '0')));
    setClock(db, at('2026-12-04 09:00'));
    evaluateLifecycle(db, true, NONE);
    assert.deepEqual(of('head1', 14), ['000014:near']);
    assert.deepEqual([...of('off.reg1', 14), ...of('off.reg2', 14)], []);
    setClock(db, at('2026-12-04 16:31'));
    evaluateLifecycle(db, true, NONE);
    assert.deepEqual(of('head1', 14), ['000014:near', '000014:overdue']);
    assert.deepEqual([...of('off.reg1', 14), ...of('off.reg2', 14)], []);
    setClock(db, at('2026-12-08 09:00'));
    evaluateLifecycle(db, true, NONE);
    assert.deepEqual(of('off.reg1', 19), ['000019:near']);
    assert.deepEqual([...of('off.reg2', 19), ...of('head1', 19)], []);
    setClock(db, at('2026-12-09 16:31'));
    evaluateLifecycle(db, true, NONE);
    assert.deepEqual(of('off.reg1', 19), ['000019:near', '000019:overdue']);
    assert.deepEqual(of('head1', 19), ['000019:overdue']);
    assert.deepEqual(of('off.reg2', 19), []);
  }));
  it('claimed case notifies only the holder; paused and closed cases never notify', () => withDb((db) => {
    db.prepare("UPDATE cases SET status='IN_REVIEW',owner='off.reg2',first_registry_claimant='off.reg2' WHERE case_no=?").run(no(24));
    evaluateLifecycle(db, true, NONE);
    assert.deepEqual(pairsFor(db, 'off.reg2'), ['000024:near']);
    assert.deepEqual(pairsFor(db, 'off.reg1'), ['000020:overdue', '000022:near']);
    setClock(db, at('2027-01-30 09:00'));
    evaluateLifecycle(db, true, NONE);
    assert.equal((db.prepare("SELECT count(*) n FROM notifications WHERE case_no IN('EG-2569-000001','EG-2569-000009','EG-2569-000017')").get() as { n: number }).n, 0);
  }));
  it('lifecycle auto-cancels expired corrections at the deadline before evaluating', () => withDb((db) => {
    setClock(db, at('2026-12-04 13:59:59'));
    assert.deepEqual(evaluateLifecycle(db, true, NONE).cancelled, []);
    setClock(db, at('2026-12-04 14:00'));
    assert.deepEqual(evaluateLifecycle(db, true, NONE).cancelled, [no(17)]);
    assert.deepEqual(db.prepare('SELECT status,closed_at FROM cases WHERE case_no=?').get(no(17)), { status: 'CANCELLED', closed_at: '2026-12-04T14:00:00+07:00' });
    assert.deepEqual(evaluateLifecycle(db, true, NONE).cancelled, []);
  }));
});

describe('notifications API and request trigger', () => {
  const principal = (userId: string, role: string, dept: string | null = null) => ({ userId, username: userId, name: userId, role, dept, registrationOnly: false });
  it('GET /api/notifications returns only the caller’s items; other roles are rejected', async () => {
    const h = harness();
    try {
      evaluateLifecycle(h.db, true, NONE);
      const ctx = { db: h.db, keys, testMode: true, bugModes: NONE };
      const get = (actor: ReturnType<typeof principal> | null) => handleNotifications(new Request('http://localhost/api/notifications'), ctx, actor);
      const res = get(principal('off.reg2', 'officer', 'registry'))!;
      assert.equal(res.status, 200);
      assert.deepEqual((await res.json()).items.map((i: { caseNo: string; level: string }) => `${i.caseNo}:${i.level}`), ['EG-2569-000024:near']);
      assert.deepEqual((await get(principal('head1', 'head'))!.json()).items.length, 1);
      assert.throws(() => get(principal('citizen-somchai', 'citizen')), (e: { status?: number }) => e.status === 403);
      assert.throws(() => get(principal('exec1', 'executive')), (e: { status?: number }) => e.status === 403);
      assert.throws(() => get(null), (e: { status?: number }) => e.status === 401);
      assert.equal(handleNotifications(new Request('http://localhost/api/officer/queue'), ctx, null), null);
    } finally { h.close(); }
  });
  it('ordinary requests trigger lifecycle; /api/test/* never does', async () => {
    assert.equal(triggersLifecycle('/api/test/clock'), false);
    for (const path of ['/login', '/notifications', '/api/notifications', '/api/health', '/_next/static/x.js']) assert.equal(triggersLifecycle(path), true);
    const h = harness();
    const server = createCivicServer({ db: h.db, keys, testMode: true, bugModes: NONE }, (_req, res) => { res.end('page'); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const total = () => (h.db.prepare('SELECT count(*) n FROM notifications').get() as { n: number }).n;
    try {
      await fetch(base + '/api/test/clock');
      assert.equal(total(), 0);
      await fetch(base + '/login');
      assert.equal(total(), 5);
      await fetch(base + '/api/notifications');
      assert.equal(total(), 5);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      h.close();
    }
  });
});
