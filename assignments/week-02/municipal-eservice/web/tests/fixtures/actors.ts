/** Test-only plaintext from TEST-DATA.md §1. Never import this module into the application. */
export const CITIZEN_OTP = '123456';

export const ACTORS = {
  somchai: {
    kind: 'citizen', idNo: '1101700123456', name: 'สมชาย ใจดี',
    idFormatted: '1-1017-00123-45-6', idMasked: 'X-XXXX-XXXXX-45-6',
    mobile: '0812345678', registered: true, landing: '/citizen',
  },
  somying: {
    kind: 'citizen', idNo: '3100600987659', name: 'สมหญิง รักไทย',
    idFormatted: '3-1006-00987-65-9', idMasked: 'X-XXXX-XXXXX-65-9',
    mobile: '0823456789', registered: true, landing: '/citizen',
  },
  mana: {
    kind: 'citizen', idNo: '5500400111221', name: 'มานะ ตั้งใจ',
    idFormatted: '5-5004-00111-22-1', idMasked: 'X-XXXX-XXXXX-22-1',
    mobile: null, registered: false, landing: '/register',
  },
  piti: {
    kind: 'citizen', idNo: '1909900555015', name: 'ปิติ มีสุข',
    idFormatted: '1-9099-00555-01-5', idMasked: 'X-XXXX-XXXXX-01-5',
    mobile: '0834567890', registered: true, landing: '/citizen',
  },
  'off.reg1': {
    kind: 'staff', username: 'off.reg1', password: 'Test@1234', name: 'เจ้าหน้าที่ทะเบียน 1',
    role: 'officer', dept: 'registry', landing: '/officer/queue',
  },
  'off.reg2': {
    kind: 'staff', username: 'off.reg2', password: 'Test@1234', name: 'เจ้าหน้าที่ทะเบียน 2',
    role: 'officer', dept: 'registry', landing: '/officer/queue',
  },
  'off.works1': {
    kind: 'staff', username: 'off.works1', password: 'Test@1234', name: 'เจ้าหน้าที่โยธา 1',
    role: 'officer', dept: 'works', landing: '/officer/queue',
  },
  head1: {
    kind: 'staff', username: 'head1', password: 'Test@1234', name: 'หัวหน้าฝ่าย',
    role: 'head', dept: '', landing: '/head/approvals',
  },
  exec1: {
    kind: 'staff', username: 'exec1', password: 'Test@1234', name: 'ผู้บริหาร',
    role: 'executive', dept: '', landing: '/dashboard',
  },
  audit1: {
    kind: 'staff', username: 'audit1', password: 'Test@1234', name: 'ผู้ตรวจสอบภายใน',
    role: 'auditor', dept: '', landing: '/audit',
  },
  admin1: {
    kind: 'staff', username: 'admin1', password: 'Test@1234', name: 'ผู้ดูแลระบบ',
    role: 'admin', dept: '', landing: '/admin/services',
  },
} as const;

export type ActorName = keyof typeof ACTORS;
export type Actor = (typeof ACTORS)[ActorName];
