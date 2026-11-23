import Link from 'next/link';
import type {Principal} from '../server/security/policy';
import {navigationFor} from '../lib/roles';
import {ProfileMenu} from './ProfileMenu';
import {CivicIllustration} from './illustrations/CivicIllustration';
import {NotificationBell} from './notifications/NotificationBell';
export function RoleLayout({actor,children,active,bellCount=0}:{actor:Principal;children:React.ReactNode;active:string;bellCount?:number}){
 return <div className="role-shell"><a className="skip-link" href="#service-content">ข้ามไปเนื้อหา</a><aside className="sidebar" aria-label="เมนูบริการ"><Link href="/" className="brand" prefetch={false}><CivicIllustration symbol="art-building" size={106}/><span><strong>บ้านบริการ</strong><small>CIVIC SERVICE HOUSE</small></span></Link><div className="municipality-label">เทศบาลนครตัวอย่าง</div><nav aria-label="บริการของฉัน">{navigationFor(actor.role).map(item=>item.testId==='nav-bell'?<NotificationBell key={item.testId} count={bellCount} active={active===item.href}/>:<Link key={item.testId} href={item.href} prefetch={false} data-testid={item.testId} aria-current={active===item.href?'page':undefined} className={'nav-item'+(active===item.href?' active':'')}><svg width="21" height="21" aria-hidden="true"><use href={'/illustrations/civic-illustrations.svg#'+(item.icon==='stamp'?'art-stamp':item.icon==='folder'?'art-folder':item.icon==='person'?'art-person':item.icon==='calendar'?'ui-file':'ui-'+item.icon)}/></svg><span>{item.label}</span></Link>)}</nav><p className="sidebar-note">ทุกคำขอ มีคนดูแล<br/>บริการใกล้บ้าน ติดตามได้ทุกขั้น</p><ProfileMenu actor={actor}/></aside><main className="role-content" id="service-content">{children}</main></div>;
}
