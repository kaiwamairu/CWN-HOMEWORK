import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import type { Context } from '../http/context.ts';
import { HttpError } from '../http/errors.ts';
import { requireRole, type Principal } from '../security/policy.ts';
import { appendAudit } from './audit.ts';
import { readClock } from './clock.ts';
import { MAX_TEXT_LENGTH, MIN_REASON_LENGTH, reasonLength } from './review.ts';

type DecisionContext = Pick<Context, 'db' | 'testMode' | 'bugModes'>;
export type Decision = 'approve' | 'reject';

export interface DecisionRow {
  case_no: string;
  service_id: string;
  status: string;
  current_dept: string | null;
  owner: string | null;
  first_registry_claimant: string | null;
  approved_by: string | null;
}

export interface DecisionPermissions {
  approve: boolean;
  reject: boolean;
  issue: boolean;
}

/** BR-21: SV-01 is decided by the officer holding it; SV-02/03 by the head. */
export function isHeadApprovedService(serviceId: string): boolean {
  return serviceId === 'SV-02' || serviceId === 'SV-03';
}

/** The only status in which each service can be decided (DECISIONS §5). */
export function decisionStatus(serviceId: string): 'IN_REVIEW' | 'PENDING_APPROVAL' {
  return isHeadApprovedService(serviceId) ? 'PENDING_APPROVAL' : 'IN_REVIEW';
}

/**
 * BUGS B07 skips exactly one server check: the service-authority check for an officer
 * approving SV-02. State, holder and every other rule stay in force, and the UI is unchanged.
 */
function b07Bypass(ctx: Pick<Context, 'testMode' | 'bugModes'>, user: Principal, row: DecisionRow, decision: Decision): boolean {
  return ctx.testMode && ctx.bugModes.has('B07') && decision === 'approve' && user.role === 'officer' && row.service_id === 'SV-02';
}

/** Service authority only (no state): holder for SV-01, head for SV-02/03 (A-28). */
export function hasDecisionAuthority(user: Principal, row: DecisionRow): boolean {
  if (isHeadApprovedService(row.service_id)) return user.role === 'head';
  return user.role === 'officer' && row.owner === user.userId && !!user.dept && user.dept === row.current_dept;
}

/**
 * A-27 issuer: SV-01 → the officer who held and approved it · SV-02/03 → the registry officer
 * who claimed the first step. The head never issues.
 */
export function issuerOf(row: Pick<DecisionRow, 'service_id' | 'owner' | 'first_registry_claimant' | 'approved_by'>): string | null {
  if (isHeadApprovedService(row.service_id)) return row.first_registry_claimant;
  return row.approved_by ?? row.owner;
}

export function readDecisionRow(db: Database.Database, caseNo: string): DecisionRow | undefined {
  return db.prepare(`
    SELECT case_no, service_id, status, current_dept, owner, first_registry_claimant, approved_by
    FROM cases WHERE case_no = ?
  `).get(caseNo) as DecisionRow | undefined;
}

/** CONTRACT §6.3 check order: 401/403 role → 404 unknown → 403 authority → 409 state. */
function authorizeDecision(ctx: DecisionContext, actor: Principal | null, row: DecisionRow | undefined, decision: Decision) {
  const user = requireRole(actor, ['officer', 'head']);
  if (!row) throw new HttpError('NOT_FOUND');
  if (!hasDecisionAuthority(user, row) && !b07Bypass(ctx, user, row, decision)) throw new HttpError('FORBIDDEN');
  if (row.status !== decisionStatus(row.service_id)) throw new HttpError('INVALID_STATE');
  return { user, row };
}

