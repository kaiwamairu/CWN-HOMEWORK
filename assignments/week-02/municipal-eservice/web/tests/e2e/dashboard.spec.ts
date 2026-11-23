import { inflateSync, constants as zlibConstants } from 'node:zlib';
import ExcelJS from 'exceljs';
import type { Page } from '@playwright/test';
import {
  test, expect, api, attrs, caseNo, choose, clickDownload, expectJson, expectNoPersonalData, expectPdfLine, issue,
  auditItems, rowBy, texts, tid, type Actor,
} from './source-helpers.js';

/** The five on-screen KPI texts (CONTRACT §2.9). */
interface KpiTexts { received: string; closed: string; ontime: string; backlog: string; overdue: string }

async function expectKpis(page: Page, kpi: KpiTexts): Promise<void> {
  await expect(tid(page, 'kpi-received')).toHaveText(kpi.received);
  await expect(tid(page, 'kpi-closed')).toHaveText(kpi.closed);
  await expect(tid(page, 'kpi-ontime-pct')).toHaveText(kpi.ontime);
  await expect(tid(page, 'kpi-backlog')).toHaveText(kpi.backlog);
  await expect(tid(page, 'kpi-overdue')).toHaveText(kpi.overdue);
}

async function openDashboard(exec: Actor): Promise<Page> {
  const { page, status } = await exec.open('/dashboard');
  expect(status, 'exec1 opens /dashboard').toBe(200);
  return page;
}

/** Backlog / overdue are "now" values per service (TEST-PLAN DASH-01 · DASH-02 · TEST-DATA §7.2). */
const NOW_VALUES = {
  ALL: { backlog: 21, overdue: 1 },
  'SV-01': { backlog: 11, overdue: 1 },
  'SV-02': { backlog: 7, overdue: 0 },
  'SV-03': { backlog: 3, overdue: 0 },
} as const;
type ServiceFilter = keyof typeof NOW_VALUES;

/** CONTRACT §7 Dashboard .xlsx: first sheet, row 1 header, rows 2–6 label/value texts. */
async function readDashboardXlsx(buffer: Buffer): Promise<{ header: string[]; rows: string[][]; allText: string }> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  expect(sheet, 'xlsx has a first worksheet').toBeDefined();
  const header = [sheet!.getRow(1).getCell(1).text, sheet!.getRow(1).getCell(2).text];
  const rows: string[][] = [];
  for (let r = 2; r <= 6; r += 1) rows.push([sheet!.getRow(r).getCell(1).text, sheet!.getRow(r).getCell(2).text]);
  const cellTexts: string[] = [];
  for (const ws of workbook.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => { cellTexts.push(cell.text); });
    });
  }
  return { header, rows, allText: cellTexts.join('\n') };
}

/**
 * Text extracted from the PDF content (string operands of BT…ET text objects, raw and Flate-decoded),
 * excluding PDF structure such as xref offsets (TEST-PLAN DASH-03: scan extracted text, not raw bytes).
 */
function pdfTextOnly(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const sources: string[] = [raw];
  const streamStart = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamStart.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    const data = pdf.subarray(start, end);
    for (const candidate of [data, data.subarray(0, Math.max(0, data.length - 1)), data.subarray(0, Math.max(0, data.length - 2))]) {
      try {
        sources.push(inflateSync(candidate, { finishFlush: zlibConstants.Z_SYNC_FLUSH }).toString('latin1'));
        break;
      } catch { /* not a Flate stream */ }
    }
    streamStart.lastIndex = end;
  }
  const out: string[] = [];
  for (const source of sources) {
    for (const block of source.match(/(?:^|\s)BT\s[\s\S]*?\sET(?=\s|$)/g) ?? []) {
      const parts: string[] = [];
      for (const operand of block.match(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g) ?? []) {
        if (operand.startsWith('(')) parts.push(operand.slice(1, -1).replace(/\\([()\\])/g, '$1'));
        else {
          const hex = operand.slice(1, -1).replace(/\s+/g, '');
          parts.push(Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex').toString('latin1'));
        }
      }
      if (parts.length) out.push(parts.join(''));
    }
  }
  return out.join('\n');
}

