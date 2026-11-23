import type { Context } from './context.ts';
import { HttpError,json } from './errors.ts';
import { seed } from '../db/seed.ts';
import { readClock,setClock } from '../domain/clock.ts';
import { pay } from '../domain/payments.ts';
import { tamperDocument } from '../domain/documents.ts';
export async function jsonBody(request:Request):Promise<Record<string,unknown>>{
 try{const body:unknown=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body as Record<string,unknown>;}catch{throw new HttpError('INVALID_REQUEST');}
}
export async function testHooks(request:Request,ctx:Context):Promise<Response>{
 if(!ctx.testMode)throw new HttpError('NOT_FOUND');const path=new URL(request.url).pathname;
 if(path==='/api/test/reset'){if(request.method!=='POST')throw new HttpError('METHOD_NOT_ALLOWED');return json(seed(ctx.db,ctx.keys));}
 if(path==='/api/test/clock'){
 if(request.method==='GET')return json({now:readClock(ctx.db,true)});
 if(request.method==='PUT'){const body=await jsonBody(request);try{if(typeof body.now!=='string')throw new Error();return json({now:setClock(ctx.db,body.now)});}catch{throw new HttpError('INVALID_TIME');}}
 throw new HttpError('METHOD_NOT_ALLOWED');
 }
 const payment=/^\/api\/test\/payments\/([^/]+)\/pay$/.exec(path);if(payment){if(request.method!=='POST')throw new HttpError('METHOD_NOT_ALLOWED');const body=await jsonBody(request);return json(pay(ctx.db,payment[1],body.amount,true,ctx.bugModes));}
 const tamper=/^\/api\/test\/documents\/([^/]+)\/tamper$/.exec(path);if(tamper){if(request.method!=='POST')throw new HttpError('METHOD_NOT_ALLOWED');if(!tamperDocument(ctx.db,tamper[1]))throw new HttpError('NOT_FOUND');return json({ok:true});}
 throw new HttpError('NOT_FOUND');
}
