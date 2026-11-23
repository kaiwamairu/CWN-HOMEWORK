# B14 · Shared integration interfaces

Author: B14 (yolo2), 23 Nov 2569. This block owns the shared files. Later work should extend them
through the interfaces below rather than add inline logic.

## 1. Router (`web/src/server/http/router.ts`)

- Order inside `dispatch()`:
  1. `/api/test/*` goes to `testHooks` (404 unless `TEST_MODE=1`).
  2. Audit `PUT/PATCH/DELETE` returns 405 before any lookup.
  3. Route registry `ROUTES`: unknown path → 404, wrong method → 405 with `Allow`.
  4. `readSession`, then the route role check `requireRole` (401/403).
  5. Health/auth/me run inline.
  6. `FEATURES` chain runs. The first non-null response wins.
- `FEATURES` = `handleUploads, handlePayments, handleDrafts, handleCitizenCases, handleQueue, handleReview, handleAttachments, handleDecisionsDocuments, handleNotifications, handleDashboard, handleAudit, handleAdmin`.
  - Each adapter returns `null` for paths it does not own.
  - Uploads and payments come before drafts because they live under `/api/drafts/:id/…`.
- To add a feature, add its registry row to `ROUTES` with methods and roles, then append its adapter to `FEATURES`.
- `NOT_IMPLEMENTED` (501) is left only as a guard. `tests/integration/transactions.test.ts` asserts that no registered route reaches it for an authorized caller.
- Removed inline blocks:
  - verify, PDF and attachments (replaced by B10 and B08)
  - `GET /api/cases/:caseNo` (replaced by B06)
- The B08 attachment adapter checks the role before the lookup, so an anonymous caller gets 401 even for an unknown fileId.

## 2. Test hooks (`web/src/server/http/test-hooks.ts`)

| Hook | Behaviour |
|---|---|
| `POST /api/test/reset` | `seed()` |
| `GET/PUT /api/test/clock` | `INVALID_TIME` 400 on a bad value |
| `POST /api/test/payments/:ref/pay` | B05 `pay(..., bugModes)` |
| `POST /api/test/documents/:docNo/tamper` | B10 `tamperDocument`; 404 for an unknown docNo |

- All hooks return 404 when `TEST_MODE` is not `1`.
- The campaign's hooks-disabled probe proves this on a live server.

## 3. Page access (`web/src/server/http/page-access.ts`)

- `/citizen/cases/:caseNo` uses B06 `citizenCaseVisible()`. That lets the TEST_MODE `B06` mutant reach the page, while baseline stays owner-only.
- Staff detail pages only check that the case exists. Scope is enforced by the page and API domain.

## 4. Policy, serializers, PDF facade

- `security/policy.ts` and `security/serializers.ts` are unchanged.
  - Their guards are still used by claims, documents, payments and attachment-policy.
  - `serializeCase`/`authorizeCase` stay exported for the foundation tests.
- `output/pdf.ts` is the facade:
  - `simplePdf` for seed fixtures and the dashboard KPI line
  - re-exports `renderDocumentPdf`/`documentMachineLine` from B10
- Every PDF stays uncompressed with exactly one ASCII machine line.

## 5. Pages and layout

- `components/CaseDetail.tsx` exports `officerCaseSlots(db, actor, caseNo)`.
  - It returns B10 `DecisionControls`, shown only when `hasDecisionControls`.
  - It also returns `DocumentLinks` with `canDownload=false` for the officer case page.
  - The citizen page (B06) already renders its own document panel with `download-doc-btn`.
- `components/RoleLayout.tsx` renders B09 `NotificationBell` for the `nav-bell` entry.
  - There is exactly one `nav-bell` and one `bell-count`.
  - Pages pass `bellCount={countNotifications(db, actor.userId)}`.
- `styles/civic.css` gains one rule only, `.profile-trigger:disabled{opacity:1;cursor:default}`, so the pre-hydration state looks the same. It still has `.hero-copy:before{transform:translateY(12px);background:var(--ds-hero-text-fade)}` and `#staff-login .field + .button{margin-top:20px}`.

## 6. Integration edits to earlier-owned files

The full unified diff is in [B14-integration-earlier-owned.diff](B14-integration-earlier-owned.diff).

| File | Change | Reason |
|---|---|---|
| `components/officer/QueueTable.tsx` (B07) | Empty `row-owner` for unowned rows | CONTRACT §2.7. TC-SUBMIT-01 expects an empty cell. `case-owner` keeps `ยังไม่มีผู้รับ`. |
| `app/officer/cases/[caseNo]/page.tsx` (B08) | Fill the two slots through `officerCaseSlots` | B08 §4 and B10 §4. TC-WORKFLOW-01–05. |
| `components/notifications/NotificationBell.tsx` (B09) | Remove `aria-label` | axe `label-content-name-mismatch` (serious) on `/officer/queue`, TC-NFR-02 |
| `components/SlaLevel.tsx` (B09) | paused `#466553` and closed `#5e684e` text | axe contrast: info is 4.42:1 and muted is 4.16:1. Tokens are unchanged. |
| `components/citizen/CitizenFlow.module.css` (B06) | Stepper and `.muted` text use `#5e684e` | axe contrast on `/citizen/new/SV-01` and the NEED_FIX case page |
| `components/officer/ReviewPanel.module.css` (B08) | Muted text uses `#5e684e` | axe contrast on `/officer/cases/…` (`.meta`) |
| `components/uploads/UploadSlots.module.css` (B04) | Muted text uses `#5e684e` | Same correction on the wizard upload step |
| `components/ProfileMenu.tsx` (T020) | Account trigger is `disabled` until hydrated | campaign-1 B08 run: TC-AUTH-02 hung 60 s after clicking the trigger before React attached `onClick`. The menu never opened, so `logout-btn` stayed hidden. The click now waits for an enabled element. |

One test-helper edit, with no assertion or expected value changed: [B14-test-helper.diff](B14-test-helper.diff).
- `pdfLines()` now matches the `BT`/`ET` operators as whole tokens.
- The old `/BT[\s\S]*?ET/` ended a text object inside any random verify code containing `ET`, about 1% of issues. The machine line then disappeared: campaign-1, B02 run, TC-WORKFLOW-01 got `Received length: 0`.
- A direct check renders codes `AB3ETQ7X`, `BTETBTET` and `ETXXXXBT`. The new helper extracts exactly the CONTRACT line for each; the old regex extracted none.

## 7. Scripts

| Script | Use |
|---|---|
| `scripts/inspect-at-rest.ts` | TC-NFR-04 inspector (B02 §4 interface); see `web/README.md` |
| `scripts/run-campaign.ts` | Exclusive campaign. Output goes to `evidence/<out>/campaign.json` plus per-run Playwright JSON/HTML and the server log. |
| `scripts/compare-results.ts` | `EXPECTATIONS` (BUGS §2 required/allowed, combos = union) and `judgeRun()`. CLI: `compare-results.ts <results.json> <step>`. |
