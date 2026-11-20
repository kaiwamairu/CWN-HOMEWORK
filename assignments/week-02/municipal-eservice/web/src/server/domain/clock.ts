import type Database from 'better-sqlite3';
import { toBangkokIso } from './calendar.ts';
export const INITIAL_NOW='2026-12-01T09:00:00+07:00';
export function readClock(db:Database.Database,testMode:boolean):string{
 if(!testMode)return toBangkokIso(new Date());
 const row=db.prepare('SELECT frozen_now FROM runtime_control WHERE id=1').get() as {frozen_now:string}|undefined;
 if(!row)throw new Error('Database must be seeded');return row.frozen_now;
}
export function setClock(db:Database.Database,now:string):string{
 // Parse strict ISO timestamps only; calendar validates dates as well as offsets.
 const normalized=toBangkokIso(now);db.prepare('UPDATE runtime_control SET frozen_now=? WHERE id=1').run(normalized);return normalized;
}
export function holidays(db:Database.Database,bugs:ReadonlySet<string>=new Set()):ReadonlySet<string>{
 return new Set(bugs.has('B03')?[]:(db.prepare('SELECT date FROM holidays').all() as {date:string}[]).map(r=>r.date));
}
