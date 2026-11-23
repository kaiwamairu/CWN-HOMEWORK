import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, expectJson, getCase, caseNo, ACTORS, PERSONAL_IDS, PERSONAL_DASHED, SEED_MOBILES } from './source-helpers.js';

/**
 * TC-NFR-04 wrapper. It prepares the source scenario (RESET + มานะ registers with 0845678901),
 * runs the positive decryption control, then invokes the at-rest inspector owned by a later
 * block (`scripts/inspect-at-rest.ts`, interface in handoffs/B02-test-oracles.md). This wrapper
 * is NOT storage proof by itself: the inspector's scan of DB_PATH is the evidence.
 */
const WEB_ROOT = resolve(import.meta.dirname, '../..');
const INSPECTOR = resolve(WEB_ROOT, 'scripts/inspect-at-rest.ts');
// Same resolution as playwright.config.ts webServer.env.DB_PATH.
const DB_PATH = resolve(WEB_ROOT, process.env.DB_PATH ?? 'var/acceptance.sqlite');
const MANA_MOBILE = '0845678901';
/** TEST-PLAN TC-NFR-04: every value must be found 0 times. */
const NEEDLES = [...PERSONAL_IDS, ...SEED_MOBILES, MANA_MOBILE, ...PERSONAL_DASHED];

interface InspectionReport { dbPath: string; scanned: string[]; counts: Record<string, number>; method: string }

test('TC-NFR-04 เข้ารหัสข้อมูลส่วนบุคคลที่เก็บ (inspection)', async ({ cast }) => {
  test.setTimeout(120_000);

  await test.step('ก่อน: มานะลงทะเบียนด้วยเบอร์ 0845678901 (ตาม TC-AUTH-03)', async () => {
    const mana = await cast.as('mana');
    await expectJson(await mana.post('/api/auth/register', { mobile: MANA_MOBILE, email: '', consent: true }), 201);
    const again = await cast.anon();
    await expectJson(await again.post('/api/auth/thaid/start', { idNo: ACTORS.mana.idNo }), 200, { status: 'OTP_SENT' });
    await expectJson(await again.post('/api/auth/thaid/verify', { idNo: ACTORS.mana.idNo, otp: '123456' }), 200, { registered: true });
  });

  await test.step('ตัวควบคุมบวก: สมชายยังได้ idNo เต็มของตัวเอง (ถอดรหัสได้)', async () => {
    const somchai = await cast.as('somchai');
    const body = await getCase(somchai, caseNo(5));
    expect(body.idNo).toBe('1101700123456');
  });

  await test.step('inspection: ค่าบุคคลทั้ง 12 ค่าพบ 0 ครั้งใน DB_PATH (และไฟล์ที่ inspector ตรวจ)', async () => {
    expect(NEEDLES).toHaveLength(12);
    expect(existsSync(INSPECTOR), `inspector ${INSPECTOR} must exist`).toBe(true);
    const run = spawnSync(process.execPath, ['--import', 'tsx', INSPECTOR, '--json', '--', ...NEEDLES], {
      cwd: WEB_ROOT, encoding: 'utf8', env: { ...process.env, DB_PATH }, timeout: 90_000, maxBuffer: 16 * 1024 * 1024,
    });
    await test.info().attach('nfr04-inspector-stdout', { body: run.stdout ?? '', contentType: 'text/plain' });
    await test.info().attach('nfr04-inspector-stderr', { body: run.stderr ?? '', contentType: 'text/plain' });
    expect(run.error, 'inspector spawn error').toBeUndefined();
    expect(run.status, `inspector exit code (stderr: ${(run.stderr ?? '').slice(0, 500)})`).toBe(0);
    const last = (run.stdout ?? '').trim().split(/\r?\n/).filter(Boolean).at(-1) ?? '';
    const report = JSON.parse(last) as InspectionReport;
    expect(resolve(report.dbPath)).toBe(DB_PATH);
    expect(report.scanned.map((path) => resolve(path))).toContain(DB_PATH);
    expect(Object.keys(report.counts).sort()).toEqual([...NEEDLES].sort());
    for (const needle of NEEDLES) expect(report.counts[needle], `occurrences of ${needle}`).toBe(0);
    expect(typeof report.method === 'string' && report.method.trim().length > 0, 'encryption method is recorded').toBe(true);
  });
});
