import {
  test, expect, ACTORS, MSG, MASKED_ID, api, attrs, auditItems, caseNo, caseRow, choose, expectError, expectJson,
  expectLevelBadge, expectStatusBadge, getCase, openCase, queueCaseNos, rowBy, texts, tid, uiReturn,
  type Actor, type ActorName,
} from './source-helpers.js';
import type { Page } from '@playwright/test';

// TEST-DATA §9.1: registry queue (filter all), BR-16 order (due asc, then case number asc).
const REGISTRY_ALL = [20, 22, 24, 23, 25, 26, 13, 15, 27, 28, 29, 30, 16, 18, 19, 12, 21];
const UNCLAIMED = [24, 28, 29, 30];
const REG1_MINE = [20, 22, 23];
const REG2_MINE = [25, 26, 13, 15, 27, 16, 18, 12, 21];
// TEST-PLAN TC-QUEUE-01: head1 sees registry 17 + works 1; 3 Dec group = 000010 → 000023 → 000025 → 000026.
const HEAD_ALL = [20, 22, 24, 10, 23, 25, 26, 13, 15, 27, 28, 29, 30, 16, 18, 19, 12, 21];
// Not in any queue: NEED_FIX 000017 · PENDING_APPROVAL 000011 000014 · closed/cancelled 000001–000009.
const NOT_IN_QUEUE = [17, 11, 14, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const REASON = 'xxxxxxxxxx';

async function openQueue(actor: Actor): Promise<Page> {
  const { page, status } = await actor.open('/officer/queue');
  expect(status, `${actor.name} opens /officer/queue`).toBe(200);
  await expect(tid(page, 'queue-table')).toBeVisible();
  return page;
}

async function expectQueueOrder(page: Page, expected: number[], label: string): Promise<void> {
  const rows = tid(page, 'queue-row');
  await expect(rows, `${label}: row count`).toHaveCount(expected.length);
  await expect.poll(() => attrs(rows, 'data-case-no'), { message: `${label}: row order` }).toEqual(expected.map((n) => caseNo(n)));
}

async function expectWorkload(page: Page, count: number): Promise<void> {
  await expect(tid(page, 'workload-count')).toHaveText(String(count));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ownerOf(actor: Actor, n: number): Promise<string | null> {
  const body = await getCase(actor, caseNo(n));
  return (body.owner ?? null) as string | null;
}

test('TC-QUEUE-01 ลำดับคิวและขอบเขตแผนก', async ({ cast }) => {
  test.setTimeout(180_000);
  const reg1 = await cast.as('off.reg1');
  const page = await openQueue(reg1);

  await test.step('off.reg1 · filter all: 17 rows in BR-16 order', async () => {
    await expect(tid(page, 'queue-filter')).toHaveValue('all');
    await expectQueueOrder(page, REGISTRY_ALL, 'off.reg1 all');
    expect(await queueCaseNos(reg1, 'all')).toEqual(REGISTRY_ALL.map((n) => caseNo(n)));
  });

  await test.step('first three row-sla-level = เกินกำหนด · ใกล้ครบกำหนด · ใกล้ครบกำหนด; every row-id-masked masked', async () => {
    const levels = tid(page, 'row-sla-level');
    await expect(levels).toHaveCount(17);
    expect((await texts(levels)).slice(0, 3)).toEqual(['เกินกำหนด', 'ใกล้ครบกำหนด', 'ใกล้ครบกำหนด']);
    await expectLevelBadge(tid(caseRow(page, 'queue-row', caseNo(20)), 'row-sla-level'), 'overdue');
    await expectLevelBadge(tid(caseRow(page, 'queue-row', caseNo(22)), 'row-sla-level'), 'near');
    await expectLevelBadge(tid(caseRow(page, 'queue-row', caseNo(24)), 'row-sla-level'), 'near');
    const masked = tid(page, 'row-id-masked');
    await expect(masked).toHaveCount(17);
    for (const value of await texts(masked)) expect(value).toMatch(MASKED_ID);
  });

  await test.step('claim-btn: exactly 4 (000024 000028 000029 000030) · none on APPROVED 000019 or owned rows', async () => {
    await expect(tid(page, 'claim-btn')).toHaveCount(4);
    for (const n of UNCLAIMED) await expect(tid(caseRow(page, 'queue-row', caseNo(n)), 'claim-btn')).toHaveCount(1);
    const approved = caseRow(page, 'queue-row', caseNo(19));
    await expect(approved).toHaveCount(1);
    await expect(approved).toHaveAttribute('data-owner', '');
    await expect(tid(approved, 'claim-btn')).toHaveCount(0);
    for (const n of [...REG1_MINE, ...REG2_MINE]) await expect(tid(caseRow(page, 'queue-row', caseNo(n)), 'claim-btn')).toHaveCount(0);
  });

  await test.step('not in queue: 000017 (NEED_FIX) · 000011 000014 (PENDING_APPROVAL) · closed/cancelled', async () => {
    for (const n of NOT_IN_QUEUE) await expect(caseRow(page, 'queue-row', caseNo(n))).toHaveCount(0);
  });

  await test.step('off.reg1 · unclaimed → 4 rows · mine → 3 rows · workload-count 3', async () => {
    await choose(page, 'queue-filter', 'unclaimed');
    await expectQueueOrder(page, UNCLAIMED, 'off.reg1 unclaimed');
    expect(await queueCaseNos(reg1, 'unclaimed')).toEqual(UNCLAIMED.map((n) => caseNo(n)));
    await choose(page, 'queue-filter', 'mine');
    await expectQueueOrder(page, REG1_MINE, 'off.reg1 mine');
    expect(await queueCaseNos(reg1, 'mine')).toEqual(REG1_MINE.map((n) => caseNo(n)));
    await expectWorkload(page, 3);
  });

  await test.step('off.reg2 · mine → 9 rows in order · workload-count 9', async () => {
    const reg2 = await cast.as('off.reg2');
    const page2 = await openQueue(reg2);
    await expectQueueOrder(page2, REGISTRY_ALL, 'off.reg2 all');
    await choose(page2, 'queue-filter', 'mine');
    await expectQueueOrder(page2, REG2_MINE, 'off.reg2 mine');
    expect(await queueCaseNos(reg2, 'mine')).toEqual(REG2_MINE.map((n) => caseNo(n)));
    await expectWorkload(page2, 9);
  });

  await test.step('off.works1 sees only 000010 (no registry case)', async () => {
    const works = await cast.as('off.works1');
    const pageW = await openQueue(works);
    await expectQueueOrder(pageW, [10], 'off.works1 all');
    expect(await queueCaseNos(works, 'all')).toEqual([caseNo(10)]);
  });

  await test.step('head1 /officer/queue: 18 rows (registry 17 + works 1), 3 Dec group 000010 → 000023 → 000025 → 000026, no claim-btn', async () => {
    const head = await cast.as('head1');
    const pageH = await openQueue(head);
    await expectQueueOrder(pageH, HEAD_ALL, 'head1 all');
    expect(await queueCaseNos(head, 'all')).toEqual(HEAD_ALL.map((n) => caseNo(n)));
    const order = await attrs(tid(pageH, 'queue-row'), 'data-case-no');
    const group = order.filter((no) => [10, 23, 25, 26].map((n) => caseNo(n)).includes(no));
    expect(group).toEqual([caseNo(10), caseNo(23), caseNo(25), caseNo(26)]);
    await expect(tid(pageH, 'claim-btn')).toHaveCount(0);
    for (const n of NOT_IN_QUEUE) await expect(caseRow(pageH, 'queue-row', caseNo(n))).toHaveCount(0);
  });
});

test('TC-QUEUE-02 รับเรื่องซ้อน (พร้อมกันและต่อกัน)', async ({ cast }) => {
  test.setTimeout(240_000);

  await test.step('ส่วน 1 (UI): off.reg1 and off.reg2 click claim-btn of 000028 concurrently → exactly one winner', async () => {
    const no = caseNo(28);
    const reg1 = await cast.as('off.reg1');
    const reg2 = await cast.as('off.reg2');
    const pageA = await openQueue(reg1);
    const pageB = await openQueue(reg2);
    for (const page of [pageA, pageB]) {
      const row = caseRow(page, 'queue-row', no);
      await expect(row).toHaveAttribute('data-status', 'SUBMITTED');
      await expect(row).toHaveAttribute('data-owner', '');
      await expect(tid(row, 'claim-btn')).toBeVisible();
    }

    await Promise.all([
      tid(caseRow(pageA, 'queue-row', no), 'claim-btn').click(),
      tid(caseRow(pageB, 'queue-row', no), 'claim-btn').click(),
    ]);

    await expect.poll(() => ownerOf(reg1, 28), { message: 'one officer becomes the owner' }).toMatch(/^off\.reg[12]$/);
    const winnerName = (await ownerOf(reg1, 28)) as ActorName;
    const [winner, winnerPage, loser, loserPage] = winnerName === 'off.reg1'
      ? [reg1, pageA, reg2, pageB] as const
      : [reg2, pageB, reg1, pageA] as const;

    // Loser: action-error = มีเจ้าหน้าที่รับเรื่องนี้แล้ว (HTTP 409 ALREADY_CLAIMED).
    await expect(tid(loserPage, 'action-error')).toHaveText(MSG.ALREADY_CLAIMED);
    await expectError(await api.claim(loser, no), 409, 'ALREADY_CLAIMED');

    // Winner: no error, row-owner = winner.
    await expect(tid(winnerPage, 'action-error').filter({ hasText: MSG.ALREADY_CLAIMED })).toHaveCount(0);
    const winnerRow = caseRow(winnerPage, 'queue-row', no);
    await expect(winnerRow).toHaveAttribute('data-owner', winnerName);
    const display = ACTORS[winnerName].name;
    await expect(tid(winnerRow, 'row-owner')).toHaveText(new RegExp(`^(?:${escapeRegExp(winnerName)}|${escapeRegExp(display)})$`));

    const body = await getCase(winner, no);
    expect(body.owner).toBe(winnerName);
    expect(body.status).toBe('IN_REVIEW');

    // Audit: exactly one CLAIM row for EG-2569-000028 (API + UI via audit1).
    const auditor = await cast.as('audit1');
    const { items } = await auditItems(auditor, { event: 'CLAIM' });
    const claims = items.filter((item) => item.caseNo === no);
    expect(claims, 'one CLAIM audit row for 000028').toHaveLength(1);
    expect(claims[0]).toMatchObject({ event: 'CLAIM', username: winnerName, caseNo: no });

    const { page: auditPage, status } = await auditor.open('/audit');
    expect(status).toBe(200);
    await choose(auditPage, 'audit-filter-event', 'CLAIM');
    await tid(auditPage, 'audit-apply-btn').click();
    const auditRows = rowBy(auditPage, 'audit-row', 'data-event', 'CLAIM');
    await expect(auditRows).toHaveCount(1);
    await expect(auditRows).toHaveAttribute('data-case-no', no);
    await expect(auditRows).toHaveAttribute('data-actor', winnerName);
    await expect(rowBy(auditPage, 'audit-row', 'data-case-no', no)).toHaveCount(1);
  });

  await test.step('ส่วน 2 (API · RESET): 10 concurrent claims on 000029 (5 × off.reg1, 5 × off.reg2) → one 200, nine 409 ALREADY_CLAIMED', async () => {
    await cast.reset();
    const no = caseNo(29);
    const reg1 = await cast.as('off.reg1');
    const reg2 = await cast.as('off.reg2');
    const shooters: Actor[] = [reg1, reg1, reg1, reg1, reg1, reg2, reg2, reg2, reg2, reg2];
    const responses = await Promise.all(shooters.map((actor) => api.claim(actor, no)));
    const results = await Promise.all(responses.map(async (response, i) => ({
      actor: shooters[i]!, status: response.status(), body: await response.json() as Record<string, unknown>,
    })));

    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses, 'exactly one 200 and nine 409').toEqual([200, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    const winner = results.find((r) => r.status === 200)!;
    expect(winner.body).toEqual({ owner: winner.actor.name });
    for (const loser of results.filter((r) => r.status !== 200)) {
      expect(loser.body).toMatchObject({ code: 'ALREADY_CLAIMED', message: MSG.ALREADY_CLAIMED });
    }

    expect(await ownerOf(reg1, 29)).toBe(winner.actor.name);
    const auditor = await cast.as('audit1');
    const { items } = await auditItems(auditor, { event: 'CLAIM' });
    const claims = items.filter((item) => item.caseNo === no);
    expect(claims, 'one CLAIM audit row for 000029').toHaveLength(1);
    expect(claims[0]).toMatchObject({ username: winner.actor.name });
  });

  await test.step('ส่วน 3 (ต่อกัน · RESET): off.reg1 claim → 200 · off.reg2 claim → 409 ALREADY_CLAIMED · owner stays off.reg1', async () => {
    await cast.reset();
    const no = caseNo(29);
    const reg1 = await cast.as('off.reg1');
    const reg2 = await cast.as('off.reg2');

    await expectJson(await api.claim(reg1, no), 200, { owner: 'off.reg1' });
    await expectError(await api.claim(reg2, no), 409, 'ALREADY_CLAIMED');
    expect(await ownerOf(reg2, 29)).toBe('off.reg1');

    const page2 = await openQueue(reg2);
    await expectWorkload(page2, 9);

    // off.reg1 claims again → 409.
    const again = await api.claim(reg1, no);
    expect(again.status(), `repeat claim body ${await again.text()}`).toBe(409);
    expect(await ownerOf(reg1, 29)).toBe('off.reg1');

    const auditor = await cast.as('audit1');
    const { items } = await auditItems(auditor, { event: 'CLAIM' });
    const claims = items.filter((item) => item.caseNo === no);
    expect(claims, 'one CLAIM audit row for 000029').toHaveLength(1);
    expect(claims[0]).toMatchObject({ username: 'off.reg1' });
  });
});

test('TC-QUEUE-03 งานในมือสูงสุด 10', async ({ cast }) => {
  test.setTimeout(240_000);
  let reg2 = await cast.as('off.reg2');
  let page = await openQueue(reg2);

  const clickClaim = async (n: number) => {
    await tid(caseRow(page, 'queue-row', caseNo(n)), 'claim-btn').click();
  };

  await test.step('1: workload-count = 9', async () => {
    await expectWorkload(page, 9);
  });

  await test.step('2: claim 000028 (10th) → success · workload-count 10', async () => {
    await clickClaim(28);
    await expect(caseRow(page, 'queue-row', caseNo(28))).toHaveAttribute('data-owner', 'off.reg2');
    await expectWorkload(page, 10);
    const body = await getCase(reg2, caseNo(28));
    expect(body).toMatchObject({ owner: 'off.reg2', status: 'IN_REVIEW' });
  });

  await test.step('3: claim 000029 (11th) → action-error รับงานได้สูงสุด 10 เรื่อง · API 409 WORKLOAD_LIMIT · 000029 still SUBMITTED unowned', async () => {
    await clickClaim(29);
    await expect(tid(page, 'action-error')).toHaveText(MSG.WORKLOAD_LIMIT);
    await expectError(await api.claim(reg2, caseNo(29)), 409, 'WORKLOAD_LIMIT');
    const body = await getCase(reg2, caseNo(29));
    expect(body.status).toBe('SUBMITTED');
    expect(body.owner ?? null).toBeNull();
    page = await openQueue(reg2);
    await expectWorkload(page, 10);
  });

  await test.step('4: approve own SV-01 000025 via approve-btn → APPROVED · workload-count 9', async () => {
    const casePage = await openCase(reg2, caseNo(25), 'officer');
    await tid(casePage, 'approve-btn').click();
    await expectStatusBadge(tid(casePage, 'case-status'), 'APPROVED');
    expect((await getCase(reg2, caseNo(25))).status).toBe('APPROVED');
    page = await openQueue(reg2);
    await expectWorkload(page, 9);
  });

  await test.step('5: claim 000029 again → success · workload-count 10', async () => {
    await clickClaim(29);
    await expect(caseRow(page, 'queue-row', caseNo(29))).toHaveAttribute('data-owner', 'off.reg2');
    await expectWorkload(page, 10);
    expect(await ownerOf(reg2, 29)).toBe('off.reg2');
  });

  await test.step('6: off.reg1 (workload 3) claims 000030 → success', async () => {
    const reg1 = await cast.as('off.reg1');
    await expectJson(await api.claim(reg1, caseNo(30)), 200, { owner: 'off.reg1' });
  });

  await test.step('7: RESET · off.reg2 returns 000025 → รอแก้ไขเอกสาร · workload-count 8', async () => {
    await cast.reset();
    reg2 = await cast.as('off.reg2');
    const casePage = await openCase(reg2, caseNo(25), 'officer');
    await uiReturn(casePage, REASON);
    await expectStatusBadge(tid(casePage, 'case-status'), 'NEED_FIX');
    page = await openQueue(reg2);
    await expectWorkload(page, 8);
  });

  await test.step('8: claim 000028 and 000029 → both succeed · workload-count 10', async () => {
    await clickClaim(28);
    await expect(caseRow(page, 'queue-row', caseNo(28))).toHaveAttribute('data-owner', 'off.reg2');
    await expectWorkload(page, 9);
    await clickClaim(29);
    await expect(caseRow(page, 'queue-row', caseNo(29))).toHaveAttribute('data-owner', 'off.reg2');
    await expectWorkload(page, 10);
    expect(await ownerOf(reg2, 28)).toBe('off.reg2');
    expect(await ownerOf(reg2, 29)).toBe('off.reg2');
  });

  await test.step('9: สมหญิง submit-fix-btn on 000025 → no error · กำลังตรวจสอบ · owner off.reg2 · workload-count 11', async () => {
    const somying = await cast.as('somying');
    const citizenPage = await openCase(somying, caseNo(25), 'citizen');
    await tid(citizenPage, 'submit-fix-btn').click();
    await expectStatusBadge(tid(citizenPage, 'case-status'), 'IN_REVIEW');
    await expect(tid(citizenPage, 'action-error').filter({ hasText: /\S/ })).toHaveCount(0);
    const body = await getCase(reg2, caseNo(25));
    expect(body).toMatchObject({ status: 'IN_REVIEW', owner: 'off.reg2' });
    page = await openQueue(reg2);
    await expectWorkload(page, 11);
  });

  await test.step('10: off.reg2 claims 000030 → 409 WORKLOAD_LIMIT · workload-count stays 11', async () => {
    await clickClaim(30);
    await expect(tid(page, 'action-error')).toHaveText(MSG.WORKLOAD_LIMIT);
    await expectError(await api.claim(reg2, caseNo(30)), 409, 'WORKLOAD_LIMIT');
    const body = await getCase(reg2, caseNo(30));
    expect(body.status).toBe('SUBMITTED');
    expect(body.owner ?? null).toBeNull();
    page = await openQueue(reg2);
    await expectWorkload(page, 11);
  });
});
