import { notFound } from 'next/navigation';
import { RoleLayout } from '../../../../components/RoleLayout';
import { ServiceRequestForm } from '../../../../components/citizen/ServiceRequestForm';
import { loadServiceWizard } from '../../../../server/domain/cases';
import { pageSession } from '../../../../server/page-session';

export const dynamic = 'force-dynamic';

/**
 * `/citizen/new/:service[?draft=DR-xxxx]`: the shared three-step wizard (CONTRACT §2.5).
 * A missing, foreign or other-service draft renders 404 without revealing it.
 */
export default async function NewServicePage({ params, searchParams }: {
  params: Promise<{ service: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ service }, query] = await Promise.all([params, searchParams]);
  const { ctx, actor } = await pageSession(`/citizen/new/${encodeURIComponent(service)}`);
  if (!actor) notFound();
  const draftId = typeof query.draft === 'string' ? query.draft : undefined;
  const state = loadServiceWizard(ctx, actor, service, draftId);
  if (!state) notFound();
  const { draft } = state;
  return (
    <RoleLayout actor={actor} active="/citizen">
      <div className="content-pad">
        <ServiceRequestForm
          service={state.service}
          slots={state.slots}
          feeBugs={state.feeBugs}
          draft={draft && {
            draftId: draft.draftId,
            status: draft.status,
            fee: draft.fee,
            qty: draft.qty,
            areaSqm: draft.areaSqm,
            files: draft.files,
          }}
          payment={state.payment}
          receipt={state.receipt}
        />
      </div>
    </RoleLayout>
  );
}
