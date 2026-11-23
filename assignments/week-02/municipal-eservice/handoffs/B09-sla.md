# B09 · Business-day SLA and routed notifications (handoff)

Author: B09 (yolo2, Claude) · 22 Nov 2569 · Codex reviews the arithmetic and calendar logic through the review node.
Sources: DECISIONS §0, §8 and §18 (recipients, on-time rule, A-42), CONTRACT §0-7, 2.1, 2.6, 2.12, 4.1, 4.2 and 6.3, TEST-DATA §4.1, §4.4 and §8-8.2, TEST-PLAN SLA-01..03 and NOTI-01..02, and BUGS B03/B04.

## 1. Files (owned by B09)

| File | Role |
|---|---|
| `web/src/server/domain/sla.ts` | **Facade that every SLA caller uses.** It adds the DB calendar, B03/B04, labels and Thai format on top of the pure `calendar.ts` math. The math is foundation code and is not edited here. It does **not** import payments or workflow, so there is no cycle. |
| `web/src/server/domain/notifications.ts` | Recipient routing, de-duplicated insert, list and count |
| `web/src/server/domain/lifecycle.ts` | Per-request auto-cancel followed by SLA notification evaluation, in one IMMEDIATE transaction |
| `web/src/server/http/features/notifications.ts` | `GET /api/notifications` handler for B14 to wire in |
| `web/src/app/notifications/page.tsx` | `/notifications` page with `noti-item` and `noti-empty` |
| `web/src/components/CaseStatus.tsx` | `case-status` / `row-status` pill |
| `web/src/components/SlaLevel.tsx` | `SlaLevel` badge (`sla-level` / `row-sla-level`) and `SlaDue` (`sla-due` / `row-due`) |
| `web/src/components/notifications/NotificationBell.tsx` | `nav-bell` and `bell-count` for B14's RoleLayout |
| `web/tests/unit/sla.test.ts` | 60 tests covering every source table, B03/B04, routing, dedup, the API and the request trigger |

## 2. Interfaces for later blocks

```ts
import { initialDueAt, resubmissionDueAt, slaView, slaLevelAt, closedOnTime,
         remainingBusinessDays, slaCalendar, formatThaiDateTime, formatThaiDate,
         SLA_LEVEL_LABELS, CASE_STATUS_LABELS, RUNNING_STATUSES, type SlaLevel } from '../domain/sla.ts';
```

| Caller | Use | Notes |
|---|---|---|
| **B05 payment** | `due_at = initialDueAt(db, now, service.sla_days, ctx.bugModes)` | D0 is the payment day if it is a business day and the time is before 16:30:00. Otherwise D0 is the next business day. The due date is the Nth business day after D0 at 16:30+07:00. It is computed once and never recomputed (A-42). The current `payments.ts` calls `calculateDueAt(now, days, holidays(db,bugs))` and gets an identical result, but should switch to the facade. |
| **B06 resubmit** | `due_at = resubmissionDueAt(db, {dueAt: c.due_at, returnedAt: c.returned_at, resubmittedAt: now}, bugs)` | Adds the number of business days in (return date, resubmit date] to the stored due date. The calculation uses the holiday table at resubmit time. **B04 is implemented here** and returns the stored `dueAt` unchanged. Call it in the same transaction as the status change. |
| **B06/B07/B08/B10 views** | `const v = slaView(ctx.db, ctx.testMode, ctx.bugModes); v.level(row)` | Reads the clock and calendar once per request. Levels follow CONTRACT 4.2: closed (COMPLETED/REJECTED/CANCELLED), then paused (NEED_FIX), then overdue (now > due, so 16:30:01 is overdue), then near (≤1 remaining) or normal (≥2). |
| **B11 dashboard** | `closedOnTime(status, closed_at, due_at)` | `true`/`false` only for COMPLETED and REJECTED (closed_at ≤ due, with 16:30:00 counting as on time). `null` for CANCELLED and open cases, which do not count as closed (DECISIONS §18). **B10 is the denominator mutant**: it belongs to B11 and must not be put here. |
| **B13 admin** | Holiday edits take effect immediately for new payments, resubmissions and remaining-day counts. Existing `due_at` values are never recomputed. | `slaCalendar` reads the `holidays` table on every call. |
| UI | `<CaseStatus status testId="case-status"/>` · `<SlaLevel level testId="sla-level"/>` · `<SlaDue dueAt testId="sla-due"/>` | The testid element contains **only** the exact Thai label, because B02 uses `toHaveText`. Dates render as `4 ธ.ค. 2569 16:30` with `data-iso`, without depending on host ICU. |

