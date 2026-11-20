# Implementation Plan: e-Service กลาง เทศบาลนครตัวอย่าง

**Branch**: `review-week2student-assignment` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-municipal-eservice/spec.md` and immutable source documents.
**Feature context**: `001-municipal-eservice` from `.specify/feature.json`; Spec Kit's
BRANCH output here is a feature-directory fallback, not a newly created git branch.

## Summary

Build the selected Next.js + SQLite + Playwright local classroom app for 3 services,
6 roles and 14 stories. Shared server-only domain services enforce the existing contract.
A small custom Node HTTP entry evaluates lifecycle before every non-test request.
No external SSO, bank, CA, message broker or separate backend service is needed.
This delivery contains design documents and an interactive offline wireframe atlas; application source paths and commands below are planned.

## Technical Context

**Language/Version**: TypeScript strict; Node.js 24 LTS, actual patch recorded at implementation.

**Primary Dependencies**: Next.js 16 App Router, compatible React peer version,
`better-sqlite3`, Playwright, `@axe-core/playwright`, Node crypto; PDF/XLSX/QR generation
libraries selected and pinned in T001 after compatibility check. Exact dependency patches
belong in the implementation lockfile, not an invented version in this draft.

**Storage**: One SQLite file at absolute `DB_PATH`, local disk, foreign_keys ON,
prepared statements, rollback journal and 5,000ms busy timeout. File bytes can be BLOBs.
Authoritative clock, session generation, counters and settings live in DB, not globals.

**Testing**: 51 acceptance IDs:50 browser/API cases plus1 standalone DB/filesystem
inspection invoked by a named runner wrapper. Targeted unit/integration checks for time,
calendar, rounding, authorization and atomic mutation risks. No application tests run yet.

**Target Platform**: Self-hosted single Node process, Windows/WSL/Linux; Chromium
browser timezone Asia/Bangkok. No serverless, static export or ephemeral file database.

**Project Type**: Stateful classroom web application; pages and HTTP API share domain services.

**Performance Goals**: Five source pages reach load within3,000ms local; two concurrent
claimants and six simultaneous payments satisfy invariants. Production capacity remains Q-06.

**Constraints**: Exact routes/JSON/testids/errors/exports; business time via injected Clock;
body at least6MB; file max5,242,880bytes; test hooks only TEST_MODE=1; workers=1 for shared DB.

**Scale/Scope**: 30 paid seed cases,2 drafts,1 document;3 services,6 roles,14 stories,
51 acceptance IDs,12 fault modes. Inventory has16 HTML route rows,46 API/test-hook entries,
33 error rows,155 selector rows (compound rows are not unique endpoint/selector counts).

## Constitution Check

| Gate | Before research | After design | Evidence |
| --- | --- | --- | --- |
| I Source fidelity | Design pass | Design pass | manifest, traceability, DECISIONS §18 precedence |
| II Observable contract | Design pass | Design pass | contracts/interface-map.md, inventory.json, story tasks |
| III Time/atomicity | Design pass | Design pass | research R2–R5, data-model.md, transactions below |
| IV Policy/privacy | Design pass | Design pass | distinct resource policies, serializers, inspection |
| V Evidence/simulation | Design pass | Design pass | quickstart campaign; real integrations excluded |

Design pass means no document-level conflict, not runtime acceptance. No extensions.yml
exists, so before/after constitution/specify/plan/tasks/analyze hooks are absent.

## Project Structure

### Documentation (this feature)

```text
.specify/memory/constitution.md
.specify/feature.json
specs/001-municipal-eservice/
  spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
  traceability.md, source-manifest.json
  contracts/interface-map.md, contracts/inventory.json
  checklists/requirements.md, checklists/design-review.md
