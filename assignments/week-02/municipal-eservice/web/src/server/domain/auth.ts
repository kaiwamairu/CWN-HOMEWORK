import {timingSafeEqual} from 'node:crypto';
import type {Context} from '../http/context.ts';
import {HttpError} from '../http/errors.ts';
import {immediate} from '../db/connection.ts';
import {encrypt,lookupIdentity} from '../security/crypto.ts';
import {requireRole,type Principal} from '../security/policy.ts';
import {issueSession,tokenDigest} from '../security/session.ts';
import {appendAudit} from './audit.ts';
import {readClock} from './clock.ts';
import {toBangkokIso} from './calendar.ts';

const STAFF_USERNAMES=new Set(['off.reg1','off.reg2','off.works1','head1','exec1','audit1','admin1']);
const STAFF_PASSWORD=Buffer.from('Test@1234');
const OTP='123456';
const LOCK_MS=15*60*1000;
type ProviderIdentity={id:string;registered:number};
type Attempt={wrong_count:number;locked_until:string|null};

/** Common post-login destination, including the restricted first-registration session. */
export function landFor(actor:Pick<Principal,'role'|'registrationOnly'>):string{
 if(actor.role==='citizen')return actor.registrationOnly?'/register':'/citizen';
 const routes:Record<string,string>={officer:'/officer/queue',head:'/head/approvals',executive:'/dashboard',auditor:'/audit',admin:'/admin/services'};
 const route=routes[actor.role];if(!route)throw new HttpError('FORBIDDEN');return route;
}

function identityLookup(ctx:Context,idNo:unknown):string{
 if(typeof idNo!=='string'||!/^[0-9]{13}$/.test(idNo))throw new HttpError('INVALID_ID');
 let sum=0;for(let i=0;i<12;i++)sum+=Number(idNo[i])*(13-i);
 if((11-sum%11)%10!==Number(idNo[12]))throw new HttpError('INVALID_ID');
 return lookupIdentity(idNo,ctx.keys.lookupKey);
}

function providerIdentity(ctx:Context,lookup:string):ProviderIdentity{
 // This local ThaiD simulator supports the four encrypted seed identities only.
 // Unsupported checksum-valid IDs do not manufacture a name or retain plaintext identity.
 const user=ctx.db.prepare("SELECT id,registered FROM users WHERE id_lookup=? AND role='citizen'").get(lookup) as ProviderIdentity|undefined;
 if(!user)throw new HttpError('INVALID_ID');return user;
}

function attemptState(ctx:Context,lookup:string,now:string):Attempt|HttpError{
 const attempt=ctx.db.prepare('SELECT wrong_count,locked_until FROM auth_attempts WHERE id_lookup=?').get(lookup) as Attempt|undefined;
 if(attempt?.locked_until){
 if(Date.parse(now)<Date.parse(attempt.locked_until))return new HttpError('LOCKED',{lockedUntil:attempt.locked_until});
 ctx.db.prepare('DELETE FROM auth_attempts WHERE id_lookup=?').run(lookup);return {wrong_count:0,locked_until:null};
 }
 return attempt??{wrong_count:0,locked_until:null};
}

/** Validate the mock-provider identity and expose OTP readiness without creating a session. */
export function startThaiD(ctx:Context,idNo:unknown):{status:'OTP_SENT'}{
 const lookup=identityLookup(ctx,idNo);
 const result=immediate(ctx.db,()=>{
 providerIdentity(ctx,lookup);const state=attemptState(ctx,lookup,readClock(ctx.db,ctx.testMode));
 return state instanceof HttpError?state:{status:'OTP_SENT' as const};
 });
 if(result instanceof HttpError)throw result;return result;
}

