# B05 · การชำระเงินและเลขคำขอ

## เชื่อม API และหน้าชำระเงิน

ใน `router.ts` ของ B14 ให้เรียก `handlePayments(request, ctx, actor)` จาก `web/src/server/http/features/payments.ts` หลังตรวจ route, method และ session คืน response เมื่อมีผลลัพธ์ และให้ error handler เดิมจัดการ `HttpError` ทั้งสอง route มีอยู่ใน registry แล้ว [CONTRACT §6.2](../CONTRACT.md)

| Method และ path | ผลลัพธ์ |
| --- | --- |
| `POST /api/drafts/:id/payment` | `201 {ref, amount, qrCreatedAt, qrExpiresAt}` สำหรับเจ้าของร่างที่ยังไม่ชำระและแนบเอกสารครบ |
| `GET /api/payments/:ref` | `200 {ref, amount, status, qrCreatedAt, qrExpiresAt, caseNo, receiptNo}` สำหรับเจ้าของ ค่าเลขทั้งสองเป็น `null` จนกว่าจะชำระ |
| `POST /api/test/payments/:ref/pay` | shared dispatcher เดิมเรียก `pay(ctx.db, ref, body.amount, true, ctx.bugModes)` เมื่อเปิด `TEST_MODE=1` คืน `{status: 'PAID', caseNo, receiptNo, duplicate}` |

- หน้า wizard เรียก `getLatestDraftPayment(db, actor, draftId, testMode)` ฝั่งเซิร์ฟเวอร์เพื่อเปิด QR ล่าสุดของร่างเดิม เช่น seed `DR-0002` ที่มี ref `PP-0001` ได้ผลเหมือน GET พร้อม `paidAt` หรือ `null` ถ้าร่างยังไม่มี QR เมื่อ refresh แล้วได้ `PAID` ให้อ่าน `paidAt` จาก `GET /api/cases/:caseNo` สำหรับ `receipt-paid-at` ใช้ `qrExpiresAt` เป็นเส้นตายและแสดงสถานะตามนาฬิกาของระบบ [CONTRACT §3 และ §6](../CONTRACT.md)
- การสร้าง QR อีกครั้งได้ ref ใหม่และใช้ยอดที่ตรึงไว้ QR แต่ละใบมีอายุ 900 วินาที เมื่อร่างชำระสำเร็จแล้ว ref ที่เคยออกให้ร่างเดียวกันจะแสดงผลการชำระของร่าง ใบเสร็จเก็บ ref ที่รับเงินจริงเพียงรายการเดียว Callback ที่ยอดตรงกันจะคืนเลขจากใบเสร็จเดิมแม้เลยอายุ QR แล้ว [DECISIONS §7 และ §18](../DECISIONS.md)
- B05 mutant ยอมรับ callback ที่ขอบ 900 วินาทีพอดี ส่วนการแสดงวันหมดอายุยังใช้ `qrExpiresAt` และเวลาปัจจุบัน [BUGS B05](../BUGS.md)

## ธุรกรรมชำระเงิน

`createPayment` ตรวจเจ้าของ ตรวจเอกสารด้วย `assertRequiredDraftDocuments` แล้วเรียก `lockDraftFee` ในธุรกรรมเดียวกับตัวนับ PP และการบันทึก ref ครั้งแรกที่รับ callback สำเร็จจะตรวจเอกสารซ้ำและใช้ `initialDueAt` ของ B09 เพื่อคำนวณวันครบกำหนดจาก SLA และปฏิทิน ณ เวลาชำระ [B03](B03-drafts.md) · [B04](B04-uploads.md) · [B09](B09-sla.md)

`pay` ใช้ธุรกรรม SQLite แบบ IMMEDIATE สำหรับตัวนับประจำปี พ.ศ. ตามเวลา Bangkok, คำขอ `SUBMITTED` ที่ฝ่ายทะเบียน, ใบเสร็จเลขท้ายตรงกัน, การเชื่อมไฟล์แนบ, ประวัติแผนก, สถานะร่าง/ref และเหตุการณ์ `PAYMENT` ในไทม์ไลน์คำขอ Audit Trail ของผู้ตรวจสอบคงชุด 10 เหตุการณ์ตาม BR-27 [REQUIREMENTS BR-09, BR-11, BR-12, BR-27](../REQUIREMENTS.md)

ตรวจบน Node 24.22.3 แล้ว strict typecheck ของไฟล์ TypeScript ใน B05 ผ่าน และ integration ผ่าน 15/15 จาก `payments.test.ts`, `payment-guards.test.ts`, `foundation.test.ts` และ `transactions.test.ts` ชุดนี้ครอบคลุม payment adapter, callback ผ่าน dispatcher จริง, การย้อนกลับเมื่อเขียนไทม์ไลน์ล้มเหลว และ callback พร้อมกันผ่าน SQLite คนละ connection การต่อ wizard ผ่าน router และ Playwright เป็นงานรวมของ B14
