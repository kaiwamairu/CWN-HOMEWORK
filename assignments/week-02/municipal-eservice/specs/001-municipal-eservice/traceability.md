# Traceability and Source Boundary Inventory

2026-11-16. This maps designed work, not executed runtime results. Every implementation task remains unchecked.
Sources retain their original IDs. Spec Kit USn labels below are aliases only. Exact steps/expected results remain in TEST-PLAN; DECISIONS wins conflicts, section18 supersedes earlier summaries.

## Story -> Requirement -> Tasks -> Acceptance

| Alias / original | Tasks | Primary canonical TC ownership |
| --- | --- | --- |
| US1 / US-C01a | T014, T015, T016, T017 | TC-AUTH-01, TC-AUTH-02, TC-AUTH-04, TC-RBAC-03 |
| US2 / US-C01b | T018, T019, T020 | TC-AUTH-03 |
| US3 / US-C02a | T021, T022, T023, T024 | TC-FEE-01, TC-SUBMIT-01 |
| US4 / US-C02b | T025, T026, T027, T028 | TC-UPLOAD-01, TC-UPLOAD-02, TC-SUBMIT-02 |
| US5 / US-C02c | T033, T034, T035, T036 | TC-SUBMIT-03, TC-WORKFLOW-06, TC-RBAC-01 |
| US6 / US-C03 | T029, T030, T031, T032 | TC-PAY-01, TC-PAY-02, TC-PAY-03, TC-PAY-04 |
| US7 / US-O01a | T037, T038, T039, T040 | TC-QUEUE-01, TC-QUEUE-02, TC-QUEUE-03 |
| US8 / US-O01b | T041, T042, T043, T044, T045 | TC-WORKFLOW-04, TC-WORKFLOW-05, TC-PDPA-01, TC-PDPA-02, TC-PDPA-03, TC-RBAC-05 |
| US9 / US-O02 | T046, T047, T048, T049, T050 | TC-SLA-01, TC-SLA-02, TC-SLA-03, TC-NOTI-01, TC-NOTI-02 |
| US10 / US-O03a | T051, T052, T053, T054 | TC-WORKFLOW-02, TC-WORKFLOW-03, TC-RBAC-02 |
| US11 / US-O03b | T055, T056, T057, T058, T059 | TC-WORKFLOW-01, TC-DOC-01, TC-DOC-02, TC-DOC-03 |
| US12 / US-A01 | T060, T061, T062, T063 | TC-DASH-01, TC-DASH-02, TC-DASH-03, TC-DASH-04 |
| US13 / US-A02 | T064, T065, T066 | TC-AUDIT-01, TC-AUDIT-02, TC-AUDIT-03 |
| US14 / US-AD01 | T067, T068, T069, T070 | TC-RBAC-04, TC-RBAC-06 |

TC-NFR-01/02/03 are cross-cutting browser/API cases; TC-NFR-04 is a standalone storage inspection called by one runner wrapper. Primary ownership counts each of51 IDs once; secondary story coverage remains in original TEST-PLAN §19.

## Every FR / BR / NFR mapped to designed tasks

| Requirement | Task IDs | Validation source |
| --- | --- | --- |
| FR-01 | T015, T016 | TEST-PLAN source tables and canonical cases below |
| FR-02 | T019 | TEST-PLAN source tables and canonical cases below |
| FR-03 | T015, T016 | TEST-PLAN source tables and canonical cases below |
| FR-04 | T022 | TEST-PLAN source tables and canonical cases below |
| FR-05 | T026 | TEST-PLAN source tables and canonical cases below |
| FR-06 | T026 | TEST-PLAN source tables and canonical cases below |
| FR-07 | T023 | TEST-PLAN source tables and canonical cases below |
| FR-08 | T030 | TEST-PLAN source tables and canonical cases below |
| FR-09 | T034 | TEST-PLAN source tables and canonical cases below |
| FR-10 | T034 | TEST-PLAN source tables and canonical cases below |
| FR-11 | T035 | TEST-PLAN source tables and canonical cases below |
| FR-12 | T038 | TEST-PLAN source tables and canonical cases below |
| FR-13 | T039 | TEST-PLAN source tables and canonical cases below |
| FR-14 | T042 | TEST-PLAN source tables and canonical cases below |
| FR-15 | T042, T052 | TEST-PLAN source tables and canonical cases below |
| FR-16 | T052 | TEST-PLAN source tables and canonical cases below |
| FR-17 | T056, T058 | TEST-PLAN source tables and canonical cases below |
| FR-18 | T056, T058 | TEST-PLAN source tables and canonical cases below |
| FR-19 | T047 | TEST-PLAN source tables and canonical cases below |
| FR-20 | T048 | TEST-PLAN source tables and canonical cases below |
| FR-21 | T044 | TEST-PLAN source tables and canonical cases below |
| FR-22 | T061, T063 | TEST-PLAN source tables and canonical cases below |
| FR-23 | T062, T063 | TEST-PLAN source tables and canonical cases below |
| FR-24 | T065 | TEST-PLAN source tables and canonical cases below |
| FR-25 | T068 | TEST-PLAN source tables and canonical cases below |
| FR-26 | T068 | TEST-PLAN source tables and canonical cases below |
| FR-27 | T069 | TEST-PLAN source tables and canonical cases below |
| FR-28 | T002, T009, T010, T012 | TEST-PLAN source tables and canonical cases below |
| FR-29 | T043 | TEST-PLAN source tables and canonical cases below |
| BR-01 | T015 | TEST-PLAN source tables and canonical cases below |
| BR-02 | T015 | TEST-PLAN source tables and canonical cases below |
| BR-03 | T019 | TEST-PLAN source tables and canonical cases below |
| BR-04 | T022 | TEST-PLAN source tables and canonical cases below |
| BR-05 | T022 | TEST-PLAN source tables and canonical cases below |
| BR-06 | T003, T026 | TEST-PLAN source tables and canonical cases below |
| BR-07 | T003, T026 | TEST-PLAN source tables and canonical cases below |
| BR-08 | T026 | TEST-PLAN source tables and canonical cases below |
| BR-09 | T023, T031 | TEST-PLAN source tables and canonical cases below |
| BR-10 | T030 | TEST-PLAN source tables and canonical cases below |
| BR-11 | T030, T068 | TEST-PLAN source tables and canonical cases below |
| BR-12 | T006, T031, T047, T068 | TEST-PLAN source tables and canonical cases below |
| BR-13 | T006, T035, T047 | TEST-PLAN source tables and canonical cases below |
| BR-14 | T011, T047 | TEST-PLAN source tables and canonical cases below |
| BR-15 | T011, T048, T050 | TEST-PLAN source tables and canonical cases below |
| BR-16 | T038 | TEST-PLAN source tables and canonical cases below |
| BR-17 | T039 | TEST-PLAN source tables and canonical cases below |
| BR-18 | T039 | TEST-PLAN source tables and canonical cases below |
| BR-19 | T042, T052 | TEST-PLAN source tables and canonical cases below |
| BR-20 | T011, T035, T050 | TEST-PLAN source tables and canonical cases below |
| BR-21 | T007, T016, T038, T042, T052, T057, T069 | TEST-PLAN source tables and canonical cases below |
| BR-22 | T007, T034 | TEST-PLAN source tables and canonical cases below |
| BR-23 | T056, T057, T058 | TEST-PLAN source tables and canonical cases below |
| BR-24 | T005, T007, T044, T062 | TEST-PLAN source tables and canonical cases below |
| BR-25 | T061 | TEST-PLAN source tables and canonical cases below |
| BR-26 | T061, T062 | TEST-PLAN source tables and canonical cases below |
| BR-27 | T008, T044, T054, T057, T065, T069 | TEST-PLAN source tables and canonical cases below |
| BR-28 | T068, T069 | TEST-PLAN source tables and canonical cases below |
| BR-29 | T007, T043 | TEST-PLAN source tables and canonical cases below |
| NFR-01 | T063, T071 | TEST-PLAN source tables and canonical cases below |
| NFR-02 | T071 | TEST-PLAN source tables and canonical cases below |
| NFR-03 | T017, T071 | TEST-PLAN source tables and canonical cases below |
| NFR-04 | T005, T072 | TEST-PLAN source tables and canonical cases below |
| NFR-05 | T010, T078 | TEST-PLAN source tables and canonical cases below |
| NFR-06 | T002, T071, T078 | TEST-PLAN source tables and canonical cases below |
| NFR-07 | T031, T078 | TEST-PLAN source tables and canonical cases below |
| NFR-08 | T071 | TEST-PLAN source tables and canonical cases below |
| NFR-09 | T002, T009, T012, T071 | TEST-PLAN source tables and canonical cases below |
| NFR-10 | T006, T010, T036, T049, T071 | TEST-PLAN source tables and canonical cases below |
| NFR-11 | T036, T049, T071 | TEST-PLAN source tables and canonical cases below |

