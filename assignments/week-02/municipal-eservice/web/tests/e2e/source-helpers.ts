/**
 * Source-oracle helpers for the canonical acceptance specs (B02).
 *
 * Every expected value used by the specs comes from TEST-PLAN.md, CONTRACT.md or TEST-DATA.md.
 * Nothing here is derived from the application implementation. The `cast` fixture owns all
 * browser contexts; each context's `request` shares the context cookies, so an actor logged in
 * through the API can open pages with the same session. RESET (fixture or `cast.reset()`)
 * destroys every server session, so actors must be re-acquired afterwards (CONTRACT 0.9).
 */
import { inflateSync, constants as zlibConstants } from 'node:zlib';
import type { APIRequestContext, APIResponse, Browser, BrowserContext, Download, Locator, Page } from '@playwright/test';
import { test as sourceTest, expect, RESET_NOW } from '../fixtures/reset.js';
import { ACTORS, CITIZEN_OTP, type ActorName } from '../fixtures/actors.js';
import { fixtureFile, type TestFile, type TestFileName } from '../fixtures/files.js';

export { expect, RESET_NOW, ACTORS };
export type { ActorName, TestFileName };

// ---------------------------------------------------------------------------------------------
// Source constants (CONTRACT §4, §5 · TEST-DATA §1, §2, §4)
// ---------------------------------------------------------------------------------------------

/** CONTRACT §5: exact error messages keyed by API `code`. */
export const MSG = {
  INVALID_ID: 'เลขบัตรประชาชนไม่ถูกต้อง',
  OTP_INVALID: 'รหัส OTP ไม่ถูกต้อง',
  LOCKED: 'ผิดเกินกำหนด เลขบัตรนี้ถูกล็อก 15 นาที',
  INVALID_CREDENTIALS: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  INVALID_MOBILE: 'เบอร์มือถือต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0',
  CONSENT_REQUIRED: 'กรุณายินยอมการประมวลผลข้อมูลส่วนบุคคล (PDPA)',
  INVALID_QTY: 'จำนวนฉบับต้อง 1–5 ฉบับ',
  INVALID_AREA: 'กรุณาระบุพื้นที่ 1–500 ตร.ม.',
  AREA_TOO_LARGE: 'พื้นที่เกิน 500 ตร.ม. กรุณายื่นที่สำนักงาน',
  FILE_TOO_LARGE: 'ไฟล์ใหญ่เกิน 5 MB',
  FILE_TYPE: 'รองรับเฉพาะไฟล์ PDF, JPG, PNG',
  FILE_COUNT: 'แนบได้สูงสุด 5 ไฟล์ต่อคำขอ',
  PLAN_NOT_PDF: 'แบบแปลนต้องเป็นไฟล์ PDF เท่านั้น',
  QR_EXPIRED: 'QR หมดอายุ กรุณาสร้าง QR ใหม่',
  AMOUNT_MISMATCH: 'ยอดเงินไม่ตรงกับค่าธรรมเนียม',
  NOT_FOUND: 'ไม่พบคำขอ',
  CANNOT_CANCEL: 'ยกเลิกไม่ได้ คำขอมีเจ้าหน้าที่รับเรื่องแล้ว',
  FIX_WINDOW_EXPIRED: 'หมดเวลาแก้ไขแล้ว คำขอถูกยกเลิก',
  ALREADY_CLAIMED: 'มีเจ้าหน้าที่รับเรื่องนี้แล้ว',
  WORKLOAD_LIMIT: 'รับงานได้สูงสุด 10 เรื่อง',
  RETURN_LIMIT: 'ตีกลับได้สูงสุด 2 ครั้ง',
  REASON_TOO_SHORT: 'กรุณากรอกเหตุผลอย่างน้อย 10 ตัวอักษร',
  REASON_REQUIRED: 'กรุณากรอกเหตุผล',
  INVALID_STATE: 'สถานะคำขอไม่ถูกต้องสำหรับรายการนี้',
  FORBIDDEN: 'ไม่มีสิทธิ์ทำรายการนี้',
  UNAUTHENTICATED: 'กรุณาเข้าสู่ระบบ',
  INVALID_FEE: 'ค่าธรรมเนียมต้องเป็นจำนวนเต็ม 0–100,000 บาท',
  INVALID_SLA: 'SLA ต้องเป็นจำนวนเต็ม 1–60 วันทำการ',
  DUPLICATE_HOLIDAY: 'มีวันหยุดนี้อยู่แล้ว',
  SELF_ROLE_CHANGE: 'ไม่สามารถเปลี่ยนบทบาทของตัวเองได้',
  METHOD_NOT_ALLOWED: 'Method Not Allowed',
} as const;
export type ErrorCode = keyof typeof MSG;

