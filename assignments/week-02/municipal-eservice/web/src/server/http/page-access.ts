import type {Context} from './context.ts';
import type {Principal} from '../security/policy.ts';
import {landFor} from '../domain/auth.ts';
import tokens from '../../../public/illustrations/design-tokens.json' with {type:'json'};
export type PageDecision={kind:'allow'}|{kind:'redirect';location:string}|{kind:'forbidden'|'not-found'|'document-not-found'};
export const PAGE_RULES:[RegExp,readonly string[]][]=[[/^\/citizen(?:\/.*)?$/,['citizen']],[/^\/officer\/(queue|cases\/[^/]+)$/,['officer','head']],[/^\/head\/approvals$/,['head']],[/^\/dashboard$/,['executive']],[/^\/audit$/,['auditor']],[/^\/admin\/(services|holidays|users)$/,['admin']],[/^\/notifications$/,['officer','head']]];
export function decidePage(ctx:Context,path:string,actor:Principal|null):PageDecision{
 if(path==='/')return {kind:'redirect',location:actor?landFor(actor):'/login'};
 if(path==='/register'){if(!actor)return {kind:'redirect',location:'/login'};return actor.role==='citizen'&&actor.registrationOnly?{kind:'allow'}:{kind:'redirect',location:landFor(actor)};}
 const verify=/^\/verify\/([^/]+)$/.exec(path);if(verify)return ctx.db.prepare('SELECT doc_no FROM documents WHERE verify_code=?').get(verify[1])?{kind:'allow'}:{kind:'document-not-found'};
 const rule=PAGE_RULES.find(([pattern])=>pattern.test(path));if(!rule)return {kind:'allow'};
 if(!actor)return {kind:'redirect',location:'/login'};
 if(actor.registrationOnly)return {kind:'redirect',location:'/register'};
 if(!rule[1].includes(actor.role))return {kind:'forbidden'};
 const detail=/^\/(citizen|officer)\/cases\/([^/]+)$/.exec(path);if(detail){const c=ctx.db.prepare('SELECT applicant FROM cases WHERE case_no=?').get(detail[2]) as {applicant:string}|undefined;if(!c||(actor.role==='citizen'&&c.applicant!==actor.userId))return {kind:'not-found'};}
 return {kind:'allow'};
}
// HTTP status is decided by the custom server before Next renders any private page/RSC.
export function pageErrorHtml(kind:'forbidden'|'not-found'|'document-not-found',home='/login'):string{
 const text=kind==='forbidden'?'ไม่มีสิทธิ์เข้าถึงหน้านี้':kind==='document-not-found'?'ไม่พบเอกสาร':'ไม่พบคำขอ';
 const selector=kind==='forbidden'?'forbidden-msg':kind==='document-not-found'?'verify-result':'not-found-msg';
 const variables=Object.entries(tokens.css).map(([key,value])=>`--ds-${key}:${value}`).join(';');
 const href=home.replace(/[^a-zA-Z0-9/\-]/g,'');
 return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${text} · บ้านบริการ</title><style>:root{${variables}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--ds-canvas-fill);font:16px/1.7 var(--ds-font-body);color:var(--ds-color-ink)}main{max-width:560px;margin:24px;padding:40px;border-radius:var(--ds-radius-card);background:var(--ds-glass-fallback);border:1px solid var(--ds-glass-border);box-shadow:var(--ds-glass-shadow);text-align:center}svg{width:96px;height:96px}h1{font-size:28px}a{display:inline-block;background:var(--ds-color-primary);color:var(--ds-color-on-primary);padding:12px 24px;border-radius:12px;min-height:44px;text-decoration:none}a:focus-visible{outline:3px solid var(--ds-color-focus);outline-offset:4px}</style><main><svg aria-hidden="true"><use href="/illustrations/civic-illustrations.svg#art-folder"/></svg><h1 data-testid="${selector}"${kind==='document-not-found'?' data-result="NOT_FOUND"':''}>${text}</h1><p>กลับไปยังหน้าบริการของคุณเพื่อดำเนินการต่อ</p><a href="${href}">กลับหน้าหลัก</a></main></html>`;
}
