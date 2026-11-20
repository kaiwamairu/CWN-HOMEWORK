# โครงสร้าง repository

```text
CWN-HOMEWORK/
├── README.md
├── CWN-HOMEWORK.code-workspace
├── assignments/
│   └── week-02/
│       ├── README.md
│       └── municipal-eservice/
│           ├── PROJECT.md
│           ├── README.md + เอกสารโจทย์ต้นฉบับ
│           ├── brief/
│           ├── web/              # source + package-lock + tests
│           ├── specs/            # Spec Kit + tokens + approved assets
│           ├── guide/            # offline docs + user flows
│           ├── .specify/
│           ├── .claude/skills/
│           └── .vscode/tasks.json
├── docs/
│   ├── project-status.md
│   ├── import-verification.md
│   └── planning/egov-eservice/    # DAG + Gantt + coverage
└── scripts/verify_repository.py
```

แต่ละสัปดาห์เพิ่มที่ `assignments/week-NN/<project-name>/` ใช้ชื่อโฟลเดอร์ kebab-case และมี entry document ของตัวเอง
เก็บ dependency/lockfile ของแต่ละแอปในโปรเจกต์นั้น ไม่ใช้ package manager ตัวเดียวครอบทุกการบ้าน
เอกสารรวมข้ามโปรเจกต์อยู่ `docs/`; runtime/database/build/report ที่สร้างใหม่อยู่ใน `.gitignore`

เอกสารโจทย์10ไฟล์และภาพที่อ้างด้วย hash ต้องคง bytes รวม line ending จึงกำหนด `.gitattributes` ยกเว้นการ normalize ภายในโปรเจกต์ที่นำเข้า
ไม่แก้ source oracle เพื่อให้ test ผ่าน ส่วน token/สื่อที่อนุมัติใช้ manifest ตรวจ parity กับแอป

ไฟล์ส่งต่อ session, state เฉพาะเครื่อง และประวัติ credentials ไม่ใช่ deliverable ใน repo
ผลตรวจเดิมเก็บใน spec เพื่ออ้างอิง; HTML/JSON runtime report ขนาดใหญ่สร้างซ้ำได้จากคำสั่ง test
