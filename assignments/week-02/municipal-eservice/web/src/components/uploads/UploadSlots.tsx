'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import type { DocKey, UploadFile, UploadSlot } from '../../server/domain/uploads.ts';
import styles from './UploadSlots.module.css';

interface UploadSlotsProps {
  draftId: string;
  slots: readonly UploadSlot[];
  files: readonly UploadFile[];
  onFilesChange: (files: UploadFile[]) => void;
  onContinue: () => void;
  disabled?: boolean;
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.message === 'string' ? body.message : fallback;
}

export function UploadSlots({ draftId, slots, files, onFilesChange, onContinue, disabled }: UploadSlotsProps) {
  const id = useId();
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const restoreFocus = useRef<HTMLInputElement | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const path = `/api/drafts/${encodeURIComponent(draftId)}/files`;
  const missing = slots.filter(slot => slot.required && !files.some(file => file.docKey === slot.key));
  const locked = busy || disabled;

  useEffect(() => {
    inputs.current.get('id-card')?.focus();
  }, []);

  useEffect(() => {
    if (!locked && restoreFocus.current) {
      if (document.activeElement === document.body) restoreFocus.current.focus();
      restoreFocus.current = undefined;
    }
  }, [locked]);

  async function upload(event: ChangeEvent<HTMLInputElement>, docKey: DocKey) {
    const input = event.currentTarget;
    const selected = Array.from(input.files ?? []);
    input.value = '';
    if (!selected.length) return;

    setBusy(true);
    setError('');
    restoreFocus.current = input;
    const updatedFiles = [...files];
    const fallback = 'แนบไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง';
    let firstError = '';
    try {
      for (const file of selected) {
        const body = new FormData();
        body.set('file', file);
        body.set('docKey', docKey);
        const response = await fetch(path, { method: 'POST', body });
        if (response.ok) {
          updatedFiles.push(await response.json() as UploadFile);
        } else {
          const message = await responseMessage(response, fallback);
          firstError ||= message;
        }
      }
    } catch {
      firstError ||= fallback;
    } finally {
      if (updatedFiles.length !== files.length) onFilesChange(updatedFiles);
      setError(firstError);
      setBusy(false);
    }
  }

  async function remove(file: UploadFile) {
    setBusy(true);
    setError('');
    restoreFocus.current = inputs.current.get(file.docKey);
    const fallback = 'ลบไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง';
    try {
      const response = await fetch(`${path}/${encodeURIComponent(file.fileId)}`, { method: 'DELETE' });
      if (response.ok) {
        onFilesChange(files.filter(item => item.fileId !== file.fileId));
      } else {
        setError(await responseMessage(response, fallback));
      }
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.uploads}>
      <p className={styles.hint} id={`${id}-hint`}>PDF, JPG หรือ PNG ขนาดไม่เกิน 5 MB ต่อไฟล์ แนบได้รวม 5 ไฟล์</p>
      <div className={styles.slots}>
        {slots.map(({ key, label, required }) => {
          const inputId = `${id}-${key}`;
          const pdfOnly = key === 'plan';
          return (
            <div className={styles.slot} key={key}>
              <label htmlFor={inputId}>
                {label}
                {required && <> <span className={styles.required} aria-hidden="true">✱</span><span className="sr-only"> (จำเป็น)</span></>}
              </label>
              {pdfOnly && <p className={styles.hint} id={`${inputId}-hint`}>PDF เท่านั้น</p>}
              <input
                ref={input => {
                  if (input) inputs.current.set(key, input);
                  else inputs.current.delete(key);
                }}
                id={inputId}
                type="file"
                data-testid={`upload-input-${key}`}
                aria-describedby={pdfOnly ? `${inputId}-hint ${id}-hint` : `${id}-hint`}
                multiple={key === 'extra'}
                disabled={locked}
                onChange={event => void upload(event, key)}
              />
            </div>
          );
        })}
      </div>
      {files.length > 0 && (
        <ul className={styles.files} role="list" aria-label="ไฟล์ที่แนบแล้ว">
          {files.map(file => (
            <li key={file.fileId} data-testid="file-item" data-name={file.name} data-doc-key={file.docKey}>
              <span>{file.name}</span>
              <button
                className="button secondary"
                type="button"
                data-testid="file-remove-btn"
                aria-label={`ลบไฟล์ ${file.name}`}
                disabled={locked}
                onClick={() => void remove(file)}
              >
                ลบไฟล์
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className={styles.feedback} data-testid="upload-error">{error}</p>}
      <div aria-live="polite">
        {missing.length > 0 && (
          <p className={styles.feedback} data-testid="missing-docs">
            {`ยังขาดเอกสาร: ${missing.map(slot => slot.label).join(', ')}`}
          </p>
        )}
      </div>
      <button
        className={`button primary ${styles.continue}`}
        type="button"
        data-testid="to-payment-btn"
        disabled={locked || missing.length > 0}
        onClick={onContinue}
      >
        ไปชำระเงิน
      </button>
    </div>
  );
}
