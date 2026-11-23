import {
  test, expect, MASKED_ID, attrs, caseNo, caseRow, expectError, expectJson, expectLevelBadge, expectStatus,
  expectStatusBadge, getCase, receiptNo, setFiles, texts, tid,
  type Actor,
} from './source-helpers.js';
import type { Page } from '@playwright/test';

/** Open `path` on the actor's page; return the page, HTTP status and the raw document HTML. */
async function openRaw(actor: Actor, path: string): Promise<{ page: Page; status: number; html: string }> {
  const page = await actor.page();
  const response = await page.goto(path);
  expect(response, `${actor.name} ${path} must return a document response`).not.toBeNull();
  return { page, status: response!.status(), html: await response!.text() };
}

test('TC-SUBMIT-01 ยื่นคำขอ SV-01 ครบวงจร', async ({ cast }) => {
  test.setTimeout(180_000);
  const somchai = await cast.as('somchai');
  const { page, status } = await somchai.open('/citizen');
  expect(status).toBe(200);
  const no = caseNo(31);

  await test.step('1: start SV-01 · qty 2 → ฿40 → to-upload-btn', async () => {
    await tid(page, 'start-service-SV-01').click();
    await expect(page).toHaveURL(/\/citizen\/new\/SV-01(?:\?.*)?$/);
    await expect(tid(page, 'wizard-step')).toHaveText('1/3 กรอกข้อมูล');
    await tid(page, 'qty-input').fill('2');
    await expect(tid(page, 'fee-total')).toHaveText('฿40');
    await tid(page, 'to-upload-btn').click();
  });

  await test.step('2: attach id-card.pdf → to-payment-btn enabled', async () => {
    await expect(tid(page, 'wizard-step')).toHaveText('2/3 แนบเอกสาร');
    await expect(tid(page, 'to-payment-btn')).toBeDisabled();
    await setFiles(page, 'upload-input-id-card', ['id-card.pdf']);
    await expect(tid(page, 'file-item')).toHaveCount(1);
    await expect(tid(page, 'file-item')).toHaveAttribute('data-doc-key', 'id-card');
    await expect(tid(page, 'to-payment-btn')).toBeEnabled();
    await tid(page, 'to-payment-btn').click();
  });

  await test.step('3: payment step · ฿40 · QR PP-0002 expires 09:15 · รอชำระ', async () => {
    await expect(tid(page, 'wizard-step')).toHaveText('3/3 ชำระเงิน');
    await expect(tid(page, 'payment-amount')).toHaveText('฿40');
    await tid(page, 'create-qr-btn').click();
    await expect(tid(page, 'qr-ref')).toHaveText('PP-0002');
    await expect(tid(page, 'qr-expires')).toHaveAttribute('data-iso', '2026-12-01T09:15:00+07:00');
    await expect(tid(page, 'payment-status')).toHaveText('รอชำระ');
    await expect(tid(page, 'payment-status')).toHaveAttribute('data-status', 'PENDING');
  });

  await test.step('4: pay PP-0002 ฿40 → EG-2569-000031 · refresh → receipt', async () => {
    await expectJson(await cast.pay('PP-0002', 40), 200,
      { status: 'PAID', caseNo: no, receiptNo: receiptNo(31), duplicate: false });
    await tid(page, 'refresh-payment-btn').click();
    await expect(tid(page, 'payment-status')).toHaveText('ชำระแล้ว');
    await expect(tid(page, 'payment-status')).toHaveAttribute('data-status', 'PAID');
    await expect(tid(page, 'submitted-case-no')).toHaveText(no);
    await expect(tid(page, 'receipt-no')).toHaveText(receiptNo(31));
    await expect(tid(page, 'receipt-amount')).toHaveText('฿40');
    await expect(tid(page, 'receipt-paid-at')).toHaveAttribute('data-iso', '2026-12-01T09:00:00+07:00');
  });

  await test.step('5: go-case-btn → case page SUBMITTED · ฿40 · due 4 ธ.ค. 2569 16:30', async () => {
    await tid(page, 'go-case-btn').click();
    await expect(page).toHaveURL(new RegExp(`/citizen/cases/${no}$`));
    await expect(tid(page, 'case-no')).toHaveText(no);
    await expectStatusBadge(tid(page, 'case-status'), 'SUBMITTED');
    await expect(tid(page, 'case-fee')).toHaveText('฿40');
    await expect(tid(page, 'sla-due')).toHaveText('4 ธ.ค. 2569 16:30');
    await expect(tid(page, 'sla-due')).toHaveAttribute('data-iso', '2026-12-04T16:30:00+07:00');
    await expectLevelBadge(tid(page, 'sla-level'), 'normal');
    await expect(tid(page, 'cancel-case-btn')).toHaveCount(1);
    await expect(tid(page, 'case-step')).toHaveCount(0);
  });

  await test.step('off.reg1 queue: …000031 unowned, claimable, last of the 4 ธ.ค. group', async () => {
    const reg1 = await cast.as('off.reg1');
    const { page: queue, status: queueStatus } = await reg1.open('/officer/queue');
    expect(queueStatus).toBe(200);
    const row = caseRow(queue, 'queue-row', no);
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-owner', '');
    await expect(tid(row, 'row-owner')).toHaveText(/^\s*$/);
    await expect(tid(row, 'claim-btn')).toHaveCount(1);
    // TEST-DATA §9.1 order (17 rows) with …000031 appended to the 4 ธ.ค. 16:30 group after …000030.
    const expected = [20, 22, 24, 23, 25, 26, 13, 15, 27, 28, 29, 30, 31, 16, 18, 19, 12, 21].map((n) => caseNo(n));
    await expect(tid(queue, 'queue-row')).toHaveCount(expected.length);
    expect(await attrs(tid(queue, 'queue-row'), 'data-case-no')).toEqual(expected);
  });
});

