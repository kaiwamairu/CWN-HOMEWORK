import { createDraft, deleteDraft, getDraft, listDrafts, updateDraft } from '../../domain/drafts.ts';
import { requireRole, type Principal } from '../../security/policy.ts';
import type { Context } from '../context.ts';
import { HttpError, json } from '../errors.ts';

export const DRAFTS_PATH = /^\/api\/drafts$/;
export const DRAFT_PATH = /^\/api\/drafts\/([^/]+)$/;

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Dispatch draft collection and detail routes after the shared session check. */
export async function handleDrafts(request: Request, ctx: Context, actor: Principal | null): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const { db, testMode, bugModes } = ctx;
  const bugs = testMode ? bugModes : undefined;

  if (DRAFTS_PATH.test(pathname)) {
    switch (request.method) {
      case 'GET':
        return json({ items: listDrafts(db, actor, bugs) });
      case 'POST': {
        const citizen = requireRole(actor, ['citizen']);
        return json(createDraft(db, citizen, await readBody(request), bugs), 201);
      }
      default:
        throw new HttpError('METHOD_NOT_ALLOWED');
    }
  }

  const match = DRAFT_PATH.exec(pathname);
  if (!match) return null;
  const draftId = match[1];
  switch (request.method) {
    case 'GET':
      return json(getDraft(db, actor, draftId, bugs));
    case 'PATCH': {
      const citizen = requireRole(actor, ['citizen']);
      return json(updateDraft(db, citizen, draftId, await readBody(request), bugs));
    }
    case 'DELETE':
      deleteDraft(db, actor, draftId);
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
    default:
      throw new HttpError('METHOD_NOT_ALLOWED');
  }
}
