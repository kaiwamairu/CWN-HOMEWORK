# Wireframes — C / เมืองแห่งบริการ

ชุด wireframe แบบคลิกได้ ครบ **15 หน้าหลัก** ตาม CONTRACT และผัง UI ใช้ design token,
ภาพประกอบ และตำแหน่ง fade ล่าสุดจากไฟล์หลักใน `specs/001-municipal-eservice` โดยตรง
เปิด [index.html](index.html) ได้ออฟไลน์ เลือกหน้าจากแถบบน หรือเดินตามเส้นทางตัวอย่าง

## ขอบเขตที่ส่งมอบ

- 15 page patterns ใน [routes.json](routes.json); `/` เป็น redirect ไม่เพิ่มจำนวนหน้า
- Wizard 3 ขั้น ใช้ร่วมกันทั้ง SV-01/SV-02/SV-03 พร้อมตัวอย่างบันทึกร่าง แนบไฟล์และชำระจำลอง
- เชื่อม citizen → case/correction, officer → review → head approval → document และ public verify
- หน้ารายงาน Audit และ Admin มีตัวกรอง/ฟอร์ม/กล่องยืนยันสำหรับตรวจ layout และ interaction
- เลือกดู loading, empty, error, forbidden และ not-found component จากแถบตรวจแบบ
- แยก navigation ของแต่ละบทบาท ใช้ข้อความและ testid ที่เกี่ยวข้องจาก CONTRACT
- ตรวจ 375/768/1280px, keyboard/form labels, artwork mapping และ source-token parity

## แผนงาน

1. อ่าน token, ภาพ และ CSS fade ล่าสุดจากต้นฉบับที่ผู้ใช้แก้
2. ประกอบ 4 layout families และ component ร่วมสำหรับทั้ง 15 หน้า
3. เชื่อมเส้นทางด้วย hash URL เพื่อเปิดจากไฟล์ HTML ได้โดยไม่ต้องมี backend
4. เพิ่ม form validation/state ตัวอย่างและเส้นทางคลิกที่ตรวจได้
5. ตรวจหน้า/flow/ขนาดจอ แล้วแนบลง Spec Kit และคู่มือ

## ไฟล์ต้นทาง

- `template.html`: โครงหน้าและ CSS
- `core.js`, `pages-public.js`, `pages-staff.js`, `pages-admin.js`, `actions.js`: component, แต่ละหน้าจอ และ interaction จำลอง
- `routes.json`: รายชื่อหน้า/บทบาท/เส้นทาง
- `seed.json`: curated source data จาก TEST-DATA.md (30 paid cases, บริการ, ผู้ใช้ และวันหยุด)
- `build.py`: ประกอบหน้า offline จาก token และ artwork ปัจจุบัน
- `verification.json`: หลักฐานการตรวจ wireframe เท่านั้น

การเลือกหน้าจากแถบ wireframe จะเลือกผู้ใช้ตัวอย่างที่เหมาะกับบทบาทให้อัตโนมัติ
เส้นทางจริงยังต้องใช้ server-side authorization ตาม CONTRACT เมื่อสร้างแอป
การคลิก/แก้ไขใน wireframe มีผลในหน่วยความจำของหน้านี้เท่านั้น ไม่มีการเรียก API จริง
ไม่มี ThaiD/SSO จริง การชำระจริง การลงลายเซ็นจริง หรือผลยืนยัน encryption/acceptance
PDF/XLSX ใช้กล่องตัวอย่างเอกสารเพื่อดูการจัดวาง; audit CSV ระบุว่าเป็นข้อมูล wireframe
Audit rows บางแถวเป็นข้อมูลตัวอย่างสำหรับ layout และแยกจาก seed audit ที่เริ่มว่าง

งาน implementation ทั้ง 78 งานและ canonical 51 TC ยังไม่ถูกทำเครื่องหมายว่าสำเร็จจาก wireframe

## ปรับตามคอมเมนต์ Drawdy

- 1A หน้าเทศบาลแบบไม่มีคน เป็นฉากเคลื่อนไหวหลังข้อความต้อนรับหน้า `/citizen` และฝั่งภาพของหน้าลงทะเบียน `/register`
- หน้า `/login` ทั้งสองแท็บใช้วิดีโอ Grok พร้อมปุ่มหยุด/เล่น: ประชาชนมองโทรศัพท์และหันจอเข้าหาตัว ส่วนเจ้าหน้าที่เข้าสู่ระบบที่คอมพิวเตอร์สำนักงาน ผู้ใช้ตรวจและอนุมัติคลิปแล้ว บันทึกสถานะใน manifest วันที่ 18 พ.ย. 2569
- 3A เจ้าหน้าที่หญิงตรวจเอกสาร ย้ายไปหน้า `/verify/:code`; 2A เก็บเป็น asset ที่อนุมัติไว้ แต่ไม่ใช้ในหน้าเข้าสู่ระบบ
- เอา `app-header` ออก ย้ายข้อมูลบัญชีและปุ่มออกจากระบบไปที่เมนูโปรไฟล์ล่าง sidebar
- เปลี่ยนกรอบวันที่เป็นปฏิทิน และให้ข้อความต้อนรับค่อย ๆ ปรากฏ โดยเก็บค่า fade เดิม
- มีปุ่มหยุด/เล่นภาพ, ภาพนิ่งเมื่อเปิด reduced motion และภาพสำรองเมื่อโหลดวิดีโอไม่ได้

ไฟล์ที่เลือกและ hash อยู่ใน [motion manifest](../design-assets/motion/manifest.json)
และ [หน้ารวมคลิปที่อนุมัติ](../design-examples/approved-civic-motion-20261116/index.html)
เมื่อคัดลอก `index.html` แบบออฟไลน์ ต้องคง `../design-assets/motion/` ไว้ด้วย
ผลตรวจหลังรวมคลิปและเมนูโปรไฟล์อยู่ใน [motion integration verification](motion-integration-verification.json)

## สร้างใหม่

รัน `python specs/001-municipal-eservice/wireframes/build.py` จาก `week2_student`
หรือใช้ task **Civic UI: Wireframes** ใน VS Code สำหรับ auto-reloading preview ที่ port 4174
แก้ design token ที่ [ไฟล์หลัก](../design-tokens.json) และตำแหน่ง fade ที่
[C template](../design-examples/c-civic-story/template.html) แล้ว wireframe จะดึงค่าเดียวกัน

## รายการงานและการทบทวนล่าสุด

[To-do list](../TODO.md) แยกงานส่งต่อแบบออกจาก implementation 78 งาน
ผลตรวจ user flow/15 หน้า/สถานะและจอมือถืออยู่ใน [review-20261118.md](review-20261118.md) และ [ข้อมูลผลตรวจ](review-20261118.json)
