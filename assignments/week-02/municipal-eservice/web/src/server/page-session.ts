import {headers} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import {getContext} from './http/context.ts';
import {readSession} from './security/session.ts';
import {decidePage} from './http/page-access.ts';
export async function pageSession(path:string){
 const incoming=await headers(),ctx=getContext();const actor=readSession(new Request('http://127.0.0.1'+path,{headers:{cookie:incoming.get('cookie')??''}}),ctx.db);
 const decision=decidePage(ctx,path,actor);if(decision.kind==='redirect')redirect(decision.location);if(decision.kind!=='allow')notFound();
 return {ctx,actor};
}
