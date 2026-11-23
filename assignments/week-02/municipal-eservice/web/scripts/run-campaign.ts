// T073 acceptance + mutation campaign (BUGS.md §3). Exclusive: owns every server it starts.
//   npm run build && node --import tsx scripts/run-campaign.ts [--out evidence/campaign-<stamp>] [--port 3000] [--only baseline,B01,...]
// Order: hooks-disabled probe → clean baseline ×2 on ONE server → B01..B12 one per fresh server →
// combined B03,B07 and B01,B05,B09 → final clean baseline. Every run executes the same unchanged
// 51-case Playwright suite (ACCEPTANCE_OWNED_SERVER=1) against a fresh isolated TEST_MODE DB and is
// judged by compare-results.ts (required ⊆ failed ⊆ required ∪ allowed, no skips/timeouts/infra).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXPECTATIONS, judgeRun, readPlaywrightResults, type RunJudgement } from './compare-results.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

export interface CampaignStep { id: string; bugMode: string; passes: number }
export const STEPS: readonly CampaignStep[] = [
  { id: 'baseline', bugMode: '', passes: 2 },
  ...['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12'].map((id) => ({ id, bugMode: id, passes: 1 })),
  { id: 'B03+B07', bugMode: 'B03,B07', passes: 1 },
  { id: 'B01+B05+B09', bugMode: 'B01,B05,B09', passes: 1 },
  { id: 'final', bugMode: '', passes: 1 },
];

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

interface Server { child: ChildProcess; baseUrl: string; dbPath: string; log: string }

function keys(): Record<string, string> {
  return { DATA_KEY_HEX: randomBytes(32).toString('hex'), ID_LOOKUP_KEY_HEX: randomBytes(32).toString('hex'), DOC_HMAC_KEY_HEX: randomBytes(32).toString('hex') };
}

async function waitHealthy(baseUrl: string, child: ChildProcess, ms = 120_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      // /api/health runs the lifecycle hook like any request; it is part of the normal contract.
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.status === 200) return;
    } catch { /* not listening yet */ }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`server at ${baseUrl} not healthy within ${ms} ms`);
}

