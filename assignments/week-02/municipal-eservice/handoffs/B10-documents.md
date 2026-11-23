# B10 · Authorized approvals, signed PDF and public verify

Author: B10 (yolo2, Claude), 23 Nov 2569. Tasks T052–T054 and T056–T059.
Sources: CONTRACT §2.6, §2.8, §2.13, §3, §6.2–6.4 and §8, DECISIONS §10 and §18 (A-27), REQUIREMENTS BR-21 and BR-23, A-22, A-23, A-43, A-48, A-54, A-58 and A-63, BUGS B07, TEST-DATA §5 and §12.

## 1. Files (owned by B10)

| File | Role |
|---|---|
| `web/src/server/domain/approvals.ts` | Approve and reject authority, the A-27 issuer, UI permissions and the `/head/approvals` list |
| `web/src/server/domain/documents.ts` | Validity, HMAC signature, verify code, DOC counter, the issue transaction, verify, PDF access and the tamper helper |
| `web/src/server/output/document-pdf.ts` | `renderDocumentPdf` (uncompressed PDF, ASCII machine line, vector QR) and `qrMatrix` |
| `web/src/server/http/features/decisions-documents.ts` | `handleDecisionsDocuments` for approve, reject, issue, verify and PDF |
| `web/src/app/head/approvals/page.tsx` | `/head/approvals`: `approval-row` rows plus `approval-open` |
| `web/src/app/verify/[code]/page.tsx` | Public `/verify/:code` on the approved 3A scene. It takes precedence over the `[...path]` verify branch. |
| `web/src/components/approvals/DecisionControls.tsx` | Client component: `approve-btn`, `reject-btn`/`reject-reason`/`reject-submit`/`reject-reason-error`, `issue-btn` |
| `web/src/components/documents/DocumentLinks.tsx` | Async server component: `doc-no`, `verify-code`, `doc-qr[data-url]`, `download-doc-btn` |
| `web/tests/unit/document-validity.test.ts` | 19 node:test checks on in-memory seeded DBs through the real adapter |

B10 reuses the existing `documents`/`counters` schema, `calendar.documentValidUntil`, `serializers.maskName`, `policy.authorizeDocument`, `audit.appendAudit` and B08's `reasonLength`/`forwardCase`. It edits no file owned by another block and adds no CSS: it reuses `ReviewPanel.module.css` and `QueueTable.module.css`.

## 2. Rules enforced (server side)

### Decisions (`approveCase` and `rejectCase`)

Checks run in this order: 401/403 role (`officer`/`head`), 404 unknown case, 403 authority, 409 `INVALID_STATE`, then for reject only, 400 `REASON_TOO_SHORT` (trimmed, at least 10 code points, A-44).

| Service | Who decides | Required status | Who gets 403 |
|---|---|---|---|
| SV-01 | the officer holding the case (`owner`, same department) | `IN_REVIEW` | head · other officers |
| SV-02 / SV-03 | head | `PENDING_APPROVAL` | every officer, including the holder after 2 returns (TC-WORKFLOW-04 C) |

A head deciding SV-02/03 outside `PENDING_APPROVAL` gets 409.

**Approve** returns `{status:'APPROVED'}` and sets `approved_by = actor`. The case stays open (no `closed_at`) until ISSUE.
- SV-01 keeps `owner`, who is also the issuer.
- SV-02/03 set `owner=NULL` and `current_dept='registry'`, the same shape as seed …000019.

It writes Timeline `APPROVE` and Audit `APPROVE` (`detail=''`, `from → APPROVED`).

**Reject** returns `{status:'REJECTED',closedAt:now}` and sets `closed_at = now`. Head-step rejects clear `owner`. It writes Timeline `REJECT` (note = reason) and Audit `REJECT` (detail = trimmed reason). There is no refund (the `no-refund-note` belongs to the citizen page, B06/B14).

**BUG_MODE=B07** (TEST_MODE only) skips exactly one check: the service-authority check when an officer approves SV-02. The state check still applies, so `off.reg2` approving …000014 gets 200 and …000013 (IN_REVIEW) still gets 409. Reject, SV-03, SV-01 holder/head rules and the UI (`decisionPermissions`) do not change.

### Issue (`issueDocument`)

Checks run in this order: role `officer`, 404, 403 when the actor is not the issuer, 409 unless `APPROVED`.

The issuer (`issuerOf`, A-27) is `approved_by ?? owner` for SV-01 and `first_registry_claimant` for SV-02/03, so it is never the head and never works.

