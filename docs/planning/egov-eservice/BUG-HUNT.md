# BUG-HUNT · egov-eservice (ขั้น 5 · BUG_MODE)

23 พ.ย. 2569 · ที่มาของผล: [bug-hunt-runs/campaign.json](bug-hunt-runs/campaign.json) และ log [bug-hunt-runs/campaign2.txt](bug-hunt-runs/campaign2.txt)

## วิธีรัน
- **ชุด test:** Playwright ชุดเต็ม 51 TC ตาม TEST-PLAN ชุดเดียวกันทุกรอบ ไม่แก้ test ระหว่างรอบ · `workers: 1`, `retries: 0`
- **สภาพแวดล้อม:** container Node 24.22.3 · `TEST_MODE=1` · เปิดเว็บใหม่และเริ่ม DB ทดสอบใหม่ทุกรอบ · ไม่แตะ DB ของผู้ใช้
- **ลำดับ:** baseline 2 รอบบน server เดียว → B01–B12 ทีละตัว → mutant ผสม 2 ชุด → baseline สะอาดรอบสุดท้าย · ทั้งหมดผ่านเมื่อ 23 พ.ย. 2569 เวลา 02:31–03:59
- **lockfile:** sha256 `877f76cb…2af2b36`
- **สคริปต์:** `web/scripts/run-campaign.ts` และ `compare-results.ts` ใน [assignments/week-02/municipal-eservice](../../../assignments/week-02/municipal-eservice/web/scripts/) · ตรวจผลของแต่ละรอบว่า TC ที่ต้องล้มล้มครบ และไม่มี TC อื่นล้มนอกจากที่อนุญาต
- **โค้ดที่ test:** ตรงกับ `app/` ทุกไฟล์ ยกเว้นเอกสาร handoff (ตรวจด้วย `diff -rq`)

## ตารางบันทึกผล (รูปแบบ BUGS.md §4)

| บั๊ก | TC ที่คาดว่าล้ม (จากตาราง 2) | TC ที่ล้มจริง | TC ล้มเกินที่คาด | TC ที่ควรล้มแต่ผ่าน | ผล |
|---|---|---|---|---|---|
| (ปกติ) | – | – | – | – | 51/51 passed ×2 และรอบสุดท้าย 51/51 |
| B01 | TC-FEE-01 | TC-FEE-01 | – | – | ✅ 50/51 |
| B02 | TC-UPLOAD-01 | TC-UPLOAD-01 | – | – | ✅ 50/51 |
| B03 | TC-SLA-01 · TC-SLA-02 (อาจล้มด้วย TC-SLA-03 · TC-RBAC-04) | TC-SLA-01 · TC-SLA-02 · TC-SLA-03 · TC-RBAC-04 · TC-NOTI-02 | TC-NOTI-02 (ยอมรับได้ตาม DECISIONS §18) | – | ✅ 46/51 |
| B04 | TC-SLA-02 | TC-SLA-02 | – | – | ✅ 50/51 |
| B05 | TC-PAY-01 | TC-PAY-01 | – | – | ✅ 50/51 |
| B06 | TC-RBAC-01 | TC-RBAC-01 | – | – | ✅ 50/51 |
| B07 | TC-RBAC-02 | TC-RBAC-02 | – | – | ✅ 50/51 |
| B08 | TC-QUEUE-02 | TC-QUEUE-02 | – | – | ✅ 50/51 |
| B09 | TC-PDPA-02 | TC-PDPA-02 | – | – | ✅ 50/51 |
| B10 | TC-DASH-02 (อาจล้มด้วย TC-DASH-01 · TC-DASH-03) | TC-DASH-01 · TC-DASH-02 · TC-DASH-03 | – (อยู่ในรายการ "อาจล้มด้วย") | – | ✅ 48/51 |
| B11 | TC-PDPA-03 · TC-AUDIT-01 | TC-PDPA-03 · TC-AUDIT-01 | – | – | ✅ 49/51 |
| B12 | TC-WORKFLOW-04 | TC-WORKFLOW-04 | – | – | ✅ 50/51 |
| B03+B07 (ผสม) | union ของ B03 และ B07 | TC-SLA-01/02/03 · TC-RBAC-04 · TC-NOTI-02 · TC-RBAC-02 | – | – | ✅ 45/51 · เท่ากับ union |
| B01+B05+B09 (ผสม) | TC-FEE-01 · TC-PAY-01 · TC-PDPA-02 | ตรงตามคาด | – | – | ✅ 48/51 · เท่ากับ union |

**จับได้ 12 จาก 12 ตัว** · ไม่มีรอบไหนที่ TC ซึ่งควรล้มกลับผ่าน · ไม่มีรอบไหนล้มเพราะ timeout หรือปัญหาโครงสร้างพื้นฐาน · ทุกรอบตรวจค่าตามกฎ (ดูตัวอย่างข้อความ assert ด้านล่าง)

## Triage (รูปแบบ BUGS.md §6)

