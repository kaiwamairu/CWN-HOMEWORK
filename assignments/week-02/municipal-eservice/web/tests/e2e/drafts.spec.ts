import {
  test, expect, MSG, api, attach, caseNo, caseRow, createDraft, createQr, expectError, expectJson, expectStatus,
  expectStatusBadge, getCase, openCase, queueCaseNos, rowBy, setFiles, tid,
  type Actor,
} from './source-helpers.js';
import type { Page } from '@playwright/test';

/** CONTRACT §2.5 `fee-total` invalid value: en dash U+2013. */
const DASH = '–';

async function openWizard(actor: Actor, path: string): Promise<Page> {
  const { page, status } = await actor.open(path);
  expect(status, `${actor.name} opens ${path}`).toBe(200);
  return page;
}

test('TC-FEE-01 ค่าธรรมเนียม SV-01 / SV-02 / SV-03', async ({ cast }) => {
  test.setTimeout(180_000);
  const somchai = await cast.as('somchai');

  await test.step('SV-03 area-input: every row on screen and via POST /api/drafts', async () => {
    const rows: ReadonlyArray<{ area: number; fee?: string; apiFee?: number; error?: 'INVALID_AREA' | 'AREA_TOO_LARGE' }> = [
      { area: 0, error: 'INVALID_AREA' },
      { area: -1, error: 'INVALID_AREA' },
      { area: 1, fee: '฿1,000', apiFee: 1000 },
      { area: 100, fee: '฿1,000', apiFee: 1000 },
      { area: 101, fee: '฿1,010', apiFee: 1010 },
      { area: 102, fee: '฿1,020', apiFee: 1020 },
      { area: 250, fee: '฿2,500', apiFee: 2500 },
      { area: 300, fee: '฿3,000', apiFee: 3000 },
      { area: 499, fee: '฿4,990', apiFee: 4990 },
      { area: 500, fee: '฿5,000', apiFee: 5000 },
      { area: 501, error: 'AREA_TOO_LARGE' },
    ];
    const page = await openWizard(somchai, '/citizen/new/SV-03');
    for (const row of rows) {
      await tid(page, 'area-input').fill(String(row.area));
      await expect(tid(page, 'area-input')).toHaveValue(String(row.area));
      if (row.error) {
        await expect(tid(page, 'fee-total'), `area ${row.area}`).toHaveText(DASH);
        await expect(tid(page, 'fee-error'), `area ${row.area}`).toHaveText(MSG[row.error]);
        await expect(tid(page, 'to-upload-btn'), `area ${row.area}`).toBeDisabled();
        await expectError(await somchai.post('/api/drafts', { serviceId: 'SV-03', areaSqm: row.area }), 400, row.error);
      } else {
        await expect(tid(page, 'fee-total'), `area ${row.area}`).toHaveText(row.fee!);
        await expect(tid(page, 'fee-error'), `area ${row.area}`).toBeHidden();
        await expect(tid(page, 'to-upload-btn'), `area ${row.area}`).toBeEnabled();
        const { fee } = await createDraft(somchai, { serviceId: 'SV-03', areaSqm: row.area });
        expect(fee, `API fee for area ${row.area}`).toBe(row.apiFee);
      }
    }
  });

  await test.step('SV-01 qty-input: 0 and 6 rejected, 1–5 = ฿20 × qty', async () => {
    const rows: ReadonlyArray<{ qty: number; fee?: string; apiFee?: number }> = [
      { qty: 0 },
      { qty: 1, fee: '฿20', apiFee: 20 },
      { qty: 2, fee: '฿40', apiFee: 40 },
      { qty: 3, fee: '฿60', apiFee: 60 },
      { qty: 4, fee: '฿80', apiFee: 80 },
      { qty: 5, fee: '฿100', apiFee: 100 },
      { qty: 6 },
    ];
    const page = await openWizard(somchai, '/citizen/new/SV-01');
    for (const row of rows) {
      await tid(page, 'qty-input').fill(String(row.qty));
      await expect(tid(page, 'qty-input')).toHaveValue(String(row.qty));
      if (row.fee === undefined) {
        await expect(tid(page, 'fee-error'), `qty ${row.qty}`).toHaveText(MSG.INVALID_QTY);
        await expect(tid(page, 'fee-total'), `qty ${row.qty}`).toHaveText(DASH);
        await expect(tid(page, 'to-upload-btn'), `qty ${row.qty}`).toBeDisabled();
        await expectError(await somchai.post('/api/drafts', { serviceId: 'SV-01', qty: row.qty }), 400, 'INVALID_QTY');
      } else {
        await expect(tid(page, 'fee-total'), `qty ${row.qty}`).toHaveText(row.fee);
        await expect(tid(page, 'fee-error'), `qty ${row.qty}`).toBeHidden();
        await expect(tid(page, 'to-upload-btn'), `qty ${row.qty}`).toBeEnabled();
        const { fee } = await createDraft(somchai, { serviceId: 'SV-01', qty: row.qty });
        expect(fee, `API fee for qty ${row.qty}`).toBe(row.apiFee);
      }
    }
  });

  await test.step('SV-02: no input field, fee-total ฿500', async () => {
    const page = await openWizard(somchai, '/citizen/new/SV-02');
    await expect(tid(page, 'fee-total')).toHaveText('฿500');
    await expect(tid(page, 'qty-input')).toHaveCount(0);
    await expect(tid(page, 'area-input')).toHaveCount(0);
    await expect(tid(page, 'to-upload-btn')).toBeEnabled();
    const { fee } = await createDraft(somchai, { serviceId: 'SV-02' });
    expect(fee).toBe(500);
  });
});

