# Technical Research — Municipal e-Service

Research date: 2026-11-16. Scope: design documents for a local classroom mock system. This research does not implement the application or certify legal compliance. Local assignment documents remain authoritative for behavior, values, labels, endpoints, fixtures and expected test results.

## R1 — Runtime and application boundary

**Decision:** TypeScript, Next.js App Router on Node.js 24 LTS, SQLite through `better-sqlite3`, and Playwright. Use a self-hosted, single Node process on local disk. Record exact dependency patches in the implementation lockfile and the actual Node patch in the run evidence. Node's release table lists Node 24 as LTS; Next.js supports Windows, WSL and Linux with a Node minimum below this choice. These are compatibility findings, not a claim that the application has already been built. Sources: [Node release lifecycle](https://nodejs.org/en/about/previous-releases), [Next.js installation](https://nextjs.org/docs/app/getting-started/installation).

**Rationale:** One local runtime keeps the lab reproducible and supports file-backed persistence and native SQLite. No bank, ThaiD service, certificate authority, external queue or cloud account is needed. Next.js docs currently show the 16.x stable documentation (16.4.6 when researched); do not adopt canary dependencies or rewrite the assignment around framework defaults.

**Alternatives:** A separate Express API duplicates routing/deployment; serverless functions do not provide the required durable local file boundary; static export cannot serve the contract's stateful endpoints. Next.js itself documents filesystem/shared-state limitations of some lambda deployments. [Next.js backend guide](https://nextjs.org/docs/app/guides/backend-for-frontend).

## R2 — Every-request lifecycle and shared services

**Decision:** A small custom Node HTTP entry point, `server.ts`, captures the request instant, runs the lifecycle service for every path except `/api/test/*`, then delegates to Next's request handler. This includes public verify, health, page requests and assets: do not narrow the source rule to queue requests. Within the lifecycle transaction, expire NEED_FIX cases at the exact stored returned-at + 168-hour instant and then derive SLA notification recipients from current case state. It must be idempotent. These are inferences from CONTRACT §0.7 and REQUIREMENTS A-30/A-46, not external framework requirements.

