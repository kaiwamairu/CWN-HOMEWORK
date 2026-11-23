# B14 · Final integration and acceptance evidence

Author: B14 (yolo2), run `egov-eservice-20261122-224219`. Written 23 Nov 2026 (2569) during the finalization-only resume.
The campaign and the Playwright suite were **not** rerun for this document. Every number below comes from
`web/evidence/campaign-2/campaign.json` and the per-run `results.json` files beside it.

## 1. What was integrated

The interfaces are described in [B14-integration.md](B14-integration.md). In short:

- `web/src/server/http/router.ts`: a `ROUTES` registry (404 for an unknown path, 405 with `Allow` for a wrong method, role check 401/403), then the `FEATURES` adapter chain from B03–B13:
  `handleUploads, handlePayments, handleDrafts, handleCitizenCases, handleQueue, handleReview, handleAttachments, handleDecisionsDocuments, handleNotifications, handleDashboard, handleAudit, handleAdmin`.
  The inline verify, PDF, attachment and `GET /api/cases/:caseNo` blocks were removed. `tests/integration/transactions.test.ts` asserts that no registered route returns `NOT_IMPLEMENTED` to an authorized caller.
- `web/src/server/http/test-hooks.ts`: reset, clock, payment pay (B05) and document tamper (B10). They exist only when `TEST_MODE=1`.
- `web/src/server/http/page-access.ts`: `/citizen/cases/:caseNo` goes through B06 `citizenCaseVisible()`.
- `web/src/components/CaseDetail.tsx`: `officerCaseSlots()` fills the B08 officer page slots with the B10 `DecisionControls` and `DocumentLinks`.
- `web/src/components/RoleLayout.tsx`: renders the B09 `NotificationBell`, with exactly one `nav-bell`/`bell-count`.
- `web/src/styles/civic.css`: one added rule, `.profile-trigger:disabled{opacity:1;cursor:default}`.
- `web/src/server/output/pdf.ts`: facade over `simplePdf` plus B10 `renderDocumentPdf`/`documentMachineLine`.
- Scripts:
  - `web/scripts/run-campaign.ts`: the campaign runner.
  - `web/scripts/compare-results.ts`: `EXPECTATIONS` and `judgeRun()`.
  - `web/scripts/inspect-at-rest.ts`: the TC-NFR-04 inspector.
- Tests:
  - `web/tests/unit/time-boundaries.test.ts`
  - `web/tests/integration/transactions.test.ts`
  - `web/tests/integration/inspection.test.ts`
- `web/README.md`: run instructions.

Edits to files owned by earlier blocks are listed with reasons in `B14-integration.md` §6. The full diffs are:
- [B14-integration-earlier-owned.diff](B14-integration-earlier-owned.diff) (application files)
- [B14-test-helper.diff](B14-test-helper.diff) (the one test-helper change)

## 2. Triage decisions (failures classified against source; no expectation weakened)

| # | Observation | Classification | Action |
|---|---|---|---|
| 1 | Exploratory run, TC-NFR-02: axe *serious* `color-contrast` (wizard stepper, `.muted`, SLA paused/closed badges, review `.meta`, upload hint) and `label-content-name-mismatch` on the bell (`aria-label` ≠ visible text) | App defect (REQ NFR-02 / WCAG AA) | Local text colours `#5e684e` (muted) and `#466553` (info) in `SlaLevel.tsx`, `CitizenFlow.module.css`, `ReviewPanel.module.css` and `UploadSlots.module.css`. Removed the `aria-label` in `NotificationBell.tsx`. **Design tokens unchanged** (hash check in §5). |
| 2 | Campaign-1, B02 run: TC-WORKFLOW-01 failed with `Received length: 0` for the PDF machine line | Test-helper defect, not the mutant. In `source-helpers.ts` `pdfLines()`, the regex `/BT[\s\S]*?ET/` ended a text object at any random 8-char verify code containing `ET` (≈1 % of issues). | The tokenizer now matches `\bBT\b…\bET\b` as whole operators. **No assertion or expected value changed** (`B14-test-helper.diff`, 1 line plus a comment). A direct check on `AB3ETQ7X`, `BTETBTET` and `ETXXXXBT`: the new helper extracts exactly the CONTRACT line for each, and the old regex extracted none. |
| 3 | Campaign-1, B08 run: TC-AUTH-02 hit the 60 s timeout. The click on the account trigger landed before React hydration attached `onClick`, so `logout-btn` stayed hidden. | App defect (hydration race) | `ProfileMenu.tsx`: the trigger stays `disabled` until a mount effect runs, and Playwright's click waits for an enabled element. The `civic.css` rule keeps the disabled look identical. |
| 4 | Campaign-1/2, B03 run: TC-NOTI-02 also fails | Allowed side effect. DECISIONS §18 row "B03 กระทบอะไร" (overrides BUGS) says the same business-day function computes remaining days, so TCs that count remaining days across a holiday may fail. NOTI-02 part B derives …000016 `near` on Sat 5 Dec across the 7 Dec holiday. | Added to B03 `allowed` in `compare-results.ts`, together with BUGS' TC-SLA-03 and TC-RBAC-04. |