Coverage means explicit design-task references, not completed tests. Business boundaries below retain full source rows including provenance.

## All29 Business Rules — source boundary rows

| ID | Rule | Boundary oracle | Original story | Provenance |
| --- | --- | --- | --- | --- |
| BR-01 | เลขบัตรต้องเป็นตัวเลข 13 หลักพอดี และหลักที่ 13 = (11 − (Σ dᵢ×(13−i), i=1..12) mod 11) mod 10 | 12 หลัก `110170012345` ✗ · 13 หลักถูก `1101700123456` ✓ ไปขั้น OTP · 14 หลัก `11017001234567` ✗ · 13 หลัก checksum ผิด `1101700123457` ✗ (ทุก ✗ แสดง "เลขบัตรประชาชนไม่ถูกต้อง") | US-C01a | [R] · [D] §2 A1 |
| BR-02 | OTP ทดสอบ `123456` · ผิดติดกัน 3 ครั้ง → ล็อกเลขบัตรนั้น 15 นาที นับจากครั้งที่ 3 · OTP ถูกรีเซ็ตตัวนับเป็น 0 · เมื่อปลดล็อกตัวนับเริ่มที่ 0 | ผิด 2 ครั้ง → ยังลองได้ (เหลือ 1 ครั้ง) · ผิดครั้งที่ 3 → ล็อก (HTTP 423) · +14:59 ยังล็อก แม้กรอก OTP ถูก · +15:00 ปลดล็อกและล็อกอินได้ · ผิดทันทีหลังปลดล็อก → นับเป็นครั้งที่ 1 (เหลือ 2 ครั้ง ไม่ล็อกซ้ำ) · ผิด 2 → ถูก → ผิด 2 อีก ไม่ล็อก | US-C01a | ⚠️A-05 A-06 · [R] |
| BR-03 | ลงทะเบียนครั้งแรก: ชื่อ-สกุลจาก ThaiD แก้ไม่ได้ · เบอร์มือถือ 10 หลักขึ้นต้น 0 บังคับ · อีเมลไม่บังคับ · ติ๊กยินยอม PDPA บังคับ | เบอร์ 9 หลัก ✗ · 10 หลัก ✓ · 11 หลัก ✗ · 10 หลักไม่ขึ้นต้น 0 ✗ · ไม่ติ๊กยินยอม → สมัครไม่ได้ · ติ๊ก → สมัครได้ | US-C01b | ⚠️A-07 |
| BR-04 | SV-01 ค่าธรรมเนียม ฿20 ต่อฉบับ จำนวน 1–5 ฉบับ | 0 ✗ "จำนวนฉบับต้อง 1–5 ฉบับ" · 1 → ฿20 · 5 → ฿100 · 6 ✗ ข้อความเดียวกัน | US-C02a | ⚠️A-09 |
| BR-05 | SV-03 ค่าธรรมเนียมตามพื้นที่ (จำนวนเต็ม ตร.ม.): 1–100 → ฿1,000 · 101–500 → ฿1,000 + ฿10 × (พื้นที่ − 100) · SV-02 ฿500 คงที่ | 0 ✗ "กรุณาระบุพื้นที่ 1–500 ตร.ม." · 1 → ฿1,000 · 100 → ฿1,000 · 101 → ฿1,010 · 500 → ฿5,000 · 501 ✗ "พื้นที่เกิน 500 ตร.ม. กรุณายื่นที่สำนักงาน" | US-C02a | ⚠️A-09 |
| BR-06 | ชนิดไฟล์ PDF/JPG/PNG ตรวจจากเนื้อไฟล์ (magic bytes) ไม่ใช่นามสกุลหรือ Content-Type | PDF/JPG/PNG จริง ✓ · ไฟล์ .txt เปลี่ยนชื่อเป็น .pdf ✗ · ไฟล์ .exe เปลี่ยนชื่อเป็น .png ✗ · .txt ส่ง Content-Type `application/pdf` ✗ | US-C02b | [D] §2 A3 · [R] · ⚠️A-49 |
| BR-07 | ขนาดต่อไฟล์ ≤ 5 MB = 5,242,880 ไบต์ · ไม่เกิน 5 ไฟล์ต่อคำขอ | 5,242,879 ✓ · 5,242,880 ✓ · 5,242,881 ✗ "ไฟล์ใหญ่เกิน 5 MB" · แนบครบ 5 ไฟล์ ✓ · ไฟล์ที่ 6 ✗ "แนบได้สูงสุด 5 ไฟล์ต่อคำขอ" | US-C02b | ⚠️A-10 |
| BR-08 | เอกสารบังคับต้องครบก่อนชำระ: SV-01 บัตรประชาชน · SV-02 บัตรประชาชน + แผนที่ตั้ง (ภาพสถานที่ไม่บังคับ) · SV-03 บัตรประชาชน + แบบแปลน (PDF เท่านั้น) + โฉนด | ขาด 1 ชิ้น → "ไปชำระเงิน" ใช้ไม่ได้ + "ยังขาดเอกสาร: <ชื่อ>" · ครบ ✓ · แบบแปลนเป็น JPG ✗ "แบบแปลนต้องเป็นไฟล์ PDF เท่านั้น" · เป็น PDF ✓ | US-C02b | [D] §2 A3 · ⚠️A-09 |
| BR-09 | เลขคำขอ `EG-<ปี พ.ศ.>-<ลำดับ 6 หลัก>` ออกเมื่อชำระสำเร็จ ลำดับเริ่มใหม่ทุกปี พ.ศ. ของเวลาชำระ · ร่างยังไม่มีเลข · 2 คนชำระพร้อมกันเลขต้องไม่ซ้ำ | ชำระ 31 ธ.ค. 2569 23:59 → `EG-2569-000031` (ถัดจากคำขอ seed 30 ใบ · TEST-DATA ตาราง 4.1/12) · ชำระ 1 ม.ค. 2570 00:00 → `EG-2570-000001` · ร่างไม่มีเลข · จ่ายพร้อมกัน 6 รายการได้ 6 เลขไม่ซ้ำ | US-C03 US-C02a | ⚠️A-14 · [R] |
| BR-10 | QR ใช้ได้ถ้า (เวลาชำระ − เวลาสร้าง) < 15:00 นาที | อายุ 14:59 ✓ ชำระได้ · 15:00 ✗ หมดอายุ (HTTP 410) ต้องกด "สร้าง QR ใหม่" · 15:01 ✗ | US-C03 | ⚠️A-15 |
| BR-11 | ยอดชำระต้องเท่าค่าธรรมเนียมพอดี · **ยอดถูกล็อกตอนคำขอเข้า PENDING_PAYMENT** (admin แก้ค่าธรรมเนียมภายหลังมีผลเฉพาะคำขอที่เข้า PENDING_PAYMENT หลังแก้ · QR ใหม่ของคำขอเดิมใช้ยอดที่ล็อกไว้) · callback ซ้ำ ref เดิมไม่สร้างรายการใหม่ ไม่เปลี่ยนเลขคำขอ (idempotent) · ใบเสร็จ `RC-<พ.ศ.>-<6 หลัก>` | ขาด ฿1 ✗ (HTTP 422) · ตรง ✓ · เกิน ฿1 ✗ · callback ซ้ำครั้งที่ 2 → เลขคำขอเดิม ไม่มีคำขอเพิ่ม · seed `PP-0001` (฿500) หลัง admin แก้ SV-02 เป็น ฿600: จ่าย ฿600 ✗ (422) จ่าย ฿500 ✓ | US-C03 | [R] · ⚠️A-16 A-42 |
| BR-12 | **D0** = วันที่ชำระ ถ้าเป็นวันทำการและก่อน 16:30:00 ไม่เช่นนั้นวันทำการถัดไป · **กำหนดเสร็จ** = วันทำการที่ N หลัง D0 เวลา 16:30 (N = SLA: SV-01 3 · SV-02 10 · SV-03 15) · คำนวณครั้งเดียวตอนชำระ ไม่คำนวณใหม่เมื่อเพิ่ม/ลบวันหยุดภายหลัง (A-42) | SV-01 ชำระ **อ.1 ธ.ค. 16:29** → ศ.4 ธ.ค. · **อ.1 ธ.ค. 16:30** → อ.8 ธ.ค. (D0 = พ.2, ข้าม จ.7) (ขอบวินาที 16:29:59 / 16:30:00 ผลเท่ากัน) · ศ.4 10:00 → ศ.11 ธ.ค. · ส.5 10:00 → จ.14 ธ.ค. · SV-02 (N=10) อ.1 ธ.ค. 09:00 → พฤ.17 ธ.ค. · SV-03 (N=15) อ.1 ธ.ค. 09:00 → พฤ.24 ธ.ค. · SV-01 พฤ.31 ธ.ค. 23:59 → พฤ.7 ม.ค. 70 (ตารางเต็ม TEST-PLAN SLA-01) | US-O02 | ⚠️A-01 A-02 A-03 A-09 A-42 |
| BR-13 | หยุดนับ SLA ระหว่าง NEED_FIX: กำหนดเสร็จใหม่ = กำหนดเดิม + จำนวนวันทำการใน (วันที่ตีกลับ, วันที่ส่งแก้ไข] (นับตามวันที่ ไม่ขึ้นกับเวลา · ไม่นับวันตีกลับ นับวันส่งแก้ · ใช้ตารางวันหยุด ณ เวลาที่ส่งแก้) | ชำระ อ.1 ธ.ค. 09:00 · ตีกลับ พ.2 11:00 · ส่งแก้ พฤ.3 10:00 → หยุด 1 วัน → อ.8 ธ.ค. 16:30 · ตีกลับและส่งแก้วันเดียวกัน → หยุด 0 วัน · ตีกลับ ศ.4 ส่งแก้ อ.8 ธ.ค. 17:00 (หลัง 16:30) → หยุด 1 วัน (อ.8; ส-อา และ จ.7 หยุด ไม่นับ) → ศ.4 + 1 = อ.8 ธ.ค. 16:30 (ส่งแก้หลังกำหนด จึงเป็น "เกินกำหนด" ทันที) | US-O02 | [D] §1 US-O02 · [R] · ⚠️A-42 |
| BR-14 | ระดับเตือน (เฉพาะคำขอที่ยังไม่ปิดและไม่อยู่ NEED_FIX): วันคงเหลือ = จำนวนวันทำการหลังวันนี้ถึงวันกำหนดเสร็จ (รวมวันกำหนด) · `ปกติ` ≥ 2 · `ใกล้ครบกำหนด` ≤ 1 และตอนนี้ ≤ กำหนดเสร็จ · `เกินกำหนด` ตอนนี้ > กำหนดเสร็จ | กำหนด ศ.4 ธ.ค. 16:30: อ.1 ปกติ (3) · พ.2 ปกติ (2) · พฤ.3 ใกล้ (1) · ศ.4 16:30:00 ใกล้ (0) · ศ.4 **16:30:01** เกินกำหนด · ศ.4 16:31 เกินกำหนด · กำหนด อ.8 ธ.ค.: พฤ.3 ปกติ (เหลือ 2: ศ.4, อ.8) · ศ.4 ใกล้ (เหลือ 1: อ.8) | US-O02 | ⚠️A-17 |
| BR-15 | แจ้งเตือนในกระดิ่ง ผู้รับ: คำขอมีผู้ถือ → ผู้ถือ · ไม่มีผู้ถือ (คิวแผนก) → เจ้าหน้าที่ทุกคนของแผนกนั้น · อยู่ขั้นหัวหน้า (PENDING_APPROVAL) → head · APPROVED (รอออกเอกสาร) → ผู้ออกเอกสาร · ระดับ "เกินกำหนด" แจ้ง head เพิ่มเสมอ (ไม่ซ้ำถ้า head เป็นผู้รับอยู่แล้ว) · **1 ครั้งต่อระดับต่อคำขอต่อคน** · ประเมินทุก request | ครั้งที่ 1 ที่ถึงระดับ → 1 รายการ · เปิดหน้า/เรียก API ซ้ำ 3 รอบ → ยัง 1 รายการ · "เกินกำหนด" เป็นรายการใหม่อีก 1 (ใกล้ 1 + เกิน 1) · PENDING_APPROVAL ใกล้ → head 1 · เกิน → head อีก 1 รายการ (ไม่ซ้ำ 2 ใบ) · APPROVED ใกล้ → ผู้ออกเอกสารเท่านั้น · เกิน → ผู้ออกเอกสาร + head | US-O02 | [D] §1 US-O02 · [R] · ⚠️A-30 A-31 |
| BR-16 | ลำดับคิว: กำหนดเสร็จเร็วสุดก่อน · เท่ากันเรียงเลขคำขอน้อยไปมาก | กำหนดต่างกัน → เร็วก่อน · กำหนดเท่ากัน (4 ธ.ค. 16:30: …-000013, -000015, -000027, -000028 …) → ตามเลขน้อยไปมาก | US-O01a | ⚠️A-18 |
| BR-17 | รับเรื่องได้ครั้งละ 1 คน | 2 browser กดพร้อมกัน → ผู้รับ 1 คน · คนที่ 2 HTTP 409 "มีเจ้าหน้าที่รับเรื่องนี้แล้ว" · กดซ้ำหลังมีผู้รับ → 409 | US-O01a | [R] |
| BR-18 | งานในมือสูงสุด 10 เรื่อง (นับ IN_REVIEW ที่ตัวเองถือ) · **ตรวจเฉพาะตอนกด "รับเรื่อง"** · คำขอที่ประชาชนส่งแก้กลับมาคืนผู้ถือเดิมโดยอัตโนมัติ แม้ทำให้งานในมือเกิน 10 (ไม่ถือว่าผิด) | มี 9 รับได้ (→ 10) · มี 10 รับเรื่องที่ 11 ✗ HTTP 409 "รับงานได้สูงสุด 10 เรื่อง" · อนุมัติ/ส่งต่อ/ตีกลับ 1 เรื่องแล้วรับได้อีก · ถือ 10 แล้วประชาชนส่งแก้คืน 1 เรื่อง → งานในมือ 11 (ไม่ error) แต่รับเรื่องใหม่ไม่ได้จนกว่าจะ < 10 | US-O01a | ⚠️A-19 |
| BR-19 | ตีกลับสูงสุด 2 ครั้งต่อคำขอ · เหตุผลตีกลับ/ไม่อนุมัติต้อง ≥ 10 ตัวอักษร (นับหลังตัดช่องว่างหัวท้าย) · เมื่อตีกลับครบ 2 ครั้ง: SV-01 เจ้าหน้าที่อนุมัติ/ไม่อนุมัติได้ตามปกติ · SV-02/SV-03 เจ้าหน้าที่ทำได้แค่ "ส่งต่อ" (พร้อมหมายเหตุ) ผู้ตัดสินไม่อนุมัติคือ head | ตีกลับครั้งที่ 1 ✓ · ครั้งที่ 2 ✓ · ครั้งที่ 3 ✗ ปุ่มหายและ API 409 · หลังครบ 2: SV-01 มีปุ่มอนุมัติ/ไม่อนุมัติ · SV-02 มีปุ่มส่งต่อ ไม่มีปุ่มไม่อนุมัติ · เหตุผล 9 ตัว ✗ · 10 ตัว ✓ · เว้นวรรคล้วน 10 ตัว ✗ | US-O01b US-O03a | ⚠️A-12 A-20 A-44 |
| BR-20 | เวลาแก้ไขของประชาชน 7 วันปฏิทิน (168 ชม.) นับจากเวลาตีกลับ · เลยแล้วระบบยกเลิกอัตโนมัติ | ตีกลับ 27 พ.ย. 14:00 → 167:59 (4 ธ.ค. 13:59) ส่งแก้ได้ · 168:00 (4 ธ.ค. 14:00) สถานะ "ยกเลิก" ส่งแก้ไม่ได้ (HTTP 409) | US-C02c | ⚠️A-21 A-46 |
| BR-21 | อำนาจและเส้นทาง: SV-01 ทะเบียน(ตรวจ+อนุมัติโดยเจ้าหน้าที่) → ออกเอกสาร · SV-02 ทะเบียน → หัวหน้าอนุมัติ → ออกเอกสาร · SV-03 ทะเบียน → โยธา → หัวหน้าอนุมัติ → ออกเอกสาร · ส่งต่ออัตโนมัติ · บทบาทเข้าได้เฉพาะหน้าตามสิทธิ์ | เจ้าหน้าที่อนุมัติ SV-02 ผ่าน API → 403 · หัวหน้าอนุมัติ SV-01 ที่ IN_REVIEW → 403 · เจ้าหน้าที่แผนกอื่นรับ/ตีกลับ → 403 · ผู้บริหาร/ผู้ตรวจ/ผู้ดูแลทำรายการคำขอ → 403 · ยังไม่ล็อกอิน → 401 (หน้า redirect `/login`) | US-O03a US-O01a US-C01a | [D] §2 A1 A2 · ⚠️A-27 A-28 A-39 |
| BR-22 | ประชาชนเห็นเฉพาะคำขอของตัวเอง · ยกเลิกได้เฉพาะ SUBMITTED ที่ยังไม่มีผู้รับเรื่อง · ก่อนกดยกเลิกมี confirm และหน้าคำขอที่ REJECTED/CANCELLED แสดงข้อความ `ค่าธรรมเนียมที่ชำระแล้วไม่คืน` · ลบร่างได้ (DRAFT/PENDING_PAYMENT) · ยกเลิกชนกับรับเรื่องพร้อมกันสำเร็จฝั่งเดียว | เปิดของคนอื่น (หน้า/API/เอกสาร/ร่าง) → 404 "ไม่พบคำขอ" เหมือนเลขที่ไม่มีจริง · SUBMITTED ไม่มีผู้รับ ยกเลิกได้ · มีผู้รับแล้ว (IN_REVIEW) ยกเลิกไม่ได้ ปุ่มหาย API 409 · ลบร่าง DRAFT ✓ · ร่างของคนอื่น 404 · ยกเลิก + รับเรื่องพร้อมกัน → ฝั่งหนึ่ง 200 อีกฝั่ง 409 และสถานะสุดท้ายสอดคล้องกัน | US-C02c | [D] §2 A1 · ⚠️A-11 A-13 A-62 |
| BR-23 | เอกสารดิจิทัล: อายุ SV-01 90 วัน · SV-02/03 1 ปี (วันสุดท้ายที่ใช้ได้ = SV-01: ออก + 89 วัน · SV-02/03: วันครบรอบปีถัดไป − 1 วัน ถ้าไม่มีวันนั้น (ออก 29 ก.พ.) ใช้ 28 ก.พ. เป็นวันครบรอบ) · `/verify/<รหัส>` ไม่ต้องล็อกอิน: ถูกต้อง → "เอกสารถูกต้อง" · หมดอายุ → "เอกสารหมดอายุ" · ลายเซ็นไม่ตรง → "ลายเซ็นไม่ถูกต้อง" · ไม่มีรหัส → "ไม่พบเอกสาร" (HTTP 404) · ชื่อผู้ยื่นปิดบัง = ชื่อเต็ม + อักษรแรกของนามสกุล + `***` (ไม่มีนามสกุล → ชื่อ + ` ***`) | SV-01 ออก 1 ธ.ค. 69: 28 ก.พ. 70 23:59 ✓ · 1 มี.ค. 70 00:00 หมดอายุ · SV-02/03 ออก 1 ธ.ค. 69: 30 พ.ย. 70 23:59 ✓ · 1 ธ.ค. 70 00:00 หมดอายุ · SV-02 ออก 29 ก.พ. 2571 (ค.ศ. 2028) → ใช้ได้ถึง 27 ก.พ. 2572 (ค.ศ. 2029) · SV-01 ออก 29 ก.พ. 2571 → 28 พ.ค. 2571 · tamper → ลายเซ็นไม่ถูกต้อง · รหัสไม่มี → ไม่พบเอกสาร · `สมชาย ใจดี` → `สมชาย ใ***` | US-O03b | ⚠️A-22 A-23 A-43 A-54 A-58 A-61 · [R] PDPA |
| BR-24 | เลขบัตรบนจอเจ้าหน้าที่ทุกบทบาท `X-XXXX-XXXXX-45-6` (เห็น 3 หลักท้าย) · ประชาชนเห็นของตัวเองเต็ม · API รายการ/คิว/รายละเอียดของเจ้าหน้าที่ห้ามมีเลขเต็มใน response JSON · "แสดงเลขเต็ม" (officer/head) ต้องกรอกเหตุผล + Audit `UNMASK` · **ผู้บริหารไม่เห็นข้อมูลส่วนบุคคล**: หน้า dashboard และไฟล์ส่งออกต้องไม่มีชื่อผู้ยื่น เลขบัตร (ตัวเลข 13 หลักติดกัน) หรือเบอร์โทร (0 ตามด้วย 9 หลัก) | เหตุผลว่าง ✗ (ไม่แสดง ไม่บันทึก) · มีเหตุผล ✓ เห็นเต็มในหน้านั้น + Audit 1 แถว · ผู้บริหาร/ผู้ตรวจ/ประชาชนเรียก unmask → 403 · regex `\d{13}` ใน response JSON ของ API เจ้าหน้าที่ที่ระบุใน CONTRACT → ไม่พบ · ข้อความหน้า `/dashboard` และเนื้อไฟล์ส่งออก: ไม่พบ `\d{13}` `0\d{9}` และชื่อ `สมชาย` `สมหญิง` `ปิติ` `มานะ` | US-O01b US-A01 | [D] §2 B1 · ⚠️A-24 A-32 A-55 |
| BR-25 | ตัวชี้วัด: รับเรื่อง = ชำระสำเร็จ (มีเลขคำขอ) ในเดือน (รวม CANCELLED ที่เคยชำระ) · ปิดงาน = COMPLETED + REJECTED ที่ closed_at ในเดือน (CANCELLED ไม่ใช่ปิดงาน) · **ทันกำหนด = closed_at ≤ กำหนดเสร็จ (รวมวินาทีที่ 16:30:00) นับทั้ง COMPLETED และ REJECTED** · ทันกำหนด % = ทัน ÷ ปิดงาน × 100 ทศนิยม 1 ตำแหน่ง ปัดครึ่งขึ้น (ปิดงาน 0 → `–`) · งานคงค้าง ณ ตอนนี้ = SUBMITTED+IN_REVIEW+NEED_FIX+PENDING_APPROVAL+APPROVED · เกินกำหนดคงค้าง = คงค้างที่ไม่ใช่ NEED_FIX และตอนนี้ > กำหนดเสร็จ | **ค่าขอบ "ทัน": ปิด 16:29:59 (ก่อน) → ทัน · 16:30:00 (ที่ขอบ) → ทัน · 16:30:01 (เกิน; หรือ 16:31) → ไม่ทัน** (กำหนด 3 ธ.ค. 16:30 · TC-DASH-04) · ปิดงาน 0 (ธ.ค.) → `–` · พ.ย. 6/7 → 85.7% · SV-02 พ.ย. 2/3 → 66.7% · ต.ค. 1/1 → 100.0% · คงค้าง 21 · เกินกำหนด 1 (ที่มา: TEST-DATA ตาราง 7) | US-A01 | [D] §1 US-A01 · [R] · ⚠️A-17 A-41 · DECISIONS ข้อ 18 |
| BR-26 | รายงานรายปี = รวมตัวเลขทุกเดือนแล้วคิด % จากยอดรวม (ไม่เฉลี่ย % รายเดือน) · ส่งออก Excel/PDF เท่าจอทุกช่อง · การส่งออกบันทึก Audit `EXPORT` · ไฟล์ส่งออกไม่มีข้อมูลส่วนบุคคล (BR-24) | ปี 2569: 7/8 = 87.5% (ถ้าเฉลี่ยผิด = 92.9%) · ไฟล์ส่งออก พ.ย. ตรงจอ 5 ช่อง · ส่งออก 1 ครั้ง → Audit 1 แถว · เนื้อไฟล์ไม่พบเลข 13 หลัก/เบอร์/ชื่อผู้ยื่น | US-A01 | [D] §2 A4 · [R] · ⚠️A-50 |
| BR-27 | Audit: บันทึก 10 เหตุการณ์ `STAFF_LOGIN` `CLAIM` `RETURN` `FORWARD` `APPROVE` `REJECT` `ISSUE` `UNMASK` `EXPORT` `ADMIN_CHANGE` (ฟิลด์: เวลา username บทบาท เหตุการณ์ เลขคำขอ สถานะก่อน→หลัง รายละเอียด) · กรองผู้ทำ/เหตุการณ์/ช่วงวันที่ (รวมวันเริ่มและวันจบ ตามเวลาไทย) · ส่งออก CSV · เพิ่มได้อย่างเดียว | `PUT`/`PATCH`/`DELETE` ทุกเส้นรวม admin → 405 · รายการ 30 พ.ย. 23:59:59 ไม่อยู่ในวันที่ 1 ธ.ค. · รายการ 1 ธ.ค. 00:00:00 และ 23:59:59 อยู่ในวันที่ 1 ธ.ค. · 2 ธ.ค. 00:00:00 ไม่อยู่ | US-A02 | [D] §1 US-A02 · [R] · ⚠️A-36 A-51 |
| BR-28 | ช่วงค่าที่ผู้ดูแลแก้ได้: ค่าธรรมเนียมจำนวนเต็ม 0–100,000 บาท · SLA จำนวนเต็ม 1–60 วันทำการ · วันหยุดซ้ำวันเดิม ✗ · ผู้ดูแลเปลี่ยนบทบาทตัวเอง ✗ | ค่าธรรมเนียม −1 ✗ (400 `INVALID_FEE`) · 0 ✓ · 100,000 ✓ · 100,001 ✗ · SLA 0 ✗ (400 `INVALID_SLA`) · 1 ✓ · 60 ✓ · 61 ✗ · เพิ่มวันหยุด 2026-12-07 ซ้ำ → 409 `DUPLICATE_HOLIDAY` · เปลี่ยนบทบาท `admin1` เอง → 409 `SELF_ROLE_CHANGE` | US-AD01 | ⚠️A-53 A-57 · Q-33 |
| BR-29 | สิทธิ์เปิด/ดาวน์โหลดไฟล์แนบ: officer = คำขอในแผนกตนเอง (ขั้นปัจจุบันหรือเคยผ่านขั้นนั้นแล้ว) · head = ทุกแผนก · citizen = ของตัวเอง (ของคนอื่น 404) · executive / auditor / admin = 403 · ยังไม่ล็อกอิน 401 | `…000025` (SV-01 ทะเบียน): `off.reg1` 200 · `off.works1` 403 (ไม่เคยผ่านโยธา) · `…000010` (SV-03 ที่ขั้นโยธา): `off.works1` 200 และ `off.reg1` 200 (เคยผ่านทะเบียน) · `…000012` (SV-03 ยังอยู่ขั้นทะเบียน): `off.works1` 403 · `head1` 200 ทุกใบ · `exec1` `audit1` `admin1` 403 · สมหญิงเปิดไฟล์ของ `…000005` (สมชาย) → 404 | US-O01b | [D] §1 US-O01 · ⚠️A-59 · DECISIONS ข้อ 18 · Q-32 |

