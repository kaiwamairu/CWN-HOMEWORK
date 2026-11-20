import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import sharp from 'sharp';
import {ERRORS,FORBIDDEN_PAGE_MESSAGE} from '../../src/server/http/errors.ts';
test('pinned output dependencies create parseable PDF, XLSX and QR PNG on this runtime',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();assert.equal((await PDFDocument.load(await pdf.save())).getPageCount(),1);
 const book=new ExcelJS.Workbook();book.addWorksheet('Report').addRow(['metric','value']);const bytes=await book.xlsx.writeBuffer();const restored=new ExcelJS.Workbook();await restored.xlsx.load(bytes);assert.equal(restored.worksheets[0].getCell('A1').value,'metric');
 const qr=await QRCode.toBuffer('http://127.0.0.1:3000/verify/K7M2Q9XA');assert.equal((await sharp(qr).metadata()).format,'png');
});
test('all 33 canonical error rows retain exact status/code/Thai text',()=>{
 const source=JSON.parse(readFileSync(new URL('../../../specs/001-municipal-eservice/contracts/inventory.json',import.meta.url),'utf8')) as {errors:string[]};assert.equal(source.errors.length,33);
 for(const row of source.errors){const parts=row.split('|');const message=/`([^`]+)`/.exec(parts[1])![1];const status=Number(/\d{3}/.exec(parts[3])![0]);const code=/`([A-Z_]+)`/.exec(parts[3])?.[1];
 if(code){assert.ok(code in ERRORS,code);assert.deepEqual(ERRORS[code as keyof typeof ERRORS],[status,message]);}else assert.equal(FORBIDDEN_PAGE_MESSAGE,message);
 }
});
