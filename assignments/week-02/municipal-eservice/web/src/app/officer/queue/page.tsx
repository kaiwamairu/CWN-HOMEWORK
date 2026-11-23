import { notFound } from 'next/navigation';
import { CaseStatus } from '../../../components/CaseStatus';
import { RoleLayout } from '../../../components/RoleLayout';
import { SlaDue, SlaLevel } from '../../../components/SlaLevel';
import { CivicIllustration } from '../../../components/illustrations/CivicIllustration';
import { QueueTable } from '../../../components/officer/QueueTable';
import { listQueue } from '../../../server/domain/claims';
import { countNotifications } from '../../../server/domain/notifications';
import { pageSession } from '../../../server/page-session';

export const dynamic = 'force-dynamic';

const PATH = '/officer/queue';

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const { ctx, actor } = await pageSession(PATH);
  if (!actor) notFound();
  const { filter: queryFilter } = await searchParams;
  const { items, filter, workloadCount } = listQueue(ctx, actor, Array.isArray(queryFilter) ? queryFilter[0] : queryFilter);
  const department = actor.role === 'head' ? 'ทุกแผนก' : actor.dept === 'registry' ? 'ฝ่ายทะเบียน' : 'ฝ่ายโยธา';
  const rows = items.map(({ dueAt, step: _step, ...item }) => ({
    ...item,
    statusBadge: <CaseStatus status={item.status} testId="row-status" />,
    dueTime: <SlaDue dueAt={dueAt} testId="row-due" />,
    slaBadge: <SlaLevel level={item.slaLevel} testId="row-sla-level" />,
  }));

  return (
    <RoleLayout actor={actor} active={PATH} bellCount={countNotifications(ctx.db, actor.userId)}>
      <div className="content-pad">
        <div className="page-heading">
          <div>
            <h1 id="queue-heading">คิวงาน</h1>
            <p>{department}</p>
          </div>
          <CivicIllustration symbol="art-folder" size={90} />
        </div>
        <QueueTable rows={rows} filter={filter} workloadCount={workloadCount} />
      </div>
    </RoleLayout>
  );
}
