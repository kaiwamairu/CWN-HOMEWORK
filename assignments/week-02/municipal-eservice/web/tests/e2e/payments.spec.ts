import {
  test, expect, attach, caseNo, createDraft, createQr, expectError, expectJson, getCase,
  iso, newPaid, newUnpaid, receiptNo, tid,
  type Actor,
} from './source-helpers.js';

async function caseCount(actor: Actor): Promise<number> {
  const body = await expectJson(await actor.get('/api/cases'), 200);
  return (body.items as unknown[]).length;
}

async function caseNos(actor: Actor): Promise<string[]> {
  const body = await expectJson(await actor.get('/api/cases'), 200);
  return (body.items as Array<{ caseNo: string }>).map((item) => item.caseNo);
}

async function paymentStatus(actor: Actor, ref: string): Promise<string> {
  const body = await expectJson(await actor.get(`/api/payments/${ref}`), 200);
  expect(body.ref).toBe(ref);
  return body.status as string;
}

test('TC-PAY-01 อายุ QR 15:00', async ({ cast }) => {
  test.setTimeout(180_000);
  const paid31 = { status: 'PAID', caseNo: caseNo(31), receiptNo: receiptNo(31), duplicate: false };

  await test.step('round 1: 09:00:00 (age 5:00) → 200 PAID EG-2569-000031', async () => {
    const somchai = await cast.as('somchai');
    await expectJson(await cast.pay('PP-0001', 500), 200, paid31);
    expect(await paymentStatus(somchai, 'PP-0001')).toBe('PAID');
  });

  await test.step('round 2: RESET · 09:09:59 (age 14:59) → 200 PAID EG-2569-000031', async () => {
    await cast.reset();
    await cast.clock('2026-12-01T09:09:59+07:00');
    const somchai = await cast.as('somchai');
    await expectJson(await cast.pay('PP-0001', 500), 200, paid31);
    expect(await paymentStatus(somchai, 'PP-0001')).toBe('PAID');
  });

  await test.step('round 3: RESET · 09:10:00 (age 15:00) → 410 QR_EXPIRED, no case number', async () => {
    await cast.reset();
    await cast.clock('2026-12-01T09:10:00+07:00');
    const somchai = await cast.as('somchai');
    await expectError(await cast.pay('PP-0001', 500), 410, 'QR_EXPIRED');
    expect(await paymentStatus(somchai, 'PP-0001')).toBe('EXPIRED');
    expect(await caseCount(somchai)).toBe(10);

    const { page, status } = await somchai.open('/citizen/new/SV-02?draft=DR-0002');
    expect(status).toBe(200);
    await expect(tid(page, 'qr-expired-msg')).toHaveText('QR หมดอายุ กรุณาสร้าง QR ใหม่');
    await expect(tid(page, 'payment-status')).toHaveText('QR หมดอายุ');
    await expect(tid(page, 'payment-status')).toHaveAttribute('data-status', 'EXPIRED');
    await expect(tid(page, 'regenerate-qr-btn')).toHaveCount(1);
    await tid(page, 'regenerate-qr-btn').click();
    await expect(tid(page, 'qr-ref')).toHaveText('PP-0002');
    await expect(tid(page, 'qr-expires')).toHaveAttribute('data-iso', '2026-12-01T09:25:00+07:00');
    await expectJson(await cast.pay('PP-0002', 500), 200, paid31);
    expect(await caseCount(somchai)).toBe(11);
  });

  await test.step('round 4: RESET · 09:10:01 (age 15:01) → 410 QR_EXPIRED', async () => {
    await cast.reset();
    await cast.clock('2026-12-01T09:10:01+07:00');
    const somchai = await cast.as('somchai');
    await expectError(await cast.pay('PP-0001', 500), 410, 'QR_EXPIRED');
    expect(await paymentStatus(somchai, 'PP-0001')).toBe('EXPIRED');
    expect(await caseCount(somchai)).toBe(10);
  });
});

