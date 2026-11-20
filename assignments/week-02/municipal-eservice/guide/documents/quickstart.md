# Quickstart and Acceptance Evidence

อัปเดต 2026-11-18: T001–T020 ทำแล้ว — foundation, เข้าสู่ระบบ และลงทะเบียน
[วิธีเปิดแอป](app-quickstart.md) · [หลักฐานล่าสุด](auth-review.md)
118 unit/integration, source AUTH4, UI15 และ199 HTML/RSC checks ผ่านในโฟลเดอร์หลัก
full51 TC, inspection และ mutation campaign ยังรอขั้นถัดไป

## Prerequisites and package-script contract

Node24 LTS, npm, Chromium installed by Playwright, local writable DB directory,
source documents unchanged. Commands run from `week2_student` in PowerShell.
T001 must define these scripts in web/package.json and pin dependency lockfile:

| Script | Required behavior |
| --- | --- |
| setup:local | create private local keys and absolute DB_PATH once; preserve an existing .env.local |
| typecheck | TypeScript strict checks for application, scripts and tests |
| verify:assets | canonical 64-token parity and approved media/SVG byte hashes |
| dev | custom server.ts with Next development handler |
| build | Next production build plus custom-server build |
| start | compiled custom HTTP entry delegating to Next production handler; not next start alone |
| db:seed | explicit local seed from TEST-DATA; no mutation-dependent dueAt calculation |
| test:auth | source AUTH01–04 only, via actual Chromium; uses a new owned server |
| test:ui-auth | separate supplemental UI/motion/accessibility suite, outside canonical inventory |
| test:acceptance | exact51 named TC IDs, workers1, no retry, machine-readable+HTML results |
| test:nfr04 | standalone Node DB/filesystem inspector, JSON evidence, exit nonzero on failure |
| test:unit | targeted boundary/transaction/policy checks |
| accept:campaign | owns server lifecycle, all baseline/mutation runs and failure-set comparisons |

## Setup and single local run

```powershell
npm --prefix web ci
npm --prefix web exec -- playwright install chromium
$env:TEST_MODE = '1'
$env:BUG_MODE = ''
$env:DB_PATH = Join-Path (Get-Location) 'web/var/eservice.sqlite'
$env:TZ = 'Asia/Bangkok'
$env:DATA_KEY_HEX = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$env:ID_LOOKUP_KEY_HEX = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$env:DOC_HMAC_KEY_HEX = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm --prefix web run build
npm --prefix web run db:seed
npm --prefix web run start
```

Keys must remain outside SQLite/public bundles/evidence and stay constant during one server
campaign. Reset reseeds encrypted fields/signatures with that same process configuration.
Bind local server at127.0.0.1:3000 unless explicitly changed in runner BASE_URL.
Use production build for page-load measurements, with source warm-up rules.

## Test fixture rules

- Every TC starts POST /api/test/reset -> expected clock2026-12-01T09:00:00+07:00.
  Discard old contexts/cookies and log in each required actor again, including mid-TC reset.
- Use the hook clock for exact instants; PUT clock alone causes no lifecycle.
  Follow with an ordinary HTTP request to evaluate SLA/auto-cancel.
- workers1, fullyParallel=false, retries0. Parallel browser/API calls only WITHIN race TCs:
  two-context claims and six simultaneous payments. Do not parallelize TC files on one DB.
- Audit-count tests reuse actor sessions within the TC, avoiding extra STAFF_LOGIN records.
  One source TC may contain multiple subcases/resets; it remains one canonical TC ID.
- NFR-04 is a single named runner wrapper launching the standalone inspector. It creates
  source canary values through reset/fresh registration, inspects live DB records/dump/files/
  sidecars/logs as specified, checks citizen-positive control, and records method/scope.
  Report **51 acceptance cases:50 browser/API +1 database/filesystem inspection**.
  This does not claim browser assertions prove encryption. Standalone inspector is the same
  command used by the wrapper, not an extra52nd acceptance ID.

## Campaign that must be implemented

Stop the manually started example server before running the campaign, so no unknown process
is reused. The campaign starts and owns its own custom server, readiness-checks /api/health,
passes TEST_MODE/BUG_MODE/DB_PATH explicitly and uses isolated evidence directories.
Inside a campaign, test config disables its own webServer launch only when the coordinator
has explicitly supplied its owned ready server. Ordinary runs use webServer with
reuseExistingServer=false. Do not enable blind reuse of a server whose mode is unknown.

```powershell
npm --prefix web run test:unit
npm --prefix web run accept:campaign
```

