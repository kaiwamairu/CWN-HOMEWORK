import { ACTORS } from '../fixtures/actors.js';
import { test, expect, expectReply, logout, startCitizen, submit, verifyCitizen } from './auth-helpers.js';

test('TC-AUTH-01 เลขบัตร 13 หลัก + checksum', async ({ flows }) => {
  const invalidIds = ['110170012345', '11017001234567', '1101700123457', '11017001234ab'];
  for (const idNo of invalidIds) {
    await test.step(`Reject the complete value ${idNo} in API and UI`, async () => {
      const page = await flows.page();
      await expectReply(await page.context().request.post('/api/auth/thaid/start', { data: { idNo } }), 400,
        { code: 'INVALID_ID', message: 'เลขบัตรประชาชนไม่ถูกต้อง' });
      await page.goto('/login');
      await page.getByTestId('login-tab-citizen').click();
      await page.getByTestId('thaid-id-input').fill(idNo);
      await expect(page.getByTestId('thaid-id-input')).toHaveValue(idNo);
      await page.getByTestId('thaid-submit').click();
      await expect(page.getByTestId('thaid-error')).toHaveText('เลขบัตรประชาชนไม่ถูกต้อง');
      await expect(page.getByTestId('otp-step')).toBeHidden();
    });
  }
  for (const idNo of ['1101700123456', '3100600987659', '1909900555015', '5500400111221']) {
    await test.step(`Accept checksum-valid ${idNo}`, async () => {
      const page = await flows.page();
      await expectReply(await page.context().request.post('/api/auth/thaid/start', { data: { idNo } }), 200, { status: 'OTP_SENT' });
      await startCitizen(page, idNo);
      await expect(page.getByTestId('thaid-error')).toHaveCount(0);
    });
  }
});

test('TC-AUTH-02 OTP ผิด 3 ครั้งล็อก 15 นาที', async ({ flows }) => {
  const idNo = ACTORS.piti.idNo;
  const lockedUntil = '2026-12-01T09:15:00+07:00';
  const locked = { code: 'LOCKED', message: 'ผิดเกินกำหนด เลขบัตรนี้ถูกล็อก 15 นาที', lockedUntil };
  let page = await flows.page();
  await startCitizen(page, idNo);
  for (const attemptsLeft of [2, 1]) {
    await expectReply(await verifyCitizen(page, '000000'), 401,
      { code: 'OTP_INVALID', message: 'รหัส OTP ไม่ถูกต้อง', attemptsLeft });
    await expect(page.getByTestId('otp-error')).toHaveText('รหัส OTP ไม่ถูกต้อง');
    await expect(page.getByTestId('otp-attempts-left')).toHaveText(`เหลือ ${attemptsLeft} ครั้ง`);
  }
  await expectReply(await verifyCitizen(page, '000000'), 423, locked);
  await expect(page.getByTestId('lock-message')).toHaveText(locked.message);
  await expect(page.getByTestId('lock-until')).toHaveAttribute('data-iso', lockedUntil);
  await expectReply(await page.context().request.post('/api/auth/thaid/verify', { data: { idNo, otp: '123456' } }), 423, locked);

  const somchai = await flows.page();
  await startCitizen(somchai, ACTORS.somchai.idNo);
  await expectReply(await verifyCitizen(somchai, '123456'), 200, { registered: true });
  await expect(somchai).toHaveURL(/\/citizen$/);

  await expectReply(await page.context().request.put('/api/test/clock', { data: { now: '2026-12-01T09:14:59+07:00' } }), 200,
    { now: '2026-12-01T09:14:59+07:00' });
  await expectReply(await page.context().request.post('/api/auth/thaid/verify', { data: { idNo, otp: '123456' } }), 423, locked);
  await expectReply(await page.context().request.put('/api/test/clock', { data: { now: lockedUntil } }), 200, { now: lockedUntil });
  await startCitizen(page, idNo);
  await expectReply(await verifyCitizen(page, '000000'), 401,
    { code: 'OTP_INVALID', message: 'รหัส OTP ไม่ถูกต้อง', attemptsLeft: 2 });
  await expect(page.getByTestId('otp-attempts-left')).toHaveText('เหลือ 2 ครั้ง');
  await expectReply(await verifyCitizen(page, '123456'), 200, { registered: true });
  await expect(page).toHaveURL(/\/citizen$/);

  // Source step 9 RESET invalidates both citizens' pages, cookies and request transports.
  await flows.reset();
  page = await flows.page();
  await startCitizen(page, idNo);
  for (const attemptsLeft of [2, 1]) {
    await expectReply(await verifyCitizen(page, '000000'), 401,
      { code: 'OTP_INVALID', message: 'รหัส OTP ไม่ถูกต้อง', attemptsLeft });
  }
  await expectReply(await verifyCitizen(page, '123456'), 200, { registered: true });
  await expect(page).toHaveURL(/\/citizen$/);
  await logout(page);
  await startCitizen(page, idNo);
  for (const attemptsLeft of [2, 1]) {
    await expectReply(await verifyCitizen(page, '000000'), 401,
      { code: 'OTP_INVALID', message: 'รหัส OTP ไม่ถูกต้อง', attemptsLeft });
    await expect(page.getByTestId('otp-attempts-left')).toHaveText(`เหลือ ${attemptsLeft} ครั้ง`);
    await expect(page.getByTestId('lock-message')).toHaveCount(0);
  }
});

