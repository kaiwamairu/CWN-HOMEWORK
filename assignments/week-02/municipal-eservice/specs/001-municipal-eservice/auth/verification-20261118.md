# Authentication and registration verification — 18 November 2026

ขอบเขต: To-do ข้อ 4 / Linear RYU-254 / T014–T020
ตรวจจากโฟลเดอร์จริง `Project_Main/Teaching_CWN2026/week2_student`
[วิธีเปิดแอป](../../../web/README.md) · [ผล JSON](verification-20261118.json)

| การตรวจที่รันจริง | ผล |
| --- | --- |
| TypeScript strict / production + custom-server build | ผ่าน |
| Unit/integration รวม foundation | 118 ผ่าน, 0 ล้ม, 0 skip |
| Source AUTH-01–04 ผ่าน Chromium | 4 ผ่าน, 0 retry/skip |
| UI และ motion เพิ่มเติม | 15 ผ่าน, 0 retry/skip |
| HTML / RSC / registration-only permission checks | 199 ผ่าน |
| Responsive | 12 หน้าตรวจที่ 375/768/1280px, ไม่มี page overflow |
| เป้ากด | 105 จุด, ต่ำสุด 44×44px |
| Screenshots / layout JSON | 15 ภาพ / 12 รายงาน |
| Axe บน 4 หน้าจริง | 0 detected violations; ยังมี 108 contrast nodes ที่เครื่องมือตัดสินไม่ได้ |
| Token / approved MP4/poster / SVG parity | 64 tokens และ 10 media files ตรง source hash |

## ใช้งานได้ในขั้นนี้

- ThaiD จำลองสำหรับบัญชี seed ทั้งสี่: ตรวจ 13 หลักและ checksum, OTP 123456,
  ล็อกเมื่อผิด 3 ครั้ง, ขอบ 14:59/15:00 และล้างตัวนับเมื่อ OTP ถูก
- SSO จำลองครบเจ็ดบัญชี พร้อม role landing และ STAFF_LOGIN audit ใน transaction เดียวกับ session
- Opaque HttpOnly cookie, digest-only storage, role/dept snapshot ตอน login, logout และ reset invalidation
- ลงทะเบียนชื่อจาก provider ที่แก้ไม่ได้, เบอร์ 10 หลักขึ้นต้น 0, อีเมลไม่บังคับ และ consent
  เข้ารหัสเบอร์พร้อม consent timestamp; หมุน session เมื่อสำเร็จ
- หน้า login สองบทบาท, registration, citizen home ที่อ่านข้อมูลของเจ้าของจริง และ role landing
- C glass layout ไม่มี app-header, เมนูบัญชี/ออกจากระบบใน profile และ SVG เรื่องงานเทศบาล
- สื่อที่อนุมัติ: citizen login, staff login, 1A ที่ register/home และ 3A ที่ seed verify
  พร้อม pause/play, reduced-motion opt-in, hidden/offscreen pause และ error poster
- ตรวจ role/registration-only/เจ้าของคำขอก่อนส่ง HTML หรือ RSC; foreign/missing case ได้ 404 เหมือนกัน

## Regression ที่แก้จากผลทดสอบ

ทดสอบให้ล้มก่อนแก้: logout ที่ HTTP500/network failure, ID เปลี่ยนระหว่างรอ start response,
แท็บที่ใช้ลูกศรไม่ได้ และหน้ามือถือล้นจาก sr-only heading ในตาราง
แก้ local text contrast บน cream surfaces และชื่อปุ่ม profile ให้ตรงข้อความที่มองเห็น
canonical tokens และ fade translateY(12px) คงเดิม
ตัวช่วยทดสอบเก็บ response จริงก่อน full navigation โดย forward request เดิมเพียงครั้งเดียว
ทุก exact API/status/body assertion ของ source AUTH ยังคงครบ

## งานที่ยังรอขั้นถัดไป

T021–T078 และระบบดำเนินคำขอ/คิว/อนุมัติ/รายงาน/Admin ยังรอ implementation
role landing ที่ยังไม่เชื่อมบริการแสดงสถานะกำลังเตรียมบริการ
หน้า citizen case/verify ใช้อ่าน seed เพื่อให้เส้นทางและสิทธิ์ทำงาน; workflow เต็มเป็นงานถัดไป
TC-RBAC-03 เขียนครบตาม oracle แล้ว แต่ allowed API branches ยังรอบริการในขั้นที่ 5
ผล 199 จุดข้างต้นเป็น supplemental HTML/RSC checks
canonical suite เต็ม 51 TC, NFR-04 inspection และ mutation campaign ยังไม่รัน
ค้นพบ 5 canonical specs (AUTH4 + RBAC03); อีก46 specs ยังไม่ถูกสร้าง
ผล Axe แยก incomplete gradient/pseudo checks ไว้ จึงยังไม่อ้าง full WCAG compliance

รายงานเครื่องบนเครื่องนี้: `web/evidence/milestone4-main-auth/html/index.html`
และ `web/evidence/milestone4-main-ui/html/index.html`
