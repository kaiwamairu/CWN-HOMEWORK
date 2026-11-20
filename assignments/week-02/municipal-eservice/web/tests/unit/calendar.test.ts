import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addBusinessDays,
  calculateDueAt,
  countBusinessDates,
  documentValidUntil,
  extendDueAt,
  isBusinessDay,
  slaLevel,
  toBangkokDate,
  toBangkokIso,
} from '../../src/server/domain/calendar.ts';

const holidays = new Set(['2026-12-07', '2026-12-10', '2026-12-31', '2027-01-01']);

describe('explicit Bangkok instants and dates', () => {
  it('converts UTC to Bangkok and crosses the local year boundary at 17:00Z', () => {
    assert.equal(toBangkokDate('2026-12-31T16:59:59Z'), '2026-12-31');
    assert.equal(toBangkokDate('2026-12-31T17:00:00Z'), '2027-01-01');
  });

  it('normalizes an instant carrying another explicit offset', () => {
    assert.equal(toBangkokDate('2027-01-01T01:00:00+09:00'), '2026-12-31');
    assert.equal(toBangkokIso('2026-12-01T02:00:00Z'), '2026-12-01T09:00:00+07:00');
  });

  it('formats Date and numeric values without reading the system clock', () => {
    const instant = new Date('2026-12-01T02:00:00Z');
    assert.equal(toBangkokIso(instant), '2026-12-01T09:00:00+07:00');
    assert.equal(toBangkokIso(instant.getTime()), '2026-12-01T09:00:00+07:00');
    assert.equal(instant.toISOString(), '2026-12-01T02:00:00.000Z');
  });

  it('preserves millisecond precision when present', () => {
    assert.equal(toBangkokIso('2026-12-01T02:00:00.123Z'), '2026-12-01T09:00:00.123+07:00');
  });

  it('rejects host-local, date-only and invalid instants', () => {
    for (const invalid of ['2026-12-01T09:00:00', '2026-12-01 09:00', '2026-12-01', 'not-a-date']) {
      assert.throws(() => toBangkokIso(invalid), RangeError);
      assert.throws(() => toBangkokDate(invalid), RangeError);
    }
    assert.throws(() => toBangkokIso(new Date(Number.NaN)), RangeError);
    assert.throws(() => toBangkokIso(Number.NaN), RangeError);
  });
});

describe('business dates', () => {
  it('excludes Saturday, Sunday and configured holidays only', () => {
    assert.equal(isBusinessDay('2026-12-04', holidays), true);
    assert.equal(isBusinessDay('2026-12-05', holidays), false);
    assert.equal(isBusinessDay('2026-12-06', holidays), false);
    assert.equal(isBusinessDay('2026-12-07', holidays), false);
    assert.equal(isBusinessDay('2026-12-08', holidays), true);
    assert.equal(isBusinessDay('2026-12-07', new Set()), true);
  });

  it('adds business days after the starting date across weekends and holidays', () => {
    assert.equal(addBusinessDays('2026-12-04', 1, holidays), '2026-12-08');
    assert.equal(addBusinessDays('2026-12-05', 1, holidays), '2026-12-08');
    assert.equal(addBusinessDays('2026-12-29', 3, holidays), '2027-01-05');
  });

  it('keeps the original date when adding zero, even on a holiday', () => {
    assert.equal(addBusinessDays('2026-12-07', 0, holidays), '2026-12-07');
  });

  it('counts an open return boundary and a closed resubmit boundary', () => {
    assert.equal(countBusinessDates('2026-12-02', '2026-12-02', holidays), 0);
    assert.equal(countBusinessDates('2026-12-02', '2026-12-03', holidays), 1);
    assert.equal(countBusinessDates('2026-12-04', '2026-12-08', holidays), 1);
    assert.equal(countBusinessDates('2026-11-27', '2026-12-01', holidays), 2);
    assert.equal(countBusinessDates('2026-12-04', '2026-12-07', holidays), 0);
  });

  it('does not count a holiday twice when it is also a weekend', () => {
    const withSaturday = new Set([...holidays, '2026-12-05']);
    assert.equal(countBusinessDates('2026-12-04', '2026-12-08', withSaturday), 1);
    assert.equal(addBusinessDays('2026-12-04', 1, withSaturday), '2026-12-08');
  });

  it('rejects impossible calendar dates and unsupported day counts', () => {
    assert.throws(() => isBusinessDay('2026-02-29', holidays), RangeError);
    assert.throws(() => isBusinessDay('2026-13-01', holidays), RangeError);
    assert.throws(() => isBusinessDay('2026-12-01T00:00:00Z', holidays), RangeError);
    assert.throws(() => addBusinessDays('2026-12-01', -1, holidays), RangeError);
    assert.throws(() => addBusinessDays('2026-12-01', 1.5, holidays), RangeError);
    assert.throws(() => countBusinessDates('2026-12-03', '2026-12-02', holidays), RangeError);
  });
});

