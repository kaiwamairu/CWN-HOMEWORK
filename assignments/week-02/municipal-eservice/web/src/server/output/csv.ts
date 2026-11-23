import type { AuditItem } from '../domain/audit.ts';

const COLUMNS = ['time', 'username', 'role', 'event', 'caseNo', 'fromStatus', 'toStatus', 'detail'] as const;

function csvField(value: string | null): string {
  const field = value ?? '';
  return /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

export function renderAuditCsv(items: readonly AuditItem[]): string {
  const rows = items.map(item => COLUMNS.map(column => csvField(item[column])).join(','));
  return [COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
