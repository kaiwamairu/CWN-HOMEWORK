import type { Page } from '@playwright/test';
import {
  test, expect, api, attrs, auditItems, caseNo, choose, clickDownload, expectError, expectJson, issue, tid, type Actor, type Json,
} from './source-helpers.js';

const T0 = '2026-12-01T09:00:00+07:00';

interface UiAuditRow {
  id: string; event: string; actor: string; caseNo: string; iso: string;
  eventText: string; actorText: string; role: string; caseNoText: string; transition: string; detail: string;
}

/** Every rendered `audit-row` with its data attributes and cell texts, in document order. */
async function uiAuditRows(page: Page): Promise<UiAuditRow[]> {
  return tid(page, 'audit-row').evaluateAll((rows) => rows.map((row) => {
    const cell = (id: string) => row.querySelector(`[data-testid="${id}"]`);
    const text = (id: string) => (cell(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      id: row.getAttribute('data-id') ?? '',
      event: row.getAttribute('data-event') ?? '',
      actor: row.getAttribute('data-actor') ?? '',
      caseNo: row.getAttribute('data-case-no') ?? '',
      iso: cell('audit-time')?.getAttribute('data-iso') ?? '',
      eventText: text('audit-event'),
      actorText: text('audit-actor'),
      role: text('audit-role'),
      caseNoText: text('audit-case-no'),
      transition: text('audit-transition'),
      detail: text('audit-detail'),
    };
  }));
}

/** Fill every filter (empty = no filter) and press `audit-apply-btn`. */
async function applyFilter(page: Page, filter: { actor?: string; event?: string; from?: string; to?: string } = {}): Promise<void> {
  await tid(page, 'audit-filter-actor').fill(filter.actor ?? '');
  await choose(page, 'audit-filter-event', filter.event ?? '');
  await tid(page, 'audit-filter-from').fill(filter.from ?? '');
  await tid(page, 'audit-filter-to').fill(filter.to ?? '');
  await tid(page, 'audit-apply-btn').click();
}

/** `a` strictly after `b` in data-id descending order (numeric when both numeric, otherwise as strings). */
function idDescending(a: string, b: string): boolean {
  const numeric = /^\d+$/;
  if (numeric.test(a) && numeric.test(b)) return Number(a) > Number(b);
  return a > b;
}

/** Minimal RFC 4180 parser (quoted fields, doubled quotes, CRLF/LF, quoted newlines). */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { record.push(field); field = ''; }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field); records.push(record); record = []; field = '';
    } else field += ch;
  }
  if (field.length || record.length) { record.push(field); records.push(record); }
  return records;
}

function blank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

