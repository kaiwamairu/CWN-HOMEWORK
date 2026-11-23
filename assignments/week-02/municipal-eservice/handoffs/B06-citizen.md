# B06 · Citizen service screens, tracking and corrections

Tasks T024, T028 (wizard side), T032 (wizard side), T034, T035 and T036. Sources: CONTRACT §1, §2.4–2.6, §5, §6.2 and §6.7 · REQUIREMENTS FR-09..FR-11, BR-13, BR-20 and BR-22 · DECISIONS §8 and §18 · TEST-PLAN SUBMIT-01/02/03, FEE-01, PAY-01, WORKFLOW-06, SLA-02, QUEUE-03 and RBAC-01 · BUGS B04 and B06. The shared router, `page-access.ts`, `CaseDetail` and `civic.css` were not edited. They belong to B14.

## 1. Files

| File | Role |
|---|---|
| `web/src/server/domain/cases.ts` | Own case list and detail (§6.7), the visibility rule, cancellation, correction, the citizen case view, the wizard loader and the pending-correction list |
| `web/src/server/http/features/citizen-cases.ts` | `handleCitizenCases(request, ctx, actor)` for `GET /api/cases`, `GET /api/cases/:caseNo`, `POST …/cancel` and `POST …/resubmit` |
| `web/src/app/citizen/page.tsx` | `/citizen`. It reuses the approved `CitizenHome` (1A video, greeting `translateY(12px)` untouched, service cards, `my-case-row`, `my-draft-row`) and adds a NEED_FIX correction alert below it |
| `web/src/app/citizen/new/[service]/page.tsx` | `/citizen/new/:service[?draft=DR-xxxx]`. Server loader plus the client wizard. A foreign, missing or other-service draft renders 404 |
| `web/src/app/citizen/cases/[caseNo]/page.tsx` | `/citizen/cases/:caseNo`. Status, step, fee, SLA due/level, `closed-at`, `case-id-full`, files, document panel, timeline and actions |
| `web/src/components/citizen/ServiceRequestForm.tsx` | Three-step wizard: inputs and fee preview → B04 `UploadSlots` → simulated QR → receipt |
| `web/src/components/citizen/CitizenCaseActions.tsx` | `cancel-case-btn` with the inline confirmation, plus the correction form (`fix-upload-input`, `submit-fix-btn`). Also shows `action-error` and `action-success` |
| `web/src/components/citizen/CitizenFlow.module.css` | C tokens only. No new global rules, fixed shadows and no motion |

Next resolves the static `app/citizen/**` routes before the `[...path]` catch-all, so the old placeholder citizen branches in `[...path]/page.tsx` are now dead code. B14 may delete them.

## 2. What B14 must wire (shared files)

1. **router.ts:** after the route, method and session checks, add `const cases = await handleCitizenCases(request, ctx, actor); if (cases) return cases;`. Then **remove the inline `GET /api/cases/:caseNo` block**, because the adapter replaces it with the same §6.7 shape plus the B06 switch. The adapter returns `null` for `/api/cases/:caseNo/files` (B08 `handleAttachments`) and for approve/reject (B10), so the order among the feature handlers does not matter. The existing ROUTES table already declares every path and role.
2. **page-access.ts `decidePage`:** for `/citizen/cases/:caseNo`, replace `c.applicant!==actor.userId` with `!citizenCaseVisible(ctx, actor, caseNo)` (import it from `domain/cases.ts`). **Without this change, BUG_MODE=B06 only opens the API and the RBAC-01 UI row will not fail**, because the custom server answers 404 before Next renders. In baseline both rules are identical.
3. Optional: `CaseDetail` may replace the citizen page's facts and timeline markup. The testids and texts listed in §4 must stay the same.

The scratch smoke run used exactly this wiring in a throwaway copy. It looped over `[handleUploads, handlePayments, handleDrafts, handleCitizenCases, handleQueue, handleReview]` before the `/api/me` line.

## 3. Domain interface (`domain/cases.ts`)

