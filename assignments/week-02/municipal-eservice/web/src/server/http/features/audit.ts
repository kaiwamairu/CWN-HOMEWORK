import { exportAuditCsv, listAudit, type AuditFilters } from '../../domain/audit.ts';
import type { Principal } from '../../security/policy.ts';
import type { Context } from '../context.ts';
import { HttpError, json } from '../errors.ts';

export function handleAudit(request: Request, ctx: Context, actor: Principal | null): Response | null {
  const { pathname, searchParams } = new URL(request.url);
  const isList = pathname === '/api/audit';
  const isExport = pathname === '/api/audit/export.csv';

  if (/^\/api\/audit\/[^/]+$/.test(pathname) && ['PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    throw new HttpError('METHOD_NOT_ALLOWED');
  }
  if (!isList && !isExport) return null;
  if (request.method !== 'GET') throw new HttpError('METHOD_NOT_ALLOWED');

  const filters: AuditFilters = {
    actor: searchParams.get('actor') ?? undefined,
    event: searchParams.get('event') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  };
  if (isList) return json(listAudit(ctx.db, actor, filters));

  const csv = exportAuditCsv(ctx.db, actor, ctx.testMode, filters);
  return new Response(csv, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="audit.csv"',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
