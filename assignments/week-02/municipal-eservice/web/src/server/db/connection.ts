import Database from 'better-sqlite3';
import { isAbsolute, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createSchema } from './schema.ts';
export function openDatabase(path:string){
 if(!isAbsolute(path))throw new Error('DB_PATH must be absolute');
 mkdirSync(dirname(path),{recursive:true});const db=new Database(path);
 try{db.pragma('foreign_keys = ON');db.pragma('journal_mode = DELETE');db.pragma('busy_timeout = 5000');db.pragma('secure_delete = ON');createSchema(db);return db;}catch(error){db.close();throw error;}
}
/** Prepare all I/O before entering. Never queue asynchronous DB work inside this callback. */
export function immediate<T>(db:Database.Database,work:()=>T & (T extends PromiseLike<unknown>?never:unknown)):T{
 if(work.constructor.name==='AsyncFunction')throw new Error('Transactions must be synchronous');
 return db.transaction(()=>{const value=work();if(value&&typeof(value as {then?:unknown}).then==='function'){void Promise.resolve(value).catch(()=>{});throw new Error('Transactions must be synchronous');}return value;}).immediate();
}
