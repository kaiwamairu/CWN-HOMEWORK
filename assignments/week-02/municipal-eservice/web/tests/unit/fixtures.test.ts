import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { ACTORS, CITIZEN_OTP } from '../fixtures/actors.js';
import { createPdf, fixtureFile, TEST_FILE_NAMES } from '../fixtures/files.js';
import { ActorSessions, assertHealthyServer, type FixtureAPI, type FixtureBrowserContext, type FixtureResponse } from '../fixtures/reset.js';
import { validateAcceptanceRegistry } from '../../scripts/check-acceptance.js';
import { ensureAcceptanceKeys } from '../../scripts/start-acceptance-server.js';
import * as acceptanceLauncher from '../../scripts/start-acceptance-server.js';
import { readConfig } from '../../src/server/config.ts';
import { openDatabase } from '../../src/server/db/connection.ts';
import { decrypt } from '../../src/server/security/crypto.ts';

test('test-only actors preserve all four source citizens and seven staff credentials', () => {
  assert.equal(CITIZEN_OTP, '123456');
  assert.equal(Object.keys(ACTORS).length, 11);
  assert.deepEqual(
    ['somchai', 'somying', 'mana', 'piti'].map((name) => {
      const actor = ACTORS[name as keyof typeof ACTORS];
      assert.equal(actor.kind, 'citizen');
      return actor.kind === 'citizen' ? [actor.idNo, actor.name, actor.mobile, actor.registered] : [];
    }),
    [
      ['1101700123456', 'สมชาย ใจดี', '0812345678', true],
      ['3100600987659', 'สมหญิง รักไทย', '0823456789', true],
      ['5500400111221', 'มานะ ตั้งใจ', null, false],
      ['1909900555015', 'ปิติ มีสุข', '0834567890', true],
    ],
  );
  assert.equal(ACTORS['off.reg2'].password, 'Test@1234');
  assert.equal(ACTORS['off.reg2'].dept, 'registry');
  assert.equal(ACTORS['off.works1'].dept, 'works');
  assert.equal(ACTORS.head1.landing, '/head/approvals');
  assert.equal(ACTORS.exec1.landing, '/dashboard');
  assert.equal(ACTORS.audit1.landing, '/audit');
  assert.equal(ACTORS.admin1.landing, '/admin/services');
});

test('every accepted PDF fixture has its exact source size and a parseable page', async () => {
  const pdfNames = TEST_FILE_NAMES.filter((name) => name.endsWith('.pdf') && !name.startsWith('fake-'));
  assert.equal(pdfNames.length, 14);
  for (const name of pdfNames) {
    const file = fixtureFile(name);
    const expected = name.startsWith('size-') ? Number(name.slice(5, -4)) : 1024;
    assert.equal(file.buffer.length, expected, name);
    assert.equal(file.mimeType, 'application/pdf');
    assert.equal(file.buffer.subarray(0, 5).toString(), '%PDF-');
    assert.ok(file.buffer.subarray(-7).toString().includes('%%EOF'));
    const document = await PDFDocument.load(file.buffer);
    assert.equal(document.getPageCount(), 1, name);
  }
});

test('JPEG and PNG fixtures decode to a real red pixel at exactly 1024 bytes', async () => {
  for (const name of ['real.jpg', 'plan-as-jpg.jpg', 'real.png'] as const) {
    const { buffer } = fixtureFile(name);
    assert.equal(buffer.length, 1024);
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.width, 1, name);
    assert.equal(metadata.height, 1, name);
    assert.equal(metadata.format, name.endsWith('.png') ? 'png' : 'jpeg', name);
    const decoded = await sharp(buffer).removeAlpha().raw().toBuffer();
    assert.ok(decoded[0]! > 240, name);
    assert.ok(decoded[1]! < 20 && decoded[2]! < 20, name);
  }
});

