import { notFound } from 'next/navigation';
import { AuditTable } from '../../components/audit/AuditTable';
import { CivicIllustration } from '../../components/illustrations/CivicIllustration';
import { RoleLayout } from '../../components/RoleLayout';
import { AUDIT_EVENTS, listAudit } from '../../server/domain/audit';
import { HttpError } from '../../server/http/errors';
import { pageSession } from '../../server/page-session';

export const dynamic = 'force-dynamic';

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ctx, actor } = await pageSession('/audit');
  if (!actor) notFound();

  const query = await searchParams;
  const filters = {
    actor: first(query.actor),
    event: first(query.event),
    from: first(query.from),
    to: first(query.to),
  };
  const { count, items } = (() => {
    try {
      return listAudit(ctx.db, actor, filters);
    } catch (error) {
      if (error instanceof HttpError && error.code === 'INVALID_REQUEST') notFound();
      throw error;
    }
  })();
  const filterQuery = new URLSearchParams(filters).toString();

  return (
    <RoleLayout actor={actor} active="/audit">
      <div className="content-pad">
        <div className="page-heading">
          <h1>ประวัติการดำเนินงาน</h1>
          <CivicIllustration symbol="art-folder" size={90} />
        </div>
        <section className="panel" aria-label="ตัวกรองประวัติการดำเนินงาน">
          <form action="/audit" method="get" key={filterQuery}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))', gap: '0 16px' }}>
              <label className="field">
                ผู้ทำรายการ
                <input type="text" name="actor" data-testid="audit-filter-actor" defaultValue={filters.actor} />
              </label>
              <label className="field">
                เหตุการณ์
                <select name="event" data-testid="audit-filter-event" defaultValue={filters.event} style={{
                  display: 'block', width: '100%', minHeight: 48, marginTop: 8, padding: '0 14px', fontWeight: 400,
                  background: 'var(--ds-color-control)', border: '1px solid var(--ds-color-border)',
                  borderRadius: 'var(--ds-radius-control)',
                }}>
                  <option value="">ทั้งหมด</option>
                  {AUDIT_EVENTS.map(event => <option key={event} value={event}>{event}</option>)}
                </select>
              </label>
              <label className="field">
                วันที่เริ่มต้น
                <input type="date" name="from" data-testid="audit-filter-from" defaultValue={filters.from} />
              </label>
              <label className="field">
                วันที่สิ้นสุด
                <input type="date" name="to" data-testid="audit-filter-to" defaultValue={filters.to} />
              </label>
            </div>
            <button className="button primary" type="submit" data-testid="audit-apply-btn" style={{ marginTop: 16 }}>ค้นหา</button>
          </form>
        </section>
        <section className="panel" aria-label="รายการประวัติการดำเนินงาน">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p>พบ <strong data-testid="audit-count">{count}</strong> รายการ</p>
            <a className="button secondary" data-testid="audit-export-csv-btn" href={`/api/audit/export.csv?${filterQuery}`}>
              ส่งออก CSV
            </a>
          </div>
          <AuditTable items={items} />
        </section>
      </div>
    </RoleLayout>
  );
}
