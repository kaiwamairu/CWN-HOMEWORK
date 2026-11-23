// TC-NFR-04 at-rest inspector (T073). Interface: handoffs/B02-test-oracles.md §4.
//   node --import tsx scripts/inspect-at-rest.ts [--json] -- <needle> ...   (env DB_PATH = absolute path)
// Byte-scans the SQLite file, its -wal/-shm/-journal siblings, a logical dump of every table and
// any web log beside the DB (or in INSPECT_LOGS, comma separated). Needles are counted both as
// UTF-8/ASCII and UTF-16LE bytes. The last stdout line is the JSON report; exit 0 only if all counts are 0.
import Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface InspectionReport { dbPath: string; scanned: string[]; counts: Record<string, number>; method: string }

export const METHOD = 'AES-256-GCM (12-byte random IV, 16-byte tag, DATA_KEY_HEX) for ID number and mobile; HMAC-SHA256 lookup (ID_LOOKUP_KEY_HEX); only last 3 ID digits kept in clear for masking';

function occurrences(haystack: Buffer, needle: Buffer): number {
  if (!needle.length) return 0;
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) count++;
  return count;
}

/** Every value of every table, text as UTF-8 and blobs as raw bytes, so plaintext inside rows cannot hide behind page layout. */
export function logicalDump(dbPath: string): Buffer {
  // Deserialize a byte copy: the live server DB (and any hot journal) is never opened or rolled back.
  const db = new Database(readFileSync(dbPath));
  try {
    const parts: Buffer[] = [];
    const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table','index','view','trigger') ORDER BY name").all() as { name: string; sql: string | null }[];
    for (const { name, sql } of tables) {
      parts.push(Buffer.from(`-- ${name}\n${sql ?? ''}\n`));
      if (!sql?.startsWith('CREATE TABLE')) continue;
      for (const row of db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`).raw().iterate() as Iterable<unknown[]>) {
        for (const value of row) parts.push(Buffer.isBuffer(value) ? value : Buffer.from(`${String(value)}\t`));
        parts.push(Buffer.from('\n'));
      }
    }
    return Buffer.concat(parts);
  } finally { db.close(); }
}

export function inspect(dbPath: string, needles: readonly string[], logs: readonly string[] = []): InspectionReport {
  if (!isAbsolute(dbPath)) throw new Error('DB_PATH must be absolute');
  if (!existsSync(dbPath)) throw new Error(`DB_PATH not found: ${dbPath}`);
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`].filter((path) => existsSync(path));
  const dir = dirname(dbPath);
  const nearbyLogs = readdirSync(dir).filter((name) => /\.(log|out|err)$/i.test(name)).map((name) => join(dir, name));
  for (const path of [...nearbyLogs, ...logs]) if (existsSync(path) && statSync(path).isFile() && !files.includes(path)) files.push(path);
  const blobs: { path: string; bytes: Buffer }[] = files.map((path) => ({ path, bytes: readFileSync(path) }));
  blobs.push({ path: `${dbPath}#dump`, bytes: logicalDump(dbPath) });
  const counts: Record<string, number> = {};
  for (const needle of needles) {
    const utf8 = Buffer.from(needle, 'utf8'), utf16 = Buffer.from(needle, 'utf16le');
    counts[needle] = blobs.reduce((sum, { bytes }) => sum + occurrences(bytes, utf8) + occurrences(bytes, utf16), 0);
  }
  return { dbPath, scanned: blobs.map(({ path }) => path), counts, method: METHOD };
}

function main(argv: string[]): number {
  const split = argv.indexOf('--');
  const flags = split === -1 ? argv : argv.slice(0, split);
  const needles = split === -1 ? [] : argv.slice(split + 1);
  const raw = process.env.DB_PATH;
  try {
    if (!raw) throw new Error('DB_PATH is required');
    if (!needles.length) throw new Error('Pass at least one needle after --');
    const report = inspect(resolve(raw), needles, (process.env.INSPECT_LOGS ?? '').split(',').filter(Boolean).map((path) => resolve(path)));
    if (!flags.includes('--json')) {
      for (const path of report.scanned) process.stdout.write(`scanned ${path}\n`);
      for (const [needle, count] of Object.entries(report.counts)) process.stdout.write(`${count === 0 ? 'ok  ' : 'FOUND'} ${needle} ${count}\n`);
    }
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return Object.values(report.counts).every((count) => count === 0) ? 0 : 1;
  } catch (error) {
    process.stderr.write(`inspect-at-rest: ${(error as Error).message}\n`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = main(process.argv.slice(2));