test('TC-AUTH-04 เจ้าหน้าที่ SSO จำลองและหน้าตั้งต้น', async ({ flows }) => {
  const roleLabels = {
    officer: 'เจ้าหน้าที่', head: 'หัวหน้าฝ่าย', executive: 'ผู้บริหาร', auditor: 'ผู้ตรวจสอบภายใน', admin: 'ผู้ดูแลระบบ',
  } as const;
  const usernames = ['off.reg1', 'off.reg2', 'off.works1', 'head1', 'exec1', 'audit1', 'admin1'] as const;
  for (const username of usernames) {
    await test.step(`${username} landing, identity and logout`, async () => {
      const actor = ACTORS[username];
      const page = await flows.page();
      await page.goto('/login');
      await page.getByTestId('login-tab-staff').click();
      await expect(page.getByTestId('staff-submit')).toHaveText('เข้าสู่ระบบเจ้าหน้าที่ (SSO ภาครัฐ จำลอง)');
      await page.getByTestId('staff-username').fill(username);
      await page.getByTestId('staff-password').fill('Test@1234');
      await expectReply(await submit(page, 'staff-submit', '/api/auth/staff/login'), 200,
        { role: actor.role, dept: actor.dept, landing: actor.landing });
      await expect(page).toHaveURL(new RegExp(`${actor.landing}$`));
      await expect(page.getByTestId('app-header')).toHaveCount(0);
      await expect(page.getByTestId('user-role')).toBeVisible();
      await expect(page.getByTestId('user-role')).toHaveText(roleLabels[actor.role]);
      await expect(page.getByTestId('user-role')).toHaveAttribute('data-role', actor.role);
      if (actor.role === 'officer') await expect(page.getByTestId('user-role')).toHaveAttribute('data-dept', actor.dept);
      await page.getByRole('button', { name: /^เปิดเมนูบัญชี(?:\s|$)/ }).click();
      await expect(page.getByTestId('user-name')).toHaveText(actor.name);
      await expectReply(await submit(page, 'logout-btn', '/api/auth/logout'), 204);
      await expect(page).toHaveURL(/\/login$/);
      await page.goto('/officer/queue');
      await expect(page).toHaveURL(/\/login$/);
    });
  }
  for (const [username, password] of [['off.reg1', 'wrong'], ['nobody', 'Test@1234'], ['1101700123456', 'Test@1234']]) {
    const page = await flows.page();
    await page.goto('/login');
    await page.getByTestId('login-tab-staff').click();
    await page.getByTestId('staff-username').fill(username!);
    await page.getByTestId('staff-password').fill(password!);
    await expectReply(await submit(page, 'staff-submit', '/api/auth/staff/login'), 401,
      { code: 'INVALID_CREDENTIALS', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    await expect(page.getByTestId('staff-error')).toHaveText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    await expect(page).toHaveURL(/\/login$/);
  }
});
