import QRCode from 'qrcode';

/** Fields printed in an issued document (DECISIONS §10). Thai values go to the Info dictionary. */
export interface DocumentPdfInput {
  docNo: string;
  caseNo: string;
  applicant: string;
  serviceId: string;
  serviceName: string;
  issuedAt: string;
  validUntil: string;
  signer: string;
  signerUsername: string;
  verifyCode: string;
  verifyUrl: string;
  signature: string;
}

/** CONTRACT §3 / A-63: the one machine-readable ASCII line tests extract from the file. */
export function documentMachineLine(input: Pick<DocumentPdfInput, 'docNo' | 'caseNo' | 'verifyCode' | 'validUntil'>): string {
  return `docNo=${input.docNo} caseNo=${input.caseNo} verify=${input.verifyCode} validUntil=${input.validUntil}`;
}

/** QR module matrix (row-major, true = dark) shared by the PDF and the on-screen `doc-qr`. */
export function qrMatrix(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return Array.from({ length: modules.size }, (_, row) =>
    Array.from({ length: modules.size }, (_, col) => modules.get(row, col) === 1));
}

/** PDF literal string limited to printable ASCII so the line stays byte-for-byte extractable. */
function literal(text: string): string {
  return `(${text.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&')})`;
}

/** PDF text string for Thai metadata: UTF-16BE with BOM, hex encoded. */
function utf16(text: string): string {
  const bytes: string[] = ['FE', 'FF'];
  for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'));
  return `<${bytes.join('')}>`;
}

function text(font: 'F1' | 'F2', size: number, x: number, y: number, value: string): string {
  return `BT /${font} ${size} Tf ${x} ${y} Td ${literal(value)} Tj ET`;
}

function qrPath(matrix: boolean[][], left: number, top: number, width: number): string {
  const size = width / matrix.length;
  const rects: string[] = [];
  matrix.forEach((row, r) => row.forEach((dark, c) => {
    if (dark) rects.push(`${(left + c * size).toFixed(2)} ${(top - (r + 1) * size).toFixed(2)} ${size.toFixed(2)} ${size.toFixed(2)} re`);
  }));
  return `0 0 0 rg\n${rects.join('\n')}\nf`;
}

/**
 * Small, uncompressed single-page PDF. Content streams are plain text, so the machine line
 * survives both raw byte search and text extraction. The QR is drawn as vector modules.
 * Thai names (applicant, signer, service) are kept in the Info dictionary because the
 * standard Type 1 fonts carry no Thai glyphs; the Thai view of these facts is `/verify` (A-63).
 */
export function renderDocumentPdf(input: DocumentPdfInput): Buffer {
  const lines: [string, string][] = [
    ['Document No', input.docNo],
    ['Case No', input.caseNo],
    ['Service', input.serviceId],
    ['Issued at', input.issuedAt],
    ['Valid until (last valid day)', input.validUntil],
    ['Signed by (approver)', input.signerUsername],
    ['Verification code', input.verifyCode],
    ['Verify online', input.verifyUrl],
  ];
  const content = [
    '0.11 0.30 0.20 rg',
    text('F1', 18, 50, 790, 'Sample City Municipality - Digital Document'),
    '0 0 0 rg',
    text('F1', 10, 50, 772, 'Municipal e-Service (simulated digital signature, A-22)'),
    ...lines.flatMap(([label, value], i) => [
      text('F1', 10, 50, 730 - i * 22, `${label}:`),
      text('F2', 10, 210, 730 - i * 22, value),
    ]),
    text('F1', 9, 50, 530, 'Applicant, signer and service names (Thai) are shown on the verification page.'),
    text('F1', 9, 50, 512, 'Signature HMAC-SHA256:'),
    text('F2', 8, 50, 498, input.signature),
    text('F2', 9, 50, 470, documentMachineLine(input)),
    qrPath(qrMatrix(input.verifyUrl), 425, 745, 120),
  ].join('\n');

  const info = [
    `/Title ${literal(input.docNo)}`,
    `/Subject ${utf16(`${input.serviceId} ${input.serviceName}`)}`,
    `/Author ${utf16(input.signer)}`,
    `/Applicant ${utf16(input.applicant)}`,
    `/Signer ${utf16(input.signer)}`,
    `/Producer ${literal('Municipal e-Service')}`,
  ].join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    `<< ${info} >>`,
  ];

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
