import { notFound } from 'next/navigation';
import { AdminHolidayForms } from '../../../components/admin/AdminForms';
import { CivicIllustration } from '../../../components/illustrations/CivicIllustration';
import { RoleLayout } from '../../../components/RoleLayout';
import { listAdminHolidays } from '../../../server/domain/admin';
import { pageSession } from '../../../server/page-session';

export const dynamic = 'force-dynamic';

export default async function AdminHolidaysPage() {
  const path = '/admin/holidays';
  const { ctx, actor } = await pageSession(path);
  if (!actor) notFound();

  return (
    <RoleLayout actor={actor} active={path}>
      <div className="content-pad">
        <div className="page-heading">
          <h1>จัดการวันหยุด</h1>
          <CivicIllustration symbol="art-building" size={90} />
        </div>
        <AdminHolidayForms holidays={listAdminHolidays(ctx.db, actor)} />
      </div>
    </RoleLayout>
  );
}
