import type { Page } from '@playwright/test';
import {
  test, expect, attrs, auditItems, caseNo, choose, createDraft, expectError, expectJson, expectStatus, getCase, iso, newPaid,
  rowBy, texts, tid, MSG, PAGE_MSG, type Actor,
} from './source-helpers.js';

interface ServiceItem { id: string; fee: number; feePerSqm?: number; sla: number }

async function services(admin: Actor): Promise<Record<string, ServiceItem>> {
  const body = await expectJson(await admin.get('/api/admin/services'), 200);
  return Object.fromEntries((body.items as ServiceItem[]).map((item) => [item.id, item]));
}

async function openAdmin(admin: Actor, path: string): Promise<Page> {
  const { page, status } = await admin.open(path);
  expect(status, `admin1 opens ${path}`).toBe(200);
  return page;
}

/** Filter /audit by event through the UI and return the visible details. */
async function uiAuditByEvent(page: Page, event: string, count: number): Promise<string[]> {
  await choose(page, 'audit-filter-event', event);
  await tid(page, 'audit-apply-btn').click();
  await expect(tid(page, 'audit-count')).toHaveText(String(count));
  await expect(tid(page, 'audit-row')).toHaveCount(count);
  await expect.poll(() => attrs(tid(page, 'audit-row'), 'data-event')).toEqual(Array(count).fill(event));
  return texts(tid(page, 'audit-detail'));
}

function expectEachContained(details: string[], expected: string[], label: string): void {
  for (const part of expected) {
    expect(details.filter((detail) => detail.includes(part)), `${label}: one detail contains "${part}"`).toHaveLength(1);
  }
}

