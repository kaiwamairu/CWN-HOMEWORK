import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import {
  test, expect, api, expectJson, expectNoHorizontalScroll, newPaid, setFiles, tid, ACTORS, LEVEL_TH, RESET_NOW, STATUS_TH,
  type Actor, type ActorName, type Cast,
} from './source-helpers.js';

type Who = ActorName | 'anon';

async function actorFor(cast: Cast, who: Who, anon: { actor?: Actor }): Promise<Actor> {
  if (who !== 'anon') return cast.as(who);
  anon.actor ??= await cast.anon();
  return anon.actor;
}

async function openOk(actor: Actor, path: string): Promise<Page> {
  const { page, status } = await actor.open(path);
  expect(status, `${actor.name} opens ${path}`).toBe(200);
  await page.waitForLoadState('networkidle');
  return page;
}

/** testid of the currently focused element (or '' / tag name when it has none). */
function focusedTestId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return '';
    return el.getAttribute('data-testid') ?? `<${el.tagName.toLowerCase()}>`;
  });
}

/** Visible focus indicator on the focused element: outline-style not `none`, or a box-shadow. */
async function expectFocusRing(page: Page, label: string): Promise<void> {
  const info = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    return {
      name: el.getAttribute('data-testid') ?? el.outerHTML.slice(0, 80),
      outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow,
    };
  });
  expect(info, `${label}: an element in the page is focused`).not.toBeNull();
  const outline = info!.outlineStyle !== 'none' && info!.outlineWidth !== '0px';
  const ring = info!.boxShadow !== 'none' && info!.boxShadow !== '';
  expect(outline || ring, `${label}: focused ${info!.name} has a visible focus indicator (${JSON.stringify(info)})`).toBe(true);
}

/** Press Tab until the element with `testid` is focused (checking the focus ring at every stop). */
async function tabTo(page: Page, testid: string, max = 60): Promise<void> {
  for (let i = 0; i <= max; i += 1) {
    if (await focusedTestId(page) === testid) {
      await expectFocusRing(page, testid);
      return;
    }
    if (i === max) break;
    await page.keyboard.press('Tab');
    // Every in-page Tab stop must show a ring; a stop outside the document (browser chrome) has no element to check.
    if (await focusedTestId(page) !== '') await expectFocusRing(page, `Tab towards ${testid}`);
  }
  expect(await focusedTestId(page), `keyboard focus reaches ${testid} within ${max} Tab presses`).toBe(testid);
}

/** Visible form controls without an accessible name (label / aria-label / aria-labelledby). */
async function unlabeledControls(page: Page): Promise<string[]> {
  const controls = page.locator('input:not([type="hidden"]), select, textarea');
  const missing: string[] = [];
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const result = await control.evaluate((el) => {
      const field = el as HTMLInputElement;
      const text = (node: Element | null) => (node?.textContent ?? '').trim();
      const viaLabel = Array.from(field.labels ?? []).some((label) => text(label).length > 0);
      const viaAria = (field.getAttribute('aria-label') ?? '').trim().length > 0;
      const viaLabelledBy = (field.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
        .some((id) => text(document.getElementById(id)).length > 0);
      return { ok: viaLabel || viaAria || viaLabelledBy, name: field.getAttribute('data-testid') ?? field.outerHTML.slice(0, 80) };
    });
    if (!result.ok) missing.push(result.name);
  }
  return missing;
}