One IMMEDIATE transaction does all of the following:
- takes the next number from the **separate annual counter** `counters(kind='document', year=พ.ศ. of the issue instant)`: `DOC-2569-000002` after reset, and `DOC-2571-000001` on 29 Feb 2028 (A-48)
- picks a unique `[A-Z0-9]{8}` code (the seed code `K7M2Q9XA` is preserved and skipped)
- sets `validUntil`, `signer` = **display name of the actual approver** (`เจ้าหน้าที่ทะเบียน 2` / `หัวหน้าฝ่าย`) and `issuer` = actor
- computes the HMAC signature and renders the PDF
- sets `COMPLETED` and `closed_at = now`
- writes Timeline `ISSUE` and Audit `ISSUE` (`detail = docNo`, `APPROVED → COMPLETED`)

A second issue gets 409 and creates no number (the next stays `DOC-2569-000003`). If any step fails, nothing is written (tested with an abort trigger).

### Validity and verify

- `validUntilFor`: SV-01 → issue date + 89 days. SV-02/03 → next anniversary − 1 day, where a 29 Feb issue uses 28 Feb as the anniversary in a common year: `2028-02-29` → `2029-02-27`. The last day counts as valid, and `isExpired` is true from 00:00 Bangkok the next day.
- Signature: hex HMAC-SHA256 of `docNo|caseNo|applicant|serviceId|issuedAt|validUntil|signer` with `DOC_HMAC_KEY_HEX` (CONTRACT §3), compared with `timingSafeEqual`. A **signature failure takes precedence over expiry** (A-43).
- `verifyDocument(ctx, code)`:
  - not `[A-Z0-9]{8}` or unknown → `null`, which the adapter answers with 404 `{"result":"NOT_FOUND"}`
  - TAMPERED → `{result:'TAMPERED'}` only
  - VALID/EXPIRED → `{result, docNo, applicantMasked, serviceId, issuedAt, validUntil, signer}`
- `applicantMasked`: `สมชาย ใ***`; with no surname, `มานะ ***`.

### PDF (`readDocumentPdf` + `renderDocumentPdf`)

- Access: the owner citizen, any officer or head get 200. Other citizens, executive/auditor/admin and unknown documents get 404.
- Headers: `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="DOC-2569-000002.pdf"`.
- The content stream is plain text, so the file holds **exactly one** ASCII line `docNo=DOC-2569-000002 caseNo=EG-2569-000025 verify=<code> validUntil=2027-02-28`, readable both by raw byte search and by text extraction.
- The page also prints ASCII facts, the signature and a vector QR to `<origin>/verify/<code>`.
- Thai applicant, signer and service names sit in the PDF Info dictionary as UTF-16 strings, because standard fonts have no Thai glyphs. DECISIONS §18/A-63 checks Thai content through `/verify` instead.
- `pdf-lib` loads the file cleanly.

## 3. B14: shared router wiring

In `dispatch()`, after `readSession` and the ROUTES role check, add:

```ts
import { handleDecisionsDocuments } from './features/decisions-documents.ts';
const decided = await handleDecisionsDocuments(request, ctx, actor); if (decided) return decided;
```

- This replaces the inline `/api/verify/` and `/api/documents/:no/pdf` blocks in `router.ts`, which you can delete. Their behaviour is the same, except that PDF headers add `Content-Length`/`nosniff` and non-`[A-Z0-9]{8}` codes get 404.
- It also implements `/api/cases/:no/(approve|reject)` and `/api/officer/cases/:no/issue`, which currently fall through to `NOT_IMPLEMENTED`.
- The ROUTES entries already exist with the right roles, so nothing needs to change there.
- Exported matchers: `DECISION_PATH`, `ISSUE_PATH`, `VERIFY_PATH`, `DOCUMENT_PDF_PATH`.
- **Test tamper dispatcher (B14):** `test-hooks.ts` can keep its inline UPDATE or call `tamperDocument(ctx.db, docNo)` from `domain/documents.ts`. It returns `false` for an unknown docNo, which should map to 404. Either way the signature stays unchanged.
- **PDF facade (B14):** `renderDocumentPdf(input)` returns a `Buffer` synchronously, so it is safe inside `immediate()`. If B14 moves it behind a shared facade, keep the content stream uncompressed and the machine line intact.

## 4. B14: page integration

### `/officer/cases/[caseNo]/page.tsx` (B08's two slots)

```tsx
import { DecisionControls } from '../../../../components/approvals/DecisionControls';
import { DocumentLinks } from '../../../../components/documents/DocumentLinks';
import { decisionPermissions, hasDecisionControls } from '../../../../server/domain/approvals';
import { readCaseDocument } from '../../../../server/domain/documents';
// inside the page, after `view`:
const can = decisionPermissions(ctx.db, actor, view.caseNo);
const issued = readCaseDocument(ctx.db, view.caseNo);
const decisionControls: ReactNode = hasDecisionControls(can) ? <DecisionControls caseNo={view.caseNo} can={can} /> : null;
const documentLinks: ReactNode = issued ? <DocumentLinks document={issued} canDownload={false} /> : null;
```

