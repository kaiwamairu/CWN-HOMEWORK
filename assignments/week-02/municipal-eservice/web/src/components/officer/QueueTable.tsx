'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition, type ReactNode } from 'react';
import { SERVICE_NAMES } from '../../lib/roles';
import type { QueueFilter, QueueItem } from '../../server/domain/claims';
import styles from './QueueTable.module.css';

type RenderedRow = Omit<QueueItem, 'dueAt' | 'step'> & {
  statusBadge: ReactNode;
  dueTime: ReactNode;
  slaBadge: ReactNode;
};

interface Props {
  rows: RenderedRow[];
  filter: QueueFilter;
  workloadCount: number | null;
}

const QUEUE_PATH = '/officer/queue';
const CLAIM_FAILURE = 'รับเรื่องไม่สำเร็จ กรุณาลองอีกครั้ง';
const COLUMNS = ['เลขคำขอ', 'บริการ', 'ผู้ยื่น', 'เลขบัตรประชาชน', 'สถานะ', 'กำหนดเสร็จ', 'ระดับ SLA', 'ผู้รับเรื่อง'];

export function QueueTable({ rows, filter, workloadCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, select] = useOptimistic(filter);
  const [claiming, setClaiming] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const isOfficer = workloadCount !== null;
  const busy = claiming || pending;

  function changeFilter(value: QueueFilter) {
    setFeedback(null);
    startTransition(() => {
      select(value);
      router.replace(`${QUEUE_PATH}?filter=${value}`, { scroll: false });
    });
  }

  async function claim(caseNo: string) {
    setClaiming(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/officer/cases/${encodeURIComponent(caseNo)}/claim`, { method: 'POST' });
      if (!response.ok) {
        const body = await response.json() as { code?: string; message?: string };
        setFeedback({ error: true, message: body.message ?? CLAIM_FAILURE });
        if (body.code === 'ALREADY_CLAIMED') startTransition(() => router.refresh());
        return;
      }
      setFeedback({ error: false, message: 'รับเรื่องสำเร็จ' });
      startTransition(() => router.refresh());
    } catch {
      setFeedback({ error: true, message: CLAIM_FAILURE });
    } finally {
      setClaiming(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="queue-heading">
      <div className={styles.controls}>
        <form action={QUEUE_PATH} method="get">
          <label className={styles.filter}>
            กรองคิว
            <select
              name="filter"
              data-testid="queue-filter"
              value={selected}
              disabled={claiming}
              onChange={event => changeFilter(event.currentTarget.value as QueueFilter)}
            >
              <option value="all">ทั้งหมด</option>
              <option value="unclaimed">ยังไม่มีผู้รับ</option>
              <option value="mine">ของฉัน</option>
            </select>
          </label>
          <noscript><button className="button secondary" type="submit">ใช้ตัวกรอง</button></noscript>
        </form>
        {isOfficer && (
          <p className={styles.workload} aria-live="polite">
            งานในมือของฉัน <strong data-testid="workload-count">{workloadCount}</strong>
          </p>
        )}
      </div>
      {feedback && (
        <p
          role={feedback.error ? 'alert' : 'status'}
          data-testid={feedback.error ? 'action-error' : 'action-success'}
          className={feedback.error ? styles.error : styles.success}
        >
          {feedback.message}
        </p>
      )}
      <div className={styles.tableRegion} role="region" aria-label="ตารางคิวงาน" tabIndex={0}>
        <table data-testid="queue-table" className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map(label => <th key={label} scope="col">{label}</th>)}
              {isOfficer && <th scope="col">ดำเนินการ</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.caseNo}
                data-testid="queue-row"
                data-case-no={row.caseNo}
                data-owner={row.owner ?? ''}
                data-status={row.status}
                data-sla-level={row.slaLevel}
              >
                <th scope="row" data-testid="row-case-no">
                  <Link className="text-link mono" prefetch={false} href={`/officer/cases/${encodeURIComponent(row.caseNo)}`}>
                    {row.caseNo}
                  </Link>
                </th>
                <td data-testid="row-service" className={styles.service}>{SERVICE_NAMES[row.serviceId] ?? row.serviceId}</td>
                <td data-testid="row-applicant">{row.applicantName}</td>
                <td data-testid="row-id-masked" className="mono">{row.idMasked}</td>
                <td>{row.statusBadge}</td>
                <td>{row.dueTime}</td>
                <td>{row.slaBadge}</td>
                <td data-testid="row-owner">{row.owner ?? ''}</td>
                {isOfficer && (
                  <td>
                    {row.status !== 'APPROVED' && row.owner === null && (
                      <button
                        type="button"
                        className="button primary"
                        data-testid="claim-btn"
                        aria-label={`รับเรื่อง ${row.caseNo}`}
                        disabled={busy}
                        onClick={() => void claim(row.caseNo)}
                      >
                        รับเรื่อง
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="empty-state" data-testid="queue-empty">ไม่มีงานในคิว</p>}
    </section>
  );
}