async function startServer(dir: string, port: number, testMode: '1' | '0', bugMode: string): Promise<Server> {
  const varDir = join(dir, 'var');
  rmSync(varDir, { recursive: true, force: true });
  mkdirSync(varDir, { recursive: true });
  const dbPath = join(varDir, 'campaign.sqlite');
  const log = join(varDir, 'server.log');
  const out = createWriteStream(log);
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/start-acceptance-server.ts'], {
    cwd: ROOT,
    env: { ...process.env, ...keys(), TEST_MODE: testMode, BUG_MODE: bugMode, DB_PATH: dbPath, PORT: String(port), TZ: 'Asia/Bangkok', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout!.pipe(out); child.stderr!.pipe(out);
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitHealthy(baseUrl, child);
  return { child, baseUrl, dbPath, log };
}

async function stopServer(server: Server): Promise<void> {
  if (server.child.exitCode !== null) return;
  const exited = new Promise((done) => server.child.once('exit', done));
  server.child.kill('SIGTERM');
  const timer = setTimeout(() => server.child.kill('SIGKILL'), 10_000);
  await exited; clearTimeout(timer);
}

function runSuite(server: Server, bugMode: string, evidence: string): number | null {
  const run = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test'] /* config reporters: list + json + html */, {
    cwd: ROOT,
    env: { ...process.env, ACCEPTANCE_OWNED_SERVER: '1', BASE_URL: server.baseUrl, TEST_MODE: '1', BUG_MODE: bugMode, DB_PATH: server.dbPath, ACCEPTANCE_EVIDENCE_DIR: evidence, TZ: 'Asia/Bangkok' },
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(join(evidence, 'stdout.txt'), `${run.stdout ?? ''}\n--- stderr ---\n${run.stderr ?? ''}`);
  return run.status;
}

/** DECISIONS §15: hooks exist only with TEST_MODE=1. A hooks-disabled server must answer 404 and stay unchanged. */
async function probeDisabledHooks(dir: string, port: number): Promise<Record<string, unknown>> {
  mkdirSync(dir, { recursive: true });
  const server = await startServer(dir, port, '0', 'B01,B05');
  try {
    const probes: Record<string, number> = {};
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`${server.baseUrl}${path}`, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      probes[`${method} ${path}`] = response.status;
      return response;
    };
    const healthBefore = (await fetch(`${server.baseUrl}/api/health`)).status;
    await call('POST', '/api/test/reset');
    await call('GET', '/api/test/clock');
    await call('PUT', '/api/test/clock', { now: '2030-01-01T00:00:00+07:00' });
    await call('POST', '/api/test/payments/PP-0001/pay', { amount: 20 });
    await call('POST', '/api/test/documents/DOC-2569-000001/tamper');
    const verify = await (await fetch(`${server.baseUrl}/api/verify/K7M2Q9XA`)).json() as { result?: string };
    const result = { healthBefore, probes, allNotFound: Object.values(probes).every((status) => status === 404), seedDocumentStillValid: verify.result, bugModeIgnoredWithoutTestMode: 'BUG_MODE=B01,B05 supplied; config drops bug modes when TEST_MODE!=1' };
    writeFileSync(join(dir, 'disabled-hooks.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally { await stopServer(server); }
}

export async function runCampaign(): Promise<number> {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const out = resolve(ROOT, arg('out') ?? `evidence/campaign-${stamp}`);
  const port = Number(arg('port') ?? 3000);
  const only = arg('only')?.split(',');
  if (!existsSync(join(ROOT, 'dist/server.js'))) throw new Error('Run npm run build first (dist/server.js missing)');
  mkdirSync(out, { recursive: true });
  const lockHash = spawnSync('sha256sum', ['package-lock.json'], { cwd: ROOT, encoding: 'utf8' }).stdout.split(' ')[0];
  const summary: { startedAt: string; node: string; lockfileSha256: string; disabledHooks?: unknown; runs: Array<RunJudgement & { step: string; pass: number; exitCode: number | null; startedAt: string; finishedAt: string }>; finishedAt?: string; ok?: boolean } = {
    startedAt: new Date().toISOString(), node: process.version, lockfileSha256: lockHash, runs: [],
  };
  const save = () => writeFileSync(join(out, 'campaign.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (!only || only.includes('hooks')) summary.disabledHooks = await probeDisabledHooks(join(out, 'hooks-disabled'), port);
  save();
  for (const step of STEPS) {
    if (only && !only.includes(step.id)) continue;
    const dir = join(out, step.id.replace(/\+/g, '_'));
    mkdirSync(dir, { recursive: true });
    const server = await startServer(dir, port, '1', step.bugMode);
    try {
      for (let pass = 1; pass <= step.passes; pass++) {
        const evidence = join(dir, `pass-${pass}`);
        mkdirSync(evidence, { recursive: true });
        const startedAt = new Date().toISOString();
        process.stdout.write(`[campaign] ${step.id} pass ${pass} BUG_MODE='${step.bugMode}' …\n`);
        const exitCode = runSuite(server, step.bugMode, evidence);
        const resultsFile = join(evidence, 'results.json');
        const judgement = existsSync(resultsFile)
          ? judgeRun(readPlaywrightResults(resultsFile), EXPECTATIONS[step.id]!)
          : judgeRun({ outcomes: [], errors: [`no results.json (playwright exit ${exitCode})`] }, EXPECTATIONS[step.id]!);
        summary.runs.push({ step: step.id, pass, exitCode, startedAt, finishedAt: new Date().toISOString(), ...judgement });
        process.stdout.write(`[campaign] ${step.id} pass ${pass}: ${judgement.passed} passed · failed [${judgement.failed.join(', ')}] → ${judgement.ok ? 'OK' : `NOT OK: ${judgement.problems.join('; ')}`}\n`);
        save();
      }
    } finally { await stopServer(server); }
  }
  summary.finishedAt = new Date().toISOString();
  summary.ok = summary.runs.every((run) => run.ok) && (!summary.disabledHooks || (summary.disabledHooks as { allNotFound: boolean }).allNotFound);
  save();
  process.stdout.write(`[campaign] ${summary.ok ? 'ALL OK' : 'FAILED'} → ${join(out, 'campaign.json')}\n`);
  return summary.ok ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = await runCampaign();
