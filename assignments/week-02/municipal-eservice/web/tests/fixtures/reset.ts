import { isDeepStrictEqual } from 'node:util';
import { request, test as base, type APIRequestContext, type BrowserContext, type FullConfig } from '@playwright/test';
import { ACTORS, CITIZEN_OTP, type ActorName } from './actors.js';

export const RESET_NOW = '2026-12-01T09:00:00+07:00';
export interface FixtureResponse { status(): number; json(): Promise<unknown> }
type StorageState = Awaited<ReturnType<APIRequestContext['storageState']>>;
export interface FixtureAPI {
  get(path: string): Promise<FixtureResponse>;
  post(path: string, options?: { data?: unknown }): Promise<FixtureResponse>;
  storageState(): Promise<StorageState>;
  dispose(): Promise<void>;
}
export interface FixturePage { close(): Promise<void> }
export interface FixtureBrowserContext<TPage extends FixturePage = FixturePage> {
  pages(): TPage[];
  newPage(): Promise<TPage>;
  clearCookies(): Promise<void>;
  close(): Promise<void>;
}
type APIFactory<TApi> = { newContext(options: { baseURL: string }): Promise<TApi> };
type BrowserFactory<TContext> = { newContext(options: { baseURL: string; storageState: StorageState }): Promise<TContext> };
type ContextPage<TContext extends FixtureBrowserContext> = Awaited<ReturnType<TContext['newPage']>>;
export interface ActorSession<TApi = APIRequestContext, TContext extends FixtureBrowserContext = BrowserContext> {
  api: TApi;
  context?: TContext;
  page?: ContextPage<TContext>;
}

async function requireReply(response: FixtureResponse, status: number, expected: unknown, operation: string): Promise<void> {
  if (response.status() !== status) throw new Error(`${operation}: expected HTTP ${status}, received ${response.status()}`);
  if (!isDeepStrictEqual(await response.json(), expected)) throw new Error(`${operation}: response violates the source contract`);
}

export async function assertHealthyServer(response: FixtureResponse): Promise<void> {
  await requireReply(response, 200, { status: 'ok' }, 'Health readiness');
}

/** Own every actor transport. Always reacquire session/page references after reset(). */
export class ActorSessions<TApi extends FixtureAPI = APIRequestContext, TContext extends FixtureBrowserContext = BrowserContext> {
  private readonly sessions = new Map<ActorName, ActorSession<TApi, TContext>>();
  private readonly pending = new Map<ActorName, Promise<ActorSession<TApi, TContext>>>();
  private readonly pendingPages = new Map<ActorName, Promise<void>>();
  private readonly contexts = new Set<TContext>();
  private resetSucceeded = true;

  constructor(
    private readonly factory: APIFactory<TApi>,
    private readonly baseURL: string,
    private readonly browser?: BrowserFactory<TContext>,
  ) {}

  async login(name: ActorName, options: { withPage?: boolean } = {}): Promise<ActorSession<TApi, TContext>> {
    if (!this.resetSucceeded) throw new Error('Reset must succeed before fresh actor login');
    let session = this.sessions.get(name);
    if (!session) {
      let pending = this.pending.get(name);
      if (!pending) {
        pending = this.authenticate(name);
        this.pending.set(name, pending);
      }
      try { session = await pending; }
      finally { this.pending.delete(name); }
    }
    if (!this.resetSucceeded) throw new Error('Reset started before actor login completed');
    if (options.withPage && !session.page) {
      let pendingPage = this.pendingPages.get(name);
      if (!pendingPage) {
        pendingPage = this.initializePage(session);
        this.pendingPages.set(name, pendingPage);
      }
      try { await pendingPage; }
      finally { if (this.pendingPages.get(name) === pendingPage) this.pendingPages.delete(name); }
    }
    return session;
  }

  private async initializePage(session: ActorSession<TApi, TContext>): Promise<void> {
    if (!this.browser) throw new Error('A browser is required for an actor page');
    if (!session.context) {
      session.context = await this.browser.newContext({ baseURL: this.baseURL, storageState: await session.api.storageState() });
      this.contexts.add(session.context);
    }
    session.page = await session.context.newPage() as ContextPage<TContext>;
  }

  private async authenticate(name: ActorName): Promise<ActorSession<TApi, TContext>> {
    const actor = ACTORS[name];
    const api = await this.factory.newContext({ baseURL: this.baseURL });
    try {
      if (actor.kind === 'citizen') {
        await requireReply(await api.post('/api/auth/thaid/start', { data: { idNo: actor.idNo } }), 200, { status: 'OTP_SENT' }, 'ThaiD start');
        await requireReply(await api.post('/api/auth/thaid/verify', { data: { idNo: actor.idNo, otp: CITIZEN_OTP } }), 200, { registered: actor.registered }, 'ThaiD verify');
      } else {
        await requireReply(await api.post('/api/auth/staff/login', { data: { username: actor.username, password: actor.password } }), 200,
          { role: actor.role, dept: actor.dept, landing: actor.landing }, 'Staff login');
      }
      const session: ActorSession<TApi, TContext> = { api };
      this.sessions.set(name, session);
      return session;
    } catch (error) {
      await api.dispose();
      throw error;
    }
  }

  /** Clear local transports first; reset invalidates all server sessions as well. */
  async reset(): Promise<void> {
    this.resetSucceeded = false;
    await this.dispose();
    const resetAPI = await this.factory.newContext({ baseURL: this.baseURL });
    try {
      await requireReply(await resetAPI.post('/api/test/reset'), 200, { ok: true, now: RESET_NOW }, 'Reset');
    } finally {
      await resetAPI.dispose();
    }
    this.resetSucceeded = true;
  }

  async dispose(): Promise<void> {
    await Promise.allSettled(this.pending.values());
    this.pending.clear();
    await Promise.allSettled(this.pendingPages.values());
    this.pendingPages.clear();
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    const contexts = [...this.contexts];
    this.contexts.clear();
    const failures: unknown[] = [];
    const attempt = async (action: () => Promise<void>) => {
      try { await action(); } catch (error) { failures.push(error); }
    };
    for (const context of contexts) {
      for (const page of context.pages()) await attempt(() => page.close());
      await attempt(() => context.clearCookies());
      await attempt(() => context.close());
    }
    for (const session of sessions) await attempt(() => session.api.dispose());
    if (failures.length) throw new AggregateError(failures, 'Actor session cleanup failed; reset aborted');
  }
}

type AcceptanceFixtures = {
  actors: ActorSessions;
  reset: () => Promise<void>;
  _sourceReset: void;
};

/** Import this test for canonical acceptance cases. Each TC resets before its body. */
export const test = base.extend<AcceptanceFixtures>({
  actors: async ({ playwright, browser, baseURL }, use) => {
    if (!baseURL) throw new Error('Acceptance fixtures require baseURL');
    const actors = new ActorSessions(playwright.request, baseURL, browser);
    try { await use(actors); } finally { await actors.dispose(); }
  },
  reset: async ({ actors }, use) => { await use(() => actors.reset()); },
  _sourceReset: [async ({ actors }, use) => { await actors.reset(); await use(); }, { auto: true }],
});
export { expect } from '@playwright/test';

/** Playwright invokes this after its owned webServer becomes reachable, before any TC. */
export default async function healthReadiness(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error('Health readiness requires a configured baseURL');
  const api = await request.newContext({ baseURL });
  try { await assertHealthyServer(await api.get('/api/health')); }
  finally { await api.dispose(); }
}
