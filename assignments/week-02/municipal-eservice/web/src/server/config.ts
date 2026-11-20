import { isAbsolute } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { parseBugModes } from './testing/bug-modes.ts';
export interface Keys { dataKey:Buffer; lookupKey:Buffer; documentKey:Buffer }
export function readConfig(env:Record<string,string|undefined>=process.env){
 const dbPath=env.DB_PATH;if(!dbPath||!isAbsolute(dbPath))throw new Error('DB_PATH must be absolute');
 const key=(name:string)=>{const value=env[name];if(!value||!/^\p{ASCII}+$/u.test(value)||! /^[a-fA-F0-9]{64}$/.test(value))throw new Error(`${name} must be a 32-byte hex key`);return Buffer.from(value,'hex');};
 const keys={dataKey:key('DATA_KEY_HEX'),lookupKey:key('ID_LOOKUP_KEY_HEX'),documentKey:key('DOC_HMAC_KEY_HEX')};
 if(timingSafeEqual(keys.dataKey,keys.lookupKey)||timingSafeEqual(keys.dataKey,keys.documentKey)||timingSafeEqual(keys.lookupKey,keys.documentKey))throw new Error('Encryption, lookup and document keys must be distinct');
 const testMode=env.TEST_MODE==='1';const port=Number(env.PORT??3000);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
 return {dbPath,keys,testMode,bugModes:testMode?parseBugModes(env.BUG_MODE):new Set<string>(),port};
}