test('TC-AUDIT-01 เหตุการณ์และฟิลด์ใน Audit', async ({ cast }) => {
  test.setTimeout(180_000);
  let reg2!: Actor;
  let auditor!: Actor;
  let page!: Page;

  await test.step('ทำรายการตามลำดับ (ล็อกอินครั้งเดียวต่อบัญชี · นาฬิกา 09:00:00)', async () => {
    reg2 = await cast.as('off.reg2');
    await expectJson(await api.claim(reg2, caseNo(28)), 200, { owner: 'off.reg2' });
    const reg1 = await cast.as('off.reg1');
    await expectJson(await api.returnCase(reg1, caseNo(20), 'xxxxxxxxxx'), 200, { status: 'NEED_FIX', returnCount: 1 });
    await expectJson(await api.forward(reg2, caseNo(13)), 200, { status: 'PENDING_APPROVAL' });
    const head = await cast.as('head1');
    await expectJson(await api.approve(head, caseNo(13)), 200, { status: 'APPROVED' });
    await expectJson(await api.approve(reg2, caseNo(25)), 200, { status: 'APPROVED' });
    const doc = await issue(reg2, caseNo(25));
    expect(doc.docNo).toBe('DOC-2569-000002');
    const rejected = await expectJson(await api.reject(reg2, caseNo(26), 'xxxxxxxxxx'), 200);
    expect(rejected).toMatchObject({ status: 'REJECTED' });
    await expectJson(await api.unmask(reg2, caseNo(25), 'ตรวจสอบตัวตนซ้ำ'), 200, { idNo: '3100600987659' });
    const exec = await cast.as('exec1');
    const exported = await exec.get('/api/dashboard/export?format=xlsx&period=2026-12&service=ALL');
    expect(exported.status(), 'dashboard xlsx export').toBe(200);
    const admin = await cast.as('admin1');
    expect((await admin.put('/api/admin/services/SV-01', { fee: 25, sla: 3 })).status(), 'PUT SV-01').toBe(200);
    auditor = await cast.as('audit1');
    const opened = await auditor.open('/audit');
    expect(opened.status).toBe(200);
    page = opened.page;
  });

  const transitions: Record<string, string> = {
    CLAIM: 'SUBMITTED → IN_REVIEW',
    RETURN: 'IN_REVIEW → NEED_FIX',
    FORWARD: 'IN_REVIEW → PENDING_APPROVAL',
    'APPROVE head1': 'PENDING_APPROVAL → APPROVED',
    'APPROVE off.reg2': 'IN_REVIEW → APPROVED',
    ISSUE: 'APPROVED → COMPLETED',
    REJECT: 'IN_REVIEW → REJECTED',
  };
  const expectedRows: ReadonlyArray<{ event: string; actor: string; role: string; caseNo: string | null; from: string | null; to: string | null; detail: string[] }> = [
    { event: 'CLAIM', actor: 'off.reg2', role: 'officer', caseNo: caseNo(28), from: 'SUBMITTED', to: 'IN_REVIEW', detail: [] },
    { event: 'RETURN', actor: 'off.reg1', role: 'officer', caseNo: caseNo(20), from: 'IN_REVIEW', to: 'NEED_FIX', detail: ['xxxxxxxxxx'] },
    { event: 'FORWARD', actor: 'off.reg2', role: 'officer', caseNo: caseNo(13), from: 'IN_REVIEW', to: 'PENDING_APPROVAL', detail: [] },
    { event: 'APPROVE', actor: 'head1', role: 'head', caseNo: caseNo(13), from: 'PENDING_APPROVAL', to: 'APPROVED', detail: [] },
    { event: 'APPROVE', actor: 'off.reg2', role: 'officer', caseNo: caseNo(25), from: 'IN_REVIEW', to: 'APPROVED', detail: [] },
    { event: 'ISSUE', actor: 'off.reg2', role: 'officer', caseNo: caseNo(25), from: 'APPROVED', to: 'COMPLETED', detail: ['DOC-2569-000002'] },
    { event: 'REJECT', actor: 'off.reg2', role: 'officer', caseNo: caseNo(26), from: 'IN_REVIEW', to: 'REJECTED', detail: ['xxxxxxxxxx'] },
    { event: 'UNMASK', actor: 'off.reg2', role: 'officer', caseNo: caseNo(25), from: null, to: null, detail: ['ตรวจสอบตัวตนซ้ำ'] },
    { event: 'EXPORT', actor: 'exec1', role: 'executive', caseNo: null, from: null, to: null, detail: ['xlsx', '2026-12'] },
    { event: 'ADMIN_CHANGE', actor: 'admin1', role: 'admin', caseNo: null, from: null, to: null, detail: ['SV-01 fee 20 → 25'] },
  ];
  const logins: ReadonlyArray<readonly [string, string]> = [
    ['off.reg2', 'officer'], ['off.reg1', 'officer'], ['head1', 'head'], ['exec1', 'executive'], ['admin1', 'admin'], ['audit1', 'auditor'],
  ];
  const expectedCounts: Record<string, number> = {
    STAFF_LOGIN: 6, CLAIM: 1, RETURN: 1, FORWARD: 1, APPROVE: 2, ISSUE: 1, REJECT: 1, UNMASK: 1, EXPORT: 1, ADMIN_CHANGE: 1,
  };
  const countBy = (events: string[]) => events.reduce<Record<string, number>>((acc, event) => ({ ...acc, [event]: (acc[event] ?? 0) + 1 }), {});
  let apiItems: Json[] = [];
  let screen: UiAuditRow[] = [];

  await test.step('API ไม่กรอง: 16 แถว · จำนวนต่อเหตุการณ์ · ฟิลด์ · เวลา', async () => {
    const { count, items } = await auditItems(auditor);
    expect(count).toBe(16);
    apiItems = items;
    expect(countBy(items.map((item) => item.event as string))).toEqual(expectedCounts);
    for (const item of items) expect(item.time, `API item ${item.id} time`).toBe(T0);
    const loginItems = items.filter((item) => item.event === 'STAFF_LOGIN');
    expect(loginItems.map((item) => `${item.username}:${item.role}`).sort()).toEqual(logins.map(([u, r]) => `${u}:${r}`).sort());
    for (const item of loginItems) {
      expect(String(item.caseNo ?? ''), 'STAFF_LOGIN has no caseNo').not.toMatch(/EG-/);
      expect(blank(item.fromStatus) && blank(item.toStatus), 'STAFF_LOGIN has no transition').toBe(true);
    }
    for (const row of expectedRows) {
      const matches = items.filter((item) => item.event === row.event && item.username === row.actor);
      expect(matches, `API ${row.event} by ${row.actor}`).toHaveLength(1);
      const item = matches[0]!;
      expect(item.role).toBe(row.role);
      if (row.caseNo) expect(item.caseNo).toBe(row.caseNo);
      else expect(String(item.caseNo ?? ''), `${row.event} has no caseNo`).not.toMatch(/EG-/);
      if (row.from) expect({ from: item.fromStatus, to: item.toStatus }).toEqual({ from: row.from, to: row.to });
      else expect(blank(item.fromStatus) && blank(item.toStatus), `${row.event} has no transition`).toBe(true);
      for (const part of row.detail) expect(String(item.detail ?? ''), `${row.event} detail`).toContain(part);
    }
    for (let i = 1; i < items.length; i += 1) {
      expect(idDescending(String(items[i - 1].id), String(items[i].id)), `API id order ${items[i - 1].id} > ${items[i].id}`).toBe(true);
    }
  });

  await test.step('UI /audit ไม่กรอง: audit-count 16 · แถว · ลำดับใหม่ → เก่า', async () => {
    await expect(tid(page, 'audit-count')).toHaveText('16');
    await expect(tid(page, 'audit-row')).toHaveCount(16);
    screen = await uiAuditRows(page);
    expect(screen.map((row) => row.id), 'UI order equals API order').toEqual(apiItems.map((item) => String(item.id)));
    for (let i = 1; i < screen.length; i += 1) {
      expect(idDescending(screen[i - 1]!.id, screen[i]!.id), `UI data-id ${screen[i - 1]!.id} > ${screen[i]!.id}`).toBe(true);
    }
    for (const row of screen) expect(row.iso, `UI row ${row.id} audit-time data-iso`).toBe(T0);
    expect(countBy(screen.map((row) => row.event))).toEqual(expectedCounts);
    for (const row of screen) {
      expect(row.eventText).toBe(row.event);
      expect(row.actorText).toBe(row.actor);
    }
    const loginRows = screen.filter((row) => row.event === 'STAFF_LOGIN');
    expect(loginRows.map((row) => `${row.actor}:${row.role}`).sort()).toEqual(logins.map(([u, r]) => `${u}:${r}`).sort());
    for (const row of loginRows) {
      expect(row.transition).toBe('–');
      expect(row.caseNo).not.toMatch(/EG-/);
    }
    for (const expected of expectedRows) {
      const matches = screen.filter((row) => row.event === expected.event && row.actor === expected.actor);
      expect(matches, `UI ${expected.event} by ${expected.actor}`).toHaveLength(1);
      const row = matches[0]!;
      expect(row.role).toBe(expected.role);
      if (expected.caseNo) {
        expect(row.caseNo).toBe(expected.caseNo);
        expect(row.caseNoText).toBe(expected.caseNo);
      } else {
        expect(row.caseNo).not.toMatch(/EG-/);
        expect(row.caseNoText).not.toMatch(/EG-/);
      }
      const key = expected.event === 'APPROVE' ? `APPROVE ${expected.actor}` : expected.event;
      expect(row.transition).toBe(transitions[key] ?? '–');
      for (const part of expected.detail) expect(row.detail, `${expected.event} audit-detail`).toContain(part);
    }
  });

  await test.step('กรอง: actor off.reg2 → 7 · event APPROVE → 2 · ทั้งสอง → 1 (จอและ API)', async () => {
    await applyFilter(page, { actor: 'off.reg2' });
    await expect(tid(page, 'audit-count')).toHaveText('7');
    await expect(tid(page, 'audit-row')).toHaveCount(7);
    await expect.poll(async () => (await attrs(tid(page, 'audit-row'), 'data-event')).sort())
      .toEqual(['APPROVE', 'CLAIM', 'FORWARD', 'ISSUE', 'REJECT', 'STAFF_LOGIN', 'UNMASK']);
    expect(new Set(await attrs(tid(page, 'audit-row'), 'data-actor'))).toEqual(new Set(['off.reg2']));
    const byActor = await auditItems(auditor, { actor: 'off.reg2' });
    expect(byActor.count).toBe(7);
    expect(byActor.items.map((item) => item.event as string).sort()).toEqual(['APPROVE', 'CLAIM', 'FORWARD', 'ISSUE', 'REJECT', 'STAFF_LOGIN', 'UNMASK']);

    await applyFilter(page, { event: 'APPROVE' });
    await expect(tid(page, 'audit-count')).toHaveText('2');
    await expect(tid(page, 'audit-row')).toHaveCount(2);
    await expect.poll(async () => (await attrs(tid(page, 'audit-row'), 'data-actor')).sort()).toEqual(['head1', 'off.reg2']);
    expect(await attrs(tid(page, 'audit-row'), 'data-event')).toEqual(['APPROVE', 'APPROVE']);
    const byEvent = await auditItems(auditor, { event: 'APPROVE' });
    expect(byEvent.count).toBe(2);
    expect(byEvent.items.map((item) => item.username as string).sort()).toEqual(['head1', 'off.reg2']);

    await applyFilter(page, { actor: 'off.reg2', event: 'APPROVE' });
    await expect(tid(page, 'audit-count')).toHaveText('1');
    await expect(tid(page, 'audit-row')).toHaveCount(1);
    await expect(tid(page, 'audit-row')).toHaveAttribute('data-actor', 'off.reg2');
    await expect(tid(page, 'audit-row')).toHaveAttribute('data-event', 'APPROVE');
    await expect(tid(page, 'audit-row')).toHaveAttribute('data-case-no', caseNo(25));
    const both = await auditItems(auditor, { actor: 'off.reg2', event: 'APPROVE' });
    expect(both.count).toBe(1);
    expect(both.items[0]).toMatchObject({ username: 'off.reg2', event: 'APPROVE', caseNo: caseNo(25) });
  });

  await test.step('CSV: หัวตาราง · 16 แถวข้อมูลตามลำดับจอ · หลังส่งออก audit-count 17', async () => {
    await applyFilter(page, {});
    await expect(tid(page, 'audit-count')).toHaveText('16');
    await expect(tid(page, 'audit-row')).toHaveCount(16);
    const { buffer } = await clickDownload(page, tid(page, 'audit-export-csv-btn'));
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0];
    expect(firstLine).toBe('time,username,role,event,caseNo,fromStatus,toStatus,detail');
    const records = parseCsv(text);
    while (records.length && records[records.length - 1]!.every((field) => field === '')) records.pop();
    const data = records.slice(1);
    expect(data, 'CSV data rows').toHaveLength(16);
    for (const record of data) expect(record, 'CSV record has 8 fields').toHaveLength(8);
    expect(data.map((record) => `${record[1]}:${record[3]}`), 'CSV order equals screen order')
      .toEqual(screen.map((row) => `${row.actor}:${row.event}`));

    await applyFilter(page, {});
    await expect(tid(page, 'audit-count')).toHaveText('17');
    const after = await auditItems(auditor);
    expect(after.count).toBe(17);
    const exports = after.items.filter((item) => item.event === 'EXPORT' && item.username === 'audit1');
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ role: 'auditor' });
    expect(String(exports[0].detail ?? '')).toContain('audit-csv');
    const csvRow = (await uiAuditRows(page)).filter((row) => row.event === 'EXPORT' && row.actor === 'audit1');
    expect(csvRow).toHaveLength(1);
    expect(csvRow[0]!.detail).toContain('audit-csv');
  });
});

