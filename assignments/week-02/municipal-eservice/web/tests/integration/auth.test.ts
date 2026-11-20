import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../../src/server/db/connection.ts';
import {seed} from '../../src/server/db/seed.ts';
import {setClock} from '../../src/server/domain/clock.ts';
import {dispatch} from '../../src/server/http/router.ts';
import {decrypt,lookupIdentity} from '../../src/server/security/crypto.ts';
import {readSession,SESSION_COOKIE,tokenDigest} from '../../src/server/security/session.ts';
import {ACTORS} from '../fixtures/actors.ts';

const keys={dataKey:Buffer.alloc(32,11),lookupKey:Buffer.alloc(32,22),documentKey:Buffer.alloc(32,33)};
function harness(){
 const dir=mkdtempSync(join(tmpdir(),'civic-auth-')),path=join(dir,'db.sqlite'),db=openDatabase(path);
 seed(db,keys);const ctx={db,keys,testMode:true,bugModes:new Set<string>()};
 const send=(path:string,body?:unknown,cookie='',method=body===undefined?'GET':'POST',https=false)=>dispatch(new Request(`${https?'https':'http'}://localhost${path}`,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)}),ctx);
 return {db,path,send,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
function cookieOf(response:Response):string{
 const cookie=response.headers.get('set-cookie');assert.ok(cookie,'Successful authentication sets a cookie');
 return cookie.split(';')[0]!;
}
function tokenOf(cookie:string):string{return cookie.slice(SESSION_COOKIE.length+1);}
async function citizen(h:ReturnType<typeof harness>,idNo:string=ACTORS.somchai.idNo){
 const start=await h.send('/api/auth/thaid/start',{idNo});assert.equal(start.status,200);
 const response=await h.send('/api/auth/thaid/verify',{idNo,otp:'123456'});assert.equal(response.status,200);
 return {response,cookie:cookieOf(response)};
}
async function expectError(response:Response,status:number,code:string,extra:Record<string,unknown>={}){
 assert.equal(response.status,status);const body=await response.json();assert.equal(body.code,code);assert.equal(typeof body.message,'string');
 for(const [key,value] of Object.entries(extra))assert.equal(body[key],value);
 assert.equal(response.headers.get('set-cookie'),null);return body;
}

test('ThaiD enforces exact ASCII digits and checksum at both public endpoints',async()=>{
 const h=harness();try{
 const invalid:unknown[]=['110170012345','11017001234567','1101700123457','11017001234ab',' 1101700123456','1101700123456 ','๑๑๐๑๗๐๐๑๒๓๔๕๖','１１０１７００１２３４５６','1234567890120',1101700123456,null,{},true];
 for(const idNo of invalid)for(const path of ['/api/auth/thaid/start','/api/auth/thaid/verify'])await expectError(await h.send(path,{idNo,otp:'123456'}),400,'INVALID_ID');
 for(const actor of [ACTORS.somchai,ACTORS.somying,ACTORS.mana,ACTORS.piti]){
 const start=await h.send('/api/auth/thaid/start',{idNo:actor.idNo});assert.equal(start.status,200);assert.deepEqual(await start.json(),{status:'OTP_SENT'});assert.equal(start.headers.get('set-cookie'),null);
 const verified=await h.send('/api/auth/thaid/verify',{idNo:actor.idNo,otp:'123456'});assert.equal(verified.status,200);assert.deepEqual(await verified.json(),{registered:actor.registered});
 }
 }finally{h.close();}
});

test('OTP failures persist per HMAC identity and the third locks until exactly fifteen minutes',async()=>{
 const h=harness();try{const idNo=ACTORS.piti.idNo,lookup=lookupIdentity(idNo,keys.lookupKey);
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'000000'}),401,'OTP_INVALID',{attemptsLeft:2});
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'000000'}),401,'OTP_INVALID',{attemptsLeft:1});
 const lockedUntil='2026-12-01T09:15:00+07:00';
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'000000'}),423,'LOCKED',{lockedUntil});
 assert.deepEqual(h.db.prepare('SELECT * FROM auth_attempts').all(),[{id_lookup:lookup,wrong_count:3,locked_until:lockedUntil}]);
 await expectError(await h.send('/api/auth/thaid/start',{idNo}),423,'LOCKED',{lockedUntil});
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'123456'}),423,'LOCKED',{lockedUntil});
 await citizen(h); // Another identity remains usable during the lock.
 setClock(h.db,'2026-12-01T09:14:59+07:00');
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'123456'}),423,'LOCKED',{lockedUntil});
 setClock(h.db,lockedUntil);
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'000000'}),401,'OTP_INVALID',{attemptsLeft:2});
 const verified=await h.send('/api/auth/thaid/verify',{idNo,otp:'123456'});assert.equal(verified.status,200);
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'000000'}),401,'OTP_INVALID',{attemptsLeft:2});
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'000000'}),401,'OTP_INVALID',{attemptsLeft:1});
 assert.equal(readFileSync(h.path).includes(Buffer.from(idNo)),false);
 }finally{h.close();}
});