Campaign-1 was stopped after its B12 step and kept only as a diagnostic. Its output is in container `b14-node` at `/work/app/web/evidence/campaign-1-diagnostic`, not copied into `app/`. All acceptance claims rest on campaign-2, which ran on the final code.

## 3. Campaign-2 (`web/evidence/campaign-2/`)

- **Runner:** `npm run accept:campaign` (`scripts/run-campaign.ts`) in container `b14-node` (`node:24.22.3-bookworm-slim`, Node v24.22.3).
- **Code under test:** a copy of `app/` taken after the final fixes. A `diff -rq` on 23 Nov shows it is identical to `app/` apart from the B14 handoff docs.
- **Lockfile:** `package-lock.json` sha256 `877f76cb…2b36`.
- **Time:** 2026-11-22T19:31:19Z → 20:59:21Z (02:31–03:59 on 23 Nov, +07).
- **Isolation:** order is hooks-disabled probe → baseline ×2 on one server → each mutant on a fresh server → combinations → final. Every step starts its own server on a fresh isolated TEST_MODE DB with three fresh random keys, then runs the same unchanged 51-test suite. The user preview DB (`127.0.0.1:4180`) was never touched.
- **Judging:** `judgeRun()` requires `required ⊆ failed ⊆ required ∪ allowed`, exactly 51 unique canonical TCs, and no skipped, timed-out, interrupted or infrastructure failures (`problems`).
- **Verdict:** top-level `"ok": true`. `campaign2.log` ends `ALL OK … exit=0`.

| Step (BUG_MODE) | Required (BUGS §2 / DECISIONS §18) | Allowed | Observed failed | Passed/51 | Problems | OK |
|---|---|---|---|---|---|---|
| baseline pass 1 (empty) | – | – | – | 51 | none | ✅ |
| baseline pass 2 (empty, **same server process and DB** as pass 1, `run-campaign.ts` `passes: 2`) | – | – | – | 51 | none | ✅ |
| B01 | FEE-01 | – | FEE-01 (`fee-total` ฿1,000 vs ฿1,010) | 50 | none | ✅ |
| B02 | UPLOAD-01 | – | UPLOAD-01 (`file-item` 0 vs 1) | 50 | none | ✅ |
| B03 | SLA-01, SLA-02 | SLA-03, RBAC-04, NOTI-02 | SLA-01, SLA-02 + SLA-03, RBAC-04, NOTI-02 (dueAt `…12-07` vs `…12-08`) | 46 | none | ✅ |
| B04 | SLA-02 | – | SLA-02 | 50 | none | ✅ |
| B05 | PAY-01 | – | PAY-01 (expired QR pay 200 vs 410) | 50 | none | ✅ |
| B06 | RBAC-01 | – | RBAC-01 (200 vs 404) | 50 | none | ✅ |
| B07 | RBAC-02 | WORKFLOW-01 | RBAC-02 (`approve` …000014 200 vs 403) | 50 | none | ✅ |
| B08 | QUEUE-02 | – | QUEUE-02 (no `มีเจ้าหน้าที่รับเรื่องนี้แล้ว`) | 50 | none | ✅ |
| B09 | PDPA-02 | – | PDPA-02 (13-digit run in queue JSON) | 50 | none | ✅ |
| B10 | DASH-02 | DASH-01, DASH-03 | DASH-02 + DASH-01, DASH-03 (`23.1%` vs `85.7%`; `0.0%` vs `–`) | 48 | none | ✅ |
| B11 | PDPA-03, AUDIT-01 | – | PDPA-03, AUDIT-01 (audit 15 vs 16) | 49 | none | ✅ |
| B12 | WORKFLOW-04 | – | WORKFLOW-04 (`return-btn` count 1 vs 0) | 50 | none | ✅ |
| B03,B07 | union | union | NOTI-02, RBAC-02, RBAC-04, SLA-01, SLA-02, SLA-03 = exact union of the B03 and B07 observations | 45 | none | ✅ |
| B01,B05,B09 | union | union | FEE-01, PAY-01, PDPA-02 = exact union | 48 | none | ✅ |
| final (empty) | – | – | – | 51 | none | ✅ |

- No run has `unexpectedFailures`, `missingFailures` or `problems`.
- Allowed but not observed: B07 → WORKFLOW-01. The mutant skips only the officer-SV-02 check (B10 handoff), so this is expected.
- Each step folder `web/evidence/campaign-2/<step>/pass-N/` holds `results.json` (Playwright JSON), `stdout.txt`, `html/` (report) and `artifacts/` (traces/screenshots of failures).
- The per-step test DB/log folders (`var/`) were left out of the copy on purpose.

## 4. NFR-04 and hooks-disabled evidence

- **TC-NFR-04** (`tests/e2e/nfr04-inspection.spec.ts` → `scripts/inspect-at-rest.ts`) passed in all 17 runs.
  - The inspector output is attached as `nfr04-inspector-stdout` in baseline pass 1/2 and final `results.json`.
  - It scanned the run DB, its `#dump` and `server.log`.
  - Each of the 4 TEST-DATA ID numbers (plain and dashed forms) and the 4 mobile numbers is found **0** times.
  - Method reported: AES-256-GCM (12-byte random IV, 16-byte tag, `DATA_KEY_HEX`) for the ID number and mobile, plus HMAC-SHA256 lookup (`ID_LOOKUP_KEY_HEX`). Only the last 3 ID digits stay in clear, for masking.
