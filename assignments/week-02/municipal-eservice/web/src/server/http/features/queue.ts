import { claimCase, listQueue } from '../../domain/claims.ts';
import { decrypt, type EncryptedValue } from '../../security/crypto.ts';
import type { Principal } from '../../security/policy.ts';
import type { Context } from '../context.ts';
import { json } from '../errors.ts';

export const QUEUE_PATH = /^\/api\/officer\/queue$/;
export const CLAIM_PATH = /^\/api\/officer\/cases\/([^/]+)\/claim$/;

export function handleQueue(request: Request, ctx: Context, actor: Principal | null): Response | null {
  const { pathname, searchParams } = new URL(request.url);
  if (QUEUE_PATH.test(pathname)) {
    if (request.method !== 'GET') {
      return json({ code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' }, 405, { Allow: 'GET' });
    }
    const filter = searchParams.get('filter');
    if (ctx.testMode && ctx.bugModes.has('B09')) {
      // The test mutation lives only in the queue JSON response. The page uses listQueue directly.
      return ctx.db.transaction(() => {
        const { items } = listQueue(ctx, actor, filter);
        const identityForCase = ctx.db.prepare<[string], EncryptedValue>(`
          SELECT u.id_cipher AS ciphertext, u.id_iv AS iv, u.id_tag AS tag
          FROM cases AS c JOIN users AS u ON u.id = c.applicant
          WHERE c.case_no = ?
        `);
        return json({
          items: items.map(item => {
            const identity = identityForCase.get(item.caseNo);
            return identity ? { ...item, idNo: decrypt(identity, ctx.keys.dataKey) } : item;
          }),
        });
      })();
    }
    return json({ items: listQueue(ctx, actor, filter).items });
  }

  const claim = CLAIM_PATH.exec(pathname);
  if (!claim) return null;
  if (request.method !== 'POST') {
    return json({ code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' }, 405, { Allow: 'POST' });
  }
  return json(claimCase(ctx, actor, claim[1]));
}