**Rationale:** A single entry boundary makes request coverage inspectable. An application-only hook or browser poll can miss health/public routes. A custom server is a supported Next.js integration but is not traced by standalone output; run it as the server entry point and document its build/run scripts. Do not assume the ordinary `next start` command executes this wrapper. [Next.js custom server](https://nextjs.org/docs/app/guides/custom-server).

Pages, API handlers and this server entry use the same server-only domain module contracts. Persist all shared state (test clock, session generation, counters, settings) in SQLite: module-global memory is not the authoritative store, because bundling can produce separate module instances. Server Components call service functions directly rather than performing loopback HTTP requests. [Next.js backend guide](https://nextjs.org/docs/app/guides/backend-for-frontend#server-components).

**Alternatives:** Next.js Proxy executes before routes and now uses Node, but may run outside the application's principal runtime and is an unnecessary persistence integration point here. An external cron is both larger and unable to model frozen-time evaluation on each request exactly. [Next.js Proxy runtime and purpose](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#runtime).

## R3 — SQLite driver and storage

**Decision:** Use `better-sqlite3` with short synchronous transactions. Use one configured absolute `DB_PATH`, local disk, prepared statements, explicit foreign-key enforcement, `NOT NULL`/`CHECK`/`UNIQUE` constraints and a bounded busy timeout. Start with SQLite's ordinary rollback journal; WAL is not required for this small single-host fixture. WAL may be considered only after verifying the bundled SQLite version and actual workload; it is not a prerequisite for the required races. SQLite documents rollback atomicity and notes that WAL requires all processes to be on one host. [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html), [SQLite WAL](https://sqlite.org/wal.html), [SQLite constraints](https://sqlite.org/lang_createtable.html), [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html).

**Rationale:** The driver's transaction wrapper supports immediate transactions and rolls back on thrown errors. Do not put an `await` inside a transaction callback or catch-and-ignore database failures: the library explicitly warns that async callbacks commit before their awaited work. Decode uploads and perform other async preparation before entering the mutation transaction. [better-sqlite3 transaction API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function).

**Alternative:** Node 24's built-in `node:sqlite` is documented as Stability 1.2 (release candidate), so the mature external driver is the selected default rather than asserting the built-in API is stable. An ORM is unnecessary for the small explicit schema. [Node 24 SQLite status](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).

## R4 — Atomic money, numbering and case mutations

**Decision:** Every state-changing domain operation obtains an immediate write transaction, rereads the authoritative rows, checks permission before state/boundary rules, makes all related changes and appends its audit/timeline rows before committing. Transaction failure returns no partial success. SQLite permits only one write transaction at a time; `BEGIN IMMEDIATE` obtains that write intent before the read/check/write sequence. [SQLite transactions](https://www.sqlite.org/lang_transaction.html).

For payment: look up the ref; if already paid, return the original case and receipt with `duplicate:true` without new numbering or rows. Otherwise enforce the stored amount and age boundary (< 15 minutes), allocate a Buddhist-year sequence under lock, insert exactly one case/receipt, set the ref/draft paid and persist the initial SLA snapshot atomically. Store unique caseNo/receiptNo and a unique paid-case relationship to the draft; never derive the next number by an unprotected `MAX()+1`. Receipt suffix follows the case suffix. Document numbering is an independent sequence keyed by issue-year. Fee is locked at PENDING_PAYMENT; dueAt is calculated at payment and does not change retroactively when holidays change. These details follow BR-09–13/A-42/A-48.

Claim versus claim and cancel versus claim use the same pattern: reread status and owner under lock, perform a conditional update, inspect the affected-row count, then write audit. Only the winner commits success. For claim, preserve CONTRACT's precedence: permission → ALREADY_CLAIMED → WORKLOAD_LIMIT. A cancellation winner makes claim fail INVALID_STATE; a claim winner makes cancellation fail CANNOT_CANCEL. Staff actions that fail validation must not append success audits. Append-only audit means public PUT/PATCH/DELETE return the specified 405; reset is a test-only maintenance exception. Do not add a fictitious cryptographic audit-chain requirement.

## R5 — Deterministic time and local notifications

**Decision:** Inject a `Clock` abstraction and business calendar. In test mode the current instant is a frozen SQLite control-row value: reset sets `2026-12-01T09:00:00+07:00`, and PUT clock stores a validated ISO time with offset. Convert explicitly to Bangkok local dates for business-day arithmetic and Buddhist-year display. QR age, OTP locks, return windows, document validity, audit and timeline timestamps all use this clock; no direct machine-time reads inside business rules. A monotonic elapsed timer is acceptable only for the separate page-load measurement.

**Rationale:** Browser clock mocking alone cannot control the server, databases or API calls. This design follows the contract's own clock hook, so Playwright should set that hook and make a non-test HTTP request to trigger evaluation. Changing clock alone must not trigger lifecycle effects, since `/api/test/*` is excluded.

Notifications are local persisted outbox/inbox rows with `UNIQUE(case_id, recipient_id, level)`. Calculate recipients from current owner/department/head/issuer rules, and deduplicate an overdue head who already appears as an ordinary recipient. No email/SMS/queue sender is introduced. NEED_FIX and terminal states have no new SLA alerts. Auto-cancel time is the exact deadline even if the first triggering HTTP arrives later. Source: BR-14/15/20 and A-30/31/46.

## R6 — Authentication, mock signing and at-rest inspection

**Decision:** Opaque HttpOnly session cookies refer to server-side session records; reset deletes/increments the global session generation and clears attempts/locks so old cookies cannot authenticate. A role/department snapshot taken at login preserves the source rule that admin role edits take effect on the next login. New-citizen pre-registration sessions are restricted to registration.

Use AES-256-GCM for persisted national-ID and mobile fields, fresh per-value IVs and authenticated tags; keep keys outside SQLite and never prefix them `NEXT_PUBLIC_`. Use a separate keyed lookup digest for ID lookup, and retain only the **last three** ID digits needed for `X-XXXX-XXXXX-45-6`. Persist references rather than raw identity values in sessions/attempt records. HMAC-SHA256 signs exactly `docNo|caseNo|applicant|serviceId|issuedAt|validUntil|signer` in the contract's field order; verify with equal-length constant-time digest comparison. Tamper changes a stored signed field without recomputing its signature. Sources: [Node crypto cipher API](https://nodejs.org/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options), [HMAC API](https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options), [constant-time comparison](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b).

Inspect all persisted tables plus physical DB/journal contents for the specified plain ID/mobile seed values; prevent leakage in denormalized JSON, audit details, stored sessions and caches. Seed fixture source files are not the runtime database. This verifies the assigned NFR-04 scope only, not full PDPA or broader attachment/name/email encryption (Q-08). Browser responses still reveal full citizen ID only to its owner or the explicitly audited unmask endpoint.

## R7 — Contract transport and uploads

**Decision:** All Route Handlers use Node runtime and the specified paths/statuses/JSON. Do not opt dynamic or identity-sensitive data into static caches; set private/no-store response policy where appropriate and do not cache mutable clock-sensitive page data. Next.js Route Handlers are uncached by default but allow opt-in caching, so keep the choice explicit. [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Next.js runtime config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config).

Use route-handler multipart parsing rather than Server Actions' separate payload limit. The entry server must pass bodies through without truncation and accept at least 6 MB. The application validates per-file size 5,242,880 inclusive and returns 400 FILE_TOO_LARGE for 5,242,881 bytes; a framework 413 is a contract failure. Identify actual PDF/JPEG/PNG from magic bytes. Store uploaded bytes and metadata together in the SQLite transaction (a BLOB is sufficient at this scale), with authorization on reads. Never expose a public static upload directory or infer file kind from extension/MIME alone.

## R8 — Reproducible Playwright evidence

**Decision:** Configure `workers:1`, `fullyParallel:false`, and `retries:0` for the baseline and mutation campaign. Each TC resets then logs in fresh, including independent API contexts; source reset invalidates all sessions. Shared-database tests cannot run independently in parallel merely because browser contexts differ. Within the designated race TCs, intentionally send the two claims / six payments concurrently in separate authenticated contexts and inspect all results. Playwright documents that files run in parallel by default and one worker disables that behavior. [Playwright parallelism](https://playwright.dev/docs/test-parallel).

Use an owned Playwright `webServer` process with `reuseExistingServer:false`, health URL readiness and explicit TEST_MODE/BUG_MODE/DB_PATH. Build first for performance evidence, then launch the custom server's production command. Restart between baseline and each B01–B12; run the unchanged complete suite for each, save machine-readable results and compare the observed failing TC set with BUGS.md. Never mark intentional mutant failures as passing or weaken assertions. Each report must identify the configuration and seed reset. [Playwright web server](https://playwright.dev/docs/test-webserver), [Playwright configuration](https://playwright.dev/docs/test-configuration).

**Test-only fail-closed rule:** Check `TEST_MODE === '1'` before every `/api/test/*` dispatch and return 404 otherwise. BUG_MODE is process-start configuration and affects new rule checks, not immutable seeded records. Verify test hooks are closed in a separate server run without TEST_MODE. Do not claim 99.5% availability, production concurrency capacity, TLS deployment or completed TC execution from the design documents.

## R9 — Earlier B material choice (superseded by R10)

**Historical decision:** User initially selected B / Liquid Glass on 2026-11-16 and asked to remove the mouse-following
shadow. Keep the original transparent material, fixed bright edge and inner/outer shadows;
remove pointer listeners and cursor-position CSS variables. No tilt, parallax or hover depth change.
Fixed lighting keeps the selected appearance consistent while browsing data and forms.
See [design-system.md](design-system.md) and [layout matrix](contracts/ui-layouts.md).
Tokens are a starting implementation contract; actual composite contrast and browser fallback
still require T071 evidence. This design choice changes no source business requirement.

## R10 — User selected C / Illustrated Civic Service

**Current decision:** On 2026-11-16 the user chose “เอาแบบ C ครับ”. This supersedes R9's
material selection while retaining static light/shadows. Their clarified priority is related
storytelling objects on the UI: government offices, service buildings and civic-service objects.
Use the C palette/composition and semantic asset mapping in [design-system.md](design-system.md)
and [design-assets.json](design-assets.json). The panorama and SVG set are original project assets.
Keep dense data readable and functional labels authoritative. Prototype compact typography is not
the production 16px body / 14px labels / 44px controls scale. No business-rule or canonical TC change.

## R11 — Thai suburban municipal-office scene

The user approved C and requested the scene feel like a municipal office in suburban Thailand,
with less vegetation. Scene revision 2 keeps the watercolor material and composition, introduces
an ordinary civic-office forecourt, local street/parking and neighboring low-rise buildings,
and uses sparse roadside greenery. This refines the decorative scene only. Token colors,
layout, service-object meanings and source business rules remain unchanged.
See [asset manifest](design-assets.json) and [image provenance](design-examples/c-civic-story/DESIGN.md).

## R12 — Left-continuous scene and local greeting fade

The user requested more illustration extending left and a gradient at “สวัสดี คุณสมชาย”.
Scene revision 3 fills the leftward neighborhood. The hero renders the unfaded bitmap directly;
`hero-copy::before` applies a cream linear gradient and vertical mask only behind the text.
This preserves the new scene outside the greeting and keeps the effect independent of asset generation.
Both fade and scenery remain static; compact widths use a reduced text-area footprint.
