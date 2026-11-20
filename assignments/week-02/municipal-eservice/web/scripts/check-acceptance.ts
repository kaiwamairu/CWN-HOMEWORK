import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface SourceCase { id: string; source_line: number }
interface RegistryCase { id: string; kind: string; sourceLine: number }
export interface DiscoveredCase { title: string; expectedStatus?: string; location?: string }

/** Registry is a source map, never evidence that an acceptance assertion exists or passes. */
export function validateAcceptanceRegistry(
  registry: readonly RegistryCase[], source: readonly SourceCase[], discovered: readonly DiscoveredCase[], expectedCount = 51,
): string[] {
  const errors: string[] = [];
  const canonical = new Map(source.map((entry) => [entry.id, entry]));
  if (source.length !== expectedCount || canonical.size !== expectedCount) errors.push(`Canonical inventory must have exactly ${expectedCount} unique IDs`);
  const registryCounts = new Map<string, number>();
  for (const entry of registry) {
    registryCounts.set(entry.id, (registryCounts.get(entry.id) ?? 0) + 1);
    const original = canonical.get(entry.id);
    if (!original) errors.push(`Unknown registry ID ${entry.id}`);
    else if (entry.sourceLine !== original.source_line) errors.push(`Registry source line differs for ${entry.id}`);
    if (entry.kind !== (entry.id === 'TC-NFR-04' ? 'inspection' : 'browser-api')) errors.push(`Incorrect runner kind for ${entry.id}`);
  }
  for (const [id, count] of registryCounts) if (count > 1) errors.push(`Duplicate registry ID ${id} (${count})`);
  for (const id of canonical.keys()) if (!registryCounts.has(id)) errors.push(`Missing registry ID ${id}`);
  if (registry.length !== expectedCount) errors.push(`Registry has ${registry.length} entries; expected ${expectedCount}`);

  const actualCounts = new Map<string, number>();
  for (const entry of discovered) {
    const match = /^(TC-[A-Z]+-\d{2})(?:\s|$)/.exec(entry.title);
    if (!match) { errors.push(`Inexact canonical test title: ${entry.title}`); continue; }
    const id = match[1]!;
    actualCounts.set(id, (actualCounts.get(id) ?? 0) + 1);
    if (!canonical.has(id)) errors.push(`Unknown acceptance ID ${id}`);
    if (entry.expectedStatus && entry.expectedStatus !== 'passed') errors.push(`Skipped or nonpassing expectation for ${id}: ${entry.expectedStatus}`);
  }
  for (const [id, count] of actualCounts) if (count > 1) errors.push(`Duplicate acceptance ID ${id} (${count})`);
  for (const id of canonical.keys()) if (!actualCounts.has(id)) errors.push(`Missing acceptance ID ${id}`);
  if (discovered.length !== expectedCount) errors.push(`Discovered ${discovered.length} acceptance tests; expected ${expectedCount} (50 browser/API + 1 inspection wrapper)`);
  return errors;
}

interface ListSuite {
  title?: string;
  file?: string;
  suites?: ListSuite[];
  specs?: Array<{ title: string; file?: string; line?: number; tests: Array<{ expectedStatus?: string }> }>;
}

function collectTests(suites: readonly ListSuite[]): DiscoveredCase[] {
  const tests: DiscoveredCase[] = [];
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) tests.push({ title: spec.title, expectedStatus: test.expectedStatus, location: `${spec.file ?? suite.file}:${spec.line}` });
    }
    tests.push(...collectTests(suite.suites ?? []));
  }
  return tests;
}

export function checkAcceptance(): number {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const registry = JSON.parse(readFileSync(resolve(root, 'tests/acceptance-registry.json'), 'utf8')) as RegistryCase[];
  const inventory = JSON.parse(readFileSync(resolve(root, '../specs/001-municipal-eservice/contracts/inventory.json'), 'utf8')) as { cases: SourceCase[] };
  const require = createRequire(import.meta.url);
  const listed = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--list', '--reporter=json'], {
    cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
  });
  let discovered: DiscoveredCase[] = [];
  const discoveryErrors: string[] = [];
  if (listed.error) discoveryErrors.push(`Playwright discovery failed: ${listed.error.message}`);
  else {
    try {
      const report = JSON.parse(listed.stdout) as { suites?: ListSuite[]; errors?: Array<{ message?: string }> };
      discovered = collectTests(report.suites ?? []);
      for (const error of report.errors ?? []) discoveryErrors.push(`Playwright discovery: ${error.message ?? 'unknown error'}`);
    } catch { discoveryErrors.push('Playwright discovery did not produce a valid JSON test list'); }
    if (listed.status !== 0) discoveryErrors.push(`Playwright discovery exited ${listed.status}: ${(listed.stderr ?? '').trim()}`);
  }
  const errors = [...discoveryErrors, ...validateAcceptanceRegistry(registry, inventory.cases, discovered)];
  if (errors.length) {
    process.stderr.write(`Acceptance preflight FAILED. Registry entries are not implemented tests.\n${errors.map((error) => `- ${error}`).join('\n')}\n`);
    return 1;
  }
  process.stdout.write('Acceptance preflight: exactly 51 canonical tests discovered (50 browser/API + 1 inspection wrapper). This is discovery only; assertions have not run.\n');
  return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = checkAcceptance();
