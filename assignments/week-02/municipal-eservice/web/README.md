# Municipal e-Service — authentication increment

T001–T020 implemented and verified on Node24.22.3 / Next16.4.6. This increment provides
ThaiD/SSO simulation, OTP lock boundaries, HttpOnly sessions, role/page guards and first registration.
The approved C layout and original clips are used on login/register/home/seed verification.
Workflow commands for T021 onward remain pending; their pages show preparation states.

## Start

Use a Node24 terminal. From week2_student:

```powershell
npm --prefix web ci
npm --prefix web run setup:local
npm --prefix web run db:seed
npm --prefix web run dev
```

Open http://127.0.0.1:3000/login. setup:local preserves an existing private .env.local.
db:seed deliberately resets the selected database and revokes sessions; use it for a fresh demo.
Existing databases can start directly. Save component/page/CSS files for frontend development updates.
For production run build then start. Both start/dev use the custom every-request lifecycle server.

Only four supplied ThaiD identities are supported; OTP is123456. Staff source accounts use
the classroom SSO password Test@1234. Seed identities/role names remain in TEST-DATA.md.
The public demonstration uses simulated services; it does not contact a ThaiD/SSO provider.

## Verify

```powershell
npm --prefix web run typecheck
npm --prefix web run verify:assets
npm --prefix web run test:unit
npm --prefix web run build
npm --prefix web exec -- playwright install chromium
npm --prefix web run test:auth
npm --prefix web run test:ui-auth
```

Results:118 unit/integration, four source AUTH cases,15 supplemental UI tests and199 HTML/RSC checks.
[Evidence and limits](../specs/001-municipal-eservice/auth/verification-20261118.md).
Screenshots/layouts cover375/768/1280px; Axe detected zero violations in four states and records
unresolved gradient/pseudo-background checks separately. This does not establish full WCAG compliance.

test:acceptance refuses missing/duplicate/unknown canonical IDs. It currently discovers five
canonical specs, including full RBAC03 whose allowed future-service assertions remain pending.
The full51 TC suite, standalone NFR-04 inspector and mutation campaign have not run.
test:nfr04 / accept:campaign still exit nonzero until T073 is implemented.

## Local configuration and constraints

.npmrc disables dependency install hooks for pinned packaged prebuilds; explicit npm run commands
still execute and native dependencies are verified. Private keys remain outside public files/reports.
Retain the same three distinct keys for the database; DB_PATH is absolute. setup:local enables
local classroom hooks; TEST_MODE empty/0 disables them. Existing .env.local is never overwritten.

All business time comes from domain/clock.ts. immediate callbacks must be synchronous with I/O
prepared first. Session privileges are snapshots; source role changes apply on the next login.
Preserve the ten assignment documents, canonical tokens and approved media hashes. The greeting
fade remains translateY(12px); local text contrast corrections leave token values intact.