test('TC-RBAC-01 ประชาชนเปิดคำขอคนอื่นไม่ได้ (IDOR)', async ({ cast }) => {
  test.setTimeout(120_000);
  const somying = await cast.as('somying');
  const notFound = { code: 'NOT_FOUND', message: 'ไม่พบคำขอ' };

  await test.step('UI /citizen/cases/EG-2569-000005 (สมชาย) → 404 not-found-msg, no case data', async () => {
    const { page, status, html } = await openRaw(somying, `/citizen/cases/${caseNo(5)}`);
    expect(status).toBe(404);
    await expect(tid(page, 'not-found-msg')).toHaveText('ไม่พบคำขอ');
    await expect(tid(page, 'case-no')).toHaveCount(0);
    await expect(tid(page, 'case-status')).toHaveCount(0);
    expect(html).not.toContain('สมชาย');
    expect(await page.content()).not.toContain('สมชาย');
  });

  let ownedText = '';
  await test.step('GET /api/cases/EG-2569-000005 → 404 NOT_FOUND', async () => {
    const response = await somying.get(`/api/cases/${caseNo(5)}`);
    await expectJson(response, 404, notFound);
    ownedText = await response.text();
  });

  await test.step('GET /api/cases/EG-2569-999999 → 404 identical body', async () => {
    const response = await somying.get(`/api/cases/${caseNo(999999)}`);
    await expectJson(response, 404, notFound);
    expect(await response.text()).toBe(ownedText);
  });

  await test.step('other owner resources → 404', async () => {
    await expectStatus(await somying.get('/api/documents/DOC-2569-000001/pdf'), 404);
    await expectError(await somying.get('/api/drafts/DR-0001'), 404, 'NOT_FOUND');
    await expectStatus(await somying.post(`/api/cases/${caseNo(30)}/cancel`), 404);
  });

  await test.step('own case and owner control', async () => {
    const { page, status } = await somying.open(`/citizen/cases/${caseNo(7)}`);
    expect(status).toBe(200);
    await expect(tid(page, 'case-no')).toHaveText(caseNo(7));
    const somchai = await cast.as('somchai');
    const own = await getCase(somchai, caseNo(5));
    expect(own.caseNo).toBe(caseNo(5));
    expect((await getCase(somchai, caseNo(30))).status, 'IDOR cancel had no effect').toBe('SUBMITTED');
  });
});

test('TC-PDPA-01 ปิดบังเลขบัตรบนจอ', async ({ cast }) => {
  test.setTimeout(120_000);

  await test.step('off.reg2 /officer/queue: every row-id-masked is masked', async () => {
    const reg2 = await cast.as('off.reg2');
    const { page, status } = await reg2.open('/officer/queue');
    expect(status).toBe(200);
    await expect(tid(page, 'queue-row')).toHaveCount(17);
    const masked = await texts(tid(page, 'row-id-masked'));
    expect(masked).toHaveLength(17);
    for (const value of masked) expect(value).toMatch(MASKED_ID);
    await expect(tid(caseRow(page, 'queue-row', caseNo(25)), 'row-id-masked')).toHaveText('X-XXXX-XXXXX-65-9');
    await expect(tid(caseRow(page, 'queue-row', caseNo(26)), 'row-id-masked')).toHaveText('X-XXXX-XXXXX-45-6');
  });

  await test.step('off.reg2 /officer/cases/EG-2569-000025: masked, HTML has no full ID', async () => {
    const reg2 = await cast.as('off.reg2');
    const { page, status, html } = await openRaw(reg2, `/officer/cases/${caseNo(25)}`);
    expect(status).toBe(200);
    await expect(tid(page, 'applicant-id')).toHaveText('X-XXXX-XXXXX-65-9');
    const content = await page.content();
    for (const source of [html, content]) {
      expect(source).not.toContain('3100600987659');
      expect(source).not.toContain('3-1006-00987-65-9');
    }
  });

  await test.step('head1 /officer/cases/EG-2569-000025: masked the same', async () => {
    const head1 = await cast.as('head1');
    const { page, status } = await head1.open(`/officer/cases/${caseNo(25)}`);
    expect(status).toBe(200);
    await expect(tid(page, 'applicant-id')).toHaveText('X-XXXX-XXXXX-65-9');
  });

  await test.step('citizens see their own full ID', async () => {
    const somying = await cast.as('somying');
    const { page: own, status } = await somying.open(`/citizen/cases/${caseNo(25)}`);
    expect(status).toBe(200);
    await expect(tid(own, 'case-id-full')).toHaveText('3-1006-00987-65-9');

    const somchai = await cast.as('somchai');
    const { page: his, status: hisStatus } = await somchai.open(`/citizen/cases/${caseNo(20)}`);
    expect(hisStatus).toBe(200);
    await expect(tid(his, 'case-id-full')).toHaveText('1-1017-00123-45-6');
  });
});
