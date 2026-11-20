# Spec Kit takeover — 2026-11-16

รับช่วง session `2e752df1-3bd6-406f-aa04-7721cbddb3de` ตามคำขอผู้ใช้
ขอบเขตคือร่างเอกสารทั้งหมดด้วย Spec Kit ตามงานล่าสุด ไม่ได้เริ่มสร้างเว็บ

## สิ่งที่รับมาและสิ่งที่ทำต่อ

Agent ก่อนหน้าติดตั้ง Spec Kit 1.3.1.dev0 (`claude`, PowerShell integration) ไว้แล้ว
แต่ constitution ยังเป็น template และไม่มี spec/plan/tasks ที่เสร็จ จากนั้นหยุดด้วย quota429
การรับช่วงนี้รักษา setup และเอกสารโจทย์เดิม และทำชุดเอกสารต่อดังนี้:

| เอกสาร | จุดประสงค์ |
| --- | --- |
| [.specify/memory/constitution.md](constitution.md) | หลักการโครงการ v1.0.0 และ quality gates |
| [spec.md](spec.md) | 14 stories,29 FR,29 BR,11 NFR และผลสำเร็จที่ตรวจได้ |
| [plan.md](plan.md) | Next.js + SQLite + Playwright ตามตัวเลือกเดิม, architecture และลำดับส่งมอบ |
| [research.md](research.md) | เหตุผล/ทางเลือกและเอกสารทางการที่ตรวจสอบแล้ว |
| [data-model.md](data-model.md) | entities, constraints, transitions, clock, transactions และ privacy projections |
| [interface-map.md](interfaces.md) | สัญญาที่ต้องรักษาและ API เสริมสำหรับแก้ร่าง/ลบไฟล์ |
| [quickstart.md](quickstart.md) | คำสั่งเป้าหมาย วิธีรัน51 acceptance cases และ mutation campaign |
| [tasks.md](tasks.md) | 78 งาน implementation พร้อม path/dependency; ทุกงานยังไม่ติ๊ก |
| [traceability.md](traceability.md) | mapping ข้อกำหนด งาน TC และ B01–B12 |
| [checklists](design-check.md) | ผลทบทวนเอกสารและข้อที่ปรับให้ชัด |
| [source-manifest.json](specs/001-municipal-eservice/source-manifest.json) | hash ของเอกสารโจทย์10ไฟล์สำหรับตรวจว่าไม่เปลี่ยน |

`.specify/feature.json` ชี้ `specs/001-municipal-eservice` แล้ว จึงใช้ Spec Kit ขั้นถัดไปได้
โดยไม่ต้องอาศัยชื่อ git branch ไม่เปลี่ยน integration เดิมหรือสร้าง branch ใหม่

## ข้อสรุปที่ต้องรักษาตอนเริ่มสร้าง

- DECISIONS ชนะไฟล์อื่นและ §18 ชนะข้อก่อนหน้า; สมมติฐาน A-01–A-63 และ Q-01–Q-36
  ยังมีป้ายที่มาและสถานะเดิม ไม่อ้างว่าหน่วยงานตอบคำถามแล้ว
- ตรวจทุก HTTP request ผ่าน custom Node server entry; clock/session/counter อยู่ใน SQLite
  เพื่อไม่ให้แต่ละ module bundle เห็นคนละสถานะ
- fee ล็อกตอน PENDING_PAYMENT, dueAt ล็อกตอนจ่าย; รับแก้กลับผู้ถือเดิมได้แม้เกิน10งาน
  และผู้รับทะเบียนครั้งแรกออกเอกสาร SV-02/03 ส่วนหัวหน้าเป็นผู้ลงนาม
- 51 acceptance cases =50 browser/API +1 standalone DB/filesystem inspection
  ที่มี wrapper ใน runner ห้ามกล่าวว่า browser พิสูจน์ encryption ได้
- ต้องมี baseline สองรอบบน server เดิม,12 single-mutant runs,2 combined-mode runs,
  และ final baseline พร้อมหลักฐาน ไม่ใช้ timeout แทนการพบค่าผิด
- API เสริม draft PATCH/file DELETE เป็นการตัดสินออกแบบที่ระบุชัด ไม่แก้สัญญาที่โจทย์บังคับ

## สถานะและขั้นถัดไป

งานรอบนี้สำเร็จในระดับเอกสารและการตรวจความสอดคล้องเท่านั้น ยังไม่มี `web/`,
ไม่มีผล build/Playwright และยังไม่ deploy เป้าหมาย production เช่น99.5%availability,
capacityจริง และ TLS ยังเป็น open items ตามต้นฉบับ