| Step | Server mode | Required evidence |
| --- | --- | --- |
| baseline-1 | TEST_MODE=1, BUG_MODE empty | 51/51 acceptance outcomes pass |
| baseline-2 | same server process, no restart | same51/51; each TC reset/login anew |
| B01 through B12 | restart per single mode | full unchanged suite; observed failures satisfy source matrix |
| combined-1 | restart B03,B07 | union of required/allowed source failure sets |
| combined-2 | restart B01,B05,B09 | exactly FEE-01, PAY-01, PDPA-02 fail |
| baseline-final | restart with empty BUG_MODE | back to51/51 |
| hooks-disabled | separate server, TEST_MODE unset | every test-hook path404, health/verify still available |

For mutation run O=observed failing IDs, R=required, A=allowed additions from
[contracts/inventory.json](contracts/inventory.json): require R subset O subset R union A.
No skipped TC or timeout/missing-element/infrastructure failure counts as mutation detection.
Each intentional failure records source line, expected/actual value and fault mode.
After intentional mutant failures, the campaign continues and returns success only if every
configuration matches the expected matrix and final baseline is clean.

## Important baseline checkpoints

- Reset:30 paid cases+2 drafts, initial clock, empty audit/alerts before first normal request.
- First normal request alerts: reg1=3,reg2=1,head=1,works=0. Queue registry17rows;
  works1row; head approvals2rows. Workload reg1=3,reg2=9,works=0.
- New IDs:DR-0003,PP-0002,EG/RC-2569-000031,DOC-2569-000002; new2570 year starts000001.
- Dashboard December ALL:3 received,0 closed,`–`,21backlog,1overdue;
  November26/7/85.7%; annual30/8/87.5%. Period never filters current backlog.
- Verify K7M2Q9XA seeded valid, named document DOC-2569-000001 with source inclusive expiry.
- All51 detailed step/result tables remain in TEST-PLAN; these checkpoints do not replace them.

## Evidence bundle and honest limits

Each run writes web/evidence/<mode>/ with environment metadata (Node/package versions,
OS/browser, source-manifest hash, TEST_MODE/BUG_MODE, DB location, no secret values),
JSON/HTML runner reports, assertion diffs, inspection JSON, screenshot/trace on failure,
expected-vs-observed mutation set and triage. Record nonfatal a11y moderate/minor findings.

NFR-05 deployment HTTPS/Q-08, NFR-06 actual99.5%availability/Q-07 and NFR-07 real capacity/Q-06
remain production open items. Passing local health/races/inspection proves only the assigned
local checks. No real ThaiD, payment service, CA signature or legal certification is delivered.

## Preview and validate selected C

Open [design-preview.html](design-preview.html) for C / เมืองแห่งบริการ. Switch citizen and staff.
Verify the building/counter story, certificate/shop/house service objects, labelled buttons and
folder → counter → certificate process. Move the pointer: artwork, lighting and shadows stay fixed.
Read [design-system.md](design-system.md), [design-assets.json](design-assets.json) and
[ui-layouts.md](ui-layouts.md) before T001/T017. Import canonical token CSS once and copy
the reusable artwork under the public illustration path. Keep JSON/CSS and all symbol references in sync.
Run the supplemental T071 semantic-image, pointer, responsive, fallback and reduced-motion checks
alongside source NFR checks. The canonical 51 TC IDs, 78 tasks and original source hashes are unchanged.
To rebuild the selected preview after editing its sources/tokens:

```powershell
python specs/001-municipal-eservice/design-examples/c-civic-story/build.py
python guide/build.py
```

These previews/dialogs are design evidence; application/API acceptance still requires implementation.

## เปิด Wireframe 15 หน้าใน VS Code

1. เปิดโฟลเดอร์ `week2_student` ใน VS Code
2. กด `Ctrl+Shift+P` → `Tasks: Run Task` → **Civic UI: Wireframes**
3. เปิด `http://127.0.0.1:4174/` ในเบราว์เซอร์ หรือ Simple Browser
4. เลือกหน้าจากแถบบน และบันทึกไฟล์ต้นทางเพื่อดูการเปลี่ยนแปลงอัตโนมัติ

แก้ layout ที่ `wireframes/template.html`; เนื้อหาแต่ละหน้าอยู่ใน `pages-public.js`, `pages-staff.js`, `pages-admin.js`; token หลักอยู่ใน `design-tokens.json`; fade อ่านจาก `design-examples/c-civic-story/template.html` ชุดนี้เปิด [index.html](../wireframes/index.html) โดยตรงได้ด้วย

Live Preview เดิมยังใช้พอร์ต 4173 และ task **Civic UI: Live Preview** ตามเดิม Wireframe เป็น prototype ในหน่วยความจำ ไม่ใช่แอปสำหรับรัน canonical acceptance tests