TAKEOVER.md
```

### Source Code (repository root — planned)

```text
web/
  package.json, package-lock.json, tsconfig.json, next.config.ts
  server.ts
  scripts/{seed,inspect-at-rest,run-campaign,compare-results}.ts
  src/app/
    layout.tsx, page.tsx, login/page.tsx, register/page.tsx
    citizen/page.tsx, citizen/new/[service]/page.tsx, citizen/cases/[caseNo]/page.tsx
    officer/queue/page.tsx, officer/cases/[caseNo]/page.tsx
    head/approvals/page.tsx, dashboard/page.tsx, audit/page.tsx
    admin/{services,holidays,users}/page.tsx
    notifications/page.tsx, verify/[code]/page.tsx
    api/[...segments]/route.ts
  src/components/{CaseDetail,CaseStatus,SlaLevel,UploadSlots,RoleLayout}.tsx
  src/server/
    db/{connection,schema,seed}.ts
    domain/{clock,calendar,fees,auth,drafts,uploads,payments,cases,claims}.ts
    domain/{review,approvals,documents,sla,lifecycle,notifications}.ts
    domain/{dashboard,audit,admin}.ts
    security/{crypto,session,policy,serializers}.ts
    http/{router,errors,test-hooks}.ts
    output/{pdf,xlsx,csv}.ts
    testing/bug-modes.ts
  tests/e2e/{auth,register,drafts,uploads,citizen,payments,queue}.spec.ts
  tests/e2e/{review,sla,approvals,documents,dashboard,audit,admin,nfr}.spec.ts
  tests/e2e/nfr04-inspection.spec.ts
  tests/fixtures/{actors,reset,files}.ts
  tests/unit/{calendar,time-boundaries,fees,document-validity}.test.ts
  tests/integration/{transactions,policy,reset,inspection}.test.ts
  playwright.config.ts
  var/eservice.sqlite
  evidence/{baseline-1,baseline-2,B01..B12,combined-1,combined-2,baseline-final}/
