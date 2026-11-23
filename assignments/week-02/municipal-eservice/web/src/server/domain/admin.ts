import type Database from 'better-sqlite3';
import { immediate } from '../db/connection.ts';
import { HttpError } from '../http/errors.ts';
import { requireRole, type Principal } from '../security/policy.ts';
import { appendAudit } from './audit.ts';
import { readClock } from './clock.ts';
import type { ServiceFeeRates } from './fees.ts';
import { toBangkokDate } from './sla.ts';

type AdminContext = { db: Database.Database; testMode: boolean };

type ServiceRow = ServiceFeeRates & { sla_days: number };
export interface AdminService {
  id: ServiceFeeRates['id'];
  fee: number;
  feePerSqm: number;
  sla: number;
}

export interface AdminHoliday {
  date: string;
  name: string;
}

type Role = 'citizen' | 'officer' | 'head' | 'executive' | 'auditor' | 'admin';
type Department = 'registry' | 'works';

export interface AdminUser {
  username: string;
  name: string;
  role: Role;
  dept: Department | '';
}

type UserRow = Omit<AdminUser, 'dept'> & { dept: Department | null };
type UserTarget = UserRow & { userId: string; hasCitizenIdentity: number };

const ROLES: readonly Role[] = ['citizen', 'officer', 'head', 'executive', 'auditor', 'admin'];

function isRole(value: unknown): value is Role {
  return ROLES.some((role) => role === value);
}

function recordChange(ctx: AdminContext, actor: Principal, details: string[]): void {
  if (!details.length) return;
  appendAudit(ctx.db, {
    time: readClock(ctx.db, ctx.testMode),
    username: actor.username,
    role: actor.role,
    event: 'ADMIN_CHANGE',
    detail: details.join(' · '),
  });
}

function serviceItem(row: ServiceRow): AdminService {
  return {
    id: row.id,
    fee: row.id === 'SV-03' ? row.fee_base : row.fee,
    feePerSqm: row.fee_per_sqm,
    sla: row.sla_days,
  };
}

function settingInteger(value: unknown, min: number, max: number, code: 'INVALID_FEE' | 'INVALID_SLA'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(code);
  }
  return value;
}

export function listAdminServices(db: Database.Database, actor: Principal | null): AdminService[] {
  requireRole(actor, ['admin']);
  return db.prepare<[], ServiceRow>(`
    SELECT id, fee, fee_base, fee_per_sqm, sla_days FROM services ORDER BY id
  `).all().map(serviceItem);
}

export function updateAdminService(
  ctx: AdminContext,
  actor: Principal | null,
  id: string,
  body: Record<string, unknown>,
): AdminService {
  const admin = requireRole(actor, ['admin']);
  const { db } = ctx;
  return immediate(db, () => {
    const row = db.prepare<[string], ServiceRow>(`
      SELECT id, fee, fee_base, fee_per_sqm, sla_days FROM services WHERE id = ?
    `).get(id);
    if (!row) throw new HttpError('NOT_FOUND');

    const current = serviceItem(row);
    const feeKey = row.id === 'SV-03' ? 'feeBase' : 'fee';
    const fee = settingInteger(body[feeKey], 0, 100_000, 'INVALID_FEE');
    const feePerSqm = row.id === 'SV-03'
      ? settingInteger(body.feePerSqm, 0, 100_000, 'INVALID_FEE')
      : current.feePerSqm;
    const sla = settingInteger(body.sla, 1, 60, 'INVALID_SLA');
    const details: string[] = [];
    if (fee !== current.fee) details.push(`${id} ${feeKey} ${current.fee} → ${fee}`);
    if (feePerSqm !== current.feePerSqm) details.push(`${id} feePerSqm ${current.feePerSqm} → ${feePerSqm}`);
    if (sla !== current.sla) details.push(`${id} sla ${current.sla} → ${sla}`);

    if (details.length) {
      db.prepare('UPDATE services SET fee = ?, fee_base = ?, fee_per_sqm = ?, sla_days = ? WHERE id = ?')
        .run(row.id === 'SV-03' ? row.fee : fee, row.id === 'SV-03' ? fee : row.fee_base, feePerSqm, sla, id);
      recordChange(ctx, admin, details);
    }
    return { id: row.id, fee, feePerSqm, sla };
  });
}

function holidayDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) {
    throw new HttpError('INVALID_REQUEST', {}, 'กรุณาระบุวันที่วันหยุดในรูปแบบ YYYY-MM-DD (ค.ศ.)');
  }
  try {
    return toBangkokDate(`${value}T00:00:00+07:00`);
  } catch (error) {
    if (error instanceof RangeError) throw new HttpError('INVALID_REQUEST', {}, 'กรุณาระบุวันที่วันหยุดให้ถูกต้อง');
    throw error;
  }
}

export function listAdminHolidays(db: Database.Database, actor: Principal | null): AdminHoliday[] {
  requireRole(actor, ['admin']);
  return db.prepare<[], AdminHoliday>('SELECT date, name FROM holidays ORDER BY date').all();
}

export function addAdminHoliday(ctx: AdminContext, actor: Principal | null, body: Record<string, unknown>): AdminHoliday {
  const admin = requireRole(actor, ['admin']);
  const date = holidayDate(body.date);
  const { db } = ctx;
  return immediate(db, () => {
    if (db.prepare('SELECT 1 FROM holidays WHERE date = ?').get(date)) throw new HttpError('DUPLICATE_HOLIDAY');
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new HttpError('INVALID_REQUEST', {}, 'กรุณากรอกชื่อวันหยุด');

    db.prepare('INSERT INTO holidays(date, name) VALUES (?, ?)').run(date, name);
    recordChange(ctx, admin, [`holiday add ${date}`]);
    return { date, name };
  });
}

export function deleteAdminHoliday(ctx: AdminContext, actor: Principal | null, value: string): void {
  const admin = requireRole(actor, ['admin']);
  const date = holidayDate(value);
  const { db } = ctx;
  immediate(db, () => {
    const result = db.prepare('DELETE FROM holidays WHERE date = ?').run(date);
    if (!result.changes) throw new HttpError('NOT_FOUND');
    recordChange(ctx, admin, [`holiday delete ${date}`]);
  });
}

function userItem({ username, name, role, dept }: UserRow): AdminUser {
  return { username, name, role, dept: dept ?? '' };
}

export function listAdminUsers(db: Database.Database, actor: Principal | null): AdminUser[] {
  requireRole(actor, ['admin']);
  return db.prepare<[], UserRow>(`
    SELECT username, name, role, dept FROM users WHERE username IS NOT NULL ORDER BY username
  `).all().map(userItem);
}

export function updateAdminUser(
  ctx: AdminContext,
  actor: Principal | null,
  username: string,
  body: Record<string, unknown>,
): AdminUser {
  const admin = requireRole(actor, ['admin']);
  const { role, dept } = body;
  if (!isRole(role)) throw new HttpError('INVALID_REQUEST', {}, 'กรุณาเลือกบทบาทให้ถูกต้อง');
  if (dept !== '' && dept !== 'registry' && dept !== 'works') {
    throw new HttpError('INVALID_REQUEST', {}, 'กรุณาเลือกแผนกให้ถูกต้อง');
  }

  const { db } = ctx;
  return immediate(db, () => {
    const current = db.prepare<[string], UserTarget>(`
      SELECT id AS userId, username, name, role, dept, id_lookup IS NOT NULL AS hasCitizenIdentity
      FROM users WHERE username = ?
    `).get(username);
    if (!current) throw new HttpError('NOT_FOUND');
    const previousDept = current.dept ?? '';
    if (role === current.role && dept === previousDept) return userItem(current);
    if (current.userId === admin.userId) throw new HttpError('SELF_ROLE_CHANGE');
    if (role === 'officer' && !dept) throw new HttpError('INVALID_REQUEST', {}, 'กรุณาเลือกแผนกสำหรับเจ้าหน้าที่');
    if (role === 'citizen' && !current.hasCitizenIdentity) {
      throw new HttpError('INVALID_REQUEST', {}, 'บัญชีนี้ไม่มีข้อมูลยืนยันตัวตน ThaiD สำหรับบทบาทประชาชน');
    }

    const details: string[] = [];
    if (role !== current.role) details.push(`${username} role ${current.role} → ${role}`);
    if (dept !== previousDept) details.push(`${username} dept ${previousDept || '–'} → ${dept || '–'}`);
    db.prepare('UPDATE users SET role = ?, dept = ? WHERE id = ?').run(role, dept || null, current.userId);
    recordChange(ctx, admin, details);
    return { username, name: current.name, role, dept };
  });
}