/** CONTRACT §2.1 page messages. */
export const PAGE_MSG = { forbidden: 'ไม่มีสิทธิ์เข้าถึงหน้านี้', notFound: 'ไม่พบคำขอ', noRefund: 'ค่าธรรมเนียมที่ชำระแล้วไม่คืน' } as const;

/** CONTRACT §4.1 */
export const STATUS_TH = {
  DRAFT: 'ร่าง', PENDING_PAYMENT: 'รอชำระเงิน', SUBMITTED: 'ส่งคำขอแล้ว', IN_REVIEW: 'กำลังตรวจสอบ',
  NEED_FIX: 'รอแก้ไขเอกสาร', PENDING_APPROVAL: 'รออนุมัติ', APPROVED: 'อนุมัติ', COMPLETED: 'เสร็จสิ้น',
  REJECTED: 'ไม่อนุมัติ', CANCELLED: 'ยกเลิก',
} as const;
export type CaseStatus = keyof typeof STATUS_TH;

/** CONTRACT §4.2 */
export const LEVEL_TH = { normal: 'ปกติ', near: 'ใกล้ครบกำหนด', overdue: 'เกินกำหนด', paused: 'หยุดนับ', closed: 'ปิดแล้ว' } as const;
export type SlaLevel = keyof typeof LEVEL_TH;

/** CONTRACT §4.3 */
export const SERVICE_NAME = { 'SV-01': 'ขอหนังสือรับรอง', 'SV-02': 'ขออนุญาตประกอบกิจการ', 'SV-03': 'ขออนุญาตก่อสร้าง/ต่อเติมอาคาร' } as const;
export type ServiceId = keyof typeof SERVICE_NAME;

/** TEST-DATA §4.1 / §11: required document keys and seed-compatible upload fixtures per service. */
export const REQUIRED_UPLOADS: Record<ServiceId, ReadonlyArray<{ docKey: string; file: TestFileName }>> = {
  'SV-01': [{ docKey: 'id-card', file: 'id-card.pdf' }],
  'SV-02': [{ docKey: 'id-card', file: 'id-card.pdf' }, { docKey: 'map', file: 'map.pdf' }],
  'SV-03': [{ docKey: 'id-card', file: 'id-card.pdf' }, { docKey: 'plan', file: 'plan.pdf' }, { docKey: 'deed', file: 'deed.pdf' }],
};

export const MASKED_ID = /^X-XXXX-XXXXX-\d{2}-\d$/;
export const VERIFY_CODE = /^[A-Z0-9]{8}$/;
/** TEST-DATA §1.1 plaintext personal data (13-digit, dashed forms, mobiles). */
export const PERSONAL_IDS = ['1101700123456', '3100600987659', '1909900555015', '5500400111221'] as const;
export const PERSONAL_DASHED = ['1-1017-00123-45-6', '3-1006-00987-65-9', '1-9099-00555-01-5', '5-5004-00111-22-1'] as const;
export const SEED_MOBILES = ['0812345678', '0823456789', '0834567890'] as const;
export const CITIZEN_NAMES = ['สมชาย', 'สมหญิง', 'ปิติ', 'มานะ'] as const;

