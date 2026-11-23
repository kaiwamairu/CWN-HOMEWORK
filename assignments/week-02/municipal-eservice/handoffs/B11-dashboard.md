# B11 · Dashboard และรายงาน

## เชื่อมใน B14

- ใน `web/src/server/http/router.ts` import `handleDashboard` จาก `./features/dashboard.ts` แล้วเพิ่มก่อนจุดที่ตอบ `NOT_IMPLEMENTED`

  ```ts
  const dashboard = await handleDashboard(request, ctx, actor);
  if (dashboard) return dashboard;
  ```

  ตาราง route เดิมมี `GET /api/dashboard` และ `GET /api/dashboard/export` สำหรับ `executive` แล้ว ตัว handler ใช้เซสชันที่ router ส่งเข้ามาและตรวจสิทธิ์อีกครั้ง เส้นทางอื่นคืน `null`
- `web/src/app/dashboard/page.tsx` เป็น route ของ Next โดยตรง ใช้ `pageSession('/dashboard')` และ `RoleLayout` ส่วน `web/src/components/dashboard/DashboardFilters.tsx` จัดการการเปลี่ยน query string โดยคงอีกค่าที่เลือกไว้ ลิงก์ดาวน์โหลดใช้ค่าตัวกรองเดียวกับผลบนหน้าจอ
- การปิดงานใช้ `cases.closed_at` และสถานะ `COMPLETED`/`REJECTED` จาก writer ของ workflow โดยอิงกำหนดเสร็จใน `cases.due_at` ส่วนกรณียกเลิกจะยังอยู่ในยอดรับเรื่องของงวดที่ชำระ

## ข้อมูลและไฟล์ส่งออก

- `readDashboard(db, actor, testMode, { period, service }, bugModes)` คืน `{ received, closed, onTime, ontimePct, backlog, overdue, workload }` ค่าเริ่มต้นคือเดือนปัจจุบันตามนาฬิกากรุงเทพและ `ALL` คงค้างและเกินกำหนดกรองเฉพาะบริการ งานในมือแสดงจำนวน `IN_REVIEW` ของเจ้าหน้าที่แต่ละบัญชีโดยรวมทุกบริการ
- หน้าจอกับ `renderDashboardXlsx(kpis)` ใช้ `formatDashboardKpis()` และป้ายเดียวกัน PDF ใช้ `renderDashboardPdf(kpis)` แสดง ASCII ตาม CONTRACT §7 โดยอาศัย `simplePdf` ใน `output/pdf.ts` ตัวสร้างเอกสารของ workflow อยู่คนละไฟล์
- เมื่อสร้างไฟล์สำเร็จ `handleDashboard` บันทึก `EXPORT` หนึ่งแถวด้วย `appendAudit` ในธุรกรรมเขียน โดยใช้เวลาที่อ่านรายงานและรายละเอียด `<format> <period> <service>` ผลลัพธ์ส่งออกมีเฉพาะค่ารวมทั้งห้าช่อง

## ผลตรวจระดับบล็อก

- Node 24.22.3 และ `tsc --noEmit` ผ่านในสำเนาที่เชื่อม handler เข้ากับ router
- ตรวจค่าใน TEST-DATA §7, ตัวหาร B10, เงื่อนไข 16:29:59 / 16:30:00 / 16:30:01 และกรณี 1 ÷ 16 ปัด 6.25% เป็น 6.3% ผ่านในฐานข้อมูล seed แยก
- ทดสอบ handler ด้วยสิทธิ์ทุกบทบาท เปิดอ่านเซลล์ XLSX และข้อความ PDF ของ พ.ย. และ ธ.ค. เทียบค่าที่ตัวจัดรูปแบบส่งให้หน้าจอ ตรวจด้วย regex ตาม BR-24 และตรวจแถว `EXPORT` ในฐานข้อมูลแล้ว
- Chromium ผ่าน TC-DASH-01/02 และขั้นตอนเทียบหน้าจอกับไฟล์และตรวจ BR-24 ของ TC-DASH-03 ในสำเนาที่เชื่อม router ใช้ Chromium 1248 ที่ติดตั้งอยู่ การรัน TC-DASH-03 เต็มข้อรวมหน้า Audit และ TC-DASH-04 ผ่านการปิดงานจริงอยู่ในรอบรวมของ B14
- Dashboard ที่ความกว้าง 360 px ไม่มีการเลื่อนแนวนอน และ axe ไม่พบข้อผิดพลาด WCAG 2.1 AA ระดับ serious หรือ critical
