import { notFound } from 'next/navigation';
import { AdminServiceForms } from '../../../components/admin/AdminForms';
import { CivicIllustration } from '../../../components/illustrations/CivicIllustration';
import { RoleLayout } from '../../../components/RoleLayout';
import { listAdminServices } from '../../../server/domain/admin';
import { pageSession } from '../../../server/page-session';

export const dynamic = 'force-dynamic';

export default async function AdminServicesPage() {
  const path = '/admin/services';
  const { ctx, actor } = await pageSession(path);
  if (!actor) notFound();

  return (
    <RoleLayout actor={actor} active={path}>
      <div className="content-pad">
        <div className="page-heading">
          <h1>จัดการบริการ</h1>
          <CivicIllustration symbol="art-coins" size={90} />
        </div>
        <AdminServiceForms services={listAdminServices(ctx.db, actor)} />
      </div>
    </RoleLayout>
  );
}