| Export | Behaviour |
|---|---|
| `listOwnCases(ctx, actor)` | `{caseNo, serviceId, status, dueAt, slaLevel}[]`, numbered cases only, ordered by case number descending (so 2570 sorts before 2569) |
| `readCaseDetail(ctx, actor, caseNo)` | §6.7 key order. The owning citizen gets `idNo` and everyone else gets `idMasked`. `owner` is the holder's **username**. `fixDeadline` is set only while NEED_FIX. Citizen foreign and missing cases both raise the identical `404 {"code":"NOT_FOUND","message":"ไม่พบคำขอ"}`. Officer and head keep the T001–T020 scope |
| `citizenCaseVisible(ctx, actor, caseNo)` | Boolean form of the same rule, for `decidePage` |
| `readCitizenCaseView(ctx, actor, caseNo)` | Page model: `detail`, `own`, `stepLabel` (SV-03 only, CONTRACT text), `idFull` (`3-1006-00987-65-9`), `timeline`, `files`, `returnReason` (latest RETURN note while NEED_FIX), `can.cancel` and `can.resubmit`. Returns null when the case is not visible |
| `cancelCase(ctx, actor, caseNo)` | Owner only (foreign → 404). Closed → `409 INVALID_STATE`. Any other state that is not an unowned SUBMITTED case → `409 CANNOT_CANCEL`. One IMMEDIATE transaction runs a conditional `UPDATE … WHERE status='SUBMITTED' AND owner IS NULL`, sets `closed_at=now` (like seed …000009) and appends timeline `CANCEL`. Against B07's conditional claim exactly one side wins: cancel 200 + claim 409 `INVALID_STATE`, or claim 200 + cancel 409 `CANNOT_CANCEL` |
| `resubmitCase(ctx, actor, caseNo, files?)` | Owner only. Allowed while `now < fix_deadline` (167:59 passes, 168:00 expires). The expired path **commits** `autoCancelExpired` (B09) and then throws `409 FIX_WINDOW_EXPIRED`. A case that was already auto-cancelled also gets `FIX_WINDOW_EXPIRED`, and other states get `INVALID_STATE`. On success it sets `owner = COALESCE(previous_holder, owner)` **without a workload check** (TC-QUEUE-03 step 9 reaches 11). It also clears `previous_holder` and `fix_deadline`, uses `due_at = resubmissionDueAt(...)` (B09, which contains B04), appends timeline `RESUBMIT`, and stores optional files as `extra` validated by B04 `validateUpload` (magic bytes, 5 MiB, ≤ 5 files per case). Returns `{status:'IN_REVIEW', dueAt}` |
| `assertOwnCase(ctx, actor, caseNo)` | Owner pre-check the adapter runs before reading a multipart body |
| `loadServiceWizard(ctx, actor, serviceId, draftId?)` | `{service:{id,name,rates}, slots: UPLOAD_SLOTS[id], feeBugs, draft, payment, receipt}`. Uses B03 `getDraft`, B05 `getLatestDraftPayment` and the receipt joined through `cases.draft_id`. Only `B01` is exposed to the browser (`feeBugs`), so the on-screen quote matches the API |
| `listPendingCorrections(ctx, actor)` | Open NEED_FIX cases for the home alert |

Cancellation and correction write **no audit rows**. BR-27 limits the audit trail to its 10 staff events. B08's officer page already labels `CANCEL`, `RESUBMIT` and `AUTO_CANCEL` timeline events.

## 4. Screens and testids

