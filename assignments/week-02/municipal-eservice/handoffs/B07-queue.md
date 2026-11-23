# B07 · Department queues and exclusive claims

Sources are CONTRACT §§2.7 and 6.3, REQUIREMENTS BR-16–18 and A-34, TEST-DATA §9.1, and BUGS B08/B09.

## Shared router connection for B14

Import `handleQueue` from `web/src/server/http/features/queue.ts`. Call it in the existing `dispatch` error boundary after route and method validation and after `readSession` resolves the actor. The existing route registry already covers both endpoints.

```ts
const queue = handleQueue(request, ctx, actor);
if (queue) return queue;
```

- `GET /api/officer/queue?filter=all|unclaimed|mine` returns `{ items }` to officers and heads. Each item includes `caseNo`, `serviceId`, `applicantName`, `idMasked`, `status`, `step`, `owner`, `dueAt` and `slaLevel`.
- `POST /api/officer/cases/:caseNo/claim` accepts an empty body and returns `{ owner: username }`. Claims are limited to officers in the current department. Surface thrown `HttpError` values through the shared `errorResponse`.
- `handleQueue` returns `null` for unrelated paths. If the registry is split into feature entries, `QUEUE_PATH` and `CLAIM_PATH` are available as exact matchers.

## Domain and page

- `listQueue(ctx, actor, filter)` returns masked items, the normalized filter and the workload count. The count is `null` for a head. The queue uses the session's snapshot role and department, reads SLA levels through `slaView`, and orders by due time and case number. The officer-only workload counts owned `IN_REVIEW` cases across all departments and filters.
- `claimCase(ctx, actor, caseNo)` makes the owner/status update, the CLAIM timeline event and the CLAIM audit entry in one SQLite immediate transaction. It updates `cases.first_registry_claimant` only if a registry claim finds it empty. Later agents can use that field for issuance and APPROVED notifications. It holds a user ID, while the API exposes the current owner's username.
- `/officer/queue` uses `pageSession`, `RoleLayout`, the notification count and server-rendered SLA/status components from B09. The page reads the masked domain view directly and posts claims through the queue adapter. After a successful claim, a refresh updates the visible owner, filter results and workload together.
- The workload cap applies at claim time. Correction resubmission may restore the previous owner even if their workload exceeds ten. APPROVED rows have an empty queue owner, and APPROVED cases routed back for issuance belong in the registry queue.

## Mutation behavior

- Under `TEST_MODE=1 BUG_MODE=B08`, the baseline owner guard is bypassed while current-department authorization and the workload check still apply. On a fresh seed, `off.reg1` and then `off.reg2` can both claim case `EG-2569-000029`. The latter becomes current owner and the former remains first registry claimant.
- Under `TEST_MODE=1 BUG_MODE=B09`, the queue adapter adds `idNo` to queue JSON. The page, its server-rendered props and the masked domain view continue to expose `idMasked` only.

## Verification

`web/tests/integration/claims.test.ts` seeds in-memory databases and calls the queue adapter with actual session snapshots. All eight cases passed on Node 24.22.3, covering source queue order, masks, filters, head and cross-department authorization, the 9-to-10 boundary, competing claims, transactional rollback and both mutations. The workspace TypeScript check passed on the same runtime. The shared router connection and full acceptance are B14's integration steps.

A Chromium smoke test with the temporary queue adapter connection passed. It verified the queue filters, head read-only UI, the workload increase from 9 to 10, both inline 409 messages, and one 200 plus nine 409 responses from ten concurrent claims. The winning claim wrote one audit row. The queue had no page-level horizontal overflow at 375, 768 and 1280 pixels and no serious or critical axe findings. Queue column headers use the primary text token because the default shared table header colors measured 4.42:1.

The installed Playwright dependency requested Chromium revision 1255. This smoke test used the available headless Chromium revision 1248 through an explicit executable path.
