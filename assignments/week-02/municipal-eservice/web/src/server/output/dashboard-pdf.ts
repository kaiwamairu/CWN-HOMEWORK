import { formatDashboardPdfLine, type DashboardKpis } from '../domain/dashboard.ts';
import { simplePdf } from './pdf.ts';

export function renderDashboardPdf(kpis: DashboardKpis): Buffer {
  return simplePdf(formatDashboardPdfLine(kpis));
}
