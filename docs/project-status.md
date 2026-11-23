# สถานะ Municipal e-Service

อัปเดต 23 พฤศจิกายน 2569 · **ทำครบ 78/78 งาน** · ตรวจรับครบตาม TEST-PLAN และ BUGS

| Milestone | สถานะ |
|---|---|
| Spec/design handoff และตรวจ wireframe | เสร็จ |
| T001–T020 foundation, authentication และ registration | เสร็จ (ก่อนรัน pipeline) |
| T021–T078 ร่างคำขอ, อัปโหลด, ชำระเงิน, คิว, พิจารณา, SLA, อนุมัติ/PDF, dashboard, audit, admin | เสร็จ · run `egov-eservice-20261122-224219` ของ dag-planner/agent-team |
| Docker Compose คำสั่งเดียว | เสร็จ · `compose.yaml` + `web/Dockerfile` (Node 24) |
| Playwright 51 TC | ผ่าน 51/51 · baseline 2 รอบในขั้น 4 และอีก 3 รอบใน campaign |
| BUG_MODE B01–B12 + mutant ผสม 2 ชุด | จับได้ 12/12 · ทุกรอบตรงตาม BUGS.md |
| NFR-04 · hook ถูกปิดเมื่อไม่ใช่ TEST_MODE | ผ่าน · ไม่พบข้อมูล plaintext · hook ตอบ 404 |

## หลักฐาน
- แผนกับของจริง: [REPORT.md](planning/egov-eservice/REPORT.md)
- ผลทดสอบขั้น 4: [test-report](planning/egov-eservice/test-report/index.html)
- BUG_MODE: [BUG-HUNT.md](planning/egov-eservice/BUG-HUNT.md)
- สรุปการรวมระบบของ B14: [B14-final-evidence.md](../assignments/week-02/municipal-eservice/handoffs/B14-final-evidence.md)
- หลักฐานก่อน pipeline (T001–T020): [auth verification](../assignments/week-02/municipal-eservice/specs/001-municipal-eservice/auth/verification-20261118.md)

## ข้อจำกัดและคำถามที่ยังเปิด
- **Axe:** ไม่พบปัญหาระดับ serious หลังแก้ contrast แล้ว แต่ยังไม่ใช่การรับรอง WCAG เต็ม
- **คำถามที่โจทย์เปิดไว้ (Q/A):** availability, capacity และ TLS ยังเป็นคำถามถึงหน่วยงาน
- **คำถามถึง TA:** ช่อง "อาจล้มด้วย" ของ B03 ใน BUGS.md ควรเพิ่ม TC-NOTI-02 ตาม DECISIONS §18