`remainingBusinessDays(now, due, cal)` returns the number of business days in (today, due date], or `null` once overdue.

## 3. Bug modes

- **B03:** `slaCalendar(db, {B03})` returns an **empty** holiday set, leaving weekends only. Through `clock.holidays()` this one switch drives the initial due date, the pause extension and the remaining days, so values like `16:30 → 7 Dec` and `000016 Fri 4 Dec 09:00 = normal` follow. Callers must always use `slaCalendar` or `slaView` and must never read the `holidays` table directly for SLA work.
- **B04:** `resubmissionDueAt` keeps the stored due date. The NEED_FIX display stays `paused` because the bug only affects the extension.

## 4. Notifications and lifecycle

- **Trigger:** `evaluateLifecycle(db, testMode, bugs)` is already called by `web/src/server/http/server.ts` for every path except `/api/test/*`, including pages, RSC, assets, health and public `/verify`. `triggersLifecycle(path)` exposes that rule. The function first runs `autoCancelExpired`: NEED_FIX cases with `fix_deadline ≤ now` become CANCELLED, with `closed_at` set to the deadline and an `AUTO_CANCEL` timeline row. It then runs `evaluateSlaNotifications`. B06 can call `autoCancelExpired(db, now)` inside its resubmit transaction to raise `FIX_WINDOW_EXPIRED`.
- **Recipients** (DECISIONS §18):
  - PENDING_APPROVAL goes to every `head`.
  - APPROVED goes to `first_registry_claimant`, the issuer under A-27. If that is null it falls back to `owner`, then to registry officers.
  - Otherwise it goes to `owner`. If there is no owner, it goes to every officer of `current_dept`.
  - Overdue adds every head, without duplicates.
  - **B07 must set `first_registry_claimant` on the first registry claim**, otherwise APPROVED routing breaks.
- **Current level only:** jumping straight to overdue creates no backfilled `near`. Dedup relies on `UNIQUE(case_no,recipient,level)` plus `INSERT OR IGNORE`, so reopening pages never duplicates rows.
- **Text:** `คำขอ EG-2569-000024 ใกล้ครบกำหนด` / `… เกินกำหนด`. `createdAt` is the clock value at evaluation time.

## 5. Things B14 must do in shared files (B09 did not touch them)

1. **router.ts:** before the `NOT_IMPLEMENTED` throw, add `const n = handleNotifications(request, ctx, actor); if (n) return n;` (import it from `./features/notifications.ts`). The ROUTES table already has `/api/notifications` GET for officer and head.
2. **RoleLayout:** to use the component, render `<NotificationBell count={countNotifications(db, actor.userId)} active={active==='/notifications'}/>` and **remove** the generic `nav-bell` entry so there is exactly one `nav-bell` and one `bell-count`. The current RoleLayout already renders `bell-count` from its `bellCount` prop. `/notifications/page.tsx` passes `countNotifications(...)`, so it works without changes.
3. **`[...path]/page.tsx`** computes `bellCount` itself, which is equivalent. Pages that switch to `CaseStatus`, `SlaLevel` or `SlaDue` get exact CONTRACT text. The `formatThai` in `lib/roles.ts` uses host ICU; prefer `formatThaiDateTime`.
4. Styling: `SlaLevel` uses `status-pill` plus inline token colours (success, warning, danger, info, muted), with text and colour together. It does not add rules to `civic.css`.

## 6. Verification (Node 24.22.3 in a throwaway container, `npm ci` from lockfile)

- `tsx --test tests/unit/sla.test.ts`: 60/60 pass.
- Full `npm run test:unit`: 178/178 pass, including the existing foundation, lifecycle and server tests.
- `tsc --noEmit`: clean.
- Covered tables:
  - DECISIONS §8 rows 1-6
  - TC-SLA-01 rows a-i
  - TC-SLA-02 parts 1-5 and the F01/F02 history
  - TC-SLA-03 parts A, B and C
  - BUGS B03, all six values plus the remaining-days case
  - BUGS B04
  - TEST-DATA §8, 8.1 (7/10/1/15) and 8.2
  - TC-NOTI-01 continuation
  - on-time 16:29/16:30/16:31
- The Playwright SLA and NOTI cases still depend on B05/B06/B07 and B14 wiring. End-to-end runs belong to B14.