test('TC-SUBMIT-02 เอกสารบังคับครบก่อนชำระ', async ({ cast }) => {
  test.setTimeout(180_000);
  const somchai = await cast.as('somchai');

  await test.step('SV-02 rows: id-card only → + map → remove map', async () => {
    const page = await openWizard(somchai, '/citizen/new/SV-02');
    await tid(page, 'to-upload-btn').click();
    await expect(tid(page, 'wizard-step')).toHaveText('2/3 แนบเอกสาร');

    await setFiles(page, 'upload-input-id-card', ['id-card.pdf']);
    await expect(tid(page, 'file-item')).toHaveCount(1);
    await expect(rowBy(page, 'file-item', 'data-doc-key', 'id-card')).toHaveCount(1);
    await expect(tid(page, 'to-payment-btn')).toBeDisabled();
    await expect(tid(page, 'missing-docs')).toHaveText('ยังขาดเอกสาร: แผนที่ตั้ง');

    await setFiles(page, 'upload-input-map', ['map.pdf']);
    await expect(tid(page, 'file-item')).toHaveCount(2);
    await expect(rowBy(page, 'file-item', 'data-doc-key', 'map')).toHaveCount(1);
    await expect(tid(page, 'to-payment-btn')).toBeEnabled();
    await expect(tid(page, 'missing-docs')).toHaveCount(0);

    await tid(rowBy(page, 'file-item', 'data-doc-key', 'map'), 'file-remove-btn').click();
    await expect(tid(page, 'file-item')).toHaveCount(1);
    await expect(rowBy(page, 'file-item', 'data-doc-key', 'map')).toHaveCount(0);
    await expect(tid(page, 'to-payment-btn')).toBeDisabled();
    await expect(tid(page, 'missing-docs')).toHaveText('ยังขาดเอกสาร: แผนที่ตั้ง');
  });

  await test.step('SV-03 (area 100) rows: id-card → + deed → + plan-as-jpg rejected → + plan.pdf', async () => {
    const page = await openWizard(somchai, '/citizen/new/SV-03');
    await tid(page, 'area-input').fill('100');
    await expect(tid(page, 'fee-total')).toHaveText('฿1,000');
    await tid(page, 'to-upload-btn').click();
    await expect(tid(page, 'wizard-step')).toHaveText('2/3 แนบเอกสาร');

    await setFiles(page, 'upload-input-id-card', ['id-card.pdf']);
    await expect(tid(page, 'file-item')).toHaveCount(1);
    await expect(tid(page, 'to-payment-btn')).toBeDisabled();
    await expect(tid(page, 'missing-docs')).toHaveText('ยังขาดเอกสาร: แบบแปลน, โฉนด');

    await setFiles(page, 'upload-input-deed', ['deed.pdf']);
    await expect(tid(page, 'file-item')).toHaveCount(2);
    await expect(rowBy(page, 'file-item', 'data-doc-key', 'deed')).toHaveCount(1);
    await expect(tid(page, 'to-payment-btn')).toBeDisabled();
    await expect(tid(page, 'missing-docs')).toHaveText('ยังขาดเอกสาร: แบบแปลน');

    await setFiles(page, 'upload-input-plan', ['plan-as-jpg.jpg']);
    await expect(tid(page, 'upload-error')).toHaveText(MSG.PLAN_NOT_PDF);
    await expect(tid(page, 'file-item')).toHaveCount(2);
    await expect(rowBy(page, 'file-item', 'data-doc-key', 'plan')).toHaveCount(0);
    await expect(tid(page, 'to-payment-btn')).toBeDisabled();
    await expect(tid(page, 'missing-docs')).toHaveText('ยังขาดเอกสาร: แบบแปลน');

    await setFiles(page, 'upload-input-plan', ['plan.pdf']);
    await expect(tid(page, 'file-item')).toHaveCount(3);
    await expect(rowBy(page, 'file-item', 'data-doc-key', 'plan')).toHaveCount(1);
    await expect(tid(page, 'to-payment-btn')).toBeEnabled();
    await expect(tid(page, 'missing-docs')).toHaveCount(0);
  });

  await test.step('API: SV-03 draft missing plan → 409 MISSING_DOCS ["แบบแปลน"], complete → 201', async () => {
    const { draftId } = await createDraft(somchai, { serviceId: 'SV-03', areaSqm: 100 });
    await attach(somchai, draftId, 'id-card', 'id-card.pdf');
    await attach(somchai, draftId, 'deed', 'deed.pdf');
    const body = await expectJson(await somchai.post(`/api/drafts/${draftId}/payment`), 409);
    expect(body).toMatchObject({ code: 'MISSING_DOCS', message: 'ยังขาดเอกสาร: แบบแปลน', missing: ['แบบแปลน'] });
    await attach(somchai, draftId, 'plan', 'plan.pdf');
    const qr = await createQr(somchai, draftId);
    expect(qr.amount).toBe(1000);
  });
});