เริ่ม implementation ได้ที่ T001 ใน tasks.md หรือใช้ `$speckit-implement` จากโฟลเดอร์นี้
หลังอ่าน constitution/spec/plan/tasks งานทั้งหมดคงเป็น unchecked จนสร้างและตรวจจริง
การส่งเอกสารกลับโฟลเดอร์ต้นทางต้องตรวจ source hashes และความตรงกันของไฟล์อีกครั้ง

## ทิศทางหน้าตาที่เลือก — C / เมืองแห่งบริการ

ผู้ใช้เลือก **C** เมื่อ 16 พ.ย. 2569 เป็นแนวทางหลัก แทนตัวเลือกก่อนหน้า
เน้นภาพประกอบที่เล่าเรื่องบริการราชการ: อาคารเทศบาล จุดบริการเจ้าหน้าที่ หนังสือรับรอง
ร้านค้าพร้อมใบอนุญาต บ้านพร้อมแบบแปลน และเส้นทาง แฟ้ม → เจ้าหน้าที่ → เอกสารรับรอง
ใช้เมนูเขียวป่า การ์ดครีมโปร่งนุ่ม แสงและเงาคงที่ ไม่มี cursor tracking, tilt หรือ parallax
ดู [Design system](design-system.md),
[design token](design-tokens.json),
[ภาพประกอบและความหมาย](specs/001-municipal-eservice/design-assets.json),
[15 หน้าหลัก / 4 layout](ui-layouts.md) และ
[ตัวอย่างที่เลือก](specs/001-municipal-eservice/design-preview.html)
ผูกการติดตั้ง token/ภาพกับ T001, shell/illustration component กับ T017 และการตรวจ C กับ T071 แล้ว
งานแอปทั้ง 78 รายการยังไม่ติ๊กจนสร้างและตรวจจริง; แบบ B เก็บเป็นประวัติใน design-examples


ปรับภาพฉาก C ตามผู้ใช้เพิ่มเติม: สำนักงานเทศบาลในชุมชนชานเมืองไทย มีลาน ถนน ที่จอดรถ
และอาคารรอบข้าง ใช้ต้นไม้เป็นส่วนประกอบ ภาพ revision 2 ชี้ผ่าน design-assets.json
แทนฉากสวน/ลำธารเดิม คง layout สี ภาพประจำบริการ และแสงเงาคงที่


ภาพปัจจุบันเป็น revision 3: ต่อรายละเอียดชุมชนถึงขอบซ้าย ใช้ภาพเต็มโดยไม่ฝัง fade
และวาง cream gradient เฉพาะหลังข้อความต้อนรับด้วย hero-copy::before ตาม token
hero-text-fade / hero-text-mask คงแสงและภาพนิ่งเหมือนเดิม

## Wireframe ทุกหน้า (16 พฤศจิกายน 2569)

เพิ่ม [Wireframe C แบบคลิกได้ครบ 15 หน้า](../wireframes/index.html) ใช้ design token และค่า fade ล่าสุด พร้อม flow Citizen, Officer/Head, Report/Audit และ Admin ดู [ขอบเขตและไฟล์แก้ไข](wireframes.md)

เปิดใน VS Code: โฟลเดอร์ `week2_student` → `Ctrl+Shift+P` → `Tasks: Run Task` → **Civic UI: Wireframes** → `http://127.0.0.1:4174/` บันทึก source แล้วดูผลอัตโนมัติ หน้าออกแบบเดิมยังอยู่พอร์ต 4173

ชุดนี้เป็น wireframe สำหรับตรวจหน้าตา/flow; 78 implementation tasks และ canonical 51 TC ยังไม่ได้รับการยืนยันจากงานนี้

## ส่งต่อแบบล่าสุด — 18 พฤศจิกายน 2569

ใช้ [TODO](todo.md) และ [ผลตรวจ flow](wireframe-review.md) เป็นสถานะงานส่งต่อแบบ ข้อกำหนดปัจจุบันย้าย A3 ไป public verify และใช้คลิปเข้าสู่ระบบสองบทบาทที่ผู้ใช้ยืนยันแล้ว ไม่มี app-header; account/logout อยู่ในเมนูโปรไฟล์ คง design token และ fade ที่ผู้ใช้แก้ งานแอปจริงทั้ง 78 งานยังเป็นงานถัดไป

## Foundation increment — 18 November 2026

T001–T013 complete: [application instructions](app-quickstart.md), [verification](foundation-review.md). 101 unit/integration tests and20 compiled HTTP checks passed. T014–T078 and canonical51 acceptance cases remain pending. Earlier design-only/78-pending statements above describe historical handoffs. The current source of status is [TODO](todo.md).

## Authentication increment — 18 November 2026

T014–T020 completed and verified in the actual main project. [Evidence](auth-review.md). Current total20/78 tasks; source AUTH4 passed, full51 suite pending. Earlier foundation-only states above are historical. Next milestone RYU-255 / T021–T078.
