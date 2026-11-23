# B02 · Source-oracle Playwright acceptance (handoff)

ผู้เขียน: B02 (yolo2) · 22 พ.ย. 2569 · อ่านเฉพาะ TEST-PLAN.md, CONTRACT.md, TEST-DATA.md (+ test เดิมที่ carry มา) · **ไม่ได้อ่าน web/src หรือโค้ดแอป**

## 1. สถานะ

- ค้นพบได้ **51 TC ไม่ซ้ำ** (`playwright test --list`): carried 5 ข้อ (`auth.spec.ts` AUTH-01/02/04 · `register.spec.ts` AUTH-03 · `rbac.spec.ts` RBAC-03 — ไม่แตะ assertion เดิม) + ใหม่ 46 ข้อในไฟล์ของ B02
- ยังไม่ได้รัน (ต้องรอ integration · เว็บส่วน T021–T078 ยังไม่ครบ) → คาดว่าจะล้มจำนวนมากจนกว่าบล็อกอื่นทำเสร็จ · **ห้ามแก้ผลคาดหวังให้ตรงหน้าจอ** ถ้าเชื่อว่า oracle ผิด ให้ยกข้อความต้นฉบับมาแย้งกับ orchestrator
- ไม่มี skip / fixme / retries / placeholder

## 2. ไฟล์ → TC

| ไฟล์ (`web/tests/e2e/`) | TC |
|---|---|
| `source-helpers.ts` | fixture `cast` + helper กลาง (ไม่มี test) |
| `drafts.spec.ts` | FEE-01 · SUBMIT-02 · SUBMIT-03 |
| `uploads.spec.ts` | UPLOAD-01 · UPLOAD-02 |
| `payments.spec.ts` | PAY-01 · PAY-02 · PAY-03 · PAY-04 |
| `citizen.spec.ts` | SUBMIT-01 · RBAC-01 · PDPA-01 |
| `queue.spec.ts` | QUEUE-01 · QUEUE-02 · QUEUE-03 |
| `sla.spec.ts` | SLA-01 · SLA-02 · SLA-03 · NOTI-01 · NOTI-02 |
| `approvals.spec.ts` | WORKFLOW-01 · WORKFLOW-02 · WORKFLOW-03 · RBAC-02 |
| `review.spec.ts` | WORKFLOW-04 · WORKFLOW-05 · WORKFLOW-06 · PDPA-02 · PDPA-03 |
| `documents.spec.ts` | DOC-01 · DOC-02 · DOC-03 · RBAC-05 |
| `dashboard.spec.ts` | DASH-01 · DASH-02 · DASH-03 · DASH-04 |
| `audit.spec.ts` | AUDIT-01 · AUDIT-02 · AUDIT-03 |
| `admin.spec.ts` | RBAC-04 · RBAC-06 |
| `nfr.spec.ts` | NFR-01 · NFR-02 · NFR-03 |
| `nfr04-inspection.spec.ts` | NFR-04 (wrapper เรียก inspector) |

## 3. สิ่งที่เว็บต้องรองรับเพื่อให้ test ทำงาน (นอกจาก CONTRACT)

- ทุกอย่างอ้าง CONTRACT ตรงตัว: route, `data-testid`, `data-*`, ข้อความ error ตาราง 5, รูปแบบ `{code,message}` (test ใช้ `toMatchObject({code, message})` จึงมีฟิลด์เสริมได้ เช่น `attemptsLeft` `lockedUntil` `missing`)
- test ไม่ผูกกับ endpoint ภายในที่ UI เรียก: ขั้น UI ตรวจผลบนจอ แล้วตรวจรหัส HTTP ด้วยการเรียก API ใน CONTRACT §6 ตรง ๆ
- ล็อกอินผ่าน API (`/api/auth/thaid/*`, `/api/auth/staff/login`) แล้วใช้ cookie เดียวกันเปิดหน้า (browser context เดียวกับ `context.request`) → cookie session ต้องใช้ได้ทั้ง API และหน้า
- `user-name`/`logout-btn` อยู่ในเมนูบัญชี (ปุ่มชื่อขึ้นต้น `เปิดเมนูบัญชี`) ตามดีไซน์ที่ carried test ใช้อยู่ · test ใหม่ไม่พึ่งเมนูนี้
- `/api/test/*` เรียกจาก request context ที่ไม่มี cookie (ไม่นับเป็น request ที่กระตุ้นการประเมิน SLA · CONTRACT 0.7)
- ไฟล์อัปโหลดสร้างจาก `tests/fixtures/files.ts` ขนาดตรงไบต์ (5,242,879 / 5,242,880 / 5,242,881) ส่งแบบ multipart `file` + `docKey` · ไฟล์ 5,242,881 ต้องได้ 400 `FILE_TOO_LARGE` ไม่ใช่ 413
- PDF (เอกสาร/Dashboard): test ดึง "บรรทัด" จาก (1) ไบต์ดิบ (2) stream ที่ Flate-decode ได้ (3) operand สตริงของแต่ละ `BT…ET` (literal `( )` หรือ hex `< >`) แล้วต้องมีบรรทัดที่ขึ้นต้น `docNo=` / `kpi ` **เพียง 1 แบบ** และตรงตัว → วางเป็นบรรทัด ASCII บรรทัดเดียวได้ทั้งแบบ comment (`% docNo=…` test ตัด `%` นำหน้าออกให้) หรือข้อความ Helvetica บรรทัดเดียวใน BT/ET เดียว (ไม่บีบอัด หรือ Flate ก็ได้) · ห้ามมีบรรทัด `docNo=` สองแบบที่ต่างกัน
- xlsx อ่านด้วย `exceljs` (`cell.text`) ชีตแรก A1:B6
- `doc-qr` `data-url` = `${BASE_URL}/verify/<code>` (BASE_URL ของ Playwright ค่าเริ่มต้น `http://127.0.0.1:3000`)

