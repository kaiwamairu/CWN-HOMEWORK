'use client';

import { useRouter } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import styles from './Dashboard.module.css';

interface Selection {
  period: string;
  service: string;
}

interface Option {
  value: string;
  label: string;
}

interface Props {
  selection: Selection;
  periods: Option[];
  services: Option[];
}

export function DashboardFilters({ selection, periods, services }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, select] = useOptimistic(selection);
  const exportQuery = new URLSearchParams({ ...selection });

  function changeFilters(next: Selection) {
    startTransition(() => {
      select(next);
      router.replace(`/dashboard?${new URLSearchParams({ ...next })}`, { scroll: false });
    });
  }

  return (
    <div className={styles.controls}>
      <form action="/dashboard" method="get" className={styles.filters}>
        <label>
          ช่วงเวลา
          <select name="period" data-testid="period-select" value={selected.period}
            onChange={event => changeFilters({ ...selected, period: event.currentTarget.value })}>
            {periods.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          บริการ
          <select name="service" data-testid="service-select" value={selected.service}
            onChange={event => changeFilters({ ...selected, service: event.currentTarget.value })}>
            {services.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <noscript><button className="button primary" type="submit">ใช้ตัวกรอง</button></noscript>
      </form>
      <div className={styles.exports} inert={pending}>
        <a className="button secondary" href={`/api/dashboard/export?format=xlsx&${exportQuery}`} data-testid="export-xlsx-btn">ส่งออก Excel</a>
        <a className="button secondary" href={`/api/dashboard/export?format=pdf&${exportQuery}`} data-testid="export-pdf-btn">ส่งออก PDF</a>
      </div>
    </div>
  );
}