test('TC-DASH-01 Dashboard ตัวเลขเริ่มต้น', async ({ cast }) => {
  test.setTimeout(120_000);
  const exec = await cast.as('exec1');
  const page = await openDashboard(exec);

  await test.step('ค่าเริ่มต้นของตัวกรอง: 2026-12 / ALL', async () => {
    await expect(tid(page, 'period-select')).toHaveValue('2026-12');
    await expect(tid(page, 'service-select')).toHaveValue('ALL');
  });

  await test.step('KPI บนจอ: 3 · 0 · – · 21 · 1 และงานในมือ 3 แถว', async () => {
    await expectKpis(page, { received: '3', closed: '0', ontime: '–', backlog: '21', overdue: '1' });
    await expect(tid(page, 'workload-row')).toHaveCount(3);
    for (const [username, count] of [['off.reg1', '3'], ['off.reg2', '9'], ['off.works1', '0']] as const) {
      const row = rowBy(page, 'workload-row', 'data-username', username);
      await expect(row).toHaveCount(1);
      await expect(tid(row, 'workload-value')).toHaveText(count);
    }
  });

  await test.step('API GET /api/dashboard?period=2026-12&service=ALL', async () => {
    const body = await expectJson(await api.dashboard(exec, '2026-12', 'ALL'), 200);
    expect(body).toMatchObject({ received: 3, closed: 0, onTime: 0, ontimePct: null, backlog: 21, overdue: 1 });
    const workload = (body.workload as Array<{ username: string; count: number }>)
      .map(({ username, count }) => ({ username, count }))
      .sort((a, b) => a.username.localeCompare(b.username));
    expect(workload).toEqual([
      { username: 'off.reg1', count: 3 },
      { username: 'off.reg2', count: 9 },
      { username: 'off.works1', count: 0 },
    ]);
  });

  await test.step('ไม่มีข้อมูลส่วนบุคคลใน innerText (BR-24)', async () => {
    expectNoPersonalData(await page.locator('body').innerText(), '/dashboard innerText');
  });

  await test.step('ตัวกรองบริการ SV-01 / SV-02 / SV-03 (จอและ API)', async () => {
    const rows = [
      { service: 'SV-01', received: 3 },
      { service: 'SV-02', received: 0 },
      { service: 'SV-03', received: 0 },
    ] as const;
    for (const row of rows) {
      const now = NOW_VALUES[row.service];
      await choose(page, 'service-select', row.service);
      await expect(tid(page, 'period-select')).toHaveValue('2026-12');
      await expectKpis(page, { received: String(row.received), closed: '0', ontime: '–', backlog: String(now.backlog), overdue: String(now.overdue) });
      const body = await expectJson(await api.dashboard(exec, '2026-12', row.service), 200);
      expect(body, `API 2026-12 ${row.service}`).toMatchObject({
        received: row.received, closed: 0, onTime: 0, ontimePct: null, backlog: now.backlog, overdue: now.overdue,
      });
    }
  });
});

test('TC-DASH-02 Dashboard ย้อนหลัง', async ({ cast }) => {
  test.setTimeout(150_000);
  const exec = await cast.as('exec1');
  const page = await openDashboard(exec);
  const rows: ReadonlyArray<{ period: string; service: ServiceFilter; received: number; closed: number; onTime: number; text: string; pct: number }> = [
    { period: '2026-10', service: 'ALL', received: 1, closed: 1, onTime: 1, text: '100.0%', pct: 100 },
    { period: '2026-11', service: 'ALL', received: 26, closed: 7, onTime: 6, text: '85.7%', pct: 85.7 },
    { period: '2026-11', service: 'SV-01', received: 12, closed: 3, onTime: 3, text: '100.0%', pct: 100 },
    { period: '2026-11', service: 'SV-02', received: 10, closed: 3, onTime: 2, text: '66.7%', pct: 66.7 },
    { period: '2026-11', service: 'SV-03', received: 4, closed: 1, onTime: 1, text: '100.0%', pct: 100 },
    { period: '2026', service: 'ALL', received: 30, closed: 8, onTime: 7, text: '87.5%', pct: 87.5 },
    { period: '2026', service: 'SV-01', received: 16, closed: 4, onTime: 4, text: '100.0%', pct: 100 },
    { period: '2026', service: 'SV-02', received: 10, closed: 3, onTime: 2, text: '66.7%', pct: 66.7 },
    { period: '2026', service: 'SV-03', received: 4, closed: 1, onTime: 1, text: '100.0%', pct: 100 },
  ];
  for (const row of rows) {
    await test.step(`${row.period} / ${row.service}: ${row.received} · ${row.closed} · ${row.text}`, async () => {
      const now = NOW_VALUES[row.service];
      await choose(page, 'period-select', row.period);
      await choose(page, 'service-select', row.service);
      await expectKpis(page, {
        received: String(row.received), closed: String(row.closed), ontime: row.text,
        backlog: String(now.backlog), overdue: String(now.overdue),
      });
      const body = await expectJson(await api.dashboard(exec, row.period, row.service), 200);
      expect(body, `API ${row.period} ${row.service}`).toMatchObject({
        received: row.received, closed: row.closed, onTime: row.onTime, ontimePct: row.pct, backlog: now.backlog, overdue: now.overdue,
      });
    });
  }
});

