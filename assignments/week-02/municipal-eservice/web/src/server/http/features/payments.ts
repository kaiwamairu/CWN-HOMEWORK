import { createPayment, getPayment } from '../../domain/payments.ts';
import type { Principal } from '../../security/policy.ts';
import type { Context } from '../context.ts';
import { HttpError, json } from '../errors.ts';

export const DRAFT_PAYMENT_PATH = /^\/api\/drafts\/([^/]+)\/payment$/;
export const PAYMENT_PATH = /^\/api\/payments\/([^/]+)$/;

export function handlePayments(request: Request, ctx: Context, actor: Principal | null): Response | null {
  const { pathname } = new URL(request.url);
  const draft = DRAFT_PAYMENT_PATH.exec(pathname);
  if (draft) {
    if (request.method !== 'POST') throw new HttpError('METHOD_NOT_ALLOWED');
    return json(createPayment(ctx.db, actor, draft[1], ctx.testMode, ctx.bugModes), 201);
  }

  const payment = PAYMENT_PATH.exec(pathname);
  if (!payment) return null;
  if (request.method !== 'GET') throw new HttpError('METHOD_NOT_ALLOWED');
  return json(getPayment(ctx.db, actor, payment[1], ctx.testMode));
}
