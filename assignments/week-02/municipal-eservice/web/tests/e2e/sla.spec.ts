import {
  test, expect, LEVEL_TH, api, attrs, caseNo, caseRow, expectJson, expectLevelBadge, expectStatusBadge, expectedPairs,
  getCase, iso, newPaid, notifications, openCase, pairs, rowBy, tid, uiReturn,
  type Actor, type ActorName, type Cast, type ServiceId,
} from './source-helpers.js';
import type { Page } from '@playwright/test';

const REASON = 'xxxxxxxxxx';
type Level = 'normal' | 'near' | 'overdue' | 'paused' | 'closed';
type NotiLevel = 'near' | 'overdue';

// ---------------------------------------------------------------------------------------------
// Local helpers (spec-only)
// ---------------------------------------------------------------------------------------------

/** Citizen/officer case page: `sla-due` data-iso (+ exact text when the source gives it). */
async function expectDue(page: Page, dueIso: string, text?: string): Promise<void> {
  await expect(tid(page, 'sla-due')).toHaveAttribute('data-iso', dueIso);
  if (text !== undefined) await expect(tid(page, 'sla-due')).toHaveText(text);
}

/** Open the case page and check `sla-level` (data-level + Thai text) and API `slaLevel`. */
async function expectLevel(actor: Actor, no: string, level: Level, kind?: 'citizen' | 'officer'): Promise<Page> {
  const page = await openCase(actor, no, kind);
  await expectLevelBadge(tid(page, 'sla-level'), level);
  expect((await getCase(actor, no)).slaLevel, `${no} API slaLevel`).toBe(level);
  return page;
}

/** Full notification set of a user: API pairs, `/notifications` rows, item text and `bell-count`. */
async function expectNotis(actor: Actor, expected: string[], label: string): Promise<void> {
  expect(pairs(await notifications(actor)), `${label}: GET /api/notifications`).toEqual(expected);
  const { page, status } = await actor.open('/notifications');
  expect(status, `${label}: /notifications`).toBe(200);
  const items = tid(page, 'noti-item');
  await expect(items, `${label}: noti-item count`).toHaveCount(expected.length);
  const ui = await items.evaluateAll((nodes) => nodes.map((node) => `${node.getAttribute('data-case-no')}:${node.getAttribute('data-level')}`));
  expect(ui.sort(), `${label}: noti-item pairs`).toEqual(expected);
  for (const pair of expected) {
    const [no, level] = pair.split(':') as [string, NotiLevel];
    const item = page.locator(`[data-testid="noti-item"][data-case-no="${no}"][data-level="${level}"]`);
    await expect(item).toHaveCount(1);
    await expect(item).toContainText(`คำขอ ${no} ${LEVEL_TH[level]}`);
  }
  await expect(tid(page, 'bell-count'), `${label}: bell-count`).toHaveText(String(expected.length));
  if (expected.length === 0) await expect(tid(page, 'noti-empty')).toHaveText('ไม่มีแจ้งเตือน');
}

/** Notifications of one case for a user (API + UI), as sorted levels. */
async function expectCaseNotis(actor: Actor, n: number, levels: NotiLevel[], label: string): Promise<void> {
  const all = await notifications(actor);
  const forCase = all.filter((item) => item.caseNo === caseNo(n)).map((item) => item.level).sort();
  expect(forCase, `${label}: API levels of ${caseNo(n)}`).toEqual([...levels].sort());
  const { page, status } = await actor.open('/notifications');
  expect(status, `${label}: /notifications`).toBe(200);
  // Ready signal: the page shows every notification of the user (bell-count = total).
  await expect(tid(page, 'noti-item'), `${label}: noti-item total`).toHaveCount(all.length);
  await expect(tid(page, 'bell-count'), `${label}: bell-count`).toHaveText(String(all.length));
  const rows = rowBy(page, 'noti-item', 'data-case-no', caseNo(n));
  await expect(rows).toHaveCount(levels.length);
  expect((await attrs(rows, 'data-level')).sort(), `${label}: UI levels of ${caseNo(n)}`).toEqual([...levels].sort());
}