test('TC-PAY-02 ยอดเงินและ callback ซ้ำ', async ({ cast }) => {
  test.setTimeout(120_000);
  const { qr, fee, actor: somchai } = await newUnpaid(cast, { who: 'somchai', service: 'SV-01', qty: 1 });
  expect(qr.ref).toBe('PP-0002');
  expect(fee).toBe(20);

  await test.step('1: amount 19 → 422 AMOUNT_MISMATCH · PENDING · cases 10', async () => {
    await expectError(await cast.pay('PP-0002', 19), 422, 'AMOUNT_MISMATCH');
    expect(await paymentStatus(somchai, 'PP-0002')).toBe('PENDING');
    expect(await caseCount(somchai)).toBe(10);
  });

  await test.step('2: amount 21 → 422 · still PENDING', async () => {
    await expectError(await cast.pay('PP-0002', 21), 422, 'AMOUNT_MISMATCH');
    expect(await paymentStatus(somchai, 'PP-0002')).toBe('PENDING');
    expect(await caseCount(somchai)).toBe(10);
  });

  await test.step('3: amount 20 → 200 PAID EG-2569-000031 / RC-2569-000031 · cases 11', async () => {
    await expectJson(await cast.pay('PP-0002', 20), 200,
      { status: 'PAID', caseNo: caseNo(31), receiptNo: receiptNo(31), duplicate: false });
    expect(await paymentStatus(somchai, 'PP-0002')).toBe('PAID');
    expect(await caseCount(somchai)).toBe(11);
  });

  await test.step('4: duplicate callback → 200 duplicate:true, same numbers · cases 11', async () => {
    await expectJson(await cast.pay('PP-0002', 20), 200,
      { status: 'PAID', caseNo: caseNo(31), receiptNo: receiptNo(31), duplicate: true });
    expect(await caseCount(somchai)).toBe(11);
  });

  await test.step('5: next draft paid → EG-2569-000032 / RC-2569-000032 (no gap)', async () => {
    const next = await newPaid(cast, { who: 'somchai', service: 'SV-01', qty: 1 });
    expect(next.caseNo).toBe(caseNo(32));
    expect(next.receiptNo).toBe(receiptNo(32));
  });
});

test('TC-PAY-03 ชำระพร้อมกัน เลขไม่ซ้ำ', async ({ cast }) => {
  test.setTimeout(180_000);
  const somchai = await cast.as('somchai');
  const somying = await cast.as('somying');
  const seedSomchai = await caseNos(somchai);
  const seedSomying = await caseNos(somying);
  expect(seedSomchai).toHaveLength(10);
  expect(seedSomying).toHaveLength(11);

  const qrs: Array<{ who: 'somchai' | 'somying'; ref: string }> = [];
  await test.step('3 drafts each (SV-01 qty 1 + id-card.pdf) → QR PP-0002..PP-0007', async () => {
    for (const who of ['somchai', 'somchai', 'somchai', 'somying', 'somying', 'somying'] as const) {
      const { qr, fee } = await newUnpaid(cast, { who, service: 'SV-01', qty: 1 });
      expect(fee).toBe(20);
      qrs.push({ who, ref: qr.ref });
    }
    expect(qrs.map((q) => q.ref).sort()).toEqual(['PP-0002', 'PP-0003', 'PP-0004', 'PP-0005', 'PP-0006', 'PP-0007']);
  });

  const results: Array<{ who: 'somchai' | 'somying'; caseNo: string; receiptNo: string }> = [];
  await test.step('pay all 6 concurrently (Promise.all) → 6 × 200, unique numbers 31..36', async () => {
    const responses = await Promise.all(qrs.map((q) => cast.pay(q.ref, 20)));
    for (const [index, response] of responses.entries()) {
      const body = await expectJson(response, 200);
      expect(body).toMatchObject({ status: 'PAID', duplicate: false });
      expect(String(body.receiptNo).slice(-6), 'receipt sequence matches case sequence').toBe(String(body.caseNo).slice(-6));
      results.push({ who: qrs[index]!.who, caseNo: body.caseNo as string, receiptNo: body.receiptNo as string });
    }
    const expectedCases = [31, 32, 33, 34, 35, 36].map((n) => caseNo(n));
    const expectedReceipts = [31, 32, 33, 34, 35, 36].map((n) => receiptNo(n));
    expect(results.map((r) => r.caseNo).sort()).toEqual(expectedCases);
    expect(new Set(results.map((r) => r.caseNo)).size).toBe(6);
    expect(results.map((r) => r.receiptNo).sort()).toEqual(expectedReceipts);
  });

  await test.step('GET /api/cases: 3 new numbers for each citizen', async () => {
    const newSomchai = (await caseNos(somchai)).filter((no) => !seedSomchai.includes(no)).sort();
    const newSomying = (await caseNos(somying)).filter((no) => !seedSomying.includes(no)).sort();
    expect(newSomchai).toEqual(results.filter((r) => r.who === 'somchai').map((r) => r.caseNo).sort());
    expect(newSomying).toEqual(results.filter((r) => r.who === 'somying').map((r) => r.caseNo).sort());
    expect(newSomchai).toHaveLength(3);
    expect(newSomying).toHaveLength(3);
  });

  await test.step('next payment → EG-2569-000037', async () => {
    const next = await newPaid(cast, { who: 'somchai', service: 'SV-01', qty: 1 });
    expect(next.caseNo).toBe(caseNo(37));
    expect(next.receiptNo).toBe(receiptNo(37));
  });
});

