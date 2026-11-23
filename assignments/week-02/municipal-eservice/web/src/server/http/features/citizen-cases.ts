import { assertOwnCase, cancelCase, listOwnCases, readCaseDetail, resubmitCase, type CorrectionFile } from '../../domain/cases.ts';
import type { Principal } from '../../security/policy.ts';
import type { Context } from '../context.ts';
import { HttpError, json } from '../errors.ts';

export const CASES_PATH = /^\/api\/cases$/;
export const CASE_PATH = /^\/api\/cases\/([^/]+)$/;
export const CASE_COMMAND_PATH = /^\/api\/cases\/([^/]+)\/(cancel|resubmit)$/;

function caseNoFrom(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The correction body is optional: empty, JSON or multipart with zero or more `file` parts. */
async function readCorrectionFiles(request: Request): Promise<CorrectionFile[]> {
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get('content-type') ?? '')) return [];
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError('INVALID_REQUEST');
  }
  const files: CorrectionFile[] = [];
  for (const part of [...form.getAll('file'), ...form.getAll('files')]) {
    if (!(part instanceof File)) throw new HttpError('INVALID_REQUEST');
    // Browsers submit an empty part when the optional input is left blank.
    if (part.size === 0 && part.name === '') continue;
    files.push({ name: part.name, bytes: new Uint8Array(await part.arrayBuffer()) });
  }
  return files;
}

/**
 * Citizen case routes (CONTRACT §6.2, §6.7). Call after the shared route, method and session checks.
 * Returns null for unrelated paths, including `/api/cases/:caseNo/files` and approve/reject.
 */
export async function handleCitizenCases(request: Request, ctx: Context, actor: Principal | null): Promise<Response | null> {
  const { pathname } = new URL(request.url);

  if (CASES_PATH.test(pathname)) {
    if (request.method !== 'GET') throw new HttpError('METHOD_NOT_ALLOWED');
    return json({ items: listOwnCases(ctx, actor) });
  }

  const detail = CASE_PATH.exec(pathname);
  if (detail) {
    if (request.method !== 'GET') throw new HttpError('METHOD_NOT_ALLOWED');
    return json(readCaseDetail(ctx, actor, caseNoFrom(detail[1])));
  }

  const command = CASE_COMMAND_PATH.exec(pathname);
  if (!command) return null;
  if (request.method !== 'POST') throw new HttpError('METHOD_NOT_ALLOWED');
  const caseNo = caseNoFrom(command[1]);
  if (command[2] === 'cancel') return json(cancelCase(ctx, actor, caseNo));
  assertOwnCase(ctx, actor, caseNo);
  return json(resubmitCase(ctx, actor, caseNo, await readCorrectionFiles(request)));
}