// TEST-DATA §8 / TC-NOTI-01 (first request at 2026-12-01 09:00).
const NOTI_0900: Record<'off.reg1' | 'off.reg2' | 'head1' | 'off.works1', Array<readonly [number, NotiLevel]>> = {
  'off.reg1': [[24, 'near'], [22, 'near'], [20, 'overdue']],
  'off.reg2': [[24, 'near']],
  head1: [[20, 'overdue']],
  'off.works1': [],
};
// TC-NOTI-01 "ต่อ" after CLOCK(2026-12-01T16:31) + request.
const NOTI_1631: Record<'off.reg1' | 'off.reg2' | 'head1', Array<readonly [number, NotiLevel]>> = {
  'off.reg1': [[24, 'near'], [22, 'near'], [20, 'overdue'], [22, 'overdue']],
  'off.reg2': [[24, 'near']],
  head1: [[20, 'overdue'], [22, 'overdue']],
};

/** TC-NOTI-01 full flow (also the prefix of TC-NOTI-02 ส่วน A). */
async function notiFlow(cast: Cast): Promise<void> {
  await test.step('LOGIN_S off.reg1 at 09:00 (first request) → evaluate; check off.reg1 off.reg2 head1 off.works1', async () => {
    expect(await cast.now()).toBe(iso('2026-12-01 09:00'));
    const reg1 = await cast.as('off.reg1');
    const others: ActorName[] = ['off.reg2', 'head1', 'off.works1'];
    for (const name of others) await cast.as(name);
    await expectNotis(reg1, expectedPairs(NOTI_0900['off.reg1']), 'off.reg1 09:00');
    for (const name of ['off.reg2', 'head1', 'off.works1'] as const) {
      await expectNotis(await cast.as(name), expectedPairs(NOTI_0900[name]), `${name} 09:00`);
    }
  });

  await test.step('ต่อ: CLOCK(2026-12-01T16:31) + request → off.reg1 4 · head1 2 · off.reg2 1', async () => {
    await cast.clock(iso('2026-12-01 16:31'));
    const reg1 = await cast.as('off.reg1');
    await expectJson(await api.notifications(reg1), 200);
    for (const name of ['off.reg1', 'head1', 'off.reg2'] as const) {
      await expectNotis(await cast.as(name), expectedPairs(NOTI_1631[name]), `${name} 16:31`);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// SLA
// ---------------------------------------------------------------------------------------------

test('TC-SLA-01 กำหนดเสร็จตามตารางวันที่', async ({ cast }) => {
  test.setTimeout(300_000);
  const rows: Array<{ row: string; service: ServiceId; at: string; due: string; text?: string; areaSqm?: number }> = [
    { row: 'a', service: 'SV-01', at: iso('2026-12-01 09:00'), due: iso('2026-12-04 16:30'), text: '4 ธ.ค. 2569 16:30' },
    { row: 'b', service: 'SV-01', at: iso('2026-12-01 16:29'), due: iso('2026-12-04 16:30') },
    { row: 'c', service: 'SV-01', at: iso('2026-12-01 16:30'), due: iso('2026-12-08 16:30'), text: '8 ธ.ค. 2569 16:30' },
    { row: 'd', service: 'SV-01', at: iso('2026-12-04 10:00'), due: iso('2026-12-11 16:30'), text: '11 ธ.ค. 2569 16:30' },
    { row: 'e', service: 'SV-01', at: iso('2026-12-05 10:00'), due: iso('2026-12-14 16:30'), text: '14 ธ.ค. 2569 16:30' },
    { row: 'f', service: 'SV-02', at: iso('2026-12-01 09:00'), due: iso('2026-12-17 16:30') },
    { row: 'g', service: 'SV-03', at: iso('2026-12-01 09:00'), due: iso('2026-12-24 16:30'), areaSqm: 100 },
    { row: 'h', service: 'SV-01', at: iso('2026-12-29 10:00'), due: iso('2027-01-05 16:30'), text: '5 ม.ค. 2570 16:30' },
    { row: 'i', service: 'SV-01', at: iso('2026-12-31 23:59'), due: iso('2027-01-07 16:30'), text: '7 ม.ค. 2570 16:30' },
  ];

  for (const r of rows) {
    await test.step(`แถว ${r.row}: ${r.service} paid ${r.at} → dueAt ${r.due}`, async () => {
      await cast.reset();
      const paid = await newPaid(cast, { service: r.service, at: r.at, qty: r.service === 'SV-01' ? 1 : undefined, areaSqm: r.areaSqm });
      expect(paid.caseNo).toBe(caseNo(31));
      const somchai = paid.actor;
      expect((await getCase(somchai, paid.caseNo)).dueAt, `row ${r.row} GET /api/cases/:caseNo dueAt`).toBe(r.due);
      const list = await expectJson(await somchai.get('/api/cases'), 200);
      const item = (list.items as Array<{ caseNo: string; dueAt: string }>).find((entry) => entry.caseNo === paid.caseNo);
      expect(item?.dueAt, `row ${r.row} GET /api/cases dueAt`).toBe(r.due);
      const page = await openCase(somchai, paid.caseNo, 'citizen');
      await expectDue(page, r.due, r.text);
    });
  }
});

test('TC-SLA-02 หยุดนับ SLA ระหว่างรอแก้ไข', async ({ cast }) => {
  test.setTimeout(300_000);
  const no31 = caseNo(31);
  const no17 = caseNo(17);

  await test.step('ส่วน 1: NEW_PAID 1 ธ.ค. 09:00 → claim+return 2 ธ.ค. 11:00 → resubmit 3 ธ.ค. 10:00 → dueAt 8 ธ.ค.', async () => {
    const paid = await newPaid(cast, { at: iso('2026-12-01 09:00') });
    expect(paid.caseNo).toBe(no31);
    const somchai = paid.actor;
    expect((await getCase(somchai, no31)).dueAt).toBe(iso('2026-12-04 16:30'));

    await cast.clock(iso('2026-12-02 11:00'));
    const reg1 = await cast.as('off.reg1');
    await expectJson(await api.claim(reg1, no31), 200, { owner: 'off.reg1' });
    const officerPage = await openCase(reg1, no31, 'officer');
    await uiReturn(officerPage, REASON);
    await expectStatusBadge(tid(officerPage, 'case-status'), 'NEED_FIX');

    const citizenPage = await openCase(somchai, no31, 'citizen');
    await expectStatusBadge(tid(citizenPage, 'case-status'), 'NEED_FIX');
    await expectLevelBadge(tid(citizenPage, 'sla-level'), 'paused');
    await expect(tid(citizenPage, 'fix-deadline')).toHaveAttribute('data-iso', iso('2026-12-09 11:00'));

    await cast.clock(iso('2026-12-03 10:00'));
    const fixPage = await openCase(somchai, no31, 'citizen');
    await tid(fixPage, 'submit-fix-btn').click();
    await expectStatusBadge(tid(fixPage, 'case-status'), 'IN_REVIEW');

    const body = await getCase(somchai, no31);
    expect(body).toMatchObject({ status: 'IN_REVIEW', dueAt: iso('2026-12-08 16:30'), slaLevel: 'normal' });
    const after = await expectLevel(somchai, no31, 'normal', 'citizen');
    await expectDue(after, iso('2026-12-08 16:30'), '8 ธ.ค. 2569 16:30');
    const ownerPage = await openCase(reg1, no31, 'officer');
    await expect(tid(ownerPage, 'case-owner')).toHaveText('off.reg1');
    expect((await getCase(reg1, no31)).owner).toBe('off.reg1');
  });

  await test.step('ส่วน 2 (RESET): seed 000017 resubmitted 1 ธ.ค. 09:00 → dueAt 1 ธ.ค. 16:30 · ใกล้ครบกำหนด', async () => {
    await cast.reset();
    const somchai = await cast.as('somchai');
    const page = await openCase(somchai, no17, 'citizen');
    await expectLevelBadge(tid(page, 'sla-level'), 'paused');
    await expect(tid(page, 'sla-due')).toHaveAttribute('data-iso', iso('2026-11-27 16:30'));
    await tid(page, 'submit-fix-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');

    expect(await getCase(somchai, no17)).toMatchObject({ status: 'IN_REVIEW', dueAt: iso('2026-12-01 16:30') });
    const after = await expectLevel(somchai, no17, 'near', 'citizen');
    await expectDue(after, iso('2026-12-01 16:30'));
    const reg1 = await cast.as('off.reg1');
    expect((await getCase(reg1, no17)).owner).toBe('off.reg1');
    const officerPage = await openCase(reg1, no17, 'officer');
    await expect(tid(officerPage, 'case-owner')).toHaveText('off.reg1');
  });

  await test.step('ส่วน 3 (RESET): CLOCK 4 ธ.ค. 10:00 resubmit 000017 → dueAt 4 ธ.ค. 16:30 · ใกล้ครบกำหนด', async () => {
    await cast.reset();
    await cast.clock(iso('2026-12-04 10:00'));
    const somchai = await cast.as('somchai');
    const page = await openCase(somchai, no17, 'citizen');
    await tid(page, 'submit-fix-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');
    expect(await getCase(somchai, no17)).toMatchObject({ status: 'IN_REVIEW', dueAt: iso('2026-12-04 16:30') });
    const after = await expectLevel(somchai, no17, 'near', 'citizen');
    await expectDue(after, iso('2026-12-04 16:30'));
  });

  await test.step('ส่วน 4 (RESET): return and resubmit on the same day (2 ธ.ค.) → dueAt stays 4 ธ.ค. 16:30', async () => {
    await cast.reset();
    const paid = await newPaid(cast, { at: iso('2026-12-01 09:00') });
    expect(paid.caseNo).toBe(no31);
    const somchai = paid.actor;
    expect((await getCase(somchai, no31)).dueAt).toBe(iso('2026-12-04 16:30'));

    await cast.clock(iso('2026-12-02 09:00'));
    const reg1 = await cast.as('off.reg1');
    await expectJson(await api.claim(reg1, no31), 200, { owner: 'off.reg1' });
    await expectJson(await api.returnCase(reg1, no31, REASON), 200, { status: 'NEED_FIX', returnCount: 1 });

    await cast.clock(iso('2026-12-02 15:00'));
    const resubmitted = await expectJson(await api.resubmit(somchai, no31), 200);
    expect(resubmitted).toMatchObject({ status: 'IN_REVIEW', dueAt: iso('2026-12-04 16:30') });
    expect(await getCase(somchai, no31)).toMatchObject({ status: 'IN_REVIEW', dueAt: iso('2026-12-04 16:30') });
    const page = await openCase(somchai, no31, 'citizen');
    await expectDue(page, iso('2026-12-04 16:30'));
  });

  await test.step('ส่วน 5 (RESET): return 4 ธ.ค. 10:00, resubmit 8 ธ.ค. 17:00 → pause 1 day → dueAt 8 ธ.ค. 16:30 · เกินกำหนด', async () => {
    await cast.reset();
    const paid = await newPaid(cast, { at: iso('2026-12-01 09:00') });
    expect(paid.caseNo).toBe(no31);
    const somchai = paid.actor;
    expect((await getCase(somchai, no31)).dueAt).toBe(iso('2026-12-04 16:30'));

    await cast.clock(iso('2026-12-04 10:00'));
    const reg1 = await cast.as('off.reg1');
    await expectJson(await api.claim(reg1, no31), 200, { owner: 'off.reg1' });
    await expectJson(await api.returnCase(reg1, no31, REASON), 200, { status: 'NEED_FIX', returnCount: 1 });

    await cast.clock(iso('2026-12-08 17:00'));
    const resubmitted = await expectJson(await api.resubmit(somchai, no31), 200);
    expect(resubmitted).toMatchObject({ status: 'IN_REVIEW', dueAt: iso('2026-12-08 16:30') });
    expect(await getCase(somchai, no31)).toMatchObject({ status: 'IN_REVIEW', dueAt: iso('2026-12-08 16:30'), slaLevel: 'overdue' });
    const page = await expectLevel(somchai, no31, 'overdue', 'citizen');
    await expectDue(page, iso('2026-12-08 16:30'));
  });
});

test('TC-SLA-03 ระดับเตือน ปกติ / ใกล้ครบกำหนด / เกินกำหนด', async ({ cast }) => {
  test.setTimeout(300_000);

  await test.step('ส่วน A: new 000031 (due 4 ธ.ค. 16:30) levels by clock', async () => {
    const paid = await newPaid(cast, { at: iso('2026-12-01 09:00') });
    expect(paid.caseNo).toBe(caseNo(31));
    expect((await getCase(paid.actor, paid.caseNo)).dueAt).toBe(iso('2026-12-04 16:30'));
    const table: Array<[string, Level]> = [
      ['2026-12-01 09:00', 'normal'],
      ['2026-12-02 09:00', 'normal'],
      ['2026-12-03 09:00', 'near'],
      ['2026-12-04 16:30:00', 'near'],
      ['2026-12-04 16:30:01', 'overdue'],
      ['2026-12-04 16:31:00', 'overdue'],
      ['2026-12-05 10:00', 'overdue'],
    ];
    for (const [clock, level] of table) {
      await cast.clock(iso(clock));
      await expectLevel(paid.actor, paid.caseNo, level, 'citizen');
    }
  });

  await test.step('ส่วน B (RESET): seed 000016 (due อ. 8 ธ.ค. 16:30)', async () => {
    await cast.reset();
    const table: Array<[string, Level]> = [
      ['2026-12-03 09:00', 'normal'],
      ['2026-12-04 09:00', 'near'],
      ['2026-12-08 16:30:00', 'near'],
      ['2026-12-08 16:31:00', 'overdue'],
    ];
    for (const [clock, level] of table) {
      await cast.clock(iso(clock));
      const reg2 = await cast.as('off.reg2');
      await expectLevel(reg2, caseNo(16), level, 'officer');
    }
  });

  await test.step('ส่วน C (RESET): seed levels at 09:00 via /officer/queue row-sla-level and case pages', async () => {
    await cast.reset();
    const reg1 = await cast.as('off.reg1');
    const { page, status } = await reg1.open('/officer/queue');
    expect(status).toBe(200);
    const queued: Array<[number, Level]> = [[20, 'overdue'], [22, 'near'], [24, 'near'], [25, 'normal']];
    for (const [n, level] of queued) {
      const row = caseRow(page, 'queue-row', caseNo(n));
      await expect(row).toHaveAttribute('data-sla-level', level);
      await expectLevelBadge(tid(row, 'row-sla-level'), level);
    }
    for (const [n, level] of queued) await expectLevel(reg1, caseNo(n), level, 'officer');
    await expectLevel(reg1, caseNo(17), 'paused', 'officer');
    const somying = await cast.as('somying');
    await expectLevel(somying, caseNo(1), 'closed', 'citizen');
  });

  await test.step('ส่วน C: CLOCK 1 ธ.ค. 16:30 → 000022 ใกล้ครบกำหนด · 16:31 → เกินกำหนด', async () => {
    const reg1 = await cast.as('off.reg1');
    for (const [clock, level] of [['2026-12-01 16:30', 'near'], ['2026-12-01 16:31', 'overdue']] as Array<[string, Level]>) {
      await cast.clock(iso(clock));
      const { page, status } = await reg1.open('/officer/queue');
      expect(status).toBe(200);
      const row = caseRow(page, 'queue-row', caseNo(22));
      await expect(row).toHaveAttribute('data-sla-level', level);
      await expectLevelBadge(tid(row, 'row-sla-level'), level);
      await expectLevel(reg1, caseNo(22), level, 'officer');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// NOTI
// ---------------------------------------------------------------------------------------------

test('TC-NOTI-01 ผู้รับแจ้งเตือนตามระดับ', async ({ cast }) => {
  test.setTimeout(240_000);
  await notiFlow(cast);
});

test('TC-NOTI-02 ไม่แจ้งซ้ำ ข้ามระดับ และขั้นรออนุมัติ/รอออกเอกสาร', async ({ cast }) => {
  test.setTimeout(300_000);

  await test.step('ส่วน A: TC-NOTI-01 flow, then repeated page opens / GETs → no duplicates', async () => {
    await notiFlow(cast);
    for (const name of ['off.reg1', 'head1'] as const) {
      const actor = await cast.as(name);
      for (let i = 0; i < 3; i += 1) {
        const { status } = await actor.open('/notifications');
        expect(status).toBe(200);
      }
      for (let i = 0; i < 3; i += 1) await expectJson(await api.notifications(actor), 200);
      for (let i = 0; i < 2; i += 1) {
        const { status } = await actor.open('/officer/queue');
        expect(status).toBe(200);
      }
    }
    await expectNotis(await cast.as('off.reg1'), expectedPairs(NOTI_1631['off.reg1']), 'off.reg1 after repeats');
    await expectNotis(await cast.as('head1'), expectedPairs(NOTI_1631.head1), 'head1 after repeats');
  });

  await test.step('ส่วน B (RESET): first request at ส. 5 ธ.ค. 10:00 → only current level (TEST-DATA 8.1)', async () => {
    await cast.reset();
    await cast.clock(iso('2026-12-05 10:00'));
    await cast.as('off.reg1');
    for (const name of ['off.reg2', 'off.works1', 'head1'] as const) await cast.as(name);
    const o = (ns: number[]) => ns.map((n) => [n, 'overdue'] as const);
    const expected: Record<'off.reg1' | 'off.reg2' | 'off.works1' | 'head1', Array<readonly [number, NotiLevel]>> = {
      'off.reg1': o([20, 22, 23, 24, 28, 29, 30]),
      'off.reg2': [...o([13, 15, 24, 25, 26, 27, 28, 29, 30]), [16, 'near']],
      'off.works1': o([10]),
      head1: [...o([10, 13, 14, 15, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30]), [11, 'near']],
    };
    expect(expected['off.reg1']).toHaveLength(7);
    expect(expected['off.reg2']).toHaveLength(10);
    expect(expected['off.works1']).toHaveLength(1);
    expect(expected.head1).toHaveLength(15);
    for (const name of ['off.reg1', 'off.reg2', 'off.works1', 'head1'] as const) {
      await expectNotis(await cast.as(name), expectedPairs(expected[name]), `${name} ส. 5 ธ.ค.`);
    }
    // 000024: overdue only (no retroactive near) for off.reg1, off.reg2, head1.
    for (const name of ['off.reg1', 'off.reg2', 'head1'] as const) {
      await expectCaseNotis(await cast.as(name), 24, ['overdue'], `${name} 000024`);
    }
  });

  await test.step('ส่วน C (RESET): CLOCK 4 ธ.ค. 09:00 LOGIN_S head1 → 000014 near for head1 only', async () => {
    await cast.reset();
    await cast.clock(iso('2026-12-04 09:00'));
    const head = await cast.as('head1');
    await expectCaseNotis(head, 14, ['near'], 'head1 4 ธ.ค. 09:00');
    await expectCaseNotis(await cast.as('off.reg1'), 14, [], 'off.reg1 4 ธ.ค. 09:00');
    await expectCaseNotis(await cast.as('off.reg2'), 14, [], 'off.reg2 4 ธ.ค. 09:00');
  });

  await test.step('ส่วน C.1: CLOCK 4 ธ.ค. 16:31 + request → head1 000014 near + overdue · officers none', async () => {
    await cast.clock(iso('2026-12-04 16:31'));
    const head = await cast.as('head1');
    await expectJson(await api.notifications(head), 200);
    await expectCaseNotis(head, 14, ['near', 'overdue'], 'head1 4 ธ.ค. 16:31');
    await expectCaseNotis(await cast.as('off.reg1'), 14, [], 'off.reg1 4 ธ.ค. 16:31');
    await expectCaseNotis(await cast.as('off.reg2'), 14, [], 'off.reg2 4 ธ.ค. 16:31');
  });

  await test.step('ส่วน C.2: CLOCK 8 ธ.ค. 09:00 + request → 000019 near for off.reg1 (issuer) only', async () => {
    await cast.clock(iso('2026-12-08 09:00'));
    const reg1 = await cast.as('off.reg1');
    await expectJson(await api.notifications(reg1), 200);
    await expectCaseNotis(reg1, 19, ['near'], 'off.reg1 8 ธ.ค. 09:00');
    await expectCaseNotis(await cast.as('off.reg2'), 19, [], 'off.reg2 8 ธ.ค. 09:00');
    await expectCaseNotis(await cast.as('head1'), 19, [], 'head1 8 ธ.ค. 09:00');
  });

  await test.step('ส่วน C.3: CLOCK 9 ธ.ค. 16:31 + request → 000019 off.reg1 near + overdue · head1 overdue', async () => {
    await cast.clock(iso('2026-12-09 16:31'));
    const reg1 = await cast.as('off.reg1');
    await expectJson(await api.notifications(reg1), 200);
    await expectCaseNotis(reg1, 19, ['near', 'overdue'], 'off.reg1 9 ธ.ค. 16:31');
    await expectCaseNotis(await cast.as('head1'), 19, ['overdue'], 'head1 9 ธ.ค. 16:31');
  });
});
