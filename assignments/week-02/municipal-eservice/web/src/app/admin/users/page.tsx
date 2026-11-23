import { notFound } from 'next/navigation';
import { AdminUserForms } from '../../../components/admin/AdminForms';
import { CivicIllustration } from '../../../components/illustrations/CivicIllustration';
import { RoleLayout } from '../../../components/RoleLayout';
import { listAdminUsers } from '../../../server/domain/admin';
import { pageSession } from '../../../server/page-session';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const path = '/admin/users';
  const { ctx, actor } = await pageSession(path);
  if (!actor) notFound();

  return (
    <RoleLayout actor={actor} active={path}>
      <div className="content-pad">
        <div className="page-heading">
          <h1>ผู้ใช้และบทบาท</h1>
          <CivicIllustration symbol="art-counter" size={90} />
        </div>
        <AdminUserForms users={listAdminUsers(ctx.db, actor)} currentUsername={actor.username} />
      </div>
    </RoleLayout>
  );
}
