import { loadLocalEnv } from '../src/server/load-env.ts';
import { readConfig } from '../src/server/config.ts';
import { openDatabase } from '../src/server/db/connection.ts';
import { seed } from '../src/server/db/seed.ts';
loadLocalEnv();const config=readConfig();const db=openDatabase(config.dbPath);try{console.log(JSON.stringify(seed(db,config.keys)));}finally{db.close();}
