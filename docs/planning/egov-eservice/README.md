# egov-eservice: แผน DAG/Gantt, ผลรันจริง และผลทดสอบ

ไฟล์ส่งตาม PROMPTS ขั้น 1–5 · ส่วนที่โจทย์เรียกว่า `app/` คือ [assignments/week-02/municipal-eservice](../../../assignments/week-02/municipal-eservice/PROJECT.md)

| ขั้น | ไฟล์ | เนื้อหา |
|---|---|---|
| 1–2 แผน | [blocks.json](blocks.json) · [dag.png](dag.png) · [gantt-plan.png](gantt-plan.png) · [PLAN.md](PLAN.md) | 14 บล็อก · Claude (yolo2) + Codex (cyolo1, cyolo2) · แผนจากโควตาจริงประมาณ 155 นาที |
| 3 รันจริง | [gantt-actual.png](gantt-actual.png) · [compare.png](compare.png) · [REPORT.md](REPORT.md) | ทำครบ 14/14 บล็อก · ท้าย REPORT มีหมายเหตุของ orchestrator (resume, งานซ่อม, ช่วงที่ Docker ปิด) |
| 4 TEST-PLAN | [test-report/index.html](test-report/index.html) · [results.json](test-report/results.json) · `test-report/gifs/` | 51/51 ผ่าน · GIF ของ TC ระดับ P1 40 ไฟล์ |
| 5 BUG_MODE | [BUG-HUNT.md](BUG-HUNT.md) · [bug-hunt-runs/campaign.json](bug-hunt-runs/campaign.json) | จับได้ 12/12 · mutant ผสม 2 ชุด · baseline 51/51 สามรอบ |

ไฟล์ประกอบ:
- **ไฟล์ที่ส่งเข้า agent-team:** [plan.json](plan.json), [graph.json](graph.json) และ [graph.fixed.json](graph.fixed.json) · ตัว fixed คือกราฟที่แก้ prompt ให้ระบุไฟล์ครบทุกไฟล์ของบล็อก แล้วใช้ตอน resume
- **ผลที่ agent-team บันทึก:** [run.json](run.json)
- **การ map requirement กับ source:** [traceability.json](traceability.json) map 69 requirements และ 51 TC ไปยัง 78 tasks · [source-checkpoint.json](source-checkpoint.json) เก็บ hash ของไฟล์ที่ต้องคงไว้

ตรวจโครงสร้างด้วย `python scripts/verify_repository.py` จาก root repo · trace ดิบและรายงาน HTML ของ Playwright ไม่ติดตามใน Git เพราะสร้างซ้ำได้ด้วย `npx playwright test -c playwright.report.config.ts`
