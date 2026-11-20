# Foundation verification — 18 November 2026

ขอบเขต: To-do ข้อ 3 / Linear RYU-253 / T001–T013 เท่านั้น
ตรวจซ้ำใน Project_Main/Teaching_CWN2026/week2_student แล้ว: clean install, typecheck, assets, 101 tests, build และ20 HTTP checks ผ่าน
ใช้ [วิธีรันแอป](app-quickstart.md) และ [quickstart](quickstart.md)

| การตรวจจริง | ผล |
| --- | --- |
| Node / Next / SQLite adapter | 24.22.3 / 16.4.6 / better-sqlite3 13.2.0 |
| TypeScript strict | ผ่าน |
| Unit + integration | 101 ผ่าน, 0 ล้ม, 0 skip |
| Next production + custom server build | ผ่าน |
| HTTP จาก compiled server + owned acceptance launcher | 20 จุดผ่าน |
| Token / approved media / SVG parity | 64 tokens, 10 media files, SVG byte parity ผ่าน |
| Canonical acceptance / mutation / NFR-04 inspection | ยังไม่รัน; รอ story implementations และ T073 |

หลักฐานเครื่องอ่าน: [verification JSON](foundation-verification-20261118.json)

## สิ่งที่ทำงานในรอบนี้

- โครง Next App Router และ custom Node HTTP server; API adapter ใช้ dispatcher เดียวกัน
- SQLite ทุก entity พร้อม FK/NOT NULL/UNIQUE และ conditional CHECK; rollback journal,
  busy timeout 5000 ms และ immediate synchronous transactions
- Seed 30 คำขอ 2 ร่าง 1 เอกสาร พร้อมไฟล์ PDF จริง counters และเวลาเดิม; dueAt ไม่คำนวณใหม่
- AES-256-GCM พร้อม IV/tag ใหม่, lookup HMAC คนละคีย์ และเก็บเลขท้ายบัตรเพียง 3 หลัก
- เวลา Bangkok, cutoff 16:30:00, วันหยุด และการขยาย SLA ในช่วง (วันตีกลับ, วันส่งแก้]
- Policy แยก resource, snapshot role/dept, staff allowlist/mask และ 33 error rows ตรงต้นฉบับ
- Audit append-only ใน transaction เดียวกับ action และ lifecycle ก่อน request ปกติทุกชนิด
- Reset/clock/pay/tamper จริง; callback พร้อมกัน 6 ครั้งสร้างคำขอและใบเสร็จเพียงชุดเดียว
- Test fixtures PDF/JPEG/PNG เปิดอ่านได้ และขนาด 5 MB ทั้งสามขอบตรงไบต์
- Playwright ปฏิเสธการใช้ server ที่ไม่ใช่ของ runner; รายงานไม่บรรจุคีย์

## ผลรีวิวและ regression

แยกทบทวนสเปกก่อนคุณภาพโค้ดสำหรับ crypto/calendar, fixtures และ storage/HTTP
แก้จากการทดสอบที่ล้มก่อน: context ค้างเมื่อล็อกอินพร้อมกัน, คีย์ใน JSON reporter,
owned launcher ยังไม่ seed ฐานใหม่, payment callback ขาดการตรวจไฟล์ซ้ำ,
PDF role-specific 404 และ SQLite CHECK ที่ NULL ผ่านได้
เพิ่ม approval timeline ของ seed 000019 ให้ตรงเวลาใน TEST-DATA
ทดสอบ clean install ในโฟลเดอร์หลัก; ตั้ง .npmrc ใช้ prebuild ที่มากับ dependency เพื่อหลีกเลี่ยง npm ci เรียก node-gyp โดยไม่จำเป็นบน Windows
ทดสอบ clock jump แล้วได้จำนวนแจ้งเตือน 15/7/10/1 ตามต้นฉบับและไม่สร้างซ้ำ

## ข้อจำกัดที่ตั้งใจคงไว้

หน้า `/login` ปัจจุบันเป็น landing เตรียมระบบ; ยังไม่ใช่หน้าที่ล็อกอินได้
การออก session/OTP/registration และ UI บทบาทเป็น T014–T020
คำสั่งของ story ที่ยังไม่ทำคืน 501 ชัดเจน ไม่มี success จำลอง
API verify/PDF ที่ใช้พิสูจน์ foundation ทำงานกับเอกสาร seed; หน้า verify เต็มเป็นงานถัดไป
ตัวเล่นวิดีโอและ fade บนหน้าจริงทำใน T017 โดยใช้สื่อเดิมที่คัดลอกและตรวจ hash แล้ว
ชุด 51 TC มีเพียง registry/preflight ในรอบนี้; ไม่มี placeholder tests
inspection/campaign scripts จงใจ exit nonzero จนกว่าจะทำ T073 จริง

เอกสารโจทย์ต้นฉบับ 10 ไฟล์, token JSON/CSS, C template และค่า fade ของผู้ใช้ต้องคง hash เดิม