- **Hooks disabled** (`web/evidence/campaign-2/hooks-disabled/disabled-hooks.json`, also `campaign.json.disabledHooks`). On a live server with `TEST_MODE`≠1 and `BUG_MODE=B01,B05` supplied:
  - health returned 200.
  - `POST /api/test/reset`, `GET`/`PUT /api/test/clock`, `POST /api/test/payments/PP-0001/pay` and `POST /api/test/documents/DOC-2569-000001/tamper` all returned **404** (`allNotFound: true`).
  - The seed document DOC-2569-000001 still verifies `VALID` afterwards, so the tamper hook did not run.
  - Bug modes are dropped by config when `TEST_MODE`≠1.

## 5. Finalization sanity checks (23 Nov 2026, container `b14-node`, same code)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run test:unit` (unit + integration, `--test-concurrency=1`) | 242 tests, 242 pass, 0 fail, 0 skipped |
| `npx tsx scripts/verify-assets.ts` | `{"tokenCount":64,"mediaFiles":10,"svgByteParity":true,"selectedVariant":"C"}` |
| Source/token/media sha256 vs `../source-checkpoint.json` `sha256` (29 entries: 10 source docs, spec tokens JSON/CSS, C template, 16 illustration/media/manifest files) | 29/29 match, 0 mismatch |
| `original_sources` hashes (10) | identical to the `sha256` entries above. The Windows `source_root` is not reachable from this host. |
| CSS invariants in `web/src/styles/civic.css` | `#staff-login .field + .button{margin-top:20px}` (line 6). `.hero-copy:before{…transform:translateY(12px)…background:var(--ds-hero-text-fade)…}` is present. |
| Rendered 20px staff-login gap | Throwaway TEST_MODE server, own DB `var/gapcheck/gap.sqlite` on port 3299, Chromium. Gap between the last `#staff-login .field` and `staff-submit` = **20 px** at 1440×900 and at 390×844. Computed `margin-top: 20px`. |

## 6. One-command run

From `app/`:

```sh
TEST_MODE=1 docker compose up --build --wait
```

- `compose.yaml` builds `web/Dockerfile` (Node 24.22.3, `npm ci`, `npm run build`).
- The service publishes `127.0.0.1:3000`. Inside the container, socat on 8080 forwards to the app on 3000.
- Each start creates fresh keys and a fresh seeded DB in tmpfs (`/app/web/var`), so the user DB is never involved.
- `BUG_MODE=B03,B07` etc. can be added (honoured only with `TEST_MODE=1`). Stop with `docker compose down`.
- Details: `web/README.md`.

**Smoke check (23 Nov 2026, this finalization):** `TEST_MODE=1 docker compose -p b14final up --build --wait` → exit 0, container `Healthy`; `GET http://127.0.0.1:3000/api/health` → 200 `{"status":"ok"}`; `GET /api/test/clock` → 200 (hooks on with TEST_MODE=1); `docker compose -p b14final down` → exit 0. Only a smoke check; the acceptance suite was not rerun against the Compose container.

## 7. Open questions (kept open; not answered by this build)

- **Q-06 / NFR-07, concurrent users and capacity:** not measured. Only concurrent claim (QUEUE-02) and unique case numbers are tested.
- **Q-07 / NFR-06, availability ≥ 99.5 %:** not measurable here. Only `GET /api/health` → 200 `{"status":"ok"}` (TC-NFR-03) exists.
- **Q-08 / NFR-04–05, encryption standard and TLS:**
  - At rest: AES-256-GCM/HMAC was chosen, but key management and the scope of "personal data" (names, e-mail, uploaded ID or deed files) still need the agency's answer.
  - In transit: TLS/HTTPS is a deploy-time item. Local runs use plain HTTP on 127.0.0.1.
- **B08 UNMASK scope:** officers can unmask only cases that are in, or have passed through, their department. Heads can unmask all. This was B08's own choice because CONTRACT is silent; no TC is affected.
- **REPORT / actual-vs-plan Gantt / compare artifacts:** deliberately not produced by this block.

## 8. Completion criteria

| Criterion | Status | Evidence |
|---|---|---|
| All features integrated | ✅ | §1, `router.ts` `FEATURES`, `transactions.test.ts` (no route reaches 501) |
| 51 canonical cases pass twice on one server | ✅ | campaign-2 baseline pass 1 and 2 on one server: 51/51 each |
| 12 single mutants | ✅ | B01–B12 rows in §3, all `ok: true` |
| 2 combined mutants | ✅ | B03,B07 and B01,B05,B09 = exact unions |
| Final clean baseline | ✅ | `final` 51/51 |
| NFR-04 evidence | ✅ | §4 |
| Disabled-hook evidence | ✅ | §4, `hooks-disabled/disabled-hooks.json` |
