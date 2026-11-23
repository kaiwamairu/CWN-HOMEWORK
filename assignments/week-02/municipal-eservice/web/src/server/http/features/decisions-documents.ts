import { approveCase, rejectCase } from '../../domain/approvals.ts';
import { issueDocument, publicOrigin, readDocumentPdf, verifyDocument } from '../../domain/documents.ts';
import type { Principal } from '../../security/policy.ts';
import type { Context } from '../context.ts';
import { json } from '../errors.ts';

export const DECISION_PATH = /^\/api\/cases\/([^/]+)\/(approve|reject)$/;
export const ISSUE_PATH = /^\/api\/officer\/cases\/([^/]+)\/issue$/;
export const VERIFY_PATH = /^\/api\/verify\/([^/]+)$/;
export const DOCUMENT_PDF_PATH = /^\/api\/documents\/([^/]+)\/pdf$/;

function methodNotAllowed(allow: string): Response {
  return json({ code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' }, 405, { Allow: allow });
}

/** Bodies are optional; a missing or malformed body reaches the domain as empty fields. */
async function readFields(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function segment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Approve/reject (CONTRACT 6.3), issue (6.3), public verify (6.4) and document PDF (6.2).
 * Returns null for any other path. Thrown `HttpError`s go through the shared `errorResponse`.
 */
export async function handleDecisionsDocuments(request: Request, ctx: Context, actor: Principal | null): Promise<Response | null> {
  const { pathname } = new URL(request.url);

  const decision = DECISION_PATH.exec(pathname);
  if (decision) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const caseNo = segment(decision[1]);
    if (decision[2] === 'approve') return json(approveCase(ctx, actor, caseNo));
    const fields = await readFields(request);
    return json(rejectCase(ctx, actor, caseNo, fields.reason));
  }

  const issue = ISSUE_PATH.exec(pathname);
  if (issue) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    return json(issueDocument(ctx, actor, segment(issue[1]), publicOrigin(request.headers)));
  }

  const verify = VERIFY_PATH.exec(pathname);
  if (verify) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const result = verifyDocument(ctx, segment(verify[1]));
    return result ? json(result) : json({ result: 'NOT_FOUND' }, 404);
  }

  const pdf = DOCUMENT_PDF_PATH.exec(pathname);
  if (pdf) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const file = readDocumentPdf(ctx.db, actor, segment(pdf[1]));
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(file.bytes.length),
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return null;
}
