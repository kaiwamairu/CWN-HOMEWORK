import {test} from 'node:test';
import assert from 'node:assert/strict';
import {endSession} from '../../src/lib/logout.ts';
test('logout confirms server success or already-unauthenticated state and rejects network/server failure',async()=>{
 for(const status of [204,401])await assert.doesNotReject(()=>endSession((async()=>new Response(null,{status})) as typeof fetch));
 for(const status of [400,403,500,503])await assert.rejects(()=>endSession((async()=>new Response(null,{status})) as typeof fetch),/ออกจากระบบไม่สำเร็จ/);
 await assert.rejects(()=>endSession((async()=>{throw new Error('network');}) as typeof fetch),/ออกจากระบบไม่สำเร็จ/);
});