/** Persist wrong attempts before raising HTTP errors; a thrown transaction would erase them. */
export function verifyThaiD(ctx:Context,idNo:unknown,otp:unknown):{registered:boolean;token:string}{
 const lookup=identityLookup(ctx,idNo);
 const result=immediate(ctx.db,()=>{
 const user=providerIdentity(ctx,lookup),now=readClock(ctx.db,ctx.testMode),attempt=attemptState(ctx,lookup,now);
 if(attempt instanceof HttpError)return attempt;
 if(otp!==OTP){
 const wrongCount=attempt.wrong_count+1,lockedUntil=wrongCount===3?toBangkokIso(Date.parse(now)+LOCK_MS):null;
 ctx.db.prepare('INSERT INTO auth_attempts(id_lookup,wrong_count,locked_until) VALUES(?,?,?) ON CONFLICT(id_lookup) DO UPDATE SET wrong_count=excluded.wrong_count,locked_until=excluded.locked_until').run(lookup,wrongCount,lockedUntil);
 return lockedUntil?new HttpError('LOCKED',{lockedUntil}):new HttpError('OTP_INVALID',{attemptsLeft:3-wrongCount});
 }
 ctx.db.prepare('DELETE FROM auth_attempts WHERE id_lookup=?').run(lookup);
 return {registered:Boolean(user.registered),token:issueSession(ctx.db,user.id,!user.registered)};
 });
 if(result instanceof HttpError)throw result;return result;
}

/** Authenticate source SSO credentials, snapshot live privileges, and audit in one transaction. */
export function staffLogin(ctx:Context,username:unknown,password:unknown):{role:string;dept:string;landing:string;token:string}{
 const supplied=typeof password==='string'?Buffer.from(password):Buffer.alloc(0);
 const validPassword=supplied.length===STAFF_PASSWORD.length&&timingSafeEqual(supplied,STAFF_PASSWORD);
 if(typeof username!=='string'||!STAFF_USERNAMES.has(username)||!validPassword)throw new HttpError('INVALID_CREDENTIALS');
 return immediate(ctx.db,()=>{
 const user=ctx.db.prepare("SELECT id,username,name,role,dept FROM users WHERE username=? AND role<>'citizen'").get(username) as {id:string;username:string;name:string;role:string;dept:string|null}|undefined;
 if(!user)throw new HttpError('INVALID_CREDENTIALS');
 const token=issueSession(ctx.db,user.id,false),landing=landFor({...user,registrationOnly:false});
 appendAudit(ctx.db,{time:readClock(ctx.db,ctx.testMode),username:user.username,role:user.role,event:'STAFF_LOGIN',detail:''});
 return {role:user.role,dept:user.dept??'',landing,token};
 });
}

/** Complete only this first-registration session; other restricted sessions need fresh login. */
export function registerCitizen(ctx:Context,actor:Principal,body:Record<string,unknown>,currentToken:string):{token:string}{
 requireRole(actor,['citizen'],true);
 return immediate(ctx.db,()=>{
 if(!/^[a-f0-9]{64}$/.test(currentToken))throw new HttpError('UNAUTHENTICATED');
 const current=ctx.db.prepare("SELECT s.registration_only,u.registered FROM sessions s JOIN users u ON u.id=s.user_id JOIN runtime_control r ON r.id=1 AND r.session_generation=s.generation WHERE s.token_digest=? AND s.user_id=? AND s.role='citizen'").get(tokenDigest(currentToken),actor.userId) as {registration_only:number;registered:number}|undefined;
 if(!current)throw new HttpError('UNAUTHENTICATED');
 if(!actor.registrationOnly||!current.registration_only||current.registered)throw new HttpError('INVALID_STATE');
 if(typeof body.mobile!=='string'||!/^0[0-9]{9}$/.test(body.mobile))throw new HttpError('INVALID_MOBILE');
 if(body.consent!==true)throw new HttpError('CONSENT_REQUIRED');
 if(body.email!==undefined&&typeof body.email!=='string')throw new HttpError('INVALID_REQUEST');
 const mobile=encrypt(body.mobile,ctx.keys.dataKey);
 ctx.db.prepare('UPDATE users SET mobile_cipher=?,mobile_iv=?,mobile_tag=?,email=?,registered=1,consent_at=? WHERE id=?').run(mobile.ciphertext,mobile.iv,mobile.tag,body.email??'',readClock(ctx.db,ctx.testMode),actor.userId);
 ctx.db.prepare('DELETE FROM sessions WHERE token_digest=?').run(tokenDigest(currentToken));
 return {token:issueSession(ctx.db,actor.userId,false)};
 });
}