test('rejected fixtures preserve their genuine content despite misleading extensions', () => {
  for (const name of ['fake-text.pdf', 'fake-text.jpg', 'notes.txt'] as const) {
    assert.equal(fixtureFile(name).buffer.toString(), 'hello');
  }
  const executable = fixtureFile('exe-as.png').buffer;
  assert.equal(executable.length, 1024);
  assert.equal(executable.subarray(0, 2).toString(), 'MZ');
  assert.equal(TEST_FILE_NAMES.length, 21);
  assert.throws(() => createPdf(100), /size/i);
  assert.throws(() => createPdf(1024.5), /size/i);
});

class FakeAPI implements FixtureAPI {
  disposed = false;
  calls: Array<{ path: string; data?: unknown }> = [];
  constructor(private readonly label: string, private readonly state: string[]) {}
  async post(path: string, options?: { data?: unknown }): Promise<FixtureResponse> {
    assert.equal(this.disposed, false);
    this.calls.push({ path, data: options?.data });
    this.state.push(`${this.label}:${path}`);
    return {
      status: () => 200,
      json: async () => path === '/api/test/reset'
        ? { ok: true, now: '2026-12-01T09:00:00+07:00' }
        : path.endsWith('/start') ? { status: 'OTP_SENT' }
        : path.endsWith('/verify') ? { registered: true }
        : { role: 'officer', dept: 'registry', landing: '/officer/queue' },
    };
  }
  async get() { return { status: () => 200, json: async () => ({ status: 'ok' }) }; }
  async storageState() { return { cookies: [], origins: [] }; }
  async dispose() { this.disposed = true; this.state.push(`${this.label}:dispose`); }
}

test('reset closes all actor pages, cookies and API sessions before reset, then login is fresh', async () => {
  const state: string[] = [];
  const clients: FakeAPI[] = [];
  const factory = {
    async newContext() {
      const api = new FakeAPI(`api${clients.length}`, state);
      clients.push(api);
      return api;
    },
  };
  const browser = {
    async newContext(): Promise<FixtureBrowserContext> {
      const page = { close: async () => { state.push('page:close'); } };
      return {
        pages: () => [page],
        newPage: async () => page,
        clearCookies: async () => { state.push('cookies:clear'); },
        close: async () => { state.push('browser:close'); },
      };
    },
  };
  const actors = new ActorSessions(factory, 'http://127.0.0.1:3000', browser);
  const citizen = await actors.login('somchai', { withPage: true });
  const officer = await actors.login('off.reg2');
  assert.equal(await actors.login('off.reg2'), officer, 'reuse login inside one TC avoids extra STAFF_LOGIN');
  await actors.reset();
  assert.equal(clients[0]!.disposed, true);
  assert.equal(clients[1]!.disposed, true);
  assert.ok(state.indexOf('page:close') < state.indexOf('api2:/api/test/reset'));
  assert.ok(state.indexOf('cookies:clear') < state.indexOf('api2:/api/test/reset'));
  assert.ok(state.indexOf('browser:close') < state.indexOf('api2:/api/test/reset'));
  assert.ok(state.indexOf('api0:dispose') < state.indexOf('api2:/api/test/reset'));
  assert.ok(state.indexOf('api1:dispose') < state.indexOf('api2:/api/test/reset'));
  assert.equal(clients[2]!.disposed, true, 'reset transport keeps no cookie state');
  const fresh = await actors.login('somchai');
  assert.notEqual(fresh.api, citizen.api);
  assert.deepEqual(clients[3]!.calls, [
    { path: '/api/auth/thaid/start', data: { idNo: '1101700123456' } },
    { path: '/api/auth/thaid/verify', data: { idNo: '1101700123456', otp: '123456' } },
  ]);
  assert.deepEqual(clients[1]!.calls, [{ path: '/api/auth/staff/login', data: { username: 'off.reg2', password: 'Test@1234' } }]);
  await actors.dispose();
  assert.equal(clients[3]!.disposed, true);
});

test('failed reset never permits a fresh login against ambiguous server state', async () => {
  const state: string[] = [];
  const api = new FakeAPI('api', state);
  api.post = async () => ({ status: () => 500, json: async () => ({}) });
  const actors = new ActorSessions({ newContext: async () => api }, 'http://127.0.0.1:3000');
  await assert.rejects(actors.reset(), /reset.*500/i);
  await assert.rejects(actors.login('somchai'), /reset/i);
  assert.equal(api.disposed, true);
});

