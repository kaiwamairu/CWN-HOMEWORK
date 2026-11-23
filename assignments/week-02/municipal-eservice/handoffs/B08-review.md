# B08 · Review, routing and privacy controls

Author: B08 (yolo2, Claude), 23 Nov 2569. Tasks T042–T045.
Sources: CONTRACT §2.6, §5, §6.2, §6.3 and §6.8, REQUIREMENTS BR-19, BR-21 and BR-24, A-12, A-20, A-27, A-28, A-32 and A-44, DECISIONS §9, §11 and §18, and BUGS B11/B12.

## 1. Files (owned by B08)

| File | Role |
|---|---|
| `web/src/server/domain/review.ts` | Return, forward, unmask and the masked officer-page view (`readOfficerCase`) |
| `web/src/server/security/attachment-policy.ts` | Attachment list/content adapter built on the unchanged `policy.ts` guards |
| `web/src/server/http/features/review.ts` | `handleReview` (return/forward/unmask) and `handleAttachments` (`/files` routes) |
| `web/src/app/officer/cases/[caseNo]/page.tsx` | `/officer/cases/:caseNo` for officer and head. It takes precedence over the `[...path]` catch-all. |
| `web/src/components/officer/ReviewPanel.tsx` | Client `ReviewPanel` (claim/return/forward) and `IdentityReveal` (applicant-id/unmask/full-id) |
| `web/src/components/officer/ReviewPanel.module.css` | Scoped styles that use only `--ds-*` tokens. It adds no rules to `civic.css`. |

## 2. Rules enforced (server side)

- **Holder-only (A-28).** Return and forward require role `officer`, `cases.owner = actor` and a session dept equal to `cases.current_dept`. Heads, other officers and other departments get 403 `FORBIDDEN`. The checks run in this order: 401/403 role (router + domain), 404 unknown case, 403 not holder, then 409 `INVALID_STATE` when the status is not `IN_REVIEW`.
- **Return.** After the checks above, the case must be under the return limit, or it gets 409 `RETURN_LIMIT`. The reason must have at least 10 code points after `trim()` (A-44), or it gets 400 `REASON_TOO_SHORT`. A missing or non-string reason counts as 0. One IMMEDIATE transaction then does the following:
  - sets `status=NEED_FIX` and `return_count+1`
  - sets `returned_at=now` and `fix_deadline=now+168h`
  - sets `previous_holder=owner` and keeps `owner`, which matches seed …000017
  - writes a `RETURN` timeline row with the trimmed reason in `note`
  - writes an Audit `RETURN` row with `detail` = the trimmed reason
  - responds `{status:'NEED_FIX',returnCount}`
- **Max two returns.** `RETURN_LIMIT=2`. Under `TEST_MODE=1 BUG_MODE=B12`, `returnLimit()` is 3. That is the only change: the API allows `returnCount:3` and the page keeps `return-btn`.
- **Fixed routing (BR-21).** `nextRoute(serviceId, step)` takes no caller input, so the UI has no `forward-target`:

  | Service | From | To |
  |---|---|---|
  | SV-01 | any | none → 409 `INVALID_STATE` (no `forward-btn`) |
  | SV-02 | registry | `PENDING_APPROVAL`, `step=null`, `current_dept=registry`, `owner=NULL` |
  | SV-03 | step 1 | `IN_REVIEW`, `step=2`, `current_dept=works`, `owner=NULL`. It also inserts `case_departments(works)` and appears unclaimed in the works queue. |
  | SV-03 | step 2 | `PENDING_APPROVAL`, `step=3`, `current_dept=registry`, `owner=NULL` |

  `PENDING_APPROVAL` keeps `current_dept=registry`, like seed …000011/…000014, so APPROVED cases return to the registry issuance queue. `first_registry_claimant` is never touched (A-27). The response is `{status:'IN_REVIEW',step:2}` or `{status:'PENDING_APPROVAL'}`. Timeline `FORWARD` and Audit `FORWARD` get `detail` = the trimmed `note`, or `''` when there is none.
- **UNMASK before reveal (BR-24, A-32).** Order of checks and actions:
  1. Role must be `officer` or `head`; other roles get 403 (exec/auditor/citizen).
  2. Unknown case → 404.
  3. Scope check → 403. Officers must be in a current or past department (`case_departments`), the same scope as attachments. Heads see every department.
  4. Reason must be non-blank after trim, or the request gets 400 `REASON_REQUIRED`.
  5. Audit `UNMASK` (`detail` = reason) is written inside an IMMEDIATE transaction, which must **commit** before the identity is decrypted and returned as `{idNo:'3100600987659'}`. If the audit write fails, the response is 500 and contains no number.

  Under `BUG_MODE=B11` the audit row is skipped and nothing else changes.
- **Attachments (DECISIONS §18, CONTRACT 6.2).** Role is checked first: anonymous gets 401 `UNAUTHENTICATED`, and executive/auditor/admin get 403 `FORBIDDEN`. The lookup comes next, so file IDs cannot be probed:
  - unknown case/file or a foreign citizen → 404 `NOT_FOUND`
  - officer outside its current/past departments → 403
  - head → all departments
  - draft-only files → only the owning citizen; officers get 403
  - `Content-Type` comes from magic bytes (PDF/JPEG/PNG), falling back to the stored MIME, with `nosniff` and `no-store`

