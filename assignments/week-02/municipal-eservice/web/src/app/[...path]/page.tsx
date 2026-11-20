import {notFound} from 'next/navigation';
import Link from 'next/link';
import {pageSession} from '../../server/page-session';
import {RoleLayout} from '../../components/RoleLayout';
import {CitizenHome} from '../../components/CitizenHome';
import {CivicIllustration} from '../../components/illustrations/CivicIllustration';
import {EntryLayout} from '../../components/EntryLayout';
import {dispatch} from '../../server/http/router';
import {SERVICE_NAMES,STATUS_LABELS,formatThai} from '../../lib/roles';
export const dynamic='force-dynamic';
const titles:Record<string,[string,'art-building'|'art-folder'|'art-stamp'|'art-counter'|'art-coins']>={'/officer/queue':['คิวงาน','art-folder'],'/head/approvals':['รายการรออนุมัติ','art-stamp'],'/dashboard':['ภาพรวมบริการเทศบาล','art-building'],'/audit':['ประวัติการดำเนินงาน','art-folder'],'/admin/services':['จัดการบริการ','art-coins'],'/admin/holidays':['จัดการวันหยุด','art-building'],'/admin/users':['ผู้ใช้และบทบาท','art-counter'],'/notifications':['สิ่งที่ต้องทำ','art-folder']};
export default async function Page({params}:{params:Promise<{path:string[]}>}){
 const {path:parts}=await params,path='/'+parts.join('/');const {ctx,actor}=await pageSession(path);
 if(parts[0]==='verify'&&parts.length===2){
 const response=await dispatch(new Request('http://127.0.0.1/api/verify/'+encodeURIComponent(parts[1])),ctx);
 const result=await response.json() as {result:string;docNo?:string;applicantMasked?:string;serviceId?:string;issuedAt?:string;validUntil?:string;signer?:string};if(response.status===404)notFound();
 const text=result.result==='VALID'?'เอกสารถูกต้อง':result.result==='EXPIRED'?'เอกสารหมดอายุ':'ลายเซ็นไม่ถูกต้อง';
 return <EntryLayout scene="3A" heading={'ตรวจสอบเอกสาร\nได้อย่างมั่นใจ'} copy={'ตรวจสอบสถานะหนังสือและเอกสาร\nที่ออกโดยเทศบาลนครตัวอย่าง'}><div className="form-intro"><span className="eyebrow">ตรวจสอบเอกสารสาธารณะ</span><h2>ผลตรวจสอบเอกสาร</h2></div><div className={'verify-state '+(result.result==='VALID'?'success':'warning')}><CivicIllustration symbol="art-certificate" size={96}/><h3 data-testid="verify-result" data-result={result.result}>{text}</h3></div>{result.result!=='TAMPERED'&&<dl className="document-facts"><div><dt>เลขเอกสาร</dt><dd data-testid="verify-doc-no">{result.docNo}</dd></div><div><dt>ผู้ยื่น</dt><dd data-testid="verify-applicant">{result.applicantMasked}</dd></div><div><dt>บริการ</dt><dd>{SERVICE_NAMES[result.serviceId??'']}</dd></div><div><dt>วันออกเอกสาร</dt><dd>{result.issuedAt&&formatThai(result.issuedAt)}</dd></div><div><dt>ใช้ได้ถึง</dt><dd>{result.validUntil}</dd></div><div><dt>ผู้ลงนาม</dt><dd>{result.signer}</dd></div></dl>}<Link href="/login" className="button secondary">กลับสู่บ้านบริการ</Link></EntryLayout>;
 }
 if(!actor)notFound();const bellCount=['officer','head'].includes(actor.role)?(ctx.db.prepare('SELECT count(*) AS n FROM notifications WHERE recipient=?').get(actor.userId) as {n:number}).n:0;
 if(path==='/citizen')return <RoleLayout actor={actor} active={path} bellCount={bellCount}><CitizenHome actor={actor} ctx={ctx}/></RoleLayout>;
 const detail=/^\/(citizen|officer)\/cases\/([^/]+)$/.exec(path);
 if(detail){const c=ctx.db.prepare('SELECT case_no,service_id,status,due_at,locked_fee FROM cases WHERE case_no=?').get(detail[2]) as {case_no:string;service_id:string;status:string;due_at:string;locked_fee:number}|undefined;if(!c)notFound();return <RoleLayout actor={actor} active={detail[1]==='citizen'?'/citizen':'/officer/queue'} bellCount={bellCount}><div className="content-pad"><div className="page-heading"><div><span className="eyebrow">รายละเอียดคำขอ</span><h1 data-testid="case-no">{c.case_no}</h1><p data-testid="case-service">{c.service_id} {SERVICE_NAMES[c.service_id]}</p></div><CivicIllustration symbol="art-folder" size={92}/></div><section className="panel"><span className="status-pill" data-testid="case-status" data-status={c.status}>{STATUS_LABELS[c.status]}</span><dl className="document-facts"><div><dt>กำหนดเสร็จ</dt><dd><time data-testid="sla-due" data-iso={c.due_at}>{formatThai(c.due_at)}</time></dd></div><div><dt>ค่าธรรมเนียม</dt><dd>฿{c.locked_fee.toLocaleString('en-US')}</dd></div></dl><Link className="button secondary" href={detail[1]==='citizen'?'/citizen':'/officer/queue'}>กลับรายการคำขอ</Link></section></div></RoleLayout>;}
 const service=/^\/citizen\/new\/(SV-0[123])$/.exec(path);const info=titles[path]??(service?[SERVICE_NAMES[service[1]],'art-folder'] as const:undefined);if(!info)notFound();
 return <RoleLayout actor={actor} active={service?'/citizen':path} bellCount={bellCount}><div className="content-pad"><div className="page-heading"><div><span className="eyebrow">เทศบาลนครตัวอย่าง · e-Service</span><h1>{info[0]}</h1><p>พื้นที่บริการของคุณ</p></div><CivicIllustration symbol={info[1]} size={90}/></div><section className="panel empty-state"><CivicIllustration symbol={info[1]} size={96}/><h2>กำลังเตรียมบริการ</h2><p>คุณเข้าสู่ระบบเรียบร้อยแล้ว<br/>พื้นที่นี้จะเปิดให้ดำเนินการในขั้นตอนถัดไป</p>{service&&<Link href="/citizen" className="button secondary">กลับหน้าหลัก</Link>}</section></div></RoleLayout>;
}
