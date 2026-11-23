import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CitizenHome } from '../../components/CitizenHome';
import { RoleLayout } from '../../components/RoleLayout';
import styles from '../../components/citizen/CitizenFlow.module.css';
import { CivicIllustration } from '../../components/illustrations/CivicIllustration';
import { SERVICE_NAMES } from '../../lib/roles';
import { listPendingCorrections } from '../../server/domain/cases';
import { formatThaiDateTime } from '../../server/domain/sla';
import { pageSession } from '../../server/page-session';

export const dynamic = 'force-dynamic';

/** `/citizen`: approved C home (greeting video, service cards, cases, drafts) plus the correction alert. */
export default async function CitizenPage() {
  const { ctx, actor } = await pageSession('/citizen');
  if (!actor) notFound();
  const corrections = listPendingCorrections(ctx, actor);
  return (
    <RoleLayout actor={actor} active="/citizen">
      <CitizenHome actor={actor} ctx={ctx} />
      {corrections.length > 0 && (
        <div className="content-pad">
          <section className={`panel ${styles.correctionAlert}`} aria-labelledby="corrections-title">
            <CivicIllustration symbol="art-folder" size={56} />
            <div>
              <h2 id="corrections-title">คำขอที่รอคุณแก้ไขเอกสาร</h2>
              <ul className={styles.correctionList}>
                {corrections.map(item => (
                  <li key={item.caseNo}>
                    <Link prefetch={false} className="text-link mono" href={`/citizen/cases/${item.caseNo}`}>{item.caseNo}</Link>
                    <span>{SERVICE_NAMES[item.serviceId]}</span>
                    <span>ส่งแก้ไขได้ก่อน <time dateTime={item.fixDeadline}>{formatThaiDateTime(item.fixDeadline)}</time></span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}
    </RoleLayout>
  );
}