test('starting ThaiD does not clear wrong attempts and a correct OTP resets them',async()=>{
 const h=harness();try{const idNo=ACTORS.piti.idNo;
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:123456}),401,'OTP_INVALID',{attemptsLeft:2});
 assert.equal((await h.send('/api/auth/thaid/start',{idNo})).status,200);
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'123456 '}),401,'OTP_INVALID',{attemptsLeft:1});
 const correct=await h.send('/api/auth/thaid/verify',{idNo,otp:'123456'});assert.equal(correct.status,200);
 assert.equal((await h.send('/api/auth/logout',{},cookieOf(correct))).status,204);
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'000000'}),401,'OTP_INVALID',{attemptsLeft:2});
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'000000'}),401,'OTP_INVALID',{attemptsLeft:1});
 }finally{h.close();}
});

test('ThaiD start at exact lock expiry resets attempts and different database clocks stay isolated',async()=>{
 const h=harness(),other=harness();try{const idNo=ACTORS.piti.idNo;
 for(let i=0;i<3;i++)await h.send('/api/auth/thaid/verify',{idNo,otp:'000000'});
 setClock(other.db,'2027-01-01T00:00:00+07:00');assert.equal((await other.send('/api/auth/thaid/verify',{idNo,otp:'123456'})).status,200);
 await expectError(await h.send('/api/auth/thaid/start',{idNo}),423,'LOCKED',{lockedUntil:'2026-12-01T09:15:00+07:00'});
 setClock(h.db,'2026-12-01T09:15:00+07:00');assert.equal((await h.send('/api/auth/thaid/start',{idNo})).status,200);
 await expectError(await h.send('/api/auth/thaid/verify',{idNo,otp:'000000'}),401,'OTP_INVALID',{attemptsLeft:2});
 }finally{h.close();other.close();}
});

test('staff uses the seven source accounts, exact role landings, and a frozen-time login audit',async()=>{
 const h=harness();try{
 const staff=Object.values(ACTORS).filter(actor=>actor.kind==='staff');
 for(const actor of staff){
 const response=await h.send('/api/auth/staff/login',{username:actor.username,password:actor.password,role:'admin',dept:'works'});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{role:actor.role,dept:actor.dept,landing:actor.landing});
 const me=await h.send('/api/me',undefined,cookieOf(response));assert.equal(me.status,200);assert.deepEqual(await me.json(),{username:actor.username,name:actor.name,role:actor.role,dept:actor.dept});
 }
 const audits=h.db.prepare('SELECT time,username,role,event,case_no,from_status,to_status,detail FROM audit ORDER BY id').all();
 assert.deepEqual(audits,staff.map(actor=>({time:'2026-12-01T09:00:00+07:00',username:actor.username,role:actor.role,event:'STAFF_LOGIN',case_no:null,from_status:null,to_status:null,detail:''})));
 const failures:unknown[]=[];
 for(const body of [{username:'off.reg1',password:'wrong'},{username:'nobody',password:'Test@1234'},{username:'1101700123456',password:'Test@1234'},{username:{},password:'Test@1234'},{username:'admin1',password:null}])failures.push(await expectError(await h.send('/api/auth/staff/login',body),401,'INVALID_CREDENTIALS'));
 assert.ok(failures.every(body=>JSON.stringify(body)===JSON.stringify(failures[0])));
 assert.equal((h.db.prepare('SELECT count(*) AS n FROM audit').get() as {n:number}).n,7);
 }finally{h.close();}
});

