/** Pure calendar rules from DECISIONS §0, §8, §10 and §18. */
const DAY_MS = 24 * 60 * 60 * 1000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const CUTOFF = '16:30:00';
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET_INSTANT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export type SlaLevel = 'normal' | 'near' | 'overdue' | 'paused' | 'closed';

function dateMillis(date: string): number {
  if (!LOCAL_DATE.test(date)) {
    throw new RangeError('Expected a Bangkok calendar date in YYYY-MM-DD format');
  }
  const millis = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 10) !== date) {
    throw new RangeError('Invalid calendar date');
  }
  return millis;
}

function instantMillis(value: string | Date | number): number {
  if (typeof value === 'string') {
    const match = OFFSET_INSTANT.exec(value);
    if (!match) {
      throw new RangeError('Expected an ISO instant with an explicit timezone offset');
    }
    dateMillis(match[1]!);
    if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) {
      throw new RangeError('Invalid instant time');
    }
  }
  const millis = typeof value === 'number'
    ? new Date(value).getTime()
    : value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new RangeError('Invalid instant');
  }
  return millis;
}

function dateFromMillis(millis: number): string {
  return new Date(millis).toISOString().slice(0, 10);
}

/** Convert an explicit-offset instant to its Bangkok calendar date. */
export function toBangkokDate(iso: string): string {
  return dateFromMillis(instantMillis(iso) + BANGKOK_OFFSET_MS);
}

/** Canonical +07:00 ISO, retaining nonzero milliseconds and never reading now. */
export function toBangkokIso(value: string | Date | number): string {
  return new Date(instantMillis(value) + BANGKOK_OFFSET_MS)
    .toISOString()
    .replace(/\.000Z$/, '+07:00')
    .replace(/Z$/, '+07:00');
}

/** All weekday operations use UTC on synthetic local dates, never the host zone. */
export function isBusinessDay(date: string, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(dateMillis(date)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(date);
}

/** Add business dates strictly after date. Zero leaves even a nonbusiness date unchanged. */
export function addBusinessDays(date: string, count: number, holidays: ReadonlySet<string>): string {
  let cursor = dateMillis(date);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Business day count must be a nonnegative integer');
  }
  let remaining = count;
  while (remaining > 0) {
    cursor += DAY_MS;
    if (isBusinessDay(dateFromMillis(cursor), holidays)) remaining -= 1;
  }
  return dateFromMillis(cursor);
}

/** Count business dates in (returnDate, resubmitDate], excluding the return date. */
export function countBusinessDates(
  returnDate: string,
  resubmitDate: string,
  holidays: ReadonlySet<string>,
): number {
  let cursor = dateMillis(returnDate);
  const end = dateMillis(resubmitDate);
  if (end < cursor) {
    throw new RangeError('End date must not precede the start date');
  }
  let count = 0;
  while (cursor < end) {
    cursor += DAY_MS;
    if (isBusinessDay(dateFromMillis(cursor), holidays)) count += 1;
  }
  return count;
}

/** Compute once at payment: D0 then N later business dates at 16:30 Bangkok. */
export function calculateDueAt(paidAt: string, slaDays: number, holidays: ReadonlySet<string>): string {
  if (!Number.isInteger(slaDays) || slaDays < 1 || slaDays > 60) {
    throw new RangeError('SLA must be an integer from 1 to 60 business days');
  }
  const payment = toBangkokIso(paidAt);
  let startDate = payment.slice(0, 10);
  if (!isBusinessDay(startDate, holidays) || payment.slice(11, 19) >= CUTOFF) {
    startDate = addBusinessDays(startDate, 1, holidays);
  }
  return `${addBusinessDays(startDate, slaDays, holidays)}T${CUTOFF}+07:00`;
}

/** Extend the stored due date using only the calendar provided at resubmission. */
export function extendDueAt(
  dueAt: string,
  returnedAt: string,
  resubmittedAt: string,
  holidays: ReadonlySet<string>,
): string {
  const pausedDays = countBusinessDates(toBangkokDate(returnedAt), toBangkokDate(resubmittedAt), holidays);
  const extendedDate = addBusinessDays(toBangkokDate(dueAt), pausedDays, holidays);
  return `${extendedDate}T${CUTOFF}+07:00`;
}

export function slaLevel(
  now: string,
  dueAt: string,
  status: string,
  holidays: ReadonlySet<string>,
): SlaLevel {
  if (status === 'COMPLETED' || status === 'REJECTED' || status === 'CANCELLED') return 'closed';
  if (status === 'NEED_FIX') return 'paused';
  if (instantMillis(now) > instantMillis(dueAt)) return 'overdue';
  const remaining = countBusinessDates(toBangkokDate(now), toBangkokDate(dueAt), holidays);
  return remaining >= 2 ? 'normal' : 'near';
}

/** Inclusive valid-until date; expiry happens at the following Bangkok midnight. */
export function documentValidUntil(issueAt: string, serviceId: string): string {
  const issueDate = toBangkokDate(issueAt);
  const issueMillis = dateMillis(issueDate);
  if (serviceId === 'SV-01') return dateFromMillis(issueMillis + 89 * DAY_MS);
  if (serviceId !== 'SV-02' && serviceId !== 'SV-03') {
    throw new RangeError('Unknown service');
  }

  const issue = new Date(issueMillis);
  const anniversaryYear = issue.getUTCFullYear() + 1;
  const leapYear = anniversaryYear % 4 === 0 && (anniversaryYear % 100 !== 0 || anniversaryYear % 400 === 0);
  const anniversaryDay = issue.getUTCMonth() === 1 && issue.getUTCDate() === 29 && !leapYear
    ? 28 : issue.getUTCDate();
  const anniversary = `${String(anniversaryYear).padStart(4, '0')}-${issueDate.slice(5, 7)}-${String(anniversaryDay).padStart(2, '0')}`;
  return dateFromMillis(dateMillis(anniversary) - DAY_MS);
}