test('TC-RBAC-04 ผู้ดูแลระบบ: บริการ วันหยุด ผู้ใช้ และยอดที่ล็อก', async ({ cast }) => {
  test.setTimeout(240_000);
  const admin = await cast.as('admin1');
  const seedHolidays = ['2026-12-07', '2026-12-10', '2026-12-31', '2027-01-01'];

  await test.step('1: /admin/holidays = 4 แถว', async () => {
    const page = await openAdmin(admin, '/admin/holidays');
    await expect(tid(page, 'holiday-row')).toHaveCount(4);
    expect((await attrs(tid(page, 'holiday-row'), 'data-date')).sort()).toEqual(seedHolidays);
  });

  await test.step('2: ก่อนแก้ NEW_PAID สมชาย SV-01 qty 1 (฿20) → …000031 dueAt 4 ธ.ค. 16:30', async () => {
    const paid = await newPaid(cast, { who: 'somchai', service: 'SV-01', qty: 1, at: iso('2026-12-01 09:00') });
    expect(paid.fee).toBe(20);
    expect(paid.caseNo).toBe(caseNo(31));
    const body = await getCase(paid.actor, caseNo(31));
    expect(body.dueAt).toBe('2026-12-04T16:30:00+07:00');
  });

  await test.step('3: svc-fee-SV-01 = 25 · svc-fee-SV-02 = 600 → action-success ทั้งสองครั้ง', async () => {
    let page = await openAdmin(admin, '/admin/services');
    await tid(page, 'svc-fee-SV-01').fill('25');
    await tid(page, 'svc-save-SV-01').click();
    await expect(tid(page, 'action-success')).toBeVisible();
    await expect.poll(async () => (await services(admin))['SV-01']?.fee).toBe(25);

    page = await openAdmin(admin, '/admin/services');
    await expect(tid(page, 'svc-fee-SV-01')).toHaveValue('25');
    await tid(page, 'svc-fee-SV-02').fill('600');
    await tid(page, 'svc-save-SV-02').click();
    await expect(tid(page, 'action-success')).toBeVisible();
    await expect.poll(async () => (await services(admin))['SV-02']?.fee).toBe(600);
  });

  await test.step('4: สมชายร่างใหม่ใช้ค่าใหม่ · …000030 case-fee ยัง ฿20', async () => {
    const somchai = await cast.as('somchai');
    let { page, status } = await somchai.open('/citizen/new/SV-01');
    expect(status).toBe(200);
    await tid(page, 'qty-input').fill('5');
    await expect(tid(page, 'fee-total')).toHaveText('฿125');
    await tid(page, 'qty-input').fill('1');
    await expect(tid(page, 'fee-total')).toHaveText('฿25');
    ({ page, status } = await somchai.open('/citizen/new/SV-02'));
    expect(status).toBe(200);
    await expect(tid(page, 'fee-total')).toHaveText('฿600');
    ({ page, status } = await somchai.open(`/citizen/cases/${caseNo(30)}`));
    expect(status).toBe(200);
    await expect(tid(page, 'case-fee')).toHaveText('฿20');

    expect((await createDraft(somchai, { serviceId: 'SV-01', qty: 5 })).fee).toBe(125);
    expect((await createDraft(somchai, { serviceId: 'SV-01', qty: 1 })).fee).toBe(25);
    expect((await createDraft(somchai, { serviceId: 'SV-02' })).fee).toBe(600);
    expect((await getCase(somchai, caseNo(30))).fee).toBe(20);
  });

  await test.step('5: PP-0001 (DR-0002) ยอดล็อก ฿500 · pay 600 → 422 · pay 500 → …000032', async () => {
    const somchai = await cast.as('somchai');
    const { page, status } = await somchai.open('/citizen/new/SV-02?draft=DR-0002');
    expect(status).toBe(200);
    await expect(tid(page, 'payment-amount')).toHaveText('฿500');
    await expectError(await cast.pay('PP-0001', 600), 422, 'AMOUNT_MISMATCH');
    const paid = await expectJson(await cast.pay('PP-0001', 500), 200);
    expect(paid).toMatchObject({ status: 'PAID', caseNo: 'EG-2569-000032' });
  });

  await test.step('6: เพิ่มวันหยุด 2026-12-02 → 5 แถว · …000031 dueAt ไม่คำนวณใหม่', async () => {
    const page = await openAdmin(admin, '/admin/holidays');
    await expect(tid(page, 'holiday-row')).toHaveCount(4);
    await tid(page, 'holiday-date-input').fill('2026-12-02');
    await tid(page, 'holiday-name-input').fill('วันหยุดทดสอบ');
    await tid(page, 'holiday-add-btn').click();
    await expect(tid(page, 'holiday-row')).toHaveCount(5);
    await expect(rowBy(page, 'holiday-row', 'data-date', '2026-12-02')).toHaveCount(1);
    const somchai = await cast.as('somchai');
    expect((await getCase(somchai, caseNo(31))).dueAt).toBe('2026-12-04T16:30:00+07:00');
  });

  await test.step('7: หลังเพิ่มวันหยุด NEW_PAID สมชาย SV-01 qty 1 (฿25) → …000033 dueAt 8 ธ.ค. 16:30', async () => {
    const paid = await newPaid(cast, { who: 'somchai', service: 'SV-01', qty: 1, at: iso('2026-12-01 09:00') });
    expect(paid.fee).toBe(25);
    expect(paid.caseNo).toBe(caseNo(33));
    expect((await getCase(paid.actor, caseNo(33))).dueAt).toBe('2026-12-08T16:30:00+07:00');
  });

  let execAuditor!: Actor;
  await test.step('8: exec1 → auditor แล้วล็อกอินใหม่: หน้าตั้งต้น /audit · /dashboard → 403', async () => {
    await expectStatus(await admin.put('/api/admin/users/exec1', { role: 'auditor', dept: '' }), 200);
    execAuditor = await cast.anon();
    await expectJson(await execAuditor.post('/api/auth/staff/login', { username: 'exec1', password: 'Test@1234' }), 200,
      { role: 'auditor', dept: '', landing: '/audit' });
    const me = await expectJson(await execAuditor.get('/api/me'), 200);
    expect(me).toMatchObject({ username: 'exec1', role: 'auditor' });
    const landing = await execAuditor.open('/');
    await expect(landing.page).toHaveURL(/\/audit$/);
    const dashboard = await execAuditor.open('/dashboard');
    expect(dashboard.status).toBe(403);
    await expect(tid(dashboard.page, 'forbidden-msg')).toHaveText(PAGE_MSG.forbidden);
  });

  const changes4 = ['SV-01 fee 20 → 25', 'SV-02 fee 500 → 600', 'holiday add 2026-12-02', 'exec1 role executive → auditor'];
  await test.step('9: exec1 (auditor) /audit กรอง ADMIN_CHANGE → 4 แถวโดย admin1', async () => {
    const { page, status } = await execAuditor.open('/audit');
    expect(status).toBe(200);
    const details = await uiAuditByEvent(page, 'ADMIN_CHANGE', 4);
    expect(await attrs(tid(page, 'audit-row'), 'data-actor')).toEqual(Array(4).fill('admin1'));
    expect(await texts(tid(page, 'audit-role'))).toEqual(Array(4).fill('admin'));
    expectEachContained(details, changes4, 'UI ADMIN_CHANGE');
    const { count, items } = await auditItems(execAuditor, { event: 'ADMIN_CHANGE' });
    expect(count).toBe(4);
    for (const item of items) expect(item).toMatchObject({ username: 'admin1', role: 'admin', event: 'ADMIN_CHANGE' });
    expectEachContained(items.map((item) => String(item.detail ?? '')), changes4, 'API ADMIN_CHANGE');
  });

  await test.step('10: admin POST /api/drafts → 403', async () => {
    await expectError(await admin.post('/api/drafts', { serviceId: 'SV-01', qty: 1 }), 403, 'FORBIDDEN');
  });

  await test.step('11: ลบวันหยุด 2026-12-02 → 4 แถว · ADMIN_CHANGE รวม 5', async () => {
    const page = await openAdmin(admin, '/admin/holidays');
    const row = rowBy(page, 'holiday-row', 'data-date', '2026-12-02');
    await expect(row).toHaveCount(1);
    await tid(row, 'holiday-delete-btn').click();
    await expect(tid(page, 'holiday-row')).toHaveCount(4);
    expect((await attrs(tid(page, 'holiday-row'), 'data-date')).sort()).toEqual(seedHolidays);

    const { page: auditPage } = await execAuditor.open('/audit');
    const details = await uiAuditByEvent(auditPage, 'ADMIN_CHANGE', 5);
    expectEachContained(details, [...changes4, 'holiday delete 2026-12-02'], 'UI ADMIN_CHANGE');
    const { count, items } = await auditItems(execAuditor, { event: 'ADMIN_CHANGE' });
    expect(count).toBe(5);
    expectEachContained(items.map((item) => String(item.detail ?? '')), [...changes4, 'holiday delete 2026-12-02'], 'API ADMIN_CHANGE');
  });
});

