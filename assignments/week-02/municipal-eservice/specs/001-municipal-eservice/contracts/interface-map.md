# Interface Map and Additive Decisions

2026-11-16. Design only. Authoritative [CONTRACT.md](../../../CONTRACT.md) is preserved.
[inventory.json](inventory.json) is a source projection, not a replacement oracle.
It contains16 page-route rows,46 API/test-hook entries (including compound rows),
33 exact-error rows and155 selector rows. Source row numbers aid review.

## Required interfaces

| Family | Source | Implementation boundary | Story |
| --- | --- | --- | --- |
| HTML paths and role landings | CONTRACT §1 | web/src/app/ pages + RoleLayout, policy checks on server | all |
| UI controls/testids/data-* | CONTRACT §2–4 | page/components; absent means not rendered, disabled means disabled | all |
| Exact Thai errors, status/code JSON | CONTRACT §5 | web/src/server/http/errors.ts + UI binding | all |
| ThaiD/staff/register/logout/me | CONTRACT §6.1 | auth/session services, exact path dispatcher | US1/US2 |
| Draft/file/payment/case/PDF | CONTRACT §6.2 | drafts/uploads/payments/cases/documents; distinct resource policy | US3–US6/US8/US11 |
| Queue/claim/return/forward/decision/issue/unmask/notifications | CONTRACT §6.3 | claims/review/approvals/documents/sla + allowlist serializers | US7–US11 |
| Verify/dashboard/audit and exports | CONTRACT §6.4, §7 | public document projection, aggregate snapshot, append-only audit | US11–US13 |
| Admin services/holidays/users | CONTRACT §6.5 | admin mutations with bounds and audit | US14 |
| Health | CONTRACT §6.6 | unauthenticated200 exactly {"status":"ok"} | shared |
| Case JSON, audit detail | CONTRACT §6.7–6.8 | role-specific serializer and event formatter | US5/US8/US13 |
| Reset/clock/pay/tamper, BUG_MODE | CONTRACT §8, BUGS | test-hooks dispatcher gated before every test route | shared |

All server APIs use HttpOnly cookie sessions. Anonymous protected API401; wrong role403;
foreign citizen resource404 identical to missing. Protected HTML anonymous redirects /login;
wrong role returns403 forbidden-msg. Verify missing returns404; found valid/expired/tampered200.
Audit PUT/PATCH/DELETE return405 METHOD_NOT_ALLOWED for collection and arbitrary item IDs,
including admin, before normal role/resource checks. Unknown test route when hooks disabled404.

No staff case/queue JSON may contain idNo/full13digits or formatted full ID; unmask is the
explicit audited exception. GET case detail officer/head permissions differ from attachment
current-or-past-department policy. PDF permissions follow its own source row, not attachment policy.

## Additional interfaces for specified UI behavior

These are design decisions, not claims that the source already specifies the HTTP method.
They complete file-remove/draft-resume controls and preserve every original mandatory endpoint.

### ADI-01 — Update a saved draft

`PATCH /api/drafts/:id` owner citizen only. Body is the service's editable input:
SV-01 `{ "qty": 2 }`, SV-03 `{ "areaSqm": 101 }`, SV-02 no fee input.
Return200 draft detail below. Other citizen/missing draft404 NOT_FOUND; wrong role403;
invalid quantity/area uses source400 codes/messages; paid draft409 INVALID_STATE.
Apply original fee rules. ServiceId/applicant/locked_fee cannot be changed by this body.
Only DRAFT accepts input edits. PENDING_PAYMENT is read-only for fee-affecting fields;
regenerating QR preserves locked amount, preventing retroactive fee alteration.

### ADI-02 — Remove an attached draft file

`DELETE /api/drafts/:id/files/:fileId` owner citizen only. Return204.
Foreign/missing resource404; other roles403; paid draft409 INVALID_STATE.
Allow only unpaid DRAFT/PENDING_PAYMENT. Remove bytes+metadata together, update count/missing
slots, and recheck required files server-side at payment callback as well as QR creation.
Deleting required evidence cannot let an already-created QR submit an incomplete case.
If evidence is missing at callback, return409 MISSING_DOCS without accepting payment.
This defensive addition does not alter the baseline cases or their expected results.

### ADI-03 — Draft detail extension

Keep required `GET /api/drafts` list shape `{items:[{draftId,serviceId,status,fee}]}`.
`GET /api/drafts/:id` returns an object containing those four fields plus service inputs
(`qty` or `areaSqm`) and `files:[{fileId,name,docKey,size}]` for resume/remove UI.
No new citizen data is added to staff endpoints. Source TC file-count/input assertions
consume this detail; they do not require changing the list response.

## Transport and lifecycle decisions

- Exact API paths/methods are dispatched from one Node route handler; methods not supported
  by source receive errors without partial domain writes. Error strings include source
  en dash U+2013; UI money/date formatting uses source strings, not ad hoc locale defaults.
- Body acceptance at least6MB; source file limit5,242,880inclusive. A5,242,881-byte upload
  reaches domain validation and returns400 FILE_TOO_LARGE, never framework413.
- Every HTTP except /api/test/* runs lifecycle BEFORE handler via custom server.ts,
  including public verify/health and asset paths. Frozen DB clock, private/no-store projections.
- PUT clock validates ISO with explicit offset; hooks themselves cause no notifications.
  Reset clears all sessions and runtime mutations; every actor must authenticate again.
- Claim precedence: permission -> ALREADY_CLAIMED -> WORKLOAD_LIMIT. Cancel-v-claim has one winner.
- API field names including `ontimePct`, `dueAt`, `idMasked`, `closedAt`, `validUntil`
  remain exact even where physical storage uses snake_case.

## Output contracts

- Document PDF: application/pdf, filename DOC-....pdf and extractable ASCII document number;
  Thai content is asserted through verify page. HMAC order is
  `docNo|caseNo|applicant|serviceId|issuedAt|validUntil|signer`.
- Dashboard XLSX first sheet headers `ตัวชี้วัด`, `ค่า`; rows2–6 are received/closed/on-time/
  backlog/overdue labels and displayed text as CONTRACT §7. Empty denominator uses `–`.
- Dashboard PDF contains one extractable ASCII KPI line as specified; empty ratio `ontime=-`.
  Neither dashboard nor exports exposes applicant name, full ID or phone.
- Audit CSV UTF-8 header/order exactly CONTRACT §7; filtered newest-first snapshot is taken
  BEFORE its EXPORT event, then audit is appended before response. Equal time uses ID descending.

## Mutation evidence contract

`BUG_MODE` only changes named server rule checks, never seed or expected test assertions.
Required failure set R and permitted extra set A come from inventory.mutations / BUGS §2.
For observed failures O, require `R ⊆ O ⊆ R ∪ A`, no skips/timeouts/infrastructure failures.
Combined modes union R and A. Report assertion expected/actual values and separate allowed extras.
B08 must deterministically permit second sequential claimant and replace holder, not merely
increase race probability. B07 UI remains hidden; B09 UI remains masked; B11 skips only UNMASK audit.