test('TC-SUBMIT-03 ร่าง และการยกเลิก', async ({ cast }) => {
  test.setTimeout(300_000);

  await test.step('A: drafts on /citizen, reopen DR-0001, save DR-0003', async () => {
    const somchai = await cast.as('somchai');
    const page = await openWizard(somchai, '/citizen');
    await expect(tid(page, 'my-case-row')).toHaveCount(10);
    await expect(tid(page, 'my-draft-row')).toHaveCount(2);
    const dr1 = rowBy(page, 'my-draft-row', 'data-draft-id', 'DR-0001');
    const dr2 = rowBy(page, 'my-draft-row', 'data-draft-id', 'DR-0002');
    await expect(dr1).toHaveAttribute('data-status', 'DRAFT');
    await expect(dr2).toHaveAttribute('data-status', 'PENDING_PAYMENT');
    for (const row of await tid(page, 'my-draft-row').all()) await expect(row).not.toContainText('EG-');

    await tid(dr1, 'open-draft-btn').click();
    await expect(page).toHaveURL(/\/citizen\/new\/SV-01\?draft=DR-0001$/);
    await expect(tid(page, 'qty-input')).toHaveValue('2');
    await expect(tid(page, 'fee-total')).toHaveText('฿40');

    await page.goto('/citizen');
    await tid(page, 'start-service-SV-01').click();
    await expect(page).toHaveURL(/\/citizen\/new\/SV-01(?:\?.*)?$/);
    await tid(page, 'qty-input').fill('3');
    await expect(tid(page, 'fee-total')).toHaveText('฿60');
    await tid(page, 'save-draft-btn').click();
    await expect(tid(page, 'draft-id')).toHaveText('DR-0003');

    await page.goto('/citizen');
    await expect(tid(page, 'my-case-row')).toHaveCount(10);
    const cases = await expectJson(await somchai.get('/api/cases'), 200);
    expect(cases.items).toHaveLength(10);
    const drafts = await expectJson(await somchai.get('/api/drafts'), 200);
    expect(drafts.items).toHaveLength(3);
  });

  await test.step('B (RESET): cancel …000030 through the UI', async () => {
    await cast.reset();
    const somchai = await cast.as('somchai');
    const no = caseNo(30);
    const page = await openCase(somchai, no);
    await expect(tid(page, 'cancel-case-btn')).toHaveCount(1);
    await tid(page, 'cancel-case-btn').click();
    await expect(tid(page, 'cancel-confirm-text')).toHaveText('ค่าธรรมเนียมที่ชำระแล้วไม่คืน');
    await tid(page, 'confirm-cancel-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'CANCELLED');
    await expect(tid(page, 'no-refund-note')).toHaveText('ค่าธรรมเนียมที่ชำระแล้วไม่คืน');
    await expect(tid(page, 'cancel-case-btn')).toHaveCount(0);
    expect((await getCase(somchai, no)).status).toBe('CANCELLED');

    const reg1 = await cast.as('off.reg1');
    const { page: queue, status } = await reg1.open('/officer/queue');
    expect(status).toBe(200);
    await expect(tid(queue, 'queue-row')).toHaveCount(16);
    await expect(caseRow(queue, 'queue-row', no)).toHaveCount(0);

    const exec1 = await cast.as('exec1');
    const { page: dash, status: dashStatus } = await exec1.open('/dashboard');
    expect(dashStatus).toBe(200);
    await expect(tid(dash, 'period-select')).toHaveValue('2026-12');
    await expect(tid(dash, 'kpi-backlog')).toHaveText('20');
    await expect(tid(dash, 'kpi-received')).toHaveText('3');
  });

  await test.step('C (RESET): cannot cancel once claimed', async () => {
    await cast.reset();
    const reg1 = await cast.as('off.reg1');
    await expectJson(await api.claim(reg1, caseNo(30)), 200, { owner: 'off.reg1' });
    const somchai = await cast.as('somchai');
    const page = await openCase(somchai, caseNo(30));
    await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');
    await expect(tid(page, 'cancel-case-btn')).toHaveCount(0);
    await expectError(await api.cancel(somchai, caseNo(30)), 409, 'CANNOT_CANCEL');
    await expectError(await api.cancel(somchai, caseNo(13)), 409, 'CANNOT_CANCEL');
    expect((await getCase(somchai, caseNo(30))).status).toBe('IN_REVIEW');
    expect((await getCase(somchai, caseNo(13))).status).toBe('IN_REVIEW');
  });

  await test.step('E (RESET): delete drafts DR-0001 and unpaid DR-0002', async () => {
    await cast.reset();
    const somchai = await cast.as('somchai');
    await expectStatus(await somchai.del('/api/drafts/DR-0001'), 204);
    await expectError(await somchai.get('/api/drafts/DR-0001'), 404, 'NOT_FOUND');
    const page = await openWizard(somchai, '/citizen');
    await expect(tid(page, 'my-draft-row')).toHaveCount(1);
    await expect(rowBy(page, 'my-draft-row', 'data-draft-id', 'DR-0002')).toHaveCount(1);
    await expectStatus(await somchai.del('/api/drafts/DR-0002'), 204);
    await expectStatus(await somchai.get('/api/payments/PP-0001'), 404);
    await expectStatus(await cast.pay('PP-0001', 500), 404);
    const cases = await expectJson(await somchai.get('/api/cases'), 200);
    expect(cases.items).toHaveLength(10);
  });

  await test.step('F (RESET): concurrent cancel vs claim — exactly one side wins', async () => {
    await cast.reset();
    const somchai = await cast.as('somchai');
    const reg1 = await cast.as('off.reg1');
    const no = caseNo(30);
    const [cancelRes, claimRes] = await Promise.all([api.cancel(somchai, no), api.claim(reg1, no)]);
    const cancelStatus = cancelRes.status();
    const claimStatus = claimRes.status();
    expect(cancelStatus === 200 && claimStatus === 200, 'never both 200').toBe(false);
    expect(cancelStatus === 200 || claimStatus === 200, `one side succeeds (cancel ${cancelStatus}, claim ${claimStatus})`).toBe(true);
    const cancelWon = cancelStatus === 200;
    if (cancelWon) {
      await expectJson(cancelRes, 200, { status: 'CANCELLED' });
      await expectError(claimRes, 409, 'INVALID_STATE');
    } else {
      await expectJson(claimRes, 200, { owner: 'off.reg1' });
      await expectError(cancelRes, 409, 'CANNOT_CANCEL');
    }
    const finalCase = await getCase(reg1, no);
    const mine = await queueCaseNos(reg1, 'mine');
    const { page, status } = await reg1.open('/officer/queue');
    expect(status).toBe(200);
    if (cancelWon) {
      expect(finalCase.status).toBe('CANCELLED');
      expect([null, ''], 'no owner after cancel').toContain(finalCase.owner);
      expect(mine).toHaveLength(3);
      await expect(tid(page, 'workload-count')).toHaveText('3');
    } else {
      expect(finalCase.status).toBe('IN_REVIEW');
      expect(finalCase.owner).toBe('off.reg1');
      expect(mine).toHaveLength(4);
      expect(mine).toContain(no);
      await expect(tid(page, 'workload-count')).toHaveText('4');
    }
  });
});