test('TC-DASH-03 ส่งออก Excel/PDF เท่าหน้าจอ', async ({ cast }) => {
  test.setTimeout(180_000);
  const exec = await cast.as('exec1');
  const page = await openDashboard(exec);
  const labels = ['รับเรื่อง', 'ปิดงาน', 'ทันกำหนด %', 'งานคงค้าง', 'เกินกำหนดคงค้าง'];

  await test.step('2026-11 / ALL → export-xlsx-btn: ชีตแรกเท่ากับ 5 ช่อง kpi-* บนจอ', async () => {
    await choose(page, 'period-select', '2026-11');
    await choose(page, 'service-select', 'ALL');
    await expectKpis(page, { received: '26', closed: '7', ontime: '85.7%', backlog: '21', overdue: '1' });
    const { download, buffer } = await clickDownload(page, tid(page, 'export-xlsx-btn'));
    expect(download.suggestedFilename(), 'xlsx download name').toMatch(/\.xlsx$/i);
    const xlsx = await readDashboardXlsx(buffer);
    expect(xlsx.header).toEqual(['ตัวชี้วัด', 'ค่า']);
    expect(xlsx.rows).toEqual([
      [labels[0], '26'], [labels[1], '7'], [labels[2], '85.7%'], [labels[3], '21'], [labels[4], '1'],
    ]);
    const onScreen = [
      await tid(page, 'kpi-received').innerText(), await tid(page, 'kpi-closed').innerText(), await tid(page, 'kpi-ontime-pct').innerText(),
      await tid(page, 'kpi-backlog').innerText(), await tid(page, 'kpi-overdue').innerText(),
    ].map((text) => text.trim());
    expect(xlsx.rows.map((row) => row[1]), 'xlsx values equal the on-screen kpi-* texts').toEqual(onScreen);
    expectNoPersonalData(xlsx.allText, 'xlsx 2026-11 cell texts');
  });

  await test.step('2026-11 / ALL → export-pdf-btn: บรรทัด kpi ASCII', async () => {
    const { buffer } = await clickDownload(page, tid(page, 'export-pdf-btn'));
    expectPdfLine(buffer, 'kpi ', 'kpi received=26 closed=7 ontime=85.7% backlog=21 overdue=1');
    expectNoPersonalData(pdfTextOnly(buffer), 'pdf 2026-11 extracted text');
  });

  await test.step('2026-12 / ALL → export-xlsx-btn: 3 · 0 · – · 21 · 1', async () => {
    await choose(page, 'period-select', '2026-12');
    await choose(page, 'service-select', 'ALL');
    await expectKpis(page, { received: '3', closed: '0', ontime: '–', backlog: '21', overdue: '1' });
    const { download, buffer } = await clickDownload(page, tid(page, 'export-xlsx-btn'));
    expect(download.suggestedFilename(), 'xlsx download name').toMatch(/\.xlsx$/i);
    const xlsx = await readDashboardXlsx(buffer);
    expect(xlsx.header).toEqual(['ตัวชี้วัด', 'ค่า']);
    expect(xlsx.rows).toEqual([
      [labels[0], '3'], [labels[1], '0'], [labels[2], '–'], [labels[3], '21'], [labels[4], '1'],
    ]);
    expectNoPersonalData(xlsx.allText, 'xlsx 2026-12 cell texts');
  });

  await test.step('Audit: EXPORT = 3 โดย exec1 · executive · รูปแบบและช่วงใน detail', async () => {
    const auditor = await cast.as('audit1');
    const { page: auditPage, status } = await auditor.open('/audit');
    expect(status).toBe(200);
    await choose(auditPage, 'audit-filter-event', 'EXPORT');
    await tid(auditPage, 'audit-apply-btn').click();
    await expect(tid(auditPage, 'audit-count')).toHaveText('3');
    const rows = tid(auditPage, 'audit-row');
    await expect(rows).toHaveCount(3);
    await expect.poll(() => attrs(rows, 'data-event')).toEqual(['EXPORT', 'EXPORT', 'EXPORT']);
    expect(await attrs(rows, 'data-actor')).toEqual(['exec1', 'exec1', 'exec1']);
    expect(await texts(tid(auditPage, 'audit-role'))).toEqual(['executive', 'executive', 'executive']);
    const details = await texts(tid(auditPage, 'audit-detail'));
    for (const expected of ['xlsx 2026-11 ALL', 'pdf 2026-11 ALL', 'xlsx 2026-12 ALL']) {
      expect(details.filter((detail) => detail.includes(expected)), `one UI audit-detail contains "${expected}"`).toHaveLength(1);
    }

    const { count, items } = await auditItems(auditor, { event: 'EXPORT' });
    expect(count).toBe(3);
    for (const item of items) expect(item).toMatchObject({ event: 'EXPORT', username: 'exec1', role: 'executive' });
    for (const expected of ['xlsx 2026-11 ALL', 'pdf 2026-11 ALL', 'xlsx 2026-12 ALL']) {
      expect(items.filter((item) => String(item.detail ?? '').includes(expected)), `one API detail contains "${expected}"`).toHaveLength(1);
    }
  });

  await test.step('PDF Content-Type: application/pdf (API ตรวจหลังนับ Audit แล้ว)', async () => {
    const response = await exec.get('/api/dashboard/export?format=pdf&period=2026-11&service=ALL');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type'] ?? '').toMatch(/^application\/pdf\b/);
    const buffer = await response.body();
    expectPdfLine(buffer, 'kpi ', 'kpi received=26 closed=7 ontime=85.7% backlog=21 overdue=1');
    expectNoPersonalData(pdfTextOnly(buffer), 'pdf 2026-11 (API) extracted text');
  });
});

