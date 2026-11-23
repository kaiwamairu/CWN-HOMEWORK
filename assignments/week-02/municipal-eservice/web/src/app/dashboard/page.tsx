import { notFound } from 'next/navigation';
import { RoleLayout } from '../../components/RoleLayout';
import { CivicIllustration } from '../../components/illustrations/CivicIllustration';
import { DashboardFilters } from '../../components/dashboard/DashboardFilters';
import styles from '../../components/dashboard/Dashboard.module.css';
import { SERVICE_NAMES } from '../../lib/roles';
import { readClock } from '../../server/domain/clock';
import {
  DASHBOARD_KPI_FIELDS,
  DASHBOARD_SERVICE_IDS,
  formatDashboardKpis,
  listDashboardPeriods,
  readDashboard,
  resolveDashboardFilters,
} from '../../server/domain/dashboard';
import { HttpError } from '../../server/http/errors';
import { pageSession } from '../../server/page-session';

export const dynamic = 'force-dynamic';

const monthLabel = new Intl.DateTimeFormat('th-TH', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});
const services = DASHBOARD_SERVICE_IDS.map(value => ({
  value,
  label: value === 'ALL' ? 'ทุกบริการ' : SERVICE_NAMES[value],
}));

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function periodLabel(period: string) {
  return period.length === 4
    ? `ทั้งปี ${Number(period) + 543}`
    : monthLabel.format(new Date(`${period}-01T00:00:00+07:00`));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ctx, actor } = await pageSession('/dashboard');
  if (!actor) notFound();
  const query = await searchParams;
  const { db, testMode, bugModes } = ctx;
  const snapshot = db.transaction(() => {
    const clock = readClock(db, testMode);
    const current = resolveDashboardFilters({}, clock);
    const selection = resolveDashboardFilters({ period: first(query.period), service: first(query.service) }, clock);
    const report = readDashboard(db, actor, testMode, selection, bugModes);
    const periods = listDashboardPeriods(db, current.period, selection.period)
      .map(value => ({ value, label: periodLabel(value) }));
    return { selection, report, periods };
  });

  const { selection, report, periods } = (() => {
    try {
      return snapshot();
    } catch (error) {
      if (error instanceof HttpError && error.code === 'INVALID_REQUEST') notFound();
      throw error;
    }
  })();
  const kpis = formatDashboardKpis(report);

  return (
    <RoleLayout actor={actor} active="/dashboard">
      <div className="content-pad">
        <div className="page-heading">
          <h1>ภาพรวมบริการเทศบาล</h1>
          <CivicIllustration symbol="art-building" size={90} />
        </div>
        <section className="panel" aria-label="ตัวชี้วัดบริการ">
          <DashboardFilters selection={selection} periods={periods} services={services} />
          <dl className={styles.kpis} aria-live="polite">
            {DASHBOARD_KPI_FIELDS.map(({ key, label, testId }) => (
              <div key={key} className={styles.kpi}>
                <dt>{label}</dt>
                <dd data-testid={testId}>{kpis[key]}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="panel" aria-labelledby="dashboard-workload">
          <h2 id="dashboard-workload">งานในมือรายเจ้าหน้าที่</h2>
          {report.workload.length ? (
            <table className={styles.workload} aria-labelledby="dashboard-workload">
              <thead><tr><th scope="col">เจ้าหน้าที่</th><th scope="col">จำนวนเรื่อง</th></tr></thead>
              <tbody>
                {report.workload.map(({ username, count }) => (
                  <tr key={username} data-testid="workload-row" data-username={username}>
                    <th scope="row">{username}</th>
                    <td data-testid="workload-value">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>ไม่มีรายการเจ้าหน้าที่</p>}
        </section>
      </div>
    </RoleLayout>
  );
}
