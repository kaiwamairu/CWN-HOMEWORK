/**
 * `GET /api/notifications` (CONTRACT 6.3): officer/head only, the caller's own items.
 * B14 wires this into the shared router; returns null for paths it does not own.
 */
import type { Context } from '../context.ts';
import { HttpError, json } from '../errors.ts';
import { requireRole, type Principal } from '../../security/policy.ts';
import { listNotifications } from '../../domain/notifications.ts';

export const NOTIFICATIONS_PATH = /^\/api\/notifications$/;
export const NOTIFICATION_ROLES = ['officer', 'head'] as const;

export function handleNotifications(request: Request, ctx: Context, actor: Principal | null): Response | null {
  if (!NOTIFICATIONS_PATH.test(new URL(request.url).pathname)) return null;
  if (request.method !== 'GET') throw new HttpError('METHOD_NOT_ALLOWED');
  const user = requireRole(actor, NOTIFICATION_ROLES);
  return json({ items: listNotifications(ctx.db, user.userId) });
}