test('TC-PAY-04 เลขคำขอข้ามปี', async ({ cast }) => {
  test.setTimeout(180_000);
  const somchai = await cast.as('somchai');
  let draftId = '';
  let ref = '';

  await test.step('1: 2026-12-31 23:58 draft SV-01 + QR → no case number yet', async () => {
    await cast.clock('2026-12-31T23:58:00+07:00');
    ({ draftId } = await createDraft(somchai, { serviceId: 'SV-01', qty: 1 }));
    await attach(somchai, draftId, 'id-card', 'id-card.pdf');
    const qr = await createQr(somchai, draftId);
    expect(qr.amount).toBe(20);
    ref = qr.ref;
    const payment = await expectJson(await somchai.get(`/api/payments/${ref}`), 200);
    expect(payment.status).toBe('PENDING');
    expect(payment.caseNo ?? null).toBeNull();
    expect(await caseCount(somchai)).toBe(10);
  });

  await test.step('2: 23:59 pay ฿20 → EG-2569-000031 · receipt-paid-at data-iso 2026-12-31T23:59:00+07:00', async () => {
    const { page, status } = await somchai.open(`/citizen/new/SV-01?draft=${draftId}`);
    expect(status).toBe(200);
    await cast.clock('2026-12-31T23:59:00+07:00');
    await expectJson(await cast.pay(ref, 20), 200,
      { status: 'PAID', caseNo: caseNo(31), receiptNo: receiptNo(31), duplicate: false });
    await tid(page, 'refresh-payment-btn').click();
    await expect(tid(page, 'payment-status')).toHaveAttribute('data-status', 'PAID');
    await expect(tid(page, 'submitted-case-no')).toHaveText(caseNo(31));
    await expect(tid(page, 'receipt-no')).toHaveText(receiptNo(31));
    await expect(tid(page, 'receipt-paid-at')).toHaveAttribute('data-iso', iso('2026-12-31 23:59'));
  });

  await test.step('3: 2027-01-01 00:00 draft + QR + pay → EG-2570-000001 / RC-2570-000001', async () => {
    const paid = await newPaid(cast, { who: 'somchai', service: 'SV-01', qty: 1, at: '2027-01-01T00:00:00+07:00' });
    expect(paid.caseNo).toBe(caseNo(1, 2570));
    expect(paid.receiptNo).toBe(receiptNo(1, 2570));
  });

  await test.step('4: another payment at 2027-01-01 00:00 → EG-2570-000002', async () => {
    const paid = await newPaid(cast, { who: 'somchai', service: 'SV-01', qty: 1 });
    expect(paid.caseNo).toBe(caseNo(2, 2570));
  });

  await test.step('5: GET /api/cases/EG-2569-000031 keeps its 2569 number', async () => {
    const body = await getCase(somchai, caseNo(31));
    expect(body.caseNo).toBe(caseNo(31));
    expect(await caseNos(somchai)).toEqual(expect.arrayContaining([caseNo(31), caseNo(1, 2570), caseNo(2, 2570)]));
  });
});