## 4. อินเทอร์เฟซ inspector ของ TC-NFR-04 (บล็อกที่ทำ T073 ต้องทำตามนี้)

`nfr04-inspection.spec.ts` ทำ: RESET → มานะลงทะเบียน `0845678901` ผ่าน API → ตัวควบคุมบวก (สมชาย `GET /api/cases/EG-2569-000005` ได้ `idNo` = `1101700123456`) → เรียก

```
node --import tsx web/scripts/inspect-at-rest.ts --json -- <needle> <needle> ...   (cwd = web/, env DB_PATH = absolute path)
```

- needles 12 ค่า (ส่งเป็น argv หลัง `--`): `1101700123456` `3100600987659` `1909900555015` `5500400111221` `0812345678` `0823456789` `0834567890` `0845678901` `1-1017-00123-45-6` `3-1006-00987-65-9` `1-9099-00555-01-5` `5-5004-00111-22-1`
- DB_PATH ใน test = `resolve(web/, process.env.DB_PATH ?? 'var/acceptance.sqlite')` (ตรงกับ `playwright.config.ts`)
- inspector ต้องสแกนแบบ byte (เช่น `grep -a -c`) ทั้งไฟล์ DB, `-wal`, `-shm`, dump (`.dump`) และ log ของเว็บที่มี แล้ว**พิมพ์ JSON บรรทัดสุดท้ายของ stdout**:
  `{"dbPath":"<abs>","scanned":["<abs DB>", "...-wal", ...],"counts":{"<needle>":0,...},"method":"AES-256-GCM ..."}`
- exit code 0 เมื่อทุก count = 0 · ≠ 0 เมื่อพบค่าใดหรือเกิดข้อผิดพลาด
- wrapper ตรวจ: exit 0 · `dbPath` = DB_PATH · `scanned` มี DB_PATH · key ของ `counts` = 12 needles พอดี และทุกค่า 0 · `method` ไม่ว่าง · แนบ stdout/stderr เป็นหลักฐาน
- wrapper เองไม่ใช่หลักฐานการเข้ารหัส — หลักฐานคือผลสแกนของ inspector

## 5. วิธีเขียน test เพิ่ม/แก้ (ถ้าจำเป็น)

- `import { test, expect, ... } from './source-helpers.js'` · fixture รีเซ็ตอัตโนมัติก่อนทุก test · RESET กลาง TC = `await cast.reset()` แล้ว `cast.as(...)` ใหม่
- `cast.as(name)` ล็อกอินครั้งเดียวต่อบัญชีจนกว่าจะ reset · `cast.fresh(name)` ล็อกอินแยก cookie · `cast.anon()` ไม่ล็อกอิน · `cast.clock(iso)` · `cast.pay(ref, amount)` · `cast.tamper(docNo)`
- `newPaid(cast, {who, service, at, qty, areaSqm})` = สูตร NEW_PAID ของ TEST-PLAN

## 6. ข้อสังเกตจากต้นฉบับ (SOURCE QUESTIONS)

ประเด็นที่ต้นฉบับไม่ชัด และวิธีที่ test ใช้ (orchestrator ตัดสินได้ · ห้ามแก้ให้ตรงหน้าจอ):

