import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RoleLayout } from '../../../components/RoleLayout';
import { SlaDue, SlaLevel } from '../../../components/SlaLevel';
import { CivicIllustration } from '../../../components/illustrations/CivicIllustration';
import styles from '../../../components/officer/QueueTable.module.css';
import { SERVICE_NAMES } from '../../../lib/roles';
import { listPendingApprovals } from '../../../server/domain/approvals';
import { countNotifications } from '../../../server/domain/notifications';
import { STEP_LABELS } from '../../../server/domain/review';
import { slaView } from '../../../server/domain/sla';
import { pageSession } from '../../../server/page-session';

export const dynamic = 'force-dynamic';

const PATH = '/head/approvals';
const COLUMNS = ['เลขคำขอ', 'บริการ', 'ผู้ยื่น', 'กำหนดเสร็จ', 'ระดับ SLA', 'ดำเนินการ'];

/** CONTRACT 2.8: every PENDING_APPROVAL case for the head, ordered by BR-16. */
export default async function HeadApprovalsPage() {
  const { ctx, actor } = await pageSession(PATH);
  if (!actor) notFound();
  const rows = listPendingApprovals(ctx.db, actor);
  const sla = slaView(ctx.db, ctx.testMode, ctx.bugModes);

  return (
    <RoleLayout actor={actor} active={PATH} bellCount={countNotifications(ctx.db, actor.userId)}>
      <div className="content-pad">
        <div className="page-heading">
          <div>
            <span className="eyebrow">หัวหน้าฝ่าย</span>
            <h1 id="approvals-heading">รายการรออนุมัติ</h1>
            <p>คำขอที่ผ่านการตรวจของแผนกแล้ว รอผลพิจารณา</p>
          </div>
          <CivicIllustration symbol="art-stamp" size={90} />
        </div>
        <section className="panel" aria-labelledby="approvals-heading">
          {rows.length === 0 ? (
            <p className="empty-state" data-testid="approvals-empty">ไม่มีคำขอรออนุมัติ</p>
          ) : (
            <div className={styles.tableRegion} role="region" aria-label="ตารางรายการรออนุมัติ" tabIndex={0}>
              <table className={styles.table}>
                <thead>
                  <tr>{COLUMNS.map(label => <th key={label} scope="col">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.caseNo} data-testid="approval-row" data-case-no={row.caseNo}>
                      <th scope="row" data-testid="row-case-no" className="mono">{row.caseNo}</th>
                      <td data-testid="row-service" className={styles.service}>
                        {SERVICE_NAMES[row.serviceId] ?? row.serviceId}
                        {row.step ? <><br /><small>{STEP_LABELS[row.step]}</small></> : null}
                      </td>
                      <td data-testid="row-applicant">{row.applicantName}</td>
                      <td><SlaDue dueAt={row.dueAt} testId="row-due" /></td>
                      <td><SlaLevel level={sla.level({ due_at: row.dueAt, status: 'PENDING_APPROVAL' })} testId="row-sla-level" /></td>
                      <td>
                        <Link
                          className="button primary"
                          data-testid="approval-open"
                          prefetch={false}
                          href={`/officer/cases/${encodeURIComponent(row.caseNo)}`}
                          aria-label={`เปิดคำขอ ${row.caseNo}`}
                        >
                          เปิดคำขอ
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </RoleLayout>
  );
}
