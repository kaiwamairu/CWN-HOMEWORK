import type { Download, Page } from '@playwright/test';
import {
  test, expect, api, approveAndIssue, caseNo, dispositionFilename, downloadBuffer, expectError, expectJson, expectPdfLine,
  expectStatus, getCase, issue, openCase, rowBy, tid, VERIFY_CODE, type Actor, type Cast,
} from './source-helpers.js';

type VerifyResult = 'VALID' | 'EXPIRED' | 'TAMPERED' | 'NOT_FOUND';
/** CONTRACT §2.13 `verify-result` texts. */
const VERIFY_TH: Record<VerifyResult, string> = {
  VALID: 'เอกสารถูกต้อง', EXPIRED: 'เอกสารหมดอายุ', TAMPERED: 'ลายเซ็นไม่ถูกต้อง', NOT_FOUND: 'ไม่พบเอกสาร',
};

/** Open `/verify/<code>` anonymously; NOT_FOUND → 404, otherwise 200 (CONTRACT §1). */
async function openVerify(anon: Actor, code: string, result: VerifyResult): Promise<Page> {
  const { page, status } = await anon.open(`/verify/${code}`);
  expect(status, `/verify/${code} HTTP status`).toBe(result === 'NOT_FOUND' ? 404 : 200);
  await expect(page).toHaveURL(new RegExp(`/verify/${code}$`));
  const verdict = tid(page, 'verify-result');
  await expect(verdict).toHaveAttribute('data-result', result);
  await expect(verdict).toHaveText(VERIFY_TH[result]);
  if (result === 'TAMPERED' || result === 'NOT_FOUND') {
    await expect(tid(page, 'verify-doc-no')).toHaveCount(0);
    await expect(tid(page, 'verify-applicant')).toHaveCount(0);
  }
  return page;
}

/** At each clock value, the anonymous verify page shows the expected result. */
async function verifyAtClock(cast: Cast, anon: Actor, code: string, checks: ReadonlyArray<{ now: string; result: VerifyResult; expires?: string }>): Promise<void> {
  for (const { now, result, expires } of checks) {
    await cast.clock(now);
    const page = await openVerify(anon, code, result);
    if (expires) await expect(tid(page, 'verify-expires')).toHaveAttribute('data-iso', expires);
  }
}

/** Click a link that yields a file (same page or a popup) and read it. */
async function clickForFile(page: Page, link: ReturnType<Page['getByTestId']>): Promise<Buffer> {
  const download = new Promise<Download>((resolve) => {
    page.once('download', resolve);
    page.context().once('page', (popup) => popup.once('download', resolve));
  });
  await link.click();
  return downloadBuffer(await download);
}

function verifyUrl(cast: Cast, code: string): string {
  return `${cast.baseURL.replace(/\/$/, '')}/verify/${code}`;
}