## 3. B14: shared router wiring

In `dispatch()`, after `readSession` and the route-role check, add:

```ts
import { handleReview, handleAttachments } from './features/review.ts';
// …after the actor is resolved, before the inline /files block (which it replaces):
const review = await handleReview(request, ctx, actor); if (review) return review;
const files = handleAttachments(request, ctx, actor); if (files) return files;
```

- `handleAttachments` fully replaces the inline `attachments||file` block in `router.ts`, which you can delete. One difference: the inline block returned 404 for an unknown fileId before checking auth, and the adapter checks the role first. If B14 prefers to keep the policy in `policy.ts`, the exported functions are `authorizeCaseAttachments(db, actor, caseNo)`, `listCaseAttachments`, `readAttachment(db, actor, fileId)` → `{name,contentType,bytes}`, `departmentsEntered` and `staffMayReadAttachments(user, entered)`.
- The ROUTES registry already has `/api/officer/cases/:no/(return|forward)` for officers and `/unmask` for officer+head, so nothing needs to change there. Thrown `HttpError`s go through the shared `errorResponse`. Exported matchers: `REVIEW_PATH`, `CASE_FILES_PATH` and `FILE_PATH`.
- B06's resubmit must restore `owner = previous_holder`, set `status=IN_REVIEW` and leave `return_count` alone. Return keeps `owner` set, so either column works.

## 4. B14: page integration (B10 controls)

`/officer/cases/[caseNo]/page.tsx` renders the following:
- facts: `case-no`, `case-status`, `case-service`, `case-step` (SV-03 only, A-40 labels), `case-fee` `฿1,010`, `applicant-name`, `applicant-id`, `sla-due`, `sla-level`, `closed-at` (COMPLETED/REJECTED only), `case-owner` (`ยังไม่มีผู้รับ` when there is none) and `return-count`
- `case-timeline`/`timeline-item[data-iso]` and `doc-item[data-name][data-file-id]` with `doc-download-link` → `/api/files/<id>`
- `show-full-id-btn`, `unmask-reason`, `unmask-submit`, `unmask-error`, and `full-id`, which shows only in client state and is masked again after reload
- `claim-btn`, `forward-note` and `forward-btn` (`ผ่าน/ส่งต่อ`), `return-btn`, `return-reason`, `return-submit` and `return-reason-error`, plus `action-error`/`action-success`

Buttons render only when allowed (CONTRACT 0.5), using `view.can` from `readOfficerCase`. After the limit, `return-btn` is absent (`count()==0`). The full ID never reaches the server HTML or RSC payload, because `readOfficerCase` never selects the ciphertext.

**Still needed from B10/B14:** `approve-btn`/`reject-*`/`issue-btn` and `doc-no`/`verify-code`/`doc-qr`. Edit the two placeholders in the page:

```tsx
const decisionControls: ReactNode = <DecisionControls … />; // rendered inside ReviewPanel after the review actions
const documentLinks: ReactNode = <DocumentLinks … />;       // rendered under the panel
```

To avoid a duplicate `action-error`, DecisionControls should show its own errors only while ReviewPanel shows none, or B14 can accept two separate alert regions. TC-WORKFLOW-04/05 and TC-WORKFLOW-01–03 depend on those controls being present. `CaseDetail.tsx` (B14) can reuse `readOfficerCase` and `IdentityReveal` if B14 merges the citizen/officer detail views.

## 5. Verification (Node 24.22.3 throwaway container, `npm ci` from the lockfile)

- `tsc --noEmit` is clean across the whole workspace.
- 8/8 node:test checks pass on in-memory seeded DBs through the real adapters and sessions. The script is in `/workspace/.agent-team/egov-eservice-20261122-224219/msgs/B08-scratch/review.check.ts`; copy it to `web/tests/…` to rerun. Coverage:
  - reason trim (9 / 10 spaces / 10)
  - holder/head/anon/404 matrix
  - RETURN_LIMIT on seed …000023 and B12's third return
  - SV-02 and SV-03 routing through the works queue and claim to step 3
  - UNMASK audit, the roles check, out-of-department 403, and no reveal when the audit insert fails
  - B11
  - the full TC-RBAC-05 attachment matrix, including draft files
  - a masked view with no full ID in its JSON
- A browser smoke ran on the custom dev server with TEST_MODE=1, using a throwaway copy whose router was patched as in §3. It covered return UI errors (9 / 10 spaces), then success to NEED_FIX with `return-btn` gone, SV-03 forward to `ขั้นตอน 2/3 · ฝ่ายโยธา` with `ยังไม่มีผู้รับ`, the unmask empty error then the full ID, re-masking after reload, Audit UNMASK = 1 at `2026-12-01T09:00:00+07:00`, the FORWARD note in the audit, no overflow at 375px, and no full ID in the HTML of …000025.
- Not run: canonical Playwright. It needs the B14 router plus the B06 and B10 pieces.
