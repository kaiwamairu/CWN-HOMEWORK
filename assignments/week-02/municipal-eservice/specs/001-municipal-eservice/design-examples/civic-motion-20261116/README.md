# GIF — ชุดที่เลือก 1A / 2A / 3A

ผู้ใช้เลือกภาพนิ่งชุด A ทั้งสามฉากก่อนเริ่มงาน GIF ตามคอมเมนต์ Drawdy

- [เปิดดู GIF ทั้งสาม](index.html)
- [1A หน้าเทศบาล](municipal-office-1A.gif): ใบไม้และธงพลิ้ว
- [2A ประชาชนกรอกฟอร์ม](citizen-writing-2A.gif): มือและปากกาเขียนฟอร์ม
- [3A เจ้าหน้าที่ตรวจเอกสาร](officer-review-3A.gif): มือเช็กเอกสารและกระดาษขยับ

ไฟล์หลักขนาด 448×560 พิกเซล, 36 เฟรม, เฟรมละ 100 ms, วนซ้ำไม่สิ้นสุดรอบละ 3.6 วินาที
ไฟล์ใน `previews/` ขนาด 192×240 ใช้สำหรับแสดงในแชต

## วิธีสร้าง

1. ภาพนิ่งที่ผู้ใช้เลือกเก็บเป็น `1A-approved.png`, `2A-approved.png`, `3A-approved.png` โดยไม่เขียนทับ
2. ใช้ ChatGPT built-in `image_gen` สร้าง keyframe sheets หกเฟรมต่อฉากจากภาพที่เลือก ดู [Prompt เต็ม](prompts.json)
3. ใช้ Node.js แยกเฟรมจาก sheet, ตรึงส่วนที่ไม่ต้องเคลื่อนไหวด้วย feathered motion regions และประกอบ GIF พร้อม palette และเฟรมเปลี่ยนเฉพาะส่วน
4. มี interpolation ระหว่าง keyframes เพื่อให้การวนซ้ำต่อเนื่อง; ส่วนใบหน้า อาคาร และฉากหลังนอก motion regions ถูกตรึงจากเฟรมแรก
5. ตรวจ decode GIF ครบทุกเฟรม, ระยะเวลา, loop และ hash ตาม [ผลตรวจ](verification.json) และ [manifest](build-manifest.json)

งานภาพใช้ ChatGPT; การบรรจุเฟรมเป็น GIF ทำในเครื่องด้วย Node.js ไม่มีผู้ให้บริการสร้างวิดีโอภายนอก
GIF เป็นภาพเคลื่อนไหวจาก keyframes ที่สร้างใหม่ รูปต้นฉบับที่เลือกยังเก็บแยกไว้

## สร้างไฟล์ซ้ำ

```powershell
node assemble-gifs.cjs
node assemble-gifs.cjs --preview
node build-preview.cjs
```

ชุดนี้เป็น asset สำหรับตรวจภาพเคลื่อนไหว ยังไม่ได้เปลี่ยนหน้า wireframe หรือผลทดสอบ application
ตำแหน่งเมนูโปรไฟล์ที่ยืนยันแล้วคือบล็อก “ประชาชน / เทศบาลนครตัวอย่าง” ด้านล่าง sidebar