- `hasDecisionControls` lives in `approvals.ts` (server). Do **not** import it from the client file, because Next throws "Attempted to call … from the server".
- Passing `null` keeps B08's `ReviewPanel` hidden when the actor has no actions.
- `DecisionControls` renders its own `action-error`/`action-success` and appears only after its own action, so it never overlaps ReviewPanel's message from the same click.

### Citizen detail (`CaseDetail`, B14/B06)

When the case has a document, render `<DocumentLinks document={readCaseDocument(db, caseNo)!} canDownload />` after the case guard. That gives `doc-no`, `verify-code`, `doc-qr` and `download-doc-btn` (`ดาวน์โหลดเอกสาร`, an `<a download>` to `/api/documents/<docNo>/pdf`).

`doc-qr[data-url]` = `<origin>/verify/<code>`. The origin comes from the request `Host` (and `X-Forwarded-Proto`), so it equals Playwright's `BASE_URL`. Pass `origin=` to override it.

### Already self-contained

`/head/approvals` and `/verify/[code]` need no wiring:
- `decidePage` already sends unknown codes to the 404 `ไม่พบเอกสาร` page with `data-result="NOT_FOUND"`. Found codes render 200 here with `verify-doc-no`, `verify-applicant`, `verify-service` (`SV-01 ขอหนังสือรับรอง`), `verify-issued[data-iso]` (`5 พ.ย. 2569 10:00`), `verify-expires[data-iso=YYYY-MM-DD]` (`2 ก.พ. 2570`) and `verify-signer`.
- TAMPERED renders only `verify-result`.
- The `[...path]` verify branch becomes dead code once this page exists.

## 5. Notes for other blocks

- **B09 notifications:** routing for APPROVED SV-02/03 uses `first_registry_claimant`, which matches `issuerOf`. For SV-01, `issuerOf` uses `approved_by ?? owner`, which in practice equals the first claimant.
- **B11 dashboard:** reject and issue set `closed_at = clock`. APPROVED stays in the backlog until ISSUE.
- **B07 queue:** SV-02/03 APPROVED rows are `owner=NULL` in `current_dept=registry`. They are not claimable, because the queue already hides `claim-btn` for APPROVED, and only the issuer gets `issue-btn`.

## 6. Verification (Node 24.22.3 throwaway container, `npm ci` from the lockfile)

- `tsc --noEmit` is clean across the whole workspace, including a copy with the §3/§4 wiring applied.
- `tests/unit/document-validity.test.ts`: 19/19 pass. Coverage:
  - validity: +89 days, anniversary −1, 29 Feb clamp, Bangkok date and inclusive expiry
  - signature order and per-field tamper detection; TAMPERED takes precedence over EXPIRED
  - masking, code pattern and uniqueness against `K7M2Q9XA`
  - annual DOC counters (2569 → 000002/000003 · 2571 → 000001)
  - origin sanitising
  - TC-WORKFLOW-01/02/03/05, TC-DOC-01/02/03 A–E and TC-RBAC-02, including B07 in TEST_MODE only
  - atomic rollback and 405s
- The rest of the unit/integration suite gives 228/229. The single failure, `dependencies.test.ts`, reads `../../../specs`, which did not exist in the container copy. It is environmental and unrelated.
- HTML smoke on the dev server (TEST_MODE=1, scratch copy with the §3/§4 wiring), fetched over HTTP:
  - `/verify/K7M2Q9XA` gives 200 VALID with all 6 facts, `สมชาย ใ***`, no `ใจดี` and the 3A scene
  - `/verify/ZZZZZZZZ` gives 404 `ไม่พบเอกสาร`
  - `off.reg2` on …000025 sees approve 1 · reject 1 · return 1 · forward 0 · issue 0
  - …000013 shows approve/reject 0
  - head on …000014 sees approve/reject 1 and issue 0
  - `/head/approvals` lists rows `…000014, …000011` for the head; `off.reg1` gets 403
  - after approve: issue 1. After issue: `doc-no` DOC-2569-000002, `doc-qr` `http://127.0.0.1:3000/verify/<code>` and `closed-at` `2026-12-01T09:00:00+07:00`
  - verify of the new document shows signer `เจ้าหน้าที่ทะเบียน 2`, `สมหญิง ร***` and expiry `2027-02-28`
  - the citizen PDF has the exact machine line
  - after tamper: TAMPERED with no facts
- Not run: canonical Playwright. It needs the B14 router, CaseDetail and the B02 specs.
