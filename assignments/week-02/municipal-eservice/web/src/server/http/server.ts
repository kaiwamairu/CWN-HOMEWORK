import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
import type { Context } from './context.ts';
import { dispatch } from './router.ts';
import { evaluateLifecycle } from '../domain/lifecycle.ts';
import { errorResponse } from './errors.ts';
import {readSession} from '../security/session.ts';
import {decidePage,pageErrorHtml} from './page-access.ts';
import {landFor} from '../domain/auth.ts';
export const MAX_BODY_BYTES=8*1024*1024;
async function toRequest(req:IncomingMessage):Promise<Request>{
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>MAX_BODY_BYTES)throw new RangeError('Request body exceeds transport limit');chunks.push(bytes);}
 const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
 const method=req.method??'GET';return new Request(new URL(req.url??'/','http://127.0.0.1'),{method,headers,body:method==='GET'||method==='HEAD'?undefined:new Uint8Array(Buffer.concat(chunks))});
}
export function createCivicServer(ctx:Context,nextHandler:(req:IncomingMessage,res:ServerResponse)=>void|Promise<void>){
 return createServer(async(req,res)=>{
 try{
 const path=new URL(req.url??'/','http://127.0.0.1').pathname;
 if(!path.startsWith('/api/test/'))evaluateLifecycle(ctx.db,ctx.testMode,ctx.bugModes);
 if(path.startsWith('/api/')){
 const response=await dispatch(await toRequest(req),ctx);res.statusCode=response.status;
 response.headers.forEach((value,key)=>{if(key!=='set-cookie')res.setHeader(key,value);});const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
 if(req.method==='HEAD')res.end();else res.end(Buffer.from(await response.arrayBuffer()));
 }else {
 const headers=new Headers();if(req.headers.cookie)headers.set('cookie',req.headers.cookie);
 const actor=readSession(new Request('http://127.0.0.1'+(req.url??'/'),{headers}),ctx.db);
 const decision=decidePage(ctx,path,actor);
 if(decision.kind==='redirect'){res.writeHead(302,{Location:decision.location,'Cache-Control':'private, no-store'});res.end();return;}
 if(decision.kind!=='allow'){res.writeHead(decision.kind==='forbidden'?403:404,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:pageErrorHtml(decision.kind,actor?landFor(actor):'/login'));return;}
 await nextHandler(req,res);
 }
 }catch(error){
 if(res.headersSent){res.end();return;}
 const response=error instanceof RangeError?Response.json({code:'BODY_TOO_LARGE',message:'Request body exceeds 8 MiB'},{status:413}):errorResponse(error);
 res.statusCode=response.status;res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json');res.end(await response.text());
 }
 });
}
