import type Database from 'better-sqlite3';
import type { Keys } from '../config.ts';
import { readConfig } from '../config.ts';
import { openDatabase } from '../db/connection.ts';
export interface Context{db:Database.Database;keys:Keys;testMode:boolean;bugModes:ReadonlySet<string>}
let context:Context|undefined;
export function getContext():Context{if(!context){const config=readConfig();const db=openDatabase(config.dbPath);if(!db.prepare('SELECT id FROM runtime_control').get()){db.close();throw new Error('Run db:seed before starting the app');}context={db,keys:config.keys,testMode:config.testMode,bugModes:config.bugModes};}return context;}
export function closeContext(){context?.db.close();context=undefined;}
