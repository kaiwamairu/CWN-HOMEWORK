import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { CaseStatus } from '../../../../components/CaseStatus';
import { RoleLayout } from '../../../../components/RoleLayout';
import { SlaDue, SlaLevel } from '../../../../components/SlaLevel';
import { CitizenCaseActions } from '../../../../components/citizen/CitizenCaseActions';
import styles from '../../../../components/citizen/CitizenFlow.module.css';
import { CivicIllustration } from '../../../../components/illustrations/CivicIllustration';
import { SERVICE_NAMES } from '../../../../lib/roles';
import { NO_REFUND_TEXT, readCitizenCaseView } from '../../../../server/domain/cases';
import { formatThaiDateTime } from '../../../../server/domain/sla';
import { pageSession } from '../../../../server/page-session';

export const dynamic = 'force-dynamic';

const DOC_LABELS: Record<string, string> = {
  'id-card': 'บัตรประชาชน',
  map: 'แผนที่ตั้ง',
  'site-photo': 'ภาพสถานที่',
  plan: 'แบบแปลน',
  deed: 'โฉนด',
  extra: 'เอกสารเพิ่มเติม',
};

const EVENT_LABELS: Record<string, string> = {
  PAYMENT: 'ชำระเงินและส่งคำขอ',
  CLAIM: 'เจ้าหน้าที่รับเรื่อง',
  RETURN: 'ตีกลับให้แก้ไขเอกสาร',
  RESUBMIT: 'ส่งแก้ไขเอกสารแล้ว',
  FORWARD: 'ส่งต่อขั้นถัดไป',
  APPROVE: 'อนุมัติ',
  APPROVED: 'อนุมัติ',
  REJECT: 'ไม่อนุมัติ',
  REJECTED: 'ไม่อนุมัติ',
  ISSUE: 'ออกเอกสาร',
  COMPLETED: 'ออกเอกสารแล้ว',
  CANCEL: 'ยกเลิกคำขอ',
  CANCELLED: 'ยกเลิกคำขอ',
  AUTO_CANCEL: 'ยกเลิกอัตโนมัติ (พ้นเวลาแก้ไข 168 ชั่วโมง)',
};

const SERVICE_ART = { 'SV-01': 'art-certificate', 'SV-02': 'art-shop', 'SV-03': 'art-house' } as const;

function formatBytes(size: number): string {
  return size < 1024 ? `${size} B` : `${(size / 1024).toLocaleString('en-US', { maximumFractionDigits: 1 })} KB`;
}

/** Public origin as the browser sees it, for `doc-qr` `data-url` = `<BASE_URL>/verify/<code>`. */
async function baseUrl(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get('x-forwarded-host') ?? incoming.get('host') ?? '127.0.0.1:3000';
  const proto = incoming.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http';
  return `${proto}://${host}`;
}

