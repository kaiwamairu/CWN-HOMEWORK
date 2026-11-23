import type { Page } from '@playwright/test';
import {
  test, expect, api, auditItems, caseNo, choose, deepKeys, expectError, expectJson, expectLevelBadge,
  expectStatusBadge, getCase, iso, openCase, rowBy, tid, uiReturn, uiUnmask, MASKED_ID, MSG, PAGE_MSG, type Actor,
} from './source-helpers.js';

const TOO_SHORT = 'xxxxxxxxx'; // 9 ASCII (A-44)
const OK_REASON = 'xxxxxxxxxx'; // 10 ASCII
const SPACES_10 = '          '; // 10 spaces → empty after trim

/** Fill + submit a reason form (return/reject), opening it first only when it is not yet shown. */
async function submitReason(page: Page, kind: 'return' | 'reject', reason: string): Promise<void> {
  if (!(await tid(page, `${kind}-reason`).isVisible())) await tid(page, `${kind}-btn`).click();
  await tid(page, `${kind}-reason`).fill(reason);
  await tid(page, `${kind}-submit`).click();
}

async function resubmitApi(citizen: Actor, no: string): Promise<void> {
  const body = await expectJson(await api.resubmit(citizen, no), 200);
  expect(body).toMatchObject({ status: 'IN_REVIEW' });
}

async function returnApi(officer: Actor, no: string, returnCount: number): Promise<void> {
  await expectJson(await api.returnCase(officer, no, OK_REASON), 200, { status: 'NEED_FIX', returnCount });
}