1. **QUEUE-03 ขั้น 3/10:** TEST-PLAN ให้ `off.reg2` (งานในมือ 10) กด `claim-btn` แล้วเห็น `action-error` `รับงานได้สูงสุด 10 เรื่อง` ↔ CONTRACT 2.7 "claim-btn เฉพาะแถวที่ claim ได้" → test ทำตาม TEST-PLAN: **ปุ่มต้องยัง render เมื่อชนเพดาน** (เพดานตรวจตอนกด)
2. **QUEUE-02 ส่วน 1 `row-owner` = "ชื่อผู้ชนะ":** ตรวจ `data-owner` = username ผู้ชนะ · ข้อความ `row-owner` ยอมรับ username หรือชื่อแสดง
3. **claim ซ้ำของตัวเอง / ยกเลิกของคนอื่น / PDF ของคนอื่น / `/api/files` id ไม่มี / ref ชำระไม่มี:** ต้นฉบับระบุแค่ HTTP → ตรวจเฉพาะ status
4. **SUBMIT-03 ส่วน C `…000013`** "เช่นเดียวกัน → 409" → ตรวจ `CANNOT_CANCEL` · ส่วน F "ไม่มีผู้ถือ" → `owner` เป็น `null` หรือ `""`
5. **MISSING_DOCS message:** ใช้ `ยังขาดเอกสาร: แบบแปลน` (CONTRACT ตาราง 5 แถว `ยังขาดเอกสาร: <ชื่อ, ชื่อ>`) + `missing:["แบบแปลน"]`
6. **WORKFLOW-06 รอบ B resubmit → 409:** ยอมรับ `FIX_WINDOW_EXPIRED` หรือ `INVALID_STATE` (CONTRACT 6.2 ระบุทั้งสอง)
7. **WORKFLOW-01 ขั้น 5** ระบุบรรทัด PDF ไม่ครบ → ตรวจแบบ prefix · DOC-01 ตรวจบรรทัดเต็มตรงตัว
8. **DOC-01 "เอกสารถัดไปยัง DOC-2569-000003":** พิสูจน์โดย `off.reg1` ออกเอกสาร `…000019` ต่อ แล้วต้องได้ `DOC-2569-000003`
9. **PDPA-02:** regex `\d{13}` ใช้กับ JSON ทั้งก้อนตามตัวอักษร → ห้ามมี timestamp/ID ตัวเลข 13 หลักใน response ของ API เจ้าหน้าที่ที่ระบุ
10. **RBAC-06:** ค่าที่ยอมรับส่งช่องทางเดียว (จอ: fee 0, sla 1 · API: fee 100000, sla 60) เพื่อให้ Audit `ADMIN_CHANGE` = 5 ตามต้นฉบับ · detail สร้างตามรูปแบบ CONTRACT 6.8 (`SV-01 fee 20 → 0` `SV-01 fee 0 → 100000` `SV-01 sla 3 → 1` `SV-01 sla 1 → 60` `holiday add 2026-12-05`)
11. **NFR-03 `INVALID_TIME`** ไม่มีในตาราง 5 → ตรวจ 400 + `code` เท่านั้น · ข้อ "เว็บไม่ตั้ง TEST_MODE → 404" เป็นเงื่อนไข "ถ้ารันได้สองโหมด" และ server ของ acceptance ตั้ง TEST_MODE=1 เสมอ → ไม่ assert ใน Playwright (ไม่ได้ skip ทั้ง TC) · B01/B14 ควรตรวจแยกใน campaign
12. **DASH-03 PII scan ของ PDF:** สแกนเฉพาะข้อความใน text object (ไม่สแกน xref/ไบต์ดิบ ตามที่ TEST-PLAN บอก) · ถ้าวางบรรทัด `kpi …` เป็น comment จะไม่ถูกสแกน PII แต่ยังตรวจบรรทัด kpi
13. **NFR-02 คีย์บอร์ด:** สมมติว่าจาก `/login` กด Tab ถึง `thaid-id-input` ได้โดยไม่ต้องเลือกแท็บด้วยเมาส์ (แท็บประชาชนต้องเป็นค่าเริ่มต้นหรือเปลี่ยนด้วยคีย์บอร์ดระหว่างทาง) · ทุกจุดที่โฟกัสต้องมี outline/box-shadow
14. **SLA-03 ส่วน C:** `off.reg1` เปิดหน้าเคส `…000025` ที่ `off.reg2` ถือ (ต้องเปิดได้ในแผนกเดียวกัน ตาม CONTRACT §1 `/officer/cases/:caseNo` officer·head)
15. **NOTI-02 ส่วน C:** ตรวจเฉพาะรายการของ `…000014`/`…000019` (ต้นฉบับไม่ให้ชุดเต็มของคำขออื่น ณ เวลานั้น) · ข้อความ `noti-item` ตรวจแบบ "มีข้อความ"
