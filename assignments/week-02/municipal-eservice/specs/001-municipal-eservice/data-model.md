# Data Model: municipal e-Service

2026-11-16. Design only. Physical names guide `web/src/server/db/schema.ts`.
Behavior follows REQUIREMENTS, CONTRACT, TEST-DATA and DECISIONS §18.
Use integer-baht money, explicit-offset instants, Bangkok local dates and foreign keys.

## Entities and constraints

| Entity | Fields and constraints | Relationship / owner story |
| --- | --- | --- |
| users | id PK, staff username UNIQUE; name; citizen id_lookup UNIQUE keyed digest; id_cipher/IV/tag; id_last3 exactly 3 digits; mobile_cipher/IV/tag; optional email; registered; consent_at; role enum citizen/officer/head/executive/auditor/admin; officer dept registry/works | applicant, actor, holder, signer; US1/US2/US14 |
| sessions | opaque token digest PK, user FK, role/dept snapshot at login, registration-only flag, generation; never plaintext ID/mobile | all invalidated at reset; US1 |
| auth_attempts | id_lookup PK, wrong_count integer 0–3, locked_until nullable; clears on correct OTP or lock expiry | no raw ID; US1 |
| services | id enum SV-01/SV-02/SV-03 PK; fixed labels/routing/slots; fee or fee_base and fee_per_sqm integer 0–100000; sla_days integer 1–60 | admin edits existing services, no add/delete; US3/US14 |
| holidays | local date PK UNIQUE, name; seed 2026-12-07, 2026-12-10, 2026-12-31, 2027-01-01 | calendar; US9/US14 |
| drafts | DR-fourdigits UNIQUE, applicant/service FK; SV-01 qty integer 1–5 default 1; SV-03 area_sqm integer 1–500; status; fee preview; locked_fee nullable until first PENDING_PAYMENT | no EG before payment; US3/US4/US6 |
| files | id PK, draft/case FK, doc_key, safe display name, actual type PDF/JPEG/PNG, BLOB, size ≤5242880 bytes; max5 total; blueprint PDF only | resource-specific reads; US4/US8 |
| payment_refs | PP-fourdigits UNIQUE, draft FK, locked amount, created_at, expires_at=+900s, paid_at/case nullable; PENDING/PAID/EXPIRED | many refs per draft; one paid case per draft; US6 |
| cases | EG-BEyear-sixdigits UNIQUE PK; new draft FK UNIQUE; applicant/service FK; inputs, locked_fee, paid_at, sla_days_snapshot, due_at, status, step1–3 SV-03 else null; current_dept, owner, first_registry_claimant, previous_holder; return_count0–2 baseline; returned_at/fix_deadline; approved_by; closed_at | paid cases; legacy seed independent of draft; US5/US7–US11 |
| case_departments | (case_no,dept) UNIQUE, entered_at; only stages actually entered | attachment history, never future route; US8 |
| timeline | id PK, case FK, event, actor nullable, effective_at, from/to status, note | includes auto-cancel effective deadline; US5 |
| receipts | RC-BEyear-sixdigits UNIQUE; case FK UNIQUE, ref nullable legacy, amount, paid_at | suffix equals case; US6 |
| counters | (kind,year) UNIQUE for case/document; yearless draft/payment; next_value positive | increment inside write transaction; US3/US6/US11 |
| documents | doc_no UNIQUE, case FK UNIQUE, verify_code UNIQUE matching `[A-Z0-9]{8}`; applicant snapshot, service_id, issued_at, valid_until inclusive date, signer snapshot, issuer FK, HMAC, PDF bytes or reproducible input | one legacy seeded PDF only; US11 |
| notifications | id PK, case/recipient FK, level near/overdue, created_at,text; UNIQUE(case_no,recipient,level) | persisted in-app inbox; US9 |
| audit | monotonic id PK, time, username/role snapshots, event enum10, nullable case/from/to, detail; public append-only | export snapshot before own EXPORT; US13 |
| runtime_control | singleton frozen_now, session_generation, schema/seed version | shared DB control, never authoritative module globals; FR-28 |

Use NOT NULL/FK/UNIQUE for storage invariants. Do not invent email/name limits that reject fixtures.
The baseline return_count maximum2 is a domain rule, not a SQL CHECK that prevents B12.
B08 must also be able to replace a holder while the baseline performs a conditional update.

## State transitions

