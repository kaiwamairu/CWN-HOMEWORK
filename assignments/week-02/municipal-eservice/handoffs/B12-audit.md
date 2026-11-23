# B12 · Audit Trail และ CSV

## เชื่อมใน B14

- เพิ่ม `import { handleAudit } from './features/audit.ts'` ใน `web/src/server/http/router.ts` แล้วเรียกหลังโหลดเซสชันและตรวจเมธอด ก่อน fallback `NOT_IMPLEMENTED`.

  ```ts
  const audit = handleAudit(request, ctx, actor);
  if (audit) return audit;
  ```

- Route registry เดิมมี `GET /api/audit` และ `GET /api/audit/export.csv` สำหรับ `auditor` แล้ว คงกฎ 405 ก่อนค้น route ไว้เพื่อให้ `PUT` / `PATCH` / `DELETE` ที่ collection และ item ตอบ `METHOD_NOT_ALLOWED` ก่อนตรวจสิทธิ์หรือค้น ID. Adapter ตรวจสิทธิ์ผ่าน domain และคืน `null` สำหรับเส้นทางอื่น
- `/audit` เป็น route โดยตรงของ Next ใช้ `pageSession('/audit')`, page guard ของ custom server และ `RoleLayout` ฟอร์ม GET ส่ง `actor`, `event`, `from`, `to` ลิงก์ CSV ใช้ค่าตัวกรองเดียวกับผลบนจอ รายละเอียดและสถานะก่อน–หลังอยู่ในแต่ละแถว ส่งฟอร์มค้นหาอีกครั้งเพื่ออ่านจำนวนหลังส่งออก

## สัญญาของโมดูล

- `listAudit(db, actor, filters?)` คืน `{ count, items }` โดย `items` ใช้ฟิลด์ตาม CONTRACT §6.4 พร้อมรายละเอียด ผู้ทำและเหตุการณ์จับคู่ตรงตัว ช่วงวันที่ใช้ `[00:00 วันเริ่ม, 00:00 ถัดจากวันสิ้นสุด)` ตามกรุงเทพ เรียงเวลาจริงและ ID จากมากไปน้อย และคืนเวลา ISO `+07:00`
- `exportAuditCsv(db, actor, testMode, filters?)` ใช้ผลค้นหาและลำดับเดียวกันในธุรกรรมแบบ immediate สร้าง CSV UTF-8 ผ่าน `renderAuditCsv(items)` ก่อนเพิ่ม `EXPORT` รายละเอียด `audit-csv` หนึ่งแถว การส่งออกครั้งนั้นจึงไม่มีแถวของตัวเอง ส่วนการส่งออกครั้งถัดไปอาจพบแถวนี้ตามตัวกรอง
- ผู้สร้างเหตุการณ์เรียก `appendAudit(db, event)` ภายในธุรกรรมของการกระทำตามสัญญาเดิม ดูค่ารายละเอียดของแต่ละเหตุการณ์ใน CONTRACT §6.8

## การตรวจ

- ผ่านการตรวจด้วย `node:sqlite` แบบ in-memory โดยใช้ schema, seed, session, page guard, router และ adapter ของโปรเจกต์ ตรวจสิทธิ์อ่านและส่งออก ฟิลด์รายละเอียด ขอบวันไทย ลำดับเวลาเท่ากัน 405 แม้ ID ไม่มี การคงแถวเดิม และ CSV ที่บันทึก `EXPORT` หลังสร้าง snapshot ตัวเลือก UI และแอตทริบิวต์ผ่านการเทียบกับ CONTRACT §2.10
- หลังเชื่อม adapter กับ router ให้ B14 ตรวจ TypeScript และรัน `web/tests/e2e/audit.spec.ts` สำหรับ TC-AUDIT-01–03 รวมขั้นตอนสร้าง 16 เหตุการณ์และการแสดงผลในเบราว์เซอร์ การตรวจใน runtime ของโครงการยังค้างเพราะโฟลเดอร์ dependency ที่ใช้ร่วมชั่วคราวถูกล้างระหว่างตรวจ
