import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import type { Context } from '../http/context.ts';
import { HttpError } from '../http/errors.ts';
import { maskIdentity } from '../security/crypto.ts';
import { authorizeClaim, requireRole, type Principal } from '../security/policy.ts';
import { appendAudit } from './audit.ts';
import { readClock } from './clock.ts';
import { slaView, type SlaLevel } from './sla.ts';

type ClaimsContext = Pick<Context, 'db' | 'testMode' | 'bugModes'>;
type QueueStatus = 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED';
export type QueueFilter = 'all' | 'unclaimed' | 'mine';

export interface QueueItem {
  caseNo: string;
  serviceId: string;
  applicantName: string;
  idMasked: string;
  status: QueueStatus;
  step: number | null;
  owner: string | null;
  dueAt: string;
  slaLevel: SlaLevel;
}

interface QueueRow {
  case_no: string;
  service_id: string;
  applicant_name: string;
  id_last3: string;
  status: QueueStatus;
  step: number | null;
  owner_username: string | null;
  due_at: string;
}

interface ClaimRow {
  applicant: string;
  current_dept: string | null;
  owner: string | null;
  status: string;
}

function workloadCount(db: Database.Database, userId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM cases WHERE owner=? AND status='IN_REVIEW'")
    .get(userId) as { count: number };
  return row.count;
}

/** The queue items are the API allowlist. Workload is available separately for the page. */
export function listQueue(ctx: ClaimsContext, actor: Principal | null, filter?: string | null) {
  const user = requireRole(actor, ['officer', 'head']);
  const head = user.role === 'head';
  if (!head && !user.dept) throw new HttpError('FORBIDDEN');
  const selected: QueueFilter = filter === 'unclaimed' || filter === 'mine' ? filter : 'all';
  const { db, testMode, bugModes } = ctx;

  return db.transaction(() => {
    const sla = slaView(db, testMode, bugModes);
    const rows = db.prepare(`
      SELECT c.case_no, c.service_id, applicant.name AS applicant_name, applicant.id_last3,
             c.status, c.step, holder.username AS owner_username, c.due_at
      FROM cases AS c
      JOIN users AS applicant ON applicant.id = c.applicant
      LEFT JOIN users AS holder ON holder.id = c.owner AND c.status <> 'APPROVED'
      WHERE c.status IN ('SUBMITTED', 'IN_REVIEW', 'APPROVED')
        AND (@head = 1 OR c.current_dept = @dept)
        AND (
          @filter = 'all'
          OR (@filter = 'unclaimed' AND c.status IN ('SUBMITTED', 'IN_REVIEW') AND c.owner IS NULL)
          OR (@filter = 'mine' AND @head = 0 AND c.status = 'IN_REVIEW' AND c.owner = @userId)
        )
      ORDER BY c.due_at, c.case_no
    `).all({ head: Number(head), dept: user.dept, filter: selected, userId: user.userId }) as QueueRow[];

    const items = rows.map((row): QueueItem => ({
      caseNo: row.case_no,
      serviceId: row.service_id,
      applicantName: row.applicant_name,
      idMasked: maskIdentity(row.id_last3),
      status: row.status,
      step: row.step,
      owner: row.owner_username,
      dueAt: row.due_at,
      slaLevel: sla.level(row),
    }));
    return { items, filter: selected, workloadCount: head ? null : workloadCount(db, user.userId) };
  })();
}

export function claimCase(ctx: ClaimsContext, actor: Principal | null, caseNo: string) {
  const { db, testMode, bugModes } = ctx;
  // Test mutation B08 leaves permission and workload checks in place.
  const allowReclaim = testMode && bugModes.has('B08');

  return immediate(db, () => {
    const row = db.prepare('SELECT applicant, current_dept, owner, status FROM cases WHERE case_no=?')
      .get(caseNo) as ClaimRow | undefined;
    const user = authorizeClaim(actor, row);
    if (!row) throw new HttpError('NOT_FOUND');
    if (!user.dept) throw new HttpError('FORBIDDEN');
    if (row.owner !== null && !allowReclaim) throw new HttpError('ALREADY_CLAIMED');
    if (row.status !== 'SUBMITTED' && row.status !== 'IN_REVIEW') throw new HttpError('INVALID_STATE');
    if (workloadCount(db, user.userId) >= 10) throw new HttpError('WORKLOAD_LIMIT');

    const updated = db.prepare(`
      UPDATE cases
      SET owner = @userId,
          status = 'IN_REVIEW',
          first_registry_claimant = CASE WHEN current_dept = 'registry'
            THEN COALESCE(first_registry_claimant, @userId) ELSE first_registry_claimant END
      WHERE case_no = @caseNo AND current_dept = @dept
        AND status IN ('SUBMITTED', 'IN_REVIEW') AND (@allowReclaim = 1 OR owner IS NULL)
    `).run({ userId: user.userId, caseNo, dept: user.dept, allowReclaim: Number(allowReclaim) });
    if (updated.changes !== 1) throw new HttpError('INVALID_STATE');

    const time = readClock(db, testMode);
    db.prepare(`
      INSERT INTO timeline(case_no, event, actor, effective_at, from_status, to_status)
      VALUES (?, 'CLAIM', ?, ?, ?, 'IN_REVIEW')
    `).run(caseNo, user.userId, time, row.status);
    appendAudit(db, {
      time,
      username: user.username,
      role: user.role,
      event: 'CLAIM',
      caseNo,
      fromStatus: row.status,
      toStatus: 'IN_REVIEW',
      detail: '',
    });
    return { owner: user.username };
  });
}
