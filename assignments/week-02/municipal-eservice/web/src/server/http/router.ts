import { createHmac,timingSafeEqual } from 'node:crypto';
import type { Context } from './context.ts';
import { HttpError,json,errorResponse } from './errors.ts';
import { testHooks } from './test-hooks.ts';
import { requireRole,authorizeCase,authorizeAttachment,authorizeDraft,authorizeDocument } from '../security/policy.ts';
import { readSession,readToken,sessionCookie,deleteSession } from '../security/session.ts';
import { startThaiD,verifyThaiD,staffLogin,registerCitizen } from '../domain/auth.ts';
import { serializeCase,maskName,type CaseRow } from '../security/serializers.ts';
import { decrypt } from '../security/crypto.ts';
import { holidays,readClock } from '../domain/clock.ts';
import { slaLevel,toBangkokDate } from '../domain/calendar.ts';
interface Route{path:RegExp;methods:readonly string[];roles:readonly string[]|null}
// Explicit route registry. Story services attach here later; no broad substring dispatch.
export const ROUTES:readonly Route[]=[
 {path:/^\/api\/health$/,methods:['GET'],roles:null},
 {path:/^\/api\/auth\/thaid\/(start|verify)$/,methods:['POST'],roles:null},
 {path:/^\/api\/auth\/staff\/login$/,methods:['POST'],roles:null},
 {path:/^\/api\/auth\/register$/,methods:['POST'],roles:['citizen']},
 {path:/^\/api\/auth\/logout$/,methods:['POST'],roles:['citizen','officer','head','executive','auditor','admin']},
 {path:/^\/api\/me$/,methods:['GET'],roles:['citizen','officer','head','executive','auditor','admin']},
 {path:/^\/api\/drafts$/,methods:['GET','POST'],roles:['citizen']},
 {path:/^\/api\/drafts\/[^/]+$/,methods:['GET','PATCH','DELETE'],roles:['citizen']},
 {path:/^\/api\/drafts\/[^/]+\/files$/,methods:['POST'],roles:['citizen']},
 {path:/^\/api\/drafts\/[^/]+\/files\/[^/]+$/,methods:['DELETE'],roles:['citizen']},
 {path:/^\/api\/drafts\/[^/]+\/payment$/,methods:['POST'],roles:['citizen']},
 {path:/^\/api\/payments\/[^/]+$/,methods:['GET'],roles:['citizen']},
 {path:/^\/api\/cases$/,methods:['GET'],roles:['citizen']},
 {path:/^\/api\/cases\/[^/]+$/,methods:['GET'],roles:['citizen','officer','head']},
 {path:/^\/api\/cases\/[^/]+\/(cancel|resubmit)$/,methods:['POST'],roles:['citizen']},
 {path:/^\/api\/cases\/[^/]+\/(approve|reject)$/,methods:['POST'],roles:['officer','head']},
 {path:/^\/api\/cases\/[^/]+\/files$/,methods:['GET'],roles:['citizen','officer','head']},
 {path:/^\/api\/files\/[^/]+$/,methods:['GET'],roles:['citizen','officer','head']},
 {path:/^\/api\/documents\/[^/]+\/pdf$/,methods:['GET'],roles:['citizen','officer','head','executive','auditor','admin']},
 {path:/^\/api\/officer\/queue$/,methods:['GET'],roles:['officer','head']},
 {path:/^\/api\/officer\/cases\/[^/]+\/(claim|return|forward|issue)$/,methods:['POST'],roles:['officer']},
 {path:/^\/api\/officer\/cases\/[^/]+\/unmask$/,methods:['POST'],roles:['officer','head']},
 {path:/^\/api\/notifications$/,methods:['GET'],roles:['officer','head']},
 {path:/^\/api\/verify\/[^/]+$/,methods:['GET'],roles:null},
 {path:/^\/api\/dashboard$/,methods:['GET'],roles:['executive']},
 {path:/^\/api\/dashboard\/export$/,methods:['GET'],roles:['executive']},
 {path:/^\/api\/audit$/,methods:['GET'],roles:['auditor']},
 {path:/^\/api\/audit\/export\.csv$/,methods:['GET'],roles:['auditor']},
 {path:/^\/api\/admin\/services$/,methods:['GET'],roles:['admin']},
 {path:/^\/api\/admin\/services\/SV-0[123]$/,methods:['PUT'],roles:['admin']},
 {path:/^\/api\/admin\/holidays$/,methods:['GET','POST'],roles:['admin']},
 {path:/^\/api\/admin\/holidays\/[^/]+$/,methods:['DELETE'],roles:['admin']},
 {path:/^\/api\/admin\/users$/,methods:['GET'],roles:['admin']},
 {path:/^\/api\/admin\/users\/[^/]+$/,methods:['PUT'],roles:['admin']}
];
type Resource=CaseRow&{applicant:string;current_dept:string|null};
function getCase(ctx:Context,caseNo:string){return ctx.db.prepare('SELECT * FROM cases WHERE case_no=?').get(caseNo) as Resource|undefined;}
async function authBody(request:Request):Promise<Record<string,unknown>>{
 let body:unknown;try{body=await request.json();}catch{throw new HttpError('INVALID_REQUEST');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError('INVALID_REQUEST');return body as Record<string,unknown>;
}
export async function dispatch(request:Request,ctx:Context):Promise<Response>{
 try{
 const path=new URL(request.url).pathname;
 if(path.startsWith('/api/test/'))return await testHooks(request,ctx);
 if(/^\/api\/audit(?:\/[^/]+)?$/.test(path)&&['PUT','PATCH','DELETE'].includes(request.method))throw new HttpError('METHOD_NOT_ALLOWED');
 const route=ROUTES.find(r=>r.path.test(path));if(!route)throw new HttpError('NOT_FOUND');if(!route.methods.includes(request.method))return json({code:'METHOD_NOT_ALLOWED',message:'Method Not Allowed'},405,{Allow:route.methods.join(', ')});
 const actor=readSession(request,ctx.db);if(route.roles)requireRole(actor,route.roles,path==='/api/auth/register'||path==='/api/auth/logout'||path==='/api/me');
 if(path==='/api/health')return json({status:'ok'});
 const secure=new URL(request.url).protocol==='https:';
 if(path==='/api/auth/thaid/start'){const body=await authBody(request);return json(startThaiD(ctx,body.idNo));}
 if(path==='/api/auth/thaid/verify'){const body=await authBody(request),result=verifyThaiD(ctx,body.idNo,body.otp);return json({registered:result.registered},200,{'Set-Cookie':sessionCookie(result.token,secure)});}
 if(path==='/api/auth/staff/login'){const body=await authBody(request),result=staffLogin(ctx,body.username,body.password);return json({role:result.role,dept:result.dept,landing:result.landing},200,{'Set-Cookie':sessionCookie(result.token,secure)});}
 if(path==='/api/auth/register'&&actor){const result=registerCitizen(ctx,actor,await authBody(request),readToken(request)??'');return json({ok:true},201,{'Set-Cookie':sessionCookie(result.token,secure)});}
 if(path==='/api/auth/logout'){deleteSession(request,ctx.db);return new Response(null,{status:204,headers:{'Set-Cookie':sessionCookie('',secure)+'; Max-Age=0','Cache-Control':'private, no-store'}});}
 const verify=/^\/api\/verify\/([^/]+)$/.exec(path);if(verify){
 const doc=ctx.db.prepare('SELECT * FROM documents WHERE verify_code=?').get(verify[1]) as {doc_no:string;case_no:string;applicant:string;service_id:string;issued_at:string;valid_until:string;signer:string;signature:string}|undefined;if(!doc)return json({result:'NOT_FOUND'},404);
 const actual=createHmac('sha256',ctx.keys.documentKey).update([doc.doc_no,doc.case_no,doc.applicant,doc.service_id,doc.issued_at,doc.valid_until,doc.signer].join('|')).digest();const stored=Buffer.from(doc.signature,'hex');
 if(actual.length!==stored.length||!timingSafeEqual(actual,stored))return json({result:'TAMPERED'});
 return json({result:toBangkokDate(readClock(ctx.db,ctx.testMode))>doc.valid_until?'EXPIRED':'VALID',docNo:doc.doc_no,applicantMasked:maskName(doc.applicant),serviceId:doc.service_id,issuedAt:doc.issued_at,validUntil:doc.valid_until,signer:doc.signer});
 }
 if(path==='/api/me'&&actor)return json({username:actor.username,name:actor.name,role:actor.role,dept:actor.dept??''});
 const detail=/^\/api\/cases\/([^/]+)$/.exec(path);if(detail){const c=getCase(ctx,detail[1]);const user=authorizeCase(actor,c);if(!c)throw new HttpError('NOT_FOUND');const applicant=ctx.db.prepare('SELECT name,id_last3,id_cipher,id_iv,id_tag FROM users WHERE id=?').get(c.applicant) as {name:string;id_last3:string;id_cipher:Buffer;id_iv:Buffer;id_tag:Buffer};const doc=ctx.db.prepare('SELECT doc_no,verify_code FROM documents WHERE case_no=?').get(c.case_no) as {doc_no:string;verify_code:string}|undefined;
 const idNo=user.role==='citizen'?decrypt({ciphertext:applicant.id_cipher,iv:applicant.id_iv,tag:applicant.id_tag},ctx.keys.dataKey):undefined;
 return json(serializeCase(user,c,applicant,{slaLevel:slaLevel(readClock(ctx.db,ctx.testMode),c.due_at,c.status,holidays(ctx.db,ctx.bugModes)),idNo,docNo:doc?.doc_no,verifyCode:doc?.verify_code}));}
 const attachments=/^\/api\/cases\/([^/]+)\/files$/.exec(path),file=/^\/api\/files\/([^/]+)$/.exec(path);
 if(attachments||file){const item=file?ctx.db.prepare('SELECT * FROM files WHERE id=?').get(file[1]) as {id:string;case_no:string|null;draft_id:string|null;mime:string;bytes:Buffer;name:string}|undefined:undefined;if(file&&!item)throw new HttpError('NOT_FOUND');
 if(item&&!item.case_no){authorizeDraft(actor,ctx.db.prepare('SELECT applicant FROM drafts WHERE id=?').get(item.draft_id) as {applicant:string}|undefined);}else{const c=getCase(ctx,attachments?.[1]??item!.case_no!);const entered=c?(ctx.db.prepare('SELECT dept FROM case_departments WHERE case_no=?').all(c.case_no) as {dept:string}[]).map(r=>r.dept):[];authorizeAttachment(actor,c,entered);}
 if(item)return new Response(new Uint8Array(item.bytes),{headers:{'Content-Type':item.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 return json({items:ctx.db.prepare('SELECT id AS fileId,name,doc_key AS docKey,size FROM files WHERE case_no=? ORDER BY id').all(attachments![1])});}
 const pdf=/^\/api\/documents\/([^/]+)\/pdf$/.exec(path);if(pdf){const doc=ctx.db.prepare('SELECT case_no,pdf FROM documents WHERE doc_no=?').get(pdf[1]) as {case_no:string;pdf:Buffer}|undefined;authorizeDocument(actor,doc?getCase(ctx,doc.case_no):undefined);if(!doc)throw new HttpError('NOT_FOUND');return new Response(new Uint8Array(doc.pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${pdf[1].replace(/[^A-Z0-9-]/g,'')}.pdf"`,'Cache-Control':'private, no-store'}});}
 // Honest partial milestone: future story commands never return a simulated success.
 throw new HttpError('NOT_IMPLEMENTED');
 }catch(error){return errorResponse(error);}
}