test('TC-AUDIT-02 Audit แก้/ลบไม่ได้ (405)', async ({ cast }) => {
  test.setTimeout(120_000);
  const auditor = await cast.as('audit1');
  const before = await auditItems(auditor);
  expect(before.count, 'audit1 STAFF_LOGIN row').toBe(1);
  expect(before.items[0]).toMatchObject({ event: 'STAFF_LOGIN', username: 'audit1' });
  const id = String(before.items[0].id);
  const admin = await cast.as('admin1');

  for (const actor of [admin, auditor]) {
    await test.step(`${actor.name}: PUT/PATCH/DELETE → 405 METHOD_NOT_ALLOWED`, async () => {
      await expectError(await actor.put(`/api/audit/${id}`, { detail: 'x' }), 405, 'METHOD_NOT_ALLOWED');
      await expectError(await actor.patch(`/api/audit/${id}`), 405, 'METHOD_NOT_ALLOWED');
      await expectError(await actor.del(`/api/audit/${id}`), 405, 'METHOD_NOT_ALLOWED');
      await expectError(await actor.put('/api/audit'), 405, 'METHOD_NOT_ALLOWED');
      await expectError(await actor.del('/api/audit'), 405, 'METHOD_NOT_ALLOWED');
      await expectError(await actor.del('/api/audit/999999'), 405, 'METHOD_NOT_ALLOWED');
    });
  }

  await test.step('หลังทำทั้งหมด: before ⊂ after · เพิ่มเฉพาะ STAFF_LOGIN ของ admin1', async () => {
    const after = await auditItems(auditor);
    for (const item of before.items) {
      const same = after.items.filter((candidate) => String(candidate.id) === String(item.id));
      expect(same, `row ${item.id} still present`).toHaveLength(1);
      expect(same[0], `row ${item.id} unchanged`).toEqual(item);
    }
    const beforeIds = new Set(before.items.map((item) => String(item.id)));
    const added = after.items.filter((item) => !beforeIds.has(String(item.id)));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ event: 'STAFF_LOGIN', username: 'admin1' });
    expect(after.count).toBe(before.count + 1);
  });

  await test.step('UI /audit ไม่มี audit-edit-btn / audit-delete-btn · admin1 GET /api/audit → 403', async () => {
    const { page, status } = await auditor.open('/audit');
    expect(status).toBe(200);
    await expect(tid(page, 'audit-count')).toHaveText('2');
    await expect(tid(page, 'audit-row')).toHaveCount(2);
    await expect(tid(page, 'audit-edit-btn')).toHaveCount(0);
    await expect(tid(page, 'audit-delete-btn')).toHaveCount(0);
    await expectError(await admin.get('/api/audit'), 403, 'FORBIDDEN');
  });
});