test('TC-WORKFLOW-04 ตีกลับสูงสุด 2 ครั้ง และผลหลังครบ', async ({ cast }) => {
  test.setTimeout(300_000);

  await test.step('A: SV-01 …000020 return 1, 2 ✓ · 3 ✗ · holder can still decide', async () => {
    const no = caseNo(20);
    const reg1 = await cast.as('off.reg1');
    const somchai = await cast.as('somchai');
    let page = await openCase(reg1, no);
    await expect(tid(page, 'return-count')).toHaveText('0');

    // 1. first return through the UI
    await uiReturn(page, OK_REASON);
    await expectStatusBadge(tid(page, 'case-status'), 'NEED_FIX');
    await expect(tid(page, 'return-count')).toHaveText('1');

    // 2. สมชาย submits the fix through the UI → IN_REVIEW, same holder
    const citizenPage = await openCase(somchai, no, 'citizen');
    await tid(citizenPage, 'submit-fix-btn').click();
    await expectStatusBadge(tid(citizenPage, 'case-status'), 'IN_REVIEW');
    expect(await getCase(reg1, no)).toMatchObject({ status: 'IN_REVIEW', owner: 'off.reg1', returnCount: 1 });

    // 3. second return
    page = await openCase(reg1, no);
    await expect(tid(page, 'case-owner')).toHaveText('off.reg1');
    await uiReturn(page, OK_REASON);
    await expectStatusBadge(tid(page, 'case-status'), 'NEED_FIX');
    await expect(tid(page, 'return-count')).toHaveText('2');

    // 4. สมชาย submits the fix again
    await resubmitApi(somchai, no);

    // 5. limit reached
    page = await openCase(reg1, no);
    await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');
    await expect(tid(page, 'return-count')).toHaveText('2');
    await expect(tid(page, 'return-btn')).toHaveCount(0);
    await expectError(await api.returnCase(reg1, no, OK_REASON), 409, 'RETURN_LIMIT');
    expect(await getCase(reg1, no)).toMatchObject({ status: 'IN_REVIEW', returnCount: 2 });
    page = await openCase(reg1, no);
    await expect(tid(page, 'return-count')).toHaveText('2');
    await expect(tid(page, 'approve-btn')).toHaveCount(1);
    await expect(tid(page, 'reject-btn')).toHaveCount(1);
  });

  await test.step('B: RESET · seed …000023 already returned twice', async () => {
    await cast.reset();
    const no = caseNo(23);
    const reg1 = await cast.as('off.reg1');
    let page = await openCase(reg1, no);
    await expect(tid(page, 'return-count')).toHaveText('2');
    await expect(tid(page, 'return-btn')).toHaveCount(0);
    await expectError(await api.returnCase(reg1, no, OK_REASON), 409, 'RETURN_LIMIT');
    expect(await getCase(reg1, no)).toMatchObject({ status: 'IN_REVIEW', returnCount: 2 });
    page = await openCase(reg1, no);
    await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');
    await expect(tid(page, 'approve-btn')).toHaveCount(1);
    await expect(tid(page, 'reject-btn')).toHaveCount(1);
  });

  await test.step('C: RESET · SV-02 …000013 after 2 returns: only forward (with note) remains', async () => {
    await cast.reset();
    const no = caseNo(13);
    const note = 'ส่งต่อให้หัวหน้าพิจารณา';
    const reg2 = await cast.as('off.reg2');
    const somchai = await cast.as('somchai');
    await returnApi(reg2, no, 1);
    await resubmitApi(somchai, no);
    await returnApi(reg2, no, 2);
    await resubmitApi(somchai, no);

    const page = await openCase(reg2, no);
    await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');
    await expect(tid(page, 'return-btn')).toHaveCount(0);
    await expect(tid(page, 'approve-btn')).toHaveCount(0);
    await expect(tid(page, 'reject-btn')).toHaveCount(0);
    await expect(tid(page, 'forward-btn')).toHaveCount(1);
    await expectError(await api.reject(reg2, no, OK_REASON), 403, 'FORBIDDEN');

    await tid(page, 'forward-note').fill(note);
    await tid(page, 'forward-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'PENDING_APPROVAL');

    const audit1 = await cast.as('audit1');
    const forwards = (await auditItems(audit1, { event: 'FORWARD' })).items.filter((item) => item.caseNo === no);
    expect(forwards).toHaveLength(1);
    expect(String(forwards[0].detail)).toContain(note);
    const auditPage = (await audit1.open('/audit')).page;
    await choose(auditPage, 'audit-filter-event', 'FORWARD');
    await tid(auditPage, 'audit-apply-btn').click();
    const row = rowBy(auditPage, 'audit-row', 'data-case-no', no);
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-event', 'FORWARD');
    await expect(tid(row, 'audit-detail')).toContainText(note);

    const head1 = await cast.as('head1');
    const headPage = await openCase(head1, no);
    await expect(tid(headPage, 'reject-btn')).toHaveCount(1);
    await expect(tid(headPage, 'approve-btn')).toHaveCount(1);
  });
});

test('TC-WORKFLOW-05 เหตุผล ≥ 10 ตัวอักษร (ตีกลับ / ไม่อนุมัติ)', async ({ cast }) => {
  test.setTimeout(240_000);

  await test.step('A: return …000020 by off.reg1 (9 / 10 spaces / 10)', async () => {
    const no = caseNo(20);
    const reg1 = await cast.as('off.reg1');
    const page = await openCase(reg1, no);
    for (const reason of [TOO_SHORT, SPACES_10]) {
      await submitReason(page, 'return', reason);
      await expect(tid(page, 'return-reason-error')).toHaveText(MSG.REASON_TOO_SHORT);
      await expectError(await api.returnCase(reg1, no, reason), 400, 'REASON_TOO_SHORT');
      await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');
      expect((await getCase(reg1, no)).status).toBe('IN_REVIEW');
    }
    await submitReason(page, 'return', OK_REASON);
    await expectStatusBadge(tid(page, 'case-status'), 'NEED_FIX');
    const somchai = await cast.as('somchai');
    const citizenPage = await openCase(somchai, no, 'citizen');
    await expect(tid(citizenPage, 'return-reason-display')).toHaveText(OK_REASON);
  });

  await test.step('B: RESET · reject SV-01 …000026 by its holder off.reg2', async () => {
    await cast.reset();
    const no = caseNo(26);
    const reg2 = await cast.as('off.reg2');
    const page = await openCase(reg2, no);
    await submitReason(page, 'reject', TOO_SHORT);
    await expect(tid(page, 'reject-reason-error')).toHaveText(MSG.REASON_TOO_SHORT);
    await expectError(await api.reject(reg2, no, TOO_SHORT), 400, 'REASON_TOO_SHORT');
    await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');

    await submitReason(page, 'reject', OK_REASON);
    await expectStatusBadge(tid(page, 'case-status'), 'REJECTED');
    await expect(tid(page, 'closed-at')).toHaveAttribute('data-iso', '2026-12-01T09:00:00+07:00');
    await expectLevelBadge(tid(page, 'sla-level'), 'closed');

    const somchai = await cast.as('somchai');
    const citizenPage = await openCase(somchai, no, 'citizen');
    await expect(tid(citizenPage, 'no-refund-note')).toHaveText(PAGE_MSG.noRefund);

    const exec1 = await cast.as('exec1');
    const dashboard = await expectJson(await api.dashboard(exec1, '2026-12', 'ALL'), 200);
    expect(dashboard).toMatchObject({ closed: 1, onTime: 1 });
  });

  await test.step('C: RESET · head1 rejects …000011 (9 → 400 · 10 → REJECTED)', async () => {
    await cast.reset();
    const no = caseNo(11);
    const head1 = await cast.as('head1');
    const page = await openCase(head1, no);
    await submitReason(page, 'reject', TOO_SHORT);
    await expect(tid(page, 'reject-reason-error')).toHaveText(MSG.REASON_TOO_SHORT);
    await expectError(await api.reject(head1, no, TOO_SHORT), 400, 'REASON_TOO_SHORT');
    await expectStatusBadge(tid(page, 'case-status'), 'PENDING_APPROVAL');
    await submitReason(page, 'reject', OK_REASON);
    await expectStatusBadge(tid(page, 'case-status'), 'REJECTED');
    expect((await getCase(head1, no)).status).toBe('REJECTED');
  });
});

test('TC-WORKFLOW-06 เวลาแก้ไข 168 ชั่วโมง', async ({ cast }) => {
  test.setTimeout(240_000);
  const no = caseNo(17);
  const deadline = '2026-12-04T14:00:00+07:00';

  await test.step('Initial: …000017 NEED_FIX with fix deadline 4 ธ.ค. 2569 14:00', async () => {
    const somchai = await cast.as('somchai');
    const page = await openCase(somchai, no, 'citizen');
    await expectStatusBadge(tid(page, 'case-status'), 'NEED_FIX');
    await expect(tid(page, 'return-reason-display')).toHaveText('ชื่อในเอกสารไม่ตรงกับบัตร กรุณาแก้ไข');
    await expect(tid(page, 'fix-deadline')).toHaveText('4 ธ.ค. 2569 14:00');
    await expect(tid(page, 'fix-deadline')).toHaveAttribute('data-iso', deadline);
    await expect(tid(page, 'submit-fix-btn')).toHaveCount(1);
  });

  await test.step('A: RESET · 13:59 (167:59) → submit fix succeeds', async () => {
    await cast.reset();
    await cast.clock(iso('2026-12-04 13:59'));
    const somchai = await cast.as('somchai');
    const page = await openCase(somchai, no, 'citizen');
    await expect(tid(page, 'submit-fix-btn')).toBeEnabled();
    await tid(page, 'submit-fix-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');
    expect((await getCase(somchai, no)).status).toBe('IN_REVIEW');
  });

  await test.step('B: RESET · 14:00 (168:00) → auto CANCELLED', async () => {
    await cast.reset();
    await cast.clock(deadline);
    const somchai = await cast.as('somchai');
    const page = await openCase(somchai, no, 'citizen');
    await expectStatusBadge(tid(page, 'case-status'), 'CANCELLED');
    await expect(tid(page, 'submit-fix-btn')).toHaveCount(0);
    await expect(tid(page, 'no-refund-note')).toHaveText(PAGE_MSG.noRefund);
    const response = await api.resubmit(somchai, no);
    const body = await expectJson(response, 409);
    expect(['FIX_WINDOW_EXPIRED', 'INVALID_STATE']).toContain(body.code);
    expect(body.message).toBe(MSG[body.code as 'FIX_WINDOW_EXPIRED' | 'INVALID_STATE']);
    const cancelledItem = rowBy(tid(page, 'case-timeline'), 'timeline-item', 'data-iso', deadline);
    await expect(cancelledItem.first()).toBeAttached();
    const exec1 = await cast.as('exec1');
    const dashboard = await expectJson(await api.dashboard(exec1, '2026-12', 'ALL'), 200);
    expect(dashboard).toMatchObject({ backlog: 20 });
  });
});

test('TC-PDPA-02 API (JSON) ไม่ส่งเลขบัตรเต็ม', async ({ cast }) => {
  test.setTimeout(180_000);
  const endpoints: ReadonlyArray<{ path: string; kind: 'queue' | 'case' | 'other' }> = [
    { path: '/api/officer/queue?filter=all', kind: 'queue' },
    { path: `/api/cases/${caseNo(25)}`, kind: 'case' },
    { path: `/api/cases/${caseNo(26)}`, kind: 'case' },
    { path: `/api/cases/${caseNo(20)}`, kind: 'case' },
    { path: '/api/notifications', kind: 'other' },
    { path: `/api/cases/${caseNo(25)}/files`, kind: 'other' },
  ];
  for (const name of ['off.reg1', 'head1'] as const) {
    await test.step(`${name}: every listed JSON response is free of full IDs`, async () => {
      const actor = await cast.as(name);
      for (const { path, kind } of endpoints) {
        const response = await actor.get(path);
        const body = await expectJson(response, 200);
        const label = `${name} ${path}`;
        expect(response.headers()['content-type'], `${label} content-type`).toMatch(/^application\/json\b/);
        const text = JSON.stringify(body);
        expect(text, `${label}: no 13-digit run`).not.toMatch(/\d{13}/);
        expect(text, `${label}: no dashed ID`).not.toMatch(/\d-\d{4}-\d{5}-\d{2}-\d/);
        for (const id of ['3100600987659', '1101700123456', '1909900555015']) expect(text, `${label}: no ${id}`).not.toContain(id);
        expect(deepKeys(body), `${label}: no idNo key`).not.toContain('idNo');
        if (kind === 'case') expect(body.idMasked, `${label} idMasked`).toMatch(MASKED_ID);
        if (kind === 'queue') expect(body.items.length, `${label} has items`).toBeGreaterThan(0);
        const items: Array<Record<string, unknown>> = Array.isArray(body.items) ? body.items : [];
        for (const item of items) {
          if (kind === 'queue' || 'idMasked' in item) expect(item.idMasked, `${label} items[].idMasked`).toMatch(MASKED_ID);
        }
      }
    });
  }
});

test('TC-PDPA-03 แสดงเลขเต็มต้องมีเหตุผลและบันทึก Audit', async ({ cast }) => {
  test.setTimeout(180_000);
  const no = caseNo(25);
  const reg2 = await cast.as('off.reg2');
  const page = await openCase(reg2, no);

  await test.step('1: empty reason → REASON_REQUIRED', async () => {
    await tid(page, 'show-full-id-btn').click();
    await tid(page, 'unmask-reason').fill('');
    await tid(page, 'unmask-submit').click();
    await expect(tid(page, 'unmask-error')).toHaveText(MSG.REASON_REQUIRED);
    await expect(tid(page, 'full-id')).toHaveCount(0);
    await expectError(await api.unmask(reg2, no, ''), 400, 'REASON_REQUIRED');
  });

  await test.step('2: whitespace-only reason → same message', async () => {
    await uiUnmask(page, '   ');
    await expect(tid(page, 'unmask-error')).toHaveText(MSG.REASON_REQUIRED);
    await expect(tid(page, 'full-id')).toHaveCount(0);
    await expectError(await api.unmask(reg2, no, '   '), 400, 'REASON_REQUIRED');
  });

  await test.step('3: reason ตรวจสอบตัวตนซ้ำ → full id', async () => {
    await uiUnmask(page, 'ตรวจสอบตัวตนซ้ำ');
    await expect(tid(page, 'full-id')).toHaveText('3-1006-00987-65-9');
  });

  await test.step('4: reload → masked again', async () => {
    await page.reload();
    await expect(tid(page, 'applicant-id')).toHaveText('X-XXXX-XXXXX-65-9');
    await expect(tid(page, 'full-id')).toHaveCount(0);
  });

  await test.step('5: audit1 /audit filtered by UNMASK shows exactly the successful one', async () => {
    const audit1 = await cast.as('audit1');
    const { page: auditPage, status } = await audit1.open('/audit');
    expect(status).toBe(200);
    await choose(auditPage, 'audit-filter-event', 'UNMASK');
    await tid(auditPage, 'audit-apply-btn').click();
    await expect(tid(auditPage, 'audit-count')).toHaveText('1');
    const rows = tid(auditPage, 'audit-row');
    await expect(rows).toHaveCount(1);
    await expect(rows).toHaveAttribute('data-actor', 'off.reg2');
    await expect(tid(rows, 'audit-role')).toHaveText('officer');
    await expect(tid(rows, 'audit-case-no')).toHaveText(no);
    await expect(tid(rows, 'audit-event')).toHaveText('UNMASK');
    await expect(tid(rows, 'audit-detail')).toContainText('ตรวจสอบตัวตนซ้ำ');
    await expect(tid(rows, 'audit-time')).toHaveAttribute('data-iso', '2026-12-01T09:00:00+07:00');

    const { items } = await auditItems(audit1, { event: 'UNMASK' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ username: 'off.reg2', role: 'officer', event: 'UNMASK', caseNo: no, time: '2026-12-01T09:00:00+07:00' });
    expect(String(items[0].detail)).toContain('ตรวจสอบตัวตนซ้ำ');
  });

  await test.step('6: exec1, audit1, สมหญิง cannot unmask (403)', async () => {
    for (const name of ['exec1', 'audit1', 'somying'] as const) {
      const actor = await cast.as(name);
      await expectError(await api.unmask(actor, no, 'x'), 403, 'FORBIDDEN');
    }
  });
});
