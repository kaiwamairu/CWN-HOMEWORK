import { forwardCase, returnCase, unmaskIdentity } from '../../domain/review.ts';
import { listCaseAttachments, readAttachment } from '../../security/attachment-policy.ts';
import type { Principal } from '../../security/policy.ts';
import type { Context } from '../context.ts';
import { json } from '../errors.ts';

export const REVIEW_PATH = /^\/api\/officer\/cases\/([^/]+)\/(return|forward|unmask)$/;
export const CASE_FILES_PATH = /^\/api\/cases\/([^/]+)\/files$/;
export const FILE_PATH = /^\/api\/files\/([^/]+)$/;

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

function caseNoFrom(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** `POST /api/officer/cases/:caseNo/(return|forward|unmask)`. Returns null for other paths. */
export async function handleReview(request: Request, ctx: Context, actor: Principal | null): Promise<Response | null> {
  const match = REVIEW_PATH.exec(new URL(request.url).pathname);
  if (!match) return null;
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const caseNo = caseNoFrom(match[1]);
  const fields = await readFields(request);
  if (match[2] === 'return') return json(returnCase(ctx, actor, caseNo, fields.reason));
  if (match[2] === 'forward') return json(forwardCase(ctx, actor, caseNo, fields.note));
  return json(unmaskIdentity(ctx, actor, caseNo, fields.reason));
}

/** `GET /api/cases/:caseNo/files` and `GET /api/files/:fileId`. Returns null for other paths. */
export function handleAttachments(request: Request, ctx: Context, actor: Principal | null): Response | null {
  const { pathname } = new URL(request.url);
  const list = CASE_FILES_PATH.exec(pathname);
  const file = list ? null : FILE_PATH.exec(pathname);
  if (!list && !file) return null;
  if (request.method !== 'GET') return methodNotAllowed('GET');
  if (list) return json(listCaseAttachments(ctx.db, actor, caseNoFrom(list[1])));

  const content = readAttachment(ctx.db, actor, caseNoFrom(file![1]));
  return new Response(new Uint8Array(content.bytes), {
    headers: {
      'Content-Type': content.contentType,
      'Content-Length': String(content.bytes.length),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(content.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