export default async function CitizenCasePage({ params }: { params: Promise<{ caseNo: string }> }) {
  const { caseNo } = await params;
  const { ctx, actor } = await pageSession(`/citizen/cases/${encodeURIComponent(caseNo)}`);
  if (!actor) notFound();
  const view = readCitizenCaseView(ctx, actor, caseNo);
  if (!view) notFound();
  const { detail } = view;
  const verifyUrl = detail.verifyCode ? `${await baseUrl()}/verify/${detail.verifyCode}` : null;
  const qrSvg = verifyUrl ? await QRCode.toString(verifyUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null;
  const closed = detail.status === 'REJECTED' || detail.status === 'CANCELLED';

  return (
    <RoleLayout actor={actor} active="/citizen">
      <div className="content-pad">
        <div className="page-heading">
          <div>
            <span className="eyebrow">รายละเอียดคำขอของฉัน</span>
            <div className={styles.caseHeading}>
              <h1 className="mono" data-testid="case-no">{detail.caseNo}</h1>
              <CaseStatus status={detail.status} />
            </div>
            <p data-testid="case-service">{detail.serviceId} {SERVICE_NAMES[detail.serviceId] ?? ''}</p>
          </div>
          <CivicIllustration symbol={SERVICE_ART[detail.serviceId]} size={92} />
        </div>

        <div className={styles.caseLayout}>
          <div className={styles.column}>
            {detail.status === 'NEED_FIX' && (
              <section className={`panel ${styles.fixPanel}`} aria-labelledby="fix-title">
                <h2 id="fix-title">เจ้าหน้าที่ขอให้แก้ไขเอกสาร</h2>
                {view.returnReason && <p className={styles.reason} data-testid="return-reason-display">{view.returnReason}</p>}
                {detail.fixDeadline && (
                  <p>
                    ส่งแก้ไขได้ก่อน{' '}
                    <time className={styles.deadline} data-testid="fix-deadline" data-iso={detail.fixDeadline} dateTime={detail.fixDeadline}>
                      {formatThaiDateTime(detail.fixDeadline)}
                    </time>
                  </p>
                )}
                <p className={styles.muted}>ระหว่างรอแก้ไขระบบหยุดนับเวลาให้บริการ หากพ้นเส้นตาย คำขอจะถูกยกเลิกอัตโนมัติ</p>
              </section>
            )}

            <section className="panel" aria-labelledby="case-facts-title">
              <h2 id="case-facts-title">ข้อมูลคำขอ</h2>
              <dl className={`document-facts ${styles.facts}`}>
                {view.stepLabel && <div><dt>ขั้นตอน</dt><dd data-testid="case-step">{view.stepLabel}</dd></div>}
                <div><dt>ผู้ยื่น</dt><dd>{detail.applicantName}</dd></div>
                {view.idFull && <div><dt>เลขบัตรประชาชน</dt><dd className="mono" data-testid="case-id-full">{view.idFull}</dd></div>}
                <div><dt>ค่าธรรมเนียม</dt><dd data-testid="case-fee">฿{detail.fee.toLocaleString('en-US')}</dd></div>
                <div><dt>ชำระเมื่อ</dt><dd><time dateTime={detail.paidAt}>{formatThaiDateTime(detail.paidAt)}</time></dd></div>
                <div><dt>กำหนดเสร็จ</dt><dd><SlaDue dueAt={detail.dueAt} /></dd></div>
                <div><dt>ระดับ SLA</dt><dd><SlaLevel level={detail.slaLevel} /></dd></div>
                {detail.closedAt && (detail.status === 'COMPLETED' || detail.status === 'REJECTED') && (
                  <div>
                    <dt>ปิดงานเมื่อ</dt>
                    <dd><time data-testid="closed-at" data-iso={detail.closedAt} dateTime={detail.closedAt}>{formatThaiDateTime(detail.closedAt)}</time></dd>
                  </div>
                )}
              </dl>
              {closed && <p className={styles.notice} data-testid="no-refund-note">{NO_REFUND_TEXT}</p>}
            </section>

            {detail.docNo && detail.verifyCode && verifyUrl && (
              <section className="panel" aria-labelledby="case-document-title">
                <h2 id="case-document-title">เอกสารที่ออกให้</h2>
                <div className={styles.documentBox}>
                  <div
                    className={styles.qrImage}
                    data-testid="doc-qr"
                    data-url={verifyUrl}
                    role="img"
                    aria-label={`QR สำหรับตรวจสอบเอกสาร ${detail.docNo}`}
                    dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
                  />
                  <dl className={styles.facts}>
                    <div><dt>เลขเอกสาร</dt><dd className="mono" data-testid="doc-no">{detail.docNo}</dd></div>
                    <div><dt>รหัสตรวจสอบ</dt><dd className="mono" data-testid="verify-code">{detail.verifyCode}</dd></div>
                  </dl>
                </div>
                {view.own && (
                  <a className="button primary" data-testid="download-doc-btn" href={`/api/documents/${encodeURIComponent(detail.docNo)}/pdf`} download={`${detail.docNo}.pdf`}>
                    ดาวน์โหลดเอกสาร
                  </a>
                )}
              </section>
            )}

            <section className="panel" aria-labelledby="case-files-title">
              <h2 id="case-files-title">เอกสารแนบ</h2>
              {view.files.length === 0 ? (
                <p className={styles.muted}>ไม่มีเอกสารแนบ</p>
              ) : (
                <ul className={styles.fileList}>
                  {view.files.map(file => (
                    <li key={file.fileId} data-testid="doc-item" data-name={file.name} data-file-id={file.fileId}>
                      <span>
                        <strong>{DOC_LABELS[file.docKey] ?? file.docKey}</strong>
                        <span className={styles.muted}>{file.name} · {formatBytes(file.size)}</span>
                      </span>
                      <a data-testid="doc-download-link" href={`/api/files/${encodeURIComponent(file.fileId)}`} download={file.name}>ดาวน์โหลด</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className={styles.column}>
            {view.own && <CitizenCaseActions caseNo={detail.caseNo} canCancel={view.can.cancel} canResubmit={view.can.resubmit} />}

            <section className="panel" aria-labelledby="case-timeline-title">
              <h2 id="case-timeline-title">ไทม์ไลน์</h2>
              <ol className={styles.timeline} data-testid="case-timeline">
                {view.timeline.map(entry => (
                  <li key={entry.id} data-testid="timeline-item" data-iso={entry.at} data-event={entry.event}>
                    <strong>{EVENT_LABELS[entry.event] ?? entry.event}</strong>
                    <time dateTime={entry.at}>{formatThaiDateTime(entry.at)}{entry.actorName ? ` · ${entry.actorName}` : ''}</time>
                    {entry.note && entry.event !== 'CANCEL' && <p className={styles.muted}>{entry.note}</p>}
                  </li>
                ))}
              </ol>
            </section>

            <Link className="button secondary" href="/citizen" prefetch={false}>กลับรายการคำขอ</Link>
          </div>
        </div>
      </div>
    </RoleLayout>
  );
}