describe('initial SLA due dates (TC-SLA-01)', () => {
  const scenarios = [
    ['a: payment before cutoff', '2026-12-01T09:00:00+07:00', 3, '2026-12-04T16:30:00+07:00'],
    ['b: minute before cutoff', '2026-12-01T16:29:00+07:00', 3, '2026-12-04T16:30:00+07:00'],
    ['last millisecond before cutoff', '2026-12-01T16:29:59.999+07:00', 3, '2026-12-04T16:30:00+07:00'],
    ['c: exactly at cutoff', '2026-12-01T16:30:00+07:00', 3, '2026-12-08T16:30:00+07:00'],
    ['d: Friday before a holiday', '2026-12-04T10:00:00+07:00', 3, '2026-12-11T16:30:00+07:00'],
    ['e: Saturday', '2026-12-05T10:00:00+07:00', 3, '2026-12-14T16:30:00+07:00'],
    ['holiday payment', '2026-12-07T09:00:00+07:00', 3, '2026-12-14T16:30:00+07:00'],
    ['f: SV-02 ten-day SLA', '2026-12-01T09:00:00+07:00', 10, '2026-12-17T16:30:00+07:00'],
    ['g: SV-03 fifteen-day SLA', '2026-12-01T09:00:00+07:00', 15, '2026-12-24T16:30:00+07:00'],
    ['h: due date in next year', '2026-12-29T10:00:00+07:00', 3, '2027-01-05T16:30:00+07:00'],
    ['i: year-end holiday payment', '2026-12-31T23:59:00+07:00', 3, '2027-01-07T16:30:00+07:00'],
    ['UTC offset cutoff equivalent', '2026-12-01T09:30:00Z', 3, '2026-12-08T16:30:00+07:00'],
  ] as const;

  for (const [name, paidAt, slaDays, expected] of scenarios) {
    it(name, () => {
      assert.equal(calculateDueAt(paidAt, slaDays, holidays), expected);
    });
  }

  it('honors the provided holiday calendar without retaining mutable global state', () => {
    const changed = new Set([...holidays, '2026-12-04']);
    assert.equal(calculateDueAt('2026-12-01T09:00:00+07:00', 3, changed), '2026-12-08T16:30:00+07:00');
    assert.equal(calculateDueAt('2026-12-01T09:00:00+07:00', 3, holidays), '2026-12-04T16:30:00+07:00');
  });

  it('rejects SLA outside its integer 1–60 domain', () => {
    for (const invalid of [0, -1, 1.5, 61, Number.NaN]) {
      assert.throws(() => calculateDueAt('2026-12-01T09:00:00+07:00', invalid, holidays), RangeError);
    }
  });
});

describe('paused SLA extension (TC-SLA-02)', () => {
  const scenarios = [
    ['one business day', '2026-12-04', '2026-12-02T11:00:00+07:00', '2026-12-03T10:00:00+07:00', '2026-12-08'],
    ['seed resubmit on Dec 1', '2026-11-27', '2026-11-27T11:00:00+07:00', '2026-12-01T09:00:00+07:00', '2026-12-01'],
    ['seed resubmit on Dec 4', '2026-11-27', '2026-11-27T11:00:00+07:00', '2026-12-04T10:00:00+07:00', '2026-12-04'],
    ['same-date resubmit', '2026-12-04', '2026-12-02T09:00:00+07:00', '2026-12-02T15:00:00+07:00', '2026-12-04'],
    ['resubmit after cutoff across weekend and holiday', '2026-12-04', '2026-12-04T10:00:00+07:00', '2026-12-08T17:00:00+07:00', '2026-12-08'],
  ] as const;

  for (const [name, dueDate, returnedAt, resubmittedAt, expectedDate] of scenarios) {
    it(name, () => {
      assert.equal(extendDueAt(`${dueDate}T16:30:00+07:00`, returnedAt, resubmittedAt, holidays), `${expectedDate}T16:30:00+07:00`);
    });
  }

  it('uses Bangkok dates when return and resubmit have different explicit offsets', () => {
    assert.equal(extendDueAt('2026-12-04T09:30:00Z', '2026-12-02T16:00:00Z', '2026-12-02T17:00:00Z', holidays), '2026-12-08T16:30:00+07:00');
  });

  it('uses holidays at resubmission while extending the stored original due date', () => {
    const currentHolidays = new Set([...holidays, '2026-12-08']);
    const storedDueAt = '2026-12-04T16:30:00+07:00';
    assert.equal(extendDueAt(storedDueAt, '2026-12-02T11:00:00+07:00', '2026-12-03T10:00:00+07:00', currentHolidays), '2026-12-09T16:30:00+07:00');
    assert.equal(storedDueAt, '2026-12-04T16:30:00+07:00');
  });
});