| บั๊ก | ผลรัน (ข้อความ assert จริง) | สรุป |
|---|---|---|
| B01 | TC-FEE-01 พื้นที่ 101 · `fee-total` expected `฿1,010` received `฿1,000` | ✅ จับได้ตรงจุด |
| B02 | TC-UPLOAD-01 · ไฟล์ 5,242,880 ไบต์ถูกปฏิเสธ (`file-item` expected 1 received 0) | ✅ จับได้ตรงจุดที่ขอบบน |
| B03 | TC-SLA-01 แถว c `dueAt` expected `2026-12-08T16:30+07:00` received `2026-12-07T16:30+07:00` · TC-SLA-02 · TC-RBAC-04 (`2026-12-08` → `2026-12-04`) · TC-SLA-03 · TC-NOTI-02 | ✅ จับได้ · ที่ล้มด้วยเป็นผลข้างเคียงที่ยอมรับได้ เพราะใช้ฟังก์ชันวันทำการตัวเดียวกัน · TC-NOTI-02 ส่วน B นับวันคงเหลือของ `…000016` ข้ามวันหยุด 7 ธ.ค. ซึ่ง DECISIONS §18 (ชนะ BUGS) อนุญาต |
| B04 | TC-SLA-02 · `dueAt` และ `slaLevel` ไม่หยุดนับระหว่างรอแก้ไข | ✅ |
| B05 | TC-PAY-01 · จ่าย `PP-0001` ที่อายุ 15:00 ได้ 200 `PAID` `EG-2569-000031` แทน 410 | ✅ |
| B06 | TC-RBAC-01 · เปิดคำขอของคนอื่น expected 404 received 200 | ✅ |
| B07 | TC-RBAC-02 · `POST /api/cases/EG-2569-000014/approve` expected 403 received 200 `APPROVED` | ✅ ยิง API ตรง ๆ ไม่ได้ดูแค่ว่าปุ่มหายไป |
| B08 | TC-QUEUE-02 · คนที่ 2 claim สำเร็จ ไม่เห็น `action-error` "มีเจ้าหน้าที่รับเรื่องนี้แล้ว" | ✅ ล้มแน่นอนแบบต่อกัน ไม่ต้องพึ่ง race |
| B09 | TC-PDPA-02 · JSON ของ `/api/officer/queue` มีเลขบัตร 13 หลัก | ✅ |
| B10 | TC-DASH-02 `kpi-ontime-pct` expected `85.7%` received `23.1%` · TC-DASH-01 `–` → `0.0%` · TC-DASH-03 | ✅ ล้มเกินจาก 1 TC เพราะใช้สูตรเดียวกัน ยอมรับได้ |
| B11 | TC-PDPA-03 `audit-count` expected 1 received 0 · TC-AUDIT-01 จำนวน action expected 16 received 15 | ✅ |
| B12 | TC-WORKFLOW-04 · `return-btn` ยังแสดงเมื่อตีกลับครบ 2 ครั้ง (expected 0 received 1) | ✅ |

## แก้อะไรระหว่างหาบั๊ก

| พบระหว่าง | ประเภท | แก้อะไร |
|---|---|---|
| campaign-1 · B02 · TC-WORKFLOW-01 ล้มนอกตาราง | **test ผิด** | ตัวแยกข้อความใน PDF ของ helper ใช้ regex `BT…ET` แล้วสะดุดเมื่อรหัส verify ที่สุ่มได้มีตัว "ET" · แก้ tokenizer ใน `source-helpers.ts` อย่างเดียว ไม่แตะ assertion ([B14-test-helper.diff](../../../assignments/week-02/municipal-eservice/handoffs/B14-test-helper.diff)) |
| campaign-1 · B08 · TC-AUTH-02 timeout | **เว็บผิด** | ปุ่มเมนูโปรไฟล์กดได้ก่อนหน้าโหลดเสร็จ (hydration race) · ปิดปุ่มไว้จนโหลดเสร็จ |
| ก่อน campaign · TC-NFR-02 | **เว็บผิด** | สี contrast ไม่ผ่าน axe ระดับ serious และชื่อปุ่มกระดิ่งไม่ตรงข้อความที่เห็น · แก้สีและ label |
| campaign-1 · B03 · TC-NOTI-02 | **แผน/โจทย์** | ไม่ได้แก้อะไร · ยอมรับเป็นผลข้างเคียงตาม DECISIONS §18 · หมายเหตุถึง TA: BUGS.md ตาราง 2 ควรเพิ่ม TC-NOTI-02 ในช่อง "อาจล้มด้วย" ของ B03 |

campaign-1 เก็บไว้เป็นหลักฐานวินิจฉัยเท่านั้น ผลในตารางข้างบนมาจาก campaign-2 ซึ่งรันใหม่ทั้งชุดหลังแก้ทุกข้อแล้ว

## หลักฐานเพิ่มเติม
- **ปิด test hook:** เมื่อ `TEST_MODE` ไม่เป็น 1 ทุก hook ตอบ 404 (`/api/test/reset`, `clock`, `payments/…/pay`, `documents/…/tamper`) · ส่ง `BUG_MODE=B01,B05` โดยไม่เปิด TEST_MODE ระบบไม่สนใจค่านั้น
- **NFR-04:** standalone inspector ไม่พบข้อมูลส่วนบุคคลแบบ plaintext ใน DB, ไฟล์ และ log
- **รายละเอียดทั้งหมด:** [B14-final-evidence.md](../../../assignments/week-02/municipal-eservice/handoffs/B14-final-evidence.md)
