import type { Browser, BrowserContext, Page, Route } from '@playwright/test';
import { test as sourceTest, expect } from '../fixtures/reset.js';
import { ACTORS, CITIZEN_OTP, type ActorName } from '../fixtures/actors.js';

/** Own UI contexts as well as their cookie-sharing request transports across source RESETs. */
class AuthFlows {
  private readonly contexts = new Set<BrowserContext>();

  constructor(
    private readonly browser: Browser,
    private readonly baseURL: string,
    private readonly sourceReset: () => Promise<void>,
  ) {}

  async page(): Promise<Page> {
    const context = await this.browser.newContext({ baseURL: this.baseURL, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
    this.contexts.add(context);
    return context.newPage();
  }

  async dispose(): Promise<void> {
    for (const context of this.contexts) {
      for (const page of context.pages()) await page.close();
      await context.clearCookies();
      await context.close();
      this.contexts.delete(context);
    }
  }

  async reset(): Promise<void> {
    await this.dispose();
    await this.sourceReset();
  }

  async actor(name: ActorName): Promise<Page> {
    const page = await this.page();
    const actor = ACTORS[name];
    const api = page.context().request;
    if (actor.kind === 'citizen') {
      await expectReply(await api.post('/api/auth/thaid/start', { data: { idNo: actor.idNo } }), 200, { status: 'OTP_SENT' });
      await expectReply(await api.post('/api/auth/thaid/verify', { data: { idNo: actor.idNo, otp: CITIZEN_OTP } }), 200, { registered: actor.registered });
    } else {
      await expectReply(await api.post('/api/auth/staff/login', { data: { username: actor.username, password: actor.password } }), 200,
        { role: actor.role, dept: actor.dept, landing: actor.landing });
    }
    return page;
  }
}

export const test = sourceTest.extend<{ flows: AuthFlows }>({
  flows: async ({ browser, baseURL, reset }, use) => {
    if (!baseURL) throw new Error('Authentication acceptance requires baseURL');
    const flows = new AuthFlows(browser, baseURL, reset);
    try { await use(flows); } finally { await flows.dispose(); }
  },
});

export { expect };

export interface Reply {
  status(): number;
  url(): string;
  json(): Promise<unknown>;
}

export async function expectReply(response: Reply, status: number, body?: unknown): Promise<void> {
  expect(response.status(), `${response.url()} status`).toBe(status);
  if (body !== undefined) expect(await response.json(), `${response.url()} JSON`).toEqual(body);
}

export async function submit(page: Page, testid: string, path: string): Promise<Reply> {
  const endpoint = new URL(path, page.url()).href;
  let captured: Reply | undefined;
  const capture = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'POST') return route.continue();
    // Forward the genuine browser request exactly once. Snapshot its real status/body before
    // releasing the response to the page, whose success handler may immediately navigate away.
    const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
    const body = await response.body();
    const status = response.status();
    const url = response.url();
    captured = { status: () => status, url: () => url, json: async () => JSON.parse(body.toString('utf8')) as unknown };
    await route.fulfill({ response, body });
  };
  await page.route(endpoint, capture);
  try {
    const [response] = await Promise.all([
      page.waitForResponse((response) => response.url() === endpoint && response.request().method() === 'POST'),
      page.getByTestId(testid).click(),
    ]);
    if (!captured) throw new Error(`No real server response captured for ${path}`);
    expect(response.status(), `${endpoint} browser status matches the real server response`).toBe(captured.status());
    return captured;
  } finally {
    await page.unroute(endpoint, capture);
  }
}

export async function startCitizen(page: Page, idNo: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-tab-citizen').click();
  await page.getByTestId('thaid-id-input').fill(idNo);
  await expectReply(await submit(page, 'thaid-submit', '/api/auth/thaid/start'), 200, { status: 'OTP_SENT' });
  await expect(page.getByTestId('otp-step')).toBeVisible();
}

export async function verifyCitizen(page: Page, otp: string): Promise<Reply> {
  await page.getByTestId('otp-input').fill(otp);
  return submit(page, 'otp-submit', '/api/auth/thaid/verify');
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^เปิดเมนูบัญชี(?:\s|$)/ }).click();
  await expectReply(await submit(page, 'logout-btn', '/api/auth/logout'), 204);
  await expect(page).toHaveURL(/\/login$/);
}