## All11 NFR — source measurement rows

| ID | Attribute | Criterion | Method | Provenance |
| --- | --- | --- | --- | --- |
| NFR-01 | Responsive | กว้าง 375 · 768 · 1280 px ไม่มี scroll แนวนอนทั้งหน้า (`document.documentElement.scrollWidth ≤ window.innerWidth`) และทำงานหลักจบได้ (ล็อกอิน + กรอกคำขอ SV-01 ถึงหน้าชำระเงิน) | Playwright `setViewportSize` + `evaluate` (TC-NFR-01) | [D] §2 B3 |
| NFR-02 | WCAG 2.1 AA | หน้าหลัก 13 หน้า (`/login` `/register` `/citizen` `/citizen/new/SV-01` `/citizen/cases/<เลข>` `/officer/queue` `/officer/cases/<เลข>` `/head/approvals` `/dashboard` `/audit` `/admin/services` `/notifications` `/verify/<รหัส>`): axe-core 0 violation ระดับ serious/critical (tags `wcag2a wcag2aa wcag21a wcag21aa`) · ระดับ moderate/minor บันทึกเป็น known issue ในรายงาน (ไม่ทำให้ TC ล้ม) | `@axe-core/playwright` (TC-NFR-02) | [D] §2 B3 · ⚠️A-25 |
| NFR-03 | ใช้คีย์บอร์ดอย่างเดียว + มี label | ล็อกอินประชาชน + กรอกคำขอ SV-01 ถึงปุ่ม "ไปชำระเงิน" โดยใช้ Tab/Enter/Space เท่านั้น · ทุก `input/select/textarea` มี label ที่ `getByLabel` หาเจอ | Playwright keyboard (TC-NFR-02) | [D] §2 B3 · [R] WCAG 2.1.1 3.3.2 |
| NFR-04 | PDPA เก็บข้อมูล (At rest) | เลขบัตรและเบอร์โทรเข้ารหัส (เช่น AES-256-GCM) · ในไฟล์/ตารางฐานข้อมูลไม่พบเลขบัตร 13 หลักหรือเบอร์ 10 หลักตรง ๆ · ขอบเขตที่ทดสอบคือ 2 ฟิลด์นี้ · ชื่อ อีเมล และไฟล์แนบ (บัตร/โฉนด) เป็นคำถาม Q-08 | inspection นอก Playwright (อ่านฐานข้อมูลที่ `DB_PATH` ด้วย fs/sqlite) (TC-NFR-04) | [D] §2 B1 ("ข้อมูลส่วนบุคคล") · ⚠️A-55 · Q-08 |
| NFR-05 | PDPA ระหว่างส่ง (In transit) | ตอน deploy ใช้ HTTPS (TLS) · เครื่อง local อยู่นอกขอบเขตการทดสอบ ไม่มี TC (บันทึกเป็น open item Q-08) | ตรวจ config ตอน deploy + `curl -I https://…` | [D] §2 B1 · Q-08 |
| NFR-06 | Availability ≥ 99.5% | วัดในห้องเรียนไม่ได้: ต้องมี `GET /api/health` ตอบ 200 `{"status":"ok"}` ไม่ต้องล็อกอิน (TC-NFR-03 ตรวจเฉพาะ health ไม่ได้พิสูจน์ 99.5%) · วิธีวัดจริง/เครื่องมือ monitor เป็นคำถาม Q-07 | Playwright `request.get` + Q-07 | [D] §2 B2 |
| NFR-07 | ผู้ใช้พร้อมกัน | จำนวนจริงเป็นคำถาม (Q-06) · ที่ทดสอบได้: รับเรื่องพร้อมกัน 2 browser context (BR-17) และเลขคำขอไม่ซ้ำเมื่อชำระพร้อมกัน 6 รายการ (BR-09) | TC-QUEUE-02, TC-PAY-03 | [D] §2 B2 |
| NFR-08 | เวลาโหลด | หน้า `/login` `/citizen` `/officer/queue` `/dashboard` `/audit` โหลดถึงเหตุการณ์ `load` ≤ 3 วินาที บนเครื่อง local | Playwright `performance.timing` หรือเวลาห่อ `goto` (TC-NFR-03) | ⚠️A-26 |
| NFR-09 | ทดสอบได้และผลซ้ำได้ | `TEST_MODE=1` เปิด test hook (ไม่ตั้ง → `/api/test/*` ตอบ 404) · reset 2 ครั้งผลเหมือนกัน · ทุกปุ่ม/ช่อง/ข้อความสำคัญมี `data-testid` ตาม CONTRACT | TC-NFR-03 | [R] ตามบท 04 |
| NFR-10 | เขตเวลาและรูปแบบแสดงผล | ทุกการคำนวณใช้ Asia/Bangkok · วันที่บนจอ `4 ธ.ค. 2569 16:30` · เงิน `฿1,010` · ค่าเวลาใน API เป็น ISO `+07:00` | assert ข้อความและ `data-iso` ในทุก TC ที่เกี่ยวข้อง | [R] · ⚠️A-04 A-51 |
| NFR-11 | สถานะไม่ใช้สีอย่างเดียว | `case-status` และ `sla-level` ต้องมีข้อความไม่ว่างเสมอ (นอกเหนือจากสี) | Playwright `textContent` ไม่ว่าง (TC-NFR-02) | [R] WCAG 1.4.1 |

