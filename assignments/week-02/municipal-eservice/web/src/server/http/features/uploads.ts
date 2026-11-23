import { addDraftFile, removeDraftFile, requireUnpaidDraft } from '../../domain/uploads.ts';
import type { Principal } from '../../security/policy.ts';
import type { Context } from '../context.ts';
import { HttpError, json } from '../errors.ts';

const DRAFT_FILES_PATH = /^\/api\/drafts\/([^/]+)\/files$/;
const DRAFT_FILE_PATH = /^\/api\/drafts\/([^/]+)\/files\/([^/]+)$/;

async function readUpload(request: Request) {
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get('content-type') ?? '')) {
    throw new HttpError('INVALID_REQUEST');
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError('INVALID_REQUEST');
  }
  const [file, ...extraFiles] = form.getAll('file');
  const [docKey, ...extraKeys] = form.getAll('docKey');
  if (!(file instanceof File) || typeof docKey !== 'string' || extraFiles.length || extraKeys.length) {
    throw new HttpError('INVALID_REQUEST');
  }
  return { name: file.name, docKey, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** Dispatch draft file mutations from the custom Node HTTP router. */
export async function handleUploads(request: Request, ctx: Context, actor: Principal | null): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const collection = DRAFT_FILES_PATH.exec(pathname);
  if (collection) {
    if (request.method !== 'POST') throw new HttpError('METHOD_NOT_ALLOWED');
    const draftId = collection[1];
    requireUnpaidDraft(ctx.db, actor, draftId);
    const file = await readUpload(request);
    return json(addDraftFile(ctx.db, actor, draftId, file, ctx.testMode ? ctx.bugModes : undefined), 201);
  }

  const item = DRAFT_FILE_PATH.exec(pathname);
  if (!item) return null;
  if (request.method !== 'DELETE') throw new HttpError('METHOD_NOT_ALLOWED');
  removeDraftFile(ctx.db, actor, item[1], item[2]);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
}
