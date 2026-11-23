import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EntryLayout } from '../../../components/EntryLayout';
import { CivicIllustration } from '../../../components/illustrations/CivicIllustration';
import { SERVICE_NAMES } from '../../../lib/roles';
import { VERIFY_LABELS, verifyDocument } from '../../../server/domain/documents';
import { formatThaiDate, formatThaiDateTime } from '../../../server/domain/sla';
import { getContext } from '../../../server/http/context';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ตรวจสอบเอกสาร · บ้านบริการ', robots: { index: false } };

/**
 * Public `/verify/:code` (no login, CONTRACT 2.13). The custom server already answers an
 * unknown code with HTTP 404 `ไม่พบเอกสาร`; a found code renders here with 200.
 * TAMPERED shows only the result, never the document number or name.
 */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = verifyDocument(getContext(), code);
  if (!result) notFound();
  const valid = result.result === 'VALID';

  return (
    <EntryLayout scene="3A" heading={'ตรวจสอบเอกสาร\nได้อย่างมั่นใจ'} copy={'ตรวจสอบสถานะหนังสือและเอกสาร\nที่ออกโดยเทศบาลนครตัวอย่าง'}>
      <div className="form-intro">
        <span className="eyebrow">ตรวจสอบเอกสารสาธารณะ</span>
        <h2>ผลตรวจสอบเอกสาร</h2>
      </div>
      <div className={'verify-state ' + (valid ? 'success' : 'warning')} role="status">
        <CivicIllustration symbol="art-certificate" size={96} />
        <h3 data-testid="verify-result" data-result={result.result}>{VERIFY_LABELS[result.result]}</h3>
      </div>
      {result.result !== 'TAMPERED' && (
        <dl className="document-facts">
          <div><dt>เลขเอกสาร</dt><dd className="mono" data-testid="verify-doc-no">{result.docNo}</dd></div>
          <div><dt>ผู้ยื่น</dt><dd data-testid="verify-applicant">{result.applicantMasked}</dd></div>
          <div><dt>บริการ</dt><dd data-testid="verify-service">{`${result.serviceId} ${SERVICE_NAMES[result.serviceId] ?? ''}`.trim()}</dd></div>
          <div>
            <dt>วันออกเอกสาร</dt>
            <dd><time data-testid="verify-issued" data-iso={result.issuedAt} dateTime={result.issuedAt}>{formatThaiDateTime(result.issuedAt)}</time></dd>
          </div>
          <div>
            <dt>ใช้ได้ถึง</dt>
            <dd><time data-testid="verify-expires" data-iso={result.validUntil} dateTime={result.validUntil}>{formatThaiDate(result.validUntil)}</time></dd>
          </div>
          <div><dt>ผู้ลงนาม</dt><dd data-testid="verify-signer">{result.signer}</dd></div>
        </dl>
      )}
      {result.result === 'TAMPERED' && (
        <p>ข้อมูลเอกสารไม่ตรงกับลายเซ็นดิจิทัล กรุณาติดต่อเทศบาลเพื่อตรวจสอบ</p>
      )}
      <Link href="/login" className="button secondary">กลับสู่บ้านบริการ</Link>
    </EntryLayout>
  );
}