/** `EG-2569-000025` from 25 (TEST-PLAN uses `…000025`). */
export function caseNo(n: number, year = 2569): string {
  return `EG-${year}-${String(n).padStart(6, '0')}`;
}
export function receiptNo(n: number, year = 2569): string {
  return `RC-${year}-${String(n).padStart(6, '0')}`;
}
/** Bangkok wall-clock ISO with explicit +07:00 offset, e.g. iso('2026-12-04 16:30') */
export function iso(local: string): string {
  const [date, time = '00:00:00'] = local.trim().split(/[ T]/);
  const full = time.length === 5 ? `${time}:00` : time;
  return `${date}T${full}+07:00`;
}

// ---------------------------------------------------------------------------------------------
// Actors and the `cast` fixture
// ---------------------------------------------------------------------------------------------

export type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** One browser context (cookies) plus its cookie-sharing request transport. */
export class Actor {
  private mainPage?: Page;
  constructor(readonly name: ActorName | 'anon', readonly context: BrowserContext) {}

  get api(): APIRequestContext { return this.context.request; }

  /** The actor's main page (created lazily, recreated if closed). */
  async page(): Promise<Page> {
    if (!this.mainPage || this.mainPage.isClosed()) this.mainPage = await this.context.newPage();
    return this.mainPage;
  }

  async newPage(): Promise<Page> { return this.context.newPage(); }

  /** Navigate the main page and return it with the HTTP status of the document. */
  async open(path: string): Promise<{ page: Page; status: number }> {
    const page = await this.page();
    const response = await page.goto(path);
    expect(response, `${this.name} ${path} must return a document response`).not.toBeNull();
    return { page, status: response!.status() };
  }

  get(path: string): Promise<APIResponse> { return this.api.get(path); }
  post(path: string, data?: unknown): Promise<APIResponse> {
    return data === undefined ? this.api.post(path) : this.api.post(path, { data });
  }
  put(path: string, data?: unknown): Promise<APIResponse> {
    return data === undefined ? this.api.put(path) : this.api.put(path, { data });
  }
  patch(path: string, data?: unknown): Promise<APIResponse> {
    return data === undefined ? this.api.patch(path) : this.api.patch(path, { data });
  }
  del(path: string): Promise<APIResponse> { return this.api.delete(path); }
}

export class Cast {
  private readonly cached = new Map<ActorName, Actor>();
  private readonly contexts = new Set<BrowserContext>();

  constructor(
    private readonly browser: Browser,
    readonly baseURL: string,
    /** Cookie-less transport for `/api/test/*` hooks (never counts as an app request, CONTRACT 0.7). */
    readonly hook: APIRequestContext,
    private readonly sourceReset: () => Promise<void>,
  ) {}

  private async newContext(): Promise<BrowserContext> {
    const context = await this.browser.newContext({ baseURL: this.baseURL, locale: 'th-TH', timezoneId: 'Asia/Bangkok', acceptDownloads: true });
    this.contexts.add(context);
    return context;
  }

  /** LOGIN_C / LOGIN_S once per actor until the next reset (same cookies reused). */
  async as(name: ActorName): Promise<Actor> {
    const existing = this.cached.get(name);
    if (existing) return existing;
    const actor = await this.fresh(name);
    this.cached.set(name, actor);
    return actor;
  }

  /** A new, separately-cookied login for the same account (not cached). */
  async fresh(name: ActorName): Promise<Actor> {
    const actor = new Actor(name, await this.newContext());
    await login(actor.api, name);
    return actor;
  }

  /** A context with no session (anonymous). */
  async anon(): Promise<Actor> {
    return new Actor('anon', await this.newContext());
  }

  /** Forget cached actors without resetting (forces a new login, e.g. after a role change). */
  forget(name: ActorName): void { this.cached.delete(name); }

  /** RESET: drop every local context/cookie, then POST /api/test/reset (fixture verifies 200 + now). */
  async reset(): Promise<void> {
    await this.dispose();
    await this.sourceReset();
  }

