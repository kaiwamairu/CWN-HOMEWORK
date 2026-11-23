import ExcelJS from 'exceljs';
import { DASHBOARD_KPI_FIELDS, formatDashboardKpis, type DashboardKpis } from '../domain/dashboard.ts';

export async function renderDashboardXlsx(kpis: DashboardKpis): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ภาพรวมบริการ');
  const values = formatDashboardKpis(kpis);

  sheet.addRow(['ตัวชี้วัด', 'ค่า']).font = { bold: true };
  for (const { key, label } of DASHBOARD_KPI_FIELDS) {
    sheet.addRow([label, values[key]]);
  }
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 14;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
