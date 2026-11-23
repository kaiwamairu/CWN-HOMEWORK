import Link from 'next/link';

/**
 * `nav-bell` + `bell-count` for officer/head (CONTRACT 2.1). B14 renders this in RoleLayout
 * in place of the generic nav entry; pass countNotifications(db, actor.userId).
 */
export function NotificationBell({count,active=false}:{count:number;active?:boolean}){
 return <Link href="/notifications" prefetch={false} data-testid="nav-bell" aria-current={active?'page':undefined} className={'nav-item'+(active?' active':'')}>
  <svg width="21" height="21" aria-hidden="true"><use href="/illustrations/civic-illustrations.svg#ui-bell"/></svg>
  <span>สิ่งที่ต้องทำ</span>
  <span className="bell-badge" data-testid="bell-count">{count}</span>
 </Link>;
}
