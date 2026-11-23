import type Database from 'better-sqlite3';
import { HttpError } from '../http/errors.ts';
import { requireRole, type Principal } from '../security/policy.ts';
import { readClock } from './clock.ts';
import { closedOnTime, RUNNING_STATUSES, toBangkokDate } from './sla.ts';

export interface DashboardFilters {
  period?: string;
  service?: string;
}

export interface DashboardKpis {
  received: number;
  closed: number;
  onTime: number;
  ontimePct: number | null;
  backlog: number;
  overdue: number;
}

export interface DashboardWorkload {
  username: string;
  count: number;
}

export interface DashboardReport extends DashboardKpis {
  workload: DashboardWorkload[];
}

interface DashboardCase {
  paid_at: string;
  closed_at: string | null;
  due_at: string;
  status: string;
}

export const DASHBOARD_SERVICE_IDS = ['ALL', 'SV-01', 'SV-02', 'SV-03'] as const;
export const DASHBOARD_KPI_FIELDS = [
  { key: 'received', label: 'รับเรื่อง', testId: 'kpi-received' },
  { key: 'closed', label: 'ปิดงาน', testId: 'kpi-closed' },
  { key: 'ontime', label: 'ทันกำหนด %', testId: 'kpi-ontime-pct' },
  { key: 'backlog', label: 'งานคงค้าง', testId: 'kpi-backlog' },
  { key: 'overdue', label: 'เกินกำหนดคงค้าง', testId: 'kpi-overdue' },
] as const;

const RUNNING = new Set<string>(RUNNING_STATUSES);
const PERIOD = /^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/;
const SERVICES = new Set<string>(DASHBOARD_SERVICE_IDS);

export function resolveDashboardFilters(filters: DashboardFilters, clock: string): Required<DashboardFilters> {
  const { period = toBangkokDate(clock).slice(0, 7), service = 'ALL' } = filters;
  if (!SERVICES.has(service) || (period.length !== 4 && period.length !== 7) || !PERIOD.test(period)) {
    throw new HttpError('INVALID_REQUEST');
  }
  return { period, service };
}

export function listDashboardPeriods(db: Database.Database, currentPeriod: string, selectedPeriod: string): string[] {
  const years = new Set([currentPeriod.slice(0, 4), selectedPeriod.slice(0, 4)]);
  const dates = db.prepare<[], { instant: string }>(`
    SELECT paid_at AS instant FROM cases
    UNION
    SELECT closed_at AS instant FROM cases
    WHERE status IN ('COMPLETED', 'REJECTED') AND closed_at IS NOT NULL
  `).iterate();
  for (const { instant } of dates) {
    years.add(toBangkokDate(instant).slice(0, 4));
  }
  return [...years].sort().reverse().flatMap(year => [
    ...Array.from({ length: 12 }, (_, index) => `${year}-${String(12 - index).padStart(2, '0')}`),
    year,
  ]);
}

/** Read the five KPIs and unfiltered workload from one database snapshot. */
export function readDashboard(
  db: Database.Database,
  actor: Principal | null,
  testMode: boolean,
  filters: DashboardFilters = {},
  bugs?: ReadonlySet<string>,
): DashboardReport {
  requireRole(actor, ['executive']);

  return db.transaction(() => {
    const clock = readClock(db, testMode);
    const { period, service } = resolveDashboardFilters(filters, clock);
    const now = Date.parse(clock);
    const cases = db.prepare<{ service: string }, DashboardCase>(`
      SELECT paid_at, closed_at, due_at, status
      FROM cases
      WHERE @service = 'ALL' OR service_id = @service
    `).iterate({ service });

    let received = 0;
    let closed = 0;
    let onTime = 0;
    let backlog = 0;
    let overdue = 0;
    for (const row of cases) {
      // A case row represents a successful payment, including cases later cancelled.
      if (toBangkokDate(row.paid_at).startsWith(period)) received++;
      const timely = closedOnTime(row.status, row.closed_at, row.due_at);
      if (timely !== null && row.closed_at && toBangkokDate(row.closed_at).startsWith(period)) {
        closed++;
        if (timely) onTime++;
      }

      if (row.status === 'NEED_FIX') {
        backlog++;
      } else if (RUNNING.has(row.status)) {
        backlog++;
        if (now > Date.parse(row.due_at)) overdue++;
      }
    }

    const workload = db.prepare<[], DashboardWorkload>(`
      SELECT u.username, count(c.owner) AS count
      FROM users AS u
      LEFT JOIN cases AS c ON c.owner = u.id AND c.status = 'IN_REVIEW'
      WHERE u.role = 'officer' AND u.username IS NOT NULL
      GROUP BY u.username
      ORDER BY u.username
    `).all();

    // Round the ratio of period totals to tenths of a percent, with ties up.
    const denominator = bugs?.has('B10') ? received : closed;
    const ontimePct = denominator === 0 ? null
      : Math.floor((2000 * onTime + denominator) / (2 * denominator)) / 10;
    return { received, closed, onTime, ontimePct, backlog, overdue, workload };
  })();
}

/** Use the same display values for the dashboard page and the XLSX cells. */
export function formatDashboardKpis(kpis: DashboardKpis) {
  return {
    received: String(kpis.received),
    closed: String(kpis.closed),
    ontime: kpis.ontimePct === null ? '–' : `${kpis.ontimePct.toFixed(1)}%`,
    backlog: String(kpis.backlog),
    overdue: String(kpis.overdue),
  };
}

/** Contract §7 keeps the machine-readable PDF line entirely in ASCII. */
export function formatDashboardPdfLine(kpis: DashboardKpis): string {
  const { received, closed, ontime, backlog, overdue } = formatDashboardKpis(kpis);
  const percent = kpis.ontimePct === null ? '-' : ontime;
  return `kpi received=${received} closed=${closed} ontime=${percent} backlog=${backlog} overdue=${overdue}`;
}