test('TC-AUDIT-03 กรองช่วงวันที่ตามเวลาไทย', async ({ cast }) => {
  test.setTimeout(150_000);
  const L = {
    L1: { actor: 'off.reg1', iso: '2026-11-30T23:59:59+07:00' },
    L2: { actor: 'off.reg2', iso: '2026-12-01T00:00:00+07:00' },
    L3: { actor: 'off.works1', iso: '2026-12-01T23:59:59+07:00' },
    L4: { actor: 'off.reg1', iso: '2026-12-02T00:00:00+07:00' },
    L5: { actor: 'audit1', iso: '2026-12-02T09:00:00+07:00' },
  } as const;
  type Label = keyof typeof L;
  let auditor!: Actor;

  await test.step('สร้างแถว STAFF_LOGIN L1–L5 ตามนาฬิกา', async () => {
    await cast.clock(L.L1.iso);
    await cast.as('off.reg1');
    await cast.clock(L.L2.iso);
    await cast.as('off.reg2');
    await cast.clock(L.L3.iso);
    await cast.as('off.works1');
    await cast.clock(L.L4.iso);
    await cast.fresh('off.reg1');
    await cast.clock(L.L5.iso);
    auditor = await cast.as('audit1');
    const all = await auditItems(auditor);
    expect(all.count).toBe(5);
    expect(all.items.map((item) => `${item.event}:${item.username}@${item.time}`)).toEqual(
      (['L5', 'L4', 'L3', 'L2', 'L1'] as const).map((label) => `STAFF_LOGIN:${L[label].actor}@${L[label].iso}`));
  });

  const { page, status } = await auditor.open('/audit');
  expect(status).toBe(200);
  await expect(tid(page, 'audit-count')).toHaveText('5');

  const rows: ReadonlyArray<{ from: string; to: string; actor?: string; expected: Label[] }> = [
    { from: '2026-12-01', to: '2026-12-01', expected: ['L3', 'L2'] },
    { from: '2026-11-30', to: '2026-11-30', expected: ['L1'] },
    { from: '2026-11-30', to: '2026-12-01', expected: ['L3', 'L2', 'L1'] },
    { from: '2026-12-02', to: '', expected: ['L5', 'L4'] },
    { from: '', to: '2026-11-30', expected: ['L1'] },
    { from: '2026-12-01', to: '2026-12-02', expected: ['L5', 'L4', 'L3', 'L2'] },
    { from: '2026-12-01', to: '2026-12-01', actor: 'off.reg2', expected: ['L2'] },
  ];
  for (const row of rows) {
    await test.step(`from ${row.from || '(ว่าง)'} to ${row.to || '(ว่าง)'}${row.actor ? ` actor ${row.actor}` : ''} → ${row.expected.join(' ')}`, async () => {
      const expected = row.expected.map((label) => `${L[label].actor}@${L[label].iso}`);
      await applyFilter(page, { from: row.from, to: row.to, actor: row.actor ?? '' });
      await expect(tid(page, 'audit-count')).toHaveText(String(row.expected.length));
      await expect(tid(page, 'audit-row')).toHaveCount(row.expected.length);
      await expect.poll(async () => (await uiAuditRows(page)).map((r) => `${r.actor}@${r.iso}`)).toEqual(expected);

      const query: Record<string, string> = {};
      if (row.actor) query.actor = row.actor;
      if (row.from) query.from = row.from;
      if (row.to) query.to = row.to;
      const result = await auditItems(auditor, query);
      expect(result.count).toBe(row.expected.length);
      expect(result.items.map((item) => `${item.username}@${item.time}`)).toEqual(expected);
    });
  }
});
