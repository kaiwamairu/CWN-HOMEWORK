'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import type { DecisionPermissions } from '../../server/domain/approvals';
import styles from '../officer/ReviewPanel.module.css';

type Action = 'approve' | 'reject' | 'issue';
type Feedback = { error: boolean; message: string } | null;

const FAILURE = 'ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง';
const SUCCESS: Record<Action, string> = {
  approve: 'อนุมัติคำขอแล้ว',
  reject: 'บันทึกผลไม่อนุมัติแล้ว',
  issue: 'ออกเอกสารแล้ว',
};

async function post(path: string, body?: Record<string, string>) {
  const response = await fetch(path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: response.ok, data };
}

/**
 * `approve-btn`, `reject-btn` + reason form, and `issue-btn` for `/officer/cases/:caseNo`.
 * Only buttons allowed by `decisionPermissions()` render; the server still decides every call.
 */
export function DecisionControls({ caseNo, can }: { caseNo: string; can: DecisionPermissions }) {
  const router = useRouter();
  const ids = useId();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const busy = running !== null || pending;
  const encoded = encodeURIComponent(caseNo);

  async function run(action: Action) {
    setRunning(action);
    setFeedback(null);
    setReasonError(null);
    try {
      const path = action === 'issue' ? `/api/officer/cases/${encoded}/issue` : `/api/cases/${encoded}/${action}`;
      const { ok, data } = await post(path, action === 'reject' ? { reason } : undefined);
      const message = typeof data.message === 'string' ? data.message : FAILURE;
      if (!ok) {
        if (data.code === 'REASON_TOO_SHORT') setReasonError(message);
        else setFeedback({ error: true, message });
        if (data.code === 'INVALID_STATE' || data.code === 'FORBIDDEN') startTransition(() => router.refresh());
        return;
      }
      setFeedback({ error: false, message: SUCCESS[action] });
      if (action === 'reject') { setRejectOpen(false); setReason(''); }
      startTransition(() => router.refresh());
    } catch {
      setFeedback({ error: true, message: FAILURE });
    } finally {
      setRunning(null);
    }
  }

  if (!can.approve && !can.reject && !can.issue && !feedback) return null;

  return (
    <div className={styles.block} aria-label="ผลพิจารณาและออกเอกสาร" role="group">
      {feedback && (
        <p
          role={feedback.error ? 'alert' : 'status'}
          data-testid={feedback.error ? 'action-error' : 'action-success'}
          className={feedback.error ? styles.error : styles.success}
        >
          {feedback.message}
        </p>
      )}

      {(can.approve || can.reject) && (
        <div className={styles.row}>
          {can.approve && (
            <button type="button" className="button primary" data-testid="approve-btn" disabled={busy} onClick={() => void run('approve')}>
              อนุมัติ
            </button>
          )}
          {can.reject && (
            <button
              type="button"
              className="button secondary"
              data-testid="reject-btn"
              aria-expanded={rejectOpen}
              aria-controls={`${ids}-reject`}
              disabled={busy}
              onClick={() => { setRejectOpen(true); setReasonError(null); }}
            >
              ไม่อนุมัติ
            </button>
          )}
        </div>
      )}

      {can.reject && rejectOpen && (
        <form
          id={`${ids}-reject`}
          className={styles.inlineForm}
          noValidate
          onSubmit={event => { event.preventDefault(); void run('reject'); }}
        >
          <label className={styles.label} htmlFor={`${ids}-reason`}>เหตุผลที่ไม่อนุมัติ (อย่างน้อย 10 ตัวอักษร)</label>
          <textarea
            id={`${ids}-reason`}
            className={styles.input}
            data-testid="reject-reason"
            rows={3}
            maxLength={1000}
            value={reason}
            autoFocus
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? `${ids}-reason-error` : `${ids}-refund`}
            onChange={event => setReason(event.currentTarget.value)}
          />
          {reasonError && (
            <p id={`${ids}-reason-error`} role="alert" className={styles.fieldError} data-testid="reject-reason-error">{reasonError}</p>
          )}
          <p id={`${ids}-refund`} className={styles.hint}>ค่าธรรมเนียมที่ชำระแล้วไม่คืน</p>
          <div className={styles.row}>
            <button type="submit" className="button primary" data-testid="reject-submit" disabled={busy}>ยืนยันไม่อนุมัติ</button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => { setRejectOpen(false); setReasonError(null); }}>
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {can.issue && (
        <div className={styles.block}>
          <p className={styles.hint}>ออกเอกสารดิจิทัลพร้อมลายเซ็นจำลองและรหัสตรวจสอบ</p>
          <button type="button" className="button primary" data-testid="issue-btn" disabled={busy} onClick={() => void run('issue')}>
            ออกเอกสาร
          </button>
        </div>
      )}
    </div>
  );
}
