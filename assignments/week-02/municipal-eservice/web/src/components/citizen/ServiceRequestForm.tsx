'use client';

import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WizardPayment, WizardReceipt } from '../../server/domain/cases';
import { calculateFee, type ServiceFeeRates, type ServiceId } from '../../server/domain/fees';
import { formatThaiDateTime } from '../../server/domain/sla';
import type { UploadFile, UploadSlot } from '../../server/domain/uploads';
import { CivicIllustration } from '../illustrations/CivicIllustration';
import { UploadSlots } from '../uploads/UploadSlots';
import styles from './CitizenFlow.module.css';

type Step = 1 | 2 | 3;
type DraftStatus = 'DRAFT' | 'PENDING_PAYMENT' | 'PAID';

export interface ServiceRequestFormProps {
  service: { id: ServiceId; name: string; rates: ServiceFeeRates };
  slots: readonly UploadSlot[];
  feeBugs: readonly string[];
  draft: { draftId: string; status: DraftStatus; fee: number; qty?: number; areaSqm?: number; files: UploadFile[] } | null;
  payment: WizardPayment | null;
  receipt: WizardReceipt | null;
}

/** CONTRACT §2.5 exact `wizard-step` text. */
const STEP_TEXT: Record<Step, string> = { 1: '1/3 กรอกข้อมูล', 2: '2/3 แนบเอกสาร', 3: '3/3 ชำระเงิน' };
const STEP_TITLES: Record<Step, string> = { 1: 'กรอกข้อมูล', 2: 'แนบเอกสาร', 3: 'ชำระเงิน' };
const PAYMENT_TEXT: Record<WizardPayment['status'], string> = { PENDING: 'รอชำระ', PAID: 'ชำระแล้ว', EXPIRED: 'QR หมดอายุ' };
const QR_EXPIRED_TEXT = 'QR หมดอายุ กรุณาสร้าง QR ใหม่';
const FEE_ERROR_CODES = new Set(['INVALID_QTY', 'INVALID_AREA', 'AREA_TOO_LARGE']);
const SERVICE_ART = { 'SV-01': 'art-certificate', 'SV-02': 'art-shop', 'SV-03': 'art-house' } as const;
const NETWORK_ERROR = 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง';

function baht(amount: number): string {
  return `฿${amount.toLocaleString('en-US')}`;
}

/** Integer text from the input. Blank stays undefined (SV-03 area) and anything else non-integer is NaN. */
function parseInteger(raw: string): number | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  return /^[+-]?\d+$/.test(text) ? Number(text) : Number.NaN;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === 'object' ? body as Record<string, unknown> : {};
}

function messageOf(body: Record<string, unknown>, fallback: string): string {
  return typeof body.message === 'string' ? body.message : fallback;
}