| From | Actor/action | To | Atomic effects |
| --- | --- | --- | --- |
| DRAFT | owner creates QR, slots complete | PENDING_PAYMENT | freeze amount once; PP ref; no EG/RC |
| PENDING_PAYMENT | owner regenerates QR | PENDING_PAYMENT | new ref, same frozen amount |
| PENDING_PAYMENT | mock payment exact amount, age<900s | SUBMITTED | EG/RC, paidAt, SLA snapshot/dueAt, registry history |
| SUBMITTED unowned | current-dept officer claims | IN_REVIEW | owner, initial registry issuer, CLAIM |
| SUBMITTED unowned | applicant cancels | CANCELLED | no refund; timeline; competes atomically with claim |
| IN_REVIEW | holder returns, trimmed reason≥10, count<2 | NEED_FIX | count+1, previous holder, returnedAt, fixDeadline+168h, RETURN |
| NEED_FIX before deadline | applicant resubmits | IN_REVIEW | restore holder even over10, extend due via current calendar |
| NEED_FIX at/after deadline | lifecycle | CANCELLED | timestamp=fixDeadline; no fictitious staff event |
| IN_REVIEW SV-03 step1 | registry holder forwards | IN_REVIEW step2 | works, owner null, works participation, FORWARD |
| IN_REVIEW SV-02 / SV-03 step2 | holder forwards | PENDING_APPROVAL | head step (SV-03 step3), retain initial issuer |
| IN_REVIEW SV-01 | holder approves | APPROVED | signer=approver, APPROVE; not yet closed |
| PENDING_APPROVAL SV-02/03 | head approves | APPROVED | head signer, initial registry issuer retained |
| IN_REVIEW SV-01 / PENDING_APPROVAL SV-02/03 | authorized reject, reason≥10 | REJECTED | closedAt, REJECT, nonrefund note |
| APPROVED | designated issuer issues | COMPLETED | DOC sequence, code/HMAC/PDF, closedAt, ISSUE |

COMPLETED/REJECTED/CANCELLED are terminal. Owner can delete unpaid DRAFT/PENDING_PAYMENT
and invalidate related refs. Invalid transitions return exact source errors.

## Time rules

- Instants returned as ISO+07:00; derive dates in Bangkok, never host locale.
- D0=payment date only on business day before16:30:00, else next business day.
  Due=N business days AFTER D0 at16:30, calculated once at payment.
- NEED_FIX extension=count business dates in (returnDate,resubmitDate], then add that
  many business days to old due using calendar at resubmit; same date adds0.
- OTP locked while now<lockedUntil; QR valid age<900s; resubmit allowed now<fixDeadline.
- SLA normal remaining≥2, near remaining≤1 and now≤due, overdue now>due;
  NEED_FIX paused, terminal closed. Remaining counts business dates after today through due date.
- SV-01 validUntil=issueDate+89days; SV-02/03=next anniversary minus1day, clamp Feb29
  anniversary to Feb28 first. Expires at following local midnight. Verify signature before expiry.
- Clock skips levels: notify current level only. Hooks change clock without lifecycle.

## Numbering and seed

Seed exact TEST-DATA §1–12:30 numbered cases,2 drafts,1 document; PP-0001 for DR-0002
amount500 created08:55 expires09:10. Next: DR-0003, PP-0002, EG/RC-2569-000031,
DOC-2569-000002. New payment year2570 starts EG/RC-2570-000001. DOC has its own issue-year counter.
Keep historical dueAt and legacy case state fixed even under BUG_MODE; other legacy COMPLETED
cases have no downloadable document. Seed document HMAC is computed using the test key.
Reset leaves audit/notification empty; first normal request generates reg1=3/reg2=1/head=1/works=0.

## Projections, privacy and audit

- Staff/head case JSON: idMasked only, citizen owner idNo instead. ID mask shows last3:
  `X-XXXX-XXXXX-45-6`. Unmask is transient; never cache full ID in page state across reloads.
- Verify: missing404 NOT_FOUND; bad HMAC200 TAMPERED with result only; then expired200;
  otherwise VALID. Mask name as full given name + first surname character +***;
  if no surname, use givenName + " ***" (A-58), with a supplemental unit check.
- Received counts paidAt in period including cancelled; closed counts COMPLETED/REJECTED
  closedAt in period; onTime closedAt≤dueAt; ratio divide by closed, half-up1decimal;
  zero closed=null API / `–` UI. Annual ratio uses total counts, never mean monthly percentages.
- Backlog current SUBMITTED/IN_REVIEW/NEED_FIX/PENDING_APPROVAL/APPROVED, period-independent;
  service filter applies. Overdue excludes NEED_FIX. Workload=owned IN_REVIEW, ignores filters.
- Audit event enum: STAFF_LOGIN CLAIM RETURN FORWARD APPROVE REJECT ISSUE UNMASK EXPORT
  ADMIN_CHANGE. Date filter [start00:00,nextDay00:00) Bangkok; newest time then newest ID.
- AES-256-GCM ID/mobile with fresh IV/tag; separate HMAC lookup key, no raw IDs in sessions,
  attempts, stored JSON columns, audit or logs. Authorized citizen/unmask responses remain
  the contracted exceptions. Signing keys outside DB/public bundles. Do not claim legal validity.
- HMAC input exactly `docNo|caseNo|applicant|serviceId|issuedAt|validUntil|signer`
  (CONTRACT §3 / A-22; A-63 instead covers PDF/inspection testing).
  Check digest length before timing-safe compare; tamper changes a signed field without re-signing.

## Inspection boundary

Inspect decoded runtime tables and physical DB/sidecars/logs for source NFR-04 canaries.
Source fixture constants are not the runtime database. Name/email/attachment encryption remains
Q-08; this verifies assigned ID/mobile scope only. Inspector must include session/audit/JSON
copies, not only selected encrypted columns. Keep encryption key outside storage being inspected.
