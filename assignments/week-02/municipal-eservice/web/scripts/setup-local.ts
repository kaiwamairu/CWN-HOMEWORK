import { randomBytes } from 'node:crypto';
import { existsSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
if(existsSync('.env.local')){console.log('Existing .env.local retained.');}else{
 const path=resolve('var/civic.sqlite').replaceAll('\\','/');
 const text=`# Private local classroom configuration; never commit/share this file.\nTEST_MODE=1\nBUG_MODE=\nTZ=Asia/Bangkok\nPORT=3000\nDB_PATH=${path}\nDATA_KEY_HEX=${randomBytes(32).toString('hex')}\nID_LOOKUP_KEY_HEX=${randomBytes(32).toString('hex')}\nDOC_HMAC_KEY_HEX=${randomBytes(32).toString('hex')}\n`;
 writeFileSync('.env.local',text,{flag:'wx',mode:0o600});console.log('Created private .env.local. Run npm run db:seed.');
}