## All51 Canonical TC IDs

The source coverage cell below is copied verbatim (source shorthand such as FR-04 05 06 is retained). Follow source steps, resets and clock points; do not infer reduced scope from the task title.

| TC | Title | Source definition line | Original coverage / priority / method / provenance / mutation |
| --- | --- | --- | --- |
| TC-AUTH-01 | เลขบัตร 13 หลัก + checksum | TEST-PLAN.md:82 | US-C01a · FR-01 · BR-01  /  P1  /  ค่าขอบ + checksum  /  [R] ⚠️A-45  /  – |
| TC-AUTH-02 | OTP ผิด 3 ครั้งล็อก 15 นาที | TEST-PLAN.md:101 | US-C01a · FR-01 · BR-02  /  P1  /  ค่าขอบเวลา + state  /  ⚠️A-05 A-06 · [R]  /  – |
| TC-AUTH-03 | ลงทะเบียนครั้งแรก | TEST-PLAN.md:121 | US-C01b · FR-02 · BR-03  /  P1  /  ค่าขอบ + ตารางตัดสินใจ  /  ⚠️A-07  /  – |
| TC-AUTH-04 | เจ้าหน้าที่ SSO จำลองและหน้าตั้งต้น | TEST-PLAN.md:140 | US-C01a · FR-03 · BR-21  /  P2  /  ตารางตัดสินใจ  /  ⚠️A-08  /  – |
| TC-FEE-01 | ค่าธรรมเนียม SV-01 / SV-02 / SV-03 | TEST-PLAN.md:164 | US-C02a · FR-04 · BR-04 BR-05  /  P1  /  ค่าขอบ  /  [D] §1 US-C02 · ⚠️A-09  /  **B01** |
| TC-SUBMIT-01 | ยื่นคำขอ SV-01 ครบวงจร | TEST-PLAN.md:194 | US-C02a C02b C03 · FR-04 05 06 08 09 · BR-04 BR-09 BR-12  /  P1  /  สถานะ end-to-end  /  [D] §1 US-C02 C03 · ⚠️A-14 A-16  /  – |
| TC-SUBMIT-02 | เอกสารบังคับครบก่อนชำระ | TEST-PLAN.md:211 | US-C02b · FR-05 FR-06 · BR-08  /  P1  /  ตารางตัดสินใจ  /  [D] §2 A3 · ⚠️A-09  /  – |
| TC-SUBMIT-03 | ร่าง และการยกเลิก | TEST-PLAN.md:231 | US-C02a C02c · FR-07 FR-10 · BR-09 BR-22  /  P2  /  สถานะ  /  ⚠️A-11 A-14 A-47  /  – |
| TC-UPLOAD-01 | ขนาดและจำนวนไฟล์ | TEST-PLAN.md:251 | US-C02b · FR-05 · BR-07  /  P1  /  ค่าขอบ  /  [D] §2 A3 · ⚠️A-10  /  **B02** |
| TC-UPLOAD-02 | ชนิดไฟล์จากเนื้อไฟล์ | TEST-PLAN.md:273 | US-C02b · FR-05 · BR-06  /  P1  /  ค่าขอบ/classification  /  [D] §2 A3 · [R] · ⚠️A-49  /  – |
| TC-PAY-01 | อายุ QR 15:00 | TEST-PLAN.md:295 | US-C03 · FR-08 · BR-10  /  P1  /  ค่าขอบเวลา  /  ⚠️A-15  /  **B05** |
| TC-PAY-02 | ยอดเงินและ callback ซ้ำ | TEST-PLAN.md:312 | US-C03 · FR-08 · BR-11 BR-09  /  P1  /  ค่าขอบ + idempotent  /  [R] ⚠️A-16  /  – |
| TC-PAY-03 | ชำระพร้อมกัน เลขไม่ซ้ำ | TEST-PLAN.md:328 | US-C03 · FR-08 · BR-09  /  P1  /  race  /  [R] ⚠️A-14  /  – |
| TC-PAY-04 | เลขคำขอข้ามปี | TEST-PLAN.md:337 | US-C03 · FR-08 · BR-09  /  P2  /  ค่าขอบเวลา  /  ⚠️A-14  /  – |
| TC-QUEUE-01 | ลำดับคิวและขอบเขตแผนก | TEST-PLAN.md:357 | US-O01a · FR-12 · BR-16 BR-21  /  P1  /  ตารางตัดสินใจ  /  ⚠️A-18 A-34  /  – |
| TC-QUEUE-02 | รับเรื่องซ้อน (พร้อมกันและต่อกัน) | TEST-PLAN.md:373 | US-O01a · FR-13 · BR-17  /  P1  /  race (2 browser context) + สถานะ  /  [R] · DECISIONS ข้อ 18  /  **B08** |
| TC-QUEUE-03 | งานในมือสูงสุด 10 | TEST-PLAN.md:386 | US-O01a · FR-13 · BR-18  /  P1  /  ค่าขอบ  /  ⚠️A-19  /  – |
| TC-SLA-01 | กำหนดเสร็จตามตารางวันที่ | TEST-PLAN.md:411 | US-O02 · FR-19 · BR-12  /  P1  /  ตารางตัดสินใจ/ค่าขอบ  /  [D] §1 US-O02 · ⚠️A-01 A-02 A-03  /  **B03** |
| TC-SLA-02 | หยุดนับ SLA ระหว่างรอแก้ไข | TEST-PLAN.md:433 | US-O02 · FR-11 FR-19 · BR-13  /  P1  /  สถานะ + ค่าขอบ  /  [D] §1 US-O02 · ⚠️A-29  /  **B04** |
| TC-SLA-03 | ระดับเตือน ปกติ / ใกล้ครบกำหนด / เกินกำหนด | TEST-PLAN.md:448 | US-O02 · FR-19 · BR-14  /  P1  /  ค่าขอบเวลา  /  ⚠️A-17  /  – |
| TC-NOTI-01 | ผู้รับแจ้งเตือนตามระดับ | TEST-PLAN.md:492 | US-O02 · FR-20 · BR-15  /  P1  /  ตารางตัดสินใจ  /  [D] §1 US-O02 · ⚠️A-30 A-31  /  – |
| TC-NOTI-02 | ไม่แจ้งซ้ำ ข้ามระดับ และขั้นรออนุมัติ/รอออกเอกสาร | TEST-PLAN.md:510 | US-O02 · FR-20 · BR-15  /  P1  /  สถานะ  /  [R] ⚠️A-30 A-31 · DECISIONS ข้อ 18  /  – |
| TC-WORKFLOW-01 | SV-01 อนุมัติ + ออกเอกสาร | TEST-PLAN.md:529 | US-O01b O03a O03b · FR-13 FR-16 FR-17 · BR-21 BR-23  /  P1  /  สถานะ  /  [D] §2 A2 · ⚠️A-27 A-28  /  – |
| TC-WORKFLOW-02 | SV-02 ผ่านหัวหน้า | TEST-PLAN.md:546 | US-O01b O03a O03b · FR-15 FR-16 FR-17 · BR-21  /  P1  /  สถานะ + สิทธิ์  /  [D] §2 A1 A2 · ⚠️A-27  /  – |
| TC-WORKFLOW-03 | SV-03 สามขั้นตอน | TEST-PLAN.md:565 | US-O03a · FR-15 FR-16 · BR-21  /  P1  /  สถานะ + routing  /  [D] §2 A2 · ⚠️A-27 A-40  /  – |
| TC-WORKFLOW-04 | ตีกลับสูงสุด 2 ครั้ง และผลหลังครบ | TEST-PLAN.md:584 | US-O01b · FR-14 · BR-19  /  P1  /  ค่าขอบ/สถานะ  /  ⚠️A-20 A-29 · DECISIONS ข้อ 18  /  **B12** |
| TC-WORKFLOW-05 | เหตุผล ≥ 10 ตัวอักษร (ตีกลับ / ไม่อนุมัติ) | TEST-PLAN.md:598 | US-O01b O03a · FR-14 FR-16 · BR-19  /  P1  /  ค่าขอบ  /  ⚠️A-12 A-13 A-44  /  – |
| TC-WORKFLOW-06 | เวลาแก้ไข 168 ชั่วโมง | TEST-PLAN.md:615 | US-C02c · FR-11 · BR-20  /  P1  /  ค่าขอบเวลา  /  ⚠️A-21 A-46  /  – |
| TC-DOC-01 | ออกเอกสารและข้อมูลในเอกสาร | TEST-PLAN.md:633 | US-O03b · FR-17 · BR-23  /  P1  /  oracle จากกฎ  /  [D] §1 US-O03 · ⚠️A-22 A-23 A-48 A-52 A-63  /  – |
| TC-DOC-02 | ตรวจเอกสาร /verify | TEST-PLAN.md:648 | US-O03b · FR-18 · BR-23  /  P1  /  ตารางตัดสินใจ  /  ⚠️A-43 · [R] PDPA  /  – |
| TC-DOC-03 | เอกสารหมดอายุและลายเซ็นไม่ตรง | TEST-PLAN.md:663 | US-O03b · FR-18 · BR-23  /  P1  /  ค่าขอบเวลา  /  ⚠️A-22 A-23 A-43  /  – |
| TC-PDPA-01 | ปิดบังเลขบัตรบนจอ | TEST-PLAN.md:696 | US-O01b · FR-21 · BR-24  /  P1  /  สิทธิ์/ข้อมูล  /  [D] §2 B1 · ⚠️A-24  /  – |
| TC-PDPA-02 | API (JSON) ไม่ส่งเลขบัตรเต็ม | TEST-PLAN.md:712 | US-O01b · FR-12 FR-21 · BR-24  /  P1  /  สิทธิ์/ข้อมูล (oracle ไม่ใช่หน้าจอ)  /  [D] §2 B1 · [R] · DECISIONS ข้อ 18  /  **B09** |
| TC-PDPA-03 | แสดงเลขเต็มต้องมีเหตุผลและบันทึก Audit | TEST-PLAN.md:726 | US-O01b · FR-21 · BR-24 BR-27  /  P1  /  สถานะ  /  [D] §2 B1 · ⚠️A-32  /  **B11** |
| TC-DASH-01 | Dashboard ตัวเลขเริ่มต้น | TEST-PLAN.md:747 | US-A01 · FR-22 · BR-25  /  P1  /  oracle จาก seed  /  [D] §1 US-A01 · ⚠️A-41  /  (B10 อาจล้มด้วย) |
| TC-DASH-02 | Dashboard ย้อนหลัง | TEST-PLAN.md:773 | US-A01 · FR-22 · BR-25 BR-26  /  P1  /  oracle จาก seed  /  [D] §1 US-A01 · [R]  /  **B10** |
| TC-DASH-03 | ส่งออก Excel/PDF เท่าหน้าจอ | TEST-PLAN.md:796 | US-A01 · FR-23 · BR-26  /  P2  /  oracle จาก seed  /  [D] §2 A4 · ⚠️A-50  /  (B10 อาจล้มด้วย) |
| TC-DASH-04 | ค่าขอบ "ทันกำหนด" 16:29:59 / 16:30:00 / 16:30:01 | TEST-PLAN.md:814 | US-A01 · FR-22 · BR-25  /  P1  /  ค่าขอบเวลา (ตั้งนาฬิกาด้วย hook)  /  [R] ⚠️A-17 · DECISIONS ข้อ 18  /  – |
| TC-AUDIT-01 | เหตุการณ์และฟิลด์ใน Audit | TEST-PLAN.md:840 | US-A02 · FR-24 · BR-27  /  P1  /  สถานะ (ทำรายการแล้วตรวจแถว)  /  [D] §1 US-A02 · ⚠️A-36  /  **B11** (แถว UNMASK หาย) |
| TC-AUDIT-02 | Audit แก้/ลบไม่ได้ (405) | TEST-PLAN.md:874 | US-A02 · FR-24 · BR-27  /  P1  /  สิทธิ์  /  [R]  /  – |
| TC-AUDIT-03 | กรองช่วงวันที่ตามเวลาไทย | TEST-PLAN.md:892 | US-A02 · FR-24 · BR-27  /  P1  /  ค่าขอบเวลา  /  [D] §1 US-A02 · ⚠️A-51  /  – |
| TC-RBAC-01 | ประชาชนเปิดคำขอคนอื่นไม่ได้ (IDOR) | TEST-PLAN.md:925 | US-C02c · FR-09 · BR-22  /  P1  /  สิทธิ์  /  [D] §2 A1 · [R]  /  **B06** |
| TC-RBAC-02 | เจ้าหน้าที่อนุมัติ SV-02 ไม่ได้ (ตรวจที่ API) | TEST-PLAN.md:944 | US-O03a · FR-16 · BR-21  /  P1  /  สิทธิ์ (ไม่เชื่อว่าปุ่มซ่อน = ปลอดภัย)  /  [D] §2 A1 · ⚠️A-28  /  **B07** |
| TC-RBAC-03 | ตารางสิทธิ์หน้า/API ตามบทบาท | TEST-PLAN.md:962 | US-C01a O01a · FR-03 · BR-21  /  P1  /  ตารางตัดสินใจ  /  [D] §2 A1 · ⚠️A-28 A-39  /  – |
| TC-RBAC-04 | ผู้ดูแลระบบ: บริการ วันหยุด ผู้ใช้ และยอดที่ล็อก | TEST-PLAN.md:999 | US-AD01 · FR-25 FR-26 FR-27 · BR-11 BR-12 BR-21 BR-27  /  P2  /  สถานะ  /  ⚠️A-02 A-39 A-42  /  (B03 อาจล้มด้วย) |
| TC-RBAC-05 | สิทธิ์เปิด/ดาวน์โหลดไฟล์แนบ | TEST-PLAN.md:1021 | US-O01b · FR-29 · BR-29  /  P1  /  ตารางตัดสินใจ/สิทธิ์  /  [D] §1 US-O01 · ⚠️A-59 · DECISIONS ข้อ 18  /  – |
| TC-RBAC-06 | ผู้ดูแลระบบ: ช่วงค่าที่ยอมรับ | TEST-PLAN.md:1045 | US-AD01 · FR-25 FR-26 FR-27 · BR-28  /  P2  /  ค่าขอบ  /  ⚠️A-53 A-57  /  – |
| TC-NFR-01 | Responsive 375 / 768 / 1280 | TEST-PLAN.md:1073 | ทุก US · NFR-01  /  P1  /  viewport  /  [D] §2 B3  /  – |
| TC-NFR-02 | WCAG: axe + คีย์บอร์ด + label + สถานะไม่ใช้สีอย่างเดียว | TEST-PLAN.md:1083 | ทุก US · NFR-02 NFR-03 NFR-11  /  P1  /  a11y  /  [D] §2 B3 · ⚠️A-25 · [R] WCAG  /  – |
| TC-NFR-03 | Health เวลาโหลด และผลซ้ำได้ | TEST-PLAN.md:1094 | FR-28 · NFR-06 NFR-08 NFR-09  /  P2  /  ตรวจระบบ  /  [D] §2 B2 · ⚠️A-26 · [R]  /  – |
| TC-NFR-04 | เข้ารหัสข้อมูลส่วนบุคคลที่เก็บ (inspection) | TEST-PLAN.md:1107 | NFR-04 · BR-24  /  P2  /  inspection  /  [D] §2 B1  /  – |

