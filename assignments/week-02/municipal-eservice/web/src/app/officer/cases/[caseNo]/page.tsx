import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CaseStatus } from '../../../../components/CaseStatus';
import { officerCaseSlots } from '../../../../components/CaseDetail';
import { RoleLayout } from '../../../../components/RoleLayout';
import { SlaDue, SlaLevel } from '../../../../components/SlaLevel';
import { CivicIllustration } from '../../../../components/illustrations/CivicIllustration';
import { IdentityReveal, ReviewPanel } from '../../../../components/officer/ReviewPanel';
import styles from '../../../../components/officer/ReviewPanel.module.css';
import { SERVICE_NAMES } from '../../../../lib/roles';
import { countNotifications } from '../../../../server/domain/notifications';
import { readOfficerCase } from '../../../../server/domain/review';
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
  RESUBMIT: 'ประชาชนส่งแก้ไข',
  FORWARD: 'ส่งต่อขั้นถัดไป',
  APPROVE: 'อนุมัติ',
  APPROVED: 'อนุมัติ',
  REJECT: 'ไม่อนุมัติ',
  REJECTED: 'ไม่อนุมัติ',
  ISSUE: 'ออกเอกสาร',
  COMPLETED: 'ออกเอกสารแล้ว',
  CANCEL: 'ประชาชนยกเลิกคำขอ',
  CANCELLED: 'ยกเลิกคำขอ',
  AUTO_CANCEL: 'ยกเลิกอัตโนมัติ (พ้นเวลาแก้ไข)',
};

function formatBytes(size: number): string {
  return size < 1024 ? `${size} B` : `${(size / 1024).toLocaleString('en-US', { maximumFractionDigits: 1 })} KB`;
}

export default async function OfficerCasePage({ params }: { params: Promise<{ caseNo: string }> }) {
  const { caseNo } = await params;
  const { ctx, actor } = await pageSession(`/officer/cases/${encodeURIComponent(caseNo)}`);
  if (!actor) notFound();
  const view = readOfficerCase(ctx, actor, caseNo);
  if (!view) notFound();
  const home = actor.role === 'head' ? '/head/approvals' : '/officer/queue';

  // B14 integration: B10 decision/issuance controls and document links (handoffs/B08-review.md §4).
  const { decisionControls, documentLinks }: { decisionControls: ReactNode; documentLinks: ReactNode } = officerCaseSlots(ctx.db, actor, view.caseNo);

  return (
    <RoleLayout actor={actor} active={home} bellCount={countNotifications(ctx.db, actor.userId)}>
      <div className="content-pad">
        <div className="page-heading">
          <div>
            <span className="eyebrow">รายละเอียดคำขอ</span>
            <div className={styles.heading}>
              <h1 className="mono" data-testid="case-no">{view.caseNo}</h1>
              <CaseStatus status={view.status} />
            </div>
            <p data-testid="case-service">{view.serviceId} {SERVICE_NAMES[view.serviceId] ?? ''}</p>
          </div>
          <CivicIllustration symbol="art-folder" size={92} />
        </div>

        <div className={styles.layout}>
          <div className={styles.column}>
            <section className="panel" aria-labelledby="case-facts-title">
              <h2 id="case-facts-title">ข้อมูลคำขอ</h2>
              <dl className={`document-facts ${styles.facts}`}>
                {view.stepLabel && (
                  <div><dt>ขั้นตอน</dt><dd data-testid="case-step">{view.stepLabel}</dd></div>
                )}
                <div><dt>ผู้ยื่น</dt><dd data-testid="applicant-name">{view.applicantName}</dd></div>
                <div>
                  <dt>เลขบัตรประชาชน</dt>
                  <dd><IdentityReveal caseNo={view.caseNo} idMasked={view.idMasked} canUnmask={view.can.unmask} /></dd>
                </div>
                <div><dt>ค่าธรรมเนียม</dt><dd data-testid="case-fee">฿{view.fee.toLocaleString('en-US')}</dd></div>
                <div><dt>กำหนดเสร็จ</dt><dd><SlaDue dueAt={view.dueAt} /></dd></div>
                <div><dt>ระดับ SLA</dt><dd><SlaLevel level={view.slaLevel} /></dd></div>
                {view.closedAt && (
                  <div>
                    <dt>ปิดงานเมื่อ</dt>
                    <dd><time data-testid="closed-at" data-iso={view.closedAt} dateTime={view.closedAt}>{formatThaiDateTime(view.closedAt)}</time></dd>
                  </div>
                )}
                <div><dt>ผู้ถือเรื่อง</dt><dd data-testid="case-owner">{view.owner ?? 'ยังไม่มีผู้รับ'}</dd></div>
                <div><dt>ตีกลับแล้ว</dt><dd><span data-testid="return-count">{view.returnCount}</span> ครั้ง</dd></div>
              </dl>
            </section>

            <section className="panel" aria-labelledby="case-files-title">
              <h2 id="case-files-title">เอกสารแนบ</h2>
              {!view.can.files ? (
                <p className={styles.empty}>เอกสารแนบเปิดได้เฉพาะแผนกที่คำขอผ่านและหัวหน้าฝ่าย</p>
              ) : view.files.length === 0 ? (
                <p className={styles.empty}>ไม่มีเอกสารแนบ</p>
              ) : (
                <ul className={styles.files}>
                  {view.files.map(file => (
                    <li key={file.fileId} data-testid="doc-item" data-name={file.name} data-file-id={file.fileId}>
                      <span>
                        <strong>{DOC_LABELS[file.docKey] ?? file.docKey}</strong>
                        <span className={styles.meta}>{file.name} · {formatBytes(file.size)}</span>
                      </span>
                      <a data-testid="doc-download-link" href={`/api/files/${encodeURIComponent(file.fileId)}`} download={file.name}>
                        ดาวน์โหลด
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" aria-labelledby="case-timeline-title">
              <h2 id="case-timeline-title">ไทม์ไลน์</h2>
              <ol className={styles.timeline} data-testid="case-timeline">
                {view.timeline.map(entry => (
                  <li key={entry.id} data-testid="timeline-item" data-iso={entry.at} data-event={entry.event}>
                    <strong>{EVENT_LABELS[entry.event] ?? entry.event}</strong>
                    <time dateTime={entry.at}>{formatThaiDateTime(entry.at)}{entry.actor ? ` · ${entry.actor}` : ''}</time>
                    {entry.note && <p className={styles.note}>{entry.note}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className={styles.column}>
            <ReviewPanel caseNo={view.caseNo} can={view.can} returnCount={view.returnCount} returnLimit={view.returnLimit}>
              {decisionControls}
            </ReviewPanel>
            {documentLinks}
            <Link className="button secondary" href={home} prefetch={false}>กลับรายการ</Link>
          </div>
        </div>
      </div>
    </RoleLayout>
  );
}
