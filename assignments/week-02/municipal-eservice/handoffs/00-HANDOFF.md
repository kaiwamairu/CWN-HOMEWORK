# HANDOFF · egov-eservice (นำเข้า container แล้ว)

18 พ.ย. 2569 · จาก orchestrator (Claude Code บน host) ถึงทุก worker และ session ที่ทำงานใน container `multi-account-devtool`
อ่านไฟล์นี้ก่อนเริ่มทุกบล็อก

## 1. ที่อยู่ไฟล์

| อะไร | path ใน container | หมายเหตุ |
|---|---|---|
| ชุดโจทย์ 10 ไฟล์ (อ่านอย่างเดียว) | `/workspace/egov-brief/` | README PROMPTS USER-STORIES REQUIREMENTS CONTRACT TEST-DATA TEST-PLAN BUGS DECISIONS brief/BRIEF.md · hash ตรง `source-checkpoint.json` |
| แผน | `/workspace/plans/egov-eservice/` | `blocks.json` `PLAN.md` `plan.json` `dag.png` `gantt-plan.png` `traceability.json` `source-checkpoint.json` |
| เว็บที่ทำไปแล้ว = cwd ของทุก worker | `/workspace/plans/egov-eservice/app/` | สำเนาของ `week2_student` ที่ตัดข้อมูลส่วนตัวออกแล้ว · path ใน `outputs` ของ blocks.json อ้างจากโฟลเดอร์นี้ |
| ส่งต่อระหว่างบล็อก | `app/handoffs/Bxx-*.md` | แต่ละบล็อกเขียนไฟล์ของตัวเอง ห้ามแก้ไฟล์ของบล็อกอื่น |

บน host `/workspace` คือ `01_week02/03_MultiAccount_Container/MultiAccountDevtool/workspace/` (bind mount)
ต้นฉบับบน host `Project_Main/Teaching_CWN2026/week2_student` ไม่ถูกแตะ ทั้ง `.env.local` และ DB ของผู้ใช้

## 2. สถานะเว็บตอนนำเข้า

- **เสร็จแล้ว 20/78 งาน (T001–T020) ตาม `app/specs/001-municipal-eservice/tasks.md`:** foundation, ThaiD จำลอง (checksum/OTP/lock), staff SSO, session แบบ HttpOnly, page/API guard, register/consent/เข้ารหัสเบอร์, logout
- **ยังไม่ทำ T021–T078:** แบ่งให้ B02–B14 ใน `blocks.json` แล้ว · หน้าบริการส่วนใหญ่ยังเป็นหน้าอ่านอย่างเดียวจาก seed
- **Stack:** custom server Next 16.4.6, React 19.3.1, TypeScript strict, SQLite (better-sqlite3 13.2.0), **Node 24** (`engines >=24 <25`)
- **Test:** มีแล้ว 5 ข้อ (TC-AUTH-01–04 และ RBAC-03) ต้องเขียนเพิ่มอีก 46 ข้อให้ครบ 51 · `test:acceptance` ตั้งใจให้ล้มจนกว่า test จะครบ ห้ามแทนด้วย stub ที่ผ่านหลอก ๆ
- **ไม่ได้นำเข้า:** `node_modules`, `.next`, `dist`, `var/` (DB), `evidence/`, `.env.local`, `*.tsbuildinfo`, `.claude`, `.vscode`

## 3. Runtime ใน container ที่ต้องรู้

- **Node ไม่ตรง:** container มี **Node 22.23.3** แต่แอปต้องการ Node 24 · B01 ต้องทำ `compose.yaml` + `web/Dockerfile` ที่ใช้ image Node 24 (container มี docker-in-docker) หรือรันด้วย Node 24 ที่ pin ไว้ · ห้ามเปลี่ยน Node ของระบบ
- **ติดตั้งใหม่ใน Linux:** `npm ci` จาก `package-lock.json` · `web/.npmrc` มี `ignore-scripts=true` ต้องคงไว้ · ห้ามก๊อป node_modules จาก Windows
- **สร้างค่าลับเอง:** `.env.local` ให้สร้างด้วย `npm run setup:local` ในเครื่องที่รัน · ห้ามใส่ค่าลับลงไฟล์ที่ commit
- **ใช้ DB แยกเสมอ:** test ใช้ DB เฉพาะของแต่ละรอบ (TEST_MODE=1) · BUG_MODE ตาม BUGS.md
- **Playwright:** browsers อยู่ที่ `/ms-playwright` (chromium-1247)