/** Simulated PromptPay QR. The payload only names the reference and amount; nothing is payable. */
function SimulatedQr({ payment }: { payment: WizardPayment }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toString(`SIMULATED-PROMPTPAY|${payment.ref}|${payment.amount}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then(markup => { if (live) setSvg(markup); })
      .catch(() => { if (live) setSvg(''); });
    return () => { live = false; };
  }, [payment.ref, payment.amount]);
  return (
    <div
      className={styles.qrImage}
      data-testid="qr-image"
      role="img"
      aria-label={`QR พร้อมเพย์จำลอง เลขอ้างอิง ${payment.ref} ยอด ${baht(payment.amount)}`}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

export function ServiceRequestForm({ service, slots, feeBugs, draft, payment: initialPayment, receipt: initialReceipt }: ServiceRequestFormProps) {
  const initialStep: Step = draft && draft.status !== 'DRAFT' ? 3 : 1;
  const [step, setStep] = useState<Step>(initialStep);
  const [draftId, setDraftId] = useState<string | null>(draft?.draftId ?? null);
  const [status, setStatus] = useState<DraftStatus | null>(draft?.status ?? null);
  const [lockedFee, setLockedFee] = useState<number | null>(draft && draft.status !== 'DRAFT' ? draft.fee : null);
  const [qty, setQty] = useState(String(draft?.qty ?? 1));
  const [area, setArea] = useState(draft?.areaSqm !== undefined ? String(draft.areaSqm) : '');
  const [areaTouched, setAreaTouched] = useState(draft !== null);
  const [files, setFiles] = useState<UploadFile[]>(draft?.files ?? []);
  const [payment, setPayment] = useState<WizardPayment | null>(initialPayment);
  const [receipt, setReceipt] = useState<WizardReceipt | null>(initialReceipt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [serverFeeError, setServerFeeError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const locked = status === 'PENDING_PAYMENT' || status === 'PAID';
  const paid = status === 'PAID' || payment?.status === 'PAID' || receipt !== null;

  const input = useMemo((): { qty?: number; areaSqm?: number } => service.id === 'SV-01'
    ? { qty: parseInteger(qty) ?? Number.NaN }
    : service.id === 'SV-03' ? { areaSqm: parseInteger(area) } : {}, [service.id, qty, area]);
  const quote = useMemo(() => {
    try {
      return { ok: true as const, fee: calculateFee(service.rates, input, new Set(feeBugs)).fee };
    } catch (caught) {
      return { ok: false as const, message: caught instanceof Error ? caught.message : '' };
    }
  }, [service.rates, input, feeBugs]);

  const fee = locked && lockedFee !== null ? lockedFee : quote.ok ? quote.fee : null;
  const showQuoteError = !locked && !quote.ok && (service.id !== 'SV-03' || areaTouched || area.trim() !== '');
  const feeError = showQuoteError ? quote.message : serverFeeError;
  const inputValid = locked || quote.ok;

  useEffect(() => {
    // Move focus to the new step heading after navigation; step 2 focuses its first upload control itself.
    if (!moved.current) return;
    if (step !== 2) heading.current?.focus();
  }, [step]);

  function goTo(next: Step) {
    moved.current = true;
    setError('');
    setNotice('');
    setStep(next);
  }

  /** Create or update the saved draft; locked drafts are returned unchanged. */
  async function persist(): Promise<string | null> {
    if (locked && draftId) return draftId;
    const fields = service.id === 'SV-01' ? { qty: input.qty } : service.id === 'SV-03' ? { areaSqm: input.areaSqm } : {};
    const response = draftId
      ? await fetch(`/api/drafts/${encodeURIComponent(draftId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
      })
      : await fetch('/api/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceId: service.id, ...fields }),
      });
    const body = await readJson(response);
    if (!response.ok) {
      const message = messageOf(body, NETWORK_ERROR);
      if (FEE_ERROR_CODES.has(String(body.code))) setServerFeeError(message);
      else setError(message);
      return null;
    }
    const id = String(body.draftId);
    if (!draftId) {
      setDraftId(id);
      window.history.replaceState(null, '', `/citizen/new/${service.id}?draft=${encodeURIComponent(id)}`);
    }
    setStatus(typeof body.status === 'string' ? body.status as DraftStatus : 'DRAFT');
    return id;
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    setServerFeeError('');
    try {
      await work();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  const saveDraft = () => run(async () => {
    if (await persist()) setNotice('บันทึกร่างแล้ว กลับมาทำต่อได้จากหน้ารายการคำขอ');
  });

  const toUpload = () => run(async () => {
    if (await persist()) goTo(2);
  });

  const createQr = () => run(async () => {
    if (!draftId) return;
    const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/payment`, { method: 'POST' });
    const body = await readJson(response);
    if (!response.ok) {
      setError(messageOf(body, NETWORK_ERROR));
      return;
    }
    const created: WizardPayment = {
      ref: String(body.ref),
      amount: Number(body.amount),
      status: 'PENDING',
      qrCreatedAt: String(body.qrCreatedAt),
      qrExpiresAt: String(body.qrExpiresAt),
      caseNo: null,
      receiptNo: null,
    };
    setPayment(created);
    setLockedFee(created.amount);
    setStatus('PENDING_PAYMENT');
  });

  const refreshPayment = () => run(async () => {
    if (!payment) return;
    const response = await fetch(`/api/payments/${encodeURIComponent(payment.ref)}`, { cache: 'no-store' });
    const body = await readJson(response);
    if (!response.ok) {
      setError(messageOf(body, NETWORK_ERROR));
      return;
    }
    const latest: WizardPayment = {
      ref: String(body.ref),
      amount: Number(body.amount),
      status: body.status as WizardPayment['status'],
      qrCreatedAt: String(body.qrCreatedAt),
      qrExpiresAt: String(body.qrExpiresAt),
      caseNo: typeof body.caseNo === 'string' ? body.caseNo : null,
      receiptNo: typeof body.receiptNo === 'string' ? body.receiptNo : null,
    };
    setPayment(latest);
    if (latest.status !== 'PAID' || !latest.caseNo || !latest.receiptNo) return;
    // B05: the payment adapter has no paidAt; read it from the owned case (CONTRACT §6.7).
    const caseResponse = await fetch(`/api/cases/${encodeURIComponent(latest.caseNo)}`, { cache: 'no-store' });
    const detail = await readJson(caseResponse);
    setReceipt({
      caseNo: latest.caseNo,
      receiptNo: latest.receiptNo,
      amount: caseResponse.ok ? Number(detail.fee) : latest.amount,
      paidAt: caseResponse.ok ? String(detail.paidAt) : '',
    });
    setStatus('PAID');
  });

  const paymentStatus: WizardPayment['status'] | null = paid ? 'PAID' : payment?.status ?? null;
  const amount = payment?.amount ?? fee;

  return (
    <div className={styles.wizard}>
      <div className={styles.wizardMain}>
        <header className={styles.wizardHeader}>
          <div>
            <span className="eyebrow">ยื่นคำขอออนไลน์ · {service.id}</span>
            <h1 data-testid="service-name">{service.name}</h1>
            <p className={styles.stepText}><span data-testid="wizard-step">{STEP_TEXT[step]}</span></p>
          </div>
          <CivicIllustration symbol={step === 1 ? SERVICE_ART[service.id] : step === 2 ? 'art-folder' : 'art-coins'} size={88} />
        </header>

        <ol className={styles.stepper} aria-label="ขั้นตอนการยื่นคำขอ">
          {([1, 2, 3] as const).map(n => (
            <li key={n} className={n === step ? styles.stepCurrent : n < step ? styles.stepDone : undefined} aria-current={n === step ? 'step' : undefined}>
              <span className={styles.stepNumber} aria-hidden="true">{n}</span>
              <span>{STEP_TITLES[n]}</span>
            </li>
          ))}
        </ol>

        {error && <p className={styles.alert} role="alert" data-testid="action-error">{error}</p>}
        {notice && <p className={styles.success} role="status" data-testid="action-success">{notice}</p>}

        {step === 1 && (
          <section className="panel" aria-labelledby="wizard-step-title">
            <h2 id="wizard-step-title" ref={heading} tabIndex={-1}>ข้อมูลคำขอ</h2>
            {service.id === 'SV-01' && (
              <label className="field">
                จำนวนฉบับ <span className="required-mark" aria-hidden="true">✱</span>
                <input
                  data-testid="qty-input" type="number" inputMode="numeric" min={1} max={5} step={1}
                  value={qty} disabled={locked || busy} aria-invalid={!!feeError}
                  aria-describedby="fee-hint fee-feedback"
                  onChange={event => { setQty(event.currentTarget.value); setServerFeeError(''); }}
                />
              </label>
            )}
            {service.id === 'SV-03' && (
              <label className="field">
                พื้นที่ก่อสร้าง/ต่อเติม (ตร.ม.) <span className="required-mark" aria-hidden="true">✱</span>
                <input
                  data-testid="area-input" type="number" inputMode="numeric" min={1} max={500} step={1}
                  value={area} disabled={locked || busy} aria-invalid={!!feeError}
                  aria-describedby="fee-hint fee-feedback"
                  onChange={event => { setArea(event.currentTarget.value); setAreaTouched(true); setServerFeeError(''); }}
                />
              </label>
            )}
            <p className="field-hint" id="fee-hint">
              {service.id === 'SV-01' && 'ฉบับละ ' + baht(service.rates.fee) + ' ยื่นได้ 1–5 ฉบับ'}
              {service.id === 'SV-02' && 'ค่าธรรมเนียมคงที่ ไม่ต้องกรอกข้อมูลเพิ่ม'}
              {service.id === 'SV-03' && `พื้นที่ 1–100 ตร.ม. ${baht(service.rates.fee_base)} ส่วนที่เกิน 100 ตร.ม. ตารางเมตรละ ${baht(service.rates.fee_per_sqm)}`}
              {locked && ' · ค่าธรรมเนียมถูกตรึงแล้วเมื่อสร้าง QR'}
            </p>
            <div className={styles.feeRow}>
              <span>ค่าธรรมเนียม</span>
              <strong data-testid="fee-total">{fee === null ? '–' : baht(fee)}</strong>
            </div>
            <div id="fee-feedback" aria-live="polite">
              {feeError && <p className="field-error" data-testid="fee-error">{feeError}</p>}
            </div>
            {draftId && <p className={styles.draftLine}>รหัสร่าง <strong className="mono" data-testid="draft-id">{draftId}</strong></p>}
            <div className={styles.actions}>
              {!locked && (
                <button className="button secondary" type="button" data-testid="save-draft-btn" disabled={busy || !inputValid} onClick={() => void saveDraft()}>
                  บันทึกร่าง
                </button>
              )}
              <button className="button primary" type="button" data-testid="to-upload-btn" disabled={busy || !inputValid} onClick={() => void toUpload()}>
                ถัดไป: แนบเอกสาร
              </button>
            </div>
          </section>
        )}

        {step === 2 && draftId && (
          <section className="panel" aria-labelledby="wizard-step-title">
            <h2 id="wizard-step-title" ref={heading} tabIndex={-1}>แนบเอกสาร</h2>
            <UploadSlots key={draftId} draftId={draftId} slots={slots} files={files} onFilesChange={setFiles} onContinue={() => goTo(3)} disabled={busy || paid} />
            <div className={styles.actions}>
              <button className="button secondary" type="button" onClick={() => goTo(1)} disabled={busy}>ย้อนกลับ</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="panel" aria-labelledby="wizard-step-title">
            <h2 id="wizard-step-title" ref={heading} tabIndex={-1}>ชำระเงินด้วย QR พร้อมเพย์ (จำลอง)</h2>
            <div className={styles.feeRow}>
              <span>ยอดที่ต้องชำระ</span>
              <strong data-testid="payment-amount">{amount === null ? '–' : baht(amount)}</strong>
            </div>

            {!payment && !paid && (
              <div className={styles.actions}>
                <button className="button primary" type="button" data-testid="create-qr-btn" disabled={busy || !draftId} onClick={() => void createQr()}>
                  สร้าง QR
                </button>
              </div>
            )}

            {paymentStatus && (
              <div className={styles.qrBox}>
                {payment && paymentStatus === 'PENDING' && <SimulatedQr payment={payment} />}
                <dl className={styles.facts}>
                  {payment && <div><dt>เลขอ้างอิง</dt><dd className="mono" data-testid="qr-ref">{payment.ref}</dd></div>}
                  {payment && (
                    <div>
                      <dt>อายุ QR 15 นาที</dt>
                      <dd><time data-testid="qr-expires" data-iso={payment.qrExpiresAt} dateTime={payment.qrExpiresAt}>หมดอายุ {formatThaiDateTime(payment.qrExpiresAt)}</time></dd>
                    </div>
                  )}
                  <div>
                    <dt>สถานะการชำระ</dt>
                    <dd><span className={`status-pill ${styles['pay' + paymentStatus]}`} data-testid="payment-status" data-status={paymentStatus}>{PAYMENT_TEXT[paymentStatus]}</span></dd>
                  </div>
                </dl>
                {paymentStatus === 'EXPIRED' && (
                  <>
                    <p className={styles.alert} role="alert" data-testid="qr-expired-msg">{QR_EXPIRED_TEXT}</p>
                    <div className={styles.actions}>
                      <button className="button primary" type="button" data-testid="regenerate-qr-btn" disabled={busy} onClick={() => void createQr()}>
                        สร้าง QR ใหม่
                      </button>
                    </div>
                  </>
                )}
                {payment && (
                  <div className={styles.actions}>
                    <button className="button secondary" type="button" data-testid="refresh-payment-btn" disabled={busy} onClick={() => void refreshPayment()}>
                      ตรวจสอบการชำระเงิน
                    </button>
                  </div>
                )}
              </div>
            )}

            {receipt && (
              <div className={styles.receipt} aria-labelledby="receipt-title">
                <h3 id="receipt-title">ใบเสร็จรับเงิน</h3>
                <dl className={styles.facts}>
                  <div><dt>เลขคำขอ</dt><dd className="mono" data-testid="submitted-case-no">{receipt.caseNo}</dd></div>
                  <div><dt>เลขใบเสร็จ</dt><dd className="mono" data-testid="receipt-no">{receipt.receiptNo}</dd></div>
                  <div><dt>ยอดชำระ</dt><dd data-testid="receipt-amount">{baht(receipt.amount)}</dd></div>
                  <div>
                    <dt>ชำระเมื่อ</dt>
                    <dd><time data-testid="receipt-paid-at" data-iso={receipt.paidAt} dateTime={receipt.paidAt}>{receipt.paidAt ? formatThaiDateTime(receipt.paidAt) : '–'}</time></dd>
                  </div>
                </dl>
                <Link className="button primary" data-testid="go-case-btn" href={`/citizen/cases/${encodeURIComponent(receipt.caseNo)}`} prefetch={false}>
                  ดูคำขอ
                </Link>
              </div>
            )}

            {!paid && (
              <div className={styles.actions}>
                <button className="button secondary" type="button" onClick={() => goTo(2)} disabled={busy}>ย้อนกลับไปแนบเอกสาร</button>
              </div>
            )}
          </section>
        )}
      </div>

      <aside className={`panel ${styles.summary}`} aria-label="สรุปคำขอ">
        <CivicIllustration symbol={SERVICE_ART[service.id]} size={72} />
        <h2>สรุปคำขอ</h2>
        <dl className={styles.facts}>
          <div><dt>บริการ</dt><dd>{service.id} {service.name}</dd></div>
          <div><dt>ค่าธรรมเนียม</dt><dd>{fee === null ? '–' : baht(fee)}</dd></div>
          <div><dt>ร่าง</dt><dd className="mono">{draftId ?? 'ยังไม่บันทึก'}</dd></div>
          <div><dt>ไฟล์แนบ</dt><dd>{files.length} / 5 ไฟล์</dd></div>
        </dl>
        <p className={styles.muted}>ร่างยังไม่มีเลขคำขอ เลขคำขอ (EG) ออกให้หลังชำระเงินสำเร็จเท่านั้น</p>
        <Link className="button secondary" href="/citizen" prefetch={false}>กลับหน้ารายการคำขอ</Link>
      </aside>
    </div>
  );
}
