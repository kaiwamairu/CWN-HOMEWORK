// CONTRACT §5: the page-only FORBIDDEN label is separate from API FORBIDDEN.
export const ERRORS={
 INVALID_ID:[400,'เลขบัตรประชาชนไม่ถูกต้อง'],OTP_INVALID:[401,'รหัส OTP ไม่ถูกต้อง'],LOCKED:[423,'ผิดเกินกำหนด เลขบัตรนี้ถูกล็อก 15 นาที'],INVALID_CREDENTIALS:[401,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'],INVALID_MOBILE:[400,'เบอร์มือถือต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0'],CONSENT_REQUIRED:[400,'กรุณายินยอมการประมวลผลข้อมูลส่วนบุคคล (PDPA)'],INVALID_QTY:[400,'จำนวนฉบับต้อง 1–5 ฉบับ'],INVALID_AREA:[400,'กรุณาระบุพื้นที่ 1–500 ตร.ม.'],AREA_TOO_LARGE:[400,'พื้นที่เกิน 500 ตร.ม. กรุณายื่นที่สำนักงาน'],FILE_TOO_LARGE:[400,'ไฟล์ใหญ่เกิน 5 MB'],FILE_TYPE:[400,'รองรับเฉพาะไฟล์ PDF, JPG, PNG'],FILE_COUNT:[400,'แนบได้สูงสุด 5 ไฟล์ต่อคำขอ'],PLAN_NOT_PDF:[400,'แบบแปลนต้องเป็นไฟล์ PDF เท่านั้น'],MISSING_DOCS:[409,'ยังขาดเอกสาร: <ชื่อ, ชื่อ>'],QR_EXPIRED:[410,'QR หมดอายุ กรุณาสร้าง QR ใหม่'],AMOUNT_MISMATCH:[422,'ยอดเงินไม่ตรงกับค่าธรรมเนียม'],NOT_FOUND:[404,'ไม่พบคำขอ'],CANNOT_CANCEL:[409,'ยกเลิกไม่ได้ คำขอมีเจ้าหน้าที่รับเรื่องแล้ว'],FIX_WINDOW_EXPIRED:[409,'หมดเวลาแก้ไขแล้ว คำขอถูกยกเลิก'],ALREADY_CLAIMED:[409,'มีเจ้าหน้าที่รับเรื่องนี้แล้ว'],WORKLOAD_LIMIT:[409,'รับงานได้สูงสุด 10 เรื่อง'],RETURN_LIMIT:[409,'ตีกลับได้สูงสุด 2 ครั้ง'],REASON_TOO_SHORT:[400,'กรุณากรอกเหตุผลอย่างน้อย 10 ตัวอักษร'],REASON_REQUIRED:[400,'กรุณากรอกเหตุผล'],INVALID_STATE:[409,'สถานะคำขอไม่ถูกต้องสำหรับรายการนี้'],FORBIDDEN:[403,'ไม่มีสิทธิ์ทำรายการนี้'],UNAUTHENTICATED:[401,'กรุณาเข้าสู่ระบบ'],INVALID_FEE:[400,'ค่าธรรมเนียมต้องเป็นจำนวนเต็ม 0–100,000 บาท'],INVALID_SLA:[400,'SLA ต้องเป็นจำนวนเต็ม 1–60 วันทำการ'],DUPLICATE_HOLIDAY:[409,'มีวันหยุดนี้อยู่แล้ว'],SELF_ROLE_CHANGE:[409,'ไม่สามารถเปลี่ยนบทบาทของตัวเองได้'],METHOD_NOT_ALLOWED:[405,'Method Not Allowed']
} as const;
export const FORBIDDEN_PAGE_MESSAGE='ไม่มีสิทธิ์เข้าถึงหน้านี้';
export class HttpError extends Error{
 readonly status:number;readonly code:string;readonly extra:Record<string,unknown>;
 constructor(code:keyof typeof ERRORS|'INVALID_TIME'|'INVALID_REQUEST'|'NOT_IMPLEMENTED',extra:Record<string,unknown>={},message?:string){
 const entry=code in ERRORS?ERRORS[code as keyof typeof ERRORS]:[code==='NOT_IMPLEMENTED'?501:400,code==='INVALID_TIME'?'Invalid time':code==='NOT_IMPLEMENTED'?'This feature is not implemented yet':'Invalid request'];
 super(message??String(entry[1]));this.code=code;this.status=Number(entry[0]);this.extra=extra;
 }
}
export function json(body:unknown,status=200,headers:HeadersInit={}):Response{return Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function errorResponse(error:unknown):Response{
 if(error instanceof HttpError)return json({code:error.code,message:error.message,...error.extra},error.status);
 // No exception/request-body logging: SQLite errors can contain sensitive bound values.
 return json({code:'INTERNAL_ERROR',message:'Internal server error'},500);
}
