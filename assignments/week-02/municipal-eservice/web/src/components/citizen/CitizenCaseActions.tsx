'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import styles from './CitizenFlow.module.css';

const NO_REFUND_TEXT = 'ค่าธรรมเนียมที่ชำระแล้วไม่คืน';
const NETWORK_ERROR = 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง';

async function messageOf(response: Response): Promise<{ code: string; message: string }> {
  const body = await response.json().catch(() => null) as { code?: unknown; message?: unknown } | null;
  return {
    code: typeof body?.code === 'string' ? body.code : '',
    message: typeof body?.message === 'string' ? body.message : NETWORK_ERROR,
  };
}

interface CitizenCaseActionsProps {
  caseNo: string;
  /** Render `cancel-case-btn` (unowned SUBMITTED only, CONTRACT §2.6). */
  canCancel: boolean;
  /** Render the correction form (NEED_FIX before the 168-hour deadline). */
  canResubmit: boolean;
}

/** Citizen commands on `/citizen/cases/:caseNo`: cancellation with confirmation and correction resubmission. */
export function CitizenCaseActions({ caseNo, canCancel, canResubmit }: CitizenCaseActionsProps) {
  const router = useRouter();
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const path = `/api/cases/${encodeURIComponent(caseNo)}`;

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  async function submit(work: () => Promise<Response>, success: string, refreshOn: readonly string[] = []) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await work();
      if (response.ok) {
        setConfirming(false);
        setNotice(success);
        router.refresh();
        return;
      }
      const failure = await messageOf(response);
      setError(failure.message);
      // State moved underneath the citizen (claimed, auto-cancelled): show the server's current state.
      if (refreshOn.includes(failure.code)) router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  const cancel = () => submit(
    () => fetch(`${path}/cancel`, { method: 'POST' }),
    'ยกเลิกคำขอแล้ว',
    ['CANNOT_CANCEL', 'INVALID_STATE'],
  );

  const resubmit = () => submit(() => {
    const selected = Array.from(fileInput.current?.files ?? []);
    if (!selected.length) return fetch(`${path}/resubmit`, { method: 'POST' });
    const body = new FormData();
    for (const file of selected) body.append('file', file);
    return fetch(`${path}/resubmit`, { method: 'POST', body });
  }, 'ส่งแก้ไขเรียบร้อยแล้ว เจ้าหน้าที่จะตรวจสอบต่อ', ['FIX_WINDOW_EXPIRED', 'INVALID_STATE']);

  if (!canCancel && !canResubmit && !error && !notice) return null;

  return (
    <section className={`panel ${styles.caseActions}`} aria-labelledby={`${id}-actions-title`}>
      <h2 id={`${id}-actions-title`}>ดำเนินการ</h2>
      {error && <p className={styles.alert} role="alert" data-testid="action-error">{error}</p>}
      {notice && <p className={styles.success} role="status" data-testid="action-success">{notice}</p>}

      {canResubmit && (
        <form className={styles.fixForm} onSubmit={event => { event.preventDefault(); void resubmit(); }}>
          <label className={styles.label} htmlFor={`${id}-fix`}>
            แนบไฟล์ที่แก้ไขแล้ว <span className={styles.muted}>(ไม่บังคับ · PDF, JPG หรือ PNG ไม่เกิน 5 MB)</span>
          </label>
          <input ref={fileInput} id={`${id}-fix`} className={styles.fileInput} type="file" multiple data-testid="fix-upload-input" disabled={busy} />
          <button className="button primary" type="submit" data-testid="submit-fix-btn" disabled={busy}>ส่งแก้ไข</button>
        </form>
      )}

      {canCancel && !confirming && (
        <button className="button secondary" type="button" data-testid="cancel-case-btn" disabled={busy}
          onClick={() => { setError(''); setNotice(''); setConfirming(true); }}>
          ยกเลิกคำขอ
        </button>
      )}
      {canCancel && confirming && (
        <div className={styles.confirm} role="alertdialog" aria-modal="false" aria-labelledby={`${id}-confirm-title`} aria-describedby={`${id}-confirm-text`}>
          <h3 id={`${id}-confirm-title`}>ยืนยันการยกเลิกคำขอ</h3>
          <p id={`${id}-confirm-text`} data-testid="cancel-confirm-text">{NO_REFUND_TEXT}</p>
          <div className={styles.actions}>
            <button ref={confirmButton} className="button primary" type="button" data-testid="confirm-cancel-btn" disabled={busy} onClick={() => void cancel()}>
              ยืนยันยกเลิก
            </button>
            <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirming(false)}>
              ไม่ยกเลิก
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
