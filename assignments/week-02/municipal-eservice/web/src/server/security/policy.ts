import { HttpError } from '../http/errors.ts';
export interface Principal{userId:string;username:string;name:string;role:string;dept:string|null;registrationOnly:boolean}
export interface CaseResource{applicant:string;current_dept?:string|null}
export function requireRole(actor:Principal|null,roles:readonly string[],allowRegistration=false):Principal{
 if(!actor)throw new HttpError('UNAUTHENTICATED');
 if(!roles.includes(actor.role)||(!allowRegistration&&actor.registrationOnly))throw new HttpError('FORBIDDEN');return actor;
}
export function authorizeCase(actor:Principal|null,resource:CaseResource|undefined):Principal{
 const user=requireRole(actor,['citizen','officer','head']);if(!resource||(user.role==='citizen'&&resource.applicant!==user.userId))throw new HttpError('NOT_FOUND');return user;
}
export function authorizeDraft(actor:Principal|null,resource:{applicant:string}|undefined):Principal{
 const user=requireRole(actor,['citizen']);if(!resource||resource.applicant!==user.userId)throw new HttpError('NOT_FOUND');return user;
}
export function authorizeAttachment(actor:Principal|null,resource:CaseResource|undefined,enteredDepartments:readonly string[]):Principal{
 const user=authorizeCase(actor,resource);if(user.role==='officer'&&(!user.dept||!enteredDepartments.includes(user.dept)))throw new HttpError('FORBIDDEN');return user;
}
export function authorizeClaim(actor:Principal|null,resource:CaseResource|undefined):Principal{
 const user=requireRole(actor,['officer']);if(!resource)throw new HttpError('NOT_FOUND');if(user.dept!==resource.current_dept)throw new HttpError('FORBIDDEN');return user;
}
export function authorizeDocument(actor:Principal|null,resource:CaseResource|undefined):Principal{
 const user=requireRole(actor,['citizen','officer','head','executive','auditor','admin']);if(!['citizen','officer','head'].includes(user.role)||!resource||(user.role==='citizen'&&resource.applicant!==user.userId))throw new HttpError('NOT_FOUND');return user;
}
