import type Database from 'better-sqlite3';
import { createHash,randomBytes } from 'node:crypto';
import type { Principal } from './policy.ts';
export const SESSION_COOKIE='civic_session';
export function tokenDigest(token:string):string{return createHash('sha256').update(token).digest('hex');}

/** Read only a well-formed opaque token; never accept identity or role cookie fields. */
export function readToken(request:Request):string|null{
 const cookie=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(SESSION_COOKIE+'='));if(!cookie)return null;
 const token=cookie.slice(SESSION_COOKIE.length+1);return /^[a-f0-9]{64}$/.test(token)?token:null;
}

/** Cookie scope is shared by login, registration rotation and logout. */
export function sessionCookie(token:string,secure=false):string{
 return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/${secure?'; Secure':''}`;
}

/** Snapshot the current database role/dept/generation; persist only the token's SHA-256 digest. */
export function issueSession(db:Database.Database,userId:string,registrationOnly:boolean):string{
 const token=randomBytes(32).toString('hex');
 const inserted=db.prepare('INSERT INTO sessions(token_digest,user_id,role,dept,registration_only,generation) SELECT ?,u.id,u.role,u.dept,?,r.session_generation FROM users u JOIN runtime_control r ON r.id=1 WHERE u.id=?').run(tokenDigest(token),registrationOnly?1:0,userId);
 if(inserted.changes!==1)throw new Error('Unable to issue session');return token;
}

/** Revoke only this browser's server-side session. Other sessions remain independent. */
export function deleteSession(request:Request,db:Database.Database):void{
 const token=readToken(request);if(token)db.prepare('DELETE FROM sessions WHERE token_digest=?').run(tokenDigest(token));
}

// Reading must never substitute the mutable user role/dept for the login snapshot.
export function readSession(request:Request,db:Database.Database):Principal|null{
 const token=readToken(request);if(!token)return null;
 const row=db.prepare('SELECT s.user_id AS userId,u.username,u.name,s.role,s.dept,s.registration_only FROM sessions s JOIN users u ON u.id=s.user_id JOIN runtime_control r ON r.id=1 AND s.generation=r.session_generation WHERE s.token_digest=?').get(tokenDigest(token)) as (Omit<Principal,'registrationOnly'>&{registration_only:number})|undefined;
 return row?{userId:row.userId,username:row.username??'',name:row.name,role:row.role,dept:row.dept,registrationOnly:Boolean(row.registration_only)}:null;
}
