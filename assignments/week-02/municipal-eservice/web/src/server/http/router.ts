import type { Context } from './context.ts';
import { HttpError,json,errorResponse } from './errors.ts';
import { testHooks } from './test-hooks.ts';
import { requireRole } from '../security/policy.ts';
import { readSession,readToken,sessionCookie,deleteSession } from '../security/session.ts';
import { startThaiD,verifyThaiD,staffLogin,registerCitizen } from '../domain/auth.ts';
import { handleDrafts } from './features/drafts.ts';
import { handleUploads } from './features/uploads.ts';
import { handlePayments } from './features/payments.ts';
import { handleCitizenCases } from './features/citizen-cases.ts';
import { handleQueue } from './features/queue.ts';
import { handleReview,handleAttachments } from './features/review.ts';
import { handleDecisionsDocuments } from './features/decisions-documents.ts';
import { handleNotifications } from './features/notifications.ts';
import { handleDashboard } from './features/dashboard.ts';
import { handleAudit } from './features/audit.ts';
import { handleAdmin } from './features/admin.ts';
import type { Principal } from '../security/policy.ts';
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
type FeatureHandler=(request:Request,ctx:Context,actor:Principal|null)=>Response|null|Promise<Response|null>;
// B14 integration: per-feature adapters (B03–B13). Each returns null for paths it does not own,
// so order only matters for upload/payment sub-paths that sit below /api/drafts/:id.
const FEATURES:readonly FeatureHandler[]=[handleUploads,handlePayments,handleDrafts,handleCitizenCases,handleQueue,handleReview,handleAttachments,handleDecisionsDocuments,handleNotifications,handleDashboard,handleAudit,handleAdmin];
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
 if(path==='/api/me'&&actor)return json({username:actor.username,name:actor.name,role:actor.role,dept:actor.dept??''});
 for(const feature of FEATURES){const response=await feature(request,ctx,actor);if(response)return response;}
 // Honest partial milestone: future story commands never return a simulated success.
 throw new HttpError('NOT_IMPLEMENTED');
 }catch(error){return errorResponse(error);}
}
