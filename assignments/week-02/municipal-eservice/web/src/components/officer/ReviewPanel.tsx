'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import type { ReviewPermissions } from '../../server/domain/review';
import styles from './ReviewPanel.module.css';

type Feedback = { error: boolean; message: string } | null;
type Action = 'claim' | 'return' | 'forward';

const FAILURE = 'ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง';
const SUCCESS: Record<Action, string> = {
  claim: 'รับเรื่องสำเร็จ',
  return: 'ตีกลับคำขอให้ประชาชนแก้ไขแล้ว',
  forward: 'ส่งต่อคำขอแล้ว',
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

/** Client copy of the review.ts formatter; the full number stays in component state only. */
function formatIdentity(idNo: string): string {
  return /^\d{13}$/.test(idNo)
    ? `${idNo[0]}-${idNo.slice(1, 5)}-${idNo.slice(5, 10)}-${idNo.slice(10, 12)}-${idNo[12]}`
    : idNo;
}

/** `applicant-id` (masked) with the reasoned, transient `full-id` reveal (FR-21, A-32). */
export function IdentityReveal({ caseNo, idMasked, canUnmask }: { caseNo: string; idMasked: string; canUnmask: boolean }) {
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fullId, setFullId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await post(`/api/officer/cases/${encodeURIComponent(caseNo)}/unmask`, { reason });
      if (!ok || typeof data.idNo !== 'string') {
        setError(typeof data.message === 'string' ? data.message : FAILURE);
        return;
      }
      setFullId(formatIdentity(data.idNo));
      setOpen(false);
      setReason('');
    } catch {
      setError(FAILURE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.identity}>
      <span className="mono" data-testid="applicant-id">{idMasked}</span>
      {fullId && (
        <span className={styles.fullId}>
          เลขเต็ม <strong className="mono" data-testid="full-id">{fullId}</strong>
        </span>
      )}
      {canUnmask && !fullId && (
        <button
          type="button"
          className={`button secondary ${styles.compact}`}
          data-testid="show-full-id-btn"
          aria-expanded={open}
          aria-controls={`${reasonId}-form`}
          onClick={() => { setOpen(true); setError(null); }}
        >
          แสดงเลขเต็ม
        </button>
      )}
      {canUnmask && open && !fullId && (
        <form id={`${reasonId}-form`} className={styles.inlineForm} onSubmit={submit} noValidate>
          <label className={styles.label} htmlFor={reasonId}>เหตุผลที่ขอดูเลขเต็ม (บันทึกใน Audit)</label>
          <input
            id={reasonId}
            className={styles.input}
            data-testid="unmask-reason"
            value={reason}
            maxLength={1000}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${reasonId}-error` : undefined}
            onChange={event => setReason(event.currentTarget.value)}
          />
          {error && <p id={`${reasonId}-error`} role="alert" className={styles.fieldError} data-testid="unmask-error">{error}</p>}
          <div className={styles.row}>
            <button type="submit" className="button primary" data-testid="unmask-submit" disabled={busy}>ยืนยัน</button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>ยกเลิก</button>
          </div>
        </form>
      )}
    </div>
  );
}

interface PanelProps {
  caseNo: string;
  can: Pick<ReviewPermissions, 'claim' | 'return' | 'forward'>;
  returnCount: number;
  returnLimit: number;
  /** B10 decision/issuance controls mounted by B14; rendered after the review actions. */
  children?: ReactNode;
}

/** Holder actions: claim, return with reason, fixed-route forward with optional note. */
export function ReviewPanel({ caseNo, can, returnCount, returnLimit, children }: PanelProps) {
  const router = useRouter();
  const ids = useId();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const busy = running !== null || pending;
  const base = `/api/officer/cases/${encodeURIComponent(caseNo)}`;

  async function run(action: Action, body?: Record<string, string>) {
    setRunning(action);
    setFeedback(null);
    setReasonError(null);
    try {
      const { ok, data } = await post(`${base}/${action}`, body);
      const message = typeof data.message === 'string' ? data.message : FAILURE;
      if (!ok) {
        if (data.code === 'REASON_TOO_SHORT') setReasonError(message);
        else setFeedback({ error: true, message });
        if (data.code === 'ALREADY_CLAIMED' || data.code === 'INVALID_STATE' || data.code === 'RETURN_LIMIT') {
          startTransition(() => router.refresh());
        }
        return;
      }
      setFeedback({ error: false, message: SUCCESS[action] });
      if (action === 'return') { setReturnOpen(false); setReason(''); }
      if (action === 'forward') setNote('');
      startTransition(() => router.refresh());
    } catch {
      setFeedback({ error: true, message: FAILURE });
    } finally {
      setRunning(null);
    }
  }

  const hasReviewActions = can.claim || can.return || can.forward;
  if (!hasReviewActions && !children && !feedback) return null;

  return (
    <section className={`panel ${styles.panel}`} aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className={styles.title}>ดำเนินการ</h2>
      {feedback && (
        <p
          role={feedback.error ? 'alert' : 'status'}
          data-testid={feedback.error ? 'action-error' : 'action-success'}
          className={feedback.error ? styles.error : styles.success}
        >
          {feedback.message}
        </p>
      )}

      {can.claim && (
        <button type="button" className="button primary" data-testid="claim-btn" disabled={busy} onClick={() => void run('claim')}>
          รับเรื่อง
        </button>
      )}

      {can.forward && (
        <form
          className={styles.block}
          onSubmit={event => { event.preventDefault(); void run('forward', note.trim() ? { note } : undefined); }}
        >
          <label className={styles.label} htmlFor={`${ids}-note`}>
            หมายเหตุส่งต่อ <span className={styles.optional}>(ไม่บังคับ)</span>
          </label>
          <textarea
            id={`${ids}-note`}
            className={styles.input}
            data-testid="forward-note"
            rows={2}
            maxLength={1000}
            value={note}
            onChange={event => setNote(event.currentTarget.value)}
          />
          <p className={styles.hint}>ระบบส่งต่อไปยังขั้นถัดไปตามบริการโดยอัตโนมัติ</p>
          <button type="submit" className="button primary" data-testid="forward-btn" disabled={busy}>ผ่าน/ส่งต่อ</button>
        </form>
      )}

      {can.return && (
        <div className={styles.block}>
          <button
            type="button"
            className="button secondary"
            data-testid="return-btn"
            aria-expanded={returnOpen}
            aria-controls={`${ids}-return`}
            disabled={busy}
            onClick={() => { setReturnOpen(true); setReasonError(null); }}
          >
            ตีกลับ
          </button>
          <span className={styles.hint}>ตีกลับแล้ว {returnCount} จาก {returnLimit} ครั้ง</span>
          {returnOpen && (
            <form
              id={`${ids}-return`}
              className={styles.inlineForm}
              noValidate
              onSubmit={event => { event.preventDefault(); void run('return', { reason }); }}
            >
              <label className={styles.label} htmlFor={`${ids}-reason`}>เหตุผลที่ตีกลับ (อย่างน้อย 10 ตัวอักษร)</label>
              <textarea
                id={`${ids}-reason`}
                className={styles.input}
                data-testid="return-reason"
                rows={3}
                maxLength={1000}
                value={reason}
                autoFocus
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={reasonError ? `${ids}-reason-error` : undefined}
                onChange={event => setReason(event.currentTarget.value)}
              />
              {reasonError && (
                <p id={`${ids}-reason-error`} role="alert" className={styles.fieldError} data-testid="return-reason-error">{reasonError}</p>
              )}
              <div className={styles.row}>
                <button type="submit" className="button primary" data-testid="return-submit" disabled={busy}>ยืนยันตีกลับ</button>
                <button type="button" className="button secondary" disabled={busy} onClick={() => { setReturnOpen(false); setReasonError(null); }}>
                  ยกเลิก
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {children}
    </section>
  );
}