## 4. บัญชี (อัปเดต 22 พ.ย. 2569 · ตรวจด้วย `doctor` และ `team.py quota` จริง)

- **บัญชีที่พร้อม:** cyolo1, cyolo2 (Codex) · yolo1, yolo2 (Claude)
- **ไม่ใช้ yolo1:** ใช้โควตาสัปดาห์ไป 94% · ผู้ใช้สั่งให้ย้ายงานของ yolo1 ไป yolo2
- **คำสั่งวางแผน:** `plan egov-eservice --max-agents 4 --accounts yolo2,cyolo1,cyolo2` ใช้โควตาจริง (cyolo1 100%, cyolo2 100%, yolo2 92%)
- **ผล:** แจกครบ 14 บล็อก ประมาณ 155 นาที
  - yolo2 ทำ B02 B06 B08 B09 B10 B14 และตรวจ B03 B11
  - cyolo1 ทำ B03 B04 B11 B13
  - cyolo2 ทำ B01 B05 B07 B12 และตรวจ B09
- **ตอน run:** จำกัด worker ให้เป็นบัญชีในแผนเท่านั้น (yolo2, cyolo1, cyolo2) ห้ามดึง yolo1 กลับเข้ามา
- **ห้าม:** อ่านหรือแสดง `.credentials.json`, `.claude.json`, `auth.json`, อีเมล, orgId · ห้ามสร้าง/ลบ/หยุด container หรือ volume · ห้ามแก้สกิลใน shared

## 5. กฎที่ทุกบล็อกต้องรักษา

1. **เอกสารต้นฉบับ 10 ไฟล์แก้ไม่ได้:** ถ้าขัดกัน DECISIONS.md ชนะไฟล์อื่น และข้อ 18 ชนะข้อก่อนหน้า · route, testid, error และ seed ต้องตรง CONTRACT
2. **B02 อ่านได้เฉพาะ TEST-PLAN, CONTRACT, TEST-DATA:** ห้ามอ่านโค้ดเว็บ · test ต้องขึ้นต้นด้วยรหัส TC และครบ 51 ข้อ · **ห้ามแก้ผลที่คาดหวังให้ตรงกับหน้าจอ**
3. **ไฟล์ร่วมเป็นของ B14 คนเดียว:** router, test-hooks, policy, serializers, CaseDetail, RoleLayout, `web/src/styles/civic.css` และ PDF facade · บล็อกอื่นส่งเป็น adapter/panel แยกไฟล์ แล้วเขียนวิธีต่อไว้ใน `handoffs/`
4. **ดีไซน์ C "เมืองแห่งบริการ" ที่ผู้ใช้อนุมัติ:**
   - โทนครีมกระจกกับเขียวป่า และ design tokens 64 ตัวใน `specs/001-municipal-eservice/design-tokens.*`
   - ใช้เฉพาะภาพ/วิดีโอที่อนุมัติแล้ว ห้าม generate ใหม่
   - ไม่มี mouse-follow shadow, tilt หรือ parallax · ไม่มี app-header
5. **สิ่งที่ผู้ใช้แก้เองต้องคงไว้:**
   - greeting `hero-text-fade` และ `hero-copy::before{transform:translateY(12px)}`
   - `#staff-login .field + .button{margin-top:20px}`
6. **งานตัวเลข (B03 ค่าธรรมเนียม, B09 SLA วันทำการ, B11 Dashboard):** ใช้ review node ผู้ทำกับผู้ตรวจคนละ CLI
7. **B14 รันคนเดียว (exclusive):** baseline 2 รอบบน server เดิม → BUG_MODE B01–B12 ทีละตัว → mutant ผสม 2 ตัว → baseline สะอาดรอบสุดท้าย · ทำ report, gantt-actual และ compare หลังรันจริงเท่านั้น

## 6. ลำดับต่อไป (ต้องรอผู้ใช้สั่ง)

1. ผู้ใช้ล็อกอินบัญชี Claude ใน container
2. `doctor` แล้ว `plan egov-eservice --max-agents 4` ใหม่จากโควตาจริง
3. ผู้ใช้สั่งขั้น 3 → `export` → `run --detach` → `report` → คัดลอก `app/`, `gantt-actual.png`, `compare.png`, `REPORT.md` กลับไป `week2/egov-eservice/`