test('concurrent page logins for one actor share a page and leave no context or cookies after reset', async () => {
  const state: string[] = [];
  const contexts: Array<{ closed: boolean; cookiesCleared: boolean; pageClosed: boolean }> = [];
  const actors = new ActorSessions({ newContext: async () => new FakeAPI('api', state) }, 'http://127.0.0.1:3000', {
    async newContext(): Promise<FixtureBrowserContext> {
      const context = { closed: false, cookiesCleared: false, pageClosed: false };
      contexts.push(context);
      const page = { close: async () => { context.pageClosed = true; } };
      return {
        pages: () => [page],
        newPage: async () => page,
        clearCookies: async () => { context.cookiesCleared = true; },
        close: async () => { context.closed = true; },
      };
    },
  });
  const [first, second] = await Promise.all([
    actors.login('somchai', { withPage: true }),
    actors.login('somchai', { withPage: true }),
  ]);
  await actors.reset();
  assert.ok(contexts.every((context) => context.closed && context.cookiesCleared && context.pageClosed),
    `reset left actor resources alive: ${JSON.stringify(contexts)}`);
  assert.equal(contexts.length, 1, 'concurrent login requests initialize one shared actor page');
  assert.equal(first.page, second.page);
});

test('health readiness accepts only the original exact health contract', async () => {
  await assertHealthyServer({ status: () => 200, json: async () => ({ status: 'ok' }) });
  await assert.rejects(assertHealthyServer({ status: () => 200, json: async () => ({ status: 'ok', testMode: true }) }), /health/i);
  await assert.rejects(assertHealthyServer({ status: () => 503, json: async () => ({ status: 'ok' }) }), /health/i);
});

test('actual Playwright JSON discovery never serializes inherited server encryption keys', () => {
  const sentinels = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex'), randomBytes(32).toString('hex')];
  const require = createRequire(import.meta.url);
  const listed = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--list', '--reporter=json'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', windowsHide: true,
    maxBuffer: 10 * 1024 * 1024, timeout: 30_000,
    env: {
      ...process.env,
      ACCEPTANCE_OWNED_SERVER: '',
      DATA_KEY_HEX: sentinels[0], ID_LOOKUP_KEY_HEX: sentinels[1], DOC_HMAC_KEY_HEX: sentinels[2],
      PLAYWRIGHT_JSON_OUTPUT_NAME: '', PLAYWRIGHT_JSON_OUTPUT_FILE: '',
    },
  });
  assert.equal(listed.error, undefined, 'actual Playwright discovery must execute');
  let report: { config?: unknown };
  try { report = JSON.parse(listed.stdout) as typeof report; }
  catch { assert.fail(`actual Playwright discovery must produce a JSON report (exit=${listed.status}, stdout=${listed.stdout.length} bytes, stderr=${listed.stderr.length} bytes)`); }
  assert.ok(report.config, 'report must include the resolved Playwright configuration');
  for (const sentinel of sentinels) {
    assert.equal(listed.stdout.includes(sentinel), false, 'inherited encryption key appeared in a Playwright JSON report');
  }
});

test('acceptance launcher generates distinct missing keys and preserves inherited keys', () => {
  const env: Record<string, string | undefined> = {};
  ensureAcceptanceKeys(env);
  const names = ['DATA_KEY_HEX', 'ID_LOOKUP_KEY_HEX', 'DOC_HMAC_KEY_HEX'];
  const generated = names.map((name) => env[name]);
  assert.ok(generated.every((value) => /^[a-f0-9]{64}$/.test(value ?? '')), 'launcher must create valid 32-byte hex keys');
  assert.equal(new Set(generated).size, 3, 'launcher keys must be distinct');
  ensureAcceptanceKeys(env);
  assert.deepEqual(names.map((name) => env[name]), generated, 'keys must remain constant in the server process');
  const inheritedKey = randomBytes(32).toString('hex');
  const inherited = { DATA_KEY_HEX: inheritedKey };
  ensureAcceptanceKeys(inherited);
  assert.equal(inherited.DATA_KEY_HEX, inheritedKey, 'inherited key must be preserved');
});