test('TC-DOC-01 ออกเอกสารและข้อมูลในเอกสาร', async ({ cast }) => {
  test.setTimeout(180_000);
  const no = caseNo(25);
  const docNo = 'DOC-2569-000002';
  const reg2 = await cast.as('off.reg2');
  let verifyCode = '';

  await test.step('off.reg2 approves + issues …000025 via API', async () => {
    await expectJson(await api.approve(reg2, no), 200, { status: 'APPROVED' });
    const body = await expectJson(await api.issue(reg2, no), 200);
    expect(body).toEqual({ docNo, status: 'COMPLETED', verifyCode: expect.stringMatching(VERIFY_CODE) });
    verifyCode = body.verifyCode as string;
  });

  await test.step('สมหญิง downloads the PDF with the machine-readable line', async () => {
    const somying = await cast.as('somying');
    const response = await somying.get(`/api/documents/${docNo}/pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^application\/pdf\b/);
    expect(dispositionFilename(response.headers()['content-disposition'])).toBe(`${docNo}.pdf`);
    expectPdfLine(await response.body(), 'docNo=', `docNo=${docNo} caseNo=${no} verify=${verifyCode} validUntil=2027-02-28`);
  });

  await test.step('/verify/<verifyCode> shows the document content', async () => {
    const anon = await cast.anon();
    const page = await openVerify(anon, verifyCode, 'VALID');
    await expect(tid(page, 'verify-doc-no')).toHaveText(docNo);
    await expect(tid(page, 'verify-applicant')).toHaveText('สมหญิง ร***');
    await expect(tid(page, 'verify-service')).toHaveText('SV-01 ขอหนังสือรับรอง');
    await expect(tid(page, 'verify-issued')).toHaveAttribute('data-iso', '2026-12-01T09:00:00+07:00');
    await expect(tid(page, 'verify-expires')).toHaveAttribute('data-iso', '2027-02-28');
    await expect(tid(page, 'verify-signer')).toHaveText('เจ้าหน้าที่ทะเบียน 2');
  });

  await test.step('case pages: doc-qr data-url = <BASE_URL>/verify/<code>', async () => {
    const officerPage = await openCase(reg2, no);
    await expect(tid(officerPage, 'doc-qr')).toHaveAttribute('data-url', verifyUrl(cast, verifyCode));
    const citizenPage = await openCase(await cast.as('somying'), no, 'citizen');
    await expect(tid(citizenPage, 'doc-qr')).toHaveAttribute('data-url', verifyUrl(cast, verifyCode));
  });

  await test.step('GET /api/verify/<code> → VALID', async () => {
    const anon = await cast.anon();
    const body = await expectJson(await api.verify(anon, verifyCode), 200);
    expect(body).toMatchObject({ result: 'VALID', validUntil: '2027-02-28', issuedAt: '2026-12-01T09:00:00+07:00' });
  });

  await test.step('สมชาย (not the applicant) → 404', async () => {
    const somchai = await cast.as('somchai');
    await expectStatus(await somchai.get(`/api/documents/${docNo}/pdf`), 404);
  });

  await test.step('issue again → 409 INVALID_STATE; next document is still DOC-2569-000003', async () => {
    await expectError(await api.issue(reg2, no), 409, 'INVALID_STATE');
    expect((await getCase(reg2, no)).docNo).toBe(docNo);
    const reg1 = await cast.as('off.reg1');
    const next = await issue(reg1, caseNo(19));
    expect(next.docNo).toBe('DOC-2569-000003');
  });
});

test('TC-DOC-02 ตรวจเอกสาร /verify', async ({ cast }) => {
  test.setTimeout(120_000);
  const anon = await cast.anon();

  await test.step('/verify/K7M2Q9XA → 200 VALID with the seed document (no login redirect)', async () => {
    const page = await openVerify(anon, 'K7M2Q9XA', 'VALID');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(tid(page, 'verify-doc-no')).toHaveText('DOC-2569-000001');
    await expect(tid(page, 'verify-applicant')).toHaveText('สมชาย ใ***');
    await expect(tid(page, 'verify-service')).toHaveText('SV-01 ขอหนังสือรับรอง');
    await expect(tid(page, 'verify-issued')).toHaveAttribute('data-iso', '2026-11-05T10:00:00+07:00');
    await expect(tid(page, 'verify-expires')).toHaveAttribute('data-iso', '2027-02-02');
    await expect(tid(page, 'verify-signer')).toHaveText('เจ้าหน้าที่ทะเบียน 1');
    const html = await page.content();
    expect(html).not.toContain('ใจดี');
    expect(html).not.toContain('1101700123456');
  });

  await test.step('/verify/ZZZZZZZZ → 404 NOT_FOUND without personal fields', async () => {
    await openVerify(anon, 'ZZZZZZZZ', 'NOT_FOUND');
  });

  await test.step('API verify: VALID masked · NOT_FOUND 404', async () => {
    const valid = await expectJson(await api.verify(anon, 'K7M2Q9XA'), 200);
    expect(valid).toMatchObject({ result: 'VALID', applicantMasked: 'สมชาย ใ***' });
    await expectJson(await api.verify(anon, 'ZZZZZZZZ'), 404, { result: 'NOT_FOUND' });
  });
});

test('TC-DOC-03 เอกสารหมดอายุและลายเซ็นไม่ตรง', async ({ cast }) => {
  test.setTimeout(300_000);

  await test.step('A: SV-01 issued 1 ธ.ค. 69 · valid through 2027-02-28', async () => {
    const reg2 = await cast.as('off.reg2');
    const { verifyCode } = await approveAndIssue(reg2, caseNo(25));
    const anon = await cast.anon();
    await verifyAtClock(cast, anon, verifyCode, [
      { now: '2027-02-28T23:59:00+07:00', result: 'VALID', expires: '2027-02-28' },
      { now: '2027-03-01T00:00:00+07:00', result: 'EXPIRED', expires: '2027-02-28' },
    ]);
  });

  await test.step('B: RESET · SV-02 …000019 issued 1 ธ.ค. 69 · valid through 2027-11-30', async () => {
    await cast.reset();
    const reg1 = await cast.as('off.reg1');
    const { verifyCode } = await issue(reg1, caseNo(19));
    const anon = await cast.anon();
    await verifyAtClock(cast, anon, verifyCode, [
      { now: '2027-11-30T23:59:00+07:00', result: 'VALID', expires: '2027-11-30' },
      { now: '2027-12-01T00:00:00+07:00', result: 'EXPIRED' },
    ]);
  });

  await test.step('C: RESET · seed K7M2Q9XA valid through 2027-02-02', async () => {
    await cast.reset();
    const anon = await cast.anon();
    await verifyAtClock(cast, anon, 'K7M2Q9XA', [
      { now: '2027-02-02T23:59:00+07:00', result: 'VALID' },
      { now: '2027-02-03T00:00:00+07:00', result: 'EXPIRED' },
    ]);
  });

  await test.step('E: RESET · issued on 29 ก.พ. 2571 → DOC-2571-000001/2 and edge expiry', async () => {
    await cast.reset();
    await cast.clock('2028-02-29T10:00:00+07:00');
    const reg2 = await cast.as('off.reg2');
    const sv01 = await approveAndIssue(reg2, caseNo(25));
    expect(sv01.docNo).toBe('DOC-2571-000001');
    const reg1 = await cast.as('off.reg1');
    const sv02 = await issue(reg1, caseNo(19));
    expect(sv02.docNo).toBe('DOC-2571-000002');
    const anon = await cast.anon();
    await verifyAtClock(cast, anon, sv01.verifyCode, [
      { now: '2028-05-28T23:59:00+07:00', result: 'VALID', expires: '2028-05-28' },
      { now: '2028-05-29T00:00:00+07:00', result: 'EXPIRED', expires: '2028-05-28' },
    ]);
    await verifyAtClock(cast, anon, sv02.verifyCode, [
      { now: '2029-02-27T23:59:00+07:00', result: 'VALID', expires: '2029-02-27' },
      { now: '2029-02-28T00:00:00+07:00', result: 'EXPIRED', expires: '2029-02-27' },
    ]);
  });

  await test.step('D: RESET · tampered DOC-2569-000001 → TAMPERED (also when expired)', async () => {
    await cast.reset();
    await cast.tamper('DOC-2569-000001');
    const anon = await cast.anon();
    await openVerify(anon, 'K7M2Q9XA', 'TAMPERED');
    await cast.clock('2027-03-01T00:00:00+07:00');
    await openVerify(anon, 'K7M2Q9XA', 'TAMPERED');
  });
});

test('TC-RBAC-05 สิทธิ์เปิด/ดาวน์โหลดไฟล์แนบ', async ({ cast }) => {
  test.setTimeout(240_000);
  type FileItem = { fileId: string | number; name: string; docKey: string; size: number };
  const SV01 = ['id-card.pdf'];
  const SV03 = ['id-card.pdf', 'plan.pdf', 'deed.pdf'];

  /** Allowed row: list = 200 with exactly these names; every file = 200 application/pdf starting %PDF. */
  async function allowed(actor: Actor, no: string, names: readonly string[]): Promise<FileItem[]> {
    const body = await expectJson(await actor.get(`/api/cases/${no}/files`), 200);
    const items = body.items as FileItem[];
    expect(items.map((item) => item.name).sort(), `${actor.name} ${no} files`).toEqual([...names].sort());
    for (const item of items) {
      const response = await actor.get(`/api/files/${item.fileId}`);
      expect(response.status(), `${actor.name} /api/files/${item.fileId}`).toBe(200);
      expect(response.headers()['content-type']).toMatch(/^application\/pdf\b/);
      expect((await response.body()).subarray(0, 4).toString('latin1')).toBe('%PDF');
    }
    return items;
  }

  /** Denied row: list and each known fileId give the same status. */
  async function denied(actor: Actor, no: string, fileIds: ReadonlyArray<string | number>, status: 401 | 403 | 404): Promise<void> {
    const list = await actor.get(`/api/cases/${no}/files`);
    if (status === 401) await expectError(list, 401, 'UNAUTHENTICATED');
    else if (status === 403) await expectError(list, 403, 'FORBIDDEN');
    else await expectError(list, 404, 'NOT_FOUND');
    expect(fileIds.length, 'denied row is probed with real fileIds').toBeGreaterThan(0);
    for (const fileId of fileIds) {
      const response = await actor.get(`/api/files/${fileId}`);
      if (status === 401) await expectError(response, 401, 'UNAUTHENTICATED');
      else if (status === 403) await expectError(response, 403, 'FORBIDDEN');
      else await expectStatus(response, 404);
    }
  }

  const n25 = caseNo(25);
  const n12 = caseNo(12);
  const n10 = caseNo(10);
  const n11 = caseNo(11);
  let ids25: Array<string | number> = [];
  let ids12: Array<string | number> = [];
  let reg1Id = '' as string | number;

  await test.step('off.reg1 · …000025 → 200 (1 file)', async () => {
    const items = await allowed(await cast.as('off.reg1'), n25, SV01);
    reg1Id = items[0]!.fileId;
  });
  await test.step('สมหญิง · …000025 (own) → 200', async () => {
    ids25 = (await allowed(await cast.as('somying'), n25, SV01)).map((item) => item.fileId);
  });
  await test.step('off.works1 · …000025 → 403', async () => {
    await denied(await cast.as('off.works1'), n25, ids25, 403);
  });
  await test.step('off.reg2 · …000012 (own, step 1/3) → 200 (3 files)', async () => {
    ids12 = (await allowed(await cast.as('off.reg2'), n12, SV03)).map((item) => item.fileId);
  });
  await test.step('off.works1 · …000012 (not yet at works) → 403', async () => {
    await denied(await cast.as('off.works1'), n12, ids12, 403);
  });
  await test.step('off.works1 · …000010 (at works) → 200 (3 files)', async () => {
    await allowed(await cast.as('off.works1'), n10, SV03);
  });
  await test.step('off.reg1 · …000010 (passed registry) → 200', async () => {
    await allowed(await cast.as('off.reg1'), n10, SV03);
  });
  await test.step('off.works1 · …000011 (passed works) → 200', async () => {
    await allowed(await cast.as('off.works1'), n11, SV03);
  });
  await test.step('head1 · …000025 …000010 …000012 → 200', async () => {
    const head1 = await cast.as('head1');
    await allowed(head1, n25, SV01);
    await allowed(head1, n10, SV03);
    await allowed(head1, n12, SV03);
  });
  await test.step('สมชาย · …000025 (สมหญิง\'s) → 404 with สมหญิง\'s fileId', async () => {
    await denied(await cast.as('somchai'), n25, ids25, 404);
  });
  await test.step('exec1 · audit1 · admin1 · …000025 → 403', async () => {
    for (const name of ['exec1', 'audit1', 'admin1'] as const) await denied(await cast.as(name), n25, ids25, 403);
  });
  await test.step('anonymous · …000025 → 401', async () => {
    await denied(await cast.anon(), n25, ids25, 401);
  });

  await test.step('off.reg1 · unknown fileId → 404', async () => {
    const missing = /^\d+$/.test(String(reg1Id)) ? '987654321' : 'no-such-file-0000';
    expect([...ids25, ...ids12].map(String)).not.toContain(missing);
    await expectStatus(await (await cast.as('off.reg1')).get(`/api/files/${missing}`), 404);
  });

  await test.step('UI: off.reg1 …000025 doc-item id-card.pdf downloads > 0 bytes', async () => {
    const page = await openCase(await cast.as('off.reg1'), n25);
    await expect(tid(page, 'doc-item')).toHaveCount(1);
    const item = rowBy(page, 'doc-item', 'data-name', 'id-card.pdf');
    await expect(item).toHaveCount(1);
    await expect(item).toHaveAttribute('data-file-id', String(reg1Id));
    const link = tid(item, 'doc-download-link');
    await expect(link).toHaveCount(1);
    const buffer = await clickForFile(page, link);
    expect(buffer.length).toBeGreaterThan(0);
  });

  await test.step('UI: off.reg2 …000012 has 3 doc-item · สมหญิง …000025 has 1', async () => {
    const reg2Page = await openCase(await cast.as('off.reg2'), n12);
    await expect(tid(reg2Page, 'doc-item')).toHaveCount(3);
    const citizenPage = await openCase(await cast.as('somying'), n25, 'citizen');
    await expect(tid(citizenPage, 'doc-item')).toHaveCount(1);
  });
});
