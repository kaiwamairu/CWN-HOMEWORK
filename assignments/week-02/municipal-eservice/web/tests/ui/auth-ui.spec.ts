import type { Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, expectReply, submit } from '../e2e/auth-helpers.js';

const motionFrame = (page: Page) => page.locator('[data-motion-scene]');
const video = (page: Page) => motionFrame(page).locator('video');
const toggle = (page: Page) => motionFrame(page).getByRole('button');

async function expectPlaying(page: Page): Promise<void> {
  await expect(motionFrame(page)).toHaveAttribute('data-motion-state', 'playing');
  await expect.poll(() => video(page).evaluate((element: HTMLVideoElement) => !element.paused && element.currentTime > 0.15),
    { message: 'The real MP4 decoder advances playback', timeout: 10_000 }).toBe(true);
  await expect(motionFrame(page)).toHaveAttribute('data-has-frames', 'true');
}

async function expectFrozen(page: Page): Promise<void> {
  await expect.poll(() => video(page).evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  const before = await video(page).evaluate((element: HTMLVideoElement) => element.currentTime);
  // A bounded observation measures a stopped media timeline, rather than only a React state flag.
  await page.waitForTimeout(300);
  const after = await video(page).evaluate((element: HTMLVideoElement) => element.currentTime);
  expect(Math.abs(after - before), 'Paused video time remains stationary').toBeLessThan(0.04);
}

async function expectPoster(page: Page): Promise<void> {
  await expect(motionFrame(page)).toHaveAttribute('data-has-frames', 'false');
  const poster = motionFrame(page).locator('img');
  await expect(poster).toBeVisible();
  await expect.poll(() => poster.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(video(page)).not.toHaveAttribute('src');
  await expectFrozen(page);
}

async function expectTargetSize(target: Locator): Promise<void> {
  const bounds = await target.boundingBox();
  expect(bounds, 'An interactive target has rendered bounds').not.toBeNull();
  expect(bounds!.width, 'Interactive target width').toBeGreaterThanOrEqual(44);
  expect(bounds!.height, 'Interactive target height').toBeGreaterThanOrEqual(44);
}

async function expectResponsiveLayout(page: Page): Promise<void> {
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    invalidScrollers: Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((element) => {
      const style = getComputedStyle(element);
      return ['auto', 'scroll'].includes(style.overflowX) && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1
        && !(element.matches('[role="region"][aria-label]') && element.querySelector('table'));
    }).map((element) => `${element.tagName}.${element.className}`),
  }));
  expect(layout.documentWidth, 'The document fits the viewport; tables scroll in labelled regions').toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.invalidScrollers).toEqual([]);
  const controls = page.locator('button:visible,input:visible,a.button:visible,a.nav-item:visible,a.service-card:visible,a.text-link:visible');
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    // The checkbox's enclosing label is its full clickable/touch target.
    const isCheckbox = await control.evaluate((element) => element instanceof HTMLInputElement && element.type === 'checkbox');
    await expectTargetSize(isCheckbox ? control.locator('xpath=ancestor::label[1]') : control);
  }
  // Assert the actual media button bounds, independently of its wrapper or CSS declarations.
  await expectTargetSize(toggle(page));
}

for (const failure of ['HTTP 500', 'aborted connection'] as const) {
  test(`Logout ${failure} retains the authenticated page and permits a real retry`, async ({ flows }) => {
    const page = await flows.actor('somchai');
    await page.goto('/citizen');
    await page.getByRole('button', { name: /^เปิดเมนูบัญชี(?:\s|$)/ }).click();
    const endpoint = '**/api/auth/logout';
    await page.route(endpoint, async (route) => {
      if (failure === 'HTTP 500') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'TEST_FAILURE', message: 'temporary failure' }) });
      else await route.abort('failed');
    });
    try {
      await page.getByTestId('logout-btn').click();
      await expect(page).toHaveURL(/\/citizen$/);
      await expect(page.getByTestId('action-error')).toHaveText('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
      await expect(page.getByTestId('logout-btn')).toBeEnabled();
      await expectReply(await page.context().request.get('/api/me'), 200);
    } finally {
      await page.unroute(endpoint);
    }
    await expectReply(await submit(page, 'logout-btn', '/api/auth/logout'), 204);
    await expect(page).toHaveURL(/\/login$/);
    await expectReply(await page.context().request.get('/api/me'), 401,
      { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' });
  });
}

