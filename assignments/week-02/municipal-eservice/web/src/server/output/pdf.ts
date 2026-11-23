// B14 PDF facade. Every PDF the app emits is uncompressed and carries exactly one ASCII machine line
// (CONTRACT §3/§7): seed fixtures and the dashboard use simplePdf; issued documents use B10's renderer.
export { renderDocumentPdf, documentMachineLine, type DocumentPdfInput } from './document-pdf.ts';
// Small uncompressed, parseable PDF used for seed fixtures and the dashboard KPI line.
export function simplePdf(text:string):Buffer{
 const escaped=text.replace(/[^\x20-\x7e]/g,'?').replace(/[\\()]/g,'\\$&');
 const stream=`BT /F1 12 Tf 40 780 Td (${escaped}) Tj ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
 let out='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(out);out+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out);
}