/** Status/level badges: non-empty text equal to the CONTRACT 4.1/4.2 text of their code. Returns the badge count. */
async function checkBadges(page: Page, label: string): Promise<number> {
  const badges = await page.locator(
    '[data-testid="case-status"], [data-testid="row-status"], [data-testid="sla-level"], [data-testid="row-sla-level"]',
  ).evaluateAll((nodes) => nodes.map((node) => ({
    testid: node.getAttribute('data-testid') ?? '',
    status: node.getAttribute('data-status'),
    level: node.getAttribute('data-level'),
    text: (node.textContent ?? '').trim(),
  })));
  for (const badge of badges) {
    expect(badge.text, `${label}: ${badge.testid} text is not empty`).not.toBe('');
    if (badge.testid.endsWith('status')) {
      expect(badge.status, `${label}: ${badge.testid} has data-status`).not.toBeNull();
      expect(badge.text, `${label}: ${badge.testid} ${badge.status}`).toBe(STATUS_TH[badge.status as keyof typeof STATUS_TH]);
    } else {
      expect(badge.level, `${label}: ${badge.testid} has data-level`).not.toBeNull();
      expect(badge.text, `${label}: ${badge.testid} ${badge.level}`).toBe(LEVEL_TH[badge.level as keyof typeof LEVEL_TH]);
    }
  }
  return badges.length;
}

test('TC-NFR-01 Responsive 375 / 768 / 1280', async ({ cast }) => {
  test.setTimeout(300_000);
  const pages: ReadonlyArray<{ who: Who; path: string }> = [
    { who: 'anon', path: '/login' },
    { who: 'somchai', path: '/citizen' },
    { who: 'somchai', path: '/citizen/new/SV-03' },
    { who: 'somchai', path: '/citizen/cases/EG-2569-000013' },
    { who: 'off.reg1', path: '/officer/queue' },
    { who: 'off.reg1', path: '/officer/cases/EG-2569-000020' },
    { who: 'head1', path: '/head/approvals' },
    { who: 'exec1', path: '/dashboard' },
    { who: 'audit1', path: '/audit' },
    { who: 'admin1', path: '/admin/services' },
    { who: 'anon', path: '/verify/K7M2Q9XA' },
  ];
  const viewports = [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }];
  const anon: { actor?: Actor } = {};
  let checks = 0;
  for (const viewport of viewports) {
    await test.step(`${viewport.width}×${viewport.height}: 11 หน้าไม่มี scroll แนวนอน`, async () => {
      for (const entry of pages) {
        const actor = await actorFor(cast, entry.who, anon);
        const page = await actor.page();
        await page.setViewportSize(viewport);
        await openOk(actor, entry.path);
        await expectNoHorizontalScroll(page, `${entry.path} (${entry.who}) @${viewport.width}`);
        checks += 1;
      }
    });
  }
  expect(checks, '11 pages × 3 viewports').toBe(33);

  await test.step('งานหลักที่ 375 px: ล็อกอินสมชาย → SV-01 → แนบไฟล์ → create-qr-btn อยู่ในกรอบจอ', async () => {
    const visitor = await cast.anon();
    const page = await visitor.newPage();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');
    await tid(page, 'login-tab-citizen').click();
    await tid(page, 'thaid-id-input').fill(ACTORS.somchai.idNo);
    await tid(page, 'thaid-submit').click();
    await expect(tid(page, 'otp-step')).toBeVisible();
    await tid(page, 'otp-input').fill('123456');
    await tid(page, 'otp-submit').click();
    await expect(page).toHaveURL(/\/citizen$/);
    await expectNoHorizontalScroll(page, 'main flow /citizen @375');
    await tid(page, 'start-service-SV-01').click();
    await expect(page).toHaveURL(/\/citizen\/new\/SV-01/);
    await tid(page, 'qty-input').fill('1');
    await expect(tid(page, 'fee-total')).toHaveText('฿20');
    await expectNoHorizontalScroll(page, 'main flow step 1 @375');
    await tid(page, 'to-upload-btn').click();
    await setFiles(page, 'upload-input-id-card', ['id-card.pdf']);
    await expect(page.locator('[data-testid="file-item"][data-doc-key="id-card"]')).toHaveCount(1);
    await expectNoHorizontalScroll(page, 'main flow step 2 @375');
    await expect(tid(page, 'to-payment-btn')).toBeEnabled();
    await tid(page, 'to-payment-btn').click();
    const qr = tid(page, 'create-qr-btn');
    await expect(qr).toBeVisible();
    await qr.scrollIntoViewIfNeeded();
    const box = await qr.boundingBox();
    expect(box, 'create-qr-btn has a bounding box').not.toBeNull();
    expect(box!.x, 'create-qr-btn x ≥ 0').toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, 'create-qr-btn right edge ≤ 375').toBeLessThanOrEqual(375);
    await expectNoHorizontalScroll(page, 'main flow step 3 @375');
  });
});