test('TC-RBAC-06 ผู้ดูแลระบบ: ช่วงค่าที่ยอมรับ', async ({ cast }) => {
  test.setTimeout(180_000);
  const admin = await cast.as('admin1');
  const current = { fee: 20, sla: 3 };

  async function expectStored(): Promise<void> {
    const sv01 = (await services(admin))['SV-01'];
    expect(sv01, 'SV-01 in /api/admin/services').toBeDefined();
    expect({ fee: sv01!.fee, sla: sv01!.sla }).toEqual(current);
  }

  /** Fresh /admin/services showing the stored values, then fill one field and press save. */
  async function uiSave(field: 'fee' | 'sla', value: number): Promise<Page> {
    const page = await openAdmin(admin, '/admin/services');
    await expect(tid(page, 'svc-fee-SV-01')).toHaveValue(String(current.fee));
    await expect(tid(page, 'svc-sla-SV-01')).toHaveValue(String(current.sla));
    await tid(page, `svc-${field}-SV-01`).fill(String(value));
    await tid(page, 'svc-save-SV-01').click();
    return page;
  }

  function put(body: { fee: number; sla: number }) {
    return admin.put('/api/admin/services/SV-01', body);
  }

  await test.step('fee −1 → 400 INVALID_FEE · action-error · ค่าไม่เปลี่ยน', async () => {
    const page = await uiSave('fee', -1);
    await expect(tid(page, 'action-error')).toHaveText(MSG.INVALID_FEE);
    await expectError(await put({ fee: -1, sla: current.sla }), 400, 'INVALID_FEE');
    await expectStored();
  });

  await test.step('fee 0 → ยอมรับ (บนจอ: action-success)', async () => {
    const page = await uiSave('fee', 0);
    await expect(tid(page, 'action-success')).toBeVisible();
    current.fee = 0;
    await expect.poll(async () => (await services(admin))['SV-01']?.fee).toBe(0);
    await expectStored();
  });

  await test.step('fee 100000 → 200 ยอมรับ (API)', async () => {
    await expectStatus(await put({ fee: 100000, sla: current.sla }), 200);
    current.fee = 100000;
    await expectStored();
    const page = await openAdmin(admin, '/admin/services');
    await expect(tid(page, 'svc-fee-SV-01')).toHaveValue('100000');
  });

  await test.step('fee 100001 → 400 INVALID_FEE · ค่าไม่เปลี่ยน', async () => {
    await expectError(await put({ fee: 100001, sla: current.sla }), 400, 'INVALID_FEE');
    await uiSave('fee', 100001);
    await expectStored();
    const page = await openAdmin(admin, '/admin/services');
    await expect(tid(page, 'svc-fee-SV-01')).toHaveValue('100000');
  });

  await test.step('sla 0 → 400 INVALID_SLA · action-error · ค่าไม่เปลี่ยน', async () => {
    const page = await uiSave('sla', 0);
    await expect(tid(page, 'action-error')).toHaveText(MSG.INVALID_SLA);
    await expectError(await put({ fee: current.fee, sla: 0 }), 400, 'INVALID_SLA');
    await expectStored();
  });

  await test.step('sla 1 → ยอมรับ (บนจอ: action-success)', async () => {
    const page = await uiSave('sla', 1);
    await expect(tid(page, 'action-success')).toBeVisible();
    current.sla = 1;
    await expect.poll(async () => (await services(admin))['SV-01']?.sla).toBe(1);
    await expectStored();
  });

  await test.step('sla 60 → 200 ยอมรับ (API)', async () => {
    await expectStatus(await put({ fee: current.fee, sla: 60 }), 200);
    current.sla = 60;
    await expectStored();
    const page = await openAdmin(admin, '/admin/services');
    await expect(tid(page, 'svc-sla-SV-01')).toHaveValue('60');
  });

  await test.step('sla 61 → 400 INVALID_SLA · ค่าไม่เปลี่ยน', async () => {
    await expectError(await put({ fee: current.fee, sla: 61 }), 400, 'INVALID_SLA');
    await uiSave('sla', 61);
    await expectStored();
    const page = await openAdmin(admin, '/admin/services');
    await expect(tid(page, 'svc-sla-SV-01')).toHaveValue('60');
  });

  await test.step('วันหยุดซ้ำ 2026-12-07 → 409 DUPLICATE_HOLIDAY · holiday-row ยัง 4', async () => {
    await expectError(await admin.post('/api/admin/holidays', { date: '2026-12-07', name: 'ซ้ำ' }), 409, 'DUPLICATE_HOLIDAY');
    const page = await openAdmin(admin, '/admin/holidays');
    await expect(tid(page, 'holiday-row')).toHaveCount(4);
    await tid(page, 'holiday-date-input').fill('2026-12-07');
    await tid(page, 'holiday-name-input').fill('ซ้ำ');
    await tid(page, 'holiday-add-btn').click();
    await expect(tid(page, 'action-error')).toHaveText(MSG.DUPLICATE_HOLIDAY);
    await expect(tid(page, 'holiday-row')).toHaveCount(4);
  });

  await test.step('วันเสาร์ 2026-12-05 → 201 ยอมรับ', async () => {
    await expectStatus(await admin.post('/api/admin/holidays', { date: '2026-12-05', name: 'วันเสาร์' }), 201);
    const page = await openAdmin(admin, '/admin/holidays');
    await expect(rowBy(page, 'holiday-row', 'data-date', '2026-12-05')).toHaveCount(1);
  });

  await test.step('admin1 เปลี่ยนบทบาทตัวเอง → 409 SELF_ROLE_CHANGE · /api/me ยัง admin', async () => {
    await expectError(await admin.put('/api/admin/users/admin1', { role: 'executive', dept: '' }), 409, 'SELF_ROLE_CHANGE');
    const me = await expectJson(await admin.get('/api/me'), 200);
    expect(me.role).toBe('admin');
  });

  await test.step('Audit: audit1 กรอง ADMIN_CHANGE → 5 (คำขอที่ถูกปฏิเสธไม่ถูกบันทึก)', async () => {
    const auditor = await cast.as('audit1');
    const { page, status } = await auditor.open('/audit');
    expect(status).toBe(200);
    const expected = ['SV-01 fee 20 → 0', 'SV-01 fee 0 → 100000', 'SV-01 sla 3 → 1', 'SV-01 sla 1 → 60', 'holiday add 2026-12-05'];
    const details = await uiAuditByEvent(page, 'ADMIN_CHANGE', 5);
    expectEachContained(details, expected, 'UI ADMIN_CHANGE');
    const { count, items } = await auditItems(auditor, { event: 'ADMIN_CHANGE' });
    expect(count).toBe(5);
    for (const item of items) expect(item).toMatchObject({ username: 'admin1', role: 'admin' });
    expectEachContained(items.map((item) => String(item.detail ?? '')), expected, 'API ADMIN_CHANGE');
  });
});
