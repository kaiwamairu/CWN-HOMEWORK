# แก้ UI และดูผลใน VS Code

เปิดโฟลเดอร์ `week2_student` ด้วย File → Open Folder ก่อน ไม่ใช่เปิดเฉพาะไฟล์ HTML

1. กด Ctrl+Shift+B หรือ Terminal → Run Task → **Civic UI: Live Preview**
2. รอข้อความ `CIVIC_PREVIEW_READY http://127.0.0.1:4173/`
3. กด Ctrl+Shift+P → **Browser: Open Integrated Browser** → ใส่ `http://127.0.0.1:4173/`
4. แบ่งหน้าต่างโค้ดกับ Browser ไว้ข้างกัน
5. แก้ไฟล์ต้นทางแล้ว Ctrl+S หน้าเว็บจะประกอบและรีเฟรชอัตโนมัติ โดยคงหน้าประชาชน/เจ้าหน้าที่และตำแหน่งเลื่อน
6. หากอยากให้เปลี่ยนตามการพิมพ์ เปิด File → Auto Save เพื่อให้บันทึกระหว่างแก้

VS Code รุ่นที่ไม่มีคำสั่ง Integrated Browser สามารถเปิด URL เดียวกันใน Chrome/Edge แล้ววางข้าง editor ได้

## ไฟล์ที่ใช้แก้

- [template.html](template.html): layout, CSS และตำแหน่ง fade
- [preview.js](preview.js): เนื้อหาตัวอย่างและพฤติกรรมของ UI
- [design-tokens.json](../../design-tokens.json): สี ความทึบ gradient และ token
- [design-assets.json](../../design-assets.json): ภาพที่เลือก; server ติดตาม webSource ของภาพด้วย

`design-preview.html` และ `index.html` เป็นผลลัพธ์ที่สร้างอัตโนมัติ ให้แก้ไฟล์ต้นทางข้างต้น
ไม่ต้องพิมพ์คำสั่ง build ทุกครั้ง Task จะเรียกตัวประกอบหน้าเดิมให้หลังบันทึก
รอบหนึ่งมักใช้เวลาประมาณหนึ่งวินาที ขึ้นกับเครื่องและขนาดภาพ

ถ้า JSON ผิดหรือประกอบหน้าไม่สำเร็จ จะคงภาพล่าสุดที่สร้างสำเร็จและแสดงข้อผิดพลาด แก้แล้วบันทึกอีกครั้งจะกลับมาทำงาน
ข้อผิดพลาด JavaScript/CSS ที่เกิดใน Browser ให้ดูจาก Developer Tools ของ Browser
หยุดได้ที่ Terminal → Terminate Task → Civic UI: Live Preview หรือกด Ctrl+C ใน terminal ของ task
เริ่ม task หนึ่งครั้งต่อรอบที่เข้ามาแก้ UI

Preview server นี้เปิดเฉพาะ `127.0.0.1` ส่งหน้า UI สถานะ reload และไฟล์ภาพ/MP4 ที่เลือกไว้ใน `design-assets/motion/`
หลังอัปเดตตัว server เพื่อรองรับวิดีโอ ให้หยุด task เดิมแล้วเปิดใหม่หนึ่งครั้ง จากนั้นบันทึกไฟล์ UI ตามปกติได้
สคริปต์ live reload แทรกเฉพาะหน้า server ไม่แทรกลง HTML ออฟไลน์ที่ส่งต่อ
คู่มือเว็บ `guide/` ใช้ขั้นตอนสร้างคู่มือเดิมเมื่อพร้อมอัปเดตชุดเอกสาร

## อ้างอิง

- [VS Code Tasks](https://code.visualstudio.com/docs/debugtest/tasks)
- [VS Code Integrated Browser](https://code.visualstudio.com/docs/debugtest/integrated-browser)
