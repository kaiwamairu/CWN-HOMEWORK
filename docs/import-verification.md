# ตรวจการนำเข้า repository — 20 พฤศจิกายน 2569

ตรวจใน checkout ของ CWN-HOMEWORK หลังจัดโครงสร้างใหม่ บน Windows x64, Node24.22.3 และ npm11.19.1

| ตรวจอะไร | ผลจริง |
|---|---|
| Clean install ตาม lockfile: `npm ci --include=optional --no-audit --no-fund` | ผ่าน — 313 packages |
| `npm run setup:local` | ผ่าน — สร้างค่าลับเฉพาะ checkout และไม่ติดตามใน Git |
| `npm run typecheck` | ผ่าน |
| `npm run verify:assets` | ผ่าน — 64 tokens, 10 media files และ SVG byte parity |
| `npm run test:unit` | ผ่าน118 / ไม่ผ่าน0 / ข้าม0 |
| `npm run build` | ผ่าน — Next production build และ custom server bundle |
| `python scripts/verify_repository.py` | ผ่าน19ข้อ — โครงสร้าง, DAG, coverage, สื่อและ source hashes |
| SHA-256 ของเอกสารต้นฉบับ10ไฟล์ใน Git index | ตรงต้นฉบับทุกไฟล์ |
| ตรวจ private-key/service-token patterns และค่าลับจริง6ค่าจากไฟล์เครื่องต้นทาง | ไม่พบในไฟล์ที่จะเผยแพร่ |

ครั้งแรกที่ติดตั้งใน path ทดสอบยาวบน Windows พบว่า optional native package ของ sharp ไม่ถูกติดตั้ง
ย้าย checkout ให้ path สั้นลงและ clean install ใหม่โดยระบุ `--include=optional` แล้วรันทุกรายการข้างต้นผ่าน
ไม่มีการเปลี่ยนเวอร์ชัน dependency หรือแก้ source oracle เพื่อให้ผลผ่าน

ไม่ได้แนบ `.env` จริง, API/private SSH keys, ฐานข้อมูล, dependency, build output หรือ runtime reports ขนาดใหญ่
ZIP คู่มือสร้างซ้ำได้ด้วย `python guide/build.py`; สื่ออนุมัติและประวัติแบบยังอยู่ในโปรเจกต์

ชุด canonical51 และ mutation campaign ยังเป็นงานถัดไปตาม tasks.md
ผล AUTH4/UI15/HTML-RSC199 ในเอกสาร auth เป็นหลักฐานเดิม ไม่ได้รันซ้ำในการอัปโหลดครั้งนี้
