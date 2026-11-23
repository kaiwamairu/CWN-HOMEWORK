# Municipal e-Service (design C "เมืองแห่งบริการ")

T001–T078 are integrated: ThaiD/SSO simulation, drafts and fees, uploads, QR payment, citizen
tracking/corrections, department queues, review/return/forward, business-day SLA and notifications,
approvals with signed PDF and public verify, dashboard exports, audit trail and admin settings.
The custom server owns the HTTP lifecycle, page guards and the API router; Next renders pages.

## One-command run (Docker Compose)

From `app/` (the folder that holds `compose.yaml`):

```sh
TEST_MODE=1 BUG_MODE= docker compose up --build --wait     # classroom hooks on, no mutants
docker compose down                                        # data lives in tmpfs, gone on down
```

The service publishes `127.0.0.1:3000`. `GET /api/health` returns `{"status":"ok"}`.
Each container start creates three fresh keys and seeds a fresh DB in tmpfs (never the user DB).
`TEST_MODE` other than `1` disables every `/api/test/*` hook (404) and ignores `BUG_MODE`.
`BUG_MODE` takes comma-separated codes from `BUGS.md`, for example `BUG_MODE=B03,B07`.

## Local development (Node 24)

```sh
npm ci                       # .npmrc keeps ignore-scripts=true
npm run setup:local          # creates a private .env.local once; never overwritten
npm run db:seed              # resets the selected DB_PATH (local DB only)
npm run dev
```

ThaiD OTP is `123456`; staff password is `Test@1234`. Identities are in `TEST-DATA.md`.

## Verify

```sh
npm run typecheck
npm run test:unit                       # unit + integration on in-memory/temporary DBs
npm run build
npx playwright install chromium
npm run test:acceptance                 # preflight (exactly 51 canonical IDs) + full suite on an owned server
npm run accept:campaign                 # exclusive: baseline ×2, B01–B12, 2 combos, final baseline
```

`accept:campaign` (`scripts/run-campaign.ts`) starts its own servers on fresh isolated TEST_MODE DBs
under `evidence/campaign-<stamp>/`, runs the same unchanged suite each time and judges results with
`scripts/compare-results.ts` against `BUGS.md` §2 (required ⊆ failed ⊆ required ∪ allowed; any skip,
timeout or infrastructure failure fails the run). It also probes a hooks-disabled server first.
Options: `--out <dir>`, `--port <n>`, `--only hooks,baseline,B01,…,final`.

`test:nfr04` / `scripts/inspect-at-rest.ts` is the TC-NFR-04 inspector:
`DB_PATH=<abs> node --import tsx scripts/inspect-at-rest.ts --json -- <value> …`. It byte-scans the DB,
its `-wal/-shm/-journal` siblings, a logical dump of every table (from an in-memory copy) and any
`*.log` beside the DB, counting UTF-8 and UTF-16LE occurrences. The last stdout line is JSON; exit 0
only when every count is 0.

## Constraints

- Keys come from private configuration; DB_PATH is absolute. All business time comes from `domain/clock.ts`.
- `immediate()` callbacks are synchronous with I/O prepared first.
- Preserve the ten source documents, the 64 canonical tokens and approved media hashes, the greeting
  fade `translateY(12px)` and `#staff-login .field + .button{margin-top:20px}`. Local text contrast
  corrections (`#5e684e`, `#466553`) leave token values intact.
- Shared integration files (router, test hooks, policy, serializers, page access, CaseDetail,
  RoleLayout, civic.css, PDF facade) are described in `../handoffs/B14-integration.md`.