test('TC-DASH-04 ค่าขอบ "ทันกำหนด" 16:29:59 / 16:30:00 / 16:30:01', async ({ cast }) => {
  test.setTimeout(150_000);
  await cast.clock('2026-12-03T16:00:00+07:00');
  const reg1 = await cast.as('off.reg1');
  const reg2 = await cast.as('off.reg2');
  const exec = await cast.as('exec1');

  async function expectClosedAt(officer: Actor, no: string, iso: string): Promise<void> {
    const { page, status } = await officer.open(`/officer/cases/${no}`);
    expect(status).toBe(200);
    await expect(tid(page, 'case-no')).toHaveText(no);
    await expect(tid(page, 'closed-at')).toHaveAttribute('data-iso', iso);
    const body = await expectJson(await officer.get(`/api/cases/${no}`), 200);
    expect(body.closedAt, `${no} closedAt`).toBe(iso);
  }

  async function expectDashboard(closed: number, onTime: number, backlog?: number): Promise<void> {
    const body = await expectJson(await api.dashboard(exec, '2026-12', 'ALL'), 200);
    expect(body).toMatchObject({ closed, onTime });
    if (backlog !== undefined) expect(body.backlog).toBe(backlog);
    const page = await openDashboard(exec);
    await expect(tid(page, 'period-select')).toHaveValue('2026-12');
    await expect(tid(page, 'service-select')).toHaveValue('ALL');
    await expect(tid(page, 'kpi-closed')).toHaveText(String(closed));
    if (backlog !== undefined) await expect(tid(page, 'kpi-backlog')).toHaveText(String(backlog));
  }

  await test.step('1: 16:00:00 off.reg2 approve …000025 · off.reg1 approve …000023', async () => {
    await expectJson(await api.approve(reg2, caseNo(25)), 200, { status: 'APPROVED' });
    await expectJson(await api.approve(reg1, caseNo(23)), 200, { status: 'APPROVED' });
  });

  await test.step('2: 16:29:59 off.reg2 issue …000025 → ทัน · closed 1 · onTime 1', async () => {
    await cast.clock('2026-12-03T16:29:59+07:00');
    await issue(reg2, caseNo(25));
    await expectClosedAt(reg2, caseNo(25), '2026-12-03T16:29:59+07:00');
    await expectDashboard(1, 1);
  });

  await test.step('3: 16:30:00 off.reg2 reject …000026 → ทัน (ที่ขอบ) · closed 2 · onTime 2', async () => {
    await cast.clock('2026-12-03T16:30:00+07:00');
    const body = await expectJson(await api.reject(reg2, caseNo(26), 'xxxxxxxxxx'), 200);
    expect(body).toMatchObject({ status: 'REJECTED', closedAt: '2026-12-03T16:30:00+07:00' });
    await expectClosedAt(reg2, caseNo(26), '2026-12-03T16:30:00+07:00');
    await expectDashboard(2, 2);
  });

  await test.step('4: 16:30:01 off.reg1 issue …000023 → ไม่ทัน · closed 3 · onTime 2 · backlog 18', async () => {
    await cast.clock('2026-12-03T16:30:01+07:00');
    await issue(reg1, caseNo(23));
    await expectClosedAt(reg1, caseNo(23), '2026-12-03T16:30:01+07:00');
    await expectDashboard(3, 2, 18);
  });
});