```

**Structure Decision**: Keep implementation in web/ so scaffold cannot overwrite the
assignment. A single API catch-all dispatches exact methods/paths and errors; it is not an
authorization bypass. Custom server.ts calls lifecycle before delegating to Next, including
public verify, health and assets; only /api/test/* skips it. Run this entry, not next start
alone. Next standalone output does not trace custom server; use documented self-hosted entry.

## Phase 0: Research and Decisions

[research.md](research.md) records eight decisions with primary sources and alternatives.
Separate research covered source rules, contract/test oracles and technical architecture.
Technical choices required for this draft are resolved. Q-01–Q-36 remain real agency
questions with classroom A-01–A-63 defaults, not guesses presented as agency confirmation.

## Phase 1: Data, Interfaces, and Validation Design

### Request lifecycle

1. Capture request time through Clock. In test mode read frozen DB control; production
   adapter is the only boundary permitted to read machine time. No domain Date.now().
2. Except /api/test/*, run a short lifecycle transaction: expire NEED_FIX at now>=deadline,
   timestamp cancellation at deadline, then calculate current-level notifications.
3. Delegate to Next; pages call shared services directly, without loopback HTTP.
4. Persist all shared state. Apply private/no-store to identity/clock-sensitive responses;
   do not opt mutable data into static caches. Changing clock alone triggers no lifecycle.
5. TEST_MODE gate runs before dispatch of every test endpoint; otherwise404.

### Atomic mutations

- Payment: if ref already PAID return original numbers duplicate=true; otherwise validate
  amount/age, allocate annual EG/RC under immediate write lock, insert case/receipt,
  save initial SLA snapshot and update draft/ref together. Unique paid case per draft
  prevents different QR refs paying the same draft twice. No unprotected MAX()+1.
- Claim/cancel: reread rows under immediate transaction; permission -> already claimed
  -> workload check for claim. Conditional update and audit/timeline commit together.
  Claim/claim and cancel/claim must have one winner and the contracted409 loser.
- Return/forward/approve/reject/issue: check holder, role, step, state and trimmed reason
  before mutation. Retain first registry claimant as issuer for SV02/03. Audit and
  timeline are part of the same transaction; failures create no success event.
- Unmask: verify reason/policy and append UNMASK before returning plaintext. If audit
  fails, reveal nothing. A transient page reveal is not persisted or cached.
- Exports: take filtered snapshot, generate output, append EXPORT before sending;
  audit CSV snapshot excludes its own EXPORT. Equal timestamps sort newest audit ID first.
- Admin: validate bounds/self-change, update+audit. Sessions retain role/dept snapshot
  until next login. Fee locks at PENDING_PAYMENT, dueAt locks at payment; holiday changes
  only affect new due calculations and resubmit extension using current calendar.
- Reset: atomically clear runtime data, all sessions, OTP locks/counts, alerts, audit,
  new uploads and tampered documents, restore source seed/counters and frozen clock.
  Seed due dates are literals even under B03; do not recalculate historical records.

Transaction callbacks are synchronous. Prepare multipart/async work before the transaction
then revalidate authoritative state under lock. Allow no partial case/receipt/audit success.

### Policy and privacy

Separate case, draft, attachment, document-PDF, queue, decision, dashboard, audit and admin
policy functions. Do not impose attachment historical-department rules on ordinary case
JSON where CONTRACT grants officer/head access. Citizen foreign resources are404, wrong
roles403, anonymous API401. Audit mutation405 must apply even for missing IDs and admin.
Use allowlist staff serializers with last3 ID mask. Store AES-GCM ID/mobile and keyed lookup
digest; no plaintext in sessions, attempts, JSON columns, logs or runtime backups.
B09 alters queue JSON only; B07 leaves unauthorized UI button hidden while API faulty.

### Additive interface decisions

[contracts/interface-map.md](contracts/interface-map.md) defines supplementary draft PATCH,
file DELETE and draft-detail fields for controls the source specifies without HTTP details.
They preserve every required original route/payload. No other contract gap is a reason to
change a source expectation. HMAC field order follows CONTRACT §3/A-22; expiry follows BR-23.
A-63 covers PDF/inspection testing. Supplemental unit checks cover half-up ties (A-41) and
no-surname masking (A-58) without changing the canonical 51 acceptance IDs.

### Delivery and evidence

Shared storage/clock/policy/seed/hooks precede stories. US1–US4 -> US6 -> US5 provides
citizen MVP; US7 -> US8 -> US10 -> US11 provides staff completion. US9 can develop after
foundation but must integrate before acceptance. US12/US13 use seeded events and separate
modules; US14 verifies fee/calendar/role consequences after their services are ready.
A single owner integrates shared schema/router/errors/fixtures. [P] means disjoint files
with prerequisites complete, never parallel execution of shared-database acceptance cases.

Full acceptance:51 IDs via runner (50 browser/API +1 standalone inspection wrapper).
Baseline twice without restarting,12 single mutants,2 combined sets,final clean baseline.
The same suite/assertions run unchanged; record required/allowed/observed failing sets.
No availability99.5%, real capacity, TLS deployment or legal-compliance claim from local tests.

See [data-model.md](data-model.md), [quickstart.md](quickstart.md), [tasks.md](tasks.md),
and [traceability.md](traceability.md).

## Complexity Tracking

No constitution exception. One custom HTTP entry is justified by the every-request rule.
A persisted notification inbox avoids external queues/schedulers not needed by the contract.

## Selected UI direction — C / เมืองแห่งบริการ

The user selected C on 2026-11-16. Use [design-system.md](design-system.md),
[design-tokens.json](design-tokens.json), [generated CSS](design-tokens.css),
[design-assets.json](design-assets.json) and [15-page layout matrix](contracts/ui-layouts.md).
Relevant civic artwork is required: municipal building for welcome/identity; certificate, shop
and house/blueprint for SV-01/02/03; folder → service counter → certificate for the journey.
Use forest-green navigation and warm translucent cream cards with fixed light/shadows;
no pointer tracking, tilt, parallax or hover depth changes. Preserve the source functional contract.
T001 installs tokens/art; T017 builds the shared C shell and reusable illustration component;
T071 verifies the visual behavior and accessibility alongside source NFR checks.
The [selected preview](design-preview.html) demonstrates citizen home and staff queue;
application implementation remains pending. Earlier B is archived as history.

### Wireframe อ้างอิงก่อน implementation

[Wireframe C ครบ 15 หน้า](wireframes/index.html) ใช้ประกอบงาน T017 และการพัฒนา UI ตาม [ขอบเขต](wireframes/README.md) ไม่เปลี่ยนสถานะงาน implementation 78 งานหรือผล canonical 51 TC

## Approved visual handoff — 2026-11-18

Use the selected C tokens and current [layout contract](contracts/ui-layouts.md).
The role shell has no app-header; profile/account/logout are in the sidebar menu.
Approved MP4/poster selection is in [motion manifest](design-assets/motion/manifest.json).
T001 preserves these files and hashes; T017 shares illustration/video/profile components;
T071 adds pause/play, reduced-motion, media fallback and pointer-invariance checks.
These supplement visual evidence without renaming the original 51 acceptance IDs.
[To-do list](TODO.md) and [prototype review](wireframes/review-20261118.md) separate design
handoff completion from the 78 still-pending application tasks.

## Foundation increment — 2026-11-18

Foundation T001–T013 implemented; [actual evidence](foundation/verification-20261118.md). T014–T078 remain pending. Current landing is foundation scaffolding, not completed login/role UI. Canonical51 acceptance and mutation campaign are still pending. Historical design-only notes do not supersede this record.

## Authentication increment — 2026-11-18

T014–T020 implemented with the approved C layout, native media, private sessions and registration. [Actual evidence](auth/verification-20261118.md). T021–T078 and full51/mutation campaign remain pending. Unfinished role workflows use clear preparation states.