test('TC-NFR-02 WCAG: axe + คีย์บอร์ด + label + สถานะไม่ใช้สีอย่างเดียว', async ({ cast }) => {
  test.setTimeout(300_000);
  const pages: ReadonlyArray<{ who: Who; path: string; badges?: boolean }> = [
    { who: 'anon', path: '/login' },
    { who: 'mana', path: '/register' },
    { who: 'somchai', path: '/citizen', badges: true },
    { who: 'somchai', path: '/citizen/new/SV-01' },
    { who: 'somchai', path: '/citizen/cases/EG-2569-000017', badges: true },
    { who: 'off.reg1', path: '/officer/queue', badges: true },
    { who: 'off.reg1', path: '/officer/cases/EG-2569-000020', badges: true },
    { who: 'head1', path: '/head/approvals' },
    { who: 'exec1', path: '/dashboard' },
    { who: 'audit1', path: '/audit' },
    { who: 'admin1', path: '/admin/services' },
    { who: 'off.reg1', path: '/notifications' },
    { who: 'anon', path: '/verify/K7M2Q9XA' },
  ];
  const anon: { actor?: Actor } = {};

  for (const entry of pages) {
    await test.step(`A/C/D ${entry.path} (${entry.who})`, async () => {
      const actor = await actorFor(cast, entry.who, anon);
      const page = await openOk(actor, entry.path);

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const severe = results.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => `${violation.impact} ${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`);
      expect(severe, `A axe serious/critical on ${entry.path}`).toEqual([]);

      expect(await unlabeledControls(page), `C unlabeled controls on ${entry.path}`).toEqual([]);

      const count = await checkBadges(page, `D ${entry.path}`);
      if (entry.badges) expect(count, `D ${entry.path} renders status/level badges`).toBeGreaterThan(0);
      await page.emulateMedia({ forcedColors: 'active' });
      const forced = await checkBadges(page, `D forced-colors ${entry.path}`);
      expect(forced, `D forced-colors ${entry.path} badge count`).toBe(count);
      const badgeLocator = page.locator(
        '[data-testid="case-status"], [data-testid="row-status"], [data-testid="sla-level"], [data-testid="row-sla-level"]',
      );
      for (const badge of await badgeLocator.all()) {
        if (await badge.isVisible()) await expect(badge).not.toHaveText('');
      }
      await page.emulateMedia({ forcedColors: 'none' });
    });
  }

  await test.step('B คีย์บอร์ดอย่างเดียว: /login → OTP → /citizen → SV-01 → แนบ → create-qr-btn', async () => {
    const visitor = await cast.anon();
    const page = await visitor.newPage();
    await page.goto('/login');
    await tabTo(page, 'thaid-id-input');
    await page.keyboard.type(ACTORS.somchai.idNo);
    await page.keyboard.press('Enter');
    await expect(tid(page, 'otp-input')).toBeVisible();
    await tabTo(page, 'otp-input');
    await page.keyboard.type('123456');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/citizen$/);
    await tabTo(page, 'start-service-SV-01');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/citizen\/new\/SV-01/);
    await expect(tid(page, 'qty-input')).toBeVisible();
    await tabTo(page, 'qty-input');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('1');
    await expect(tid(page, 'qty-input')).toHaveValue('1');
    await expect(tid(page, 'fee-total')).toHaveText('฿20');
    await tabTo(page, 'to-upload-btn');
    await page.keyboard.press('Enter');
    await expect(tid(page, 'upload-input-id-card')).toBeAttached();
    await tabTo(page, 'upload-input-id-card');
    // Attaching on the focused input (no mouse): file chooser content is supplied programmatically.
    await setFiles(page, 'upload-input-id-card', ['id-card.pdf']);
    await expect(page.locator('[data-testid="file-item"][data-doc-key="id-card"]')).toHaveCount(1);
    await tabTo(page, 'to-payment-btn');
    await expect(tid(page, 'to-payment-btn')).toBeEnabled();
    await page.keyboard.press('Enter');
    await expect(tid(page, 'create-qr-btn')).toBeVisible();
  });
});

