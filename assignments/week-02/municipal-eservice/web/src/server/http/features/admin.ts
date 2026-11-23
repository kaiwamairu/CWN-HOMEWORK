import {
  addAdminHoliday,
  deleteAdminHoliday,
  listAdminHolidays,
  listAdminServices,
  listAdminUsers,
  updateAdminService,
  updateAdminUser,
} from '../../domain/admin.ts';
import { requireRole, type Principal } from '../../security/policy.ts';
import type { Context } from '../context.ts';
import { HttpError, json } from '../errors.ts';

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || !body || Array.isArray(body)) throw new HttpError('INVALID_REQUEST');
  return body as Record<string, unknown>;
}

function decodePathValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError('INVALID_REQUEST');
  }
}

/** Call after the shared route, method and session checks. */
export async function handleAdmin(request: Request, ctx: Context, actor: Principal | null): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const match = /^\/api\/admin\/(services|holidays|users)(?:\/([^/]+))?$/.exec(pathname);
  if (!match) return null;
  const [, collection, value] = match;
  const { method } = request;
  const admin = requireRole(actor, ['admin']);

  switch (collection) {
    case 'services':
      if (!value && method === 'GET') return json({ items: listAdminServices(ctx.db, admin) });
      if (value && method === 'PUT') return json(updateAdminService(ctx, admin, decodePathValue(value), await readBody(request)));
      break;
    case 'holidays':
      if (!value && method === 'GET') return json({ items: listAdminHolidays(ctx.db, admin) });
      if (!value && method === 'POST') return json(addAdminHoliday(ctx, admin, await readBody(request)), 201);
      if (value && method === 'DELETE') {
        deleteAdminHoliday(ctx, admin, decodePathValue(value));
        return json({ ok: true });
      }
      break;
    case 'users':
      if (!value && method === 'GET') return json({ items: listAdminUsers(ctx.db, admin) });
      if (value && method === 'PUT') return json(updateAdminUser(ctx, admin, decodePathValue(value), await readBody(request)));
      break;
  }
  throw new HttpError('METHOD_NOT_ALLOWED');
}
