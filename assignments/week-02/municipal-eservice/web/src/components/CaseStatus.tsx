import {CASE_STATUS_LABELS} from '../server/domain/sla';

/** CONTRACT 4.1 status pill: Thai text + `data-status` code (text and colour, WCAG 1.4.1). */
export function CaseStatus({status,testId='case-status'}:{status:string;testId?:string}){
 return <span className={'status-pill status-'+status} data-testid={testId} data-status={status}>{CASE_STATUS_LABELS[status]??status}</span>;
}