describe('SLA levels (TC-SLA-03)', () => {
  const dueAt = '2026-12-04T16:30:00+07:00';
  const scenarios = [
    ['2026-12-01T09:00:00+07:00', 'normal'],
    ['2026-12-02T09:00:00+07:00', 'normal'],
    ['2026-12-03T09:00:00+07:00', 'near'],
    ['2026-12-04T16:30:00+07:00', 'near'],
    ['2026-12-04T16:30:00.001+07:00', 'overdue'],
    ['2026-12-04T16:30:01+07:00', 'overdue'],
    ['2026-12-04T16:31:00+07:00', 'overdue'],
    ['2026-12-05T10:00:00+07:00', 'overdue'],
  ] as const;

  for (const [now, expected] of scenarios) {
    it(`classifies ${now} as ${expected}`, () => {
      assert.equal(slaLevel(now, dueAt, 'IN_REVIEW', holidays), expected);
    });
  }

  it('counts remaining business dates across weekends and the Dec 7 holiday', () => {
    const holidayDueAt = '2026-12-08T16:30:00+07:00';
    assert.equal(slaLevel('2026-12-03T09:00:00+07:00', holidayDueAt, 'SUBMITTED', holidays), 'normal');
    assert.equal(slaLevel('2026-12-04T09:00:00+07:00', holidayDueAt, 'SUBMITTED', holidays), 'near');
    assert.equal(slaLevel('2026-12-07T09:00:00+07:00', holidayDueAt, 'SUBMITTED', holidays), 'near');
    assert.equal(slaLevel('2026-12-08T16:30:00+07:00', holidayDueAt, 'SUBMITTED', holidays), 'near');
  });

  it('compares exact instants rather than their source offset or date strings', () => {
    assert.equal(slaLevel('2026-12-04T09:30:00Z', dueAt, 'APPROVED', holidays), 'near');
    assert.equal(slaLevel('2026-12-04T09:30:01Z', dueAt, 'APPROVED', holidays), 'overdue');
  });

  it('pauses NEED_FIX even when the stored due date has passed', () => {
    assert.equal(slaLevel('2026-12-08T17:00:00+07:00', dueAt, 'NEED_FIX', holidays), 'paused');
  });

  for (const status of ['COMPLETED', 'REJECTED', 'CANCELLED']) {
    it(`closes ${status} even when the stored due date has passed`, () => {
      assert.equal(slaLevel('2026-12-08T17:00:00+07:00', dueAt, status, holidays), 'closed');
    });
  }
});

describe('inclusive document expiration dates (TC-DOC-03)', () => {
  it('makes SV-01 valid through issue date plus 89 calendar days', () => {
    assert.equal(documentValidUntil('2026-12-01T09:00:00+07:00', 'SV-01'), '2027-02-28');
    assert.equal(documentValidUntil('2026-11-05T09:00:00+07:00', 'SV-01'), '2027-02-02');
    assert.equal(documentValidUntil('2028-02-29T10:00:00+07:00', 'SV-01'), '2028-05-28');
  });

  for (const serviceId of ['SV-02', 'SV-03']) {
    it(`makes ${serviceId} valid through the day before its next anniversary`, () => {
      assert.equal(documentValidUntil('2026-12-01T09:00:00+07:00', serviceId), '2027-11-30');
      assert.equal(documentValidUntil('2027-02-28T09:00:00+07:00', serviceId), '2028-02-27');
    });

    it(`clamps a Feb 29 ${serviceId} anniversary before subtracting a day`, () => {
      assert.equal(documentValidUntil('2028-02-29T10:00:00+07:00', serviceId), '2029-02-27');
    });
  }

  it('derives the issue date in Bangkok at the local midnight boundary', () => {
    assert.equal(documentValidUntil('2026-11-30T17:00:00Z', 'SV-01'), '2027-02-28');
  });

  it('rejects unrecognized services rather than assigning an accidental validity', () => {
    assert.throws(() => documentValidUntil('2026-12-01T09:00:00+07:00', 'SV-99'), RangeError);
  });
});
