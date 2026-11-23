// B14 · NFR-04 inspector self-test: it must report 0 on the encrypted seed and must actually find
// planted plaintext (in a row, a blob, the journal/WAL siblings and a web log), so a passing
// TC-NFR-04 cannot come from an inspector that is blind.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../../src/server/db/connection.ts';
import { seed } from '../../src/server/db/seed.ts';
import { inspect } from '../../scripts/inspect-at-rest.ts';

const keys = { dataKey: Buffer.alloc(32, 1), lookupKey: Buffer.alloc(32, 2), documentKey: Buffer.alloc(32, 3) };
const NEEDLES = ['1101700123456', '3100600987659', '1909900555015', '5500400111221', '0812345678', '0823456789', '0834567890', '0845678901',
  '1-1017-00123-45-6', '3-1006-00987-65-9', '1-9099-00555-01-5', '5-5004-00111-22-1'];
const INSPECTOR = resolve(import.meta.dirname, '../../scripts/inspect-at-rest.ts');

function seeded() {
  const dir = mkdtempSync(join(tmpdir(), 'civic-inspect-'));
  const dbPath = join(dir, 'acceptance.sqlite');
  const db = openDatabase(dbPath);
  seed(db, keys);
  return { dir, dbPath, db, done: () => { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true }); } };
}

test('seeded DB: all 12 personal values are found 0 times and the CLI exits 0 with a JSON last line', () => {
  const s = seeded();
  try {
    s.db.close();
    const report = inspect(s.dbPath, NEEDLES);
    assert.deepEqual(Object.keys(report.counts).sort(), [...NEEDLES].sort());
    assert.ok(Object.values(report.counts).every((count) => count === 0), JSON.stringify(report.counts));
    assert.ok(report.scanned.includes(s.dbPath));
    assert.ok(report.scanned.includes(`${s.dbPath}#dump`));
    assert.match(report.method, /AES-256-GCM/);
    const run = spawnSync(process.execPath, ['--import', 'tsx', INSPECTOR, '--json', '--', ...NEEDLES], { env: { ...process.env, DB_PATH: s.dbPath }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const last = JSON.parse(run.stdout.trim().split('\n').at(-1)!);
    assert.equal(last.dbPath, s.dbPath);
  } finally { s.done(); }
});

test('planted plaintext is found in text rows, blobs (UTF-16 too), sibling files and logs; the CLI then exits 1', () => {
  const s = seeded();
  try {
    s.db.prepare("UPDATE services SET name = name || ' 0812345678' WHERE id='SV-01'").run();
    const blob = Buffer.from('id 3100600987659', 'utf16le');
    s.db.prepare("UPDATE files SET bytes = ?, size = ? WHERE id = (SELECT min(id) FROM files)").run(blob, blob.length);
    s.db.close();
    writeFileSync(`${s.dbPath}-journal`, 'stale 1909900555015');
    writeFileSync(join(s.dir, 'server.log'), 'request body {"mobile":"0845678901","id":"5-5004-00111-22-1"}');
    const report = inspect(s.dbPath, NEEDLES);
    assert.ok(report.counts['0812345678']! >= 1);
    assert.ok(report.counts['3100600987659']! >= 1);
    assert.ok(report.counts['1909900555015']! >= 1);
    assert.ok(report.counts['0845678901']! >= 1);
    assert.ok(report.counts['5-5004-00111-22-1']! >= 1);
    assert.equal(report.counts['1101700123456'], 0);
    assert.ok(report.scanned.includes(join(s.dir, 'server.log')));
    const run = spawnSync(process.execPath, ['--import', 'tsx', INSPECTOR, '--json', '--', ...NEEDLES], { env: { ...process.env, DB_PATH: s.dbPath }, encoding: 'utf8' });
    assert.equal(run.status, 1);
  } finally { s.done(); }
});

test('inspector errors (no DB_PATH, missing DB, no needles) exit non-zero', () => {
  const none = spawnSync(process.execPath, ['--import', 'tsx', INSPECTOR, '--json', '--', '0812345678'], { env: { ...process.env, DB_PATH: '' }, encoding: 'utf8' });
  assert.notEqual(none.status, 0);
  const missing = spawnSync(process.execPath, ['--import', 'tsx', INSPECTOR, '--json', '--', '0812345678'], { env: { ...process.env, DB_PATH: join(tmpdir(), 'no-such-civic.sqlite') }, encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  const s = seeded();
  try {
    s.db.close();
    const empty = spawnSync(process.execPath, ['--import', 'tsx', INSPECTOR, '--json'], { env: { ...process.env, DB_PATH: s.dbPath }, encoding: 'utf8' });
    assert.notEqual(empty.status, 0);
  } finally { s.done(); }
});
