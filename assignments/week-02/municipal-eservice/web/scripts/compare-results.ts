// Judges one Playwright JSON report against BUGS.md §2 (required ⊆ failed ⊆ required ∪ allowed).
// Any skipped, timed-out, interrupted or infrastructure failure makes the run NOT OK regardless of sets.
//   node --import tsx scripts/compare-results.ts <results.json> <step-id>      e.g. B03 / B03+B07 / baseline
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Expectation { required: readonly string[]; allowed: readonly string[] }

const SINGLE: Record<string, Expectation> = {
  B01: { required: ['TC-FEE-01'], allowed: [] },
  B02: { required: ['TC-UPLOAD-01'], allowed: [] },
  // DECISIONS §18 "B03 กระทบอะไร" (wins over BUGS): any TC that uses remaining business days across a
  // holiday may also fail. TC-NOTI-02 part B derives …000016 'near' at Sat 5 Dec across the 7 Dec holiday.
  B03: { required: ['TC-SLA-01', 'TC-SLA-02'], allowed: ['TC-SLA-03', 'TC-RBAC-04', 'TC-NOTI-02'] },
  B04: { required: ['TC-SLA-02'], allowed: [] },
  B05: { required: ['TC-PAY-01'], allowed: [] },
  B06: { required: ['TC-RBAC-01'], allowed: [] },
  B07: { required: ['TC-RBAC-02'], allowed: ['TC-WORKFLOW-01'] },
  B08: { required: ['TC-QUEUE-02'], allowed: [] },
  B09: { required: ['TC-PDPA-02'], allowed: [] },
  B10: { required: ['TC-DASH-02'], allowed: ['TC-DASH-01', 'TC-DASH-03'] },
  B11: { required: ['TC-PDPA-03', 'TC-AUDIT-01'], allowed: [] },
  B12: { required: ['TC-WORKFLOW-04'], allowed: [] },
};

/** BUGS.md §3 step 5: a combination fails exactly the union of its members. */
function union(...ids: string[]): Expectation {
  return { required: [...new Set(ids.flatMap((id) => SINGLE[id]!.required))], allowed: [...new Set(ids.flatMap((id) => SINGLE[id]!.allowed))] };
}

export const EXPECTATIONS: Record<string, Expectation> = {
  baseline: { required: [], allowed: [] },
  final: { required: [], allowed: [] },
  ...SINGLE,
  'B03+B07': union('B03', 'B07'),
  'B01+B05+B09': union('B01', 'B05', 'B09'),
};

export interface TestOutcome { id: string; title: string; status: string; error: string }

interface Suite { suites?: Suite[]; specs?: Array<{ title: string; tests: Array<{ results: Array<{ status: string; error?: { message?: string }; errors?: Array<{ message?: string }> }> }> }> }

export function readPlaywrightResults(path: string): { outcomes: TestOutcome[]; errors: string[] } {
  const report = JSON.parse(readFileSync(path, 'utf8')) as { suites?: Suite[]; errors?: Array<{ message?: string }> };
  const outcomes: TestOutcome[] = [];
  const walk = (suites: readonly Suite[]) => {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) {
          const last = test.results.at(-1);
          const message = last?.error?.message ?? last?.errors?.map((error) => error.message).join('\n') ?? '';
          outcomes.push({ id: /^(TC-[A-Z]+-\d{2})/.exec(spec.title)?.[1] ?? spec.title, title: spec.title, status: last?.status ?? 'skipped', error: message.replace(/\u001b\[[0-9;]*m/g, '') });
        }
      }
      walk(suite.suites ?? []);
    }
  };
  walk(report.suites ?? []);
  return { outcomes, errors: (report.errors ?? []).map((error) => error.message ?? 'unknown error') };
}

/** Failures that do not prove a value difference (BUGS.md §3 step 4): launch/connection problems. */
const INFRA = /ECONNREFUSED|ECONNRESET|socket hang up|browserType\.launch|Executable doesn't exist|Target page, context or browser has been closed|net::ERR_/;

export interface RunJudgement { total: number; passed: number; failed: string[]; unexpectedFailures: string[]; missingFailures: string[]; acceptedSideEffects: string[]; problems: string[]; ok: boolean; failureMessages: Record<string, string> }

export function judgeRun(results: { outcomes: TestOutcome[]; errors: string[] }, expectation: Expectation): RunJudgement {
  const problems = results.errors.map((error) => `runner error: ${error.split('\n')[0]}`);
  const ids = results.outcomes.map((outcome) => outcome.id);
  if (results.outcomes.length !== 51 || new Set(ids).size !== 51) problems.push(`expected 51 unique canonical tests, got ${results.outcomes.length} (${new Set(ids).size} unique)`);
  const failed: string[] = [];
  const failureMessages: Record<string, string> = {};
  for (const outcome of results.outcomes) {
    if (outcome.status === 'passed') continue;
    if (outcome.status === 'failed') {
      failed.push(outcome.id);
      failureMessages[outcome.id] = outcome.error.split('\n').slice(0, 8).join('\n');
      if (INFRA.test(outcome.error)) problems.push(`${outcome.id} failed for an infrastructure reason`);
    } else problems.push(`${outcome.id} ${outcome.status}`); // skipped / timedOut / interrupted
  }
  failed.sort();
  const unexpectedFailures = failed.filter((id) => !expectation.required.includes(id) && !expectation.allowed.includes(id));
  const missingFailures = expectation.required.filter((id) => !failed.includes(id));
  if (unexpectedFailures.length) problems.push(`unexpected failures: ${unexpectedFailures.join(', ')}`);
  if (missingFailures.length) problems.push(`required failures that passed: ${missingFailures.join(', ')}`);
  return {
    total: results.outcomes.length,
    passed: results.outcomes.filter((outcome) => outcome.status === 'passed').length,
    failed, unexpectedFailures, missingFailures,
    acceptedSideEffects: failed.filter((id) => expectation.allowed.includes(id)),
    problems, ok: problems.length === 0, failureMessages,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [file, step] = process.argv.slice(2);
  if (!file || !step || !EXPECTATIONS[step]) {
    process.stderr.write(`usage: compare-results.ts <results.json> <${Object.keys(EXPECTATIONS).join('|')}>\n`);
    process.exitCode = 2;
  } else {
    const judgement = judgeRun(readPlaywrightResults(resolve(file)), EXPECTATIONS[step]);
    process.stdout.write(`${JSON.stringify(judgement, null, 2)}\n`);
    process.exitCode = judgement.ok ? 0 : 1;
  }
}
