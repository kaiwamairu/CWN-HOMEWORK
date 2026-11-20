import next from 'next';
import { loadLocalEnv } from './src/server/load-env.ts';
import { readConfig } from './src/server/config.ts';
import { getContext,closeContext } from './src/server/http/context.ts';
import { createCivicServer } from './src/server/http/server.ts';
loadLocalEnv();const config=readConfig();const context=getContext();const dev=process.argv.includes('--dev');
const app=next({dev,hostname:'127.0.0.1',port:config.port});await app.prepare();
const server=createCivicServer(context,app.getRequestHandler());
server.on('error',()=>{process.stderr.write('CIVIC_SERVER_START_FAILED\n');closeContext();process.exitCode=1;});
server.listen(config.port,'127.0.0.1',()=>process.stdout.write(`CIVIC_SERVER_READY http://127.0.0.1:${config.port}\n`));
let shuttingDown=false;function stop(){if(shuttingDown)return;shuttingDown=true;server.close(()=>{closeContext();void app.close().then(()=>{process.exitCode=0;});});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