test('acceptance launcher seeds a fresh owned database using its process keys and preserves existing state', () => {
  assert.equal(typeof acceptanceLauncher.prepareAcceptanceDatabase, 'function', 'owned launcher must initialize its fresh database before server startup');
  const directory = mkdtempSync(join(tmpdir(), 'civic-launcher-'));
  const env: Record<string, string | undefined> = { DB_PATH: join(directory, 'acceptance.sqlite'), TEST_MODE: '1', BUG_MODE: '' };
  ensureAcceptanceKeys(env);
  const config = readConfig(env);
  try {
    acceptanceLauncher.prepareAcceptanceDatabase(config);
    const db = openDatabase(config.dbPath);
    let generation: unknown;
    try {
      assert.equal((db.prepare('SELECT count(*) AS count FROM cases').get() as { count: number }).count, 30);
      const runtime = db.prepare('SELECT frozen_now, session_generation FROM runtime_control WHERE id=1').get() as { frozen_now: string; session_generation: number };
      assert.equal(runtime.frozen_now, '2026-12-01T09:00:00+07:00');
      generation = runtime.session_generation;
      const protectedID = db.prepare("SELECT id_cipher, id_iv, id_tag FROM users WHERE id='citizen-somchai'").get() as { id_cipher: Buffer; id_iv: Buffer; id_tag: Buffer };
      assert.equal(decrypt({ ciphertext: protectedID.id_cipher, iv: protectedID.id_iv, tag: protectedID.id_tag }, config.keys.dataKey), '1101700123456');
      db.prepare("UPDATE services SET fee=25 WHERE id='SV-01'").run();
    } finally { db.close(); }
    acceptanceLauncher.prepareAcceptanceDatabase(config);
    const reopened = openDatabase(config.dbPath);
    try {
      assert.equal((reopened.prepare("SELECT fee FROM services WHERE id='SV-01'").get() as { fee: number }).fee, 25, 'launcher must not reset an already initialized database');
      assert.equal((reopened.prepare('SELECT session_generation FROM runtime_control WHERE id=1').get() as { session_generation: number }).session_generation, generation);
    } finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('acceptance preflight rejects missing, unknown, duplicate, skipped and inexact IDs', () => {
  const source = [{ id: 'TC-AUTH-01', source_line: 82 }, { id: 'TC-NFR-04', source_line: 1107 }];
  const registry = [
    { id: 'TC-AUTH-01', kind: 'browser-api', sourceLine: 82 },
    { id: 'TC-NFR-04', kind: 'inspection', sourceLine: 1107 },
  ];
  const complete = [{ title: 'TC-AUTH-01 details' }, { title: 'TC-NFR-04 inspection' }];
  assert.deepEqual(validateAcceptanceRegistry(registry, source, complete, 2), []);
  assert.match(validateAcceptanceRegistry(registry, source, [], 2).join('\n'), /missing.*TC-AUTH-01/i);
  assert.match(validateAcceptanceRegistry(registry, source, [...complete, complete[0]!], 2).join('\n'), /duplicate.*TC-AUTH-01/i);
  assert.match(validateAcceptanceRegistry(registry, source, [{ title: 'TC-AUTH-01x' }, complete[1]!], 2).join('\n'), /inexact|canonical/i);
  assert.match(validateAcceptanceRegistry(registry, source, [{ title: 'TC-WRONG-01' }, complete[1]!], 2).join('\n'), /unknown.*TC-WRONG-01/i);
  assert.match(validateAcceptanceRegistry(registry, source, [{ ...complete[0]!, expectedStatus: 'skipped' }, complete[1]!], 2).join('\n'), /skip/i);
  assert.match(validateAcceptanceRegistry([...registry, registry[0]!], source, complete, 2).join('\n'), /duplicate.*registry/i);
  assert.match(validateAcceptanceRegistry([{ ...registry[0]!, sourceLine: 99 }, registry[1]!], source, complete, 2).join('\n'), /source.*line/i);
});