## All12 Mutation Failure Sets

| Mode | Required failing TC IDs | Allowed additional failing TC IDs |
| --- | --- | --- |
| B01 | TC-FEE-01 | None |
| B02 | TC-UPLOAD-01 | None |
| B03 | TC-SLA-01, TC-SLA-02 | TC-SLA-03, TC-RBAC-04 |
| B04 | TC-SLA-02 | None |
| B05 | TC-PAY-01 | None |
| B06 | TC-RBAC-01 | None |
| B07 | TC-RBAC-02 | TC-WORKFLOW-01 |
| B08 | TC-QUEUE-02 | None |
| B09 | TC-PDPA-02 | None |
| B10 | TC-DASH-02 | TC-DASH-01, TC-DASH-03 |
| B11 | TC-PDPA-03, TC-AUDIT-01 | None |
| B12 | TC-WORKFLOW-04 | None |

For observed O, require R subset O subset R union A. No timeout/skip/infra failure is proof. Combined B03,B07 and B01,B05,B09 use unions. Baseline twice without restart and final baseline must pass all51.

## Success Criteria -> Designed Work

| Criterion | Task IDs | Meaning of validation |
| --- | --- | --- |
| SC-001 | T002,T075,T077 | Canonical51 baseline outcomes |
| SC-002 | T076,T077 | Source required/allowed mutation sets and combined unions |
| SC-003 | T007,T013,T041,T043,T051 | Server role/owner/department boundaries |
| SC-004 | T031,T039,T074 | Unique payment/claim and rollback/concurrency |
| SC-005 | T022,T047,T056,T061,T074 | Exact fees/calendar/expiry/KPI boundaries |
| SC-006 | T005,T044,T072,T073 | Scoped identity exposure and standalone storage inspection |
| SC-007 | T017,T071 | Keyboard/viewport/labels/accessibility |
| SC-008 | T009,T013,T071,T075 | Reproducible reset and source local load target |
| SC-009 | T062,T065 | Screen/export snapshot agreement |
| SC-010 | T078 | Complete traceability with honest runtime evidence |

