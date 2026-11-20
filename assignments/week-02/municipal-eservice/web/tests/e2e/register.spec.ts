import { ACTORS } from '../fixtures/actors.js';
import { test, expect, expectReply, logout, startCitizen, submit, verifyCitizen } from './auth-helpers.js';

test('TC-AUTH-03 ลงทะเบียนครั้งแรก', async ({ flows }) => {
  let page = await flows.page();
  await startCitizen(page, ACTORS.mana.idNo);
  await expectReply(await verifyCitizen(page, '123456'), 200, { registered: false });
  await expect(page).toHaveURL(/\/register$/);
  const name = page.getByTestId('reg-name');
  await expect(name).toHaveValue('มานะ ตั้งใจ');
  await expect(name).toHaveJSProperty('readOnly', true);
  await name.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('ชื่อที่พยายามแก้ไข');
  await expect(name).toHaveValue('มานะ ตั้งใจ');

  await page.getByTestId('reg-consent').check();
  for (const mobile of ['081234567', '08123456789', '1812345678', '08123abcde']) {
    await page.getByTestId('reg-mobile').fill(mobile);
    await expect(page.getByTestId('reg-mobile')).toHaveValue(mobile);
    await page.getByTestId('reg-submit').click();
    await expect(page.getByTestId('reg-error-mobile')).toHaveText('เบอร์มือถือต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0');
    await expect(page).toHaveURL(/\/register$/);
  }
  await page.getByTestId('reg-mobile').fill('0845678901');
  await page.getByTestId('reg-consent').uncheck();
  await page.getByTestId('reg-submit').click();
  await expect(page.getByTestId('reg-error-consent')).toHaveText('กรุณายินยอมการประมวลผลข้อมูลส่วนบุคคล (PDPA)');
  await expect(page).toHaveURL(/\/register$/);
  await page.getByTestId('reg-consent').check();
  await page.getByTestId('reg-email').fill('');
  await expectReply(await submit(page, 'reg-submit', '/api/auth/register'), 201);
  await expect(page).toHaveURL(/\/citizen$/);
  await expect(page.getByTestId('citizen-welcome')).toHaveText('สวัสดี มานะ ตั้งใจ');
  await logout(page);
  const registrationVisits: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/register') registrationVisits.push(frame.url());
  });
  await startCitizen(page, ACTORS.mana.idNo);
  await expectReply(await verifyCitizen(page, '123456'), 200, { registered: true });
  await expect(page).toHaveURL(/\/citizen$/);
  expect(registrationVisits).toEqual([]);

  // Source step 8: destroy the old citizen session and reacquire the registration-only cookie.
  await flows.reset();
  page = await flows.page();
  const api = page.context().request;
  await expectReply(await api.post('/api/auth/thaid/start', { data: { idNo: ACTORS.mana.idNo } }), 200, { status: 'OTP_SENT' });
  await expectReply(await api.post('/api/auth/thaid/verify', { data: { idNo: ACTORS.mana.idNo, otp: '123456' } }), 200, { registered: false });
  await expectReply(await api.post('/api/auth/register', { data: { mobile: '081234567', email: '', consent: true } }), 400,
    { code: 'INVALID_MOBILE', message: 'เบอร์มือถือต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0' });
  await expectReply(await api.post('/api/auth/register', { data: { mobile: '0845678901', email: '', consent: false } }), 400,
    { code: 'CONSENT_REQUIRED', message: 'กรุณายินยอมการประมวลผลข้อมูลส่วนบุคคล (PDPA)' });
});
