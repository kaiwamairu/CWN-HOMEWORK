# B13 · Admin settings

## Router integration for B14

`web/src/server/http/features/admin.ts` exports `handleAdmin(request, ctx, actor)`. Add the import and await the function in `dispatch` after resolving the registered route, validating its method and checking the session. Place it before the fallback.

```ts
import { handleAdmin } from './features/admin.ts';

const adminResponse = await handleAdmin(request, ctx, actor);
if (adminResponse) return adminResponse;
```

The existing `ROUTES` entries and `PAGE_RULES` cover the admin contract. Domain operations also enforce the admin role. The three explicit Next pages use `pageSession` and `RoleLayout` with their respective paths. Forms use the same HTTP adapter as API callers.

| Route | Request | Success |
| --- | --- | --- |
| `GET /api/admin/services` | | 200 `{items:[{id,fee,feePerSqm,sla}]}`. `fee` is the base rate for SV-03. |
| `PUT /api/admin/services/:id` | `{fee,sla}` for SV-01 and SV-02. `{feeBase,feePerSqm,sla}` for SV-03. | 200 with the updated service item |
| `GET /api/admin/holidays` | | 200 `{items:[{date,name}]}` ordered by date |
| `POST /api/admin/holidays` | `{date,name}` with a CE date in `YYYY-MM-DD` | 201 `{date,name}` |
| `DELETE /api/admin/holidays/:date` | | 200 `{ok:true}` |
| `GET /api/admin/users` | | 200 `{items:[{username,name,role,dept}]}` for accounts with usernames |
| `PUT /api/admin/users/:username` | `{role,dept}` with an empty string for a blank department | 200 with the updated user item |

## Data and audit

- Fee fields accept integers 0–100,000 and SLA accepts integers 1–60. Off-range, fractional and nonnumeric values return `INVALID_FEE` or `INVALID_SLA`. Service changes write the `services` rates read by B03 `calculateFee` and `lockDraftFee`. Locked draft and case amounts stay fixed.
- Holiday writes affect the `holidays` source used by the B09 `slaCalendar` facade. `initialDueAt` reads the live calendar for new cases and `resubmissionDueAt` reads it for subsequent pause extensions. Admin operations retain stored case due dates and SLA snapshots. Weekend dates are valid and duplicates return `DUPLICATE_HOLIDAY`.
- Self-changes to role or department return `SELF_ROLE_CHANGE`. Officers require `registry` or `works`. Updates write `users.role` and `users.dept` so each new login snapshots the saved values. The username route supports all six role values. The existing account schema requires a linked ThaiD identity to assign `citizen`, so a staff-only seed account returns 400 for that choice. Admin case-action requests remain subject to the existing citizen, officer and head policies.
- Each effective write appends one `ADMIN_CHANGE` in the same immediate transaction. Timestamp comes from `readClock`; username and role come from the session. Case and status fields are null. Detail uses the CONTRACT strings for fee, SLA, holiday and role, with `feeBase`, `feePerSqm` and `dept` for their respective fields. Multiple changed fields share one row with ` · ` between details. Rejected requests and saves with identical values create zero rows.

## Verification

- 37 HTTP-adapter checks against a seeded in-memory SQLite database with a `node:sqlite` compatibility layer for the repository's `better-sqlite3` interface. The checks cover role authorization, boundary and integer validation for all rate fields, duplicate and weekend dates, and self role/department denial.
- Additional assertions exercised B03 draft creation and fee locking, payments against old and new rates, B09 pause extension with the current calendar, stored fee/due snapshots, `staffLogin` and `readSession` before and after role and department changes, exact `ADMIN_CHANGE` rows, and rollback when audit insertion fails.
- Strict TypeScript 5.9.3 passed on the six source files with declarations from the lockfile packages. Chromium passed component checks for service validation, holiday add/delete and duplicate feedback, role save and disabled self controls. The services component stayed within 360 px and had zero serious or critical axe violations. The harness used the actual HTTP adapter and a refresh substitute for Next navigation.
- After router integration, run `TC-RBAC-04` and `TC-RBAC-06` from `web/tests/e2e/admin.spec.ts` to verify the complete browser flows.
