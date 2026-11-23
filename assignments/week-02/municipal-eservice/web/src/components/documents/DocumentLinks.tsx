import { headers } from 'next/headers';
import { publicOrigin, verifyUrl, type CaseDocument } from '../../server/domain/documents';
import { qrMatrix } from '../../server/output/document-pdf';
import styles from '../officer/ReviewPanel.module.css';

const QUIET = 4;

/** Vector QR (one SVG path) built from the same matrix as the PDF. */
function QrSvg({ value }: { value: string }) {
  const matrix = qrMatrix(value);
  const size = matrix.length + QUIET * 2;
  const d = matrix.flatMap((row, r) => row.map((dark, c) => (dark ? `M${c + QUIET} ${r + QUIET}h1v1h-1z` : ''))).join('');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={160} height={160} role="img" aria-label="QR สำหรับตรวจสอบเอกสาร" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

interface Props {
  document: CaseDocument;
  /** Citizen owner only: `download-doc-btn` (CONTRACT 2.6). */
  canDownload: boolean;
  /** `<BASE_URL>`; defaults to the current request's own origin. */
  origin?: string;
}

/**
 * Issued document block for both case pages: `doc-no`, `verify-code`, `doc-qr[data-url]` and,
 * for the applicant, `download-doc-btn` → `GET /api/documents/:docNo/pdf`. Server component.
 */
export async function DocumentLinks({ document, canDownload, origin }: Props) {
  const base = origin ?? publicOrigin(await headers());
  const url = verifyUrl(base, document.verifyCode);
  return (
    <section className="panel" aria-labelledby="case-document-title">
      <h2 id="case-document-title">เอกสารดิจิทัล</h2>
      <dl className="document-facts">
        <div><dt>เลขเอกสาร</dt><dd className="mono" data-testid="doc-no">{document.docNo}</dd></div>
        <div><dt>รหัสตรวจสอบ</dt><dd className="mono" data-testid="verify-code">{document.verifyCode}</dd></div>
      </dl>
      <div className={styles.row}>
        <a href={url} data-testid="doc-qr" data-url={url} aria-label={`ตรวจสอบเอกสาร ${document.docNo}`}>
          <QrSvg value={url} />
        </a>
        <div className={styles.block}>
          <p className={styles.hint}>สแกน QR หรือเปิดลิงก์เพื่อตรวจสอบเอกสาร (ไม่ต้องเข้าสู่ระบบ)</p>
          <a className="text-link mono" href={url}>{url}</a>
          {canDownload && (
            <a
              className="button primary"
              data-testid="download-doc-btn"
              href={`/api/documents/${encodeURIComponent(document.docNo)}/pdf`}
              download={`${document.docNo}.pdf`}
            >
              ดาวน์โหลดเอกสาร
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
