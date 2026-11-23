import type { Page } from '@playwright/test';
import {
  test, expect, api, attrs, caseNo, caseRow, clickDownload, dispositionFilename, expectError, expectJson, expectLevelBadge,
  expectPdfLine, expectStatusBadge, getCase, auditItems, choose, openCase, tid, VERIFY_CODE, type Actor, type Cast,
} from './source-helpers.js';

/** Read the visible verify code of an issued case (CONTRACT §2.6 `verify-code`). */
async function verifyCodeOf(page: Page): Promise<string> {
  await expect(tid(page, 'verify-code')).toHaveText(VERIFY_CODE);
  return (await tid(page, 'verify-code').textContent())!.trim();
}

/** Anonymous `/verify/<code>` (CONTRACT §1: no login, found → 200) and the signer shown. */
async function expectVerifySigner(cast: Cast, code: string, signer: string): Promise<void> {
  const anon = await cast.anon();
  const { page, status } = await anon.open(`/verify/${code}`);
  expect(status, `/verify/${code} HTTP status`).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/verify/${code}$`));
  await expect(tid(page, 'verify-signer')).toHaveText(signer);
}

/** `/officer/queue` of an officer: workload-count and wait until rows are rendered. */
async function openQueue(actor: Actor): Promise<Page> {
  const { page, status } = await actor.open('/officer/queue');
  expect(status, `${actor.name} /officer/queue`).toBe(200);
  await expect(tid(page, 'queue-row').first()).toBeVisible();
  return page;
}

test('TC-WORKFLOW-01 SV-01 อนุมัติ + ออกเอกสาร', async ({ cast }) => {
  test.setTimeout(180_000);
  const no = caseNo(25);
  const reg2 = await cast.as('off.reg2');
  let page = await openCase(reg2, no);
  let verifyCode = '';

  await test.step('1: buttons of SV-01 IN_REVIEW held by off.reg2', async () => {
    await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');
    await expect(tid(page, 'approve-btn')).toHaveCount(1);
    await expect(tid(page, 'return-btn')).toHaveCount(1);
    await expect(tid(page, 'reject-btn')).toHaveCount(1);
    await expect(tid(page, 'forward-btn')).toHaveCount(0);
    await expect(tid(page, 'issue-btn')).toHaveCount(0);
    await expect(tid(page, 'case-fee')).toHaveText('฿60');
  });

  await test.step('2: off.reg1 (not the holder) approves …000026 → 403 FORBIDDEN', async () => {
    const reg1 = await cast.as('off.reg1');
    await expectError(await api.approve(reg1, caseNo(26)), 403, 'FORBIDDEN');
  });

  await test.step('3: off.reg2 clicks approve-btn → APPROVED', async () => {
    await tid(page, 'approve-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'APPROVED');
    await expect(tid(page, 'issue-btn')).toHaveCount(1);
    await expect(tid(page, 'approve-btn')).toHaveCount(0);
  });

  await test.step('4: issue-btn → COMPLETED with DOC-2569-000002', async () => {
    await tid(page, 'issue-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'COMPLETED');
    await expect(tid(page, 'doc-no')).toHaveText('DOC-2569-000002');
    verifyCode = await verifyCodeOf(page);
    await expect(tid(page, 'closed-at')).toHaveAttribute('data-iso', '2026-12-01T09:00:00+07:00');
    await expectLevelBadge(tid(page, 'sla-level'), 'closed');
  });

  await test.step('5: สมหญิง sees COMPLETED and downloads the PDF', async () => {
    const somying = await cast.as('somying');
    page = await openCase(somying, no, 'citizen');
    await expectStatusBadge(tid(page, 'case-status'), 'COMPLETED');
    await expect(tid(page, 'download-doc-btn')).toHaveCount(1);
    const { download, buffer } = await clickDownload(page, tid(page, 'download-doc-btn'));
    expect(download.suggestedFilename()).toBe('DOC-2569-000002.pdf');
    expectPdfLine(buffer, 'docNo=', /^docNo=DOC-2569-000002 caseNo=EG-2569-000025(?:\s|$)/);

    const response = await somying.get('/api/documents/DOC-2569-000002/pdf');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^application\/pdf\b/);
    expect(dispositionFilename(response.headers()['content-disposition'])).toBe('DOC-2569-000002.pdf');
    expectPdfLine(await response.body(), 'docNo=', /^docNo=DOC-2569-000002 caseNo=EG-2569-000025(?:\s|$)/);
    expect(verifyCode).toMatch(VERIFY_CODE);
  });

  await test.step('6: exec1 dashboard 2026-12 ALL', async () => {
    const exec1 = await cast.as('exec1');
    const body = await expectJson(await api.dashboard(exec1, '2026-12', 'ALL'), 200);
    expect(body).toMatchObject({ closed: 1, onTime: 1, received: 3, backlog: 20 });
  });
});

test('TC-WORKFLOW-02 SV-02 ผ่านหัวหน้า', async ({ cast }) => {
  test.setTimeout(240_000);
  const no = caseNo(13);
  let reg2 = await cast.as('off.reg2');
  let page = await openCase(reg2, no);

  await test.step('1: SV-02 at the registry has forward only, no target selector', async () => {
    await expect(tid(page, 'forward-btn')).toHaveCount(1);
    await expect(tid(page, 'approve-btn')).toHaveCount(0);
    await expect(tid(page, 'forward-target')).toHaveCount(0);
  });

  await test.step('2: forward → PENDING_APPROVAL, workload 8, row leaves the registry queue', async () => {
    await tid(page, 'forward-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'PENDING_APPROVAL');
    const queue = await openQueue(reg2);
    await expect(tid(queue, 'workload-count')).toHaveText('8');
    await expect(caseRow(queue, 'queue-row', no)).toHaveCount(0);
  });

  const head1 = await cast.as('head1');
  await test.step('3: head1 /head/approvals has 3 rows ordered …13 → …14 → …11', async () => {
    const opened = await head1.open('/head/approvals');
    expect(opened.status).toBe(200);
    page = opened.page;
    await expect(tid(page, 'approval-row')).toHaveCount(3);
    expect(await attrs(tid(page, 'approval-row'), 'data-case-no')).toEqual([caseNo(13), caseNo(14), caseNo(11)]);
  });

  await test.step('4: approval-open of …000013', async () => {
    await tid(caseRow(page, 'approval-row', no), 'approval-open').click();
    await expect(page).toHaveURL(new RegExp(`/officer/cases/${no}$`));
    await expect(tid(page, 'case-no')).toHaveText(no);
    await expect(tid(page, 'approve-btn')).toHaveCount(1);
    await expect(tid(page, 'reject-btn')).toHaveCount(1);
    await expect(tid(page, 'issue-btn')).toHaveCount(0);
  });

  await test.step('5: head1 approves → APPROVED, no issue-btn for head', async () => {
    await tid(page, 'approve-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'APPROVED');
    await expect(tid(page, 'issue-btn')).toHaveCount(0);
  });

  await test.step('6: off.reg1 (not the receiver) cannot issue', async () => {
    const reg1 = await cast.as('off.reg1');
    const reg1Page = await openCase(reg1, no);
    await expect(tid(reg1Page, 'issue-btn')).toHaveCount(0);
    await expectError(await api.issue(reg1, no), 403, 'FORBIDDEN');
  });

  await test.step('7: off.reg2 issues → COMPLETED DOC-2569-000002, signer หัวหน้าฝ่าย', async () => {
    page = await openCase(reg2, no);
    await tid(page, 'issue-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'COMPLETED');
    await expect(tid(page, 'doc-no')).toHaveText('DOC-2569-000002');
    await expectVerifySigner(cast, await verifyCodeOf(page), 'หัวหน้าฝ่าย');
  });

  await test.step('8: RESET · off.reg1 issues seed …000019 (approved by head1)', async () => {
    await cast.reset();
    const reg1 = await cast.as('off.reg1');
    page = await openCase(reg1, caseNo(19));
    await tid(page, 'issue-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'COMPLETED');
    await expect(tid(page, 'doc-no')).toHaveText('DOC-2569-000002');
    await expectVerifySigner(cast, await verifyCodeOf(page), 'หัวหน้าฝ่าย');
    reg2 = await cast.as('off.reg2');
    expect((await getCase(reg2, caseNo(19))).status).toBe('COMPLETED');
  });
});

test('TC-WORKFLOW-03 SV-03 สามขั้นตอน', async ({ cast }) => {
  test.setTimeout(240_000);
  const no = caseNo(12);
  const reg2 = await cast.as('off.reg2');
  let page = await openCase(reg2, no);

  await test.step('1: step 1/3 at the registry', async () => {
    await expect(tid(page, 'case-step')).toHaveText('ขั้นตอน 1/3 · ฝ่ายทะเบียน');
    await expect(tid(page, 'case-fee')).toHaveText('฿1,010');
    await expect(tid(page, 'forward-btn')).toHaveCount(1);
  });

  await test.step('2: forward → still IN_REVIEW at step 2/3 works, unclaimed', async () => {
    await tid(page, 'forward-btn').click();
    await expect(tid(page, 'case-step')).toHaveText('ขั้นตอน 2/3 · ฝ่ายโยธา');
    await expectStatusBadge(tid(page, 'case-status'), 'IN_REVIEW');
    await expect(tid(page, 'case-owner')).toHaveText('ยังไม่มีผู้รับ');
  });

  await test.step('2–3: off.reg2 workload 8 and queue without …000012 (16 rows)', async () => {
    const queue = await openQueue(reg2);
    await expect(tid(queue, 'workload-count')).toHaveText('8');
    await expect(tid(queue, 'queue-row')).toHaveCount(16);
    await expect(caseRow(queue, 'queue-row', no)).toHaveCount(0);
  });

  const works1 = await cast.as('off.works1');
  let worksQueue: Page;
  await test.step('4: off.works1 queue = …000010 → …000012 with 2 claim buttons', async () => {
    worksQueue = await openQueue(works1);
    await expect(tid(worksQueue, 'queue-row')).toHaveCount(2);
    expect(await attrs(tid(worksQueue, 'queue-row'), 'data-case-no')).toEqual([caseNo(10), caseNo(12)]);
    await expect(tid(worksQueue, 'claim-btn')).toHaveCount(2);
  });

  await test.step('5: off.reg1 claim …000012 → 403 FORBIDDEN (cross department)', async () => {
    const reg1 = await cast.as('off.reg1');
    await expectError(await api.claim(reg1, no), 403, 'FORBIDDEN');
  });

  await test.step('6: off.works1 claims and forwards → PENDING_APPROVAL step 3/3', async () => {
    const row = caseRow(worksQueue, 'queue-row', no);
    await tid(row, 'claim-btn').click();
    await expect(row).toHaveAttribute('data-owner', 'off.works1');
    page = await openCase(works1, no);
    await expect(tid(page, 'case-owner')).toHaveText('off.works1');
    await tid(page, 'forward-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'PENDING_APPROVAL');
    await expect(tid(page, 'case-step')).toHaveText('ขั้นตอน 3/3 · หัวหน้าฝ่าย');
  });

  await test.step('7: head1 approvals has …000012 (3 rows) and approves it', async () => {
    const head1 = await cast.as('head1');
    const opened = await head1.open('/head/approvals');
    expect(opened.status).toBe(200);
    page = opened.page;
    await expect(tid(page, 'approval-row')).toHaveCount(3);
    await expect(caseRow(page, 'approval-row', no)).toHaveCount(1);
    await tid(caseRow(page, 'approval-row', no), 'approval-open').click();
    await expect(tid(page, 'case-no')).toHaveText(no);
    await tid(page, 'approve-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'APPROVED');
  });

  await test.step('8: only the first-step registry officer issues; signer หัวหน้าฝ่าย', async () => {
    const worksPage = await openCase(works1, no);
    await expect(tid(worksPage, 'issue-btn')).toHaveCount(0);
    page = await openCase(reg2, no);
    await expect(tid(page, 'issue-btn')).toHaveCount(1);
    await tid(page, 'issue-btn').click();
    await expectStatusBadge(tid(page, 'case-status'), 'COMPLETED');
    await expectVerifySigner(cast, await verifyCodeOf(page), 'หัวหน้าฝ่าย');
  });
});

test('TC-RBAC-02 เจ้าหน้าที่อนุมัติ SV-02 ไม่ได้ (ตรวจที่ API)', async ({ cast }) => {
  test.setTimeout(180_000);
  const reg2 = await cast.as('off.reg2');

  await test.step('1: off.reg2 approve …000014 (PENDING_APPROVAL) → 403', async () => {
    await expectError(await api.approve(reg2, caseNo(14)), 403, 'FORBIDDEN');
    expect((await getCase(reg2, caseNo(14))).status).toBe('PENDING_APPROVAL');
  });

  await test.step('2: off.reg2 approve own SV-02 …000013 (IN_REVIEW) → 403', async () => {
    await expectError(await api.approve(reg2, caseNo(13)), 403, 'FORBIDDEN');
    expect((await getCase(reg2, caseNo(13))).status).toBe('IN_REVIEW');
  });

  await test.step('3: off.reg2 reject …000014 → 403, status unchanged', async () => {
    await expectError(await api.reject(reg2, caseNo(14), 'xxxxxxxxxx'), 403, 'FORBIDDEN');
    expect((await getCase(reg2, caseNo(14))).status).toBe('PENDING_APPROVAL');
  });

  await test.step('4: UI …000013 and …000014 have no approve-btn for off.reg2', async () => {
    for (const no of [caseNo(13), caseNo(14)]) {
      const page = await openCase(reg2, no);
      await expect(tid(page, 'approve-btn')).toHaveCount(0);
    }
  });

  const head1 = await cast.as('head1');
  await test.step('5: head1 approve SV-01 …000025 → 403', async () => {
    await expectError(await api.approve(head1, caseNo(25)), 403, 'FORBIDDEN');
    expect((await getCase(head1, caseNo(25))).status).toBe('IN_REVIEW');
  });

  await test.step('6: head1 approve …000014 → 200 APPROVED (positive control)', async () => {
    await expectJson(await api.approve(head1, caseNo(14)), 200, { status: 'APPROVED' });
  });

  await test.step('7: audit1 sees exactly one APPROVE (head1)', async () => {
    const audit1 = await cast.as('audit1');
    const { items } = await auditItems(audit1, { event: 'APPROVE' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ username: 'head1', event: 'APPROVE', caseNo: caseNo(14) });

    const { page, status } = await audit1.open('/audit');
    expect(status).toBe(200);
    await choose(page, 'audit-filter-event', 'APPROVE');
    await tid(page, 'audit-apply-btn').click();
    await expect(tid(page, 'audit-count')).toHaveText('1');
    await expect(tid(page, 'audit-row')).toHaveCount(1);
    await expect(tid(page, 'audit-row')).toHaveAttribute('data-actor', 'head1');
    await expect(tid(page, 'audit-row')).toHaveAttribute('data-event', 'APPROVE');
    await expect(tid(page, 'audit-row')).toHaveAttribute('data-case-no', caseNo(14));
    await expect(page.locator('[data-testid="audit-row"][data-actor="off.reg2"]')).toHaveCount(0);
  });
});
