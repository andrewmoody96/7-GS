import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  endOfLocalDay,
  isLocalDate,
  isValidTimeZone,
  localDateOf,
  monthKey,
  nextMondayOnOrAfter,
  startOfLocalDay,
  startOfWeek,
  weekday,
  zonedTimeToInstant,
} from '../src';

describe('local dates', () => {
  it('validates real calendar dates only', () => {
    expect(isLocalDate('2026-10-05')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('10/05/2026')).toBe(false);
  });

  it('adds and diffs days across month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2027-01-02', '2026-12-30')).toBe(3);
  });

  it('uses ISO weekdays with Monday = 1', () => {
    expect(weekday('2026-10-05')).toBe(1);
    expect(weekday('2026-10-11')).toBe(7);
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
  });

  it('finds the first Monday on or after a date', () => {
    expect(nextMondayOnOrAfter('2026-10-05')).toBe('2026-10-05');
    expect(nextMondayOnOrAfter('2026-10-02')).toBe('2026-10-05');
    expect(nextMondayOnOrAfter('2026-10-04')).toBe('2026-10-05');
  });

  it('keys months', () => {
    expect(monthKey('2026-10-31')).toBe('2026-10');
  });
});

describe('time zones', () => {
  it('rejects unknown zones', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });

  it('reads the local date of an instant', () => {
    const instant = new Date('2026-10-05T03:30:00Z');
    expect(localDateOf(instant, 'America/Chicago')).toBe('2026-10-04');
    expect(localDateOf(instant, 'Asia/Tokyo')).toBe('2026-10-05');
  });

  it('converts local wall times to instants, including half-hour and odd offsets', () => {
    expect(zonedTimeToInstant('2026-10-05', '00:00', 'America/Chicago').toISOString()).toBe(
      '2026-10-05T05:00:00.000Z',
    );
    expect(zonedTimeToInstant('2026-10-05', '12:00', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-05T06:30:00.000Z',
    );
    expect(zonedTimeToInstant('2026-10-05', '00:00', 'Pacific/Chatham').toISOString()).toBe(
      '2026-10-04T10:15:00.000Z',
    );
  });

  it('handles DST transitions', () => {
    // US spring forward 2026-03-08: 02:30 does not exist, so we get 03:00 EDT.
    expect(zonedTimeToInstant('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    );
    // The local day is 23 hours long.
    const start = startOfLocalDay('2026-03-08', 'America/New_York').getTime();
    const end = endOfLocalDay('2026-03-08', 'America/New_York').getTime();
    expect((end - start) / 3_600_000).toBe(23);
  });

  it('finds the start of a day whose midnight is skipped', () => {
    // Chile springs forward at local midnight: 2026-09-06 starts at 01:00 (-03).
    const start = startOfLocalDay('2026-09-06', 'America/Santiago');
    expect(localDateOf(start, 'America/Santiago')).toBe('2026-09-06');
    expect(localDateOf(new Date(start.getTime() - 1000), 'America/Santiago')).toBe('2026-09-05');
  });
});
