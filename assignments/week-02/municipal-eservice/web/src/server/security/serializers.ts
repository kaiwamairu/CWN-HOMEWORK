import type { Principal } from './policy.ts';
import { maskIdentity } from './crypto.ts';
export interface CaseRow{case_no:string;service_id:string;status:string;step:number|null;locked_fee:number;paid_at:string;due_at:string;owner:string|null;return_count:number;closed_at:string|null;fix_deadline:string|null}
export function serializeCase(actor:Principal,row:CaseRow,applicant:{name:string;id_last3:string},options:{slaLevel:string;idNo?:string;docNo?:string|null;verifyCode?:string|null}){
 const common={caseNo:row.case_no,serviceId:row.service_id,status:row.status,step:row.step,fee:row.locked_fee,paidAt:row.paid_at,dueAt:row.due_at,slaLevel:options.slaLevel,owner:row.owner,returnCount:row.return_count,closedAt:row.closed_at,applicantName:applicant.name,fixDeadline:row.fix_deadline,docNo:options.docNo??null,verifyCode:options.verifyCode??null};
 if(actor.role==='citizen')return {...common,idNo:options.idNo};return {...common,idMasked:maskIdentity(applicant.id_last3)};
}
export function maskName(name:string):string{
 const [given,...surname]=name.trim().split(/\s+/);return `${given} ${surname.length?Array.from(surname.join(' '))[0]:''}***`;
}