/** `POST /api/cases/:caseNo/approve` → `{status:'APPROVED'}`. The case stays open until ISSUE. */
export function approveCase(ctx: DecisionContext, actor: Principal | null, caseNo: string) {
  const { db, testMode } = ctx;
  return immediate(db, () => {
    const { user, row } = authorizeDecision(ctx, actor, readDecisionRow(db, caseNo), 'approve');
    const now = readClock(db, testMode);
    const from = row.status;
    // SV-01 keeps its holder (the issuer). SV-02/03 return unowned to the registry issuance step.
    const updated = isHeadApprovedService(row.service_id)
      ? db.prepare(`
          UPDATE cases SET status = 'APPROVED', approved_by = @userId, owner = NULL, current_dept = 'registry'
          WHERE case_no = @caseNo AND status = @from
        `).run({ userId: user.userId, caseNo, from })
      : db.prepare(`
          UPDATE cases SET status = 'APPROVED', approved_by = @userId
          WHERE case_no = @caseNo AND status = @from AND owner = @userId
        `).run({ userId: user.userId, caseNo, from });
    if (updated.changes !== 1) throw new HttpError('INVALID_STATE');

    db.prepare(`
      INSERT INTO timeline(case_no, event, actor, effective_at, from_status, to_status, note)
      VALUES (?, 'APPROVE', ?, ?, ?, 'APPROVED', '')
    `).run(caseNo, user.userId, now, from);
    appendAudit(db, {
      time: now, username: user.username, role: user.role, event: 'APPROVE',
      caseNo, fromStatus: from, toStatus: 'APPROVED', detail: '',
    });
    return { status: 'APPROVED' as const };
  });
}

/**
 * `POST /api/cases/:caseNo/reject` → `{status:'REJECTED',closedAt}`. Same authority as approve,
 * trimmed reason ≥ 10 (A-44), closes the case at the current clock. Fees are not refunded (A-13).
 */
export function rejectCase(ctx: DecisionContext, actor: Principal | null, caseNo: string, reason: unknown) {
  const { db, testMode } = ctx;
  return immediate(db, () => {
    const { user, row } = authorizeDecision(ctx, actor, readDecisionRow(db, caseNo), 'reject');
    if (typeof reason === 'string' && reason.length > MAX_TEXT_LENGTH) throw new HttpError('INVALID_REQUEST');
    if (reasonLength(reason) < MIN_REASON_LENGTH) throw new HttpError('REASON_TOO_SHORT');
    const text = (reason as string).trim();
    const now = readClock(db, testMode);
    const from = row.status;

    const updated = db.prepare(`
      UPDATE cases SET status = 'REJECTED', closed_at = @now,
        owner = CASE WHEN @headStep THEN NULL ELSE owner END
      WHERE case_no = @caseNo AND status = @from
    `).run({ now, headStep: isHeadApprovedService(row.service_id) ? 1 : 0, caseNo, from });
    if (updated.changes !== 1) throw new HttpError('INVALID_STATE');

    db.prepare(`
      INSERT INTO timeline(case_no, event, actor, effective_at, from_status, to_status, note)
      VALUES (?, 'REJECT', ?, ?, ?, 'REJECTED', ?)
    `).run(caseNo, user.userId, now, from, text);
    appendAudit(db, {
      time: now, username: user.username, role: user.role, event: 'REJECT',
      caseNo, fromStatus: from, toStatus: 'REJECTED', detail: text,
    });
    return { status: 'REJECTED' as const, closedAt: now };
  });
}

/**
 * Which buttons `/officer/cases/:caseNo` renders (CONTRACT 0.5: absent, not disabled).
 * BUG_MODE never changes these; B07 is an API-only defect.
 */
export function decisionPermissions(db: Database.Database, actor: Principal | null, caseNo: string): DecisionPermissions {
  const row = readDecisionRow(db, caseNo);
  if (!actor || !row || (actor.role !== 'officer' && actor.role !== 'head')) return { approve: false, reject: false, issue: false };
  const decide = hasDecisionAuthority(actor, row) && row.status === decisionStatus(row.service_id);
  return {
    approve: decide,
    reject: decide,
    issue: actor.role === 'officer' && row.status === 'APPROVED' && issuerOf(row) === actor.userId,
  };
}

/** Server-side guard for mounting `DecisionControls` (the panel stays absent when false). */
export function hasDecisionControls(can: DecisionPermissions): boolean {
  return can.approve || can.reject || can.issue;
}

export interface ApprovalRow {
  caseNo: string;
  serviceId: string;
  applicantName: string;
  dueAt: string;
  step: number | null;
}

/** `/head/approvals`: every PENDING_APPROVAL case, earliest due first then case number (BR-16). */
export function listPendingApprovals(db: Database.Database, actor: Principal | null): ApprovalRow[] {
  requireRole(actor, ['head']);
  return db.prepare(`
    SELECT c.case_no AS caseNo, c.service_id AS serviceId, u.name AS applicantName, c.due_at AS dueAt, c.step
    FROM cases AS c JOIN users AS u ON u.id = c.applicant
    WHERE c.status = 'PENDING_APPROVAL'
    ORDER BY julianday(c.due_at), c.case_no
  `).all() as ApprovalRow[];
}
