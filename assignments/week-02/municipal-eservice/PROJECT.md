# Municipal e-Service — เมืองแห่งบริการ

เว็บบริการเทศบาลสมมติ ใช้ Next.js, React, TypeScript และ SQLite พร้อมชุดโจทย์ Spec Kit และ wireframe ที่ตรวจได้

| โฟลเดอร์ / ไฟล์ | ใช้ทำอะไร |
|---|---|
| [web/README.md](web/README.md) | ตัวแอป วิธีติดตั้ง เรียกใช้และทดสอบ |
| [README.md](README.md) และเอกสารต้นทาง | โจทย์เดิม 10 ไฟล์ คง bytes และ SHA-256 |
| [specs/001-municipal-eservice/](specs/001-municipal-eservice/) | spec, plan, tasks, contracts และ design tokens |
| [guide/README.md](guide/README.md) | คู่มือ offline และ 10 user flows |
| [specs/001-municipal-eservice/wireframes/index.html](specs/001-municipal-eservice/wireframes/index.html) | Wireframe แบบ C ครบ15หน้า |
| `.specify/` และ `.claude/skills/` | Spec Kit integration สำหรับพัฒนาต่อ |
| `compose.yaml` · `web/Dockerfile` | รันด้วย Docker Compose คำสั่งเดียว (Node 24) |
| [handoffs/](handoffs/B14-final-evidence.md) | เอกสารส่งต่อของแต่ละบล็อก B01–B14 และหลักฐานการรวมระบบ |

## ใช้งาน

ใช้ Node24 แล้วทำตาม [วิธีเริ่มแอปจาก root repo](../../../README.md#เปิดแอปในเครื่อง)
เปิด `guide/index.html` ด้วย browser ในเครื่องเพื่ออ่านคู่มือ; GitHub แสดง HTML เป็น source ตามปกติ
หากต้องการสร้างคู่มือและ `guide.zip` ใหม่ ใช้ `python guide/build.py` จากโฟลเดอร์นี้ ZIP เป็น generated export จึงไม่ติดตามใน Git

## Spec Kit

โครงสร้างภายในโปรเจกต์เดิมถูกเก็บไว้ สคริปต์ค้นหา root ด้วย `.specify/` จึงใช้ใน repo หลายโปรเจกต์ได้
สร้าง state เฉพาะ checkout ก่อนใช้คำสั่ง Spec Kit:

```powershell
Copy-Item .specify/feature.json.example .specify/feature.json
```

## ดีไซน์ที่ต้องรักษา

แบบ C: ครีม glass และเขียวป่า ภาพเทศบาลชานเมืองไทย ใช้สื่อที่อนุมัติแล้วและ design tokens64ตัว
คง greeting fade translateY12px, ปุ่มหยุด/เล่นภาพ และระยะห่าง password→ปุ่ม staff login20px
สถานะปัจจุบัน 78/78 งาน ดู [tasks.md](specs/001-municipal-eservice/tasks.md) และ [ผลตรวจรับ](../../../docs/project-status.md)
