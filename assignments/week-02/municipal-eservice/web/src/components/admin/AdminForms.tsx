'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS, SERVICE_NAMES } from '../../lib/roles';
import type { AdminHoliday, AdminService, AdminUser } from '../../server/domain/admin';

const fieldGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))',
  gap: '0 16px',
};

const selectStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '8px 12px',
  border: '1px solid var(--ds-color-border)',
  borderRadius: 'var(--ds-radius-control)',
  background: 'var(--ds-color-control)',
  color: 'var(--ds-color-ink)',
};

const feeLabels = {
  'SV-01': 'ค่าธรรมเนียมต่อฉบับ (บาท)',
  'SV-02': 'ค่าธรรมเนียมต่อคำขอ (บาท)',
  'SV-03': 'ค่าธรรมเนียมฐาน 1–100 ตร.ม. (บาท)',
};

type Feedback = { target: string; error: boolean; message: string };

function useAdminSave() {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function save(target: string, path: string, method: string, body?: object): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(path, {
        method,
        ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setFeedback({ target, error: true, message: data?.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่' });
        return false;
      }
      setFeedback({ target, error: false, message: 'บันทึกสำเร็จ' });
      return true;
    } catch {
      setFeedback({ target, error: true, message: 'เชื่อมต่อไม่ได้ กรุณาลองใหม่' });
      return false;
    } finally {
      setPending(false);
    }
  }

  return { feedback, pending, save };
}

function ActionFeedback({ feedback }: { feedback: Feedback | null }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {feedback && (
        <p
          data-testid={feedback.error ? 'action-error' : 'action-success'}
          className="field-error"
          style={{ color: feedback.error ? 'var(--ds-color-danger)' : 'var(--ds-color-success)' }}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}

function numberField(data: FormData, name: string): number | null {
  const value = data.get(name);
  return typeof value === 'string' && value !== '' ? Number(value) : null;
}

export function AdminServiceForms({ services }: { services: AdminService[] }) {
  const { feedback, pending, save } = useAdminSave();

  function submit(event: FormEvent<HTMLFormElement>, id: AdminService['id']) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fee = numberField(data, 'fee');
    const sla = numberField(data, 'sla');
    const body = id === 'SV-03' ? { feeBase: fee, feePerSqm: numberField(data, 'feePerSqm'), sla } : { fee, sla };
    void save(id, `/api/admin/services/${id}`, 'PUT', body);
  }

  return services.map(({ id, fee, feePerSqm, sla }) => (
    <section className="panel" key={id} aria-labelledby={`settings-${id}`} data-testid="service-row" data-service-id={id}>
      <div className="section-heading">
        <h2 id={`settings-${id}`}>{SERVICE_NAMES[id]}</h2>
        <span className="subtle-label">{id}</span>
      </div>
      <form noValidate onSubmit={(event) => submit(event, id)}>
        <div style={fieldGrid}>
          <label className="field">
            {feeLabels[id]}
            <input type="number" name="fee" min={0} max={100_000} step={1} defaultValue={fee} data-testid={`svc-fee-${id}`} required />
          </label>
          {id === 'SV-03' && (
            <label className="field">
              ส่วนเกิน 100 ตร.ม. (บาทต่อ ตร.ม.)
              <input type="number" name="feePerSqm" min={0} max={100_000} step={1} defaultValue={feePerSqm} data-testid={`svc-fee-per-sqm-${id}`} required />
            </label>
          )}
          <label className="field">
            SLA (วันทำการ)
            <input type="number" name="sla" min={1} max={60} step={1} defaultValue={sla} data-testid={`svc-sla-${id}`} required />
          </label>
        </div>
        <button type="submit" className="button primary" data-testid={`svc-save-${id}`} disabled={pending} style={{ marginTop: 16 }}>
          บันทึก
        </button>
        <ActionFeedback feedback={feedback?.target === id ? feedback : null} />
      </form>
    </section>
  ));
}

export function AdminHolidayForms({ holidays }: { holidays: AdminHoliday[] }) {
  const router = useRouter();
  const { feedback, pending, save } = useAdminSave();

  async function addHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const { date, name } = Object.fromEntries(new FormData(form));
    if (await save('add', '/api/admin/holidays', 'POST', { date, name })) {
      form.reset();
      router.refresh();
    }
  }

  async function deleteHoliday(date: string) {
    if (await save('delete', `/api/admin/holidays/${date}`, 'DELETE')) router.refresh();
  }

  return (
    <>
      <section className="panel" aria-labelledby="holiday-add-heading">
        <div className="section-heading"><h2 id="holiday-add-heading">เพิ่มวันหยุด</h2></div>
        <form onSubmit={addHoliday}>
          <div style={fieldGrid}>
            <label className="field">
              วันที่ (ค.ศ.)
              <input type="date" name="date" data-testid="holiday-date-input" required />
            </label>
            <label className="field">
              ชื่อวันหยุด
              <input type="text" name="name" data-testid="holiday-name-input" required />
            </label>
          </div>
          <button type="submit" className="button primary" data-testid="holiday-add-btn" disabled={pending} style={{ marginTop: 16 }}>
            เพิ่มวันหยุด
          </button>
          <ActionFeedback feedback={feedback?.target === 'add' ? feedback : null} />
        </form>
      </section>
      <section className="panel" aria-labelledby="holiday-list-heading">
        <div className="section-heading"><h2 id="holiday-list-heading">วันหยุดที่ตั้งค่า</h2></div>
        {holidays.length ? (
          <div className="table-region" role="region" aria-labelledby="holiday-list-heading" tabIndex={0}>
            <table aria-labelledby="holiday-list-heading">
              <thead><tr><th scope="col">วันที่ (ค.ศ.)</th><th scope="col">ชื่อวันหยุด</th><th scope="col">จัดการ</th></tr></thead>
              <tbody>
                {holidays.map(({ date, name }) => (
                  <tr key={date} data-testid="holiday-row" data-date={date}>
                    <th scope="row"><time dateTime={date}>{date}</time></th>
                    <td>{name}</td>
                    <td>
                      <button
                        type="button"
                        className="button secondary"
                        data-testid="holiday-delete-btn"
                        data-date={date}
                        aria-label={`ลบวันหยุด ${date}`}
                        disabled={pending}
                        onClick={() => void deleteHoliday(date)}
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p>ยังไม่มีวันหยุด</p>}
        <ActionFeedback feedback={feedback?.target === 'delete' ? feedback : null} />
      </section>
    </>
  );
}

export function AdminUserForms({ users, currentUsername }: { users: AdminUser[]; currentUsername: string }) {
  const { feedback, pending, save } = useAdminSave();

  function submit(event: FormEvent<HTMLFormElement>, username: string) {
    event.preventDefault();
    const { role, dept } = Object.fromEntries(new FormData(event.currentTarget));
    void save(username, `/api/admin/users/${encodeURIComponent(username)}`, 'PUT', { role, dept });
  }

  return (
    <section className="panel" aria-label="ตั้งค่าบทบาทและแผนก">
      <p id="role-effective">การเปลี่ยนบทบาทและแผนกมีผลเมื่อล็อกอินครั้งถัดไป</p>
      <div className="table-region" role="region" aria-label="ตารางผู้ใช้และบทบาท" tabIndex={0}>
        <table aria-label="ผู้ใช้และบทบาท" aria-describedby="role-effective">
          <thead><tr><th scope="col">ผู้ใช้</th><th scope="col">บทบาท</th><th scope="col">แผนก</th><th scope="col">จัดการ</th></tr></thead>
          <tbody>
            {users.map(({ username, name, role, dept }, index) => {
              const isSelf = username === currentUsername;
              const formId = `admin-user-${index}`;
              return (
                <tr key={username} data-testid="user-row" data-username={username}>
                  <th scope="row">
                    {name}
                    <small style={{ display: 'block', fontWeight: 400 }}>{username}{isSelf && ' · บัญชีปัจจุบัน'}</small>
                  </th>
                  <td>
                    <select form={formId} name="role" aria-label={`บทบาทของ ${username}`} data-testid="user-role-select" defaultValue={role} disabled={isSelf} style={selectStyle}>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </td>
                  <td>
                    <select form={formId} name="dept" aria-label={`แผนกของ ${username}`} data-testid="user-dept-select" defaultValue={dept} disabled={isSelf} style={selectStyle}>
                      <option value="">–</option>
                      <option value="registry">ฝ่ายทะเบียน</option>
                      <option value="works">ฝ่ายโยธา</option>
                    </select>
                  </td>
                  <td>
                    <form id={formId} onSubmit={(event) => submit(event, username)}>
                      <button type="submit" className="button primary" data-testid="user-save-btn" disabled={pending || isSelf}>บันทึก</button>
                      <ActionFeedback feedback={feedback?.target === username ? feedback : null} />
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