  /** CLOCK(t): PUT /api/test/clock → 200 {"now": t}. */
  async clock(now: string): Promise<void> {
    await expectJson(await this.hook.put('/api/test/clock', { data: { now } }), 200, { now });
  }

  async now(): Promise<string> {
    const body = await expectJson(await this.hook.get('/api/test/clock'), 200);
    return body.now as string;
  }

  /** POST /api/test/payments/<ref>/pay {"amount"} (raw response). */
  pay(ref: string, amount: number): Promise<APIResponse> {
    return this.hook.post(`/api/test/payments/${ref}/pay`, { data: { amount } });
  }

  /** POST /api/test/documents/<docNo>/tamper → 200 {"ok":true}. */
  async tamper(docNo: string): Promise<void> {
    await expectJson(await this.hook.post(`/api/test/documents/${docNo}/tamper`), 200, { ok: true });
  }

  async dispose(): Promise<void> {
    this.cached.clear();
    const contexts = [...this.contexts];
    this.contexts.clear();
    for (const context of contexts) {
      for (const page of context.pages()) await page.close().catch(() => undefined);
      await context.clearCookies().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  }
}

/** Authenticate through the source API (CONTRACT §6.1) and require the exact success body. */
export async function login(api: APIRequestContext, name: ActorName): Promise<void> {
  const actor = ACTORS[name];
  if (actor.kind === 'citizen') {
    await expectJson(await api.post('/api/auth/thaid/start', { data: { idNo: actor.idNo } }), 200, { status: 'OTP_SENT' });
    await expectJson(await api.post('/api/auth/thaid/verify', { data: { idNo: actor.idNo, otp: CITIZEN_OTP } }), 200, { registered: actor.registered });
  } else {
    await expectJson(await api.post('/api/auth/staff/login', { data: { username: actor.username, password: actor.password } }), 200,
      { role: actor.role, dept: actor.dept, landing: actor.landing });
  }
}

/** Canonical test: auto RESET before each body (fixtures/reset.ts) plus the `cast` fixture. */
export const test = sourceTest.extend<{ cast: Cast }>({
  cast: async ({ browser, baseURL, playwright, reset }, use) => {
    if (!baseURL) throw new Error('Source acceptance requires baseURL');
    const hook = await playwright.request.newContext({ baseURL });
    const cast = new Cast(browser, baseURL, hook, reset);
    try { await use(cast); } finally { await cast.dispose(); await hook.dispose(); }
  },
});

// ---------------------------------------------------------------------------------------------
// Response assertions
// ---------------------------------------------------------------------------------------------

/** Assert HTTP status and (optionally) exact JSON equality; returns the parsed body (or null). */
export async function expectJson(response: APIResponse, status: number, body?: unknown): Promise<Json> {
  const text = await response.text();
  expect(response.status(), `${response.url()} status · body ${text.slice(0, 300)}`).toBe(status);
  let parsed: Json = null;
  if (text.length) {
    try { parsed = JSON.parse(text); } catch { parsed = null; }
  }
  if (body !== undefined) expect(parsed, `${response.url()} JSON`).toEqual(body);
  return parsed;
}

/** Assert the CONTRACT error shape `{code, message}` (+ any listed extra fields). */
export async function expectError(response: APIResponse, status: number, code: ErrorCode, extra: Record<string, unknown> = {}): Promise<Json> {
  const body = await expectJson(response, status);
  expect(body, `${response.url()} error body`).toMatchObject({ code, message: MSG[code], ...extra });
  return body;
}

/** Assert only the status (bodies whose shape the source leaves open). */
export async function expectStatus(response: APIResponse, status: number): Promise<void> {
  expect(response.status(), `${response.url()} status · body ${(await response.text()).slice(0, 300)}`).toBe(status);
}

// ---------------------------------------------------------------------------------------------
// Citizen draft / upload / payment API (CONTRACT §6.2)
// ---------------------------------------------------------------------------------------------

export interface DraftBody { serviceId: ServiceId; qty?: number; areaSqm?: number }

export async function createDraft(actor: Actor, body: DraftBody): Promise<{ draftId: string; fee: number }> {
  const json = await expectJson(await actor.post('/api/drafts', body), 201);
  expect(json.draftId, 'draftId format').toMatch(/^DR-\d{4}$/);
  return { draftId: json.draftId as string, fee: json.fee as number };
}

export function testFile(file: TestFileName | TestFile): TestFile {
  return typeof file === 'string' ? fixtureFile(file) : file;
}

/** POST /api/drafts/:id/files multipart `file` + `docKey` (raw response). */
export function uploadFile(actor: Actor, draftId: string, docKey: string, file: TestFileName | TestFile): Promise<APIResponse> {
  const payload = testFile(file);
  return actor.api.post(`/api/drafts/${draftId}/files`, {
    multipart: { file: { name: payload.name, mimeType: payload.mimeType, buffer: payload.buffer }, docKey },
  });
}

/** Upload and require 201 `{fileId, name, docKey, size}`. */
export async function attach(actor: Actor, draftId: string, docKey: string, file: TestFileName | TestFile): Promise<Json> {
  const payload = testFile(file);
  const json = await expectJson(await uploadFile(actor, draftId, docKey, payload), 201);
  expect(json).toMatchObject({ name: payload.name, docKey, size: payload.buffer.length });
  expect(typeof json.fileId === 'string' || typeof json.fileId === 'number', 'fileId present').toBe(true);
  return json;
}

export async function attachRequired(actor: Actor, draftId: string, service: ServiceId): Promise<void> {
  for (const { docKey, file } of REQUIRED_UPLOADS[service]) await attach(actor, draftId, docKey, file);
}

export interface Qr { ref: string; amount: number; qrCreatedAt: string; qrExpiresAt: string }

/** POST /api/drafts/:id/payment → 201 QR. */
export async function createQr(actor: Actor, draftId: string): Promise<Qr> {
  const json = await expectJson(await actor.post(`/api/drafts/${draftId}/payment`), 201);
  expect(json.ref, 'payment ref format').toMatch(/^PP-\d{4}$/);
  return json as Qr;
}

export interface Paid { caseNo: string; receiptNo: string; ref: string; draftId: string; fee: number; actor: Actor }

export interface NewPaidOptions { who?: ActorName; service?: ServiceId; at?: string; qty?: number; areaSqm?: number }

function draftBody(service: ServiceId, options: NewPaidOptions): DraftBody {
  if (service === 'SV-01') return { serviceId: service, qty: options.qty ?? 1 };
  if (service === 'SV-03') return { serviceId: service, areaSqm: options.areaSqm ?? 100 };
  return { serviceId: service };
}

/** NEW_PAID up to (but excluding) the pay callback: CLOCK → LOGIN_C → draft → required files → QR. */
export async function newUnpaid(cast: Cast, options: NewPaidOptions = {}): Promise<{ draftId: string; fee: number; qr: Qr; actor: Actor }> {
  const service = options.service ?? 'SV-01';
  if (options.at) await cast.clock(options.at);
  const actor = await cast.as(options.who ?? 'somchai');
  const { draftId, fee } = await createDraft(actor, draftBody(service, options));
  await attachRequired(actor, draftId, service);
  const qr = await createQr(actor, draftId);
  expect(qr.amount, 'QR amount equals the draft fee').toBe(fee);
  return { draftId, fee, qr, actor };
}

/** TEST-PLAN §0 NEW_PAID(ผู้ยื่น, บริการ, เวลา, ตัวเลือก): returns the issued caseNo. */
export async function newPaid(cast: Cast, options: NewPaidOptions = {}): Promise<Paid> {
  const { draftId, fee, qr, actor } = await newUnpaid(cast, options);
  const paid = await expectJson(await cast.pay(qr.ref, fee), 200);
  expect(paid).toMatchObject({ status: 'PAID', duplicate: false });
  const payment = await expectJson(await actor.get(`/api/payments/${qr.ref}`), 200);
  expect(payment).toMatchObject({ ref: qr.ref, status: 'PAID', caseNo: paid.caseNo, receiptNo: paid.receiptNo });
  return { caseNo: paid.caseNo as string, receiptNo: paid.receiptNo as string, ref: qr.ref, draftId, fee, actor };
}

// ---------------------------------------------------------------------------------------------
// Case / workflow API (CONTRACT §6.2–6.4)
// ---------------------------------------------------------------------------------------------

export async function getCase(actor: Actor, no: string): Promise<Json> {
  return expectJson(await actor.get(`/api/cases/${no}`), 200);
}

export const api = {
  claim: (a: Actor, no: string) => a.post(`/api/officer/cases/${no}/claim`),
  returnCase: (a: Actor, no: string, reason: string) => a.post(`/api/officer/cases/${no}/return`, { reason }),
  forward: (a: Actor, no: string, note?: string) => a.post(`/api/officer/cases/${no}/forward`, note === undefined ? {} : { note }),
  approve: (a: Actor, no: string) => a.post(`/api/cases/${no}/approve`),
  reject: (a: Actor, no: string, reason: string) => a.post(`/api/cases/${no}/reject`, { reason }),
  issue: (a: Actor, no: string) => a.post(`/api/officer/cases/${no}/issue`),
  unmask: (a: Actor, no: string, reason: string) => a.post(`/api/officer/cases/${no}/unmask`, { reason }),
  cancel: (a: Actor, no: string) => a.post(`/api/cases/${no}/cancel`),
  resubmit: (a: Actor, no: string) => a.post(`/api/cases/${no}/resubmit`),
  queue: (a: Actor, filter = 'all') => a.get(`/api/officer/queue?filter=${filter}`),
  notifications: (a: Actor) => a.get('/api/notifications'),
  dashboard: (a: Actor, period: string, service = 'ALL') => a.get(`/api/dashboard?period=${period}&service=${service}`),
  audit: (a: Actor, query: Record<string, string> = {}) => a.get(`/api/audit${toQuery(query)}`),
  verify: (a: Actor, code: string) => a.get(`/api/verify/${code}`),
};

export function toQuery(query: Record<string, string>): string {
  const params = new URLSearchParams(query).toString();
  return params ? `?${params}` : '';
}

/** Successful workflow call: require status 200 and return the JSON body. */
export async function ok(response: Promise<APIResponse> | APIResponse, status = 200): Promise<Json> {
  return expectJson(await response, status);
}

/** Approve + issue (SV-01 owner) and return `{docNo, verifyCode}`. */
export async function approveAndIssue(officer: Actor, no: string): Promise<{ docNo: string; verifyCode: string }> {
  await expectJson(await api.approve(officer, no), 200, { status: 'APPROVED' });
  return issue(officer, no);
}

export async function issue(officer: Actor, no: string): Promise<{ docNo: string; verifyCode: string }> {
  const body = await expectJson(await api.issue(officer, no), 200);
  expect(body).toMatchObject({ status: 'COMPLETED' });
  expect(body.docNo).toMatch(/^DOC-\d{4}-\d{6}$/);
  expect(body.verifyCode).toMatch(VERIFY_CODE);
  return { docNo: body.docNo as string, verifyCode: body.verifyCode as string };
}

/** Queue items via API, as `caseNo` list. */
export async function queueCaseNos(actor: Actor, filter = 'all'): Promise<string[]> {
  const body = await expectJson(await api.queue(actor, filter), 200);
  return (body.items as Array<{ caseNo: string }>).map((item) => item.caseNo);
}

export async function notifications(actor: Actor): Promise<Array<{ caseNo: string; level: string; text: string }>> {
  const body = await expectJson(await api.notifications(actor), 200);
  return body.items as Array<{ caseNo: string; level: string; text: string }>;
}

/** Sorted `caseNo:level` pairs for set comparison. */
export function pairs(items: ReadonlyArray<{ caseNo: string; level: string }>): string[] {
  return items.map((item) => `${item.caseNo}:${item.level}`).sort();
}

/** `[n, level]` shorthand → sorted `EG-2569-n:level` pairs. */
export function expectedPairs(entries: ReadonlyArray<readonly [number, 'near' | 'overdue']>): string[] {
  return entries.map(([n, level]) => `${caseNo(n)}:${level}`).sort();
}

export async function auditItems(auditor: Actor, query: Record<string, string> = {}): Promise<{ count: number; items: Json[] }> {
  const body = await expectJson(await api.audit(auditor, query), 200);
  expect(body.count, 'audit count equals items length').toBe(body.items.length);
  return body as { count: number; items: Json[] };
}

// ---------------------------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------------------------

export function tid(scope: Page | Locator, id: string): Locator {
  return scope.getByTestId(id);
}

/** `[data-testid=<id>][<attr>=<value>]`, e.g. a queue row by `data-case-no`. */
export function rowBy(scope: Page | Locator, testid: string, attr: string, value: string): Locator {
  return scope.locator(`[data-testid="${testid}"][${attr}="${value}"]`);
}

export function caseRow(page: Page, testid: 'queue-row' | 'approval-row' | 'my-case-row', no: string): Locator {
  return rowBy(page, testid, 'data-case-no', no);
}

/** Attribute values of every match, in document order. */
export async function attrs(locator: Locator, attr: string): Promise<string[]> {
  return locator.evaluateAll((nodes, name) => nodes.map((node) => node.getAttribute(name) ?? ''), attr);
}

/** Visible-text of every match, trimmed, in document order. */
export async function texts(locator: Locator): Promise<string[]> {
  return (await locator.allTextContents()).map((text) => text.trim());
}

/** Assert status text + code (CONTRACT 0.4) on a `case-status`/`row-status` element. */
export async function expectStatusBadge(locator: Locator, status: CaseStatus): Promise<void> {
  await expect(locator).toHaveAttribute('data-status', status);
  await expect(locator).toHaveText(STATUS_TH[status]);
}

/** Assert level text + code on a `sla-level`/`row-sla-level` element. */
export async function expectLevelBadge(locator: Locator, level: SlaLevel): Promise<void> {
  await expect(locator).toHaveAttribute('data-level', level);
  await expect(locator).toHaveText(LEVEL_TH[level]);
}

/** Open a case page as the actor (`citizen` → /citizen/cases, else /officer/cases). */
export async function openCase(actor: Actor, no: string, kind: 'citizen' | 'officer' = actor.name === 'anon' || ACTORS[actor.name].kind === 'citizen' ? 'citizen' : 'officer'): Promise<Page> {
  const { page, status } = await actor.open(`/${kind}/cases/${no}`);
  expect(status, `${actor.name} opens ${no}`).toBe(200);
  await expect(tid(page, 'case-no')).toHaveText(no);
  return page;
}

/** Officer page: return through the UI with `reason`. */
export async function uiReturn(page: Page, reason: string): Promise<void> {
  await tid(page, 'return-btn').click();
  await tid(page, 'return-reason').fill(reason);
  await tid(page, 'return-submit').click();
}

export async function uiReject(page: Page, reason: string): Promise<void> {
  await tid(page, 'reject-btn').click();
  await tid(page, 'reject-reason').fill(reason);
  await tid(page, 'reject-submit').click();
}

export async function uiUnmask(page: Page, reason: string): Promise<void> {
  if (!(await tid(page, 'unmask-reason').isVisible())) await tid(page, 'show-full-id-btn').click();
  await tid(page, 'unmask-reason').fill(reason);
  await tid(page, 'unmask-submit').click();
}

/** Select a `<select>` by testid and wait until its value is applied. */
export async function choose(page: Page, testid: string, value: string): Promise<void> {
  await tid(page, testid).selectOption(value);
  await expect(tid(page, testid)).toHaveValue(value);
}

/** Set files on an upload input (fixture name or explicit payload). */
export async function setFiles(page: Page, testid: string, files: ReadonlyArray<TestFileName | TestFile>): Promise<void> {
  await tid(page, testid).setInputFiles(files.map((file) => {
    const payload = testFile(file);
    return { name: payload.name, mimeType: payload.mimeType, buffer: payload.buffer };
  }));
}

/** Read a download fully into memory. */
export async function downloadBuffer(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

/** Click and capture the triggered download. */
export async function clickDownload(page: Page, locator: Locator): Promise<{ download: Download; buffer: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent('download'), locator.click()]);
  return { download, buffer: await downloadBuffer(download) };
}