- **Wizard:** `wizard-step` (`1/3 กรอกข้อมูล` / `2/3 แนบเอกสาร` / `3/3 ชำระเงิน`), `service-name`, `qty-input` (default 1), `area-input`, `fee-total` (`฿1,010`, or `–` when invalid), `fee-error` (B03 messages), `draft-id`, `save-draft-btn`, `to-upload-btn` (disabled when invalid). Step 2 is B04 `UploadSlots` with `key={draftId}`. Step 3 has `payment-amount`, `create-qr-btn`, `qr-image` (local SVG from `qrcode`, simulated payload), `qr-ref`, `qr-expires` (`หมดอายุ 1 ธ.ค. 2569 09:15` + `data-iso`), `payment-status` (`รอชำระ`/`ชำระแล้ว`/`QR หมดอายุ` + `data-status`), `qr-expired-msg`, `regenerate-qr-btn`, `refresh-payment-btn`, `submitted-case-no`, `receipt-no`, `receipt-amount`, `receipt-paid-at` and `go-case-btn`.
- **Wizard state rules:** the page does not poll, so tests control timing, and `refresh-payment-btn` stays rendered once a QR exists. Expiry always comes from the server clock (`GET /api/payments/:ref`), never the browser clock. A `PENDING_PAYMENT` or `PAID` draft opens on step 3 with locked inputs. After the first save the URL is rewritten to `?draft=` so a reload resumes the draft.
- **Case page:** `case-no`, `case-status`, `case-service`, `case-step` (SV-03 only), `case-fee`, `case-id-full`, `sla-due`, `sla-level`, `closed-at` (COMPLETED/REJECTED only), `case-timeline`/`timeline-item[data-iso]`, `doc-item`/`doc-download-link`, `doc-no`, `verify-code`, `doc-qr[data-url=<origin>/verify/<code>]`, `download-doc-btn` (owner only), `return-reason-display`, `fix-deadline`, `fix-upload-input`, `submit-fix-btn` (not rendered after the deadline), `cancel-case-btn` → `cancel-confirm-text` + `confirm-cancel-btn`, `no-refund-note` (REJECTED/CANCELLED), `action-error` and `action-success`. The `doc-qr` origin comes from the request `Host` and `X-Forwarded-*` headers.

## 5. Mutants (scoped exactly)

- **B06:** with `testMode && bugModes.has('B06')`, a citizen may **read** another citizen's case through `GET /api/cases/:caseNo` and the page (via `citizenCaseVisible`). That read is masked (`idMasked`) and shows no actions. Cancel, resubmit, drafts, files and PDFs keep the owner check, and missing numbers still return 404.
- **B04:** implemented only inside B09 `resubmissionDueAt`. B06 passes the test-gated bug set through. Nothing else changes.

## 6. Verification (Node 24.22.3 throwaway container, `npm ci` from the lockfile, nothing written to the shared tree)

- `tsc --noEmit` is clean for the whole `web/` tree.
- A scratch in-memory integration file (kept outside the repo) ran 8/8 green through the real adapters (B03/B04/B05/B07/B08 + B06):
  - identical 404 for foreign and missing cases, the §6.7 key order, and staff masking
  - B06 read-only widening
  - cancel versus claim: exactly one winner in each order, `CANNOT_CANCEL` for IN_REVIEW, `INVALID_STATE` for CANCELLED
  - 13:59 resubmit, and 14:00 committed auto-cancel plus 409
  - SLA-02 parts 2 and 3 (`2026-12-01T16:30`/near, `2026-12-04T16:30`)
  - B04 keeps `2026-11-27T16:30`/overdue
  - QUEUE-03 steps 7–10 (workload 11, then `WORKLOAD_LIMIT`)
  - multipart correction file, with a bad type rejected before any state change
  - the wizard loader for SUBMIT-01 and PAY-01 round 3 (EXPIRED resume), including the B01 flag passthrough
- Canonical B02 Playwright (Chromium 1255) against a scratch build with §2 wiring and TEST_MODE=1:
  - **Pass in baseline:** TC-FEE-01, TC-SUBMIT-02, TC-SUBMIT-03, TC-PAY-01, TC-RBAC-01 and TC-SLA-02.
  - **TC-SUBMIT-01:** all five citizen steps passed. The final **queue** step failed because B07 `QueueTable` renders `row-owner` = `ยังไม่มีผู้รับ` for unowned rows, while the source test expects an empty cell (CONTRACT §2.7: `data-owner` is username or empty). B07 or B14 must fix that row text. It is not a B06 file.
  - **TC-WORKFLOW-06:** every citizen assertion passed. It stopped at `exec1 /api/dashboard` only because the scratch router did not wire B11.
  - **TC-QUEUE-03:** stopped at step 4 (`approve-btn`, B10) for the same reason. Steps 7–10 are covered by the integration run above.
  - **Mutants:** with `BUG_MODE=B06`, TC-RBAC-01 fails at the UI 404 row while TC-FEE-01, SUBMIT-02 and SUBMIT-03 still pass. With `BUG_MODE=B04`, TC-SLA-02 fails at part 1 (`dueAt`).
- Visual check at 1280 px and 375 px (wizard SV-03, pending QR, NEED_FIX case, completed case with document, home): no page-level horizontal overflow, the 8/4 split collapses to one column at ≤ 1150 px, and only approved illustrations are used.
