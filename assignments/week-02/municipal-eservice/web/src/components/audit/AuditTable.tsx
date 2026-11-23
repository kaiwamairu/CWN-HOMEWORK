import { formatThai } from '../../lib/roles';
import type { AuditItem } from '../../server/domain/audit';

export function AuditTable({ items }: { items: readonly AuditItem[] }) {
  if (!items.length) return <p className="notice">ไม่พบรายการ</p>;

  return (
    <div className="table-region" role="region" aria-label="ตารางประวัติการดำเนินงาน" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">เวลา</th>
            <th scope="col">ผู้ทำรายการ</th>
            <th scope="col">บทบาท</th>
            <th scope="col">เหตุการณ์</th>
            <th scope="col">เลขคำขอ</th>
            <th scope="col">การเปลี่ยนสถานะ</th>
            <th scope="col">รายละเอียด</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} data-testid="audit-row" data-id={item.id} data-event={item.event}
              data-actor={item.username} data-case-no={item.caseNo ?? ''}>
              <td><time data-testid="audit-time" data-iso={item.time} dateTime={item.time}>{formatThai(item.time)}</time></td>
              <td data-testid="audit-actor">{item.username}</td>
              <td data-testid="audit-role">{item.role}</td>
              <td data-testid="audit-event">{item.event}</td>
              <td data-testid="audit-case-no">{item.caseNo ?? '–'}</td>
              <td data-testid="audit-transition">
                {item.fromStatus && item.toStatus ? `${item.fromStatus} → ${item.toStatus}` : '–'}
              </td>
              <td data-testid="audit-detail" style={{ minWidth: '10rem', maxWidth: '28rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {item.detail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