for (const width of [375, 768, 1280]) {
  test(`Entry forms and citizen home fit ${width}px with usable controls and profile menus`, async ({ flows }) => {
    for (const screen of ['citizen login', 'staff login', 'registration', 'citizen home'] as const) {
      await test.step(`${width}px ${screen}: fresh reset and browser context`, async () => {
        await flows.reset();
        const page = screen === 'registration' ? await flows.actor('mana') : screen === 'citizen home' ? await flows.actor('somchai') : await flows.page();
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(screen === 'registration' ? '/register' : screen === 'citizen home' ? '/citizen' : '/login');
        if (screen === 'staff login') await page.getByTestId('login-tab-staff').click();
        await expect(toggle(page)).toBeEnabled();
        await expectResponsiveLayout(page);
        if (screen === 'citizen home') {
          await expect(page.getByTestId('app-header')).toHaveCount(0);
          const trigger = page.getByRole('button', { name: /^เปิดเมนูบัญชี(?:\s|$)/ });
          await trigger.click();
          const menu = page.getByRole('menu', { name: 'บัญชีของฉัน', exact: true });
          await expect(menu).toBeVisible();
          const bounds = await menu.boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.y).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
          for (const item of await menu.getByRole('menuitem').all()) await expectTargetSize(item);
          await test.info().attach(`${width}px-profile-menu`, { body: await page.screenshot(), contentType: 'image/png' });
          await menu.getByTestId('logout-btn').focus();
          await page.keyboard.press('Escape');
          await expect(menu).toBeHidden();
          await expect(trigger).toBeFocused();
          await trigger.press('ArrowDown');
          await expect(menu.getByRole('menuitem').first()).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
        }
        await test.info().attach(`${width}px-${screen}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        await test.info().attach(`${width}px-${screen}-layout`, {
          body: JSON.stringify(await page.evaluate(() => ({
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            controls: Array.from(document.querySelectorAll<HTMLElement>('button,input,a.button,a.nav-item,a.service-card,a.text-link')).filter((element) => element.getClientRects().length > 0).map((element) => {
              const target = element instanceof HTMLInputElement && element.type === 'checkbox' ? element.closest('label')! : element;
              const rect = target.getBoundingClientRect();
              return { name: element.getAttribute('aria-label') ?? element.getAttribute('data-testid') ?? element.textContent?.trim(), width: rect.width, height: rect.height };
            }),
          })), null, 2), contentType: 'application/json',
        });
      });
    }
  });
}

test('Reduced motion initially shows approved posters without any MP4 request across all four placements', async ({ flows }) => {
  const placements = [
    { route: '/login', scene: 'LOGIN-CITIZEN', actor: null },
    { route: '/login', scene: 'LOGIN-STAFF', actor: null },
    { route: '/register', scene: '1A', actor: 'mana' },
    { route: '/citizen', scene: '1A', actor: 'somchai' },
  ] as const;
  for (const placement of placements) {
    await flows.reset();
    const page = placement.actor ? await flows.actor(placement.actor) : await flows.page();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const mp4Requests: string[] = [];
    page.on('request', (request) => { if (/\.mp4(?:\?|$)/i.test(request.url())) mp4Requests.push(request.url()); });
    await page.goto(placement.route);
    if (placement.scene === 'LOGIN-STAFF') await page.getByTestId('login-tab-staff').click();
    await expect(motionFrame(page)).toHaveAttribute('data-motion-scene', placement.scene);
    await expect(toggle(page)).toBeEnabled();
    await expectPoster(page);
    expect(mp4Requests, `${placement.route} ${placement.scene} must not fetch motion before opt-in`).toEqual([]);
  }
});

test('Reduced motion explicit Play decodes the real video and Pause stops its timeline', async ({ flows }) => {
  const page = await flows.page();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  await expectPoster(page);
  await expectTargetSize(toggle(page));
  await page.getByRole('button', { name: 'เล่นภาพเคลื่อนไหว', exact: true }).click();
  await expectPlaying(page);
  await page.getByRole('button', { name: 'หยุดภาพเคลื่อนไหว', exact: true }).click();
  await expect(motionFrame(page)).toHaveAttribute('data-motion-state', 'paused');
  await expectFrozen(page);
});

test('Visible normal motion autoplays, pauses offscreen and preserves the users paused intent', async ({ flows }) => {
  const page = await flows.page();
  await page.setViewportSize({ width: 375, height: 560 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/login');
  await expectPlaying(page);
  const scrollOut = async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(async () => {
      const bounds = await motionFrame(page).boundingBox();
      return bounds !== null && bounds.y + bounds.height <= 0;
    }, { message: 'Real scrolling moves the entire scene outside the viewport' }).toBe(true);
    await expectFrozen(page);
  };
  await scrollOut();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectPlaying(page);
  await page.getByRole('button', { name: 'หยุดภาพเคลื่อนไหว', exact: true }).click();
  await expectFrozen(page);
  await scrollOut();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectFrozen(page);
  await expect(toggle(page)).toHaveAccessibleName('เล่นภาพเคลื่อนไหว');
});

test('Simulated document visibilitychange pauses playback and preserves user intent on return', async ({ flows }) => {
  const page = await flows.page();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/login');
  await expectPlaying(page);
  const simulateVisibility = (hidden: boolean) => page.evaluate((value) => {
    // Explicit input simulation: this is not a claim that the operating system hid a real tab.
    Object.defineProperty(document, 'hidden', { configurable: true, value });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: value ? 'hidden' : 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await simulateVisibility(true);
  await expectFrozen(page);
  await simulateVisibility(false);
  await expectPlaying(page);
  await page.getByRole('button', { name: 'หยุดภาพเคลื่อนไหว', exact: true }).click();
  await simulateVisibility(true);
  await simulateVisibility(false);
  await expectFrozen(page);
});

test('Changing the real reduced-motion preference releases the MP4 source and requires a new opt-in', async ({ flows }) => {
  const page = await flows.page();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/login');
  await expectPlaying(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectPoster(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expectPoster(page);
  await expect(toggle(page)).toHaveAccessibleName('เล่นภาพเคลื่อนไหว');
});

test('An injected media error releases its source, displays the poster and disables the failed control', async ({ flows }) => {
  const page = await flows.page();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/login');
  await expectPlaying(page);
  await video(page).evaluate((element) => element.dispatchEvent(new Event('error')));
  await expect(motionFrame(page)).toHaveAttribute('data-motion-state', 'failed');
  await expectPoster(page);
  await expect(toggle(page)).toHaveAccessibleName('แสดงภาพนิ่ง');
  await expect(toggle(page)).toBeDisabled();
});

test('One simulated autoplay-policy rejection is recoverable with explicit real playback', async ({ flows }) => {
  const page = await flows.page();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const realPlay = HTMLMediaElement.prototype.play;
    let rejected = false;
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLVideoElement && !rejected) {
        rejected = true;
        Reflect.set(window, '__autoplayPolicyRejectedForTest', true);
        return Promise.reject(new DOMException('Simulated policy rejection', 'NotAllowedError'));
      }
      return realPlay.call(this);
    };
  });
  await page.goto('/login');
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__autoplayPolicyRejectedForTest') === true)).toBe(true);
  await expect(motionFrame(page)).toHaveAttribute('data-motion-state', 'paused');
  await expect(motionFrame(page)).toHaveAttribute('data-has-frames', 'false');
  await expectFrozen(page);
  await page.getByRole('button', { name: 'เล่นภาพเคลื่อนไหว', exact: true }).click();
  await expectPlaying(page);
});

test('Switching login tabs disconnects the old video, pauses it and removes its source', async ({ flows }) => {
  const page = await flows.page();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/login');
  await expectPlaying(page);
  const oldVideo = await video(page).elementHandle();
  expect(oldVideo).not.toBeNull();
  await page.getByTestId('login-tab-staff').click();
  await expect(motionFrame(page)).toHaveAttribute('data-motion-scene', 'LOGIN-STAFF');
  expect(await oldVideo!.evaluate((element: HTMLVideoElement) => ({ connected: element.isConnected, src: element.getAttribute('src'), paused: element.paused })))
    .toEqual({ connected: false, src: null, paused: true });
  await oldVideo!.dispose();
  await expectPlaying(page);
});

test('Login tabs support roving keyboard focus and a pending real ThaiD request locks its identity input', async ({ flows }) => {
  const page = await flows.page();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  const citizen = page.getByTestId('login-tab-citizen');
  const staff = page.getByTestId('login-tab-staff');
  // Soft assertions collect the complete keyboard defect while still exercising the pending guard.
  for (const step of [
    { from: citizen, key: 'ArrowRight', selected: staff, other: citizen, input: 'staff-username' },
    { from: staff, key: 'ArrowLeft', selected: citizen, other: staff, input: 'thaid-id-input' },
    { from: citizen, key: 'End', selected: staff, other: citizen, input: 'staff-username' },
    { from: staff, key: 'Home', selected: citizen, other: staff, input: 'thaid-id-input' },
  ]) {
    await step.from.press(step.key);
    await expect.soft(step.selected).toBeFocused({ timeout: 1_000 });
    await expect.soft(step.selected).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
    await expect.soft(step.selected).toHaveAttribute('tabindex', '0', { timeout: 1_000 });
    await expect.soft(step.other).toHaveAttribute('tabindex', '-1', { timeout: 1_000 });
    await expect.soft(page.getByTestId(step.input)).toBeVisible({ timeout: 1_000 });
  }
  await citizen.click();
  const identity = page.getByTestId('thaid-id-input');
  await identity.fill('1101700123456');
  let release!: () => void;
  let intercepted!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const reached = new Promise<void>((resolve) => { intercepted = resolve; });
  const endpoint = '**/api/auth/thaid/start';
  await page.route(endpoint, async (route) => {
    intercepted();
    await held;
    // No substitute body: the original request reaches the real server once after release.
    await route.continue();
  });
  const response = page.waitForResponse((reply) => new URL(reply.url()).pathname === '/api/auth/thaid/start' && reply.request().method() === 'POST');
  const clicked = page.getByTestId('thaid-submit').click();
  await reached;
  try {
    await expect(identity).toBeDisabled();
    await expect(identity).toHaveValue('1101700123456');
  } finally {
    release();
    await clicked;
    await expectReply(await response, 200, { status: 'OTP_SENT' });
    await page.unroute(endpoint);
  }
  await expect(page.getByTestId('otp-step')).toBeVisible();
  await expect(identity).toBeEnabled();
});

test('Axe detects no contrast or ARIA violations on the four rendered auth views and reports unresolved composites separately', async ({ flows }) => {
  const views = [
    { name: 'citizen login', route: '/login', actor: null },
    { name: 'staff login', route: '/login', actor: null },
    { name: 'registration', route: '/register', actor: 'mana' },
    { name: 'citizen home', route: '/citizen', actor: 'somchai' },
  ] as const;
  for (const view of views) {
    await test.step(view.name, async () => {
      await flows.reset();
      const page = view.actor ? await flows.actor(view.actor) : await flows.page();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(view.route);
      if (view.name === 'staff login') await page.getByTestId('login-tab-staff').click();
      await expect(toggle(page)).toBeEnabled();
      // Scan the real rendered backgrounds; no CSS flattening or exclusions hide contrast failures.
      // Opening the home profile also checks its now-visible account text and menu items.
      if (view.name === 'citizen home') await page.getByRole('button', { name: /^เปิดเมนูบัญชี(?:\s|$)/ }).click();
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      await test.info().attach(`axe-${view.name}`, {
        body: JSON.stringify({
          view: view.name,
          engine: result.testEngine,
          violations: result.violations,
          incomplete: result.incomplete,
          incompleteContrastNodes: result.incomplete.filter((rule) => rule.id === 'color-contrast').reduce((count, rule) => count + rule.nodes.length, 0),
          scope: 'Automated checks on these four rendered states; unresolved gradient/pseudo backgrounds require separate review and this is not a full WCAG claim.',
        }, null, 2), contentType: 'application/json',
      });
      expect.soft(result.violations, `${view.name}: actual Axe violations on the rendered UI`).toEqual([]);
    });
  }
});
