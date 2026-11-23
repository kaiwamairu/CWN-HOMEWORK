import {SLA_LEVEL_LABELS,formatThaiDateTime,type SlaLevel as Level} from '../server/domain/sla';

const tones:Record<Level,{color:string;background:string}>={
 normal:{color:'var(--ds-color-success)',background:'var(--ds-color-success-surface)'},
 near:{color:'var(--ds-color-warning)',background:'var(--ds-color-warning-surface)'},
 overdue:{color:'var(--ds-color-danger)',background:'var(--ds-color-danger-surface)'},
 // B14 local contrast correction (tokens unchanged): info 4.4:1 and muted 4.2:1 fail axe on these surfaces.
 paused:{color:'#466553',background:'var(--ds-color-info-surface)'},
 closed:{color:'#5e684e',background:'var(--ds-color-paper)'}
};

/** CONTRACT 4.2 badge: exact Thai text only inside the testid element + `data-level` code. */
export function SlaLevel({level,testId='sla-level'}:{level:Level;testId?:string}){
 return <span className={'status-pill sla-'+level} style={tones[level]} data-testid={testId} data-level={level}>{SLA_LEVEL_LABELS[level]}</span>;
}

/** `sla-due` / `row-due`: `4 ธ.ค. 2569 16:30` with `data-iso` (A-04, A-51). */
export function SlaDue({dueAt,testId='sla-due'}:{dueAt:string;testId?:string}){
 return <time data-testid={testId} data-iso={dueAt} dateTime={dueAt}>{formatThaiDateTime(dueAt)}</time>;
}
