import { test, expect, expectReply } from './auth-helpers.js';

test('TC-RBAC-03 ตารางสิทธิ์หน้า/API ตามบทบาท', async ({ flows }) => {
  test.setTimeout(180_000);
  const roles = ['anon', 'citizen', 'officer', 'head', 'executive', 'auditor', 'admin'] as const;
  type Role = (typeof roles)[number];
  const accounts = { citizen: 'somchai', officer: 'off.reg1', head: 'head1', executive: 'exec1', auditor: 'audit1', admin: 'admin1' } as const;
  const pages: Array<{ path: string; allowed: readonly Role[] }> = [
    { path: '/citizen', allowed: ['citizen'] },
    { path: '/officer/queue', allowed: ['officer', 'head'] },
    { path: '/head/approvals', allowed: ['head'] },
    { path: '/dashboard', allowed: ['executive'] },
    { path: '/audit', allowed: ['auditor'] },
    { path: '/admin/services', allowed: ['admin'] },
    { path: '/admin/holidays', allowed: ['admin'] },
    { path: '/admin/users', allowed: ['admin'] },
    { path: '/notifications', allowed: ['officer', 'head'] },
    { path: '/verify/K7M2Q9XA', allowed: roles },
  ];
  const navs = ['nav-my-cases', 'nav-queue', 'nav-bell', 'nav-approvals', 'nav-dashboard', 'nav-audit', 'nav-admin-services', 'nav-admin-holidays', 'nav-admin-users'];
  const menus: Record<Role, string[]> = {
    anon: [], citizen: ['nav-my-cases'], officer: ['nav-queue', 'nav-bell'], head: ['nav-queue', 'nav-approvals', 'nav-bell'],
    executive: ['nav-dashboard'], auditor: ['nav-audit'], admin: ['nav-admin-services', 'nav-admin-holidays', 'nav-admin-users'],
  };
  const apis = [
    { path: '/api/officer/queue', method: 'GET', statuses: [401, 403, 200, 200, 403, 403, 403] },
    { path: '/api/notifications', method: 'GET', statuses: [401, 403, 200, 200, 403, 403, 403] },
    { path: '/api/dashboard?period=2026-12&service=ALL', method: 'GET', statuses: [401, 403, 403, 403, 200, 403, 403] },
    { path: '/api/audit', method: 'GET', statuses: [401, 403, 403, 403, 403, 200, 403] },
    { path: '/api/admin/services', method: 'GET', statuses: [401, 403, 403, 403, 403, 403, 200] },
    { path: '/api/drafts', method: 'POST', statuses: [401, 201, 403, 403, 403, 403, 403] },
    { path: '/api/cases/EG-2569-000025', method: 'GET', statuses: [401, 200, 200, 200, 403, 403, 403] },
    // This mutating row must stay last, after the role's fresh RESET.
    { path: '/api/officer/cases/EG-2569-000028/claim', method: 'POST', statuses: [401, 403, 200, 403, 403, 403, 403] },
  ] as const;

  for (const [roleIndex, role] of roles.entries()) {
    await test.step(`${role}: RESET, full page/API matrix and exact navigation`, async () => {
      await flows.reset();
      const page = role === 'anon' ? await flows.page() : await flows.actor(accounts[role]);
      for (const entry of pages) {
        const response = await page.goto(entry.path);
        expect(response, `${role} ${entry.path} must return an HTTP response`).not.toBeNull();
        if (role === 'anon' && entry.path !== '/verify/K7M2Q9XA') {
          await expect(page).toHaveURL(/\/login$/);
        } else if (entry.allowed.includes(role)) {
          expect(response!.status(), `${role} ${entry.path}`).toBe(200);
          await expect(page).toHaveURL(new RegExp(`${entry.path}$`));
        } else {
          expect(response!.status(), `${role} ${entry.path}`).toBe(403);
          await expect(page.getByTestId('forbidden-msg')).toHaveText('ไม่มีสิทธิ์เข้าถึงหน้านี้');
        }
      }
      if (role !== 'anon') {
        const landing = { citizen: '/citizen', officer: '/officer/queue', head: '/head/approvals', executive: '/dashboard', auditor: '/audit', admin: '/admin/services' }[role];
        await page.goto(landing);
        for (const nav of navs) {
          if (menus[role].includes(nav)) await expect(page.getByTestId(nav)).toBeVisible();
          else await expect(page.getByTestId(nav)).toHaveCount(0);
        }
      }

      for (const entry of apis) {
        // The source explicitly switches this row's citizen representative to the owner, สมหญิง.
        const actorPage = role === 'citizen' && entry.path === '/api/cases/EG-2569-000025' ? await flows.actor('somying') : page;
        const api = actorPage.context().request;
        const response = entry.method === 'GET' ? await api.get(entry.path) : await api.post(entry.path,
          entry.path === '/api/drafts' ? { data: { serviceId: 'SV-01', qty: 1 } } : {});
        const status = entry.statuses[roleIndex]!;
        await expectReply(response, status);
        if (status === 401) expect(await response.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' });
        if (status === 403) expect(await response.json()).toEqual({ code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์ทำรายการนี้' });
        if (entry.path.endsWith('/claim') && status === 200) expect(await response.json()).toEqual({ owner: 'off.reg1' });
      }
    });
  }

  await test.step('C: RESET and enforce both department boundaries with a positive works queue', async () => {
    await flows.reset();
    const works = await flows.actor('off.works1');
    const registry = await flows.actor('off.reg1');
    await expectReply(await works.context().request.post('/api/officer/cases/EG-2569-000028/claim'), 403,
      { code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์ทำรายการนี้' });
    await expectReply(await registry.context().request.post('/api/officer/cases/EG-2569-000010/claim'), 403,
      { code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์ทำรายการนี้' });
    const response = await works.context().request.get('/api/officer/queue');
    await expectReply(response, 200);
    const queue = await response.json() as { items: Array<{ caseNo: string }> };
    expect(queue.items.map((item) => item.caseNo)).toEqual(['EG-2569-000010']);
    await works.goto('/officer/queue');
    await expect(works.getByTestId('queue-row')).toHaveCount(1);
    await expect(works.getByTestId('queue-row')).toHaveAttribute('data-case-no', 'EG-2569-000010');
  });
});