test('TC-NFR-03 Health เวลาโหลด และผลซ้ำได้', async ({ cast }) => {
  test.setTimeout(240_000);

  await test.step('health: GET /api/health (ไม่มี cookie) → 200 {"status":"ok"} ตรงตัว', async () => {
    const anon = await cast.anon();
    await expectJson(await anon.get('/api/health'), 200, { status: 'ok' });
  });

  await test.step('เวลาโหลดรอบที่ 2 ≤ 3,000 ms', async () => {
    const targets: ReadonlyArray<{ who: Who; path: string }> = [
      { who: 'anon', path: '/login' },
      { who: 'somchai', path: '/citizen' },
      { who: 'off.reg1', path: '/officer/queue' },
      { who: 'exec1', path: '/dashboard' },
      { who: 'audit1', path: '/audit' },
    ];
    const anon: { actor?: Actor } = {};
    for (const target of targets) {
      const actor = await actorFor(cast, target.who, anon);
      const page = await actor.page();
      const warm = await page.goto(target.path, { waitUntil: 'load' });
      expect(warm?.status(), `${target.path} warm-up status`).toBe(200);
      const started = performance.now();
      const response = await page.goto(target.path, { waitUntil: 'load' });
      const elapsed = performance.now() - started;
      expect(response?.status(), `${target.path} status`).toBe(200);
      expect(elapsed, `${target.path} second load ${Math.round(elapsed)} ms`).toBeLessThanOrEqual(3000);
    }
  });

  async function snapshot(): Promise<{ clock: string; queue: unknown[]; dashboard: unknown }> {
    const clock = await cast.now();
    const reg1 = await cast.as('off.reg1');
    const queueBody = await expectJson(await api.queue(reg1, 'all'), 200);
    const queue = (queueBody.items as Array<Record<string, unknown>>)
      .map(({ caseNo, dueAt, status, owner }) => ({ caseNo, dueAt, status, owner }));
    const exec = await cast.as('exec1');
    const dashboard = await expectJson(await api.dashboard(exec, '2026-12', 'ALL'), 200);
    return { clock, queue, dashboard };
  }

  await test.step('ผลซ้ำได้: RESET → S1 → เปลี่ยนสถานะ → RESET → S2 · S1 = S2', async () => {
    await cast.reset();
    const s1 = await snapshot();
    expect(s1.clock).toBe(RESET_NOW);
    expect(s1.clock).toBe('2026-12-01T09:00:00+07:00');

    await cast.clock('2026-12-10T12:00:00+07:00');
    const reg1 = await cast.as('off.reg1');
    await expectJson(await api.claim(reg1, 'EG-2569-000028'), 200, { owner: 'off.reg1' });
    await newPaid(cast, {});

    await cast.reset();
    const s2 = await snapshot();
    expect(s2).toEqual(s1);
    expect(s2.clock).toBe('2026-12-01T09:00:00+07:00');
  });

  await test.step('นาฬิกา: PUT /api/test/clock ไม่มี offset → 400 INVALID_TIME', async () => {
    const response = await cast.hook.put('/api/test/clock', { data: { now: '2026-12-01 09:00' } });
    const body = await expectJson(response, 400);
    expect(body?.code).toBe('INVALID_TIME');
  });
});
