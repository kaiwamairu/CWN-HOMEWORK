# CWN-HOMEWORK

งานส่ง CWN 2026 จัดตามสัปดาห์และโปรเจกต์ เพื่อเพิ่มการบ้านชุดถัดไปได้โดยไม่ปะปนกับแอปเดิม

## เริ่มจากตรงไหน

| รายการ | ตำแหน่ง |
|---|---|
| Week 02 — เทศบาล e-Service | [ภาพรวมโปรเจกต์](assignments/week-02/municipal-eservice/PROJECT.md) |
| ตัวแอป Next.js | [web/](assignments/week-02/municipal-eservice/web/) |
| ข้อกำหนดและงาน Spec Kit | [specs/001-municipal-eservice/](assignments/week-02/municipal-eservice/specs/001-municipal-eservice/) |
| คู่มือเว็บและ User flow | [guide/README.md](assignments/week-02/municipal-eservice/guide/README.md) |
| แผน DAG / Gantt, ผลรันจริง, ผลทดสอบ (PROMPTS ขั้น 1–5) | [docs/planning/egov-eservice/](docs/planning/egov-eservice/README.md) |
| รายงานแผนเทียบกับของจริง | [REPORT.md](docs/planning/egov-eservice/REPORT.md) |
| ผล Playwright 51 TC + GIF | [test-report/](docs/planning/egov-eservice/test-report/index.html) |
| ผล BUG_MODE 12 ตัว | [BUG-HUNT.md](docs/planning/egov-eservice/BUG-HUNT.md) |
| โครงสร้างและวิธีเพิ่มงาน | [docs/repository-structure.md](docs/repository-structure.md) |

## เปิดแอปในเครื่อง

**วิธีที่ 1 · Docker Compose คำสั่งเดียว** (ไม่ต้องติดตั้ง Node บนเครื่อง ทุกครั้งที่ start จะใช้ DB ตัวอย่างชุดใหม่)

```powershell
cd CWN-HOMEWORK/assignments/week-02/municipal-eservice
$env:TEST_MODE = "1"          # bash: TEST_MODE=1 docker compose up --build --wait
docker compose up --build --wait
```

**วิธีที่ 2 · รันด้วย Node บนเครื่อง** ต้องใช้ **Node.js 24.x** และ npm ที่มาพร้อมกัน

```powershell
git clone -c core.longpaths=true https://github.com/kaiwamairu/CWN-HOMEWORK.git
cd CWN-HOMEWORK/assignments/week-02/municipal-eservice
npm --prefix web ci --include=optional
npm --prefix web run setup:local
npm --prefix web run db:seed
npm --prefix web run dev
```

เปิด http://127.0.0.1:3000/login · `db:seed` ใช้ตอนสร้างฐานข้อมูลตัวอย่างครั้งแรก เพราะจะล้างฐานข้อมูลที่เลือก
เปิด `CWN-HOMEWORK.code-workspace` ใน VS Code เพื่อใช้ task ของโปรเจกต์ หรือเปิดโฟลเดอร์โปรเจกต์โดยตรง
บน Windows ควร clone ลง path สั้น เช่น `C:/work/CWN-HOMEWORK` เพื่อหลีกเลี่ยงข้อจำกัด path ของ native dependencies

บัญชีจำลอง: ประชาชน `1101700123456` / OTP `123456`; เจ้าหน้าที่ `off.reg1` / รหัสผ่าน `Test@1234`
ข้อมูลทั้งหมดเป็นบัญชีทดสอบตามโจทย์ ThaiD, ธนาคารและลายเซ็นเป็นระบบจำลอง

## สถานะ

ทำครบ **78/78 งาน** · T021–T078 ทำด้วย dag-planner/agent-team (Claude + Codex, 14 บล็อก)
Playwright **51/51 ผ่าน** · BUG_MODE **จับได้ 12/12** · mutant ผสมทั้ง 2 ชุดล้มเท่ากับ union ของบั๊กที่ผสม · ดู [สถานะและหลักฐาน](docs/project-status.md)

## ตรวจงาน

จากโฟลเดอร์ `assignments/week-02/municipal-eservice`:

```powershell
npm --prefix web run typecheck
npm --prefix web run verify:assets
npm --prefix web run test:unit
npm --prefix web run build
```

จาก root repo ใช้ `python scripts/verify_repository.py` ตรวจ source hashes, สื่อ, แผนและโครงสร้าง
ผลตรวจการนำเข้า repo อยู่ที่ [docs/import-verification.md](docs/import-verification.md)

`.env` จริง, API/SSH keys, ฐานข้อมูล, node_modules และ build/test runtime ไม่อยู่ใน Git
แอปสร้าง `.env.local` เฉพาะเครื่องด้วย `setup:local`; ดู [ตัวอย่างค่า](assignments/week-02/municipal-eservice/web/.env.example)
