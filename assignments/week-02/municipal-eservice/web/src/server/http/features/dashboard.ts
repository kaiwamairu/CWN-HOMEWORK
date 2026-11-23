import { immediate } from '../../db/connection.ts';
import { appendAudit } from '../../domain/audit.ts';
import { readClock } from '../../domain/clock.ts';
import { readDashboard, resolveDashboardFilters } from '../../domain/dashboard.ts';
import { renderDashboardPdf } from '../../output/dashboard-pdf.ts';
import { renderDashboardXlsx } from '../../output/xlsx.ts';
import { requireRole, type Principal } from '../../security/policy.ts';
import type { Context } from '../context.ts';
import { HttpError, json } from '../errors.ts';

const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const;

export async function handleDashboard(
  request: Request,
  ctx: Context,
  actor: Principal | null,
): Promise<Response | null> {
  const { pathname, searchParams } = new URL(request.url);
  if (pathname !== '/api/dashboard' && pathname !== '/api/dashboard/export') return null;
  if (request.method !== 'GET') throw new HttpError('METHOD_NOT_ALLOWED');
  const executive = requireRole(actor, ['executive']);
  const filters = {
    period: searchParams.get('period') ?? undefined,
    service: searchParams.get('service') ?? undefined,
  };
  const { db, testMode, bugModes } = ctx;

  if (pathname === '/api/dashboard') {
    return json(readDashboard(db, executive, testMode, filters, bugModes));
  }

  const format = searchParams.get('format');
  if (format !== 'xlsx' && format !== 'pdf') throw new HttpError('INVALID_REQUEST');
  const { clock, period, service, report } = db.transaction(() => {
    const clock = readClock(db, testMode);
    const selection = resolveDashboardFilters(filters, clock);
    const report = readDashboard(db, executive, testMode, selection, bugModes);
    return { clock, ...selection, report };
  })();
  const bytes = format === 'xlsx' ? await renderDashboardXlsx(report) : renderDashboardPdf(report);
  const response = new Response(new Uint8Array(bytes), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': CONTENT_TYPES[format],
      'Content-Disposition': `attachment; filename="dashboard-${period}-${service}.${format}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
  immediate(db, () => {
    appendAudit(db, {
      time: clock,
      username: executive.username,
      role: executive.role,
      event: 'EXPORT',
      detail: `${format} ${period} ${service}`,
    });
  });
  return response;
}