test('staff session insertion and STAFF_LOGIN audit roll back together',async()=>{
 const h=harness();try{
 h.db.exec("CREATE TRIGGER fail_login_audit BEFORE INSERT ON audit WHEN NEW.event='STAFF_LOGIN' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END");
 await expectError(await h.send('/api/auth/staff/login',{username:'off.reg1',password:'Test@1234'}),500,'INTERNAL_ERROR');
 assert.equal((h.db.prepare('SELECT count(*) AS n FROM sessions').get() as {n:number}).n,0);
 assert.equal((h.db.prepare('SELECT count(*) AS n FROM audit').get() as {n:number}).n,0);
 }finally{h.close();}
});

test('opaque session cookies use digests, independent tokens, logout revocation and reset generations',async()=>{
 const h=harness();try{
 const first=await citizen(h),second=await citizen(h);const token=tokenOf(first.cookie),otherToken=tokenOf(second.cookie);
 assert.match(token,/^[a-f0-9]{64}$/);assert.notEqual(token,otherToken);
 const attributes=first.response.headers.get('set-cookie')!;assert.match(attributes,/; HttpOnly/);assert.match(attributes,/; SameSite=Lax/);assert.match(attributes,/; Path=\//);assert.doesNotMatch(attributes,/; Secure/);
 const rows=h.db.prepare('SELECT token_digest,user_id,role,dept,registration_only,generation FROM sessions ORDER BY token_digest').all();
 assert.equal(rows.length,2);assert.equal(JSON.stringify(rows).includes(token),false);assert.ok(rows.some(row=>(row as {token_digest:string}).token_digest===tokenDigest(token)));
 assert.equal(readFileSync(h.path).includes(Buffer.from(token)),false);
 const https=await h.send('/api/auth/thaid/verify',{idNo:ACTORS.somchai.idNo,otp:'123456'},'', 'POST',true);assert.match(https.headers.get('set-cookie')!,/; Secure/);
 const logout=await h.send('/api/auth/logout',{},first.cookie,'POST',true);assert.equal(logout.status,204);assert.equal(await logout.text(),'');
 assert.match(logout.headers.get('set-cookie')!,/civic_session=;/);assert.match(logout.headers.get('set-cookie')!,/; Max-Age=0/);assert.match(logout.headers.get('set-cookie')!,/; HttpOnly/);assert.match(logout.headers.get('set-cookie')!,/; SameSite=Lax/);assert.match(logout.headers.get('set-cookie')!,/; Path=\//);assert.match(logout.headers.get('set-cookie')!,/; Secure/);
 await expectError(await h.send('/api/me',undefined,first.cookie),401,'UNAUTHENTICATED');assert.equal((await h.send('/api/me',undefined,second.cookie)).status,200);
 h.db.prepare('UPDATE runtime_control SET session_generation=session_generation+1').run();await expectError(await h.send('/api/me',undefined,second.cookie),401,'UNAUTHENTICATED');
 const fresh=await citizen(h);assert.equal((await h.send('/api/test/reset',{},'')).status,200);await expectError(await h.send('/api/me',undefined,fresh.cookie),401,'UNAUTHENTICATED');
 }finally{h.close();}
});

test('role and department changes apply only to the next real login',async()=>{
 const h=harness();try{
 const first=await h.send('/api/auth/staff/login',{username:'off.reg1',password:'Test@1234'}),firstCookie=cookieOf(first);
 h.db.prepare("UPDATE users SET dept='works' WHERE id='off.reg1'").run();
 const second=await h.send('/api/auth/staff/login',{username:'off.reg1',password:'Test@1234'}),secondCookie=cookieOf(second);assert.equal((await second.json()).dept,'works');
 assert.equal((await (await h.send('/api/me',undefined,firstCookie)).json()).dept,'registry');
 h.db.prepare("UPDATE users SET role='auditor',dept=NULL WHERE id='off.reg1'").run();
 const third=await h.send('/api/auth/staff/login',{username:'off.reg1',password:'Test@1234'});assert.deepEqual(await third.json(),{role:'auditor',dept:'',landing:'/audit'});
 assert.equal((await (await h.send('/api/me',undefined,secondCookie)).json()).role,'officer');
 }finally{h.close();}
});

test('first-time identity gets a registration-only session and cannot use protected story APIs',async()=>{
 const h=harness();try{
 const {response,cookie}=await citizen(h,ACTORS.mana.idNo);assert.deepEqual(await response.json(),{registered:false});
 const actor=readSession(new Request('http://localhost',{headers:{cookie}}),h.db);assert.equal(actor?.registrationOnly,true);assert.equal(actor?.name,ACTORS.mana.name);
 const me=await h.send('/api/me',undefined,cookie);assert.equal(me.status,200);assert.equal((await me.json()).name,ACTORS.mana.name);
 for(const [path,method,body] of [['/api/cases','GET',undefined],['/api/drafts','POST',{serviceId:'SV-01',qty:1}],['/api/cases/EG-2569-000005','GET',undefined]] as const)await expectError(await h.send(path,body,cookie,method),403,'FORBIDDEN');
 const logout=await h.send('/api/auth/logout',{},cookie);assert.equal(logout.status,204);await expectError(await h.send('/api/me',undefined,cookie),401,'UNAUTHENTICATED');
 }finally{h.close();}
});

test('registration validates mobile/consent without persisting failures or accepting provider overrides',async()=>{
 const h=harness();try{const {cookie}=await citizen(h,ACTORS.mana.idNo);
 for(const mobile of ['081234567','08123456789','1812345678','08123abcde',' 0845678901',845678901,null,{}])await expectError(await h.send('/api/auth/register',{mobile,consent:true},cookie),400,'INVALID_MOBILE');
 for(const consent of [false,undefined,'true',1])await expectError(await h.send('/api/auth/register',{mobile:'0845678901',consent},cookie),400,'CONSENT_REQUIRED');
 assert.deepEqual(h.db.prepare("SELECT registered,consent_at,mobile_cipher FROM users WHERE id='citizen-mana'").get(),{registered:0,consent_at:null,mobile_cipher:null});
 const registered=await h.send('/api/auth/register',{mobile:'0845678901',consent:true,name:'Replaced',role:'admin',dept:'works',idNo:ACTORS.somchai.idNo},cookie);assert.equal(registered.status,201);
 const user=h.db.prepare("SELECT * FROM users WHERE id='citizen-mana'").get() as {name:string;role:string;dept:null;registered:number;consent_at:string;email:string;mobile_cipher:Buffer;mobile_iv:Buffer;mobile_tag:Buffer};
 assert.equal(user.name,ACTORS.mana.name);assert.equal(user.role,'citizen');assert.equal(user.dept,null);assert.equal(user.registered,1);assert.equal(user.consent_at,'2026-12-01T09:00:00+07:00');assert.equal(user.email,'');
 assert.equal(decrypt({ciphertext:user.mobile_cipher,iv:user.mobile_iv,tag:user.mobile_tag},keys.dataKey),'0845678901');assert.equal(readFileSync(h.path).includes(Buffer.from('0845678901')),false);
 }finally{h.close();}
});

test('registration rotates only its current session and leaves other registration sessions restricted',async()=>{
 const h=harness();try{
 const first=await citizen(h,ACTORS.mana.idNo),other=await citizen(h,ACTORS.mana.idNo);
 setClock(h.db,'2026-12-01T10:12:34+07:00');
 const registered=await h.send('/api/auth/register',{mobile:'0845678901',email:'mana@example.test',consent:true},first.cookie);assert.equal(registered.status,201);const fullCookie=cookieOf(registered);assert.notEqual(fullCookie,first.cookie);
 await expectError(await h.send('/api/me',undefined,first.cookie),401,'UNAUTHENTICATED');
 const full=readSession(new Request('http://localhost',{headers:{cookie:fullCookie}}),h.db);assert.equal(full?.registrationOnly,false);
 const restricted=readSession(new Request('http://localhost',{headers:{cookie:other.cookie}}),h.db);assert.equal(restricted?.registrationOnly,true);
 await expectError(await h.send('/api/cases',undefined,other.cookie),403,'FORBIDDEN');
 await expectError(await h.send('/api/auth/register',{mobile:'0899999999',consent:true},other.cookie),409,'INVALID_STATE');
 const login=await citizen(h,ACTORS.mana.idNo);assert.deepEqual(await login.response.json(),{registered:true});
 assert.equal(readSession(new Request('http://localhost',{headers:{cookie:login.cookie}}),h.db)?.registrationOnly,false);
 assert.deepEqual(h.db.prepare("SELECT email,consent_at FROM users WHERE id='citizen-mana'").get(),{email:'mana@example.test',consent_at:'2026-12-01T10:12:34+07:00'});
 }finally{h.close();}
});

test('register requires an authenticated first-time citizen and malformed auth JSON is a client error',async()=>{
 const h=harness();try{
 await expectError(await h.send('/api/auth/register',{mobile:'0845678901',consent:true}),401,'UNAUTHENTICATED');
 const staff=await h.send('/api/auth/staff/login',{username:'admin1',password:'Test@1234'});await expectError(await h.send('/api/auth/register',{mobile:'0845678901',consent:true},cookieOf(staff)),403,'FORBIDDEN');
 const registered=await citizen(h);await expectError(await h.send('/api/auth/register',{mobile:'0845678901',consent:true},registered.cookie),409,'INVALID_STATE');
 for(const body of ['{','null','[]']){
 const response=await dispatch(new Request('http://localhost/api/auth/thaid/start',{method:'POST',headers:{'Content-Type':'application/json'},body}),{db:h.db,keys,testMode:true,bugModes:new Set<string>()});
 await expectError(response,400,'INVALID_REQUEST');
 }
 }finally{h.close();}
});

test('registration state and session rotation roll back together when replacement insertion fails',async()=>{
 const h=harness();try{const {cookie}=await citizen(h,ACTORS.mana.idNo);
 h.db.exec("CREATE TRIGGER fail_registration_session BEFORE INSERT ON sessions WHEN NEW.registration_only=0 AND NEW.user_id='citizen-mana' BEGIN SELECT RAISE(ABORT,'injected session failure'); END");
 await expectError(await h.send('/api/auth/register',{mobile:'0845678901',consent:true},cookie),500,'INTERNAL_ERROR');
 assert.deepEqual(h.db.prepare("SELECT registered,consent_at,mobile_cipher FROM users WHERE id='citizen-mana'").get(),{registered:0,consent_at:null,mobile_cipher:null});
 assert.equal(readSession(new Request('http://localhost',{headers:{cookie}}),h.db)?.registrationOnly,true);
 }finally{h.close();}
});
