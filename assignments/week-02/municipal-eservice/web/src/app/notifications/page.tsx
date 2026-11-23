import Link from 'next/link';
import {notFound} from 'next/navigation';
import {pageSession} from '../../server/page-session';
import {RoleLayout} from '../../components/RoleLayout';
import {CivicIllustration} from '../../components/illustrations/CivicIllustration';
import {SlaLevel} from '../../components/SlaLevel';
import {countNotifications,listNotifications} from '../../server/domain/notifications';
import {formatThaiDateTime} from '../../server/domain/sla';
export const dynamic='force-dynamic';

/** CONTRACT 2.12: the signed-in officer/head's own SLA notifications (`noti-item` / `noti-empty`). */
export default async function Page(){
 const {ctx,actor}=await pageSession('/notifications');if(!actor)notFound();
 const items=listNotifications(ctx.db,actor.userId);
 return <RoleLayout actor={actor} active="/notifications" bellCount={countNotifications(ctx.db,actor.userId)}><div className="content-pad">
  <div className="page-heading"><div><span className="eyebrow">กระดิ่งแจ้งเตือน SLA</span><h1>สิ่งที่ต้องทำ</h1><p>คำขอที่ใกล้ครบกำหนดหรือเกินกำหนดในความรับผิดชอบของคุณ</p></div><CivicIllustration symbol="art-counter" size={90}/></div>
  <section className="panel" aria-label="รายการแจ้งเตือน">{items.length?<ul style={{listStyle:'none',margin:0,padding:0,display:'grid',gap:12}}>{items.map(item=><li key={item.id} data-testid="noti-item" data-case-no={item.caseNo} data-level={item.level} style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:12}}>
   <SlaLevel level={item.level} testId="noti-level"/>
   <Link prefetch={false} className="text-link" href={'/officer/cases/'+item.caseNo}>{item.text}</Link>
   <time data-iso={item.createdAt} dateTime={item.createdAt} style={{marginLeft:'auto',color:'var(--ds-color-muted)',fontSize:14}}>{formatThaiDateTime(item.createdAt)}</time>
  </li>)}</ul>:<div className="empty-state"><CivicIllustration symbol="art-folder" size={76}/><h2 data-testid="noti-empty">ไม่มีแจ้งเตือน</h2></div>}</section>
 </div></RoleLayout>;
}
