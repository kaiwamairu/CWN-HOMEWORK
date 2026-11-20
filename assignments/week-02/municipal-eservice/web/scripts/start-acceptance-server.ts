import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadLocalEnv } from '../src/server/load-env.ts';
import { readConfig } from '../src/server/config.ts';
import { openDatabase } from '../src/server/db/connection.ts';
import { seed } from '../src/server/db/seed.ts';

/** Called only inside the owned server process, never while resolving reporter config. */
export function ensureAcceptanceKeys(env: Record<string, string | undefined> = process.env): void {
  for (const name of ['DATA_KEY_HEX', 'ID_LOOKUP_KEY_HEX', 'DOC_HMAC_KEY_HEX']) {
    if (env[name] === undefined) env[name] = randomBytes(32).toString('hex');
  }
}

/** Only the owned acceptance launcher initializes an otherwise unseeded database. */
export function prepareAcceptanceDatabase(config: ReturnType<typeof readConfig>): void {
  const db = openDatabase(config.dbPath);
  try {
    if (!db.prepare('SELECT id FROM runtime_control WHERE id=1').get()) seed(db, config.keys);
  } finally { db.close(); }
}

export async function startAcceptanceServer(): Promise<void> {
  loadLocalEnv();
  ensureAcceptanceKeys();
  prepareAcceptanceDatabase(readConfig());
  await import(new URL('../dist/server.js', import.meta.url).href);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await startAcceptanceServer();