/** TC-NFR-01: page has no horizontal document scroll. */
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth, `${label}: scrollWidth ${scrollWidth} ≤ innerWidth ${innerWidth}`).toBeLessThanOrEqual(innerWidth);
}

// ---------------------------------------------------------------------------------------------
// Data-shape oracles
// ---------------------------------------------------------------------------------------------

/** Every key name at any depth of a JSON value. */
export function deepKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) deepKeys(item, out);
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) { out.push(key); deepKeys(inner, out); }
  }
  return out;
}

/**
 * Machine-readable lines of a PDF (CONTRACT §3, §7): raw bytes, Flate-decoded streams and the
 * string operands of each BT…ET text object (literal or hex) are all considered.
 */
export function pdfLines(pdf: Buffer): string[] {
  const sources: string[] = [pdf.toString('latin1')];
  const raw = sources[0]!;
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
  const lines = new Set<string>();
  for (const source of sources) {
    for (const line of source.split(/\r\n|\r|\n/)) {
      const trimmed = line.trim();
      // A PDF comment line (`% docNo=…`) carries the same machine-readable text without the marker.
      lines.add(/^%(?!PDF-|%EOF)/.test(trimmed) ? trimmed.replace(/^%+\s*/, '') : trimmed);
    }
    // BT/ET are operators, so match them as whole tokens: an 8-char verify code such as `AB3ETQ7X`
    // inside a string operand must not end the text object (B14 triage, campaign-1 B02 run).
    for (const block of source.match(/\bBT\b[\s\S]*?\bET\b/g) ?? []) {
      const parts: string[] = [];
      for (const operand of block.match(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g) ?? []) {
        if (operand.startsWith('(')) parts.push(operand.slice(1, -1).replace(/\\([()\\])/g, '$1'));
        else {
          const hex = operand.slice(1, -1).replace(/\s+/g, '');
          parts.push(Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex').toString('latin1'));
        }
      }
      if (parts.length) lines.add(parts.join('').trim());
    }
  }
  lines.delete('');
  return [...lines];
}

/** Exactly one distinct machine-readable line starting with `prefix`, equal to / matching `expected`. */
export function expectPdfLine(pdf: Buffer, prefix: string, expected: string | RegExp): string {
  const candidates = pdfLines(pdf).filter((line) => line.startsWith(prefix));
  expect(candidates, `PDF has exactly one distinct "${prefix}…" line`).toHaveLength(1);
  const line = candidates[0]!;
  if (typeof expected === 'string') expect(line).toBe(expected);
  else expect(line).toMatch(expected);
  return line;
}

/** Filename from a Content-Disposition header (plain or RFC 5987). */
export function dispositionFilename(header: string | undefined): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) return decodeURIComponent(star[1]!.trim().replace(/^"|"$/g, ''));
  const plain = /filename\s*=\s*("?)([^";]+)\1/i.exec(header);
  return plain ? plain[2]!.trim() : null;
}

/** BR-24 personal-data scan used by dashboards/exports: no 13-digit run, no 0XXXXXXXXX, no citizen names. */
export function expectNoPersonalData(text: string, label: string): void {
  expect(text, `${label}: no 13-digit ID`).not.toMatch(/\d{13}/);
  expect(text, `${label}: no mobile number`).not.toMatch(/0\d{9}/);
  for (const name of CITIZEN_NAMES) expect(text, `${label}: no citizen name ${name}`).not.toContain(name);
}