A-41 half-up tie (for example1/16 ->6.3%) and A-58 no-surname masking have supplemental
unit checks in T074. They do not add a canonical acceptance ID or claim new source seed.
The B12 third-return button is absent in baseline and deliberately present in fault mode.

## Assumptions and Agency Questions

All63 assumptions A-01–A-63 and all36 questions Q-01–Q-36 remain in REQUIREMENTS §6, §6.1 and §7. None is claimed answered by an agency. Classroom work uses the stated defaults. NFR-05 TLS/Q-08, NFR-06 actual availability/Q-07, NFR-07 real capacity/Q-06 are explicitly production open items.

## Source Immutability

[source-manifest.json](source-manifest.json) records SHA-256 of all10 source documents. Compare it before publishing changes back to the original folder. Generated artifacts may refine a design gap additively but cannot change a source oracle.

## Supplemental visual decision — user selected C

| Design decision | Artifacts | Implementation / verification |
| --- | --- | --- |
| C / เมืองแห่งบริการ: civic storytelling and warm translucent cards | [Design system](design-system.md), [tokens](design-tokens.json), [CSS](design-tokens.css), [art mapping](design-assets.json) | T001 installs tokens/art; T017 applies shell and illustration component; T071 checks semantic images, pointer invariance, fallback and reduced motion |
| 15 page patterns across four shell families | [Layout matrix](contracts/ui-layouts.md) | T017 plus existing page tasks; source routes, selectors and NFR viewport expectations stay unchanged |

These are supplemental design instructions; they add no canonical acceptance ID or mutation mode.
